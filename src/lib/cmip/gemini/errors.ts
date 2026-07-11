import type { CMIP_GEMINI_ERROR_CODES, CMIP_GEMINI_WARNING_CODES } from "./constants";

export type CmipGeminiErrorCode = (typeof CMIP_GEMINI_ERROR_CODES)[number];
export type CmipGeminiWarningCode = (typeof CMIP_GEMINI_WARNING_CODES)[number];
export type CmipGeminiIssueCode = CmipGeminiErrorCode | CmipGeminiWarningCode;

export interface CmipGeminiIssue {
  readonly code: CmipGeminiIssueCode;
  readonly path: string;
  readonly message: string;
  readonly severity: "info" | "warning" | "error" | "critical";
  readonly retryable: boolean;
  readonly sourceRefs: readonly string[];
}

export function cmipGeminiIssue(params: {
  readonly code: CmipGeminiIssueCode;
  readonly path: string;
  readonly message: string;
  readonly severity: CmipGeminiIssue["severity"];
  readonly retryable?: boolean;
  readonly sourceRefs?: readonly string[];
}): CmipGeminiIssue {
  return {
    code: params.code,
    path: params.path,
    message: params.message,
    severity: params.severity,
    retryable: params.retryable ?? false,
    sourceRefs: params.sourceRefs ?? [],
  };
}
