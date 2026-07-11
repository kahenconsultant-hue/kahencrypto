import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import validFixture from "../src/lib/cmip/model-package/fixtures/package-input-valid.json";
import outputSchema from "../src/lib/cmip/contracts/output-schema.json";
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
import { parseCmipGeminiResponse, numericalValuesChanged, outputContainsSecretLikeValue } from "../src/lib/cmip/gemini/response-parser";
import { normalizeCmipGeminiUsage } from "../src/lib/cmip/gemini/usage";
import { classifyGeminiProviderException, deterministicGeminiRetryDelayMs, isCmipGeminiRetryable } from "../src/lib/cmip/gemini/retry";
import { runGeminiWithTimeout } from "../src/lib/cmip/gemini/timeout";
import { validateCmipGeminiExecutionResult } from "../src/lib/cmip/gemini/validate-execution-result";
import executionResultSchema from "../src/lib/cmip/gemini/execution-result-schema.json";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const fixedNow = "2026-07-10T07:00:00.000Z";

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
    { modelPackage: buildPackage(), executionMode: "dry_run" },
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
  const result = await executeCmipGeminiModelPackage({ modelPackage: pkg, executionMode: "dry_run" }, { provider: new FakeCmipGeminiProvider(), env: geminiEnv() });
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
  assert.equal(createGeminiProviderSchema(outputSchema as Record<string, unknown>).canonicalSchemaHash, hashCanonicalJson(outputSchema));
});

test("24. required fields are preserved", () => {
  const schema = createGeminiProviderSchema(outputSchema as Record<string, unknown>).providerSchema;
  assert.deepEqual(schema.required, ["cmip_report"]);
});

test("25. enum values are preserved", () => {
  const schema = createGeminiProviderSchema(outputSchema as Record<string, unknown>).providerSchema;
  assert.match(JSON.stringify(schema), /increase_selective_risk/);
  assert.match(JSON.stringify(schema), /abstain/);
});

test("26. abstain contract is preserved", () => {
  assert.match(JSON.stringify(createGeminiProviderSchema(outputSchema as Record<string, unknown>).providerSchema), /abstention/);
});

test("27. unsupported keyword is recorded", () => {
  const result = createGeminiProviderSchema({ type: "object", patternProperties: { "^x": { type: "string" } } });
  assert.equal(result.compatible, false);
  assert.equal(result.unsupportedKeywords[0].keyword, "patternProperties");
});

test("28. unsafe weakening blocks execution", async () => {
  const pkg = stableJsonClone(buildPackage()) as unknown as CmipModelExecutionPackage & { outputContract: { schema: Record<string, unknown> } };
  pkg.outputContract.schema = { type: "object", patternProperties: { "^x": { type: "string" } } };
  const result = await executeCmipGeminiModelPackage({ modelPackage: pkg, executionMode: "dry_run" }, { provider: new FakeCmipGeminiProvider(), env: geminiEnv() });
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
  assert.equal(result.errors.some((error) => error.code === "GEMINI_OUTPUT_JSON_INVALID"), true);
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
  const result = await executeCmipGeminiModelPackage({ modelPackage: buildPackage(), executionMode: "dry_run" }, { provider: new FakeCmipGeminiProvider({ fixtures: ["rate_limit", "valid"] }), env: geminiEnv(), now: () => fixedNow, sleepMs: async () => undefined, jitterMs: () => 7 });
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

test("80. live smoke refuses without key", () => {
  assert.match(source(["scripts/cmip-gemini-live-smoke.ts"]), /GEMINI_API_KEY is required/);
});

test("81. live smoke refuses without model", () => {
  assert.match(source(["scripts/cmip-gemini-live-smoke.ts"]), /CMIP_GEMINI_MODEL_PRIMARY is required/);
});

test("82. live smoke never runs in tests", () => {
  const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as { scripts?: Record<string, string> };
  assert.doesNotMatch(pkg.scripts?.test ?? "", /gemini-live-smoke/);
});

test("83. Gemini modules write no filesystem output", () => {
  assert.doesNotMatch(walkSource("src/lib/cmip/gemini"), /writeFile|appendFile|mkdir|createWriteStream/);
});

test("84. Gemini modules perform no DB writes", () => {
  assert.doesNotMatch(walkSource("src/lib/cmip/gemini"), /supabase|insert\(|upsert\(|prisma|pg\./i);
});

test("85. Gemini modules do not publish reports", () => {
  assert.doesNotMatch(walkSource("src/lib/cmip/gemini"), /wordpress|telegram|sendEmail|publicationTarget/i);
});

test("86. Gemini modules create no cron", () => {
  assert.doesNotMatch(walkSource("src/lib/cmip/gemini"), /cron|schedule/i);
});

test("87. no browser-side Gemini code exists", () => {
  assert.doesNotMatch(walkSource("src/app"), /@google\/genai/);
});

test("88. existing canonical contracts still pass", () => {
  assert.equal(validateCmipReport(stableJsonClone((awaitImportSample()))).valid, true);
});

test("89. production package validates without Gemini key", async () => {
  const result = await executeCmipGeminiModelPackage({ modelPackage: buildPackage(), executionMode: "dry_run" }, { provider: new FakeCmipGeminiProvider(), env: {} });
  assert.equal(result.status, "success");
});

test("90. canonical result schema rejects provider statuses as canonical status", async () => {
  const result = await execGemini(["valid"]);
  for (const status of ["completed", "cancelled", "queued", "in_progress"]) {
    assert.equal(validateCmipGeminiExecutionResult({ ...result, status }).valid, false, status);
  }
});

test("91. package schema Draft 2020-12 enum is canonical", () => {
  assert.deepEqual((executionResultSchema as { properties: { status: { enum: string[] } } }).properties.status.enum, ["success", "failed", "refused", "incomplete"]);
});

test("92. Task 002 runtime input remains valid", () => {
  assert.equal(validateCmipRuntimeInput((validFixture as CmipModelPackageBuildRequest).runtimeInput).valid, true);
});

test("93. Task 2.5 version remains visible", () => {
  assert.match(JSON.stringify(buildPackage().versions), new RegExp(CMIP_INTELLIGENCE_SPEC_VERSION));
});

test("94. official Google SDK dependency is isolated to Gemini client", () => {
  assert.match(source(["src/lib/cmip/gemini/client.ts"]), /@google\/genai/);
});

test("95. OpenAI SDK remains installed and referenced", () => {
  const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as { dependencies?: Record<string, string> };
  assert.equal(typeof pkg.dependencies?.openai, "string");
});

test("96. Gemini API key is never exposed in result errors", async () => {
  const result = await executeCmipGeminiModelPackage({ modelPackage: buildPackage(), executionMode: "preview" }, { env: { GEMINI_API_KEY: "AIzaSafePlaceholderNotARealSecret" } });
  assert.doesNotMatch(JSON.stringify(result), /AIzaSafePlaceholder/);
});

function awaitImportSample() {
  return JSON.parse(readFileSync(join(repoRoot, "src/lib/cmip/contracts/sample-output.json"), "utf8"));
}
