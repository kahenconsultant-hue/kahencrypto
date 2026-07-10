import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import type { ErrorObject } from "ajv";
import resultSchema from "./execution-result-schema.json";
import type { CmipOpenAiExecutionRecord, CmipOpenAiValidationResult } from "./types";

const ajv = new Ajv2020({
  allErrors: true,
  allowUnionTypes: true,
  coerceTypes: false,
  removeAdditional: false,
  strict: true,
  strictSchema: true,
  useDefaults: false,
  validateFormats: true,
});
addFormats(ajv);

const validateSchema = ajv.compile(resultSchema as object);

export function validateCmipOpenAiExecutionResult(input: unknown): CmipOpenAiValidationResult {
  const schemaValid = validateSchema(input);
  if (!schemaValid) return { valid: false, errors: normalizeAjvErrors(validateSchema.errors ?? []) };
  const errors = validateSemantics(input as CmipOpenAiExecutionRecord);
  return errors.length ? { valid: false, errors } : { valid: true, errors: [] };
}

function validateSemantics(result: CmipOpenAiExecutionRecord): readonly { path: string; message: string; keyword?: string }[] {
  const errors: { path: string; message: string; keyword?: string }[] = [];
  if (result.status === "success") {
    if (!result.canonicalValid) errors.push({ path: "$.canonicalValid", message: "Successful execution requires canonicalValid=true.", keyword: "cmipExecutionSuccessValid" });
    if (result.report === null) errors.push({ path: "$.report", message: "Successful execution requires a canonical report.", keyword: "cmipExecutionSuccessReport" });
  }
  if (result.status !== "success" && result.report !== null) {
    errors.push({ path: "$.report", message: "Non-success execution must not include a report.", keyword: "cmipExecutionFailureReport" });
  }
  if (result.status !== "success" && result.errors.length === 0) {
    errors.push({ path: "$.errors", message: "Non-success execution requires at least one error.", keyword: "cmipExecutionFailureError" });
  }
  return errors;
}

function normalizeAjvErrors(errors: readonly ErrorObject[]) {
  return errors.map((error) => ({
    path: pathForAjvError(error),
    message: error.message ?? "OpenAI execution result does not satisfy schema.",
    keyword: error.keyword,
  }));
}

function pathForAjvError(error: ErrorObject): string {
  const base = error.instancePath ? error.instancePath.split("/").slice(1).reduce((path, segment) => appendPath(path, segment.replace(/~1/g, "/").replace(/~0/g, "~")), "$") : "$";
  if (error.keyword === "required" && typeof (error.params as Record<string, unknown>).missingProperty === "string") {
    return appendPath(base, (error.params as Record<string, string>).missingProperty);
  }
  if (error.keyword === "additionalProperties" && typeof (error.params as Record<string, unknown>).additionalProperty === "string") {
    return appendPath(base, (error.params as Record<string, string>).additionalProperty);
  }
  return base;
}

function appendPath(path: string, key: string): string {
  return /^\d+$/.test(key) ? `${path}[${key}]` : /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`;
}
