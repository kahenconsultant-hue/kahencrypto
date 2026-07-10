export const CMIP_MODEL_PACKAGE_ERROR_CODES = [
  "INVALID_BUILD_REQUEST",
  "RUNTIME_INPUT_INVALID",
  "PREVIOUS_REPORT_INVALID",
  "PREVIOUS_REPORT_REQUIRED",
  "CONTEXT_BUDGET_EXCEEDED",
  "SERIALIZATION_FAILED",
  "NON_CANONICAL_VALUE",
  "SECRET_REDACTED",
  "PROMPT_INJECTION_PATTERN_DETECTED",
  "PACKAGE_SCHEMA_INVALID",
  "HASHING_FAILED",
  "VERSION_MISMATCH",
  "OUTPUT_SCHEMA_MISSING",
] as const;

export type CmipModelPackageErrorCode = (typeof CMIP_MODEL_PACKAGE_ERROR_CODES)[number];

export function cmipModelPackageIssue(params: {
  code: CmipModelPackageErrorCode;
  path: string;
  message: string;
  severity: "info" | "warning" | "error" | "critical";
  sourceRefs?: readonly string[];
}) {
  return {
    code: params.code,
    path: params.path,
    message: params.message,
    severity: params.severity,
    sourceRefs: params.sourceRefs ?? [],
  };
}
