import sampleInput from "../src/lib/cmip/runtime-input/sample-input.json";
import { validateCmipRuntimeInput } from "../src/lib/cmip/runtime-input/validate-input";

const result = validateCmipRuntimeInput(sampleInput);

if (!result.valid) {
  console.error("CMIP RUNTIME INPUT INVALID");
  for (const error of result.errors) {
    const keyword = error.keyword ? ` [${error.keyword}]` : "";
    console.error(`${error.path}: ${error.message}${keyword}`);
  }
  process.exitCode = 1;
} else {
  const serialized = JSON.stringify(sampleInput);
  const bytes = Buffer.byteLength(serialized, "utf8");
  console.log("CMIP RUNTIME INPUT VALID");
  console.log(`CMIP RUNTIME INPUT SIZE: ${bytes} bytes`);
}
