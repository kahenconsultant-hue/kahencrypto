import { CMIP_CONTEXT_BUDGET_LIMITS } from "./constants";
import type { CmipExecutionRequest, CmipModelExecutionConfig } from "./types";

export function buildExecutionConfig(execution: CmipExecutionRequest): CmipModelExecutionConfig {
  const limits = CMIP_CONTEXT_BUDGET_LIMITS[execution.tokenBudgetProfile];
  return {
    modelProfile: execution.mode === "regeneration" ? "cmip_validation_repair" : "cmip_primary_reasoning",
    reasoningProfile: execution.tokenBudgetProfile === "compact" ? "standard" : "high",
    responseFormat: "json_schema",
    strictOutput: true,
    temperaturePolicy: "fixed_zero_if_supported",
    maxOutputTokens: limits.reservedOutputTokens,
    timeoutBudgetMs: execution.tokenBudgetProfile === "extended" ? 180000 : 120000,
    retryPolicy: {
      maxAttempts: execution.mode === "production" ? 2 : 1,
      retryOn: ["transport_error", "rate_limit", "timeout", "schema_invalid"],
      schemaRepairAttempts: execution.mode === "production" ? 1 : 0,
    },
  };
}
