import { CMIP_GEMINI_ADAPTER_VERSION } from "./constants";
import type { CmipGeminiExecutionMode, CmipGeminiExecutionTrace, CmipGeminiSchemaCompatibilityResult, CmipGeminiToolSource } from "./types";
import type { CmipModelProfile } from "../model-package";

export function createInitialCmipGeminiTrace(params: {
  readonly startedAt: string;
  readonly executionMode: CmipGeminiExecutionMode;
  readonly provider: string;
  readonly cmipModelProfile: CmipModelProfile;
  readonly geminiProfile: CmipGeminiExecutionTrace["request"]["geminiProfile"];
  readonly resolvedModel: string | null;
  readonly googleSearchEnabled: boolean;
  readonly maxOutputTokens: number;
  readonly timeoutMs: number;
  readonly schemaCompatibility: CmipGeminiSchemaCompatibilityResult;
}): CmipGeminiExecutionTrace {
  return {
    adapterVersion: CMIP_GEMINI_ADAPTER_VERSION,
    startedAt: params.startedAt,
    completedAt: params.startedAt,
    executionMode: params.executionMode,
    provider: params.provider,
    request: {
      cmipModelProfile: params.cmipModelProfile,
      geminiProfile: params.geminiProfile,
      resolvedModel: params.resolvedModel,
      responseFormat: "application/json",
      store: false,
      googleSearchEnabled: params.googleSearchEnabled,
      maxOutputTokens: params.maxOutputTokens,
      timeoutMs: params.timeoutMs,
    },
    schemaCompatibility: params.schemaCompatibility,
    attempts: [],
    repairAttempts: 0,
    toolSources: [],
  };
}

export function finishCmipGeminiTrace(trace: CmipGeminiExecutionTrace, completedAt: string, toolSources: readonly CmipGeminiToolSource[]): CmipGeminiExecutionTrace {
  return { ...trace, completedAt, toolSources };
}
