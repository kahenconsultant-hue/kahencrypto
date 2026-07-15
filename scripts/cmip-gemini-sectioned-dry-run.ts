import fixture from "../src/lib/cmip/model-package/fixtures/package-input-valid.json";
import { buildCmipModelExecutionPackage } from "../src/lib/cmip/model-package/build-model-package";
import type { CmipModelPackageBuildRequest } from "../src/lib/cmip/model-package/types";
import { createFakeGeminiSectionProvider } from "../src/lib/cmip/gemini-sectioned/section-executor";
import { executeCmipGeminiSectionedModelPackageSummary } from "../src/lib/cmip/gemini-sectioned/execute-sectioned-package";

void main();

async function main() {
  const packageResult = buildCmipModelExecutionPackage(fixture as unknown as CmipModelPackageBuildRequest);
  if (!packageResult.ok) {
    console.error("CMIP GEMINI SECTIONED DRY RUN INVALID");
    for (const error of packageResult.errors) console.error(`${error.code} ${error.path}: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  const summary = await executeCmipGeminiSectionedModelPackageSummary(
    {
      modelPackage: packageResult.package,
      taskType: "full_report_experimental",
      executionMode: "dry_run",
    },
    {
      provider: createFakeGeminiSectionProvider(),
      env: {
        CMIP_GEMINI_MODEL_PRIMARY: "gemini-cmip-sectioned-dry-run",
        CMIP_GEMINI_MAX_OUTPUT_TOKENS: "12000",
        CMIP_GEMINI_TIMEOUT_MS: "240000",
        CMIP_GEMINI_ENABLE_GOOGLE_SEARCH: "false",
      },
    },
  );

  const result = summary.result;
  if (result.status !== "success" || !result.validation.canonicalValid) {
    console.error("CMIP GEMINI SECTIONED DRY RUN INVALID");
    for (const error of result.errors) console.error(`${error.code} ${error.path}: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  const trace = result.trace.providerTrace as { requestCount?: number } | null;
  const tenAssetsValid = result.report?.cmip_report.coins.length === 10;
  console.log("CMIP GEMINI SECTIONED DRY RUN VALID");
  console.log(`CMIP SECTION COUNT: ${summary.sections.length}`);
  console.log(`CMIP PROVIDER REQUEST COUNT: ${trace?.requestCount ?? result.attempts.length}`);
  console.log(`CMIP FINAL TASK 001 VALID: ${result.validation.canonicalValid}`);
  console.log(`CMIP TEN ASSETS VALID: ${tenAssetsValid}`);
  console.log(`CMIP WARNINGS: ${result.warnings.length}`);
}
