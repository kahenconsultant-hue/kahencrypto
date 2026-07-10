import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import validFixture from "../src/lib/cmip/model-package/fixtures/package-input-valid.json";
import partialFixture from "../src/lib/cmip/model-package/fixtures/package-input-partial.json";
import abstainFixture from "../src/lib/cmip/model-package/fixtures/package-input-abstain.json";
import { buildCmipModelExecutionPackage } from "../src/lib/cmip/model-package/build-model-package";
import type { CmipModelExecutionPackage, CmipModelPackageBuildRequest } from "../src/lib/cmip/model-package/types";
import { hashCanonicalJson, sha256Hex, stableJsonClone, stableStringify } from "../src/lib/cmip/model-package";
import outputSchema from "../src/lib/cmip/contracts/output-schema.json";
import { validateCmipReport } from "../src/lib/cmip/contracts/validate-report";
import {
  CMIP_OPENAI_ADAPTER_VERSION,
  CMIP_OPENAI_EXECUTION_VERSION,
  CMIP_OPENAI_SCHEMA_COMPATIBILITY_VERSION,
} from "../src/lib/cmip/openai/constants";
import { executeCmipModelPackage } from "../src/lib/cmip/openai/execute-model-package";
import { loadCmipOpenAiEnv } from "../src/lib/cmip/openai/env";
import { FakeCmipOpenAiProvider, buildAbstainOutput } from "../src/lib/cmip/openai/provider/fake-provider";
import type {
  CmipOpenAiMappedRequest,
  CmipOpenAiProvider,
  CmipOpenAiProviderExecutionRequest,
  CmipOpenAiProviderExecutionResponse,
} from "../src/lib/cmip/openai/types";
import { createOpenAiProviderSchema } from "../src/lib/cmip/openai/schema-compatibility";
import { mapCmipPackageToOpenAiResponseRequest } from "../src/lib/cmip/openai/request-mapper";
import { inferModelCapabilities } from "../src/lib/cmip/openai/model-registry";
import { mapCmipOpenAiTools } from "../src/lib/cmip/openai/tool-mapper";
import { deterministicRetryDelayMs, isCmipOpenAiRetryable } from "../src/lib/cmip/openai/retry";
import { parseCmipOpenAiResponse, numericalValuesChanged, outputContainsSecretLikeValue } from "../src/lib/cmip/openai/response-parser";
import { validateCmipOpenAiExecutionResult } from "../src/lib/cmip/openai/validate-execution-result";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

function buildPackage(input: unknown = validFixture): CmipModelExecutionPackage {
  const result = buildCmipModelExecutionPackage(input as unknown as CmipModelPackageBuildRequest);
  assert.equal(result.ok, true);
  return result.package;
}

function deterministicOptions(provider: CmipOpenAiProvider = new FakeCmipOpenAiProvider({ fixtures: ["valid"] })) {
  return {
    provider,
    env: {
      CMIP_OPENAI_MODEL_PRIMARY: "gpt-5-cmip-test",
      CMIP_OPENAI_MODEL_FALLBACK: "gpt-5-cmip-test-fallback",
      CMIP_OPENAI_MODEL_REPAIR: "gpt-5-cmip-test-repair",
      CMIP_OPENAI_MAX_OUTPUT_TOKENS: "8000",
      CMIP_OPENAI_TIMEOUT_MS: "240000",
    },
    now: () => "2026-07-10T07:00:00.000Z",
    sleepMs: async () => undefined,
    jitterMs: () => 0,
  };
}

async function executeValid(provider: CmipOpenAiProvider = new FakeCmipOpenAiProvider({ fixtures: ["valid"] })) {
  return executeCmipModelPackage({ modelPackage: buildPackage(), executionMode: "dry_run" }, deterministicOptions(provider));
}

test("1. valid fixture executes through fake provider", async () => {
  const result = await executeValid();
  assert.equal(result.ok, true);
  assert.equal(result.result.status, "success");
  assert.equal(result.result.trace.attempts.at(-1)?.providerStatus, "completed");
});

test("2. partial package fixture executes with fake provider", async () => {
  const pkg = buildPackage(partialFixture);
  const result = await executeCmipModelPackage({ modelPackage: pkg, executionMode: "dry_run" }, deterministicOptions());
  assert.equal(result.ok, true);
});

test("3. abstain fixture context can produce valid abstain output", async () => {
  const pkg = buildPackage(abstainFixture);
  const result = await executeCmipModelPackage({ modelPackage: pkg, executionMode: "dry_run" }, deterministicOptions(new FakeCmipOpenAiProvider({ fixtures: ["abstain"] })));
  assert.equal(result.ok, true);
  assert.equal(result.result.report?.cmip_report.decision.posture, "abstain");
  assert.equal(result.result.report?.cmip_report.decision.score, null);
});

test("4. invalid model package fails before provider call", async () => {
  const pkg = stableJsonClone(buildPackage()) as Record<string, unknown>;
  pkg.messages = [];
  const result = await executeCmipModelPackage({ modelPackage: pkg as CmipModelExecutionPackage, executionMode: "dry_run" }, deterministicOptions());
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, "MODEL_PACKAGE_INVALID");
});

test("5. package integrity mismatch fails before provider call", async () => {
  const pkg = stableJsonClone(buildPackage()) as CmipModelExecutionPackage & { messages: Array<{ content: string }> };
  pkg.messages[0].content = `${pkg.messages[0].content}\nchanged`;
  const result = await executeCmipModelPackage({ modelPackage: pkg, executionMode: "dry_run" }, deterministicOptions());
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, "MODEL_PACKAGE_INTEGRITY_INVALID");
});

test("6. missing OpenAI config fails live execution", async () => {
  const result = await executeCmipModelPackage({ modelPackage: buildPackage(), executionMode: "preview" }, { env: {}, now: () => "2026-07-10T07:00:00.000Z" });
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((error) => error.code === "OPENAI_CONFIG_MISSING"), true);
});

test("7. missing primary model fails live execution", async () => {
  const result = loadCmipOpenAiEnv({ OPENAI_API_KEY: "sk-test-placeholder-with-enough-length" });
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((error) => error.code === "MODEL_PROFILE_NOT_CONFIGURED"), true);
});

test("8. live smoke requires request and environment gates", async () => {
  const result = await executeCmipModelPackage(
    { modelPackage: buildPackage(), executionMode: "live_smoke", allowLiveOpenAiSmoke: false },
    { env: { OPENAI_API_KEY: "sk-test-placeholder-with-enough-length", CMIP_OPENAI_MODEL_PRIMARY: "gpt-5-test" }, now: () => "2026-07-10T07:00:00.000Z" },
  );
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, "OPENAI_LIVE_SMOKE_NOT_ALLOWED");
});

test("9. fake provider bypasses env secrets for dry run", async () => {
  const result = await executeCmipModelPackage({ modelPackage: buildPackage(), executionMode: "dry_run" }, deterministicOptions());
  assert.equal(result.ok, true);
});

test("10. message order remains Task 004 order in request mapping", () => {
  const mapped = mappedRequest();
  assert.deepEqual(mapped.body.input.map((message) => message.role), ["system", "developer", "developer", "user"]);
});

test("11. request uses Responses JSON schema format", () => {
  const mapped = mappedRequest();
  assert.equal(mapped.body.text.format.type, "json_schema");
  assert.equal(mapped.body.text.format.strict, true);
});

test("12. request uses store=false", () => {
  assert.equal(mappedRequest().body.store, false);
});

test("13. request disables truncation", () => {
  assert.equal(mappedRequest().body.truncation, "disabled");
});

test("14. request does not set previous_response_id", () => {
  assert.equal(Object.prototype.hasOwnProperty.call(mappedRequest().body, "previous_response_id"), false);
});

test("15. request metadata contains semantic hash", () => {
  const pkg = buildPackage();
  const mapped = mappedRequest(pkg);
  assert.equal(mapped.body.metadata.cmip_semantic_hash, pkg.integrity.semanticPackageHash);
});

test("16. canonical schema compatibility passes", () => {
  const result = createOpenAiProviderSchema(outputSchema as Record<string, unknown>);
  assert.equal(result.report.compatible, true);
});

test("17. provider schema strips root $schema", () => {
  const result = createOpenAiProviderSchema(outputSchema as Record<string, unknown>);
  assert.equal(Object.prototype.hasOwnProperty.call(result.schema, "$schema"), false);
});

test("18. provider schema strips root $id", () => {
  const result = createOpenAiProviderSchema(outputSchema as Record<string, unknown>);
  assert.equal(Object.prototype.hasOwnProperty.call(result.schema, "$id"), false);
});

test("19. unsupported provider schema keyword is rejected by audit", () => {
  const result = createOpenAiProviderSchema({ type: "object", patternProperties: { "^x": { type: "string" } } });
  assert.equal(result.report.compatible, false);
  assert.deepEqual(result.report.unsupportedKeywords, ["patternProperties"]);
});

test("20. schema compatibility report is versioned", () => {
  assert.equal(createOpenAiProviderSchema(outputSchema as Record<string, unknown>).report.compatibilityVersion, CMIP_OPENAI_SCHEMA_COMPATIBILITY_VERSION);
});

test("21. output schema hash matches canonical Task 001 schema", () => {
  assert.equal(createOpenAiProviderSchema(outputSchema as Record<string, unknown>).report.canonicalSchemaHash, hashCanonicalJson(outputSchema));
});

test("22. output schema mismatch blocks execution", async () => {
  const pkg = stableJsonClone(buildPackage()) as CmipModelExecutionPackage & { outputContract: { schema: Record<string, unknown> } };
  pkg.outputContract.schema = { ...pkg.outputContract.schema, title: "mutated" };
  const result = await executeCmipModelPackage({ modelPackage: pkg, executionMode: "dry_run" }, deterministicOptions());
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((error) => error.code === "MODEL_PACKAGE_INTEGRITY_INVALID" || error.code === "OUTPUT_SCHEMA_MISMATCH"), true);
});

test("23. web search uses no tools when package policy is disabled", () => {
  const mapped = mappedRequest();
  assert.equal(mapped.body.tool_choice, "none");
  assert.equal(mapped.body.tools, undefined);
});

test("24. enabled web search maps to current web_search tool type", () => {
  const result = mapCmipOpenAiTools({
    toolPolicy: { ...buildPackage().toolPolicy, webSearch: { ...buildPackage().toolPolicy.webSearch, mode: "context_only", maxSearchQueries: 2 } },
    enableWebSearch: true,
    capabilities: { structuredOutputs: true, reasoningEffort: true, webSearch: true, temperature: false },
  });
  assert.equal(result.toolChoice, "auto");
  assert.equal(result.tools[0].type, "web_search");
});

test("25. disabled env prevents web search even when policy allows it", () => {
  const result = mapCmipOpenAiTools({
    toolPolicy: { ...buildPackage().toolPolicy, webSearch: { ...buildPackage().toolPolicy.webSearch, mode: "context_only", maxSearchQueries: 2 } },
    enableWebSearch: false,
    capabilities: { structuredOutputs: true, reasoningEffort: true, webSearch: true, temperature: false },
  });
  assert.equal(result.toolChoice, "none");
  assert.equal(result.warnings[0].code, "OPENAI_WEB_SEARCH_DISABLED_BY_ENV");
});

test("26. unsupported model disables web search with warning", () => {
  const result = mapCmipOpenAiTools({
    toolPolicy: { ...buildPackage().toolPolicy, webSearch: { ...buildPackage().toolPolicy.webSearch, mode: "context_only", maxSearchQueries: 2 } },
    enableWebSearch: true,
    capabilities: { structuredOutputs: true, reasoningEffort: true, webSearch: false, temperature: false },
  });
  assert.equal(result.toolChoice, "none");
  assert.equal(result.warnings[0].code, "OPENAI_WEB_SEARCH_UNSUPPORTED_BY_MODEL");
});

test("27. model capability inference rejects embedding-style models for structured output", () => {
  assert.equal(inferModelCapabilities("text-embedding-3-large").structuredOutputs, false);
});

test("28. model capability inference recognizes reasoning-profile model", () => {
  assert.equal(inferModelCapabilities("gpt-5-test").reasoningEffort, true);
});

test("29. fake provider valid response parses to canonical report", async () => {
  const response = await new FakeCmipOpenAiProvider({ fixtures: ["valid"] }).execute(providerRequest());
  const parsed = parseCmipOpenAiResponse(response);
  assert.equal(parsed.errors.length, 0);
  assert.equal(validateCmipReport(parsed.report).valid, true);
});

test("30. fake provider abstain response parses to canonical report", async () => {
  const response = await new FakeCmipOpenAiProvider({ fixtures: ["abstain"] }).execute(providerRequest());
  const parsed = parseCmipOpenAiResponse(response);
  assert.equal(parsed.errors.length, 0);
  assert.equal(parsed.report?.cmip_report.decision.posture, "abstain");
});

test("31. refusal response fails without parsing JSON", async () => {
  const result = await executeValid(new FakeCmipOpenAiProvider({ fixtures: ["refusal"] }));
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, "MODEL_REFUSAL");
});

test("32. incomplete response is classified", async () => {
  const result = await executeValid(new FakeCmipOpenAiProvider({ fixtures: ["incomplete"] }));
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, "MODEL_RESPONSE_INCOMPLETE");
});

test("33. schema-invalid model output fails canonical validation", async () => {
  const result = await executeValid(new FakeCmipOpenAiProvider({ fixtures: ["schema_invalid"] }));
  assert.equal(result.ok, false);
  assert.equal(result.errors.some((error) => error.code === "SCHEMA_REPAIR_FAILED" || error.code === "MODEL_OUTPUT_SCHEMA_INVALID"), true);
});

test("34. invalid JSON output is rejected", () => {
  const parsed = parseCmipOpenAiResponse({
    ...providerResponseBase(),
    outputText: "{not json",
  });
  assert.equal(parsed.errors[0].code, "MODEL_OUTPUT_JSON_INVALID");
});

test("35. missing output text is rejected", () => {
  const parsed = parseCmipOpenAiResponse({ ...providerResponseBase(), outputText: null });
  assert.equal(parsed.errors[0].code, "MODEL_OUTPUT_MISSING");
});

test("36. secret-like output is detected", () => {
  assert.equal(outputContainsSecretLikeValue("Authorization: Bearer abc.def.ghi"), true);
});

test("37. numeric repair change is detected", () => {
  assert.equal(numericalValuesChanged({ a: { b: 1 } }, { a: { b: 2 } }), true);
});

test("38. identical numeric values do not block repair", () => {
  assert.equal(numericalValuesChanged({ a: { b: 1 } }, { a: { b: 1, c: 2 } }), false);
});

test("39. schema repair can succeed when original output has no numeric values", async () => {
  const provider = sequenceProvider([
    { ...providerResponseBase(), outputText: stableStringify({ cmip_report: {} }) },
    { ...providerResponseBase("resp_repair"), outputText: stableStringify(buildAbstainOutput()) },
  ]);
  const result = await executeValid(provider);
  assert.equal(result.ok, true);
  assert.equal(result.result.trace.repairAttempts, 1);
});

test("40. schema repair cannot silently alter numeric values", async () => {
  const result = await executeValid(new FakeCmipOpenAiProvider({ fixtures: ["schema_invalid", "valid"] }));
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, "SCHEMA_REPAIR_FAILED");
});

test("41. retryable transport error is retried", async () => {
  const result = await executeValid(new FakeCmipOpenAiProvider({ fixtures: ["network_error", "valid"] }));
  assert.equal(result.ok, true);
  assert.equal(result.result.trace.attempts.length, 2);
});

test("42. rate limit is retryable", () => {
  assert.equal(isCmipOpenAiRetryable("OPENAI_RATE_LIMITED"), true);
});

test("43. auth error is not retryable", () => {
  assert.equal(isCmipOpenAiRetryable("OPENAI_AUTH_ERROR"), false);
});

test("44. retry delay is deterministic", () => {
  assert.deepEqual([0, 1, 2].map(deterministicRetryDelayMs), [250, 500, 1000]);
});

test("45. execution result is schema-valid on success", async () => {
  const result = await executeValid();
  assert.equal(result.ok, true);
  assert.equal(validateCmipOpenAiExecutionResult(result.result).valid, true);
});

test("46. execution result schema rejects unknown field", async () => {
  const result = await executeValid();
  assert.equal(result.ok, true);
  const mutated = { ...result.result, unknown: true };
  assert.equal(validateCmipOpenAiExecutionResult(mutated).valid, false);
});

test("46a. execution result schema rejects provider statuses as canonical statuses", async () => {
  const result = await executeValid();
  assert.equal(result.ok, true);
  for (const status of ["completed", "cancelled", "queued", "in_progress"]) {
    const mutated = { ...result.result, status };
    assert.equal(validateCmipOpenAiExecutionResult(mutated).valid, false, status);
  }
});

test("47. successful execution includes canonical report", async () => {
  const result = await executeValid();
  assert.equal(result.ok, true);
  assert.notEqual(result.result.report, null);
});

test("48. non-success execution does not return a report", async () => {
  const result = await executeValid(new FakeCmipOpenAiProvider({ fixtures: ["refusal"] }));
  assert.equal(result.ok, false);
});

test("49. usage tokens are captured", async () => {
  const result = await executeValid();
  assert.equal(result.ok, true);
  assert.equal(result.result.usage?.totalTokens, 1400);
});

test("50. tool sources are captured when web search is mapped", async () => {
  const pkg = buildPackage();
  const mutable = stableJsonClone(pkg) as CmipModelExecutionPackage & { toolPolicy: { webSearch: { mode: "context_only"; maxSearchQueries: number } } };
  mutable.toolPolicy.webSearch.mode = "context_only";
  mutable.toolPolicy.webSearch.maxSearchQueries = 1;
  refreshPackageHashes(mutable);
  const result = await executeCmipModelPackage(
    { modelPackage: mutable, executionMode: "dry_run" },
    {
      ...deterministicOptions(new FakeCmipOpenAiProvider({ fixtures: ["valid"] })),
      env: {
        ...deterministicOptions().env,
        CMIP_OPENAI_ENABLE_WEB_SEARCH: "true",
      },
    },
  );
  assert.equal(result.ok, true);
  assert.equal(result.result.trace.toolSources.length, 1);
});

test("51. same input produces same request hash", async () => {
  const a = await executeValid();
  const b = await executeValid();
  assert.equal(a.ok && b.ok && a.result.integrity.requestHash === b.result.integrity.requestHash, true);
});

test("52. same input produces same canonical report hash", async () => {
  const a = await executeValid();
  const b = await executeValid();
  assert.equal(a.ok && b.ok && a.result.integrity.canonicalReportHash === b.result.integrity.canonicalReportHash, true);
});

test("53. meaningful package value change changes request hash", async () => {
  const pkg = buildPackage();
  const changed = stableJsonClone(pkg) as CmipModelExecutionPackage & { messages: Array<{ content: string; contentHash: string }> };
  changed.messages[3].content = changed.messages[3].content.replace("CMIP RUNTIME EXECUTION REQUEST", "CMIP RUNTIME EXECUTION REQUEST CHANGED");
  changed.messages[3].contentHash = sha256Hex(changed.messages[3].content);
  refreshPackageHashes(changed);
  const a = await executeCmipModelPackage({ modelPackage: pkg, executionMode: "dry_run" }, deterministicOptions());
  const b = await executeCmipModelPackage({ modelPackage: changed, executionMode: "dry_run" }, deterministicOptions());
  assert.equal(a.ok && b.ok && a.result.integrity.requestHash !== b.result.integrity.requestHash, true);
});

test("54. execution record is versioned", async () => {
  const result = await executeValid();
  assert.equal(result.ok, true);
  assert.equal(result.result.executionVersion, CMIP_OPENAI_EXECUTION_VERSION);
});

test("55. trace records adapter version", async () => {
  const result = await executeValid();
  assert.equal(result.ok, true);
  assert.equal(result.result.trace.adapterVersion, CMIP_OPENAI_ADAPTER_VERSION);
});

test("56. output schema remains strict in mapped request", () => {
  assert.equal(mappedRequest().body.text.format.strict, true);
});

test("57. mapped request preserves all four package messages", () => {
  assert.equal(mappedRequest().body.input.length, 4);
});

test("58. mapped request has no Chat Completions shape", () => {
  const body = mappedRequest().body as Record<string, unknown>;
  assert.equal(Object.prototype.hasOwnProperty.call(body, "messages"), false);
});

test("59. source does not call chat.completions", () => {
  const source = openAiSource();
  assert.doesNotMatch(source, /chat\.completions|ChatCompletion/);
});

test("60. source does not use LangChain", () => {
  const source = openAiSource();
  assert.doesNotMatch(source, /langchain/i);
});

test("61. source does not use raw fetch for OpenAI execution", () => {
  const source = openAiSource();
  assert.doesNotMatch(source, /\bfetch\s*\(/);
});

test("62. dry-run script uses fake provider", () => {
  const script = readFileSync(join(repoRoot, "scripts/cmip-openai-dry-run.ts"), "utf8");
  assert.match(script, /FakeCmipOpenAiProvider/);
});

test("63. live smoke script is explicitly gated", () => {
  const script = readFileSync(join(repoRoot, "scripts/cmip-openai-live-smoke.ts"), "utf8");
  assert.match(script, /CMIP_ALLOW_LIVE_OPENAI_SMOKE/);
});

test("64. env example has no NEXT_PUBLIC OpenAI secret", () => {
  const text = readFileSync(join(repoRoot, ".env.example"), "utf8");
  assert.doesNotMatch(text, /NEXT_PUBLIC_.*OPENAI/i);
});

test("65. env example includes model primary", () => {
  const text = readFileSync(join(repoRoot, ".env.example"), "utf8");
  assert.match(text, /CMIP_OPENAI_MODEL_PRIMARY=/);
});

test("66. official OpenAI SDK is installed", () => {
  const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as { dependencies?: Record<string, string> };
  assert.equal(typeof pkg.dependencies?.openai, "string");
});

test("67. server-only execution entry imports server-only", () => {
  const source = readFileSync(join(repoRoot, "src/lib/cmip/server/execute-model-package.ts"), "utf8");
  assert.match(source, /import "server-only"/);
});

test("68. admin preview route requires admin account", () => {
  const source = readFileSync(join(repoRoot, "src/app/api/admin/cmip/execution-preview/route.ts"), "utf8");
  assert.match(source, /requireAdminAccount/);
});

test("69. admin preview route declares node runtime", () => {
  const source = readFileSync(join(repoRoot, "src/app/api/admin/cmip/execution-preview/route.ts"), "utf8");
  assert.match(source, /runtime = "nodejs"/);
});

test("70. admin preview route does not accept arbitrary prompt text", () => {
  const source = readFileSync(join(repoRoot, "src/app/api/admin/cmip/execution-preview/route.ts"), "utf8");
  assert.doesNotMatch(source, /prompt|messages/i);
});

test("70a. admin preview route disables caching and bounds request body", () => {
  const source = readFileSync(join(repoRoot, "src/app/api/admin/cmip/execution-preview/route.ts"), "utf8");
  assert.match(source, /force-dynamic/);
  assert.match(source, /Cache-Control/);
  assert.match(source, /MAX_BODY_BYTES/);
});

test("70b. admin preview route does not expose a live execution switch", () => {
  const source = readFileSync(join(repoRoot, "src/app/api/admin/cmip/execution-preview/route.ts"), "utf8");
  assert.doesNotMatch(source, /liveSmoke|live_smoke|allowLiveOpenAiSmoke/);
});

test("71. OpenAI modules do not write files", () => {
  assert.doesNotMatch(openAiSource(), /writeFile|appendFile|createWriteStream/);
});

test("72. OpenAI modules do not read local persistence paths", () => {
  assert.doesNotMatch(openAiSource(), /sqlite|\.cache|\/tmp/);
});

test("73. OpenAI modules do not import Supabase", () => {
  assert.doesNotMatch(openAiSource(), /supabase/i);
});

test("74. OpenAI modules do not create cron configuration", () => {
  assert.doesNotMatch(openAiSource(), /vercel\.json|schedule|cron/i);
});

test("75. output contract includes abstain posture", () => {
  assert.match(JSON.stringify(mappedRequest().body.text.format.schema), /"abstain"/);
});

test("76. fake abstain output validates against Task 001", () => {
  assert.equal(validateCmipReport(buildAbstainOutput()).valid, true);
});

test("77. canonical Task 001 sample remains accepted by fake provider", async () => {
  const result = await executeValid();
  assert.equal(result.ok, true);
  assert.equal(result.result.report?.cmip_report.meta.report_id, "cmip-report-20260710-alpha-00000000-0000-4000-8000-000000000001");
});

test("78. provider response mapping counts web tool calls", async () => {
  const response = await new FakeCmipOpenAiProvider({ fixtures: ["valid"] }).execute({ ...providerRequest(), body: { ...providerRequest().body, tools: [{ type: "web_search", search_context_size: "low" }] } });
  assert.equal(response.toolCalls, 1);
});

test("79. deterministic warning order is stable", async () => {
  const a = await executeValid(new FakeCmipOpenAiProvider({ fixtures: ["network_error", "valid"] }));
  const b = await executeValid(new FakeCmipOpenAiProvider({ fixtures: ["network_error", "valid"] }));
  assert.deepEqual(a.warnings.map((warning) => warning.code), b.warnings.map((warning) => warning.code));
});

test("80. no duplicate warning identities are returned", async () => {
  const result = await executeValid(new FakeCmipOpenAiProvider({ fixtures: ["network_error", "valid"] }));
  const keys = result.warnings.map((warning) => `${warning.code}|${warning.path}|${warning.message}`);
  assert.equal(new Set(keys).size, keys.length);
});

function mappedRequest(pkg = buildPackage()) {
  const schema = createOpenAiProviderSchema(pkg.outputContract.schema);
  return mapCmipPackageToOpenAiResponseRequest({
    modelPackage: pkg,
    config: {
      apiKey: "[test]",
      organizationId: null,
      projectId: null,
      modelPrimary: "gpt-5-cmip-test",
      modelFallback: "gpt-5-cmip-test-fallback",
      modelRepair: "gpt-5-cmip-test-repair",
      enableWebSearch: false,
      maxOutputTokens: 8000,
      timeoutMs: 240000,
      maxAttempts: 2,
      reasoningEffort: "high",
      serviceTier: "auto",
      allowLiveSmoke: false,
    },
    model: {
      profile: "cmip_primary_reasoning",
      model: "gpt-5-cmip-test",
      capabilities: inferModelCapabilities("gpt-5-cmip-test"),
    },
    providerSchema: schema.schema,
    schemaCompatibility: schema.report,
  });
}

function providerRequest(): CmipOpenAiProviderExecutionRequest {
  return {
    body: mappedRequest().body,
    timeoutMs: 240000,
    attemptIndex: 0,
    executionId: "cmip-test-exec",
  };
}

function providerResponseBase(responseId = "resp_fixture"): CmipOpenAiProviderExecutionResponse {
  return {
    responseId,
    status: "completed",
    model: "gpt-5-cmip-test",
    serviceTier: "auto",
    outputText: null,
    refusal: null,
    incompleteDetails: null,
    error: null,
    usage: null,
    toolCalls: 0,
    toolSources: [],
  };
}

function sequenceProvider(responses: readonly CmipOpenAiProviderExecutionResponse[]): CmipOpenAiProvider {
  let index = 0;
  return {
    providerName: "sequence_fake_provider",
    async execute() {
      const response = responses[Math.min(index, responses.length - 1)];
      index += 1;
      return response;
    },
  };
}

function openAiSource(): string {
  const files = [
    "src/lib/cmip/openai/client.ts",
    "src/lib/cmip/openai/execute-model-package.ts",
    "src/lib/cmip/openai/provider/openai-provider.ts",
    "src/lib/cmip/openai/request-mapper.ts",
    "src/lib/cmip/openai/tool-mapper.ts",
  ];
  return files.map((file) => readFileSync(join(repoRoot, file), "utf8")).join("\n");
}

function refreshPackageHashes(pkg: CmipModelExecutionPackage & { integrity: Record<string, string>; messages?: Array<{ content: string; contentHash: string }> }) {
  if (pkg.messages) {
    for (const message of pkg.messages) message.contentHash = sha256Text(message.content);
  }
  pkg.integrity.systemInstructionsHash = pkg.messages?.[0]?.contentHash ?? pkg.integrity.systemInstructionsHash;
  pkg.integrity.intelligenceContextHash = pkg.messages?.[1]?.contentHash ?? pkg.integrity.intelligenceContextHash;
  pkg.integrity.runtimeContextHash = runtimeContextHash(pkg.messages?.[3]?.content ?? "");
  pkg.integrity.outputSchemaHash = hashCanonicalJson(pkg.outputContract.schema);
  pkg.integrity.semanticPackageHash = semanticPackageHash(pkg);
  pkg.integrity.fullPackageHash = pkg.integrity.semanticPackageHash;
  const { integrity: _integrity, ...withoutIntegrity } = pkg;
  pkg.integrity.instancePackageHash = hashCanonicalJson(withoutIntegrity);
}

function sha256Text(value: string): string {
  return sha256Hex(value);
}

function runtimeContextHash(content: string): string {
  const start = content.indexOf("<CMIP_RUNTIME_CONTEXT>");
  const end = content.indexOf("</CMIP_RUNTIME_CONTEXT>");
  if (start === -1 || end === -1) return "";
  return hashCanonicalJson(JSON.parse(content.slice(start + "<CMIP_RUNTIME_CONTEXT>".length, end).trim()));
}

function semanticPackageHash(pkg: CmipModelExecutionPackage): string {
  return hashCanonicalJson({
    packageVersion: pkg.packageVersion,
    executionId: pkg.executionId,
    versions: pkg.versions,
    messages: pkg.messages,
    outputContract: pkg.outputContract,
    toolPolicy: pkg.toolPolicy,
    executionConfig: pkg.executionConfig,
    contextBudget: pkg.contextBudget,
    trace: {
      ...pkg.trace,
      buildStartedAt: "[semantic-hash-excluded]",
      buildCompletedAt: "[semantic-hash-excluded]",
    },
  });
}
