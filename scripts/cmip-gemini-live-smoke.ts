import fixture from "../src/lib/cmip/model-package/fixtures/package-input-valid.json";
import { buildCmipModelExecutionPackage } from "../src/lib/cmip/model-package/build-model-package";
import type { CmipModelPackageBuildRequest } from "../src/lib/cmip/model-package/types";
import { executeCmipGeminiModelPackage } from "../src/lib/cmip/gemini/execute-model-package";

void main();

async function main() {
  if (process.env.CMIP_ALLOW_LIVE_GEMINI_SMOKE !== "true") {
    console.error("CMIP GEMINI LIVE SMOKE BLOCKED");
    console.error("Set CMIP_ALLOW_LIVE_GEMINI_SMOKE=true to run the gated live smoke test.");
    process.exitCode = 1;
    return;
  }
  if (!process.env.GEMINI_API_KEY?.trim()) {
    console.error("CMIP GEMINI LIVE SMOKE BLOCKED");
    console.error("GEMINI_API_KEY is required.");
    process.exitCode = 1;
    return;
  }
  if (!process.env.CMIP_GEMINI_MODEL_PRIMARY?.trim()) {
    console.error("CMIP GEMINI LIVE SMOKE BLOCKED");
    console.error("CMIP_GEMINI_MODEL_PRIMARY is required.");
    process.exitCode = 1;
    return;
  }

  const packageResult = buildCmipModelExecutionPackage(fixture as unknown as CmipModelPackageBuildRequest);
  if (!packageResult.ok) {
    console.error("CMIP GEMINI LIVE SMOKE INVALID");
    for (const error of packageResult.errors) console.error(`${error.code} ${error.path}: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  const result = await executeCmipGeminiModelPackage({
    modelPackage: packageResult.package,
    executionMode: "live_smoke",
    allowLiveGeminiSmoke: true,
  });

  if (result.status !== "success") {
    console.error("CMIP GEMINI LIVE STATUS: failed");
    for (const error of result.errors) console.error(`${error.code} ${error.path}: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  console.log(`CMIP GEMINI LIVE STATUS: ${result.status}`);
  console.log(`CMIP GEMINI RESPONSE ID: ${result.provider.responseId ?? "unavailable"}`);
  console.log(`CMIP GEMINI MODEL: ${result.provider.model ?? "unavailable"}`);
  console.log(`CMIP GEMINI DURATION MS: ${result.timing.durationMs}`);
  console.log(`CMIP GEMINI INPUT TOKENS: ${result.usage.inputTokens ?? "unavailable"}`);
  console.log(`CMIP GEMINI OUTPUT TOKENS: ${result.usage.outputTokens ?? "unavailable"}`);
  console.log(`CMIP CANONICAL OUTPUT VALID: ${result.validation.canonicalValid}`);
  console.log(`CMIP REPORT POSTURE: ${result.report?.cmip_report.decision.posture ?? "unavailable"}`);
  console.log(`CMIP REPORT CONFIDENCE: ${result.report?.cmip_report.decision.confidence ?? "unavailable"}`);
}
