import type { CmipReportEnvelope } from "../contracts";
import type { CmipRuntimeInputEnvelope } from "../runtime-input";
import type {
  CMIP_EXECUTION_MODES,
  CMIP_HISTORICAL_POLICIES,
  CMIP_MODEL_PACKAGE_VERSION,
  CMIP_MODEL_PROFILES,
  CMIP_PREVIOUS_REPORT_POLICIES,
  CMIP_RETRY_REASONS,
  CMIP_TOKEN_BUDGET_PROFILES,
  CMIP_WEB_SEARCH_POLICIES,
} from "./constants";
import type { CmipModelPackageErrorCode } from "./errors";

export type CmipExecutionMode = (typeof CMIP_EXECUTION_MODES)[number];
export type CmipWebSearchPolicy = (typeof CMIP_WEB_SEARCH_POLICIES)[number];
export type CmipHistoricalPolicy = (typeof CMIP_HISTORICAL_POLICIES)[number];
export type CmipPreviousReportPolicy = (typeof CMIP_PREVIOUS_REPORT_POLICIES)[number];
export type CmipTokenBudgetProfile = (typeof CMIP_TOKEN_BUDGET_PROFILES)[number];
export type CmipModelProfile = (typeof CMIP_MODEL_PROFILES)[number];
export type CmipRetryReason = (typeof CMIP_RETRY_REASONS)[number];

export type CmipModelJsonPrimitive = string | number | boolean | null;
export type CmipModelJsonValue = CmipModelJsonPrimitive | readonly CmipModelJsonValue[] | { readonly [key: string]: CmipModelJsonValue };

export interface CmipModelPackageBuildRequest {
  readonly runtimeInput: CmipRuntimeInputEnvelope;
  readonly previousReport?: CmipReportEnvelope | null;
  readonly execution: CmipExecutionRequest;
}

export interface CmipExecutionRequest {
  readonly executionId: string;
  readonly requestedAt: string;
  readonly mode: CmipExecutionMode;
  readonly outputLanguage: "fa";
  readonly timezone: string;
  readonly reportType: "morning_brief";
  readonly requestedHorizons: readonly ["1D" | "7D" | "30D", ...("1D" | "7D" | "30D")[]];
  readonly webSearchPolicy: CmipWebSearchPolicy;
  readonly historicalPolicy: CmipHistoricalPolicy;
  readonly previousReportPolicy: CmipPreviousReportPolicy;
  readonly tokenBudgetProfile: CmipTokenBudgetProfile;
}

export interface CmipModelExecutionPackage {
  readonly packageVersion: typeof CMIP_MODEL_PACKAGE_VERSION;
  readonly packageId: string;
  readonly executionId: string;
  readonly createdAt: string;
  readonly versions: {
    readonly architectureVersion: string;
    readonly outputContractVersion: string;
    readonly runtimeInputVersion: string;
    readonly intelligenceSpecVersion: string;
    readonly normalizationVersion: string;
    readonly promptBuilderVersion: string;
  };
  readonly messages: readonly CmipModelMessage[];
  readonly outputContract: {
    readonly schemaName: string;
    readonly schemaVersion: string;
    readonly strict: true;
    readonly schema: Record<string, unknown>;
  };
  readonly toolPolicy: CmipToolPolicy;
  readonly executionConfig: CmipModelExecutionConfig;
  readonly contextBudget: CmipContextBudgetReport;
  readonly trace: CmipModelPackageTrace;
  readonly integrity: CmipPackageIntegrity;
}

export interface CmipModelMessage {
  readonly role: "system" | "developer" | "user";
  readonly name: string;
  readonly content: string;
  readonly contentHash: string;
}

export interface CmipToolPolicy {
  readonly policyVersion: string;
  readonly webSearch: {
    readonly mode: CmipWebSearchPolicy;
    readonly allowedPurposes: readonly string[];
    readonly forbiddenPurposes: readonly string[];
    readonly maxSearchQueries: number;
    readonly requireSourceCitation: boolean;
    readonly allowNumericalOverride: boolean;
  };
}

export interface CmipModelExecutionConfig {
  readonly modelProfile: CmipModelProfile;
  readonly reasoningProfile: "standard" | "high";
  readonly responseFormat: "json_schema";
  readonly strictOutput: true;
  readonly temperaturePolicy: "provider_default" | "fixed_zero_if_supported";
  readonly maxOutputTokens: number;
  readonly timeoutBudgetMs: number;
  readonly retryPolicy: CmipRetryPolicy;
}

export interface CmipRetryPolicy {
  readonly maxAttempts: number;
  readonly retryOn: readonly CmipRetryReason[];
  readonly schemaRepairAttempts: number;
}

export interface CmipContextBudgetReport {
  readonly profile: CmipTokenBudgetProfile;
  readonly estimatedInputTokens: number;
  readonly estimatedStaticTokens: number;
  readonly estimatedRuntimeTokens: number;
  readonly estimatedSchemaTokens: number;
  readonly maxInputTokens: number;
  readonly reservedOutputTokens: number;
  readonly withinBudget: boolean;
  readonly reductionsApplied: readonly CmipContextReduction[];
}

export interface CmipContextReduction {
  readonly reductionId: string;
  readonly reason: string;
  readonly affectedPaths: readonly string[];
  readonly beforeBytes: number;
  readonly afterBytes: number;
}

export interface CmipRedactionTrace {
  readonly path: string;
  readonly redactionType: string;
  readonly placeholder: string;
}

export interface CmipInjectionFinding {
  readonly policyVersion: string;
  readonly patternId: string;
  readonly path: string;
  readonly sourceRefs: readonly string[];
  readonly matchedText: string;
}

export interface CmipModelPackageTrace {
  readonly buildStartedAt: string;
  readonly buildCompletedAt: string;
  readonly inputIds: {
    readonly runtimeInputId: string;
    readonly previousReportId: string | null;
  };
  readonly validation: {
    readonly runtimeInputValid: boolean;
    readonly previousReportValid: boolean | null;
  };
  readonly redactions: readonly CmipRedactionTrace[];
  readonly injectionFindings: readonly CmipInjectionFinding[];
  readonly contextReductions: readonly CmipContextReduction[];
  readonly includedSections: readonly string[];
  readonly excludedSections: readonly string[];
  readonly warnings: readonly string[];
}

export interface CmipPackageIntegrity {
  readonly algorithm: "sha256";
  readonly systemInstructionsHash: string;
  readonly intelligenceContextHash: string;
  readonly runtimeContextHash: string;
  readonly outputSchemaHash: string;
  readonly semanticPackageHash: string;
  readonly instancePackageHash: string;
  readonly fullPackageHash: string;
}

export type CmipModelPackageBuildResult =
  | {
      readonly ok: true;
      readonly package: CmipModelExecutionPackage;
      readonly warnings: readonly CmipModelPackageWarning[];
      readonly errors: [];
    }
  | {
      readonly ok: false;
      readonly package?: undefined;
      readonly warnings: readonly CmipModelPackageWarning[];
      readonly errors: readonly CmipModelPackageError[];
    };

export interface CmipModelPackageIssue {
  readonly code: CmipModelPackageErrorCode;
  readonly path: string;
  readonly message: string;
  readonly severity: "info" | "warning" | "error" | "critical";
  readonly sourceRefs: readonly string[];
}

export type CmipModelPackageWarning = CmipModelPackageIssue;
export type CmipModelPackageError = CmipModelPackageIssue;

export interface CmipPackageValidationResult {
  readonly valid: boolean;
  readonly errors: readonly { path: string; message: string; keyword?: string }[];
}
