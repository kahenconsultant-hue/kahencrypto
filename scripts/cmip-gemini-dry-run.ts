import fixture from "../src/lib/cmip/model-package/fixtures/package-input-valid.json";
import { buildCmipModelExecutionPackage } from "../src/lib/cmip/model-package/build-model-package";
import type { CmipModelPackageBuildRequest } from "../src/lib/cmip/model-package/types";
import { executeCmipGeminiModelPackage } from "../src/lib/cmip/gemini/execute-model-package";
import { FakeCmipGeminiProvider } from "../src/lib/cmip/gemini/provider/fake-gemini-provider";

void main();

async function main() {
  const packageResult = buildCmipModelExecutionPackage(fixture as unknown as CmipModelPackageBuildRequest);
  if (!packageResult.ok) {
    console.error("CMIP GEMINI DRY RUN INVALID");
    for (const error of packageResult.errors) console.error(`${error.code} ${error.path}: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  const result = await executeCmipGeminiModelPackage(
    {
      modelPackage: packageResult.package,
      executionMode: "dry_run",
    },
    {
      provider: new FakeCmipGeminiProvider({ fixtures: ["valid"] }),
      env: {
        CMIP_GEMINI_MODEL_PRIMARY: "gemini-cmip-dry-run",
        CMIP_GEMINI_MAX_OUTPUT_TOKENS: "8000",
        CMIP_GEMINI_TIMEOUT_MS: "240000",
        CMIP_GEMINI_ENABLE_GOOGLE_SEARCH: "false",
      },
    },
  );

  if (result.status !== "success") {
    console.error("CMIP GEMINI DRY RUN INVALID");
    for (const error of result.errors) console.error(`${error.code} ${error.path}: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  const providerTrace = result.trace.providerTrace as { request?: { googleSearchEnabled?: boolean } } | null;
  console.log("CMIP GEMINI DRY RUN VALID");
  console.log(`CMIP EXECUTION STATUS: ${result.status}`);
  console.log(`CMIP PROVIDER RESPONSE STATUS: ${result.provider.rawStatus ?? "unavailable"}`);
  console.log(`CMIP PROVIDER: ${result.provider.name}`);
  console.log(`CMIP CANONICAL OUTPUT VALID: ${result.validation.canonicalValid}`);
  console.log(`CMIP ATTEMPTS: ${result.attempts.length}`);
  console.log(`CMIP GOOGLE SEARCH ENABLED: ${String(providerTrace?.request?.googleSearchEnabled ?? false)}`);
}
