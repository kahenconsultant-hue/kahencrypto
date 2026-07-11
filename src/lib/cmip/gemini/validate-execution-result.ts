import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import type { ErrorObject } from "ajv";
import resultSchema from "./execution-result-schema.json";
import type { CmipProviderNeutralExecutionResult } from "../providers";
import type { CmipGeminiValidationResult } from "./types";

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

export function validateCmipGeminiExecutionResult(input: unknown): CmipGeminiValidationResult {
  const schemaValid = validateSchema(input);
  if (!schemaValid) return { valid: false, errors: normalizeAjvErrors(validateSchema.errors ?? []) };
  const errors = validateSemantics(input as CmipProviderNeutralExecutionResult);
  return errors.length ? { valid: false, errors } : { valid: true, errors: [] };
}

function validateSemantics(result: CmipProviderNeutralExecutionResult): readonly { path: string; message: string; keyword?: string }[] {
  const errors: { path: string; message: string; keyword?: string }[] = [];
  if (result.status === "success") {
    if (!result.validation.canonicalValid) errors.push({ path: "$.validation.canonicalValid", message: "Successful Gemini execution requires canonicalValid=true.", keyword: "cmipGeminiSuccessValid" });
    if (result.report === null) errors.push({ path: "$.report", message: "Successful Gemini execution requires a canonical report.", keyword: "cmipGeminiSuccessReport" });
  }
  if (result.status !== "success" && result.report !== null) {
    errors.push({ path: "$.report", message: "Non-success Gemini execution must not include a report.", keyword: "cmipGeminiFailureReport" });
  }
  if (result.status !== "success" && result.errors.length === 0) {
    errors.push({ path: "$.errors", message: "Non-success Gemini execution requires at least one error.", keyword: "cmipGeminiFailureError" });
  }
  if (["completed", "cancelled", "queued", "in_progress"].includes(result.status)) {
    errors.push({ path: "$.status", message: "Provider raw status must not be used as the canonical CMIP status.", keyword: "cmipGeminiCanonicalStatus" });
  }
  return errors;
}

function normalizeAjvErrors(errors: readonly ErrorObject[]) {
  return errors.map((error) => ({
    path: pathForAjvError(error),
    message: error.message ?? "Gemini execution result does not satisfy schema.",
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
