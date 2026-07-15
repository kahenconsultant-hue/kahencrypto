export const CMIP_EXPERIMENTAL_FULL_REPORT_AI_ENV_KEY = "CMIP_ENABLE_EXPERIMENTAL_FULL_REPORT_AI";
export const CMIP_EXPERIMENTAL_FULL_REPORT_AI_DISABLED_CODE = "CMIP_EXPERIMENTAL_FULL_REPORT_AI_DISABLED";

export const CMIP_PROVIDER_EXECUTION_TASK_TYPES = ["full_report_experimental", "explanation_only"] as const;

export type CmipProviderExecutionTaskType = (typeof CMIP_PROVIDER_EXECUTION_TASK_TYPES)[number];

export interface CmipExperimentalFullReportAiGate {
  readonly enabled: boolean;
  readonly envKey: typeof CMIP_EXPERIMENTAL_FULL_REPORT_AI_ENV_KEY;
}

export function resolveCmipExperimentalFullReportAiGate(
  env: Partial<Record<string, string | undefined>> = {},
): CmipExperimentalFullReportAiGate {
  return {
    enabled: env[CMIP_EXPERIMENTAL_FULL_REPORT_AI_ENV_KEY] === "true",
    envKey: CMIP_EXPERIMENTAL_FULL_REPORT_AI_ENV_KEY,
  };
}

export function isCmipExperimentalFullReportAiEnabled(
  env: Partial<Record<string, string | undefined>> = {},
): boolean {
  return resolveCmipExperimentalFullReportAiGate(env).enabled;
}

export function isCmipFullReportExperimentalTask(taskType: CmipProviderExecutionTaskType | undefined): boolean {
  return taskType === "full_report_experimental";
}
