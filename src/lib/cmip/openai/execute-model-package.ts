import outputSchema from "../contracts/output-schema.json";
import type { CmipReportEnvelope } from "../contracts";
import { validateCmipModelExecutionPackage } from "../model-package/validate-model-package";
import { hashCanonicalJson, sha256Hex } from "../model-package";
import type { CmipModelExecutionPackage } from "../model-package";
import { createCmipOpenAiClient } from "./client";
import { CMIP_OPENAI_EXECUTION_VERSION, CMIP_OPENAI_DEFAULTS } from "./constants";
import { loadCmipOpenAiEnv } from "./env";
import { cmipOpenAiIssue } from "./errors";
import type { CmipOpenAiIssue } from "./errors";
import { createInitialCmipOpenAiTrace, finishCmipOpenAiTrace } from "./execution-trace";
import { resolveCmipOpenAiModelProfile } from "./model-registry";
import { OpenAiResponsesProvider } from "./provider/openai-provider";
import { mapCmipPackageToOpenAiResponseRequest } from "./request-mapper";
import { classifyProviderException, deterministicRetryDelayMs, isCmipOpenAiRetryable } from "./retry";
import { createOpenAiProviderSchema } from "./schema-compatibility";
import { numericalValuesChanged, outputContainsSecretLikeValue, parseCmipOpenAiResponse, parseLooseJsonObject } from "./response-parser";
import { runWithTimeout } from "./timeout";
import type {
  CmipOpenAiAttemptTrace,
  CmipOpenAiEnvConfig,
  CmipOpenAiExecutionOptions,
  CmipOpenAiExecutionRecord,
  CmipOpenAiExecutionRequest,
  CmipOpenAiExecutionResult,
  CmipOpenAiProvider,
  CmipOpenAiProviderExecutionResponse,
} from "./types";
import { validateCmipOpenAiExecutionResult } from "./validate-execution-result";

export async function executeCmipModelPackage(request: CmipOpenAiExecutionRequest, options: CmipOpenAiExecutionOptions = {}): Promise<CmipOpenAiExecutionResult> {
  const now = options.now ?? (() => new Date().toISOString());
  const sleepMs = options.sleepMs ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const jitterMs = options.jitterMs ?? (() => 0);
  const startedAt = now();
  const warnings: CmipOpenAiIssue[] = [];

  if (!isExecutionRequest(request)) {
    return fail([issue("INVALID_EXECUTION_REQUEST", "$", "Execution request must include modelPackage and executionMode.", "critical")], warnings);
  }

  const packageValidation = validateCmipModelExecutionPackage(request.modelPackage);
  if (!packageValidation.valid) {
    return fail(packageValidation.errors.map((error) => issue("MODEL_PACKAGE_INVALID", error.path, error.message, "critical")), warnings);
  }

  const integrityErrors = verifyModelPackageIntegrity(request.modelPackage);
  if (integrityErrors.length) return fail(integrityErrors, warnings);

  const schemaCheck = createOpenAiProviderSchema(request.modelPackage.outputContract.schema);
  if (!schemaCheck.report.compatible) {
    return fail([
      issue(
        "OUTPUT_SCHEMA_UNSUPPORTED",
        "$.outputContract.schema",
        `Output schema contains unsupported strict provider keyword(s): ${schemaCheck.report.unsupportedKeywords.join(", ")}.`,
        "critical",
      ),
    ], warnings);
  }
  if (schemaCheck.report.canonicalSchemaHash !== hashCanonicalJson(outputSchema)) {
    return fail([issue("OUTPUT_SCHEMA_MISMATCH", "$.outputContract.schema", "Model package output schema does not match Task 001 canonical schema.", "critical")], warnings);
  }

  const configResult = options.provider ? dryRunConfig(options.env) : loadCmipOpenAiEnv(options.env);
  if (!configResult.ok) return fail(configResult.errors, warnings);
  const config = configResult.config;

  if (request.executionMode === "live_smoke" && !(request.allowLiveOpenAiSmoke && config.allowLiveSmoke)) {
    return fail([
      issue(
        "OPENAI_LIVE_SMOKE_NOT_ALLOWED",
        "$.executionMode",
        "Live OpenAI smoke execution requires both request.allowLiveOpenAiSmoke=true and CMIP_ALLOW_LIVE_OPENAI_SMOKE=true.",
        "critical",
      ),
    ], warnings);
  }

  const modelResult = resolveCmipOpenAiModelProfile(request.modelPackage.executionConfig.modelProfile, config);
  if (!modelResult.ok) return fail(modelResult.errors, warnings);

  const mapped = mapCmipPackageToOpenAiResponseRequest({
    modelPackage: request.modelPackage,
    config,
    model: modelResult.resolution,
    providerSchema: schemaCheck.schema,
    schemaCompatibility: schemaCheck.report,
  });
  warnings.push(...mapped.warnings);

  const provider = options.provider ?? new OpenAiResponsesProvider(createCmipOpenAiClient(config));
  const traceBase = createInitialCmipOpenAiTrace({
    modelPackage: request.modelPackage,
    startedAt,
    executionMode: request.executionMode,
    provider: provider.providerName,
    modelProfile: request.modelPackage.executionConfig.modelProfile,
    resolvedModel: modelResult.resolution.model,
    toolChoice: mapped.body.tool_choice ?? "none",
    webSearchEnabled: Boolean(mapped.body.tools?.length),
    maxOutputTokens: mapped.body.max_output_tokens,
    timeoutMs: config.timeoutMs,
    schemaCompatibility: mapped.schemaCompatibility,
  });

  const requestHash = hashCanonicalJson(mapped.body);
  const maxAttempts = Math.max(1, config.maxAttempts, request.modelPackage.executionConfig.retryPolicy.maxAttempts);
  const attempts: CmipOpenAiAttemptTrace[] = [];
  let response: CmipOpenAiProviderExecutionResponse | null = null;
  let terminalErrors: CmipOpenAiIssue[] = [];

  for (let attemptIndex = 0; attemptIndex < maxAttempts; attemptIndex += 1) {
    const attemptStartedAt = now();
    try {
      response = await runWithTimeout({
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
      const classified = classifyProviderException(error);
      const retryable = isCmipOpenAiRetryable(classified.code);
      const delay = retryable && attemptIndex + 1 < maxAttempts ? deterministicRetryDelayMs(attemptIndex) + jitterMs(attemptIndex) : 0;
      const executionIssue = issue(classified.code, "$.provider", classified.message, retryable ? "error" : "critical", retryable);
      terminalErrors = [executionIssue];
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
        warnings.push(issue("OPENAI_RETRY_ATTEMPTED", "$.retry", `Retrying OpenAI request after ${delay} ms.`, "warning", true));
        await sleepMs(delay);
        continue;
      }
      break;
    }
  }

  if (!response) return fail(terminalErrors, warnings);
  const parsed = parseCmipOpenAiResponse(response);
  let report = parsed.report as CmipReportEnvelope | null;
  let parseErrors = [...parsed.errors];
  let outputTextHash = parsed.outputTextHash;
  let canonicalReportHash = parsed.canonicalReportHash;
  let repairAttempts = 0;

  const schemaRepairAttempts = Math.max(CMIP_OPENAI_DEFAULTS.schemaRepairAttempts, request.modelPackage.executionConfig.retryPolicy.schemaRepairAttempts);
  if (parseErrors.some((error) => error.code === "MODEL_OUTPUT_SCHEMA_INVALID") && schemaRepairAttempts > 0) {
    warnings.push(issue("OPENAI_SCHEMA_REPAIR_ATTEMPTED", "$.repair", "One schema-repair attempt was requested after canonical validation failed.", "warning"));
    repairAttempts = 1;
    const originalParsed = parseLooseJsonObject(response.outputText);
    const repairResponse = await runRepairAttempt({
      provider,
      request,
      config,
      body: { ...mapped.body, model: config.modelRepair ?? mapped.body.model },
      now,
    });
    attempts.push(repairResponse.attemptTrace);
    if (repairResponse.response) {
      const repairedParsed = parseCmipOpenAiResponse(repairResponse.response);
      const repairedLoose = parseLooseJsonObject(repairResponse.response.outputText);
      if (originalParsed && repairedLoose && numericalValuesChanged(originalParsed, repairedLoose)) {
        parseErrors = [issue("SCHEMA_REPAIR_FAILED", "$.repair", "Schema repair changed a numeric value from the original model output.", "critical")];
      } else if (repairedParsed.errors.length === 0) {
        report = repairedParsed.report as CmipReportEnvelope;
        parseErrors = [];
        outputTextHash = repairedParsed.outputTextHash;
        canonicalReportHash = repairedParsed.canonicalReportHash;
      } else {
        parseErrors = [issue("SCHEMA_REPAIR_FAILED", "$.repair", "Schema repair did not produce a valid CMIP output.", "error"), ...repairedParsed.errors];
      }
    } else {
      parseErrors = [issue("SCHEMA_REPAIR_FAILED", "$.repair", "Schema repair provider call failed.", "error"), ...repairResponse.errors];
    }
  }

  if (outputContainsSecretLikeValue(response.outputText)) {
    parseErrors = [issue("SECRET_LEAK_DETECTED", "$.provider.outputText", "Model output contained secret-like material and was rejected.", "critical"), ...parseErrors];
  }

  const status = statusForResponse(response, parseErrors, report);
  const completedAt = now();
  const trace = finishCmipOpenAiTrace(
    {
      ...traceBase,
      attempts,
      repairAttempts,
    },
    completedAt,
    response.toolSources,
  );
  const executionErrors = status === "success" ? [] : parseErrors.length ? parseErrors : [issue("MODEL_RESPONSE_FAILED", "$.provider", "OpenAI execution did not produce a publishable CMIP report.", "error")];
  const recordWithoutIntegrity: Omit<CmipOpenAiExecutionRecord, "integrity"> = {
    executionVersion: CMIP_OPENAI_EXECUTION_VERSION,
    executionId: request.modelPackage.executionId,
    packageId: request.modelPackage.packageId,
    packageSemanticHash: request.modelPackage.integrity.semanticPackageHash,
    status,
    responseId: response.responseId,
    model: response.model,
    serviceTier: response.serviceTier,
    report: status === "success" ? report : null,
    canonicalValid: status === "success",
    errors: executionErrors,
    warnings,
    usage: response.usage,
    trace,
  };
  const record: CmipOpenAiExecutionRecord = {
    ...recordWithoutIntegrity,
    integrity: {
      algorithm: "sha256",
      requestHash,
      outputTextHash,
      canonicalReportHash: status === "success" ? canonicalReportHash : null,
      executionResultHash: hashCanonicalJson(recordWithoutIntegrity),
    },
  };

  const resultValidation = validateCmipOpenAiExecutionResult(record);
  if (!resultValidation.valid) {
    return fail(resultValidation.errors.map((error) => issue("EXECUTION_RESULT_INVALID", error.path, error.message, "critical")), warnings);
  }

  return status === "success" ? { ok: true, result: record, warnings, errors: [] } : fail(executionErrors, warnings);
}

async function runRepairAttempt(params: {
  readonly provider: CmipOpenAiProvider;
  readonly request: CmipOpenAiExecutionRequest;
  readonly config: CmipOpenAiEnvConfig;
  readonly body: ReturnType<typeof mapCmipPackageToOpenAiResponseRequest>["body"];
  readonly now: () => string;
}): Promise<{ readonly response: CmipOpenAiProviderExecutionResponse | null; readonly attemptTrace: CmipOpenAiAttemptTrace; readonly errors: readonly CmipOpenAiIssue[] }> {
  const startedAt = params.now();
  try {
    const response = await runWithTimeout({
      timeoutMs: params.config.timeoutMs,
      run: (abortSignal) =>
        params.provider.execute({
          body: params.body,
          timeoutMs: params.config.timeoutMs,
          attemptIndex: 0,
          executionId: `${params.request.modelPackage.executionId}:repair`,
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
    const classified = classifyProviderException(error);
    return {
      response: null,
      errors: [issue(classified.code, "$.repair.provider", classified.message, "error", isCmipOpenAiRetryable(classified.code))],
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

function statusForResponse(response: CmipOpenAiProviderExecutionResponse, errors: readonly CmipOpenAiIssue[], report: CmipReportEnvelope | null): CmipOpenAiExecutionRecord["status"] {
  if (response.refusal) return "refused";
  if (response.status === "incomplete") return "incomplete";
  if (response.status !== "completed") return "failed";
  return errors.length || !report ? "failed" : "success";
}

function verifyModelPackageIntegrity(modelPackage: CmipModelExecutionPackage): readonly CmipOpenAiIssue[] {
  const errors: CmipOpenAiIssue[] = [];
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

function dryRunConfig(env: Partial<Record<string, string | undefined>> | undefined): { ok: true; config: CmipOpenAiEnvConfig; warnings: []; errors: [] } {
  return {
    ok: true,
    config: {
      apiKey: "[dry-run]",
      organizationId: env?.OPENAI_ORGANIZATION_ID ?? null,
      projectId: env?.OPENAI_PROJECT_ID ?? null,
      modelPrimary: env?.CMIP_OPENAI_MODEL_PRIMARY ?? "gpt-5-cmip-dry-run",
      modelFallback: env?.CMIP_OPENAI_MODEL_FALLBACK ?? "gpt-5-cmip-dry-run-fallback",
      modelRepair: env?.CMIP_OPENAI_MODEL_REPAIR ?? "gpt-5-cmip-dry-run-repair",
      enableWebSearch: env?.CMIP_OPENAI_ENABLE_WEB_SEARCH === "true",
      maxOutputTokens: numberFromEnv(env?.CMIP_OPENAI_MAX_OUTPUT_TOKENS, CMIP_OPENAI_DEFAULTS.maxOutputTokens),
      timeoutMs: numberFromEnv(env?.CMIP_OPENAI_TIMEOUT_MS, CMIP_OPENAI_DEFAULTS.timeoutMs),
      maxAttempts: numberFromEnv(env?.CMIP_OPENAI_MAX_ATTEMPTS, CMIP_OPENAI_DEFAULTS.maxAttempts),
      reasoningEffort: "high",
      serviceTier: "auto",
      allowLiveSmoke: false,
    },
    warnings: [],
    errors: [],
  };
}

function numberFromEnv(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function fail(errors: readonly CmipOpenAiIssue[], warnings: readonly CmipOpenAiIssue[]): CmipOpenAiExecutionResult {
  return { ok: false, warnings: dedupeIssues(warnings), errors: dedupeIssues(errors) };
}

function dedupeIssues(issues: readonly CmipOpenAiIssue[]): readonly CmipOpenAiIssue[] {
  const seen = new Set<string>();
  const result: CmipOpenAiIssue[] = [];
  for (const item of issues) {
    const key = JSON.stringify({ code: item.code, path: item.path, message: item.message, sourceRefs: [...item.sourceRefs].sort() });
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }
  return result;
}

function isExecutionRequest(value: unknown): value is CmipOpenAiExecutionRequest {
  return Boolean(value) && typeof value === "object" && isRecord((value as Record<string, unknown>).modelPackage) && typeof (value as Record<string, unknown>).executionMode === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function issue(
  code: CmipOpenAiIssue["code"],
  path: string,
  message: string,
  severity: CmipOpenAiIssue["severity"],
  retryable = false,
): CmipOpenAiIssue {
  return cmipOpenAiIssue({ code, path, message, severity, retryable });
}
