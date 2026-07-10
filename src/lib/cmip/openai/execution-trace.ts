import type { CmipModelExecutionPackage, CmipModelProfile } from "../model-package";
import { CMIP_OPENAI_ADAPTER_VERSION } from "./constants";
import type { CmipOpenAiExecutionMode, CmipOpenAiExecutionTrace, CmipOpenAiSchemaCompatibilityReport, CmipOpenAiToolChoice, CmipOpenAiToolSource } from "./types";

export function createInitialCmipOpenAiTrace(params: {
  readonly modelPackage: CmipModelExecutionPackage;
  readonly startedAt: string;
  readonly executionMode: CmipOpenAiExecutionMode;
  readonly provider: string;
  readonly modelProfile: CmipModelProfile;
  readonly resolvedModel: string | null;
  readonly toolChoice: CmipOpenAiToolChoice;
  readonly webSearchEnabled: boolean;
  readonly maxOutputTokens: number;
  readonly timeoutMs: number;
  readonly schemaCompatibility: CmipOpenAiSchemaCompatibilityReport;
}): CmipOpenAiExecutionTrace {
  return {
    adapterVersion: CMIP_OPENAI_ADAPTER_VERSION,
    startedAt: params.startedAt,
    completedAt: params.startedAt,
    executionMode: params.executionMode,
    provider: params.provider,
    request: {
      modelProfile: params.modelProfile,
      resolvedModel: params.resolvedModel,
      responseFormat: "json_schema",
      strictOutput: true,
      store: false,
      toolChoice: params.toolChoice,
      webSearchEnabled: params.webSearchEnabled,
      maxOutputTokens: params.maxOutputTokens,
      timeoutMs: params.timeoutMs,
    },
    schemaCompatibility: params.schemaCompatibility,
    attempts: [],
    repairAttempts: 0,
    toolSources: [],
  };
}

export function finishCmipOpenAiTrace(trace: CmipOpenAiExecutionTrace, completedAt: string, toolSources: readonly CmipOpenAiToolSource[]): CmipOpenAiExecutionTrace {
  return {
    ...trace,
    completedAt,
    toolSources,
  };
}

