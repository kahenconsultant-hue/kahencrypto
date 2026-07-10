import outputSchema from "../contracts/output-schema.json";
import { CMIP_OUTPUT_SCHEMA_VERSION } from "../contracts/constants";
import { stableJsonClone, stableStringifyPretty } from "./stable-json";

export function getCmipOutputContract() {
  return {
    schemaName: "CMIP Daily Investment Committee Decision Object",
    schemaVersion: CMIP_OUTPUT_SCHEMA_VERSION,
    strict: true as const,
    schema: stableJsonClone(outputSchema) as Record<string, unknown>,
  };
}

export function buildOutputContractContent(): string {
  return [
    "CMIP OUTPUT CONTRACT AND RESPONSE RESTRICTIONS",
    "Return only JSON. The root object must be cmip_report. No Markdown, HTML, code fences or prose outside JSON.",
    "The schema below is imported from the Task 001 repository-controlled output-schema.json. Do not alter it.",
    stableStringifyPretty(getCmipOutputContract()),
  ].join("\n");
}
