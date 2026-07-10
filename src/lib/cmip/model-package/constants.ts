import { CMIP_CONTRACT_VERSION, CMIP_OUTPUT_SCHEMA_VERSION } from "../contracts/constants";
import { CMIP_INTELLIGENCE_SPEC_VERSION } from "../intelligence-spec/constants";
import { CMIP_NORMALIZATION_VERSION } from "../normalization/constants";
import { CMIP_RUNTIME_INPUT_SPEC_VERSION } from "../runtime-input/constants";

export const CMIP_MODEL_PACKAGE_VERSION = "CMIP-MODEL-PACKAGE-1.0";
export const CMIP_PROMPT_BUILDER_VERSION = "CMIP-PROMPT-BUILDER-1.0";
export const CMIP_SYSTEM_INSTRUCTIONS_VERSION = "CMIP-SYSTEM-1.0";
export const CMIP_INTELLIGENCE_CONTEXT_VERSION = "CMIP-INTELLIGENCE-CONTEXT-1.0";
export const CMIP_TOOL_POLICY_VERSION = "CMIP-TOOL-POLICY-1.0";
export const CMIP_INJECTION_POLICY_VERSION = "CMIP-INJECTION-POLICY-1.0";

export const CMIP_MODEL_PACKAGE_SCHEMA_ID = "https://cmip.local/model-package/package-schema.v1.json";

export const CMIP_MODEL_PACKAGE_VERSIONS = {
  architectureVersion: CMIP_CONTRACT_VERSION,
  outputContractVersion: CMIP_OUTPUT_SCHEMA_VERSION,
  runtimeInputVersion: CMIP_RUNTIME_INPUT_SPEC_VERSION,
  intelligenceSpecVersion: CMIP_INTELLIGENCE_SPEC_VERSION,
  normalizationVersion: CMIP_NORMALIZATION_VERSION,
  promptBuilderVersion: CMIP_PROMPT_BUILDER_VERSION,
} as const;

export const CMIP_MODEL_MESSAGE_ORDER = [
  { role: "system", name: "cmip_core_system_instructions" },
  { role: "developer", name: "cmip_static_intelligence_specification" },
  { role: "developer", name: "cmip_output_contract_and_response_restrictions" },
  { role: "user", name: "cmip_runtime_execution_context" },
] as const;

export const CMIP_EXECUTION_MODES = ["production", "preview", "test", "regeneration"] as const;
export const CMIP_WEB_SEARCH_POLICIES = ["disabled", "context_only", "gap_fill_only", "required_for_freshness"] as const;
export const CMIP_HISTORICAL_POLICIES = ["provided_only", "provided_or_abstain", "provided_with_contextual_web_support"] as const;
export const CMIP_PREVIOUS_REPORT_POLICIES = ["required", "optional", "ignore"] as const;
export const CMIP_TOKEN_BUDGET_PROFILES = ["compact", "standard", "extended"] as const;
export const CMIP_MODEL_PROFILES = ["cmip_primary_reasoning", "cmip_fallback_reasoning", "cmip_validation_repair"] as const;
export const CMIP_RETRY_REASONS = ["transport_error", "rate_limit", "timeout", "schema_invalid"] as const;

export const CMIP_CONTEXT_BUDGET_LIMITS = {
  compact: { maxInputTokens: 16000, reservedOutputTokens: 5000, newsLimit: 3, historicalLimit: 3, includeFundBreakdown: false },
  standard: { maxInputTokens: 64000, reservedOutputTokens: 8000, newsLimit: 20, historicalLimit: 12, includeFundBreakdown: true },
  extended: { maxInputTokens: 120000, reservedOutputTokens: 12000, newsLimit: 60, historicalLimit: 30, includeFundBreakdown: true },
} as const;

export const CMIP_CONTEXT_REDUCTION_ORDER = [
  "dedupe_source_metadata",
  "remove_previous_chart_data",
  "previous_report_summary_only",
  "limit_news_by_importance",
  "limit_historical_evidence",
  "remove_fund_breakdown_detail",
] as const;
