import fixture from "../src/lib/cmip/model-package/fixtures/package-input-valid.json";
import { buildCmipModelExecutionPackage } from "../src/lib/cmip/model-package/build-model-package";
import type { CmipModelPackageBuildRequest } from "../src/lib/cmip/model-package/types";
import { executeCmipGeminiSectionedModelPackageSummary } from "../src/lib/cmip/gemini-sectioned/execute-sectioned-package";
import { formatCmipGeminiSectionedLiveSmokeSummary } from "../src/lib/cmip/gemini-sectioned/live-smoke-summary";

void main();

async function main() {
  if (process.env.CMIP_ALLOW_LIVE_GEMINI_SECTIONED_SMOKE !== "true") {
    console.error("CMIP GEMINI SECTIONED LIVE SMOKE BLOCKED");
    console.error("Set CMIP_ALLOW_LIVE_GEMINI_SECTIONED_SMOKE=true to run the gated sectioned live smoke test.");
    process.exitCode = 1;
    return;
  }
  if (!process.env.GEMINI_API_KEY?.trim()) {
    console.error("CMIP GEMINI SECTIONED LIVE SMOKE BLOCKED");
    console.error("GEMINI_API_KEY is required.");
    process.exitCode = 1;
    return;
  }
  if (!process.env.CMIP_GEMINI_MODEL_PRIMARY?.trim()) {
    console.error("CMIP GEMINI SECTIONED LIVE SMOKE BLOCKED");
    console.error("CMIP_GEMINI_MODEL_PRIMARY is required.");
    process.exitCode = 1;
    return;
  }

  const packageResult = buildCmipModelExecutionPackage(fixture as unknown as CmipModelPackageBuildRequest);
  if (!packageResult.ok) {
    console.error("CMIP GEMINI SECTIONED LIVE SMOKE INVALID");
    for (const error of packageResult.errors) console.error(`${error.code} ${error.path}: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  const summary = await executeCmipGeminiSectionedModelPackageSummary({
    modelPackage: packageResult.package,
    taskType: "full_report_experimental",
    executionMode: "live_smoke",
    allowLiveGeminiSectionedSmoke: true,
  });
  const result = summary.result;

  if (result.status !== "success") {
    for (const line of formatCmipGeminiSectionedLiveSmokeSummary(summary)) console.error(line);
    for (const error of result.errors) console.error(`${error.code} ${error.path}: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  for (const line of formatCmipGeminiSectionedLiveSmokeSummary(summary)) console.log(line);
}
