import type { CmipGeminiErrorCode } from "./errors";

const RETRYABLE = new Set<string>(["GEMINI_RATE_LIMIT", "GEMINI_TIMEOUT", "GEMINI_TRANSPORT_ERROR", "GEMINI_PROVIDER_5XX"]);

export function isCmipGeminiRetryable(code: string): boolean {
  return RETRYABLE.has(code);
}

export function deterministicGeminiRetryDelayMs(attemptIndex: number): number {
  return Math.min(5000, 250 * 2 ** Math.max(0, attemptIndex));
}

export function classifyGeminiProviderException(error: unknown): { readonly code: CmipGeminiErrorCode; readonly message: string; readonly status: number | null } {
  const record = typeof error === "object" && error !== null ? (error as Record<string, unknown>) : {};
  const status = typeof record.status === "number" ? record.status : typeof record.code === "number" ? record.code : null;
  const name = typeof record.name === "string" ? record.name : "";
  const rawMessage = typeof record.message === "string" ? record.message : "Gemini provider request failed.";
  const message = redactSecretLikeText(rawMessage);
  if (status === 401 || name === "AuthenticationError") return { code: "GEMINI_AUTHENTICATION_ERROR", message, status };
  if (status === 403 || name === "PermissionDeniedError") return { code: "GEMINI_PERMISSION_ERROR", message, status };
  if (status === 429) return { code: /quota/i.test(message) ? "GEMINI_QUOTA_EXHAUSTED" : "GEMINI_RATE_LIMIT", message, status };
  if (status !== null && status >= 500) return { code: "GEMINI_PROVIDER_5XX", message, status };
  if (name === "AbortError" || name === "TimeoutError" || /timeout/i.test(message)) return { code: "GEMINI_TIMEOUT", message, status };
  if (status === 400) return { code: "GEMINI_INVALID_REQUEST", message, status };
  if (status === null) return { code: "GEMINI_TRANSPORT_ERROR", message, status };
  return { code: "GEMINI_INVALID_REQUEST", message, status };
}

function redactSecretLikeText(value: string): string {
  return value.replace(/AIza[0-9A-Za-z_-]{20,}/g, "[REDACTED:GEMINI_API_KEY]");
}
