import sampleOutput from "../contracts/sample-output.json";
import type { CmipReportEnvelope } from "../contracts";
import { hashCanonicalJson, stableStringify } from "../model-package";
import type { CmipGeminiProvider, CmipGeminiProviderExecutionRequest, CmipGeminiProviderExecutionResponse } from "../gemini/types";
import { parseCmipGeminiSectionOutput } from "./response-parser";
import { sectionFromCmipReport } from "./report-assembler";
import { calculateCmipGeminiGenerationUtilization, getCmipGeminiSectionBudget } from "./section-budget";
import { getCmipGeminiSectionThinkingTrace } from "./section-thinking";
import type { CmipAnyGeminiSectionResult, CmipGeminiSectionData, CmipGeminiSectionExecutionRequest, CmipGeminiSectionId, CmipGeminiSectionIncompleteDiagnostics } from "./types";
import { cmipGeminiSectionIssue, toProviderIssue } from "./errors";
import { CmipGeminiSectionContextBuildError, mapCmipPackageToGeminiSectionRequestWithContext } from "./request-mapper";
import { snapshotCmipGeminiSectionRequest } from "./section-compatibility-audit";
import { extractCmipGeminiSectionProviderErrorDetails } from "./provider-error";

export async function executeCmipGeminiSection(request: CmipGeminiSectionExecutionRequest): Promise<CmipAnyGeminiSectionResult> {
  const startedAt = request.now();
  const budget = getCmipGeminiSectionBudget(request.section.sectionId);
  const thinking = getCmipGeminiSectionThinkingTrace(request.section.sectionId, request.config);
  let mapped: ReturnType<typeof mapCmipPackageToGeminiSectionRequestWithContext>;
  try {
    mapped = mapCmipPackageToGeminiSectionRequestWithContext({
      modelPackage: request.modelPackage,
      section: request.section,
      completedSections: request.completedSections,
      config: request.config,
      model: request.model,
    });
  } catch (error) {
    const issues = error instanceof CmipGeminiSectionContextBuildError
      ? error.issues.map((issue) => cmipGeminiSectionIssue({ code: issue.code, path: issue.path, message: issue.message, severity: "error" }))
      : [cmipGeminiSectionIssue({ code: "GEMINI_SECTION_REQUEST_INVALID", path: `$.sections.${request.section.sectionId}.context`, message: "Gemini section context could not be built.", severity: "error" })];
    return {
      sectionId: request.section.sectionId,
      status: "failed",
      data: null,
      providerResponseId: null,
      providerRawStatus: null,
      budget,
      thinking,
      context: null,
      usage: nullUsage(),
      incomplete: incompleteDiagnostics(null, budget.maxOutputTokens),
      attempts: [],
      warnings: [],
      errors: issues.map(toProviderIssue),
      validation: { outerJsonParsed: false, providerSchemaValid: false, sectionCanonicalValid: false },
    };
  }
  const { body, contextTrace } = mapped;

  let response: CmipGeminiProviderExecutionResponse;
  try {
    response = await request.provider.execute({
      body,
      timeoutMs: request.config.timeoutMs,
      attemptIndex: request.attemptOffset,
      executionId: `${request.modelPackage.executionId}:${request.section.sectionId}`,
    });
  } catch (error) {
    const providerSchemaHash = hashCanonicalJson(body.response_format.schema);
    const requestShapeHash = hashCanonicalJson(snapshotCmipGeminiSectionRequest(request.section.sectionId, body));
    const details = extractCmipGeminiSectionProviderErrorDetails({
      error,
      sectionId: request.section.sectionId,
      providerSchemaHash,
      requestShapeHash,
    });
    const issue = cmipGeminiSectionIssue({ code: "GEMINI_SECTION_PROVIDER_FAILED", path: `$.sections.${request.section.sectionId}.provider`, message: details.safeMessage, severity: "error", retryable: true });
    const completedAt = request.now();
    return {
      sectionId: request.section.sectionId,
      status: "failed",
      data: null,
      providerResponseId: null,
      providerRawStatus: null,
      budget,
      thinking,
      context: contextTrace,
      usage: nullUsage(),
      incomplete: incompleteDiagnostics(null, budget.maxOutputTokens),
      attempts: [{
        providerId: "gemini",
        attemptIndex: request.attemptOffset,
        startedAt,
        completedAt,
        status: "failed",
        providerRawStatus: null,
        errorCode: issue.code,
        retryDelayMs: 0,
      }],
      warnings: [],
      errors: [toProviderIssue(issue)],
      validation: { outerJsonParsed: false, providerSchemaValid: false, sectionCanonicalValid: false },
    };
  }

  const completedAt = request.now();
  const status = sectionStatusForProvider(response.status);
  if (status !== "success") {
    const code = status === "refused" ? "GEMINI_SECTION_REFUSAL" : status === "incomplete" ? "GEMINI_SECTION_INCOMPLETE" : "GEMINI_SECTION_PROVIDER_FAILED";
    const diagnostics = incompleteDiagnostics(response, body.generation_config.max_output_tokens);
    const detail = status === "incomplete" && diagnostics.incompleteReason ? ` Reason: ${diagnostics.incompleteReason}.` : "";
    const issue = cmipGeminiSectionIssue({ code, path: `$.sections.${request.section.sectionId}.provider`, message: `Gemini section ${request.section.sectionId} did not complete: ${response.status}.${detail}`, severity: "error" });
    const budgetIssue = diagnostics.derivedBudgetExhaustionCode
      ? cmipGeminiSectionIssue({
          code: diagnostics.derivedBudgetExhaustionCode,
          path: `$.sections.${request.section.sectionId}.provider.usage`,
          message: `Gemini section ${request.section.sectionId} exhausted the combined generation budget. Root cause: ${diagnostics.rootCause}.`,
          severity: "error",
        })
      : null;
    const reasoningIssue = diagnostics.derivedReasoningDominatedCode
      ? cmipGeminiSectionIssue({
          code: diagnostics.derivedReasoningDominatedCode,
          path: `$.sections.${request.section.sectionId}.provider.usage.reasoningTokens`,
          message: `Gemini section ${request.section.sectionId} was reasoning-dominated; thought tokens consumed at least 80% of generated tokens.`,
          severity: "error",
        })
      : null;
    return {
      sectionId: request.section.sectionId,
      status,
      data: null,
      providerResponseId: response.responseId,
      providerRawStatus: response.status,
      budget,
      thinking,
      context: contextTrace,
      usage: response.usage ?? nullUsage(),
      incomplete: diagnostics,
      attempts: [attempt(request.attemptOffset, startedAt, completedAt, status, response.status, issue.code)],
      warnings: [],
      errors: [issue, budgetIssue, reasoningIssue].filter((item): item is typeof issue => item !== null).map(toProviderIssue),
      validation: { outerJsonParsed: false, providerSchemaValid: false, sectionCanonicalValid: false },
    };
  }

  const parsed = parseCmipGeminiSectionOutput(request.section.sectionId, response.outputText);
  if (parsed.errors.length) {
    return {
      sectionId: request.section.sectionId,
      status: "failed",
      data: null,
      providerResponseId: response.responseId,
      providerRawStatus: response.status,
      budget,
      thinking,
      context: contextTrace,
      usage: response.usage ?? nullUsage(),
      incomplete: incompleteDiagnostics(response, body.generation_config.max_output_tokens),
      attempts: [attempt(request.attemptOffset, startedAt, completedAt, "failed", response.status, parsed.errors[0]?.code ?? "GEMINI_SECTION_OUTPUT_INVALID")],
      warnings: [],
      errors: parsed.errors.map(toProviderIssue),
      validation: {
        outerJsonParsed: parsed.outerJsonParsed,
        providerSchemaValid: parsed.providerSchemaValid,
        sectionCanonicalValid: parsed.sectionCanonicalValid,
      },
    };
  }

  return {
    sectionId: request.section.sectionId,
    status: "success",
    data: parsed.data,
    providerResponseId: response.responseId,
    providerRawStatus: response.status,
    budget,
    thinking,
    context: contextTrace,
    usage: response.usage ?? nullUsage(),
    incomplete: incompleteDiagnostics(response, body.generation_config.max_output_tokens),
    attempts: [attempt(request.attemptOffset, startedAt, completedAt, "success", response.status, null)],
    warnings: [],
    errors: [],
    validation: {
      outerJsonParsed: parsed.outerJsonParsed,
      providerSchemaValid: parsed.providerSchemaValid,
      sectionCanonicalValid: parsed.sectionCanonicalValid,
    },
  };
}

export function createFakeGeminiSectionProvider(options: {
  readonly report?: CmipReportEnvelope;
  readonly failAtSection?: CmipGeminiSectionId;
  readonly refusalAtSection?: CmipGeminiSectionId;
  readonly incompleteAtSection?: CmipGeminiSectionId;
} = {}): CmipGeminiProvider {
  const report = options.report ?? (sampleOutput as unknown as CmipReportEnvelope);
  return {
    providerName: "cmip_fake_gemini_section_provider",
    async execute(request: CmipGeminiProviderExecutionRequest): Promise<CmipGeminiProviderExecutionResponse> {
      const sectionId = sectionIdFromExecutionId(request.executionId);
      const base = {
        responseId: `gemini_section_fake_${sectionId}_${request.attemptIndex}`,
        model: request.body.model,
        serviceTier: null,
        usage: {
          inputTokens: 700,
          cachedInputTokens: null,
          outputTokens: 180,
          reasoningTokens: 30,
          totalTokens: 910,
        },
      toolCalls: 0,
      toolSources: [],
      refusal: null,
      incompleteReason: null,
      incompleteDetails: null,
      finishReason: null,
      error: null,
    } as const;
      if (options.refusalAtSection === sectionId) {
        return { ...base, status: "blocked", outputText: null, refusal: { message: "Fake section refusal.", category: "blocked" } };
      }
      if (options.incompleteAtSection === sectionId) {
        return { ...base, status: "incomplete", outputText: "{\"partial\":true}", incompleteReason: "max_output_tokens", incompleteDetails: "Fake section incomplete.", finishReason: "MAX_TOKENS" };
      }
      if (options.failAtSection === sectionId) {
        return { ...base, status: "failed", outputText: null, error: { code: "fake_section_failed", message: "Fake section failed.", status: null } };
      }
      return {
        ...base,
        status: "completed",
        outputText: stableStringify(sectionFromCmipReport(sectionId, report) as CmipGeminiSectionData),
      };
    },
  };
}

function sectionIdFromExecutionId(executionId: string): CmipGeminiSectionId {
  const suffix = executionId.split(":").at(-1);
  if (
    suffix === "meta_decision" ||
    suffix === "engines_reasons" ||
    suffix === "delta_attribution" ||
    suffix === "scenarios_triggers" ||
    suffix === "coins" ||
    suffix === "confidence_memory" ||
    suffix === "charts_audit"
  ) {
    return suffix;
  }
  return "meta_decision";
}

function sectionStatusForProvider(status: string): "success" | "failed" | "refused" | "incomplete" {
  if (status === "completed") return "success";
  if (status === "blocked" || status === "refused") return "refused";
  if (status === "incomplete") return "incomplete";
  return "failed";
}

function attempt(index: number, startedAt: string, completedAt: string, status: "success" | "failed" | "refused" | "incomplete", rawStatus: string | null, errorCode: string | null) {
  return {
    providerId: "gemini" as const,
    attemptIndex: index,
    startedAt,
    completedAt,
    status,
    providerRawStatus: rawStatus,
    errorCode,
    retryDelayMs: 0,
  };
}

function incompleteDiagnostics(response: CmipGeminiProviderExecutionResponse | null, maxOutputTokensUsed: number): CmipGeminiSectionIncompleteDiagnostics {
  const partialOutputBytes = response?.outputText ? Buffer.byteLength(response.outputText, "utf8") : 0;
  const generationUtilization = calculateCmipGeminiGenerationUtilization({
    usage: response?.usage ?? nullUsage(),
    maxOutputTokens: maxOutputTokensUsed,
  });
  const exhausted = response?.status === "incomplete" && generationUtilization.classification === "EXHAUSTED";
  const reasoningDominated = response?.status === "incomplete" && generationUtilization.reasoningDominated;
  return {
    incompleteReason: response?.incompleteReason ?? null,
    incompleteDetails: response?.incompleteDetails ?? null,
    finishReason: response?.finishReason ?? null,
    maxOutputTokensUsed,
    generationUtilization,
    derivedBudgetExhaustionCode: exhausted ? "GEMINI_SECTION_GENERATION_BUDGET_EXHAUSTED" : null,
    derivedReasoningDominatedCode: reasoningDominated ? "GEMINI_SECTION_REASONING_DOMINATED" : null,
    rootCause: exhausted ? "REASONING_OUTPUT_BUDGET_EXHAUSTED" : null,
    partialOutputPresent: partialOutputBytes > 0,
    partialOutputBytes,
  };
}

function nullUsage() {
  return { inputTokens: null, cachedInputTokens: null, outputTokens: null, reasoningTokens: null, totalTokens: null };
}
