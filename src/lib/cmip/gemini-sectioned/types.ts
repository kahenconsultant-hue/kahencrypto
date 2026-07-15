import type { CmipReport, CmipReportEnvelope } from "../contracts";
import type { CmipProviderExecutionTaskType } from "../experimental-full-report-ai";
import type { CmipModelExecutionPackage } from "../model-package";
import type { CmipProviderAttempt, CmipProviderError, CmipProviderNeutralExecutionResult, CmipProviderWarning } from "../providers";
import type { CmipGeminiEnvConfig, CmipGeminiProvider, CmipGeminiProviderStatus, CmipGeminiResolvedModelProfile, CmipGeminiUsage } from "../gemini/types";
import type { CMIP_GEMINI_SECTION_ERROR_CODES, CMIP_GEMINI_SECTION_IDS, CMIP_GEMINI_SECTION_WARNING_CODES } from "./constants";
import type { CmipGeminiSectionBudget, CmipGeminiSectionGenerationUtilization } from "./section-budget";
import type { CmipGeminiSectionThinkingTrace } from "./section-thinking";
import type { CmipGeminiSectionContextTrace } from "./section-context";

export type CmipGeminiSectionId = (typeof CMIP_GEMINI_SECTION_IDS)[number];
export type CmipGeminiSectionStatus = "success" | "failed" | "refused" | "incomplete";
export type CmipGeminiSectionErrorCode = (typeof CMIP_GEMINI_SECTION_ERROR_CODES)[number];
export type CmipGeminiSectionWarningCode = (typeof CMIP_GEMINI_SECTION_WARNING_CODES)[number];
export type CmipGeminiSectionIssueCode = CmipGeminiSectionErrorCode | CmipGeminiSectionWarningCode;

export type CmipProviderUsage = {
  readonly inputTokens: number | null;
  readonly cachedInputTokens: number | null;
  readonly outputTokens: number | null;
  readonly reasoningTokens: number | null;
  readonly totalTokens: number | null;
};

export interface CmipGeminiSectionIssue {
  readonly code: CmipGeminiSectionIssueCode | string;
  readonly path: string;
  readonly message: string;
  readonly domain: "gemini";
  readonly severity: "info" | "warning" | "error" | "critical";
  readonly retryable: boolean;
  readonly sourceRefs: readonly string[];
}

export type CmipGeminiSectionData =
  | CmipMetaDecisionSection
  | CmipEnginesReasonsSection
  | CmipDeltaAttributionSection
  | CmipScenariosTriggersSection
  | CmipCoinsSection
  | CmipConfidenceMemorySection
  | CmipChartsAuditSection;

export type CmipMetaDecisionSection = Pick<CmipReport, "meta" | "decision" | "executive_summary">;
export type CmipEnginesReasonsSection = Pick<CmipReport, "engine_scores" | "reasons">;
export type CmipDeltaAttributionSection = Pick<CmipReport, "delta" | "attribution">;
export type CmipScenariosTriggersSection = Pick<CmipReport, "scenarios" | "triggers">;
export type CmipCoinsSection = Pick<CmipReport, "coins">;
export type CmipConfidenceMemorySection = Pick<CmipReport, "confidence" | "decision_memory">;
export type CmipChartsAuditSection = Pick<CmipReport, "charts" | "audit">;

export interface CmipValidatedGeminiSections {
  readonly meta_decision: CmipMetaDecisionSection;
  readonly engines_reasons: CmipEnginesReasonsSection;
  readonly delta_attribution: CmipDeltaAttributionSection;
  readonly scenarios_triggers: CmipScenariosTriggersSection;
  readonly coins: CmipCoinsSection;
  readonly confidence_memory: CmipConfidenceMemorySection;
  readonly charts_audit: CmipChartsAuditSection;
}

export type CmipPartialGeminiSections = Partial<CmipValidatedGeminiSections>;

export interface CmipGeminiSectionDefinition {
  readonly sectionId: CmipGeminiSectionId;
  readonly title: string;
  readonly outputFields: readonly (keyof CmipReport)[];
  readonly dependsOn: readonly CmipGeminiSectionId[];
  readonly schema: Record<string, unknown>;
  readonly rationale: string;
}

export interface CmipGeminiSectionResult<T> {
  readonly sectionId: CmipGeminiSectionId;
  readonly status: CmipGeminiSectionStatus;
  readonly data: T | null;
  readonly providerResponseId: string | null;
  readonly providerRawStatus: string | null;
  readonly budget: CmipGeminiSectionBudget;
  readonly thinking: CmipGeminiSectionThinkingTrace;
  readonly context: CmipGeminiSectionContextTrace | null;
  readonly usage: CmipProviderUsage;
  readonly incomplete: CmipGeminiSectionIncompleteDiagnostics;
  readonly attempts: readonly CmipProviderAttempt[];
  readonly warnings: readonly CmipProviderWarning[];
  readonly errors: readonly CmipProviderError[];
  readonly validation: {
    readonly outerJsonParsed: boolean;
    readonly providerSchemaValid: boolean;
    readonly sectionCanonicalValid: boolean;
  };
}

export interface CmipGeminiSectionIncompleteDiagnostics {
  readonly incompleteReason: string | null;
  readonly incompleteDetails: string | null;
  readonly finishReason: string | null;
  readonly maxOutputTokensUsed: number;
  readonly generationUtilization: CmipGeminiSectionGenerationUtilization;
  readonly derivedBudgetExhaustionCode: "GEMINI_SECTION_GENERATION_BUDGET_EXHAUSTED" | null;
  readonly derivedReasoningDominatedCode: "GEMINI_SECTION_REASONING_DOMINATED" | null;
  readonly rootCause: "REASONING_OUTPUT_BUDGET_EXHAUSTED" | null;
  readonly partialOutputPresent: boolean;
  readonly partialOutputBytes: number;
}

export type CmipAnyGeminiSectionResult = CmipGeminiSectionResult<CmipGeminiSectionData>;

export interface CmipGeminiSectionExecutionRequest {
  readonly section: CmipGeminiSectionDefinition;
  readonly modelPackage: CmipModelExecutionPackage;
  readonly config: CmipGeminiEnvConfig;
  readonly model: CmipGeminiResolvedModelProfile;
  readonly provider: CmipGeminiProvider;
  readonly executionMode: "dry_run" | "preview" | "live_smoke";
  readonly completedSections: CmipPartialGeminiSections;
  readonly attemptOffset: number;
  readonly now: () => string;
}

export interface CmipGeminiSectionedExecutionRequest {
  readonly modelPackage: CmipModelExecutionPackage;
  readonly taskType?: CmipProviderExecutionTaskType;
  readonly executionMode: "dry_run" | "preview" | "live_smoke";
  readonly allowLiveGeminiSectionedSmoke?: boolean;
}

export interface CmipGeminiSectionedExecutionDependencies {
  readonly provider?: CmipGeminiProvider;
  readonly env?: Partial<Record<string, string | undefined>>;
  readonly now?: () => string;
}

export interface CmipGeminiSectionedTrace {
  readonly adapterVersion: string;
  readonly planVersion: string;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly executionMode: "dry_run" | "preview" | "live_smoke";
  readonly selectedModel: string | null;
  readonly sectionOrder: readonly CmipGeminiSectionId[];
  readonly completedSectionIds: readonly CmipGeminiSectionId[];
  readonly failedSectionId: CmipGeminiSectionId | null;
  readonly unexecutedSectionIds: readonly CmipGeminiSectionId[];
  readonly requestCount: number;
  readonly sectionUsage: readonly {
    readonly sectionId: CmipGeminiSectionId;
    readonly usage: CmipProviderUsage;
    readonly durationMs: number;
    readonly providerStatus: string | null;
    readonly budget: CmipGeminiSectionBudget;
    readonly thinking: CmipGeminiSectionThinkingTrace;
    readonly context: CmipGeminiSectionContextTrace | null;
    readonly incomplete: CmipGeminiSectionIncompleteDiagnostics;
  }[];
  readonly finalCanonicalValidation: {
    readonly valid: boolean;
    readonly errorPaths: readonly string[];
  };
}

export interface CmipGeminiSectionedExecutionSummary {
  readonly result: CmipProviderNeutralExecutionResult;
  readonly sections: readonly CmipAnyGeminiSectionResult[];
  readonly assembledReport: CmipReportEnvelope | null;
}

export interface CmipGeminiSectionProviderOutput {
  readonly sectionId: CmipGeminiSectionId;
  readonly responseId: string | null;
  readonly status: CmipGeminiProviderStatus;
  readonly model: string | null;
  readonly outputText: string | null;
  readonly usage: CmipGeminiUsage | null;
}
