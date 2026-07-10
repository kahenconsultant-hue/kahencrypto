import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import type { ErrorObject } from "ajv";
import outputSchema from "./output-schema.json";
import { validateCmipReportSemantics } from "./validate-report-semantics";
import type { CmipReportEnvelope, CmipValidationError, CmipValidationResult } from "./types";

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

const validateOutputSchema = ajv.compile(outputSchema as object);

export function validateCmipReport(input: unknown): CmipValidationResult {
  try {
    const finiteErrors = collectNonFiniteNumberErrors(input);
    if (finiteErrors.length > 0) {
      return {
        valid: false,
        errors: finiteErrors,
      };
    }

    const schemaValid = validateOutputSchema(input);
    if (!schemaValid) {
      return {
        valid: false,
        errors: normalizeAjvErrors(validateOutputSchema.errors ?? []),
      };
    }

    const data = input as CmipReportEnvelope;
    const semanticErrors = validateCmipReportSemantics(data);
    if (semanticErrors.length > 0) {
      return {
        valid: false,
        errors: semanticErrors,
      };
    }

    return {
      valid: true,
      data,
      errors: [],
    };
  } catch {
    return {
      valid: false,
      errors: [
        {
          path: "$",
          message: "CMIP validator failed in a controlled server-side path.",
          keyword: "cmipValidatorException",
        },
      ],
    };
  }
}

function normalizeAjvErrors(errors: readonly ErrorObject[]): CmipValidationError[] {
  return errors.map((error) => {
    const path = pathForAjvError(error);
    return {
      path,
      message: messageForAjvError(error),
      keyword: error.keyword,
    };
  });
}

function pathForAjvError(error: ErrorObject): string {
  const basePath = jsonPointerToApplicationPath(error.instancePath);

  if (error.keyword === "required") {
    const missingProperty = stringParam(error.params, "missingProperty");
    return missingProperty ? appendPropertyPath(basePath, missingProperty) : basePath;
  }

  if (error.keyword === "additionalProperties") {
    const additionalProperty = stringParam(error.params, "additionalProperty");
    return additionalProperty ? appendPropertyPath(basePath, additionalProperty) : basePath;
  }

  return basePath;
}

function messageForAjvError(error: ErrorObject): string {
  if (error.keyword === "required") {
    const missingProperty = stringParam(error.params, "missingProperty");
    return missingProperty ? `Missing required property: ${missingProperty}.` : "Missing required property.";
  }

  if (error.keyword === "additionalProperties") {
    const additionalProperty = stringParam(error.params, "additionalProperty");
    return additionalProperty ? `Unknown property is not allowed: ${additionalProperty}.` : "Unknown property is not allowed.";
  }

  if (error.keyword === "enum") {
    return "Value is not one of the supported CMIP contract enum values.";
  }

  if (error.keyword === "format") {
    return error.message ? `Invalid format: ${error.message}.` : "Invalid format.";
  }

  return error.message ?? "Value does not satisfy the CMIP output schema.";
}

function collectNonFiniteNumberErrors(value: unknown, path = "$"): CmipValidationError[] {
  if (typeof value === "number") {
    return Number.isFinite(value)
      ? []
      : [
          {
            path,
            message: "Non-finite numbers are not valid CMIP contract values.",
            keyword: "cmipFiniteNumber",
          },
        ];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item, index) => collectNonFiniteNumberErrors(item, `${path}[${index}]`));
  }

  if (isRecord(value)) {
    return Object.entries(value).flatMap(([key, item]) => collectNonFiniteNumberErrors(item, appendPropertyPath(path, key)));
  }

  return [];
}

function jsonPointerToApplicationPath(path: string): string {
  if (!path) {
    return "$";
  }

  if (!path.startsWith("/")) {
    return path.startsWith(".") ? `$${path}` : `$${path}`;
  }

  return path
    .split("/")
    .slice(1)
    .reduce((accumulator, segment) => appendPropertyPath(accumulator, unescapeJsonPointer(segment)), "$");
}

function appendPropertyPath(basePath: string, property: string): string {
  if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(property)) {
    return `${basePath}.${property}`;
  }

  if (/^\d+$/.test(property)) {
    return `${basePath}[${property}]`;
  }

  return `${basePath}[${JSON.stringify(property)}]`;
}

function unescapeJsonPointer(segment: string): string {
  return segment.replace(/~1/g, "/").replace(/~0/g, "~");
}

function stringParam(params: ErrorObject["params"], key: string): string | undefined {
  const value = (params as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
