import { CMIP_GEMINI_SECTION_ORDER } from "./constants";
import type { CmipGeminiSectionedExecutionSummary, CmipGeminiSectionedTrace } from "./types";

export function formatCmipGeminiSectionedLiveSmokeSummary(summary: CmipGeminiSectionedExecutionSummary): readonly string[] {
  const result = summary.result;
  const trace = result.trace.providerTrace as CmipGeminiSectionedTrace | null;
  const lines: string[] = [];
  lines.push(`CMIP GEMINI SECTIONED LIVE STATUS: ${result.status}`);
  lines.push(`CMIP GEMINI CONFIGURED MODEL: ${result.provider.model ?? trace?.selectedModel ?? "unavailable"}`);
  lines.push(`CMIP GEMINI SECTION COUNT: ${CMIP_GEMINI_SECTION_ORDER.length}`);
  lines.push(`CMIP GEMINI REQUEST COUNT: ${trace?.requestCount ?? result.attempts.length}`);
  lines.push(`CMIP GEMINI FAILED SECTION: ${trace?.failedSectionId ?? "none"}`);
  lines.push(`CMIP GEMINI COMPLETED SECTIONS: ${trace?.completedSectionIds.join(",") || "none"}`);
  lines.push(`CMIP GEMINI UNEXECUTED SECTIONS: ${trace?.unexecutedSectionIds.join(",") || "none"}`);
  lines.push(`CMIP GEMINI INPUT TOKENS: ${display(result.usage.inputTokens)}`);
  lines.push(`CMIP GEMINI CACHED INPUT TOKENS: ${display(result.usage.cachedInputTokens)}`);
  lines.push(`CMIP GEMINI OUTPUT TOKENS: ${display(result.usage.outputTokens)}`);
  lines.push(`CMIP GEMINI REASONING TOKENS: ${display(result.usage.reasoningTokens)}`);
  lines.push(`CMIP GEMINI TOTAL TOKENS: ${display(result.usage.totalTokens)}`);

  for (const sectionId of CMIP_GEMINI_SECTION_ORDER) {
    const section = summary.sections.find((item) => item.sectionId === sectionId);
    const traceItem = trace?.sectionUsage.find((item) => item.sectionId === sectionId);
    if (!section) {
      lines.push(`CMIP SECTION ${sectionId} STATUS: not_executed`);
      continue;
    }
    lines.push(`CMIP SECTION ${sectionId} STATUS: ${section.status}`);
    lines.push(`CMIP SECTION ${sectionId} RESPONSE ID: ${section.providerResponseId ?? "unavailable"}`);
    lines.push(`CMIP SECTION ${sectionId} RAW STATUS: ${section.providerRawStatus ?? "unavailable"}`);
    lines.push(`CMIP SECTION ${sectionId} DURATION MS: ${traceItem?.durationMs ?? "unavailable"}`);
    lines.push(`CMIP SECTION ${sectionId} THINKING POLICY VERSION: ${section.thinking.policyVersion}`);
    lines.push(`CMIP SECTION ${sectionId} CONFIGURED THINKING LEVEL: ${section.thinking.configuredThinkingLevel}`);
    lines.push(`CMIP SECTION ${sectionId} EFFECTIVE THINKING LEVEL: ${section.thinking.effectiveThinkingLevel}`);
    lines.push(`CMIP SECTION ${sectionId} THINKING ENVIRONMENT CAP: ${section.thinking.environmentCap ?? "none"}`);
    lines.push(`CMIP SECTION ${sectionId} CONTEXT VERSION: ${section.context?.contextVersion ?? "unavailable"}`);
    lines.push(`CMIP SECTION ${sectionId} ORIGINAL ESTIMATED INPUT TOKENS: ${section.context?.originalEstimatedInputTokens ?? "unavailable"}`);
    lines.push(`CMIP SECTION ${sectionId} FINAL ESTIMATED INPUT TOKENS: ${section.context?.finalEstimatedInputTokens ?? "unavailable"}`);
    lines.push(`CMIP SECTION ${sectionId} CONTEXT TARGET TOKENS: ${section.context?.targetInputTokens ?? "unavailable"}`);
    lines.push(`CMIP SECTION ${sectionId} CONTEXT REDUCTIONS: ${section.context?.reductionCount ?? "unavailable"}`);
    lines.push(`CMIP SECTION ${sectionId} SOURCE RECORDS INCLUDED: ${section.context?.sourceRecordsIncluded ?? "unavailable"}`);
    lines.push(`CMIP SECTION ${sectionId} SOURCE RECORDS EXCLUDED: ${section.context?.sourceRecordsExcluded ?? "unavailable"}`);
    lines.push(`CMIP SECTION ${sectionId} MAX GENERATION TOKENS: ${section.budget.maxOutputTokens}`);
    lines.push(`CMIP SECTION ${sectionId} EXPECTED VISIBLE OUTPUT TOKENS: ${section.budget.expectedVisibleOutputTokens}`);
    lines.push(`CMIP SECTION ${sectionId} RESERVED REASONING TOKENS: ${section.budget.reservedReasoningTokens}`);
    lines.push(`CMIP SECTION ${sectionId} RESERVED SERIALIZATION TOKENS: ${section.budget.reservedSerializationTokens}`);
    lines.push(`CMIP SECTION ${sectionId} REQUIRED GENERATION TOKENS: ${section.budget.totalRequiredGenerationTokens}`);
    lines.push(`CMIP SECTION ${sectionId} INPUT TOKENS: ${display(section.usage.inputTokens)}`);
    lines.push(`CMIP SECTION ${sectionId} CACHED INPUT TOKENS: ${display(section.usage.cachedInputTokens)}`);
    lines.push(`CMIP SECTION ${sectionId} OUTPUT TOKENS: ${display(section.usage.outputTokens)}`);
    lines.push(`CMIP SECTION ${sectionId} REASONING TOKENS: ${display(section.usage.reasoningTokens)}`);
    lines.push(`CMIP SECTION ${sectionId} COMBINED GENERATED TOKENS: ${display(section.incomplete.generationUtilization.combinedGeneratedTokens)}`);
    lines.push(`CMIP SECTION ${sectionId} VISIBLE UTILIZATION PCT: ${display(section.incomplete.generationUtilization.visibleOutputUtilization)}`);
    lines.push(`CMIP SECTION ${sectionId} REASONING UTILIZATION PCT: ${display(section.incomplete.generationUtilization.reasoningUtilization)}`);
    lines.push(`CMIP SECTION ${sectionId} COMBINED UTILIZATION PCT: ${display(section.incomplete.generationUtilization.combinedGenerationUtilization)}`);
    lines.push(`CMIP SECTION ${sectionId} REASONING SHARE PCT: ${display(section.incomplete.generationUtilization.reasoningShareOfCombinedGeneration)}`);
    lines.push(`CMIP SECTION ${sectionId} UTILIZATION CLASSIFICATION: ${section.incomplete.generationUtilization.classification ?? "unavailable"}`);
    lines.push(`CMIP SECTION ${sectionId} REASONING DOMINATED: ${String(section.incomplete.generationUtilization.reasoningDominated)}`);
    lines.push(`CMIP SECTION ${sectionId} BUDGET EXHAUSTION CODE: ${section.incomplete.derivedBudgetExhaustionCode ?? "none"}`);
    lines.push(`CMIP SECTION ${sectionId} REASONING DOMINATED CODE: ${section.incomplete.derivedReasoningDominatedCode ?? "none"}`);
    lines.push(`CMIP SECTION ${sectionId} BUDGET ROOT CAUSE: ${section.incomplete.rootCause ?? "none"}`);
    lines.push(`CMIP SECTION ${sectionId} TOTAL TOKENS: ${display(section.usage.totalTokens)}`);
    lines.push(`CMIP SECTION ${sectionId} INCOMPLETE REASON: ${section.incomplete.incompleteReason ?? "unavailable"}`);
    lines.push(`CMIP SECTION ${sectionId} INCOMPLETE DETAILS: ${section.incomplete.incompleteDetails ?? "unavailable"}`);
    lines.push(`CMIP SECTION ${sectionId} FINISH REASON: ${section.incomplete.finishReason ?? "unavailable"}`);
    lines.push(`CMIP SECTION ${sectionId} PARTIAL OUTPUT PRESENT: ${String(section.incomplete.partialOutputPresent)}`);
    lines.push(`CMIP SECTION ${sectionId} PARTIAL OUTPUT BYTES: ${section.incomplete.partialOutputBytes}`);
    lines.push(`CMIP SECTION ${sectionId} ERROR CODES: ${section.errors.map((error) => error.code).join(",") || "none"}`);
  }

  lines.push(`CMIP FINAL TASK 001 VALID: ${result.validation.canonicalValid}`);
  lines.push(`CMIP REPORT POSTURE: ${result.report?.cmip_report.decision.posture ?? "unavailable"}`);
  lines.push(`CMIP REPORT CONFIDENCE: ${result.report?.cmip_report.decision.confidence ?? "unavailable"}`);
  return lines;
}

function display(value: number | null): string {
  return typeof value === "number" ? String(value) : "unavailable";
}
