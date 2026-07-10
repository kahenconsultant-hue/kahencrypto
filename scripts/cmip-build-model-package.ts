import fixture from "../src/lib/cmip/model-package/fixtures/package-input-valid.json";
import { buildCmipModelExecutionPackage } from "../src/lib/cmip/model-package/build-model-package";
import { serializeCmipModelExecutionPackage } from "../src/lib/cmip/model-package/serialize-model-package";
import { validateCmipModelExecutionPackage } from "../src/lib/cmip/model-package/validate-model-package";
import type { CmipModelPackageBuildRequest } from "../src/lib/cmip/model-package/types";

const result = buildCmipModelExecutionPackage(fixture as unknown as CmipModelPackageBuildRequest);

if (!result.ok) {
  console.error("CMIP MODEL PACKAGE INVALID");
  for (const error of result.errors) {
    console.error(`${error.code} ${error.path}: ${error.message}`);
  }
  process.exitCode = 1;
} else {
  const validation = validateCmipModelExecutionPackage(result.package);
  if (!validation.valid) {
    console.error("CMIP MODEL PACKAGE INVALID");
    for (const error of validation.errors) {
      console.error(`${error.path}: ${error.message}${error.keyword ? ` [${error.keyword}]` : ""}`);
    }
    process.exitCode = 1;
  } else {
    const serialized = serializeCmipModelExecutionPackage(result.package);
    const bytes = Buffer.byteLength(serialized, "utf8");
    console.log("CMIP MODEL PACKAGE VALID");
    console.log(`CMIP MODEL PACKAGE SIZE: ${bytes} bytes`);
    console.log(`CMIP MODEL PACKAGE ESTIMATED INPUT TOKENS: ${result.package.contextBudget.estimatedInputTokens}`);
    console.log(`CMIP MODEL PACKAGE WARNINGS: ${result.warnings.length}`);
    console.log(`CMIP MODEL PACKAGE SEMANTIC HASH: ${result.package.integrity.semanticPackageHash}`);
  }
}
