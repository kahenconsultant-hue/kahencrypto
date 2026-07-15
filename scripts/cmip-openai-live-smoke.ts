import fixture from "../src/lib/cmip/model-package/fixtures/package-input-valid.json";
import { buildCmipModelExecutionPackage } from "../src/lib/cmip/model-package/build-model-package";
import type { CmipModelPackageBuildRequest } from "../src/lib/cmip/model-package/types";
import { executeCmipModelPackage } from "../src/lib/cmip/openai/execute-model-package";

void main();

async function main() {
  if (process.env.CMIP_ALLOW_LIVE_OPENAI_SMOKE !== "true") {
    console.error("CMIP OPENAI LIVE SMOKE BLOCKED");
    console.error("Set CMIP_ALLOW_LIVE_OPENAI_SMOKE=true to run the paid live smoke test.");
    process.exitCode = 1;
    return;
  }

  const packageResult = buildCmipModelExecutionPackage(fixture as unknown as CmipModelPackageBuildRequest);

  if (!packageResult.ok) {
    console.error("CMIP OPENAI LIVE SMOKE INVALID");
    for (const error of packageResult.errors) console.error(`${error.code} ${error.path}: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  const result = await executeCmipModelPackage({
    modelPackage: packageResult.package,
    taskType: "full_report_experimental",
    executionMode: "live_smoke",
    allowLiveOpenAiSmoke: true,
  });

  if (!result.ok) {
    console.error("CMIP OPENAI LIVE SMOKE INVALID");
    for (const error of result.errors) console.error(`${error.code} ${error.path}: ${error.message}`);
    process.exitCode = 1;
  } else {
    console.log("CMIP OPENAI LIVE SMOKE VALID");
    console.log(`CMIP EXECUTION STATUS: ${result.result.status}`);
    console.log(`CMIP PROVIDER RESPONSE STATUS: ${result.result.trace.attempts.at(-1)?.providerStatus ?? "unavailable"}`);
    console.log(`CMIP OPENAI LIVE SMOKE RESPONSE ID: ${result.result.responseId ?? "unavailable"}`);
    console.log(`CMIP OPENAI LIVE SMOKE USAGE TOTAL TOKENS: ${result.result.usage?.totalTokens ?? 0}`);
    console.log(`CMIP OPENAI LIVE SMOKE REPORT VALID: ${result.result.canonicalValid}`);
  }
}
