import assert from "node:assert/strict";
import { test } from "node:test";
import validFixture from "../src/lib/cmip/model-package/fixtures/package-input-valid.json";
import { buildCmipModelExecutionPackage } from "../src/lib/cmip/model-package/build-model-package";
import type { CmipModelPackageBuildRequest } from "../src/lib/cmip/model-package/types";
import { executeCmipProviderPackage } from "../src/lib/cmip/providers/provider-router";
import { parseProvider, resolveCmipProviderSelection } from "../src/lib/cmip/providers/provider-registry";
import type { CmipProviderExecutor, CmipProviderId, CmipProviderNeutralExecutionResult } from "../src/lib/cmip/providers/types";

function buildPackage() {
  const result = buildCmipModelExecutionPackage(validFixture as unknown as CmipModelPackageBuildRequest);
  assert.equal(result.ok, true);
  return result.package;
}

function neutral(providerId: CmipProviderId, status: CmipProviderNeutralExecutionResult["status"] = "success", retryable = false): CmipProviderNeutralExecutionResult {
  const pkg = buildPackage();
  return {
    executionVersion: "CMIP-PROVIDER-EXECUTION-1.0",
    executionId: pkg.executionId,
    packageId: pkg.packageId,
    semanticPackageHash: pkg.integrity.semanticPackageHash,
    providerId,
    providerExecutionVersion: `${providerId}-test`,
    status,
    report: status === "success" ? {} as never : null,
    provider: { name: providerId, responseId: `${providerId}-response`, model: `${providerId}-model`, rawStatus: status === "success" ? "completed" : "failed", serviceTier: null },
    usage: { inputTokens: null, cachedInputTokens: null, outputTokens: null, reasoningTokens: null, totalTokens: null },
    timing: { startedAt: "2026-07-10T07:00:00.000Z", completedAt: "2026-07-10T07:00:00.000Z", durationMs: 0 },
    validation: { providerSchemaCompatible: true, jsonParsed: status === "success", canonicalValid: status === "success", repairAttempted: false, repairSucceeded: false },
    attempts: [],
    warnings: [],
    errors: status === "success" ? [] : [{ code: retryable ? "GEMINI_TRANSPORT_ERROR" : "GEMINI_CANONICAL_OUTPUT_INVALID", path: "$.provider", message: "fixture failure", domain: providerId, severity: "error", retryable, sourceRefs: [] }],
    trace: { routerVersion: "CMIP-PROVIDER-ROUTER-1.0", selectedProvider: providerId, fallbackProvider: null, fallbackPolicy: "disabled", fallbackDecisions: [], providerTrace: null },
  };
}

function executor(providerId: CmipProviderId, status: CmipProviderNeutralExecutionResult["status"] = "success", retryable = false, calls?: { count: number }): CmipProviderExecutor {
  return {
    execute: async () => {
      if (calls) calls.count += 1;
      return neutral(providerId, status, retryable);
    },
  };
}

test("1. Gemini primary resolves correctly", async () => {
  const result = await executeCmipProviderPackage({ modelPackage: buildPackage(), executionMode: "dry_run", selection: { primary: "gemini", fallback: null, fallbackPolicy: "disabled" } }, { gemini: executor("gemini") });
  assert.equal(result.providerId, "gemini");
});

test("2. OpenAI primary remains functional", async () => {
  const result = await executeCmipProviderPackage({ modelPackage: buildPackage(), executionMode: "dry_run", selection: { primary: "openai", fallback: null, fallbackPolicy: "disabled" } }, { openai: executor("openai") });
  assert.equal(result.providerId, "openai");
});

test("3. unsupported provider fails", async () => {
  const result = await executeCmipProviderPackage({ modelPackage: buildPackage(), executionMode: "dry_run", selection: { primary: "anthropic" as never, fallback: null, fallbackPolicy: "disabled" } });
  assert.equal(result.status, "failed");
});

test("4. fallback disabled prevents switching", async () => {
  const fallbackCalls = { count: 0 };
  const result = await executeCmipProviderPackage(
    { modelPackage: buildPackage(), executionMode: "dry_run", selection: { primary: "gemini", fallback: "openai", fallbackPolicy: "disabled" } },
    { gemini: executor("gemini", "failed", true), openai: executor("openai", "success", false, fallbackCalls) },
  );
  assert.equal(result.providerId, "gemini");
  assert.equal(fallbackCalls.count, 0);
});

test("5. explicit fallback policy permits approved failure class", async () => {
  const fallbackCalls = { count: 0 };
  const result = await executeCmipProviderPackage(
    { modelPackage: buildPackage(), executionMode: "dry_run", selection: { primary: "gemini", fallback: "openai", fallbackPolicy: "explicit_manual" } },
    { gemini: executor("gemini", "failed", false), openai: executor("openai", "success", false, fallbackCalls) },
  );
  assert.equal(result.providerId, "openai");
  assert.equal(fallbackCalls.count, 1);
});

test("6. retryable transport fallback policy permits retryable failure", async () => {
  const result = await executeCmipProviderPackage(
    { modelPackage: buildPackage(), executionMode: "dry_run", selection: { primary: "gemini", fallback: "openai", fallbackPolicy: "retryable_transport_only" } },
    { gemini: executor("gemini", "failed", true), openai: executor("openai") },
  );
  assert.equal(result.providerId, "openai");
});

test("7. provider-unavailable fallback policy rejects output-quality failure", async () => {
  const result = await executeCmipProviderPackage(
    { modelPackage: buildPackage(), executionMode: "dry_run", selection: { primary: "gemini", fallback: "openai", fallbackPolicy: "provider_unavailable" } },
    { gemini: executor("gemini", "failed", false), openai: executor("openai") },
  );
  assert.equal(result.providerId, "gemini");
});

test("8. no fallback loop occurs", async () => {
  const result = await executeCmipProviderPackage(
    { modelPackage: buildPackage(), executionMode: "dry_run", selection: { primary: "gemini", fallback: "gemini", fallbackPolicy: "explicit_manual" } },
    { gemini: executor("gemini", "failed", true) },
  );
  assert.equal(result.trace.fallbackDecisions.at(-1)?.allowed, false);
});

test("9. provider selection is recorded in trace", async () => {
  const result = await executeCmipProviderPackage({ modelPackage: buildPackage(), executionMode: "dry_run", selection: { primary: "gemini", fallback: "openai", fallbackPolicy: "disabled" } }, { gemini: executor("gemini") });
  assert.equal(result.trace.selectedProvider, "gemini");
});

test("10. runtime context cannot change provider", async () => {
  const pkg = buildPackage();
  const result = await executeCmipProviderPackage({ modelPackage: pkg, executionMode: "dry_run", selection: { primary: "gemini", fallback: null, fallbackPolicy: "disabled" } }, { gemini: executor("gemini"), openai: executor("openai") });
  assert.equal(result.providerId, "gemini");
});

test("11. provider env parser accepts openai", () => {
  assert.equal(parseProvider("openai"), "openai");
});

test("12. provider env parser accepts gemini", () => {
  assert.equal(parseProvider("gemini"), "gemini");
});

test("13. provider env parser rejects unsupported providers", () => {
  assert.equal(parseProvider("anthropic"), null);
});

test("14. provider selection defaults safely", () => {
  assert.equal(resolveCmipProviderSelection({}).primary, "openai");
});

test("15. provider selection reads primary from env", () => {
  assert.equal(resolveCmipProviderSelection({ CMIP_PROVIDER_PRIMARY: "gemini" }).primary, "gemini");
});

test("16. provider fallback cannot equal primary", () => {
  assert.equal(resolveCmipProviderSelection({ CMIP_PROVIDER_PRIMARY: "gemini", CMIP_PROVIDER_FALLBACK: "gemini" }).fallback, null);
});
