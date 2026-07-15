import { hashCanonicalJson, sha256Hex } from "../model-package";
import { isCmipExperimentalFullReportAiEnabled, isCmipFullReportExperimentalTask } from "../experimental-full-report-ai";
import type { CmipModelExecutionPackage } from "../model-package";
import { validateCmipModelExecutionPackage } from "../model-package/validate-model-package";
import { createCmipGeminiClient } from "../gemini/client";
import { dryRunGeminiConfig, loadCmipGeminiEnv } from "../gemini/env";
import { resolveCmipGeminiModelProfile } from "../gemini/model-registry";
import { GeminiInteractionsProvider } from "../gemini/provider/gemini-provider";
import { CMIP_PROVIDER_EXECUTION_VERSION, CMIP_PROVIDER_ROUTER_VERSION } from "../providers";
import type { CmipProviderAttempt, CmipProviderNeutralExecutionResult } from "../providers";
import { CMIP_GEMINI_SECTIONED_ADAPTER_VERSION, CMIP_GEMINI_SECTIONED_EXECUTION_VERSION, CMIP_GEMINI_SECTION_ORDER, CMIP_GEMINI_SECTIONED_PLAN_VERSION } from "./constants";
import { cmipGeminiSectionIssue, dedupeGeminiSectionIssues, toProviderIssue, CmipGeminiSectionedAssemblyError } from "./errors";
import { assembleCmipReportFromGeminiSections, validatedSectionsFromResults } from "./report-assembler";
import { executeCmipGeminiSection } from "./section-executor";
import { validateCmipGeminiSectionBudgetAgainstModel } from "./section-budget";
import { CMIP_GEMINI_SECTION_PLAN } from "./section-plan";
import type {
  CmipAnyGeminiSectionResult,
  CmipGeminiSectionedExecutionDependencies,
  CmipGeminiSectionedExecutionRequest,
  CmipGeminiSectionedExecutionSummary,
  CmipGeminiSectionedTrace,
  CmipPartialGeminiSections,
  CmipProviderUsage,
} from "./types";

export async function executeCmipGeminiSectionedModelPackage(
  request: CmipGeminiSectionedExecutionRequest,
  dependencies: CmipGeminiSectionedExecutionDependencies = {},
): Promise<CmipProviderNeutralExecutionResult> {
  const summary = await executeCmipGeminiSectionedModelPackageSummary(request, dependencies);
  return summary.result;
}

export async function executeCmipGeminiSectionedModelPackageSummary(
  request: CmipGeminiSectionedExecutionRequest,
  dependencies: CmipGeminiSectionedExecutionDependencies = {},
): Promise<CmipGeminiSectionedExecutionSummary> {
  const now = dependencies.now ?? (() => new Date().toISOString());
  const startedAt = now();
  const safetyErrors = experimentalFullReportSafetyErrors(request, dependencies);
  if (safetyErrors.length) {
    return failureSummary({ request, startedAt, completedAt: now(), sections: [], errors: safetyErrors, warnings: [], model: null, report: null });
  }

  const packageErrors = validatePackage(request.modelPackage);
  if (packageErrors.length) {
    return failureSummary({ request, startedAt, completedAt: now(), sections: [], errors: packageErrors, warnings: [], model: null, report: null });
  }

  const env = dependencies.env ?? process.env;
  const configResult = dependencies.provider ? { ok: true as const, config: dryRunGeminiConfig(env), warnings: [] as const, errors: [] as const } : loadCmipGeminiEnv(env);
  if (!configResult.ok) {
    return failureSummary({ request, startedAt, completedAt: now(), sections: [], errors: configResult.errors.map((error) => cmipGeminiSectionIssue({ code: error.code, path: error.path, message: error.message, severity: error.severity, retryable: error.retryable })), warnings: [], model: null, report: null });
  }

  if (request.executionMode === "live_smoke" && !(request.allowLiveGeminiSectionedSmoke && parseBoolean(env.CMIP_ALLOW_LIVE_GEMINI_SECTIONED_SMOKE))) {
    return failureSummary({
      request,
      startedAt,
      completedAt: now(),
      sections: [],
      errors: [cmipGeminiSectionIssue({ code: "GEMINI_SECTION_LIVE_SMOKE_NOT_ALLOWED", path: "$.executionMode", message: "Sectioned Gemini live smoke requires request.allowLiveGeminiSectionedSmoke=true and CMIP_ALLOW_LIVE_GEMINI_SECTIONED_SMOKE=true.", severity: "critical" })],
      warnings: [],
      model: null,
      report: null,
    });
  }

  const modelResult = resolveCmipGeminiModelProfile(request.modelPackage.executionConfig.modelProfile, configResult.config);
  if (!modelResult.ok) {
    return failureSummary({ request, startedAt, completedAt: now(), sections: [], errors: modelResult.errors.map((error) => cmipGeminiSectionIssue({ code: error.code, path: error.path, message: error.message, severity: error.severity, retryable: error.retryable })), warnings: [], model: null, report: null });
  }

  const budgetErrors = CMIP_GEMINI_SECTION_PLAN
    .map((section) => ({ section, issue: validateCmipGeminiSectionBudgetAgainstModel(section.sectionId, modelResult.resolution) }))
    .filter((item): item is { section: (typeof CMIP_GEMINI_SECTION_PLAN)[number]; issue: { path: string; message: string } } => item.issue !== null)
    .map((item) => cmipGeminiSectionIssue({ code: "GEMINI_SECTION_BUDGET_EXCEEDS_MODEL_LIMIT", path: item.issue.path, message: item.issue.message, severity: "critical" }));
  if (budgetErrors.length) {
    return failureSummary({ request, startedAt, completedAt: now(), sections: [], errors: budgetErrors, warnings: [], model: modelResult.resolution.modelId, report: null });
  }

  const provider = dependencies.provider ?? new GeminiInteractionsProvider(createCmipGeminiClient(configResult.config));
  const sections: CmipAnyGeminiSectionResult[] = [];
  const completed: CmipPartialGeminiSections = {};

  for (const section of CMIP_GEMINI_SECTION_PLAN) {
    const sectionResult = await executeCmipGeminiSection({
      section,
      modelPackage: request.modelPackage,
      config: configResult.config,
      model: modelResult.resolution,
      provider,
      executionMode: request.executionMode,
      completedSections: completed,
      attemptOffset: sections.length,
      now,
    });
    sections.push(sectionResult);
    if (sectionResult.status !== "success" || !sectionResult.data) {
      return failureSummary({
        request,
        startedAt,
        completedAt: now(),
        sections,
        errors: sectionResult.errors.map((error) => cmipGeminiSectionIssue({ code: error.code, path: error.path, message: error.message, severity: error.severity, retryable: error.retryable })),
        warnings: sectionResult.warnings.map((warning) => cmipGeminiSectionIssue({ code: warning.code, path: warning.path, message: warning.message, severity: warning.severity, retryable: warning.retryable })),
        model: modelResult.resolution.modelId,
        report: null,
      });
    }
    Object.assign(completed, { [sectionResult.sectionId]: sectionResult.data });
  }

  try {
    const validatedSections = validatedSectionsFromResults(sections);
    const report = assembleCmipReportFromGeminiSections(validatedSections);
    const completedAt = now();
    const result = neutralResult({
      request,
      startedAt,
      completedAt,
      sections,
      model: modelResult.resolution.modelId,
      status: "success",
      report,
      errors: [],
      warnings: [],
      finalCanonicalValid: true,
      finalErrorPaths: [],
    });
    return { result, sections, assembledReport: report };
  } catch (error) {
    const issues = error instanceof CmipGeminiSectionedAssemblyError
      ? error.issues
      : [cmipGeminiSectionIssue({ code: "GEMINI_SECTION_ASSEMBLY_FAILED", path: "$.sections", message: "Gemini section assembly failed.", severity: "error" })];
    return failureSummary({ request, startedAt, completedAt: now(), sections, errors: issues, warnings: [], model: modelResult.resolution.modelId, report: null });
  }
}

function validatePackage(modelPackage: CmipModelExecutionPackage): ReturnType<typeof cmipGeminiSectionIssue>[] {
  const errors: ReturnType<typeof cmipGeminiSectionIssue>[] = [];
  const packageValidation = validateCmipModelExecutionPackage(modelPackage);
  if (!packageValidation.valid) {
    errors.push(...packageValidation.errors.map((error) => cmipGeminiSectionIssue({ code: "GEMINI_SECTION_MODEL_PACKAGE_INVALID", path: error.path, message: error.message, severity: "critical" })));
  }
  modelPackage.messages.forEach((message, index) => {
    if (sha256Hex(message.content) !== message.contentHash) {
      errors.push(cmipGeminiSectionIssue({ code: "GEMINI_SECTION_MODEL_PACKAGE_INTEGRITY_INVALID", path: `$.messages[${index}].contentHash`, message: "Model-package message hash does not match content.", severity: "critical" }));
    }
  });
  if (modelPackage.integrity.outputSchemaHash !== hashCanonicalJson(modelPackage.outputContract.schema)) {
    errors.push(cmipGeminiSectionIssue({ code: "GEMINI_SECTION_MODEL_PACKAGE_INTEGRITY_INVALID", path: "$.integrity.outputSchemaHash", message: "Model-package output schema hash does not match output contract.", severity: "critical" }));
  }
  return errors;
}

function experimentalFullReportSafetyErrors(
  request: CmipGeminiSectionedExecutionRequest,
  dependencies: CmipGeminiSectionedExecutionDependencies,
): ReturnType<typeof cmipGeminiSectionIssue>[] {
  if (!isCmipFullReportExperimentalTask(request.taskType)) {
    return [
      cmipGeminiSectionIssue({
        code: "CMIP_FULL_REPORT_TASK_TYPE_UNSUPPORTED",
        path: "$.taskType",
        message: "Gemini sectioned full-report execution accepts only the full_report_experimental task type.",
        severity: "critical",
      }),
    ];
  }
  const fakeDryRun = request.executionMode === "dry_run" && dependencies.provider !== undefined;
  if (fakeDryRun) return [];
  if (!isCmipExperimentalFullReportAiEnabled(dependencies.env ?? process.env)) {
    return [
      cmipGeminiSectionIssue({
        code: "CMIP_EXPERIMENTAL_FULL_REPORT_AI_DISABLED",
        path: "$.env.CMIP_ENABLE_EXPERIMENTAL_FULL_REPORT_AI",
        message: "Experimental full-report AI execution is disabled by server configuration.",
        severity: "critical",
      }),
    ];
  }
  return [];
}

function failureSummary(params: {
  readonly request: CmipGeminiSectionedExecutionRequest;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly sections: readonly CmipAnyGeminiSectionResult[];
  readonly errors: readonly ReturnType<typeof cmipGeminiSectionIssue>[];
  readonly warnings: readonly ReturnType<typeof cmipGeminiSectionIssue>[];
  readonly model: string | null;
  readonly report: null;
}): CmipGeminiSectionedExecutionSummary {
  const result = neutralResult({
    request: params.request,
    startedAt: params.startedAt,
    completedAt: params.completedAt,
    sections: params.sections,
    model: params.model,
    status: params.errors.some((error) => error.code === "GEMINI_SECTION_REFUSAL")
      ? "refused"
      : params.errors.some((error) => error.code === "GEMINI_SECTION_INCOMPLETE" || error.code === "GEMINI_SECTION_GENERATION_BUDGET_EXHAUSTED" || error.code === "GEMINI_SECTION_REASONING_DOMINATED")
        ? "incomplete"
        : "failed",
    report: null,
    errors: params.errors,
    warnings: params.warnings,
    finalCanonicalValid: false,
    finalErrorPaths: params.errors.map((error) => error.path),
  });
  return { result, sections: params.sections, assembledReport: null };
}

function neutralResult(params: {
  readonly request: CmipGeminiSectionedExecutionRequest;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly sections: readonly CmipAnyGeminiSectionResult[];
  readonly model: string | null;
  readonly status: CmipProviderNeutralExecutionResult["status"];
  readonly report: CmipProviderNeutralExecutionResult["report"];
  readonly errors: readonly ReturnType<typeof cmipGeminiSectionIssue>[];
  readonly warnings: readonly ReturnType<typeof cmipGeminiSectionIssue>[];
  readonly finalCanonicalValid: boolean;
  readonly finalErrorPaths: readonly string[];
}): CmipProviderNeutralExecutionResult {
  const usage = aggregateUsage(params.sections.map((section) => section.usage));
  const attempts = params.sections.flatMap((section) => section.attempts);
  const completedSectionIds = params.sections.filter((section) => section.status === "success").map((section) => section.sectionId);
  const failedSection = params.sections.find((section) => section.status !== "success")?.sectionId ?? null;
  const trace: CmipGeminiSectionedTrace = {
    adapterVersion: CMIP_GEMINI_SECTIONED_ADAPTER_VERSION,
    planVersion: CMIP_GEMINI_SECTIONED_PLAN_VERSION,
    startedAt: params.startedAt,
    completedAt: params.completedAt,
    executionMode: params.request.executionMode,
    selectedModel: params.model,
    sectionOrder: CMIP_GEMINI_SECTION_ORDER,
    completedSectionIds,
    failedSectionId: failedSection,
    unexecutedSectionIds: failedSection ? CMIP_GEMINI_SECTION_ORDER.slice(CMIP_GEMINI_SECTION_ORDER.indexOf(failedSection) + 1) : [],
    requestCount: attempts.length,
    sectionUsage: params.sections.map((section) => ({
      sectionId: section.sectionId,
      usage: section.usage,
      durationMs: section.attempts.reduce((sum, attempt) => sum + Math.max(0, Date.parse(attempt.completedAt) - Date.parse(attempt.startedAt)), 0),
      providerStatus: section.providerRawStatus,
      budget: section.budget,
      thinking: section.thinking,
      context: section.context,
      incomplete: section.incomplete,
    })),
    finalCanonicalValidation: {
      valid: params.finalCanonicalValid,
      errorPaths: params.finalErrorPaths,
    },
  };
  return {
    executionVersion: CMIP_PROVIDER_EXECUTION_VERSION,
    executionId: params.request.modelPackage.executionId,
    packageId: params.request.modelPackage.packageId,
    semanticPackageHash: params.request.modelPackage.integrity.semanticPackageHash,
    providerId: "gemini",
    providerExecutionVersion: CMIP_GEMINI_SECTIONED_EXECUTION_VERSION,
    status: params.status,
    report: params.status === "success" ? params.report : null,
    provider: {
      name: "gemini",
      responseId: params.sections.at(-1)?.providerResponseId ?? null,
      model: params.model,
      rawStatus: params.sections.at(-1)?.providerRawStatus ?? null,
      serviceTier: null,
    },
    usage,
    timing: {
      startedAt: params.startedAt,
      completedAt: params.completedAt,
      durationMs: Math.max(0, Date.parse(params.completedAt) - Date.parse(params.startedAt)),
    },
    validation: {
      providerSchemaCompatible: true,
      jsonParsed: params.sections.every((section) => section.validation.outerJsonParsed),
      canonicalValid: params.finalCanonicalValid,
      repairAttempted: false,
      repairSucceeded: false,
    },
    attempts,
    warnings: dedupeGeminiSectionIssues(params.warnings).map(toProviderIssue),
    errors: dedupeGeminiSectionIssues(params.errors).map(toProviderIssue),
    trace: {
      routerVersion: CMIP_PROVIDER_ROUTER_VERSION,
      selectedProvider: "gemini",
      fallbackProvider: null,
      fallbackPolicy: "disabled",
      fallbackDecisions: [],
      providerTrace: trace,
    },
  };
}

function aggregateUsage(usages: readonly CmipProviderUsage[]): CmipProviderUsage {
  return {
    inputTokens: sumNullable(usages.map((usage) => usage.inputTokens)),
    cachedInputTokens: sumNullable(usages.map((usage) => usage.cachedInputTokens)),
    outputTokens: sumNullable(usages.map((usage) => usage.outputTokens)),
    reasoningTokens: sumNullable(usages.map((usage) => usage.reasoningTokens)),
    totalTokens: sumNullable(usages.map((usage) => usage.totalTokens)),
  };
}

function sumNullable(values: readonly (number | null)[]): number | null {
  const present = values.filter((value): value is number => typeof value === "number");
  return present.length ? present.reduce((sum, value) => sum + value, 0) : null;
}

function parseBoolean(value: string | undefined): boolean {
  return /^(1|true|yes)$/i.test(value?.trim() ?? "");
}
