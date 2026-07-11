import outputSchema from "../contracts/output-schema.json";
import { hashCanonicalJson, sha256Hex } from "../model-package";
import type { CmipModelExecutionPackage } from "../model-package";
import { validateCmipModelExecutionPackage } from "../model-package/validate-model-package";
import { CMIP_PROVIDER_EXECUTION_VERSION, CMIP_PROVIDER_ROUTER_VERSION, type CmipProviderNeutralExecutionResult } from "../providers";
import { createCmipGeminiClient } from "./client";
import { CMIP_GEMINI_ADAPTER_VERSION, CMIP_GEMINI_DEFAULTS, CMIP_GEMINI_EXECUTION_VERSION } from "./constants";
import { dryRunGeminiConfig, loadCmipGeminiEnv } from "./env";
import { cmipGeminiIssue } from "./errors";
import type { CmipGeminiIssue } from "./errors";
import { createInitialCmipGeminiTrace, finishCmipGeminiTrace } from "./execution-trace";
import { resolveCmipGeminiModelProfile } from "./model-registry";
import { GeminiInteractionsProvider } from "./provider/gemini-provider";
import { mapCmipPackageToGeminiInteractionRequest } from "./request-mapper";
import { classifyGeminiProviderException, deterministicGeminiRetryDelayMs, isCmipGeminiRetryable } from "./retry";
import { createGeminiProviderSchema } from "./schema-compatibility";
import { numericalValuesChanged, outputContainsSecretLikeValue, parseCmipGeminiResponse, parseLooseJsonObject } from "./response-parser";
import { runGeminiWithTimeout } from "./timeout";
import type {
  CmipGeminiAttemptTrace,
  CmipGeminiEnvConfig,
  CmipGeminiExecutionDependencies,
  CmipGeminiExecutionRequest,
  CmipGeminiExecutionResult,
  CmipGeminiProvider,
  CmipGeminiProviderExecutionResponse,
} from "./types";
import { validateCmipGeminiExecutionResult } from "./validate-execution-result";

export async function executeCmipGeminiModelPackage(
  request: CmipGeminiExecutionRequest,
  dependencies: CmipGeminiExecutionDependencies = {},
): Promise<CmipProviderNeutralExecutionResult> {
  const result = await executeCmipGeminiModelPackageResult(request, dependencies);
  if (result.ok) return result.result;
  if (result.result) return result.result;
  return failedNeutralResult(request, dependencies.now?.() ?? new Date().toISOString(), result.errors, result.warnings);
}

export async function executeCmipGeminiModelPackageResult(
  request: CmipGeminiExecutionRequest,
  dependencies: CmipGeminiExecutionDependencies = {},
): Promise<CmipGeminiExecutionResult> {
  const now = dependencies.now ?? (() => new Date().toISOString());
  const sleepMs = dependencies.sleepMs ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const jitterMs = dependencies.jitterMs ?? (() => 0);
  const startedAt = now();
  const warnings: CmipGeminiIssue[] = [];

  if (!isExecutionRequest(request)) {
    return fail([issue("INVALID_GEMINI_EXECUTION_REQUEST", "$", "Gemini execution request must include modelPackage and executionMode.", "critical")], warnings);
  }

  const packageValidation = validateCmipModelExecutionPackage(request.modelPackage);
  if (!packageValidation.valid) {
    return fail(packageValidation.errors.map((error) => issue("MODEL_PACKAGE_INVALID", error.path, error.message, "critical")), warnings);
  }

  const integrityErrors = verifyModelPackageIntegrity(request.modelPackage);
  if (integrityErrors.length) return fail(integrityErrors, warnings);

  const schemaCheck = createGeminiProviderSchema(request.modelPackage.outputContract.schema);
  if (!schemaCheck.compatible) {
    return fail([
      issue(
        "GEMINI_SCHEMA_INCOMPATIBLE",
        "$.outputContract.schema",
        `Output schema contains unsafe Gemini projection keyword(s): ${schemaCheck.unsupportedKeywords.map((item) => `${item.path}:${item.keyword}`).join(", ")}.`,
        "critical",
      ),
    ], warnings);
  }
  if (schemaCheck.canonicalSchemaHash !== hashCanonicalJson(outputSchema)) {
    return fail([issue("OUTPUT_SCHEMA_MISMATCH", "$.outputContract.schema", "Model package output schema does not match Task 001 canonical schema.", "critical")], warnings);
  }

  const configResult = dependencies.provider ? { ok: true as const, config: dryRunGeminiConfig(dependencies.env), warnings: [] as const, errors: [] as const } : loadCmipGeminiEnv(dependencies.env);
  if (!configResult.ok) return fail(configResult.errors, warnings);
  const config = configResult.config;

  if (request.executionMode === "live_smoke" && !(request.allowLiveGeminiSmoke && config.allowLiveSmoke)) {
    return fail([
      issue(
        "GEMINI_CONFIG_MISSING",
        "$.executionMode",
        "Live Gemini smoke execution requires both request.allowLiveGeminiSmoke=true and CMIP_ALLOW_LIVE_GEMINI_SMOKE=true.",
        "critical",
      ),
    ], warnings);
  }

  const modelResult = resolveCmipGeminiModelProfile(request.modelPackage.executionConfig.modelProfile, config);
  if (!modelResult.ok) return fail(modelResult.errors, warnings);
  const model = modelResult.resolution;
  if (!model.supportsInteractionsApi || !model.supportsStructuredOutput) {
    return fail([issue("GEMINI_MODEL_CAPABILITY_MISMATCH", "$.model.capabilities", "Resolved Gemini profile does not support Interactions API structured output.", "critical")], warnings);
  }

  const mapped = mapCmipPackageToGeminiInteractionRequest({
    modelPackage: request.modelPackage,
    config,
    model,
    providerSchema: schemaCheck.providerSchema,
    schemaCompatibility: schemaCheck,
    executionMode: request.executionMode,
  });
  warnings.push(...mapped.warnings);

  const provider = dependencies.provider ?? new GeminiInteractionsProvider(createCmipGeminiClient(config));
  const traceBase = createInitialCmipGeminiTrace({
    startedAt,
    executionMode: request.executionMode,
    provider: provider.providerName,
    cmipModelProfile: request.modelPackage.executionConfig.modelProfile,
    geminiProfile: model.profile,
    resolvedModel: model.modelId,
    googleSearchEnabled: mapped.googleSearchEnabled,
    maxOutputTokens: mapped.body.generation_config.max_output_tokens,
    timeoutMs: config.timeoutMs,
    schemaCompatibility: schemaCheck,
  });

  const requestHash = hashCanonicalJson(mapped.body);
  const maxAttempts = Math.max(1, config.maxAttempts, request.modelPackage.executionConfig.retryPolicy.maxAttempts);
  const attempts: CmipGeminiAttemptTrace[] = [];
  let response: CmipGeminiProviderExecutionResponse | null = null;
  let terminalErrors: CmipGeminiIssue[] = [];

  for (let attemptIndex = 0; attemptIndex < maxAttempts; attemptIndex += 1) {
    const attemptStartedAt = now();
    try {
      response = await runGeminiWithTimeout({
        timeoutMs: config.timeoutMs,
        run: (abortSignal) => provider.execute({ body: mapped.body, timeoutMs: config.timeoutMs, attemptIndex, executionId: request.modelPackage.executionId, abortSignal }),
      });
      attempts.push({
        attemptIndex,
        model: mapped.body.model,
        startedAt: attemptStartedAt,
        completedAt: now(),
        outcome: "success",
        errorCode: null,
        providerStatus: response.status,
        responseId: response.responseId,
        retryDelayMs: 0,
      });
      terminalErrors = [];
      break;
    } catch (error) {
      const classified = classifyGeminiProviderException(error);
      const retryable = isCmipGeminiRetryable(classified.code);
      const delay = retryable && attemptIndex + 1 < maxAttempts ? deterministicGeminiRetryDelayMs(attemptIndex) + jitterMs(attemptIndex) : 0;
      terminalErrors = [issue(classified.code, "$.provider", classified.message, retryable ? "error" : "critical", retryable)];
      attempts.push({
        attemptIndex,
        model: mapped.body.model,
        startedAt: attemptStartedAt,
        completedAt: now(),
        outcome: retryable && delay > 0 ? "retryable_error" : "terminal_error",
        errorCode: classified.code,
        providerStatus: null,
        responseId: null,
        retryDelayMs: delay,
      });
      if (delay > 0) {
        warnings.push(issue("GEMINI_RETRY_ATTEMPTED", "$.retry", `Retrying Gemini request after ${delay} ms.`, "warning", true));
        await sleepMs(delay);
        continue;
      }
      break;
    }
  }

  if (!response) {
    const completedAt = now();
    const trace = finishCmipGeminiTrace({ ...traceBase, attempts, repairAttempts: 0 }, completedAt, []);
    return fail(terminalErrors, warnings, {
      executionVersion: CMIP_PROVIDER_EXECUTION_VERSION,
      executionId: request.modelPackage.executionId,
      packageId: request.modelPackage.packageId,
      semanticPackageHash: request.modelPackage.integrity.semanticPackageHash,
      providerId: "gemini",
      providerExecutionVersion: CMIP_GEMINI_EXECUTION_VERSION,
      status: "failed",
      report: null,
      provider: { name: "gemini", responseId: null, model: model.modelId, rawStatus: null, serviceTier: null },
      usage: nullUsage(),
      timing: { startedAt, completedAt, durationMs: Math.max(0, Date.parse(completedAt) - Date.parse(startedAt)) },
      validation: { providerSchemaCompatible: schemaCheck.compatible, jsonParsed: false, canonicalValid: false, repairAttempted: false, repairSucceeded: false },
      attempts: attempts.map((attempt) => ({
        providerId: "gemini",
        attemptIndex: attempt.attemptIndex,
        startedAt: attempt.startedAt,
        completedAt: attempt.completedAt,
        status: "failed",
        providerRawStatus: attempt.providerStatus,
        errorCode: attempt.errorCode,
        retryDelayMs: attempt.retryDelayMs,
      })),
      warnings: warnings.map(toProviderIssue),
      errors: terminalErrors.map(toProviderIssue),
      trace: {
        routerVersion: CMIP_PROVIDER_ROUTER_VERSION,
        selectedProvider: "gemini",
        fallbackProvider: null,
        fallbackPolicy: "disabled",
        fallbackDecisions: [],
        providerTrace: trace,
      },
    });
  }

  const parsed = parseCmipGeminiResponse(response);
  let report = parsed.report;
  let parseErrors = [...parsed.errors];
  let outputTextHash = parsed.outputTextHash;
  let canonicalReportHash = parsed.canonicalReportHash;
  let jsonParsed = parsed.jsonParsed;
  let repairAttempts = 0;

  const schemaRepairAttempts = Math.max(CMIP_GEMINI_DEFAULTS.schemaRepairAttempts, request.modelPackage.executionConfig.retryPolicy.schemaRepairAttempts);
  if (response.status === "completed" && jsonParsed && parseErrors.some((error) => error.code === "GEMINI_CANONICAL_OUTPUT_INVALID") && schemaRepairAttempts > 0 && config.modelRepair) {
    warnings.push(issue("GEMINI_SCHEMA_REPAIR_ATTEMPTED", "$.repair", "One Gemini schema-repair attempt was requested after canonical validation failed.", "warning"));
    repairAttempts = 1;
    const originalParsed = parseLooseJsonObject(response.outputText);
    const repairModel = resolveCmipGeminiModelProfile("cmip_validation_repair", config);
    if (repairModel.ok) {
      const repairResponse = await runRepairAttempt({
        provider,
        body: { ...mapped.body, model: repairModel.resolution.modelId },
        config,
        executionId: `${request.modelPackage.executionId}:repair`,
        now,
      });
      attempts.push(repairResponse.attemptTrace);
      if (repairResponse.response) {
        const repairedParsed = parseCmipGeminiResponse(repairResponse.response);
        const repairedLoose = parseLooseJsonObject(repairResponse.response.outputText);
        if (originalParsed && repairedLoose && numericalValuesChanged(originalParsed, repairedLoose)) {
          parseErrors = [issue("GEMINI_SCHEMA_REPAIR_FAILED", "$.repair", "Gemini schema repair changed a numeric value from the original model output.", "critical")];
        } else if (repairedParsed.errors.length === 0) {
          report = repairedParsed.report;
          parseErrors = [];
          outputTextHash = repairedParsed.outputTextHash;
          canonicalReportHash = repairedParsed.canonicalReportHash;
          jsonParsed = repairedParsed.jsonParsed;
        } else {
          parseErrors = [issue("GEMINI_SCHEMA_REPAIR_FAILED", "$.repair", "Gemini schema repair did not produce a valid CMIP output.", "error"), ...repairedParsed.errors];
        }
      } else {
        parseErrors = [issue("GEMINI_SCHEMA_REPAIR_FAILED", "$.repair", "Gemini schema repair provider call failed.", "error"), ...repairResponse.errors];
      }
    }
  }

  if (outputContainsSecretLikeValue(response.outputText)) {
    parseErrors = [issue("GEMINI_OUTPUT_JSON_INVALID", "$.provider.outputText", "Gemini output contained secret-like material and was rejected.", "critical"), ...parseErrors];
  }

  const status = statusForResponse(response, parseErrors, report);
  const completedAt = now();
  const trace = finishCmipGeminiTrace({ ...traceBase, attempts, repairAttempts }, completedAt, response.toolSources);
  const executionErrors = status === "success" ? [] : parseErrors.length ? parseErrors : [issue("GEMINI_RESPONSE_FAILED", "$.provider", "Gemini execution did not produce a publishable CMIP report.", "error")];
  const result: CmipProviderNeutralExecutionResult = {
    executionVersion: CMIP_PROVIDER_EXECUTION_VERSION,
    executionId: request.modelPackage.executionId,
    packageId: request.modelPackage.packageId,
    semanticPackageHash: request.modelPackage.integrity.semanticPackageHash,
    providerId: "gemini",
    providerExecutionVersion: CMIP_GEMINI_EXECUTION_VERSION,
    status,
    report: status === "success" ? report : null,
    provider: {
      name: "gemini",
      responseId: response.responseId,
      model: response.model,
      rawStatus: response.status,
      serviceTier: response.serviceTier,
    },
    usage: response.usage ?? nullUsage(),
    timing: {
      startedAt,
      completedAt,
      durationMs: Math.max(0, Date.parse(completedAt) - Date.parse(startedAt)),
    },
    validation: {
      providerSchemaCompatible: schemaCheck.compatible,
      jsonParsed,
      canonicalValid: status === "success",
      repairAttempted: repairAttempts > 0,
      repairSucceeded: repairAttempts > 0 && status === "success",
    },
    attempts: attempts.map((attempt) => ({
      providerId: "gemini",
      attemptIndex: attempt.attemptIndex,
      startedAt: attempt.startedAt,
      completedAt: attempt.completedAt,
      status: attempt.providerStatus === "completed" && attempt.outcome !== "repair_failed" ? "success" : attempt.providerStatus === "incomplete" ? "incomplete" : attempt.providerStatus === "blocked" || attempt.providerStatus === "refused" ? "refused" : "failed",
      providerRawStatus: attempt.providerStatus,
      errorCode: attempt.errorCode,
      retryDelayMs: attempt.retryDelayMs,
    })),
    warnings: warnings.map(toProviderIssue),
    errors: executionErrors.map(toProviderIssue),
    trace: {
      routerVersion: CMIP_PROVIDER_ROUTER_VERSION,
      selectedProvider: "gemini",
      fallbackProvider: null,
      fallbackPolicy: "disabled",
      fallbackDecisions: [],
      providerTrace: trace,
    },
  };

  const resultValidation = validateCmipGeminiExecutionResult(result);
  if (!resultValidation.valid) {
    return fail(resultValidation.errors.map((error) => issue("GEMINI_RESULT_INVALID", error.path, error.message, "critical")), warnings);
  }

  return status === "success" ? { ok: true, result, warnings: dedupeIssues(warnings), errors: [] } : fail(executionErrors, warnings, result);
}

async function runRepairAttempt(params: {
  readonly provider: CmipGeminiProvider;
  readonly body: ReturnType<typeof mapCmipPackageToGeminiInteractionRequest>["body"];
  readonly config: CmipGeminiEnvConfig;
  readonly executionId: string;
  readonly now: () => string;
}): Promise<{ readonly response: CmipGeminiProviderExecutionResponse | null; readonly attemptTrace: CmipGeminiAttemptTrace; readonly errors: readonly CmipGeminiIssue[] }> {
  const startedAt = params.now();
  try {
    const response = await runGeminiWithTimeout({
      timeoutMs: params.config.timeoutMs,
      run: (abortSignal) =>
        params.provider.execute({
          body: params.body,
          timeoutMs: params.config.timeoutMs,
          attemptIndex: 0,
          executionId: params.executionId,
          abortSignal,
        }),
    });
    return {
      response,
      errors: [],
      attemptTrace: {
        attemptIndex: 0,
        model: params.body.model,
        startedAt,
        completedAt: params.now(),
        outcome: response.status === "completed" ? "repair_success" : "repair_failed",
        errorCode: null,
        providerStatus: response.status,
        responseId: response.responseId,
        retryDelayMs: 0,
      },
    };
  } catch (error) {
    const classified = classifyGeminiProviderException(error);
    return {
      response: null,
      errors: [issue(classified.code, "$.repair.provider", classified.message, "error", isCmipGeminiRetryable(classified.code))],
      attemptTrace: {
        attemptIndex: 0,
        model: params.body.model,
        startedAt,
        completedAt: params.now(),
        outcome: "repair_failed",
        errorCode: classified.code,
        providerStatus: null,
        responseId: null,
        retryDelayMs: 0,
      },
    };
  }
}

function statusForResponse(response: CmipGeminiProviderExecutionResponse, errors: readonly CmipGeminiIssue[], report: unknown): CmipProviderNeutralExecutionResult["status"] {
  if (response.refusal || response.status === "blocked" || response.status === "refused") return "refused";
  if (response.status === "incomplete") return "incomplete";
  if (response.status !== "completed") return "failed";
  return errors.length || !report ? "failed" : "success";
}

function verifyModelPackageIntegrity(modelPackage: CmipModelExecutionPackage): readonly CmipGeminiIssue[] {
  const errors: CmipGeminiIssue[] = [];
  modelPackage.messages.forEach((message, index) => {
    if (sha256Hex(message.content) !== message.contentHash) {
      errors.push(issue("MODEL_PACKAGE_INTEGRITY_INVALID", `$.messages[${index}].contentHash`, "Message content hash does not match message content.", "critical"));
    }
  });
  if (modelPackage.messages[0] && modelPackage.integrity.systemInstructionsHash !== modelPackage.messages[0].contentHash) {
    errors.push(issue("MODEL_PACKAGE_INTEGRITY_INVALID", "$.integrity.systemInstructionsHash", "System instruction hash does not match message hash.", "critical"));
  }
  if (modelPackage.messages[1] && modelPackage.integrity.intelligenceContextHash !== modelPackage.messages[1].contentHash) {
    errors.push(issue("MODEL_PACKAGE_INTEGRITY_INVALID", "$.integrity.intelligenceContextHash", "Intelligence context hash does not match message hash.", "critical"));
  }
  if (modelPackage.messages[3] && modelPackage.integrity.runtimeContextHash !== runtimeContextHashFromMessage(modelPackage.messages[3].content)) {
    errors.push(issue("MODEL_PACKAGE_INTEGRITY_INVALID", "$.integrity.runtimeContextHash", "Runtime context hash does not match runtime message content.", "critical"));
  }
  if (modelPackage.integrity.outputSchemaHash !== hashCanonicalJson(modelPackage.outputContract.schema)) {
    errors.push(issue("MODEL_PACKAGE_INTEGRITY_INVALID", "$.integrity.outputSchemaHash", "Output schema hash does not match package output contract.", "critical"));
  }
  const semanticHash = recomputeSemanticPackageHash(modelPackage);
  if (modelPackage.integrity.semanticPackageHash !== semanticHash || modelPackage.integrity.fullPackageHash !== semanticHash) {
    errors.push(issue("MODEL_PACKAGE_INTEGRITY_INVALID", "$.integrity.semanticPackageHash", "Semantic package hash does not match package content.", "critical"));
  }
  const instanceHash = recomputeInstancePackageHash(modelPackage);
  if (modelPackage.integrity.instancePackageHash !== instanceHash) {
    errors.push(issue("MODEL_PACKAGE_INTEGRITY_INVALID", "$.integrity.instancePackageHash", "Instance package hash does not match package content.", "critical"));
  }
  return errors;
}

function recomputeSemanticPackageHash(modelPackage: CmipModelExecutionPackage): string {
  return hashCanonicalJson({
    packageVersion: modelPackage.packageVersion,
    executionId: modelPackage.executionId,
    versions: modelPackage.versions,
    messages: modelPackage.messages,
    outputContract: modelPackage.outputContract,
    toolPolicy: modelPackage.toolPolicy,
    executionConfig: modelPackage.executionConfig,
    contextBudget: modelPackage.contextBudget,
    trace: {
      ...modelPackage.trace,
      buildStartedAt: "[semantic-hash-excluded]",
      buildCompletedAt: "[semantic-hash-excluded]",
    },
  });
}

function recomputeInstancePackageHash(modelPackage: CmipModelExecutionPackage): string {
  const { integrity: _integrity, ...withoutIntegrity } = modelPackage;
  return hashCanonicalJson(withoutIntegrity);
}

function runtimeContextHashFromMessage(content: string): string {
  const start = content.indexOf("<CMIP_RUNTIME_CONTEXT>");
  const end = content.indexOf("</CMIP_RUNTIME_CONTEXT>");
  if (start === -1 || end === -1) return "";
  const json = content.slice(start + "<CMIP_RUNTIME_CONTEXT>".length, end).trim();
  try {
    return hashCanonicalJson(JSON.parse(json));
  } catch {
    return "";
  }
}

function fail(errors: readonly CmipGeminiIssue[], warnings: readonly CmipGeminiIssue[], result?: CmipProviderNeutralExecutionResult): CmipGeminiExecutionResult {
  if (result) return { ok: false, result, warnings: dedupeIssues(warnings), errors: dedupeIssues(errors) };
  return { ok: false, warnings: dedupeIssues(warnings), errors: dedupeIssues(errors) };
}

function failedNeutralResult(
  request: Partial<CmipGeminiExecutionRequest>,
  startedAt: string,
  errors: readonly CmipGeminiIssue[],
  warnings: readonly CmipGeminiIssue[],
): CmipProviderNeutralExecutionResult {
  const completedAt = new Date().toISOString();
  const modelPackage = request.modelPackage;
  return {
    executionVersion: CMIP_PROVIDER_EXECUTION_VERSION,
    executionId: modelPackage?.executionId ?? "unavailable",
    packageId: modelPackage?.packageId ?? "unavailable",
    semanticPackageHash: modelPackage?.integrity.semanticPackageHash ?? "0".repeat(64),
    providerId: "gemini",
    providerExecutionVersion: CMIP_GEMINI_EXECUTION_VERSION,
    status: errors.some((error) => error.code === "GEMINI_REFUSAL") ? "refused" : errors.some((error) => error.code === "GEMINI_RESPONSE_INCOMPLETE") ? "incomplete" : "failed",
    report: null,
    provider: { name: "gemini", responseId: null, model: null, rawStatus: null, serviceTier: null },
    usage: nullUsage(),
    timing: { startedAt, completedAt, durationMs: Math.max(0, Date.parse(completedAt) - Date.parse(startedAt)) },
    validation: { providerSchemaCompatible: false, jsonParsed: false, canonicalValid: false, repairAttempted: false, repairSucceeded: false },
    attempts: [],
    warnings: dedupeIssues(warnings).map(toProviderIssue),
    errors: dedupeIssues(errors).map(toProviderIssue),
    trace: {
      routerVersion: CMIP_PROVIDER_ROUTER_VERSION,
      selectedProvider: "gemini",
      fallbackProvider: null,
      fallbackPolicy: "disabled",
      fallbackDecisions: [],
      providerTrace: null,
    },
  };
}

function dedupeIssues(issues: readonly CmipGeminiIssue[]): readonly CmipGeminiIssue[] {
  const seen = new Set<string>();
  const result: CmipGeminiIssue[] = [];
  for (const item of issues) {
    const key = JSON.stringify({ code: item.code, path: item.path, message: item.message, sourceRefs: [...item.sourceRefs].sort() });
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }
  return result;
}

function isExecutionRequest(value: unknown): value is CmipGeminiExecutionRequest {
  return Boolean(value) && typeof value === "object" && isRecord((value as Record<string, unknown>).modelPackage) && typeof (value as Record<string, unknown>).executionMode === "string";
}

function toProviderIssue(issueValue: CmipGeminiIssue) {
  return { ...issueValue, domain: "gemini" as const };
}

function issue(code: CmipGeminiIssue["code"], path: string, message: string, severity: CmipGeminiIssue["severity"], retryable = false): CmipGeminiIssue {
  return cmipGeminiIssue({ code, path, message, severity, retryable });
}

function nullUsage() {
  return { inputTokens: null, cachedInputTokens: null, outputTokens: null, reasoningTokens: null, totalTokens: null };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
