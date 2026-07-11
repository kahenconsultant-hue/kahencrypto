import { executeCmipModelPackage } from "../openai/execute-model-package";
import { executeCmipGeminiModelPackage } from "../gemini/execute-model-package";
import { CMIP_PROVIDER_EXECUTION_VERSION, CMIP_PROVIDER_ROUTER_VERSION } from "./constants";
import type {
  CmipProviderError,
  CmipProviderExecutionRequest,
  CmipProviderExecutor,
  CmipProviderId,
  CmipProviderIssue,
  CmipProviderNeutralExecutionResult,
  CmipProviderRouterDependencies,
} from "./types";

export async function executeCmipProviderPackage(
  request: CmipProviderExecutionRequest,
  dependencies: CmipProviderRouterDependencies = {},
): Promise<CmipProviderNeutralExecutionResult> {
  const startedAt = dependencies.now?.() ?? new Date().toISOString();
  const executor = executorFor(request.selection.primary, dependencies);
  if (!executor) {
    return failedRouterResult(request, startedAt, [issue("PROVIDER_UNSUPPORTED", "$.selection.primary", `Unsupported provider: ${request.selection.primary}.`, "critical")]);
  }

  const primaryResult = await executor.execute(request);
  if (primaryResult.status === "success" || request.selection.fallbackPolicy === "disabled" || request.selection.fallback === null) {
    return primaryResult;
  }

  if (request.selection.fallback === request.selection.primary) {
    return {
      ...primaryResult,
      errors: [
        ...primaryResult.errors,
        issue("PROVIDER_FALLBACK_FAILED", "$.selection.fallback", "Fallback provider cannot equal primary provider.", "critical"),
      ],
      trace: {
        ...primaryResult.trace,
        fallbackDecisions: [
          ...primaryResult.trace.fallbackDecisions,
          { from: request.selection.primary, to: request.selection.fallback, reason: "same_provider_loop_prevented", allowed: false },
        ],
      },
    };
  }

  const allowed = fallbackAllowed(primaryResult, request.selection.fallbackPolicy);
  if (!allowed) {
    return {
      ...primaryResult,
      errors: [
        ...primaryResult.errors,
        issue("PROVIDER_FALLBACK_NOT_ALLOWED", "$.selection.fallbackPolicy", "Provider fallback was not allowed for this failure class.", "error"),
      ],
      trace: {
        ...primaryResult.trace,
        fallbackDecisions: [
          ...primaryResult.trace.fallbackDecisions,
          { from: request.selection.primary, to: request.selection.fallback, reason: primaryResult.errors[0]?.code ?? primaryResult.status, allowed: false },
        ],
      },
    };
  }

  const fallbackExecutor = executorFor(request.selection.fallback, dependencies);
  if (!fallbackExecutor) {
    return {
      ...primaryResult,
      errors: [
        ...primaryResult.errors,
        issue("PROVIDER_FALLBACK_FAILED", "$.selection.fallback", "Fallback provider executor was unavailable.", "critical"),
      ],
    };
  }

  const fallbackResult = await fallbackExecutor.execute({
    ...request,
    selection: { ...request.selection, primary: request.selection.fallback, fallback: null, fallbackPolicy: "disabled" },
  });
  return {
    ...fallbackResult,
    warnings: [
      ...fallbackResult.warnings,
      issue("PROVIDER_FALLBACK_ATTEMPTED", "$.selection.fallback", `Fallback executed from ${request.selection.primary} to ${request.selection.fallback}.`, "warning"),
    ],
    trace: {
      ...fallbackResult.trace,
      fallbackDecisions: [
        ...fallbackResult.trace.fallbackDecisions,
        { from: request.selection.primary, to: request.selection.fallback, reason: primaryResult.errors[0]?.code ?? primaryResult.status, allowed: true },
      ],
    },
  };
}

function executorFor(providerId: CmipProviderId, dependencies: CmipProviderRouterDependencies): CmipProviderExecutor | null {
  if (providerId === "openai") {
    return dependencies.openai ?? {
      execute: async (request) => {
        const result = await executeCmipModelPackage({
          modelPackage: request.modelPackage,
          executionMode: request.executionMode === "live_smoke" ? "live_smoke" : request.executionMode,
          allowLiveOpenAiSmoke: request.allowLiveOpenAiSmoke,
        });
        return mapOpenAiResult(request, result);
      },
    };
  }
  if (providerId === "gemini") {
    return dependencies.gemini ?? {
      execute: (request) =>
        executeCmipGeminiModelPackage({
          modelPackage: request.modelPackage,
          executionMode: request.executionMode,
          allowLiveGeminiSmoke: request.allowLiveGeminiSmoke,
        }),
    };
  }
  return null;
}

function fallbackAllowed(result: CmipProviderNeutralExecutionResult, policy: string): boolean {
  const retryable = result.errors.some((error) => error.retryable);
  const unavailable = result.errors.some((error) => /CONFIG|API_KEY|MODEL_NOT_CONFIGURED|AUTHENTICATION|PERMISSION|TRANSPORT|TIMEOUT|RATE_LIMIT|5XX/.test(error.code));
  if (policy === "retryable_transport_only") return retryable;
  if (policy === "provider_unavailable") return unavailable;
  if (policy === "explicit_manual") return true;
  return false;
}

function mapOpenAiResult(request: CmipProviderExecutionRequest, result: Awaited<ReturnType<typeof executeCmipModelPackage>>): CmipProviderNeutralExecutionResult {
  if (result.ok) {
    const record = result.result;
    const attempt = record.trace.attempts.at(-1);
    return {
      executionVersion: CMIP_PROVIDER_EXECUTION_VERSION,
      executionId: record.executionId,
      packageId: record.packageId,
      semanticPackageHash: record.packageSemanticHash,
      providerId: "openai",
      providerExecutionVersion: record.executionVersion,
      status: record.status,
      report: record.report,
      provider: {
        name: "openai",
        responseId: record.responseId,
        model: record.model,
        rawStatus: attempt?.providerStatus ?? null,
        serviceTier: record.serviceTier,
      },
      usage: record.usage ?? nullUsage(),
      timing: { startedAt: record.trace.startedAt, completedAt: record.trace.completedAt, durationMs: Math.max(0, Date.parse(record.trace.completedAt) - Date.parse(record.trace.startedAt)) },
      validation: { providerSchemaCompatible: record.trace.schemaCompatibility.compatible, jsonParsed: true, canonicalValid: record.canonicalValid, repairAttempted: record.trace.repairAttempts > 0, repairSucceeded: record.trace.repairAttempts > 0 && record.canonicalValid },
      attempts: record.trace.attempts.map((item) => ({
        providerId: "openai",
        attemptIndex: item.attemptIndex,
        startedAt: item.startedAt,
        completedAt: item.completedAt,
        status: item.outcome === "success" || item.outcome === "repair_success" ? "success" : "failed",
        providerRawStatus: item.providerStatus,
        errorCode: item.errorCode,
        retryDelayMs: item.retryDelayMs,
      })),
      warnings: result.warnings.map((warning) => ({ ...warning, domain: "openai" })),
      errors: [],
      trace: {
        routerVersion: CMIP_PROVIDER_ROUTER_VERSION,
        selectedProvider: request.selection.primary,
        fallbackProvider: request.selection.fallback,
        fallbackPolicy: request.selection.fallbackPolicy,
        fallbackDecisions: [],
        providerTrace: record.trace,
      },
    };
  }
  const startedAt = new Date().toISOString();
  return failedRouterResult(request, startedAt, result.errors.map((error) => ({ ...error, domain: "openai" })));
}

function failedRouterResult(request: CmipProviderExecutionRequest, startedAt: string, errors: readonly CmipProviderError[]): CmipProviderNeutralExecutionResult {
  const completedAt = new Date().toISOString();
  return {
    executionVersion: CMIP_PROVIDER_EXECUTION_VERSION,
    executionId: request.modelPackage.executionId,
    packageId: request.modelPackage.packageId,
    semanticPackageHash: request.modelPackage.integrity.semanticPackageHash,
    providerId: request.selection.primary,
    providerExecutionVersion: "unavailable",
    status: "failed",
    report: null,
    provider: { name: request.selection.primary, responseId: null, model: null, rawStatus: null, serviceTier: null },
    usage: nullUsage(),
    timing: { startedAt, completedAt, durationMs: Math.max(0, Date.parse(completedAt) - Date.parse(startedAt)) },
    validation: { providerSchemaCompatible: false, jsonParsed: false, canonicalValid: false, repairAttempted: false, repairSucceeded: false },
    attempts: [],
    warnings: [],
    errors,
    trace: {
      routerVersion: CMIP_PROVIDER_ROUTER_VERSION,
      selectedProvider: request.selection.primary,
      fallbackProvider: request.selection.fallback,
      fallbackPolicy: request.selection.fallbackPolicy,
      fallbackDecisions: [],
      providerTrace: null,
    },
  };
}

function nullUsage() {
  return { inputTokens: null, cachedInputTokens: null, outputTokens: null, reasoningTokens: null, totalTokens: null };
}

function issue(code: string, path: string, message: string, severity: CmipProviderIssue["severity"], retryable = false): CmipProviderIssue {
  return { code, path, message, domain: "provider_router", severity, retryable, sourceRefs: [] };
}
