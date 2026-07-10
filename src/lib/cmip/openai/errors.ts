import type { CMIP_OPENAI_ERROR_CODES, CMIP_OPENAI_WARNING_CODES } from "./constants";

export type CmipOpenAiErrorCode = (typeof CMIP_OPENAI_ERROR_CODES)[number];
export type CmipOpenAiWarningCode = (typeof CMIP_OPENAI_WARNING_CODES)[number];
export type CmipOpenAiIssueCode = CmipOpenAiErrorCode | CmipOpenAiWarningCode;

export interface CmipOpenAiIssue {
  readonly code: CmipOpenAiIssueCode;
  readonly path: string;
  readonly message: string;
  readonly severity: "info" | "warning" | "error" | "critical";
  readonly retryable: boolean;
  readonly sourceRefs: readonly string[];
}

export function cmipOpenAiIssue(params: {
  code: CmipOpenAiIssueCode;
  path: string;
  message: string;
  severity: CmipOpenAiIssue["severity"];
  retryable?: boolean;
  sourceRefs?: readonly string[];
}): CmipOpenAiIssue {
  return {
    code: params.code,
    path: params.path,
    message: params.message,
    severity: params.severity,
    retryable: params.retryable ?? false,
    sourceRefs: params.sourceRefs ?? [],
  };
}

