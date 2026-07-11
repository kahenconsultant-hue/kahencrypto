import fixture from "../src/lib/cmip/model-package/fixtures/package-input-valid.json";
import { buildCmipModelExecutionPackage } from "../src/lib/cmip/model-package/build-model-package";
import type { CmipModelPackageBuildRequest } from "../src/lib/cmip/model-package/types";
import { executeCmipProviderPackage } from "../src/lib/cmip/providers/provider-router";
import { executeCmipModelPackage } from "../src/lib/cmip/openai/execute-model-package";
import { FakeCmipOpenAiProvider } from "../src/lib/cmip/openai/provider/fake-provider";
import type { CmipOpenAiExecutionRecord } from "../src/lib/cmip/openai/types";
import { executeCmipGeminiModelPackage } from "../src/lib/cmip/gemini/execute-model-package";
import { FakeCmipGeminiProvider } from "../src/lib/cmip/gemini/provider/fake-gemini-provider";
import type { CmipProviderExecutor, CmipProviderNeutralExecutionResult } from "../src/lib/cmip/providers/types";

void main();

async function main() {
  const packageResult = buildCmipModelExecutionPackage(fixture as unknown as CmipModelPackageBuildRequest);
  if (!packageResult.ok) {
    console.error("CMIP PROVIDER COMPARISON DRY RUN INVALID");
    for (const error of packageResult.errors) console.error(`${error.code} ${error.path}: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  const openaiExecutor: CmipProviderExecutor = {
    execute: async (request) => {
      const result = await executeCmipModelPackage(
        { modelPackage: request.modelPackage, executionMode: "dry_run" },
        { provider: new FakeCmipOpenAiProvider({ fixtures: ["valid"] }), env: { CMIP_OPENAI_MODEL_PRIMARY: "gpt-5-cmip-dry-run" } },
      );
      if (!result.ok) throw new Error("Fake OpenAI comparison failed.");
      return mapOpenAiDryRun(result.result);
    },
  };
  const geminiExecutor: CmipProviderExecutor = {
    execute: async (request) => {
      const result = await executeCmipGeminiModelPackage(
        { modelPackage: request.modelPackage, executionMode: "dry_run" },
        { provider: new FakeCmipGeminiProvider({ fixtures: ["valid"] }), env: { CMIP_GEMINI_MODEL_PRIMARY: "gemini-cmip-dry-run" } },
      );
      if (result.status !== "success") throw new Error("Fake Gemini comparison failed.");
      return result;
    },
  };

  const pkg = packageResult.package;
  const openai = await executeCmipProviderPackage({ modelPackage: pkg, executionMode: "dry_run", selection: { primary: "openai", fallback: null, fallbackPolicy: "disabled" } }, { openai: openaiExecutor, gemini: geminiExecutor });
  const gemini = await executeCmipProviderPackage({ modelPackage: pkg, executionMode: "dry_run", selection: { primary: "gemini", fallback: null, fallbackPolicy: "disabled" } }, { openai: openaiExecutor, gemini: geminiExecutor });

  if (openai.status !== "success" || gemini.status !== "success" || !openai.validation.canonicalValid || !gemini.validation.canonicalValid) {
    console.error("CMIP PROVIDER COMPARISON DRY RUN INVALID");
    process.exitCode = 1;
    return;
  }

  console.log("CMIP PROVIDER COMPARISON DRY RUN VALID");
  console.log(`OPENAI STATUS: ${openai.status}`);
  console.log(`GEMINI STATUS: ${gemini.status}`);
  console.log(`OPENAI CANONICAL VALID: ${openai.validation.canonicalValid}`);
  console.log(`GEMINI CANONICAL VALID: ${gemini.validation.canonicalValid}`);
  console.log(`PACKAGE SEMANTIC HASH MATCH: ${String(openai.semanticPackageHash === gemini.semanticPackageHash)}`);
}

function mapOpenAiDryRun(record: CmipOpenAiExecutionRecord): CmipProviderNeutralExecutionResult {
  return {
    executionVersion: "CMIP-PROVIDER-EXECUTION-1.0",
    executionId: record.executionId,
    packageId: record.packageId,
    semanticPackageHash: record.packageSemanticHash,
    providerId: "openai",
    providerExecutionVersion: record.executionVersion,
    status: record.status,
    report: record.report,
    provider: { name: "openai", responseId: record.responseId, model: record.model, rawStatus: record.trace.attempts.at(-1)?.providerStatus ?? null, serviceTier: record.serviceTier },
    usage: record.usage ?? { inputTokens: null, cachedInputTokens: null, outputTokens: null, reasoningTokens: null, totalTokens: null },
    timing: { startedAt: record.trace.startedAt, completedAt: record.trace.completedAt, durationMs: Math.max(0, Date.parse(record.trace.completedAt) - Date.parse(record.trace.startedAt)) },
    validation: { providerSchemaCompatible: true, jsonParsed: true, canonicalValid: record.canonicalValid, repairAttempted: false, repairSucceeded: false },
    attempts: [],
    warnings: [],
    errors: [],
    trace: { routerVersion: "CMIP-PROVIDER-ROUTER-1.0", selectedProvider: "openai", fallbackProvider: null, fallbackPolicy: "disabled", fallbackDecisions: [], providerTrace: record.trace },
  };
}
