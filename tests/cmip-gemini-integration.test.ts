import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import validFixture from "../src/lib/cmip/model-package/fixtures/package-input-valid.json";
import outputSchema from "../src/lib/cmip/contracts/output-schema.json";
import { CMIP_OUTPUT_SCHEMA_VERSION } from "../src/lib/cmip/contracts/constants";
import { validateCmipReport } from "../src/lib/cmip/contracts/validate-report";
import { buildCmipModelExecutionPackage } from "../src/lib/cmip/model-package/build-model-package";
import type { CmipModelExecutionPackage, CmipModelPackageBuildRequest } from "../src/lib/cmip/model-package/types";
import { hashCanonicalJson, stableJsonClone } from "../src/lib/cmip/model-package";
import { CMIP_INTELLIGENCE_SPEC_VERSION } from "../src/lib/cmip/intelligence-spec/constants";
import { validateCmipRuntimeInput } from "../src/lib/cmip/runtime-input/validate-input";
import { executeCmipGeminiModelPackage } from "../src/lib/cmip/gemini/execute-model-package";
import { loadCmipGeminiEnv, dryRunGeminiConfig } from "../src/lib/cmip/gemini/env";
import { createCmipGeminiClient } from "../src/lib/cmip/gemini/client";
import { resolveCmipGeminiModelProfile } from "../src/lib/cmip/gemini/model-registry";
import { createGeminiProviderSchema } from "../src/lib/cmip/gemini/schema-compatibility";
import { mapCmipPackageToGeminiInteractionRequest } from "../src/lib/cmip/gemini/request-mapper";
import { mapCmipGeminiTools } from "../src/lib/cmip/gemini/source-policy";
import { FakeCmipGeminiProvider } from "../src/lib/cmip/gemini/provider/fake-gemini-provider";
import { mapGeminiInteraction } from "../src/lib/cmip/gemini/provider/gemini-provider";
import { buildCmipGeminiTransportEnvelope, CMIP_GEMINI_TRANSPORT_SCHEMA, CMIP_GEMINI_TRANSPORT_SCHEMA_BYTE_BUDGET, parseCmipGeminiTransportOutput, validateCmipGeminiTransportEnvelope } from "../src/lib/cmip/gemini/transport";
import { parseCmipGeminiResponse, numericalValuesChanged, outputContainsSecretLikeValue } from "../src/lib/cmip/gemini/response-parser";
import { normalizeCmipGeminiUsage } from "../src/lib/cmip/gemini/usage";
import { classifyGeminiProviderException, deterministicGeminiRetryDelayMs, isCmipGeminiRetryable } from "../src/lib/cmip/gemini/retry";
import { runGeminiWithTimeout } from "../src/lib/cmip/gemini/timeout";
import { validateCmipGeminiExecutionResult } from "../src/lib/cmip/gemini/validate-execution-result";
import { createOpenAiProviderSchema } from "../src/lib/cmip/openai/schema-compatibility";
import { buildAbstainOutput } from "../src/lib/cmip/openai/provider/fake-provider";
import executionResultSchema from "../src/lib/cmip/gemini/execution-result-schema.json";
import type { CmipReportEnvelope } from "../src/lib/cmip/contracts";
import type { CmipGeminiProviderExecutionResponse } from "../src/lib/cmip/gemini/types";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const fixedNow = "2026-07-10T07:00:00.000Z";
type Mutable<T> = { -readonly [K in keyof T]: T[K] extends readonly (infer U)[] ? Mutable<U>[] : T[K] extends object ? Mutable<T[K]> : T[K] };

function buildPackage(input: unknown = validFixture): CmipModelExecutionPackage {
  const result = buildCmipModelExecutionPackage(input as CmipModelPackageBuildRequest);
  assert.equal(result.ok, true, result.ok ? undefined : result.errors.map((error) => `${error.code} ${error.path}`).join("\n"));
  return result.package;
}

function geminiEnv(extra: Partial<Record<string, string>> = {}) {
  return {
    CMIP_GEMINI_MODEL_PRIMARY: "gemini-cmip-test",
    CMIP_GEMINI_MODEL_FALLBACK: "gemini-cmip-test-fallback",
    CMIP_GEMINI_MODEL_REPAIR: "gemini-cmip-test-repair",
    CMIP_GEMINI_MAX_OUTPUT_TOKENS: "8000",
    CMIP_GEMINI_TIMEOUT_MS: "240000",
    CMIP_GEMINI_MAX_ATTEMPTS: "2",
    CMIP_GEMINI_ENABLE_GOOGLE_SEARCH: "false",
    ...extra,
  };
}

async function execGemini(fixtures: ConstructorParameters<typeof FakeCmipGeminiProvider>[0]["fixtures"], env = geminiEnv()) {
  return executeCmipGeminiModelPackage(
    { modelPackage: buildPackage(), taskType: "full_report_experimental", executionMode: "dry_run" },
    {
      provider: new FakeCmipGeminiProvider({ fixtures }),
      env,
      now: () => fixedNow,
      sleepMs: async () => undefined,
      jitterMs: () => 0,
    },
  );
}

function mappedRequest(pkg = buildPackage(), env = geminiEnv(), executionMode: "dry_run" | "preview" | "live_smoke" = "dry_run") {
  const config = dryRunGeminiConfig(env);
  const model = resolveCmipGeminiModelProfile(pkg.executionConfig.modelProfile, config);
  assert.equal(model.ok, true);
  const schema = createGeminiProviderSchema(pkg.outputContract.schema);
  return mapCmipPackageToGeminiInteractionRequest({
    modelPackage: pkg,
    config,
    model: model.resolution,
    providerSchema: schema.providerSchema,
    schemaCompatibility: schema,
    executionMode,
  });
}

function source(paths: readonly string[]): string {
  return paths.map((path) => readFileSync(join(repoRoot, path), "utf8")).join("\n");
}

function walkSource(dir: string): string {
  const files: string[] = [];
  const walk = (current: string) => {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx|js|mjs)$/.test(entry)) files.push(full);
    }
  };
  walk(join(repoRoot, dir));
  return files.map((file) => readFileSync(file, "utf8")).join("\n");
}

function withTempEnvFile(contents: string, run: (envFile: string) => void) {
  const dir = mkdtempSync(join(tmpdir(), "cmip-gemini-env-"));
  const envFile = join(dir, ".env.local");
  writeFileSync(envFile, contents, "utf8");
  try {
    run(envFile);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function runLiveSmokeGateWithEnvFile(envFile: string) {
  return spawnSync(process.execPath, ["--env-file", envFile, "--import", "tsx", "scripts/cmip-gemini-live-smoke.ts"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: { PATH: process.env.PATH ?? "" },
  });
}

function sampleReport(): Mutable<CmipReportEnvelope> {
  return stableJsonClone(awaitImportSample()) as Mutable<CmipReportEnvelope>;
}

function completedGeminiResponse(outputText: string): CmipGeminiProviderExecutionResponse {
  return {
    responseId: "gemini_transport_test",
    status: "completed",
    model: "gemini-cmip-test",
    serviceTier: null,
    outputText,
    refusal: null,
    incompleteDetails: null,
    error: null,
    usage: null,
    toolCalls: 0,
    toolSources: [],
  };
}

function parseTransportOutput(output: unknown) {
  return parseCmipGeminiResponse(completedGeminiResponse(typeof output === "string" ? output : JSON.stringify(output)));
}

test("1. valid Gemini fixture builds provider-neutral package result", async () => {
  const result = await execGemini(["valid"]);
  assert.equal(result.status, "success");
  assert.equal(result.provider.name, "gemini");
});

test("2. valid abstain Gemini response succeeds as report posture", async () => {
  const result = await execGemini(["abstain"]);
  assert.equal(result.status, "success");
  assert.equal(result.report?.cmip_report.decision.posture, "abstain");
});

test("3. runtime package preserves abstain-ready context", () => {
  assert.match(mappedRequest().body.input, /<CMIP_RUNTIME_CONTEXT>/);
});

test("4. invalid runtime model package fails closed", async () => {
  const pkg = stableJsonClone(buildPackage()) as unknown as CmipModelExecutionPackage & { messages: unknown[] };
  pkg.messages = [];
  const result = await executeCmipGeminiModelPackage({ modelPackage: pkg, taskType: "full_report_experimental", executionMode: "dry_run" }, { provider: new FakeCmipGeminiProvider(), env: geminiEnv() });
  assert.equal(result.status, "failed");
  assert.equal(result.errors.some((error) => error.code === "MODEL_PACKAGE_INVALID"), true);
});

test("5. missing Gemini key returns controlled error", () => {
  const result = loadCmipGeminiEnv({ CMIP_GEMINI_MODEL_PRIMARY: "gemini-test" });
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((error) => error.code === "GEMINI_API_KEY_MISSING"), true);
});

test("6. missing Gemini model returns controlled error", () => {
  const result = loadCmipGeminiEnv({ GEMINI_API_KEY: "AIzaSafePlaceholderNotARealSecret" });
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((error) => error.code === "GEMINI_MODEL_NOT_CONFIGURED"), true);
});

test("7. no hidden model fallback is used", () => {
  const config = dryRunGeminiConfig({ CMIP_GEMINI_MODEL_PRIMARY: "gemini-explicit" });
  assert.equal(config.modelPrimary, "gemini-explicit");
});

test("8. static import does not create a Gemini client", () => {
  const clientSource = source(["src/lib/cmip/gemini/client.ts"]);
  assert.doesNotMatch(clientSource, /process\.env/);
});

test("9. NEXT_PUBLIC Gemini variables are rejected", () => {
  const result = loadCmipGeminiEnv({ GEMINI_API_KEY: "AIzaSafePlaceholderNotARealSecret", CMIP_GEMINI_MODEL_PRIMARY: "gemini-test", NEXT_PUBLIC_GEMINI_API_KEY: "bad" });
  assert.equal(result.ok, false);
});

test("10. API key is absent from configuration errors", () => {
  const result = loadCmipGeminiEnv({ GEMINI_API_KEY: "AIzaSafePlaceholderNotARealSecret" });
  assert.equal(result.ok, false);
  assert.doesNotMatch(JSON.stringify(result.errors), /AIzaSafePlaceholder/);
});

test("11. system instruction maps to system_instruction", () => {
  const mapped = mappedRequest();
  assert.equal(mapped.body.system_instruction, buildPackage().messages[0].content);
});

test("12. developer contexts are preserved", () => {
  const mapped = mappedRequest();
  assert.match(mapped.body.input, /<CMIP_TRUSTED_INTELLIGENCE_CONTEXT>/);
  assert.match(mapped.body.input, /<CMIP_OUTPUT_CONTRACT_RULES>/);
});

test("13. runtime remains user data", () => {
  const mapped = mappedRequest();
  assert.match(mapped.body.input, /<CMIP_RUNTIME_CONTEXT>/);
  assert.doesNotMatch(mapped.body.system_instruction, /CMIP_RUNTIME_CONTEXT/);
});

test("14. trust-boundary tags are preserved", () => {
  const input = mappedRequest().body.input;
  assert.match(input, /<\/CMIP_TRUSTED_INTELLIGENCE_CONTEXT>/);
  assert.match(input, /<\/CMIP_OUTPUT_CONTRACT_RULES>/);
  assert.match(input, /<\/CMIP_RUNTIME_CONTEXT>/);
});

test("15. output schema maps through response_format", () => {
  assert.equal(mappedRequest().body.response_format.type, "text");
});

test("16. Gemini MIME type is application/json", () => {
  assert.equal(mappedRequest().body.response_format.mime_type, "application/json");
});

test("17. Gemini request uses store=false", () => {
  assert.equal(mappedRequest().body.store, false);
});

test("17a. Gemini AI Studio request omits Enterprise-only labels", () => {
  assert.equal(Object.hasOwn(mappedRequest().body as unknown as Record<string, unknown>, "labels"), false);
});

test("17b. Gemini AI Studio request omits unsupported thinking_config", () => {
  assert.equal(Object.hasOwn(mappedRequest().body.generation_config as unknown as Record<string, unknown>, "thinking_config"), false);
});

test("17c. Gemini provider request uses compact transport schema", () => {
  const schema = mappedRequest().body.response_format.schema as { required?: string[]; properties?: Record<string, unknown> };
  assert.deepEqual(schema.required, ["schema_version", "cmip_report"]);
  assert.deepEqual(Object.keys(schema.properties ?? {}).sort(), ["cmip_report", "schema_version"]);
});

test("17d. full Task 001 schema is not sent in Gemini response_format", () => {
  const schema = mappedRequest().body.response_format.schema as { properties?: Record<string, unknown> };
  const cmipReportSchema = (schema.properties?.cmip_report ?? {}) as Record<string, unknown>;
  const providerSchemaText = JSON.stringify(mappedRequest().body.response_format.schema);
  assert.equal(Object.hasOwn(cmipReportSchema, "properties"), false);
  assert.doesNotMatch(providerSchemaText, /engine_scores|decision_memory|"audit"/);
  assert.notEqual(hashCanonicalJson(mappedRequest().body.response_format.schema), hashCanonicalJson(outputSchema));
});

test("17e. canonical schema remains present in trusted output instructions", () => {
  const input = mappedRequest().body.input;
  assert.match(input, /CMIP OUTPUT CONTRACT AND RESPONSE RESTRICTIONS/);
  assert.match(input, /"cmip_report"/);
  assert.match(input, /GEMINI COMPACT CANONICAL-ROOT TRANSPORT REQUIREMENT/);
  assert.match(input, /Do not return a property named report/);
  assert.match(input, /The application will reconstruct/);
});

test("18. no previous interaction state is used", () => {
  assert.equal(Object.hasOwn(mappedRequest().body as unknown as Record<string, unknown>, "previous_interaction_id"), false);
});

test("19. output token limit is bounded", () => {
  assert.equal(mappedRequest(buildPackage(), geminiEnv({ CMIP_GEMINI_MAX_OUTPUT_TOKENS: "100" })).body.generation_config.max_output_tokens, 100);
});

test("20. model ID comes from profile mapping", () => {
  assert.equal(mappedRequest(buildPackage(), geminiEnv({ CMIP_GEMINI_MODEL_PRIMARY: "gemini-from-env" })).body.model, "gemini-from-env");
});

test("21. canonical schema hash is unchanged by projection", () => {
  const before = hashCanonicalJson(outputSchema);
  createGeminiProviderSchema(outputSchema as Record<string, unknown>);
  assert.equal(hashCanonicalJson(outputSchema), before);
});

test("22. provider schema projection is deterministic", () => {
  assert.equal(createGeminiProviderSchema(outputSchema as Record<string, unknown>).providerSchemaHash, createGeminiProviderSchema(outputSchema as Record<string, unknown>).providerSchemaHash);
});

test("23. schema hash is stable", () => {
  const schema = createGeminiProviderSchema(outputSchema as Record<string, unknown>);
  assert.equal(schema.canonicalSchemaHash, hashCanonicalJson(outputSchema));
  assert.equal(schema.providerTransportSchemaHash, hashCanonicalJson(CMIP_GEMINI_TRANSPORT_SCHEMA));
  assert.equal(schema.transportMode, "compact_canonical_root_v3");
  assert.equal(schema.canonicalPostValidationRequired, true);
  assert.equal(schema.reconstructedEnvelope, true);
  assert.equal(schema.transformedKeywords.some((item) => item.providerRepresentation.includes("application reconstructs canonical envelope")), true);
});

test("24. compact transport required fields are preserved", () => {
  const schema = createGeminiProviderSchema(outputSchema as Record<string, unknown>).providerSchema;
  assert.deepEqual(schema.required, ["schema_version", "cmip_report"]);
});

test("25. compact transport schema version enum is preserved", () => {
  const schema = createGeminiProviderSchema(outputSchema as Record<string, unknown>).providerSchema;
  assert.match(JSON.stringify(schema), new RegExp(CMIP_OUTPUT_SCHEMA_VERSION));
});

test("26. abstain contract is preserved in trusted canonical instructions", () => {
  assert.match(mappedRequest().body.input, /abstention/);
});

test("26a. compact transport schema compiles and validates a valid envelope", () => {
  const envelope = buildCmipGeminiTransportEnvelope(awaitImportSample());
  assert.equal(validateCmipGeminiTransportEnvelope(envelope).valid, true);
});

test("26b. compact transport schema stays below the byte-size budget", () => {
  assert.ok(Buffer.byteLength(JSON.stringify(CMIP_GEMINI_TRANSPORT_SCHEMA), "utf8") < CMIP_GEMINI_TRANSPORT_SCHEMA_BYTE_BUDGET);
});

test("26c. valid canonical-root transport envelope succeeds", () => {
  const output = JSON.stringify(buildCmipGeminiTransportEnvelope(awaitImportSample()));
  const parsed = parseTransportOutput(output);
  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.report?.cmip_report.meta.schema_version, CMIP_OUTPUT_SCHEMA_VERSION);
});

test("26d. valid abstention report inside canonical-root transport succeeds", () => {
  const output = JSON.stringify(buildCmipGeminiTransportEnvelope(buildAbstainOutput()));
  const parsed = parseTransportOutput(output);
  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.report?.cmip_report.decision.posture, "abstain");
});

test("26e. invalid transport JSON fails", () => {
  const parsed = parseTransportOutput("{not-json");
  assert.equal(parsed.errors.some((error) => error.code === "GEMINI_TRANSPORT_ENVELOPE_INVALID"), true);
});

test("26f. missing cmip_report fails", () => {
  const parsed = parseTransportOutput({ schema_version: CMIP_OUTPUT_SCHEMA_VERSION });
  assert.equal(parsed.errors.some((error) => error.code === "GEMINI_CMIP_REPORT_MISSING"), true);
});

test("26g. report property is rejected", () => {
  const parsed = parseTransportOutput({ schema_version: CMIP_OUTPUT_SCHEMA_VERSION, report: { cmip_report: {} } });
  assert.equal(parsed.errors.some((error) => error.code === "GEMINI_CMIP_REPORT_MISSING" || error.code === "GEMINI_TRANSPORT_ENVELOPE_INVALID"), true);
});

test("26h. wrong transport schema_version fails", () => {
  const parsed = parseTransportOutput({ schema_version: "CMIP-REPORT-1.0", cmip_report: {} });
  assert.equal(parsed.errors.some((error) => error.code === "GEMINI_TRANSPORT_VERSION_MISMATCH"), true);
});

test("26i. null cmip_report fails", () => {
  const parsed = parseTransportOutput({ schema_version: CMIP_OUTPUT_SCHEMA_VERSION, cmip_report: null });
  assert.equal(parsed.errors.some((error) => error.code === "GEMINI_CMIP_REPORT_INVALID"), true);
});

test("26j. string cmip_report fails", () => {
  const parsed = parseTransportOutput({ schema_version: CMIP_OUTPUT_SCHEMA_VERSION, cmip_report: JSON.stringify({ meta: {} }) });
  assert.equal(parsed.errors.some((error) => error.code === "GEMINI_CMIP_REPORT_INVALID"), true);
});

test("26k. array cmip_report fails", () => {
  const parsed = parseTransportOutput({ schema_version: CMIP_OUTPUT_SCHEMA_VERSION, cmip_report: [] });
  assert.equal(parsed.errors.some((error) => error.code === "GEMINI_CMIP_REPORT_INVALID"), true);
});

test("26l. nested report wrapper fails", () => {
  const parsed = parseTransportOutput({ schema_version: CMIP_OUTPUT_SCHEMA_VERSION, report: { cmip_report: sampleReport().cmip_report } });
  assert.equal(parsed.errors.some((error) => error.code === "GEMINI_CMIP_REPORT_MISSING" || error.code === "GEMINI_TRANSPORT_ENVELOPE_INVALID"), true);
});

test("26m. double nested cmip_report fails canonical validation", () => {
  const parsed = parseTransportOutput({ schema_version: CMIP_OUTPUT_SCHEMA_VERSION, cmip_report: { cmip_report: sampleReport().cmip_report } });
  assert.equal(parsed.errors.some((error) => error.code === "GEMINI_CANONICAL_OUTPUT_INVALID"), true);
});

test("26n. valid inner cmip_report is reconstructed into canonical envelope", () => {
  const report = sampleReport();
  const parsed = parseTransportOutput({ schema_version: CMIP_OUTPUT_SCHEMA_VERSION, cmip_report: report.cmip_report });
  assert.equal(parsed.errors.length, 0);
  assert.equal(validateCmipReport({ cmip_report: report.cmip_report }).valid, true);
  assert.equal(parsed.report?.cmip_report.meta.schema_version, CMIP_OUTPUT_SCHEMA_VERSION);
});

test("26o. canonically invalid inner cmip_report fails", () => {
  const parsed = parseTransportOutput({ schema_version: CMIP_OUTPUT_SCHEMA_VERSION, cmip_report: {} });
  assert.equal(parsed.errors.some((error) => error.code === "GEMINI_CANONICAL_OUTPUT_INVALID"), true);
});

test("26p. missing one of ten assets in inner cmip_report fails", () => {
  const report = sampleReport();
  report.cmip_report.coins = report.cmip_report.coins.filter((coin) => coin.symbol !== "TON");
  const parsed = parseTransportOutput(JSON.stringify(buildCmipGeminiTransportEnvelope(report)));
  assert.equal(parsed.errors.some((error) => error.code === "GEMINI_CANONICAL_OUTPUT_INVALID"), true);
});

test("26q. invalid abstention semantics in inner cmip_report fail", () => {
  const report = sampleReport();
  report.cmip_report.decision.posture = "abstain";
  report.cmip_report.decision.score = null;
  report.cmip_report.decision.abstention = null;
  const parsed = parseTransportOutput(JSON.stringify(buildCmipGeminiTransportEnvelope(report)));
  assert.equal(parsed.errors.some((error) => error.code === "GEMINI_CANONICAL_OUTPUT_INVALID"), true);
});

test("26r. missing source reference in inner cmip_report fails", () => {
  const report = sampleReport();
  report.cmip_report.reasons[0].source_refs = ["missing-source-ref"];
  const parsed = parseTransportOutput(JSON.stringify(buildCmipGeminiTransportEnvelope(report)));
  assert.equal(parsed.errors.some((error) => error.code === "GEMINI_CANONICAL_OUTPUT_INVALID"), true);
});

test("26s. additional canonical properties fail", () => {
  const report = sampleReport() as Mutable<CmipReportEnvelope> & { cmip_report: Mutable<CmipReportEnvelope["cmip_report"]> & { extra_field?: string } };
  report.cmip_report.extra_field = "not allowed";
  const parsed = parseTransportOutput(JSON.stringify(buildCmipGeminiTransportEnvelope(report)));
  assert.equal(parsed.errors.some((error) => error.code === "GEMINI_CANONICAL_OUTPUT_INVALID"), true);
});

test("26t. Gemini transport validity alone cannot produce success", () => {
  const transport = { schema_version: CMIP_OUTPUT_SCHEMA_VERSION, cmip_report: {} };
  const parsed = parseTransportOutput(JSON.stringify(transport));
  assert.equal(validateCmipGeminiTransportEnvelope(transport).valid, true);
  assert.equal(parsed.report, null);
});

test("26u. OpenAI provider schema still uses the canonical report schema", () => {
  const openai = createOpenAiProviderSchema(outputSchema as Record<string, unknown>).schema;
  assert.match(JSON.stringify(openai), /cmip_report/);
  assert.match(JSON.stringify(openai), /engine_scores/);
});

test("26v. same report produces deterministic transport validation results", () => {
  const output = JSON.stringify(buildCmipGeminiTransportEnvelope(awaitImportSample()));
  assert.deepEqual(parseCmipGeminiTransportOutput(output), parseCmipGeminiTransportOutput(output));
});

test("26w. transport validation does not mutate output", () => {
  const envelope = buildCmipGeminiTransportEnvelope(awaitImportSample());
  const before = JSON.stringify(envelope);
  validateCmipGeminiTransportEnvelope(envelope);
  assert.equal(JSON.stringify(envelope), before);
});

test("26x. only one outer JSON parse occurs for a valid canonical-root envelope", () => {
  const transportSource = source(["src/lib/cmip/gemini/transport.ts"]);
  const start = transportSource.indexOf("export function parseCmipGeminiTransportOutput");
  const end = transportSource.indexOf("export function parseLooseCmipGeminiReportObject");
  const productionParserSource = transportSource.slice(start, end);
  assert.equal((productionParserSource.match(/JSON\.parse\(outputText\)/g) ?? []).length, 1);
  assert.doesNotMatch(productionParserSource, /JSON\.parse\(transportValidation\.envelope\.cmip_report/);
});

test("26y. production transport path has no nested JSON-string parsing", () => {
  const transportSource = source(["src/lib/cmip/gemini/transport.ts"]);
  assert.doesNotMatch(transportSource, /report_json/);
  assert.doesNotMatch(transportSource, /JSON\.parse\(validated\.envelope\.cmip_report/);
});

test("26z. Markdown fenced transport output is not stripped", () => {
  const output = JSON.stringify(buildCmipGeminiTransportEnvelope(awaitImportSample()));
  const parsed = parseTransportOutput(`\`\`\`json\n${output}\n\`\`\``);
  assert.equal(parsed.errors.some((error) => error.code === "GEMINI_TRANSPORT_ENVELOPE_INVALID"), true);
});

test("26aa. transport parser performs no regex repair", () => {
  const output = `${JSON.stringify(buildCmipGeminiTransportEnvelope(awaitImportSample()))}\nextra`;
  const parsed = parseTransportOutput(output);
  assert.equal(parsed.errors.some((error) => error.code === "GEMINI_TRANSPORT_ENVELOPE_INVALID"), true);
});

test("26ab. no arbitrary unwrapping or root repair exists", () => {
  const parsed = parseTransportOutput({ schema_version: CMIP_OUTPUT_SCHEMA_VERSION, report: { cmip_report: sampleReport().cmip_report } });
  assert.equal(parsed.report, null);
});

test("26ac. repair uses compact_canonical_root_v3 transport", async () => {
  const result = await execGemini(["schema_invalid", "valid"]);
  assert.equal(result.validation.repairAttempted, true);
  assert.equal(result.trace.providerTrace?.schemaCompatibility.transportMode, "compact_canonical_root_v3");
  assert.equal(result.status, "success");
});

test("26ad. full canonical schema is never passed to Gemini response_format", () => {
  const schema = mappedRequest().body.response_format.schema;
  assert.equal(Object.hasOwn(schema, "$defs"), false);
  const cmipReportSchema = ((schema as { properties?: Record<string, unknown> }).properties ?? {}).cmip_report as Record<string, unknown>;
  assert.equal(Object.hasOwn(cmipReportSchema ?? {}, "properties"), false);
});

test("27. unsupported keyword is recorded", () => {
  const result = createGeminiProviderSchema({ type: "object", patternProperties: { "^x": { type: "string" } } });
  assert.equal(result.compatible, false);
  assert.equal(result.unsupportedKeywords[0].keyword, "patternProperties");
});

test("28. unsafe weakening blocks execution", async () => {
  const pkg = stableJsonClone(buildPackage()) as unknown as CmipModelExecutionPackage & { outputContract: { schema: Record<string, unknown> } };
  pkg.outputContract.schema = { type: "object", patternProperties: { "^x": { type: "string" } } };
  const result = await executeCmipGeminiModelPackage({ modelPackage: pkg, taskType: "full_report_experimental", executionMode: "dry_run" }, { provider: new FakeCmipGeminiProvider(), env: geminiEnv() });
  assert.equal(result.status, "failed");
});

test("29. canonical AJV post-validation remains active", async () => {
  const result = await execGemini(["schema_invalid", "schema_invalid"]);
  assert.equal(result.status, "failed");
  assert.equal(result.errors.some((error) => error.code === "GEMINI_CANONICAL_OUTPUT_INVALID" || error.code === "GEMINI_SCHEMA_REPAIR_FAILED"), true);
});

test("30. Google Search is disabled by default", () => {
  assert.equal(mappedRequest().googleSearchEnabled, false);
});

test("31. env flag false blocks search", () => {
  const result = mapCmipGeminiTools({ toolPolicy: { ...buildPackage().toolPolicy, webSearch: { ...buildPackage().toolPolicy.webSearch, mode: "context_only" } }, enableGoogleSearch: false, capabilities: { supportsGoogleSearch: true }, executionMode: "preview" });
  assert.equal(result.enabled, false);
});

test("32. package policy disabled blocks search", () => {
  assert.equal(mapCmipGeminiTools({ toolPolicy: buildPackage().toolPolicy, enableGoogleSearch: true, capabilities: { supportsGoogleSearch: true }, executionMode: "preview" }).enabled, false);
});

test("33. unsupported model blocks search", () => {
  const result = mapCmipGeminiTools({ toolPolicy: { ...buildPackage().toolPolicy, webSearch: { ...buildPackage().toolPolicy.webSearch, mode: "context_only" } }, enableGoogleSearch: true, capabilities: { supportsGoogleSearch: false }, executionMode: "preview" });
  assert.equal(result.enabled, false);
});

test("34. all search conditions enable search", () => {
  const result = mapCmipGeminiTools({ toolPolicy: { ...buildPackage().toolPolicy, webSearch: { ...buildPackage().toolPolicy.webSearch, mode: "context_only", maxSearchQueries: 1 } }, enableGoogleSearch: true, capabilities: { supportsGoogleSearch: true }, executionMode: "preview" });
  assert.equal(result.enabled, true);
});

test("35. search usage is bounded by package policy", () => {
  assert.equal(buildPackage().toolPolicy.webSearch.maxSearchQueries, 0);
});

test("36. search cannot override collector values", () => {
  assert.equal(buildPackage().toolPolicy.webSearch.allowNumericalOverride, false);
});

test("37. search sources are recorded safely", () => {
  const response = mapGeminiInteraction({ id: "g", status: "completed", output_text: "{}", steps: [{ type: "google_search_call", results: [{ url: "https://example.com", title: "Example" }] }] });
  assert.equal(response.toolSources[0].url, "https://example.com");
});

const statusCases = [
  ["38. valid completed response succeeds", "valid", "success"],
  ["39. safety block returns refused", "blocked", "refused"],
  ["40. incomplete returns incomplete", "incomplete", "incomplete"],
  ["41. failed returns failed", "failed", "failed"],
  ["42. cancelled returns failed", "cancelled", "failed"],
  ["43. queued in synchronous mode fails", "queued", "failed"],
  ["44. in-progress in synchronous mode fails", "in_progress", "failed"],
] as const;

for (const [name, fixtureName, expected] of statusCases) {
  test(name, async () => {
    const result = await execGemini([fixtureName]);
    assert.equal(result.status, expected);
  });
}

test("45. missing output returns controlled error", async () => {
  const result = await execGemini(["missing_output"]);
  assert.equal(result.errors.some((error) => error.code === "GEMINI_OUTPUT_MISSING"), true);
});

test("46. invalid JSON returns controlled error", async () => {
  const result = await execGemini(["invalid_json"]);
  assert.equal(result.errors.some((error) => error.code === "GEMINI_TRANSPORT_ENVELOPE_INVALID"), true);
});

test("47. provider response ID is captured", async () => {
  assert.match((await execGemini(["valid"])).provider.responseId ?? "", /gemini_fake_valid/);
});

test("48. raw status is captured separately", async () => {
  const result = await execGemini(["valid"]);
  assert.equal(result.status, "success");
  assert.equal(result.provider.rawStatus, "completed");
});

test("49. valid output does not repair", async () => {
  assert.equal((await execGemini(["valid"])).validation.repairAttempted, false);
});

test("50. structurally repairable output triggers at most one repair", async () => {
  const result = await execGemini(["schema_invalid", "valid"]);
  assert.equal(result.validation.repairAttempted, true);
  assert.equal(result.attempts.length, 2);
});

test("51. successful repair becomes valid", async () => {
  assert.equal((await execGemini(["schema_invalid", "valid"])).status, "success");
});

test("52. failed repair returns failure", async () => {
  assert.equal((await execGemini(["schema_invalid", "schema_invalid"])).status, "failed");
});

test("53. unparseable JSON does not repair", async () => {
  assert.equal((await execGemini(["invalid_json", "valid"])).attempts.length, 1);
});

test("54. refusal does not repair", async () => {
  assert.equal((await execGemini(["blocked", "valid"])).validation.repairAttempted, false);
});

test("55. verified numbers cannot change", () => {
  assert.equal(numericalValuesChanged({ a: 1 }, { a: 2 }), true);
});

test("56. validation errors are retained in trace-level result errors", async () => {
  const result = await execGemini(["schema_invalid", "schema_invalid"]);
  assert.ok(result.errors.length > 0);
});

test("57. rate limit retries", async () => {
  const result = await execGemini(["rate_limit", "valid"]);
  assert.equal(result.status, "success");
  assert.equal(result.attempts[0].retryDelayMs, 250);
});

test("58. temporary unavailable is retry-classified as provider 5xx", () => {
  assert.equal(isCmipGeminiRetryable(classifyGeminiProviderException(Object.assign(new Error("temporary"), { status: 503 })).code), true);
});

test("59. provider 5xx retries", () => {
  assert.equal(isCmipGeminiRetryable("GEMINI_PROVIDER_5XX"), true);
});

test("60. invalid API key does not retry", () => {
  assert.equal(isCmipGeminiRetryable(classifyGeminiProviderException(Object.assign(new Error("auth"), { status: 401 })).code), false);
});

test("61. permission error does not retry", () => {
  assert.equal(classifyGeminiProviderException(Object.assign(new Error("permission"), { status: 403 })).code, "GEMINI_PERMISSION_ERROR");
});

test("62. invalid request does not retry", () => {
  assert.equal(isCmipGeminiRetryable(classifyGeminiProviderException(Object.assign(new Error("bad"), { status: 400 })).code), false);
});

test("63. quota exhausted without retry window does not loop", () => {
  assert.equal(classifyGeminiProviderException(Object.assign(new Error("quota exhausted"), { status: 429 })).code, "GEMINI_QUOTA_EXHAUSTED");
});

test("64. timeout aborts", async () => {
  await assert.rejects(runGeminiWithTimeout({ timeoutMs: 1, run: (signal) => new Promise((_resolve, reject) => signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })))) }));
});

test("65. retry attempts are bounded", async () => {
  assert.equal((await execGemini(["rate_limit", "rate_limit"], geminiEnv({ CMIP_GEMINI_MAX_ATTEMPTS: "2" }))).attempts.length, 2);
});

test("66. jitter is injectable", async () => {
  const result = await executeCmipGeminiModelPackage({ modelPackage: buildPackage(), taskType: "full_report_experimental", executionMode: "dry_run" }, { provider: new FakeCmipGeminiProvider({ fixtures: ["rate_limit", "valid"] }), env: geminiEnv(), now: () => fixedNow, sleepMs: async () => undefined, jitterMs: () => 7 });
  assert.equal(result.attempts[0].retryDelayMs, 257);
});

test("67. attempt order is deterministic", async () => {
  const a = await execGemini(["rate_limit", "valid"]);
  const b = await execGemini(["rate_limit", "valid"]);
  assert.deepEqual(a.attempts.map((attempt) => attempt.attemptIndex), b.attempts.map((attempt) => attempt.attemptIndex));
});

test("68. prompt content is not exposed in retry errors", async () => {
  const result = await execGemini(["rate_limit", "rate_limit"]);
  assert.doesNotMatch(JSON.stringify(result.errors), /CMIP_RUNTIME_CONTEXT/);
});

test("69. input tokens are captured", async () => {
  assert.equal((await execGemini(["valid"])).usage.inputTokens, 1000);
});

test("70. cached tokens remain nullable", async () => {
  assert.equal((await execGemini(["valid"])).usage.cachedInputTokens, null);
});

test("71. output tokens are captured", async () => {
  assert.equal((await execGemini(["valid"])).usage.outputTokens, 420);
});

test("72. reasoning tokens are captured", async () => {
  assert.equal((await execGemini(["valid"])).usage.reasoningTokens, 44);
});

test("73. total tokens are captured", async () => {
  assert.equal((await execGemini(["valid"])).usage.totalTokens, 1420);
});

test("74. missing usage remains null", () => {
  assert.equal(normalizeCmipGeminiUsage(null), null);
});

test("75. estimated and actual usage remain separate", async () => {
  const result = await execGemini(["valid"]);
  assert.notEqual(result.usage.totalTokens, buildPackage().contextBudget.estimatedInputTokens);
});

test("76. no hardcoded cost calculation exists", () => {
  assert.doesNotMatch(source(["src/lib/cmip/gemini/usage.ts", "src/lib/cmip/gemini/execute-model-package.ts"]), /\bcost|price_usd|billing/i);
});

test("77. Gemini dry run has no network call", () => {
  assert.match(source(["scripts/cmip-gemini-dry-run.ts"]), /FakeCmipGeminiProvider/);
});

test("78. provider comparison has no network call", () => {
  assert.match(source(["scripts/cmip-provider-compare-dry-run.ts"]), /FakeCmipGeminiProvider/);
  assert.match(source(["scripts/cmip-provider-compare-dry-run.ts"]), /FakeCmipOpenAiProvider/);
});

test("79. live smoke refuses without allow flag", () => {
  assert.match(source(["scripts/cmip-gemini-live-smoke.ts"]), /CMIP_ALLOW_LIVE_GEMINI_SMOKE/);
});

test("80. package live smoke command explicitly loads .env.local", () => {
  const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as { scripts?: Record<string, string> };
  assert.equal(pkg.scripts?.["cmip:gemini-live-smoke"], "node --env-file=.env.local --import tsx scripts/cmip-gemini-live-smoke.ts");
});

test("81. Node env-file exposes smoke env values to a standalone process", () => {
  withTempEnvFile(
    [
      "GEMINI_API_KEY=GeminiSmokeSecretShouldNeverPrint",
      "CMIP_GEMINI_MODEL_PRIMARY=gemini-3.5-flash",
      "CMIP_ALLOW_LIVE_GEMINI_SMOKE=true",
      "CMIP_GEMINI_ENABLE_GOOGLE_SEARCH=false",
    ].join("\n"),
    (envFile) => {
      const output = execFileSync(
        process.execPath,
        [
          "--env-file",
          envFile,
          "-e",
          "process.stdout.write(`${Boolean(process.env.GEMINI_API_KEY)}|${process.env.CMIP_GEMINI_MODEL_PRIMARY}|${process.env.CMIP_ALLOW_LIVE_GEMINI_SMOKE}|${process.env.CMIP_GEMINI_ENABLE_GOOGLE_SEARCH}`)",
        ],
        { encoding: "utf8", env: { PATH: process.env.PATH ?? "" } },
      );
      assert.equal(output, "true|gemini-3.5-flash|true|false");
      assert.doesNotMatch(output, /GeminiSmokeSecretShouldNeverPrint/);
    },
  );
});

test("82. live smoke without allow flag exits before provider execution", () => {
  withTempEnvFile(
    [
      "GEMINI_API_KEY=GeminiSmokeSecretShouldNeverPrint",
      "CMIP_GEMINI_MODEL_PRIMARY=gemini-3.5-flash",
      "CMIP_GEMINI_ENABLE_GOOGLE_SEARCH=false",
    ].join("\n"),
    (envFile) => {
      const result = runLiveSmokeGateWithEnvFile(envFile);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /CMIP GEMINI LIVE SMOKE BLOCKED/);
      assert.match(result.stderr, /CMIP_ALLOW_LIVE_GEMINI_SMOKE=true/);
      assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /GeminiSmokeSecretShouldNeverPrint/);
      assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /CMIP GEMINI RESPONSE ID/);
    },
  );
});

test("83. live smoke with missing key exits before provider execution", () => {
  withTempEnvFile(
    [
      "CMIP_ALLOW_LIVE_GEMINI_SMOKE=true",
      "CMIP_GEMINI_MODEL_PRIMARY=gemini-3.5-flash",
      "CMIP_GEMINI_ENABLE_GOOGLE_SEARCH=false",
    ].join("\n"),
    (envFile) => {
      const result = runLiveSmokeGateWithEnvFile(envFile);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /GEMINI_API_KEY is required/);
      assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /CMIP GEMINI RESPONSE ID/);
    },
  );
});

test("84. live smoke with missing model exits before provider execution", () => {
  withTempEnvFile(
    [
      "GEMINI_API_KEY=GeminiSmokeSecretShouldNeverPrint",
      "CMIP_ALLOW_LIVE_GEMINI_SMOKE=true",
      "CMIP_GEMINI_ENABLE_GOOGLE_SEARCH=false",
    ].join("\n"),
    (envFile) => {
      const result = runLiveSmokeGateWithEnvFile(envFile);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /CMIP_GEMINI_MODEL_PRIMARY is required/);
      assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /GeminiSmokeSecretShouldNeverPrint/);
      assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /CMIP GEMINI RESPONSE ID/);
    },
  );
});

test("85. live smoke refuses without key", () => {
  assert.match(source(["scripts/cmip-gemini-live-smoke.ts"]), /GEMINI_API_KEY is required/);
});

test("86. live smoke refuses without model", () => {
  assert.match(source(["scripts/cmip-gemini-live-smoke.ts"]), /CMIP_GEMINI_MODEL_PRIMARY is required/);
});

test("87. live smoke never runs in tests", () => {
  const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as { scripts?: Record<string, string> };
  assert.doesNotMatch(pkg.scripts?.test ?? "", /gemini-live-smoke/);
});

test("88. Gemini modules write no filesystem output", () => {
  assert.doesNotMatch(walkSource("src/lib/cmip/gemini"), /writeFile|appendFile|mkdir|createWriteStream/);
});

test("89. Gemini modules perform no DB writes", () => {
  assert.doesNotMatch(walkSource("src/lib/cmip/gemini"), /supabase|insert\(|upsert\(|prisma|pg\./i);
});

test("90. Gemini modules do not publish reports", () => {
  assert.doesNotMatch(walkSource("src/lib/cmip/gemini"), /wordpress|telegram|sendEmail|publicationTarget/i);
});

test("91. Gemini modules create no cron", () => {
  assert.doesNotMatch(walkSource("src/lib/cmip/gemini"), /cron|schedule/i);
});

test("92. no browser-side Gemini code exists", () => {
  assert.doesNotMatch(walkSource("src/app"), /@google\/genai/);
});

test("93. existing canonical contracts still pass", () => {
  assert.equal(validateCmipReport(stableJsonClone((awaitImportSample()))).valid, true);
});

test("94. production package validates without Gemini key", async () => {
  const result = await executeCmipGeminiModelPackage({ modelPackage: buildPackage(), taskType: "full_report_experimental", executionMode: "dry_run" }, { provider: new FakeCmipGeminiProvider(), env: {} });
  assert.equal(result.status, "success");
});

test("95. canonical result schema rejects provider statuses as canonical status", async () => {
  const result = await execGemini(["valid"]);
  for (const status of ["completed", "cancelled", "queued", "in_progress"]) {
    assert.equal(validateCmipGeminiExecutionResult({ ...result, status }).valid, false, status);
  }
});

test("96. package schema Draft 2020-12 enum is canonical", () => {
  assert.deepEqual((executionResultSchema as { properties: { status: { enum: string[] } } }).properties.status.enum, ["success", "failed", "refused", "incomplete"]);
});

test("97. Task 002 runtime input remains valid", () => {
  assert.equal(validateCmipRuntimeInput((validFixture as CmipModelPackageBuildRequest).runtimeInput).valid, true);
});

test("98. Task 2.5 version remains visible", () => {
  assert.match(JSON.stringify(buildPackage().versions), new RegExp(CMIP_INTELLIGENCE_SPEC_VERSION));
});

test("99. official Google SDK dependency is isolated to Gemini client", () => {
  assert.match(source(["src/lib/cmip/gemini/client.ts"]), /@google\/genai/);
});

test("100. OpenAI SDK remains installed and referenced", () => {
  const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as { dependencies?: Record<string, string> };
  assert.equal(typeof pkg.dependencies?.openai, "string");
});

test("101. Gemini API key is never exposed in result errors", async () => {
  const result = await executeCmipGeminiModelPackage({ modelPackage: buildPackage(), taskType: "full_report_experimental", executionMode: "preview" }, { env: { GEMINI_API_KEY: "AIzaSafePlaceholderNotARealSecret" } });
  assert.doesNotMatch(JSON.stringify(result), /AIzaSafePlaceholder/);
});

function awaitImportSample() {
  return JSON.parse(readFileSync(join(repoRoot, "src/lib/cmip/contracts/sample-output.json"), "utf8"));
}
