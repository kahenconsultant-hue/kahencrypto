import fixture from "../src/lib/cmip/model-package/fixtures/package-input-valid.json";
import { buildCmipModelExecutionPackage } from "../src/lib/cmip/model-package/build-model-package";
import type { CmipModelPackageBuildRequest } from "../src/lib/cmip/model-package/types";
import { executeCmipModelPackage } from "../src/lib/cmip/openai/execute-model-package";
import { FakeCmipOpenAiProvider } from "../src/lib/cmip/openai/provider/fake-provider";

void main();

async function main() {
  const packageResult = buildCmipModelExecutionPackage(fixture as unknown as CmipModelPackageBuildRequest);

  if (!packageResult.ok) {
    console.error("CMIP OPENAI DRY RUN INVALID");
    for (const error of packageResult.errors) console.error(`${error.code} ${error.path}: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  const result = await executeCmipModelPackage(
    {
      modelPackage: packageResult.package,
      taskType: "full_report_experimental",
      executionMode: "dry_run",
    },
    {
      provider: new FakeCmipOpenAiProvider({ fixtures: ["valid"] }),
      env: {
        CMIP_OPENAI_MODEL_PRIMARY: "gpt-5-cmip-dry-run",
        CMIP_OPENAI_MAX_OUTPUT_TOKENS: "8000",
        CMIP_OPENAI_TIMEOUT_MS: "240000",
      },
    },
  );

  if (!result.ok) {
    console.error("CMIP OPENAI DRY RUN INVALID");
    for (const error of result.errors) console.error(`${error.code} ${error.path}: ${error.message}`);
    process.exitCode = 1;
  } else {
    console.log("CMIP OPENAI DRY RUN VALID");
    console.log(`CMIP EXECUTION STATUS: ${result.result.status}`);
    console.log(`CMIP PROVIDER RESPONSE STATUS: ${result.result.trace.attempts.at(-1)?.providerStatus ?? "unavailable"}`);
    console.log(`CMIP OPENAI DRY RUN WARNINGS: ${result.warnings.length}`);
    console.log(`CMIP OPENAI DRY RUN USAGE TOTAL TOKENS: ${result.result.usage?.totalTokens ?? 0}`);
    console.log(`CMIP OPENAI DRY RUN REPORT VALID: ${result.result.canonicalValid}`);
  }
}
