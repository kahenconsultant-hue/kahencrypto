import type { CmipReportEnvelope } from "../contracts";
import type { CmipModelExecutionPackage } from "../model-package";
import type {
  CMIP_PROVIDER_ERROR_CODES,
  CMIP_PROVIDER_FALLBACK_POLICIES,
  CMIP_PROVIDER_IDS,
  CMIP_PROVIDER_STATUSES,
  CMIP_PROVIDER_WARNING_CODES,
} from "./constants";

export type CmipProviderId = (typeof CMIP_PROVIDER_IDS)[number];
export type CmipProviderExecutionStatus = (typeof CMIP_PROVIDER_STATUSES)[number];
export type CmipProviderFallbackPolicy = (typeof CMIP_PROVIDER_FALLBACK_POLICIES)[number];
export type CmipProviderErrorCode = (typeof CMIP_PROVIDER_ERROR_CODES)[number] | string;
export type CmipProviderWarningCode = (typeof CMIP_PROVIDER_WARNING_CODES)[number] | string;

export interface CmipProviderSelection {
  readonly primary: CmipProviderId;
  readonly fallback: CmipProviderId | null;
  readonly fallbackPolicy: CmipProviderFallbackPolicy;
}

export interface CmipProviderExecutionRequest {
  readonly modelPackage: CmipModelExecutionPackage;
  readonly selection: CmipProviderSelection;
  readonly executionMode: "dry_run" | "preview" | "live_smoke";
  readonly allowLiveGeminiSmoke?: boolean;
  readonly allowLiveOpenAiSmoke?: boolean;
}

export interface CmipProviderIssue {
  readonly code: CmipProviderErrorCode | CmipProviderWarningCode;
  readonly path: string;
  readonly message: string;
  readonly domain: "provider_router" | "openai" | "gemini";
  readonly severity: "info" | "warning" | "error" | "critical";
  readonly retryable: boolean;
  readonly sourceRefs: readonly string[];
}

export type CmipProviderWarning = CmipProviderIssue;
export type CmipProviderError = CmipProviderIssue;

export interface CmipProviderAttempt {
  readonly providerId: CmipProviderId;
  readonly attemptIndex: number;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly status: CmipProviderExecutionStatus;
  readonly providerRawStatus: string | null;
  readonly errorCode: string | null;
  readonly retryDelayMs: number;
}

export interface CmipProviderNeutralTrace {
  readonly routerVersion: string;
  readonly selectedProvider: CmipProviderId;
  readonly fallbackProvider: CmipProviderId | null;
  readonly fallbackPolicy: CmipProviderFallbackPolicy;
  readonly fallbackDecisions: readonly {
    readonly from: CmipProviderId;
    readonly to: CmipProviderId;
    readonly reason: string;
    readonly allowed: boolean;
  }[];
  readonly providerTrace: unknown;
}

export interface CmipProviderNeutralExecutionResult {
  readonly executionVersion: "CMIP-PROVIDER-EXECUTION-1.0";
  readonly executionId: string;
  readonly packageId: string;
  readonly semanticPackageHash: string;
  readonly providerId: CmipProviderId;
  readonly providerExecutionVersion: string;
  readonly status: CmipProviderExecutionStatus;
  readonly report: CmipReportEnvelope | null;
  readonly provider: {
    readonly name: CmipProviderId;
    readonly responseId: string | null;
    readonly model: string | null;
    readonly rawStatus: string | null;
    readonly serviceTier: string | null;
  };
  readonly usage: {
    readonly inputTokens: number | null;
    readonly cachedInputTokens: number | null;
    readonly outputTokens: number | null;
    readonly reasoningTokens: number | null;
    readonly totalTokens: number | null;
  };
  readonly timing: {
    readonly startedAt: string;
    readonly completedAt: string;
    readonly durationMs: number;
  };
  readonly validation: {
    readonly providerSchemaCompatible: boolean;
    readonly jsonParsed: boolean;
    readonly canonicalValid: boolean;
    readonly repairAttempted: boolean;
    readonly repairSucceeded: boolean;
  };
  readonly attempts: readonly CmipProviderAttempt[];
  readonly warnings: readonly CmipProviderWarning[];
  readonly errors: readonly CmipProviderError[];
  readonly trace: CmipProviderNeutralTrace;
}

export interface CmipProviderExecutor {
  execute(request: CmipProviderExecutionRequest): Promise<CmipProviderNeutralExecutionResult>;
}

export interface CmipProviderRouterDependencies {
  readonly openai?: CmipProviderExecutor;
  readonly gemini?: CmipProviderExecutor;
  readonly now?: () => string;
}
