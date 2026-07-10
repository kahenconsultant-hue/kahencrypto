import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import type { ErrorObject } from "ajv";
import packageSchema from "./package-schema.json";
import { CMIP_MODEL_MESSAGE_ORDER } from "./constants";
import type { CmipModelExecutionPackage, CmipPackageValidationResult } from "./types";
import { isSha256Hex } from "./hashing";

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

const validateSchema = ajv.compile(packageSchema as object);

export function validateCmipModelExecutionPackage(input: unknown): CmipPackageValidationResult {
  const schemaValid = validateSchema(input);
  if (!schemaValid) return { valid: false, errors: normalizeAjvErrors(validateSchema.errors ?? []) };
  const semanticErrors = validateModelPackageSemantics(input as CmipModelExecutionPackage);
  return semanticErrors.length ? { valid: false, errors: semanticErrors } : { valid: true, errors: [] };
}

function validateModelPackageSemantics(modelPackage: CmipModelExecutionPackage): readonly { path: string; message: string; keyword?: string }[] {
  const errors: { path: string; message: string; keyword?: string }[] = [];
  modelPackage.messages.forEach((message, index) => {
    const expected = CMIP_MODEL_MESSAGE_ORDER[index];
    if (!expected || message.role !== expected.role || message.name !== expected.name) {
      errors.push({ path: `$.messages[${index}]`, message: "CMIP model package message order is invalid.", keyword: "cmipMessageOrder" });
    }
    if (!isSha256Hex(message.contentHash)) {
      errors.push({ path: `$.messages[${index}].contentHash`, message: "Message contentHash must be SHA-256 hex.", keyword: "cmipHash" });
    }
  });
  if (modelPackage.outputContract.strict !== true || modelPackage.executionConfig.strictOutput !== true) {
    errors.push({ path: "$.outputContract.strict", message: "Strict output must be true.", keyword: "cmipStrictOutput" });
  }
  return errors;
}

function normalizeAjvErrors(errors: readonly ErrorObject[]) {
  return errors.map((error) => ({
    path: pathForAjvError(error),
    message: error.message ?? "Model package does not satisfy schema.",
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
