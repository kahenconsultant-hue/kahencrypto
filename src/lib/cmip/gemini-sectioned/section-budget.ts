import sampleOutput from "../contracts/sample-output.json";
import type { CmipReportEnvelope } from "../contracts";
import type { CmipModelExecutionPackage } from "../model-package";
import { stableStringify } from "../model-package";
import type { CmipGeminiResolvedModelProfile } from "../gemini/types";
import { CMIP_GEMINI_SECTION_BUDGET_VERSION, CMIP_GEMINI_SECTION_ORDER } from "./constants";
import { sectionFromCmipReport } from "./report-assembler";
import { buildCmipGeminiSectionContext } from "./section-context";
import { getCmipGeminiSectionDefinition, providerSchemaForGeminiSection } from "./section-plan";
import type { CmipGeminiSectionId, CmipProviderUsage } from "./types";

export type CmipGeminiSectionHeadroomClassification = "SAFE" | "LOW_HEADROOM" | "INSUFFICIENT_BUDGET" | "UNKNOWN_PROVIDER_LIMIT";
export type CmipGeminiGenerationUtilizationClassification = "HEALTHY" | "ELEVATED" | "EXHAUSTED" | "PROVIDER_USAGE_INCONSISTENT";

export interface CmipGeminiSectionBudget {
  readonly sectionId: CmipGeminiSectionId;
  readonly maxOutputTokens: number;
  readonly expectedVisibleOutputTokens: number;
  readonly reservedReasoningTokens: number;
  readonly reservedSerializationTokens: number;
  readonly totalRequiredGenerationTokens: number;
  readonly safetyMultiplier: number;
  readonly modelProfileLimit: number | null;
  readonly budgetVersion: typeof CMIP_GEMINI_SECTION_BUDGET_VERSION;
}

export interface CmipGeminiSectionBudgetAnalysis extends CmipGeminiSectionBudget {
  readonly version: typeof CMIP_GEMINI_SECTION_BUDGET_VERSION;
  readonly fixtureBytes: number;
  readonly schemaBytes: number;
  readonly contextEstimatedTokens: number;
  readonly providerModelMaxOutputTokens: number | null;
  readonly headroomRatio: number;
  readonly classification: CmipGeminiSectionHeadroomClassification;
}

export interface CmipGeminiSectionGenerationUtilization {
  readonly visibleOutputUtilization: number | null;
  readonly reasoningUtilization: number | null;
  readonly combinedGenerationUtilization: number | null;
  readonly reasoningShareOfCombinedGeneration: number | null;
  readonly combinedGeneratedTokens: number | null;
  readonly classification: CmipGeminiGenerationUtilizationClassification | null;
  readonly reasoningDominated: boolean;
}

export interface CmipGeminiSectionContextAudit {
  readonly sectionId: CmipGeminiSectionId;
  readonly staticSystemTokens: number;
  readonly intelligenceContextTokens: number;
  readonly runtimeContextTokens: number;
  readonly outputContractTokens: number;
  readonly dependencySummaryTokens: number;
  readonly sectionSpecificInstructionTokens: number;
  readonly totalEstimatedInputTokens: number;
}

export const CMIP_GEMINI_SECTION_SERIALIZATION_RESERVE_POLICY = {
  fixedMinimumTokens: 256,
  ratioOfVisibleOutput: 0.25,
  version: CMIP_GEMINI_SECTION_BUDGET_VERSION,
} as const;

const initialBudgetInputs = [
  { sectionId: "meta_decision", maxOutputTokens: 3000, expectedVisibleOutputTokens: 320, reservedReasoningTokens: 1200, contextEstimatedTokens: 6900 },
  { sectionId: "engines_reasons", maxOutputTokens: 7000, expectedVisibleOutputTokens: 1431, reservedReasoningTokens: 2500, contextEstimatedTokens: 7200 },
  { sectionId: "delta_attribution", maxOutputTokens: 2000, expectedVisibleOutputTokens: 111, reservedReasoningTokens: 800, contextEstimatedTokens: 7100 },
  { sectionId: "scenarios_triggers", maxOutputTokens: 4000, expectedVisibleOutputTokens: 322, reservedReasoningTokens: 1800, contextEstimatedTokens: 7150 },
  { sectionId: "coins", maxOutputTokens: 6000, expectedVisibleOutputTokens: 996, reservedReasoningTokens: 2500, contextEstimatedTokens: 7050 },
  { sectionId: "confidence_memory", maxOutputTokens: 2500, expectedVisibleOutputTokens: 177, reservedReasoningTokens: 1000, contextEstimatedTokens: 7150 },
  { sectionId: "charts_audit", maxOutputTokens: 6000, expectedVisibleOutputTokens: 990, reservedReasoningTokens: 2500, contextEstimatedTokens: 7350 },
] as const;

export const CMIP_GEMINI_SECTION_BUDGETS: readonly CmipGeminiSectionBudget[] = initialBudgetInputs.map((input) => {
  const reservedSerializationTokens = calculateSerializationReserve(input.expectedVisibleOutputTokens);
  const totalRequiredGenerationTokens = input.expectedVisibleOutputTokens + input.reservedReasoningTokens + reservedSerializationTokens;
  return {
    sectionId: input.sectionId,
    maxOutputTokens: input.maxOutputTokens,
    expectedVisibleOutputTokens: input.expectedVisibleOutputTokens,
    reservedReasoningTokens: input.reservedReasoningTokens,
    reservedSerializationTokens,
    totalRequiredGenerationTokens,
    safetyMultiplier: round2(input.maxOutputTokens / totalRequiredGenerationTokens),
    modelProfileLimit: null,
    budgetVersion: CMIP_GEMINI_SECTION_BUDGET_VERSION,
  };
});

export function getCmipGeminiSectionBudget(sectionId: CmipGeminiSectionId): CmipGeminiSectionBudget {
  const budget = CMIP_GEMINI_SECTION_BUDGETS.find((item) => item.sectionId === sectionId);
  if (!budget) throw new Error(`Unknown Gemini section budget: ${sectionId}`);
  return budget;
}

export function analyzeCmipGeminiSectionBudgets(params: {
  readonly modelPackage?: CmipModelExecutionPackage;
  readonly modelMaxOutputTokens?: number | null;
  readonly fixtureReport?: CmipReportEnvelope;
} = {}): readonly CmipGeminiSectionBudgetAnalysis[] {
  const fixtureReport = params.fixtureReport ?? (sampleOutput as unknown as CmipReportEnvelope);
  const modelMax = params.modelMaxOutputTokens ?? null;
  return CMIP_GEMINI_SECTION_ORDER.map((sectionId) => {
    const budget = getCmipGeminiSectionBudget(sectionId);
    const section = sectionFromCmipReport(sectionId, fixtureReport);
    const sectionJson = stableStringify(section);
    const fixtureBytes = Buffer.byteLength(sectionJson, "utf8");
    const estimatedOutputTokens = estimateCmipGeminiSectionTokens(sectionJson);
    const contextEstimatedTokens = params.modelPackage
      ? estimateCmipGeminiSectionContextTokens(params.modelPackage, sectionId)
      : initialBudgetInputs.find((item) => item.sectionId === sectionId)?.contextEstimatedTokens ?? 0;
    const headroomRatio = round2(budget.maxOutputTokens / Math.max(1, budget.totalRequiredGenerationTokens));
    return {
      ...budget,
      expectedVisibleOutputTokens: estimatedOutputTokens,
      reservedSerializationTokens: calculateSerializationReserve(estimatedOutputTokens),
      totalRequiredGenerationTokens: estimatedOutputTokens + budget.reservedReasoningTokens + calculateSerializationReserve(estimatedOutputTokens),
      safetyMultiplier: round2(budget.maxOutputTokens / Math.max(1, estimatedOutputTokens + budget.reservedReasoningTokens + calculateSerializationReserve(estimatedOutputTokens))),
      modelProfileLimit: modelMax,
      version: CMIP_GEMINI_SECTION_BUDGET_VERSION,
      fixtureBytes,
      schemaBytes: schemaBytesFor(sectionId),
      contextEstimatedTokens,
      providerModelMaxOutputTokens: modelMax,
      headroomRatio,
      classification: classifyCmipGeminiSectionHeadroom({
        budgetTokens: budget.maxOutputTokens,
        requiredGenerationTokens: estimatedOutputTokens + budget.reservedReasoningTokens + calculateSerializationReserve(estimatedOutputTokens),
        modelMaxOutputTokens: modelMax,
      }),
    };
  });
}

export function analyzeCmipGeminiSectionContext(params: {
  readonly modelPackage: CmipModelExecutionPackage;
  readonly sectionId: CmipGeminiSectionId;
}): CmipGeminiSectionContextAudit {
  const [system, intelligence, outputContract, runtime] = params.modelPackage.messages;
  const section = getCmipGeminiSectionDefinition(params.sectionId);
  const sectionContext = buildCmipGeminiSectionContext({ modelPackage: params.modelPackage, section, completedSections: {} });
  const sectionContextTokens = estimateCmipGeminiSectionTokens(sectionContext.serializedContext);
  const dependencySummaryTokens = estimateCmipGeminiSectionTokens(stableStringify(sectionContext.context.dependencySummary ?? {}));
  const sectionSpecificInstructionTokens = Math.max(0, sectionContextTokens - dependencySummaryTokens);
  const staticSystemTokens = estimateCmipGeminiSectionTokens(system?.content ?? "");
  const intelligenceContextTokens = estimateCmipGeminiSectionTokens(intelligence?.content ?? "");
  const runtimeContextTokens = estimateCmipGeminiSectionTokens(runtime?.content ?? "");
  const outputContractTokens = estimateCmipGeminiSectionTokens(outputContract?.content ?? "");
  return {
    sectionId: params.sectionId,
    staticSystemTokens,
    intelligenceContextTokens,
    runtimeContextTokens,
    outputContractTokens,
    dependencySummaryTokens,
    sectionSpecificInstructionTokens,
    totalEstimatedInputTokens: staticSystemTokens + intelligenceContextTokens + runtimeContextTokens + outputContractTokens + dependencySummaryTokens + sectionSpecificInstructionTokens,
  };
}

export function validateCmipGeminiSectionBudgetAgainstModel(sectionId: CmipGeminiSectionId, model: Pick<CmipGeminiResolvedModelProfile, "maxOutputTokens">): null | {
  readonly path: string;
  readonly message: string;
} {
  const budget = getCmipGeminiSectionBudget(sectionId);
  if (typeof model.maxOutputTokens === "number" && budget.maxOutputTokens > model.maxOutputTokens) {
    return {
      path: `$.sections.${sectionId}.budget.maxOutputTokens`,
      message: `Gemini section budget ${budget.maxOutputTokens} exceeds resolved model max output tokens ${model.maxOutputTokens}.`,
    };
  }
  return null;
}

export function estimateCmipGeminiSectionTokens(value: string): number {
  return Math.ceil(value.length / 4);
}

export function calculateSerializationReserve(expectedVisibleOutputTokens: number): number {
  return Math.max(
    CMIP_GEMINI_SECTION_SERIALIZATION_RESERVE_POLICY.fixedMinimumTokens,
    Math.ceil(expectedVisibleOutputTokens * CMIP_GEMINI_SECTION_SERIALIZATION_RESERVE_POLICY.ratioOfVisibleOutput),
  );
}

export function calculateCmipGeminiGenerationUtilization(params: {
  readonly usage: CmipProviderUsage;
  readonly maxOutputTokens: number;
}): CmipGeminiSectionGenerationUtilization {
  const outputTokens = params.usage.outputTokens;
  const reasoningTokens = params.usage.reasoningTokens;
  if (params.maxOutputTokens <= 0 || (outputTokens !== null && outputTokens < 0) || (reasoningTokens !== null && reasoningTokens < 0)) {
    return inconsistent();
  }
  if (outputTokens === null || reasoningTokens === null) {
    return {
      visibleOutputUtilization: outputTokens === null ? null : utilization(outputTokens, params.maxOutputTokens),
      reasoningUtilization: reasoningTokens === null ? null : utilization(reasoningTokens, params.maxOutputTokens),
      combinedGenerationUtilization: null,
      reasoningShareOfCombinedGeneration: null,
      combinedGeneratedTokens: null,
      classification: null,
      reasoningDominated: false,
    };
  }
  const combinedGeneratedTokens = outputTokens + reasoningTokens;
  const combinedGenerationUtilization = utilization(combinedGeneratedTokens, params.maxOutputTokens);
  const reasoningShareOfCombinedGeneration = combinedGeneratedTokens > 0 ? utilization(reasoningTokens, combinedGeneratedTokens) : 0;
  return {
    visibleOutputUtilization: utilization(outputTokens, params.maxOutputTokens),
    reasoningUtilization: utilization(reasoningTokens, params.maxOutputTokens),
    combinedGenerationUtilization,
    reasoningShareOfCombinedGeneration,
    combinedGeneratedTokens,
    classification: classifyCmipGeminiGenerationUtilization(combinedGenerationUtilization),
    reasoningDominated: reasoningShareOfCombinedGeneration >= 80,
  };
}

export function classifyCmipGeminiGenerationUtilization(utilizationPercent: number): CmipGeminiGenerationUtilizationClassification {
  if (!Number.isFinite(utilizationPercent) || utilizationPercent < 0 || utilizationPercent > 100) return "PROVIDER_USAGE_INCONSISTENT";
  if (utilizationPercent >= 90) return "EXHAUSTED";
  if (utilizationPercent >= 70) return "ELEVATED";
  return "HEALTHY";
}

export function classifyCmipGeminiSectionHeadroom(params: {
  readonly budgetTokens: number;
  readonly requiredGenerationTokens: number;
  readonly modelMaxOutputTokens?: number | null;
}): CmipGeminiSectionHeadroomClassification {
  if (params.modelMaxOutputTokens == null) return "UNKNOWN_PROVIDER_LIMIT";
  if (params.budgetTokens > params.modelMaxOutputTokens) return "INSUFFICIENT_BUDGET";
  const ratio = params.budgetTokens / Math.max(1, params.requiredGenerationTokens);
  if (ratio < 1.15) return "INSUFFICIENT_BUDGET";
  if (ratio < 1.5) return "LOW_HEADROOM";
  return "SAFE";
}

function estimateCmipGeminiSectionContextTokens(modelPackage: CmipModelExecutionPackage, sectionId: CmipGeminiSectionId): number {
  const audit = analyzeCmipGeminiSectionContext({ modelPackage, sectionId });
  return audit.totalEstimatedInputTokens;
}

function schemaBytesFor(sectionId: CmipGeminiSectionId): number {
  return Buffer.byteLength(stableStringify(providerSchemaForGeminiSection(getCmipGeminiSectionDefinition(sectionId))), "utf8");
}

function utilization(tokens: number, maxOutputTokens: number): number {
  return round2((tokens / maxOutputTokens) * 100);
}

function inconsistent(): CmipGeminiSectionGenerationUtilization {
  return {
    visibleOutputUtilization: null,
    reasoningUtilization: null,
    combinedGenerationUtilization: null,
    reasoningShareOfCombinedGeneration: null,
    combinedGeneratedTokens: null,
    classification: "PROVIDER_USAGE_INCONSISTENT",
    reasoningDominated: false,
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
