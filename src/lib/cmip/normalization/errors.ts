export const CMIP_NORMALIZATION_ERROR_CODES = [
  "INVALID_REQUEST",
  "INVALID_SOURCE",
  "MISSING_SOURCE",
  "DUPLICATE_SOURCE",
  "INVALID_TIMESTAMP",
  "FUTURE_TIMESTAMP",
  "STALE_DATA",
  "INVALID_NUMBER",
  "NON_FINITE_NUMBER",
  "NEGATIVE_VALUE",
  "INVALID_PERCENTAGE",
  "INVALID_CORRELATION",
  "UNIT_MISMATCH",
  "UNSUPPORTED_UNIT",
  "IDENTITY_CONFLICT",
  "ASSET_UNAVAILABLE",
  "DUPLICATE_ASSET",
  "MISSING_ASSET",
  "UNSUPPORTED_ASSET",
  "CALCULATION_TRACE_MISSING",
  "PROXY_METHOD_MISSING",
  "SOURCE_CONFLICT",
  "TIMEFRAME_CONFLICT",
  "DOMAIN_PARTIAL",
  "DOMAIN_FAILED",
  "RUNTIME_INPUT_INVALID",
] as const;

export const CMIP_NORMALIZATION_SEVERITIES = ["info", "warning", "error", "critical"] as const;

export type CmipNormalizationErrorCode = (typeof CMIP_NORMALIZATION_ERROR_CODES)[number];
export type CmipNormalizationSeverity = (typeof CMIP_NORMALIZATION_SEVERITIES)[number];

export type CmipNormalizationIssue = Readonly<{
  code: CmipNormalizationErrorCode;
  path: string;
  message: string;
  domain: string;
  sourceRefs: readonly string[];
  severity: CmipNormalizationSeverity;
  occurrenceCount?: number;
  affectedPaths?: readonly string[];
}>;

export type CmipNormalizationError = CmipNormalizationIssue;
export type CmipNormalizationWarning = CmipNormalizationIssue;

export function cmipNormalizationIssue(params: {
  code: CmipNormalizationErrorCode;
  path: string;
  message: string;
  domain: string;
  sourceRefs?: readonly string[];
  severity: CmipNormalizationSeverity;
}): CmipNormalizationIssue {
  return {
    code: params.code,
    path: params.path,
    message: params.message,
    domain: params.domain,
    sourceRefs: params.sourceRefs ?? [],
    severity: params.severity,
  };
}
