import sampleOutput from "../src/lib/cmip/contracts/sample-output.json";
import { validateCmipReport } from "../src/lib/cmip/contracts/validate-report";

const result = validateCmipReport(sampleOutput);

if (!result.valid) {
  console.error("CMIP SAMPLE INVALID");
  for (const error of result.errors) {
    const keyword = error.keyword ? ` [${error.keyword}]` : "";
    console.error(`${error.path}: ${error.message}${keyword}`);
  }
  process.exitCode = 1;
} else {
  const serialized = JSON.stringify(sampleOutput);
  const bytes = Buffer.byteLength(serialized, "utf8");
  console.log("CMIP SAMPLE VALID");
  console.log(`CMIP SAMPLE SIZE: ${bytes} bytes`);
}
