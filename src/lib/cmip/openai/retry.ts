import { CMIP_OPENAI_RESPONSE_RETRYABLE_ERROR_CODES } from "./constants";
import type { CmipOpenAiErrorCode } from "./errors";

export function isCmipOpenAiRetryable(code: string): boolean {
  return (CMIP_OPENAI_RESPONSE_RETRYABLE_ERROR_CODES as readonly string[]).includes(code);
}

export function deterministicRetryDelayMs(attemptIndex: number): number {
  return Math.min(5000, 250 * 2 ** Math.max(0, attemptIndex));
}

export function classifyProviderException(error: unknown): { readonly code: CmipOpenAiErrorCode; readonly message: string; readonly status: number | null } {
  const record = typeof error === "object" && error !== null ? (error as Record<string, unknown>) : {};
  const status = typeof record.status === "number" ? record.status : null;
  const name = typeof record.name === "string" ? record.name : "";
  const message = typeof record.message === "string" ? record.message : "OpenAI provider request failed.";
  if (status === 401 || status === 403 || name === "AuthenticationError" || name === "PermissionDeniedError") {
    return { code: "OPENAI_AUTH_ERROR", message, status };
  }
  if (status === 429 || name === "RateLimitError") {
    return { code: "OPENAI_RATE_LIMITED", message, status };
  }
  if (status !== null && status >= 500) {
    return { code: "OPENAI_PROVIDER_5XX", message, status };
  }
  if (name === "APIConnectionTimeoutError" || name === "AbortError") {
    return { code: "OPENAI_TIMEOUT", message, status };
  }
  if (name === "APIConnectionError" || status === null) {
    return { code: "OPENAI_TRANSPORT_ERROR", message, status };
  }
  return { code: "OPENAI_REQUEST_FAILED", message, status };
}

