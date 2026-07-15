import type { CmipReportEnvelope } from "../contracts";
import type { CmipProviderExecutionTaskType } from "../experimental-full-report-ai";
import type { CmipModelExecutionPackage, CmipModelProfile } from "../model-package";
import type { CMIP_OPENAI_EXECUTION_STATUSES } from "./constants";
import type { CmipOpenAiIssue } from "./errors";

export type CmipOpenAiExecutionMode = "dry_run" | "live_smoke" | "preview";
export type CmipOpenAiExecutionStatus = (typeof CMIP_OPENAI_EXECUTION_STATUSES)[number];
export type CmipOpenAiProviderStatus = "completed" | "incomplete" | "failed" | "cancelled" | "in_progress" | "queued";
export type CmipOpenAiReasoningEffort = "minimal" | "low" | "medium" | "high";
export type CmipOpenAiServiceTier = "auto" | "default" | "flex" | "priority";
export type CmipOpenAiToolChoice = "none" | "auto" | "required";
export type CmipOpenAiRetryReason = "transport_error" | "rate_limit" | "timeout" | "schema_invalid" | "provider_5xx";

export type CmipOpenAiJsonPrimitive = string | number | boolean | null;
export type CmipOpenAiJsonValue =
  | CmipOpenAiJsonPrimitive
  | readonly CmipOpenAiJsonValue[]
  | { readonly [key: string]: CmipOpenAiJsonValue };

export interface CmipOpenAiExecutionRequest {
  readonly modelPackage: CmipModelExecutionPackage;
  readonly taskType?: CmipProviderExecutionTaskType;
  readonly executionMode: CmipOpenAiExecutionMode;
  readonly allowLiveOpenAiSmoke?: boolean;
}

export interface CmipOpenAiExecutionOptions {
  readonly provider?: CmipOpenAiProvider;
  readonly env?: Partial<Record<string, string | undefined>>;
  readonly now?: () => string;
  readonly sleepMs?: (ms: number) => Promise<void>;
  readonly jitterMs?: (attemptIndex: number) => number;
}

export interface CmipOpenAiEnvConfig {
  readonly apiKey: string;
  readonly organizationId: string | null;
  readonly projectId: string | null;
  readonly modelPrimary: string | null;
  readonly modelFallback: string | null;
  readonly modelRepair: string | null;
  readonly enableWebSearch: boolean;
  readonly maxOutputTokens: number;
  readonly timeoutMs: number;
  readonly maxAttempts: number;
  readonly reasoningEffort: CmipOpenAiReasoningEffort;
  readonly serviceTier: CmipOpenAiServiceTier;
  readonly allowLiveSmoke: boolean;
}

export interface CmipOpenAiModelProfileResolution {
  readonly profile: CmipModelProfile;
  readonly model: string;
  readonly capabilities: CmipOpenAiModelCapabilities;
}

export interface CmipOpenAiModelCapabilities {
  readonly structuredOutputs: boolean;
  readonly reasoningEffort: boolean;
  readonly webSearch: boolean;
  readonly temperature: boolean;
}

export interface CmipOpenAiMappedRequest {
  readonly model: string;
  readonly input: readonly {
    readonly role: "system" | "developer" | "user";
    readonly content: string;
  }[];
  readonly text: {
    readonly format: {
      readonly type: "json_schema";
      readonly name: "cmip_report";
      readonly description: string;
      readonly strict: true;
      readonly schema: Record<string, unknown>;
    };
  };
  readonly max_output_tokens: number;
  readonly store: false;
  readonly metadata: Record<string, string>;
  readonly truncation: "disabled";
  readonly tools?: readonly CmipOpenAiMappedTool[];
  readonly tool_choice?: CmipOpenAiToolChoice;
  readonly parallel_tool_calls?: false;
  readonly include?: readonly string[];
  readonly reasoning?: {
    readonly effort: CmipOpenAiReasoningEffort;
  };
  readonly temperature?: number;
  readonly service_tier?: CmipOpenAiServiceTier;
}

export interface CmipOpenAiMappedTool {
  readonly type: "web_search";
  readonly search_context_size: "low" | "medium" | "high";
}

export interface CmipOpenAiProviderExecutionRequest {
  readonly body: CmipOpenAiMappedRequest;
  readonly timeoutMs: number;
  readonly attemptIndex: number;
  readonly executionId: string;
  readonly abortSignal?: AbortSignal;
}

export interface CmipOpenAiProviderExecutionResponse {
  readonly responseId: string | null;
  readonly status: CmipOpenAiProviderStatus;
  readonly model: string | null;
  readonly serviceTier: string | null;
  readonly outputText: string | null;
  readonly refusal: CmipOpenAiProviderRefusal | null;
  readonly incompleteDetails: string | null;
  readonly error: CmipOpenAiProviderError | null;
  readonly usage: CmipOpenAiUsage | null;
  readonly toolCalls: number;
  readonly toolSources: readonly CmipOpenAiToolSource[];
}

export interface CmipOpenAiProviderRefusal {
  readonly message: string;
  readonly category: string | null;
}

export interface CmipOpenAiProviderError {
  readonly code: string;
  readonly message: string;
  readonly status: number | null;
}

export interface CmipOpenAiUsage {
  readonly inputTokens: number | null;
  readonly cachedInputTokens: number | null;
  readonly outputTokens: number | null;
  readonly reasoningTokens: number | null;
  readonly totalTokens: number | null;
}

export interface CmipOpenAiToolSource {
  readonly url: string;
  readonly title: string | null;
}

export interface CmipOpenAiProvider {
  readonly providerName: string;
  execute(request: CmipOpenAiProviderExecutionRequest): Promise<CmipOpenAiProviderExecutionResponse>;
}

export interface CmipOpenAiExecutionRecord {
  readonly executionVersion: string;
  readonly executionId: string;
  readonly packageId: string;
  readonly packageSemanticHash: string;
  readonly status: CmipOpenAiExecutionStatus;
  readonly responseId: string | null;
  readonly model: string | null;
  readonly serviceTier: string | null;
  readonly report: CmipReportEnvelope | null;
  readonly canonicalValid: boolean;
  readonly errors: readonly CmipOpenAiIssue[];
  readonly warnings: readonly CmipOpenAiIssue[];
  readonly usage: CmipOpenAiUsage | null;
  readonly trace: CmipOpenAiExecutionTrace;
  readonly integrity: CmipOpenAiExecutionIntegrity;
}

export interface CmipOpenAiExecutionTrace {
  readonly adapterVersion: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly executionMode: CmipOpenAiExecutionMode;
  readonly provider: string;
  readonly request: {
    readonly modelProfile: CmipModelProfile;
    readonly resolvedModel: string | null;
    readonly responseFormat: "json_schema";
    readonly strictOutput: true;
    readonly store: false;
    readonly toolChoice: CmipOpenAiToolChoice;
    readonly webSearchEnabled: boolean;
    readonly maxOutputTokens: number;
    readonly timeoutMs: number;
  };
  readonly schemaCompatibility: CmipOpenAiSchemaCompatibilityReport;
  readonly attempts: readonly CmipOpenAiAttemptTrace[];
  readonly repairAttempts: number;
  readonly toolSources: readonly CmipOpenAiToolSource[];
}

export interface CmipOpenAiAttemptTrace {
  readonly attemptIndex: number;
  readonly model: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly outcome: "success" | "retryable_error" | "terminal_error" | "repair_attempt" | "repair_success" | "repair_failed";
  readonly errorCode: string | null;
  readonly providerStatus: CmipOpenAiProviderStatus | null;
  readonly responseId: string | null;
  readonly retryDelayMs: number;
}

export interface CmipOpenAiSchemaCompatibilityReport {
  readonly compatibilityVersion: string;
  readonly compatible: boolean;
  readonly transformed: boolean;
  readonly transformations: readonly string[];
  readonly unsupportedKeywords: readonly string[];
  readonly providerSchemaHash: string;
  readonly canonicalSchemaHash: string;
}

export interface CmipOpenAiExecutionIntegrity {
  readonly algorithm: "sha256";
  readonly requestHash: string;
  readonly outputTextHash: string | null;
  readonly canonicalReportHash: string | null;
  readonly executionResultHash: string;
}

export type CmipOpenAiExecutionResult =
  | {
      readonly ok: true;
      readonly result: CmipOpenAiExecutionRecord;
      readonly warnings: readonly CmipOpenAiIssue[];
      readonly errors: [];
    }
  | {
      readonly ok: false;
      readonly result?: undefined;
      readonly warnings: readonly CmipOpenAiIssue[];
      readonly errors: readonly CmipOpenAiIssue[];
    };

export interface CmipOpenAiValidationResult {
  readonly valid: boolean;
  readonly errors: readonly { path: string; message: string; keyword?: string }[];
}
