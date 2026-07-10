import rawFixture from "../src/lib/cmip/normalization/fixtures/raw-valid.json";
import { normalizeCmipRuntimeInput } from "../src/lib/cmip/normalization/runtime-input-builder";

const result = normalizeCmipRuntimeInput(rawFixture);

if (!result.ok) {
  console.error("CMIP NORMALIZATION INVALID");
  for (const error of result.errors) {
    console.error(`${error.code} ${error.path}: ${error.message}`);
  }
  process.exitCode = 1;
} else {
  const serialized = JSON.stringify(result.data);
  const bytes = Buffer.byteLength(serialized, "utf8");
  console.log("CMIP NORMALIZATION VALID");
  console.log(`CMIP NORMALIZATION WARNINGS: ${result.warnings.length}`);
  console.log(`CMIP NORMALIZED INPUT SIZE: ${bytes} bytes`);
}
