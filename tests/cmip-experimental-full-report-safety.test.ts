import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import validFixture from "../src/lib/cmip/model-package/fixtures/package-input-valid.json";
import { buildCmipModelExecutionPackage } from "../src/lib/cmip/model-package/build-model-package";
import type { CmipModelExecutionPackage, CmipModelPackageBuildRequest } from "../src/lib/cmip/model-package/types";
import {
  CMIP_EXPERIMENTAL_FULL_REPORT_AI_ENV_KEY,
  CMIP_PROVIDER_EXECUTION_TASK_TYPES,
  isCmipExperimentalFullReportAiEnabled,
  resolveCmipExperimentalFullReportAiGate,
} from "../src/lib/cmip/experimental-full-report-ai";
import { executeCmipModelPackage } from "../src/lib/cmip/openai/execute-model-package";
import { FakeCmipOpenAiProvider } from "../src/lib/cmip/openai/provider/fake-provider";
import type { CmipOpenAiProvider, CmipOpenAiProviderExecutionRequest, CmipOpenAiProviderExecutionResponse } from "../src/lib/cmip/openai/types";
import { executeCmipGeminiModelPackage } from "../src/lib/cmip/gemini/execute-model-package";
import { FakeCmipGeminiProvider } from "../src/lib/cmip/gemini/provider/fake-gemini-provider";
import type { CmipGeminiProvider, CmipGeminiProviderExecutionRequest, CmipGeminiProviderExecutionResponse } from "../src/lib/cmip/gemini/types";
import { executeCmipGeminiSectionedModelPackageSummary } from "../src/lib/cmip/gemini-sectioned/execute-sectioned-package";
import { createFakeGeminiSectionProvider } from "../src/lib/cmip/gemini-sectioned/section-executor";
import { executeCmipProviderPackage } from "../src/lib/cmip/providers/provider-router";
import type { CmipProviderExecutor, CmipProviderId, CmipProviderNeutralExecutionResult } from "../src/lib/cmip/providers/types";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

function buildPackage(): CmipModelExecutionPackage {
  const result = buildCmipModelExecutionPackage(validFixture as unknown as CmipModelPackageBuildRequest);
  assert.equal(result.ok, true);
  return result.package;
}

function disabledEnv(extra: Partial<Record<string, string>> = {}) {
  return {
    CMIP_OPENAI_MODEL_PRIMARY: "gpt-5-cmip-test",
    CMIP_GEMINI_MODEL_PRIMARY: "gemini-cmip-test",
    CMIP_GEMINI_ENABLE_GOOGLE_SEARCH: "false",
    ...extra,
  };
}

function providerNeutral(providerId: CmipProviderId): CmipProviderNeutralExecutionResult {
  const pkg = buildPackage();
  return {
    executionVersion: "CMIP-PROVIDER-EXECUTION-1.0",
    executionId: pkg.executionId,
    packageId: pkg.packageId,
    semanticPackageHash: pkg.integrity.semanticPackageHash,
    providerId,
    providerExecutionVersion: `${providerId}-test`,
    status: "success",
    report: {} as never,
    provider: { name: providerId, responseId: `${providerId}-fake`, model: `${providerId}-model`, rawStatus: "completed", serviceTier: null },
    usage: { inputTokens: null, cachedInputTokens: null, outputTokens: null, reasoningTokens: null, totalTokens: null },
    timing: { startedAt: "2026-07-10T07:00:00.000Z", completedAt: "2026-07-10T07:00:00.000Z", durationMs: 0 },
    validation: { providerSchemaCompatible: true, jsonParsed: true, canonicalValid: true, repairAttempted: false, repairSucceeded: false },
    attempts: [],
    warnings: [],
    errors: [],
    trace: { routerVersion: "CMIP-PROVIDER-ROUTER-1.0", selectedProvider: providerId, fallbackProvider: null, fallbackPolicy: "disabled", fallbackDecisions: [], providerTrace: null },
  };
}

function countingExecutor(providerId: CmipProviderId, calls: { count: number }): CmipProviderExecutor {
  return {
    execute: async () => {
      calls.count += 1;
      return providerNeutral(providerId);
    },
  };
}

function throwingOpenAiProvider(calls: { count: number }): CmipOpenAiProvider {
  return {
    providerName: "counting_openai_provider",
    execute: async (_request: CmipOpenAiProviderExecutionRequest): Promise<CmipOpenAiProviderExecutionResponse> => {
      calls.count += 1;
      throw new Error("OpenAI provider must not be called while experimental full-report AI is disabled.");
    },
  };
}

function throwingGeminiProvider(calls: { count: number }): CmipGeminiProvider {
  return {
    providerName: "counting_gemini_provider",
    execute: async (_request: CmipGeminiProviderExecutionRequest): Promise<CmipGeminiProviderExecutionResponse> => {
      calls.count += 1;
      throw new Error("Gemini provider must not be called while experimental full-report AI is disabled.");
    },
  };
}

function source(path: string): string {
  return readFileSync(join(repoRoot, path), "utf8");
}

function walkFiles(dir: string): readonly string[] {
  const root = join(repoRoot, dir);
  const files: string[] = [];
  const walk = (current: string) => {
    for (const entry of readdirSync(current)) {
      const full = join(current, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(ts|tsx|js|mjs)$/.test(entry)) files.push(full);
    }
  };
  walk(root);
  return files;
}

test("experimental full-report gate defaults to false and accepts only exact true", () => {
  assert.equal(CMIP_EXPERIMENTAL_FULL_REPORT_AI_ENV_KEY, "CMIP_ENABLE_EXPERIMENTAL_FULL_REPORT_AI");
  assert.equal(resolveCmipExperimentalFullReportAiGate({}).enabled, false);
  assert.equal(isCmipExperimentalFullReportAiEnabled({}), false);
  for (const value of ["", "TRUE", "1", "yes", "false", " true "]) {
    assert.equal(isCmipExperimentalFullReportAiEnabled({ CMIP_ENABLE_EXPERIMENTAL_FULL_REPORT_AI: value }), false, value);
  }
  assert.equal(isCmipExperimentalFullReportAiEnabled({ CMIP_ENABLE_EXPERIMENTAL_FULL_REPORT_AI: "true" }), true);
});

test("provider-neutral task types are explicit and reserve explanation_only", () => {
  assert.deepEqual(CMIP_PROVIDER_EXECUTION_TASK_TYPES, ["full_report_experimental", "explanation_only"]);
});

test("OpenAI full-report execution is blocked when the experimental gate is false", async () => {
  const calls = { count: 0 };
  const result = await executeCmipModelPackage(
    { modelPackage: buildPackage(), taskType: "full_report_experimental", executionMode: "preview" },
    { provider: throwingOpenAiProvider(calls), env: disabledEnv(), now: () => "2026-07-10T07:00:00.000Z" },
  );
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, "CMIP_EXPERIMENTAL_FULL_REPORT_AI_DISABLED");
  assert.equal(calls.count, 0);
});

test("Gemini single-call full-report execution is blocked when the experimental gate is false", async () => {
  const calls = { count: 0 };
  const result = await executeCmipGeminiModelPackage(
    { modelPackage: buildPackage(), taskType: "full_report_experimental", executionMode: "preview" },
    { provider: throwingGeminiProvider(calls), env: disabledEnv(), now: () => "2026-07-10T07:00:00.000Z" },
  );
  assert.equal(result.status, "failed");
  assert.equal(result.errors[0].code, "CMIP_EXPERIMENTAL_FULL_REPORT_AI_DISABLED");
  assert.equal(calls.count, 0);
});

test("Gemini sectioned full-report execution is blocked when the experimental gate is false", async () => {
  const calls = { count: 0 };
  const summary = await executeCmipGeminiSectionedModelPackageSummary(
    { modelPackage: buildPackage(), taskType: "full_report_experimental", executionMode: "preview" },
    { provider: throwingGeminiProvider(calls), env: disabledEnv(), now: () => "2026-07-10T07:00:00.000Z" },
  );
  assert.equal(summary.result.status, "failed");
  assert.equal(summary.result.errors[0].code, "CMIP_EXPERIMENTAL_FULL_REPORT_AI_DISABLED");
  assert.equal(summary.result.attempts.length, 0);
  assert.equal(calls.count, 0);
});

test("provider router blocks full-report execution and fallback before any provider call when the gate is false", async () => {
  const primaryCalls = { count: 0 };
  const fallbackCalls = { count: 0 };
  const result = await executeCmipProviderPackage(
    {
      modelPackage: buildPackage(),
      taskType: "full_report_experimental",
      executionMode: "preview",
      selection: { primary: "gemini", fallback: "openai", fallbackPolicy: "explicit_manual" },
    },
    { gemini: countingExecutor("gemini", primaryCalls), openai: countingExecutor("openai", fallbackCalls), env: disabledEnv(), now: () => "2026-07-10T07:00:00.000Z" },
  );
  assert.equal(result.status, "failed");
  assert.equal(result.errors[0].code, "CMIP_EXPERIMENTAL_FULL_REPORT_AI_DISABLED");
  assert.equal(primaryCalls.count, 0);
  assert.equal(fallbackCalls.count, 0);
  assert.equal(result.trace.fallbackDecisions.length, 0);
});

test("full-report adapters reject explanation_only without provider execution", async () => {
  const calls = { count: 0 };
  const result = await executeCmipModelPackage(
    { modelPackage: buildPackage(), taskType: "explanation_only", executionMode: "preview" },
    { provider: throwingOpenAiProvider(calls), env: { ...disabledEnv(), CMIP_ENABLE_EXPERIMENTAL_FULL_REPORT_AI: "true" }, now: () => "2026-07-10T07:00:00.000Z" },
  );
  assert.equal(result.ok, false);
  assert.equal(result.errors[0].code, "CMIP_FULL_REPORT_TASK_TYPE_UNSUPPORTED");
  assert.equal(calls.count, 0);
});

test("fake-provider dry runs remain available while the gate is false", async () => {
  const openai = await executeCmipModelPackage(
    { modelPackage: buildPackage(), taskType: "full_report_experimental", executionMode: "dry_run" },
    { provider: new FakeCmipOpenAiProvider({ fixtures: ["valid"] }), env: disabledEnv(), now: () => "2026-07-10T07:00:00.000Z" },
  );
  assert.equal(openai.ok, true);

  const gemini = await executeCmipGeminiModelPackage(
    { modelPackage: buildPackage(), taskType: "full_report_experimental", executionMode: "dry_run" },
    { provider: new FakeCmipGeminiProvider({ fixtures: ["valid"] }), env: disabledEnv(), now: () => "2026-07-10T07:00:00.000Z" },
  );
  assert.equal(gemini.status, "success");

  const sectioned = await executeCmipGeminiSectionedModelPackageSummary(
    { modelPackage: buildPackage(), taskType: "full_report_experimental", executionMode: "dry_run" },
    { provider: createFakeGeminiSectionProvider(), env: disabledEnv(), now: () => "2026-07-10T07:00:00.000Z" },
  );
  assert.equal(sectioned.result.status, "success");
});

test("admin preview route is admin-only and cannot enable the experimental gate from the request", () => {
  const route = source("src/app/api/admin/cmip/execution-preview/route.ts");
  assert.match(route, /requireAdminAccount\(\)/);
  assert.ok(route.indexOf("requireAdminAccount()") < route.indexOf("isCmipExperimentalFullReportAiEnabled()"));
  assert.match(route, /REQUEST_TOO_LARGE/);
  assert.match(route, /Cache-Control/);
  assert.doesNotMatch(route, /searchParams|nextUrl/);
  const parseBodySource = route.slice(route.indexOf("function parsePreviewBody"));
  assert.doesNotMatch(parseBodySource, /CMIP_ENABLE_EXPERIMENTAL_FULL_REPORT_AI/);
  assert.match(route, /key !== "fixture" && key !== "provider"/);
});

test("client code cannot import the server experimental full-report gate", () => {
  const clientImporters = walkFiles("src").filter((file) => {
    const body = readFileSync(file, "utf8");
    return body.includes('"use client"') && body.includes("experimental-full-report-ai");
  });
  assert.deepEqual(clientImporters, []);
  assert.match(source("src/lib/cmip/server/experimental-full-report-ai.ts"), /import "server-only"/);
});

test("live-smoke scripts remain manually gated and do not bypass experimental full-report isolation", () => {
  assert.match(source("scripts/cmip-openai-live-smoke.ts"), /CMIP_ALLOW_LIVE_OPENAI_SMOKE/);
  assert.match(source("scripts/cmip-gemini-live-smoke.ts"), /CMIP_ALLOW_LIVE_GEMINI_SMOKE/);
  assert.match(source("scripts/cmip-gemini-sectioned-live-smoke.ts"), /CMIP_ALLOW_LIVE_GEMINI_SECTIONED_SMOKE/);
  assert.match(source("src/lib/cmip/openai/execute-model-package.ts"), /CMIP_EXPERIMENTAL_FULL_REPORT_AI_DISABLED/);
  assert.match(source("src/lib/cmip/gemini/execute-model-package.ts"), /CMIP_EXPERIMENTAL_FULL_REPORT_AI_DISABLED/);
  assert.match(source("src/lib/cmip/gemini-sectioned/execute-sectioned-package.ts"), /CMIP_EXPERIMENTAL_FULL_REPORT_AI_DISABLED/);
});
