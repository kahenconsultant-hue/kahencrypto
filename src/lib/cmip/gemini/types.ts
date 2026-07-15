import type { CmipReportEnvelope } from "../contracts";
import type { CmipProviderExecutionTaskType } from "../experimental-full-report-ai";
import type { CmipModelExecutionPackage, CmipModelProfile, CmipToolPolicy } from "../model-package";
import type { CmipProviderNeutralExecutionResult } from "../providers";
import type { CMIP_GEMINI_MODEL_PROFILES, CMIP_GEMINI_PROVIDER_STATUSES } from "./constants";
import type { CmipGeminiIssue } from "./errors";

export type CmipGeminiExecutionMode = "dry_run" | "live_smoke" | "preview";
export type CmipGeminiModelProfile = (typeof CMIP_GEMINI_MODEL_PROFILES)[number];
export type CmipGeminiProviderStatus = (typeof CMIP_GEMINI_PROVIDER_STATUSES)[number];
export type CmipGeminiRetryReason = "rate_limit" | "transport_error" | "timeout" | "provider_5xx" | "temporary_unavailable";

export interface CmipGeminiExecutionRequest {
  readonly modelPackage: CmipModelExecutionPackage;
  readonly taskType?: CmipProviderExecutionTaskType;
  readonly executionMode: CmipGeminiExecutionMode;
  readonly allowLiveGeminiSmoke?: boolean;
}

export interface CmipGeminiExecutionDependencies {
  readonly provider?: CmipGeminiProvider;
  readonly env?: Partial<Record<string, string | undefined>>;
  readonly now?: () => string;
  readonly sleepMs?: (ms: number) => Promise<void>;
  readonly jitterMs?: (attemptIndex: number) => number;
}

export interface CmipGeminiEnvConfig {
  readonly apiKey: string;
  readonly modelPrimary: string | null;
  readonly modelFallback: string | null;
  readonly modelRepair: string | null;
  readonly enableGoogleSearch: boolean;
  readonly maxOutputTokens: number;
  readonly timeoutMs: number;
  readonly maxAttempts: number;
  readonly thinkingLevel: "low" | "medium" | "high" | "auto" | null;
  readonly maxThinkingLevel: "minimal" | "low" | null;
  readonly allowLiveSmoke: boolean;
}

export interface CmipGeminiResolvedModelProfile {
  readonly profile: CmipGeminiModelProfile;
  readonly cmipModelProfile: CmipModelProfile;
  readonly modelId: string;
  readonly supportsInteractionsApi: boolean;
  readonly supportsStructuredOutput: boolean;
  readonly supportsGoogleSearch: boolean;
  readonly supportsThinkingLevel: boolean;
  readonly supportedThinkingLevels: readonly ("minimal" | "low" | "medium" | "high")[];
  readonly approvedThinkingLevels: readonly ("minimal" | "low")[];
  readonly maxInputTokens?: number;
  readonly maxOutputTokens?: number;
  readonly classification: "configured" | "preview" | "stable" | "experimental" | "test";
}

export interface CmipGeminiSchemaCompatibilityResult {
  readonly compatible: boolean;
  readonly providerSchema: Record<string, unknown>;
  readonly canonicalSchemaHash: string;
  readonly providerSchemaHash: string;
  readonly providerTransportSchemaHash: string;
  readonly transportMode: "compact_canonical_root_v3";
  readonly canonicalPostValidationRequired: true;
  readonly reconstructedEnvelope: true;
  readonly transformedKeywords: readonly {
    readonly path: string;
    readonly canonicalKeyword: string;
    readonly providerRepresentation: string;
    readonly enforcement: "gemini" | "post_validation";
  }[];
  readonly unsupportedKeywords: readonly {
    readonly path: string;
    readonly keyword: string;
  }[];
}

export interface CmipGeminiMappedRequest {
  readonly model: string;
  readonly input: string;
  readonly system_instruction: string;
  readonly store: false;
  readonly stream: false;
  readonly background: false;
  readonly response_format: {
    readonly type: "text";
    readonly mime_type: "application/json";
    readonly schema: Record<string, unknown>;
  };
  readonly generation_config: {
    readonly max_output_tokens: number;
    readonly thinking_level?: "minimal" | "low" | "medium" | "high";
  };
  readonly tools?: readonly CmipGeminiMappedTool[];
}

export interface CmipGeminiMappedTool {
  readonly type: "google_search";
}

export interface CmipGeminiProviderExecutionRequest {
  readonly body: CmipGeminiMappedRequest;
  readonly timeoutMs: number;
  readonly attemptIndex: number;
  readonly executionId: string;
  readonly abortSignal?: AbortSignal;
}

export interface CmipGeminiProviderExecutionResponse {
  readonly responseId: string | null;
  readonly status: CmipGeminiProviderStatus;
  readonly model: string | null;
  readonly serviceTier: string | null;
  readonly outputText: string | null;
  readonly refusal: CmipGeminiProviderRefusal | null;
  readonly incompleteReason: string | null;
  readonly incompleteDetails: string | null;
  readonly finishReason: string | null;
  readonly error: CmipGeminiProviderError | null;
  readonly usage: CmipGeminiUsage | null;
  readonly toolCalls: number;
  readonly toolSources: readonly CmipGeminiToolSource[];
}

export interface CmipGeminiProviderRefusal {
  readonly message: string;
  readonly category: string | null;
}

export interface CmipGeminiProviderError {
  readonly code: string;
  readonly message: string;
  readonly status: number | null;
}

export interface CmipGeminiUsage {
  readonly inputTokens: number | null;
  readonly cachedInputTokens: number | null;
  readonly outputTokens: number | null;
  readonly reasoningTokens: number | null;
  readonly totalTokens: number | null;
}

export interface CmipGeminiToolSource {
  readonly url: string;
  readonly title: string | null;
}

export interface CmipGeminiProvider {
  readonly providerName: string;
  execute(request: CmipGeminiProviderExecutionRequest): Promise<CmipGeminiProviderExecutionResponse>;
}

export interface CmipGeminiAttemptTrace {
  readonly attemptIndex: number;
  readonly model: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly outcome: "success" | "retryable_error" | "terminal_error" | "repair_attempt" | "repair_success" | "repair_failed";
  readonly errorCode: string | null;
  readonly providerStatus: CmipGeminiProviderStatus | null;
  readonly responseId: string | null;
  readonly retryDelayMs: number;
}

export interface CmipGeminiExecutionTrace {
  readonly adapterVersion: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly executionMode: CmipGeminiExecutionMode;
  readonly provider: string;
  readonly request: {
    readonly cmipModelProfile: CmipModelProfile;
    readonly geminiProfile: CmipGeminiModelProfile;
    readonly resolvedModel: string | null;
    readonly responseFormat: "application/json";
    readonly store: false;
    readonly googleSearchEnabled: boolean;
    readonly maxOutputTokens: number;
    readonly timeoutMs: number;
  };
  readonly schemaCompatibility: CmipGeminiSchemaCompatibilityResult;
  readonly attempts: readonly CmipGeminiAttemptTrace[];
  readonly repairAttempts: number;
  readonly toolSources: readonly CmipGeminiToolSource[];
}

export type CmipGeminiExecutionResult =
  | {
      readonly ok: true;
      readonly result: CmipProviderNeutralExecutionResult;
      readonly warnings: readonly CmipGeminiIssue[];
      readonly errors: [];
    }
  | {
      readonly ok: false;
      readonly result?: CmipProviderNeutralExecutionResult;
      readonly warnings: readonly CmipGeminiIssue[];
      readonly errors: readonly CmipGeminiIssue[];
    };

export interface CmipGeminiValidationResult {
  readonly valid: boolean;
  readonly errors: readonly { path: string; message: string; keyword?: string }[];
}

export interface CmipGeminiParsedOutput {
  readonly report: CmipReportEnvelope | null;
  readonly outputTextHash: string | null;
  readonly canonicalReportHash: string | null;
  readonly jsonParsed: boolean;
  readonly errors: readonly CmipGeminiIssue[];
}

export interface CmipGeminiToolMappingResult {
  readonly tools: readonly CmipGeminiMappedTool[];
  readonly enabled: boolean;
  readonly warnings: readonly CmipGeminiIssue[];
}

export interface CmipGeminiToolMappingInput {
  readonly toolPolicy: CmipToolPolicy;
  readonly enableGoogleSearch: boolean;
  readonly capabilities: Pick<CmipGeminiResolvedModelProfile, "supportsGoogleSearch">;
  readonly executionMode: CmipGeminiExecutionMode;
}
