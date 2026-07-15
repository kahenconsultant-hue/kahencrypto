export const CMIP_PROVIDER_EXECUTION_VERSION = "CMIP-PROVIDER-EXECUTION-1.0";
export const CMIP_PROVIDER_ROUTER_VERSION = "CMIP-PROVIDER-ROUTER-1.0";
export const CMIP_PROVIDER_RESULT_SCHEMA_ID = "https://cmip.local/providers/execution-result-schema.v1.json";

export const CMIP_PROVIDER_IDS = ["openai", "gemini"] as const;
export const CMIP_PROVIDER_STATUSES = ["success", "failed", "refused", "incomplete"] as const;
export const CMIP_PROVIDER_FALLBACK_POLICIES = ["disabled", "retryable_transport_only", "provider_unavailable", "explicit_manual"] as const;

export const CMIP_PROVIDER_ERROR_CODES = [
  "CMIP_EXPERIMENTAL_FULL_REPORT_AI_DISABLED",
  "CMIP_FULL_REPORT_TASK_TYPE_UNSUPPORTED",
  "PROVIDER_PACKAGE_INVALID",
  "PROVIDER_PACKAGE_INTEGRITY_INVALID",
  "PROVIDER_UNSUPPORTED",
  "PROVIDER_EXECUTION_FAILED",
  "PROVIDER_FALLBACK_NOT_ALLOWED",
  "PROVIDER_FALLBACK_FAILED",
  "PROVIDER_RESULT_INVALID",
] as const;

export const CMIP_PROVIDER_WARNING_CODES = [
  "PROVIDER_FALLBACK_ATTEMPTED",
  "PROVIDER_SELECTION_RECORDED",
] as const;
