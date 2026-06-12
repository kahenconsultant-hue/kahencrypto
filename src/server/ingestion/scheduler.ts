import { randomUUID } from "node:crypto";
import { runIngestionFoundation } from "@/api/ingestion";
import { resolveSignalFreshness, signalFreshnessClassification } from "@/health/freshnessResolver";
import { REFRESH_INTERVAL_MINUTES } from "@/server/analytics/market-signals";
import { runDerivedSignalProcessing } from "@/server/analytics/derived-signal-engine";
import { buildForecastSnapshots } from "@/server/analytics/forecast_snapshot_engine";
import { validateDueForecasts } from "@/server/analytics/forecast_validation_engine";
import { getSignalSnapshot } from "@/server/analytics/market-signals";
import { refreshSignalCache } from "@/server/data/signal-cache";
import { persistForecastSnapshots, persistForecastValidations, persistIngestionRun, persistSchedulerRun } from "@/storage/ingestion-store";
import type { IngestionRunSummary, SchedulerRunRecord, SchedulerStageRun } from "@/types/ingestion";

const DEFAULT_STAGE_TIMEOUT_MS = 75_000;

export const INGESTION_SCHEDULER_STAGES = [
  {
    stageId: "market_data",
    label: "Stage 1: Market Data",
    sourceIds: ["cmip-public-market-signal-adapters", "binance-public-rest", "bybit-public-rest"],
  },
  {
    stageId: "macro_data",
    label: "Stage 2: Macro Data",
    sourceIds: ["fred-api", "fed-press-rss", "ecb-press-rss", "treasury-press-rss"],
  },
  {
    stageId: "news",
    label: "Stage 3: News",
    sourceIds: ["sec-press-rss", "coindesk-rss", "theblock-rss", "cointelegraph-rss", "cnbc-markets-rss", "decrypt-rss", "blockworks-rss"],
  },
  {
    stageId: "etf",
    label: "Stage 4: ETF",
    sourceIds: ["farside-btc-etf-flows", "farside-eth-etf-flows"],
    timeoutMs: 20_000,
  },
] as const;

function durationMs(startedAt: string, finishedAt: string) {
  return Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt));
}

async function withStageTimeout<T>(promise: Promise<T>, label: string, timeoutMs = DEFAULT_STAGE_TIMEOUT_MS): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms.`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function etfStageDetails(summary: IngestionRunSummary): Record<string, unknown> | undefined {
  const diagnostics = summary.diagnostics?.filter((item) => item.sourceId.includes("etf")) ?? [];
  if (!diagnostics.length) return undefined;
  const values = diagnostics.map((item) => item.diagnostics);
  const btc = diagnostics.find((item) => item.sourceId.includes("btc"))?.diagnostics;
  const eth = diagnostics.find((item) => item.sourceId.includes("eth"))?.diagnostics;
  return {
    etfStageDurationMs: durationMs(summary.startedAt, summary.finishedAt),
    farsideStatus: Array.from(new Set(values.map((item) => item.farsideStatus).filter(Boolean))).join(", ") || null,
    theBlockStatus: Array.from(new Set(values.map((item) => item.theBlockStatus).filter(Boolean))).join(", ") || null,
    parsedBtcRows: btc?.parsedRowsCount ?? 0,
    parsedEthRows: eth?.parsedRowsCount ?? 0,
    latestBtcEtfDate: btc?.latestDate ?? null,
    latestEthEtfDate: eth?.latestDate ?? null,
    usedFallbackSource: values.some((item) => item.usedFallbackSource) ? "The Block" : values.some((item) => item.usedCache) ? "Cache" : "Farside",
    etfFreshness: Array.from(new Set(values.map((item) => item.freshness).filter(Boolean))).join(", ") || "unavailable",
    sourceStatuses: diagnostics.map((item) => ({
      sourceId: item.sourceId,
      provider: item.diagnostics.provider ?? null,
      overallStatus: item.diagnostics.overallStatus ?? null,
      durationMs: item.diagnostics.durationMs ?? null,
      latestTotalFlowUsdMillion: item.diagnostics.latestTotalFlowUsdMillion ?? null,
      validationStatus: item.diagnostics.validationStatus ?? null,
      errors: item.diagnostics.errors ?? [],
    })),
  };
}

function isNonBlockingSourceDegradation(sourceId: string, message?: string | null) {
  const text = message ?? "";
  if (sourceId.includes("etf") && /real ETF rows were loaded from The Block|fallback/i.test(text)) return true;
  if (sourceId === "cmip-public-market-signal-adapters") {
    const coreMatch = text.match(/Core adapters\s+(\d+)\/(\d+)/i);
    const coreComplete = coreMatch ? Number(coreMatch[1]) === Number(coreMatch[2]) : false;
    return coreComplete && /optional enrichments missing/i.test(text) && !/Blocking core adapter failure/i.test(text);
  }
  return false;
}

function stageOperationalStatus(summary: IngestionRunSummary) {
  const failedRows = summary.sourceHealth.filter((source) => source.status === "failed");
  const degradedRows = summary.sourceHealth.filter((source) => source.status === "degraded");
  const blockingFailures = failedRows.filter((source) => !isNonBlockingSourceDegradation(source.sourceId, source.lastError));
  const blockingDegradations = degradedRows.filter((source) => !isNonBlockingSourceDegradation(source.sourceId, source.lastError));
  const nonBlockingLimitations = [...failedRows, ...degradedRows].filter((source) =>
    isNonBlockingSourceDegradation(source.sourceId, source.lastError),
  );
  const allSourcesFailed = summary.failedSources > 0 && summary.successfulSources === 0 && summary.degradedSources === 0;
  const status =
    allSourcesFailed || blockingFailures.length
      ? "failed"
      : blockingDegradations.length || summary.deadLetters > 0
        ? "degraded"
        : nonBlockingLimitations.length
          ? "success_with_limited_confidence"
          : "success";

  return {
    status,
    failedSources: blockingFailures.length,
    degradedSources: blockingDegradations.length,
    nonBlockingLimitations,
    originalFailedSources: summary.failedSources,
    originalDegradedSources: summary.degradedSources,
    allSourcesFailed,
  } as const;
}

function stageFromSummary(stage: (typeof INGESTION_SCHEDULER_STAGES)[number], summary: IngestionRunSummary): SchedulerStageRun {
  const operational = stageOperationalStatus(summary);
  return {
    stageId: stage.stageId,
    label: stage.label,
    status: operational.status,
    startedAt: summary.startedAt,
    finishedAt: summary.finishedAt,
    durationMs: durationMs(summary.startedAt, summary.finishedAt),
    sourceIds: [...stage.sourceIds],
    runId: summary.runId,
    pulledEvents: summary.pulledEvents,
    pulledMetrics: summary.pulledMetrics,
    persistedEvents: summary.persistedEvents,
    persistedMetrics: summary.persistedMetrics,
    failedSources: operational.failedSources,
    degradedSources: operational.degradedSources,
    deadLetters: summary.deadLetters,
    retryCount: summary.logs.reduce((sum, log) => sum + Math.max(0, log.attempts - 1), 0),
    details: {
      ...(stage.stageId === "etf" ? etfStageDetails(summary) ?? {} : {}),
      operationalStatus: operational.status,
      blocking: operational.status === "failed" || operational.status === "degraded",
      originalFailedSources: operational.originalFailedSources,
      originalDegradedSources: operational.originalDegradedSources,
      nonBlockingLimitations: operational.nonBlockingLimitations.map((source) => ({
        sourceId: source.sourceId,
        status: source.status,
        reason: source.lastError ?? "non-blocking limited-confidence source condition",
      })),
    },
  };
}

function failedStage(stage: (typeof INGESTION_SCHEDULER_STAGES)[number], startedAt: string, error: unknown): SchedulerStageRun {
  const finishedAt = new Date().toISOString();
  const message = error instanceof Error ? error.message : String(error);
  return {
    stageId: stage.stageId,
    label: stage.label,
    status: "failed",
    startedAt,
    finishedAt,
    durationMs: durationMs(startedAt, finishedAt),
    sourceIds: [...stage.sourceIds],
    pulledEvents: 0,
    pulledMetrics: 0,
    persistedEvents: 0,
    persistedMetrics: 0,
    failedSources: stage.sourceIds.length,
    degradedSources: 0,
    deadLetters: stage.sourceIds.length,
    retryCount: 0,
    error: message,
  };
}

function fusionStage(startedAt: string, refresh: Awaited<ReturnType<typeof refreshSignalCache>>, derived: Awaited<ReturnType<typeof runDerivedSignalProcessing>>): SchedulerStageRun {
  const finishedAt = new Date().toISOString();
  const unavailableSignals = refresh.failedSources.map((failure) => {
    const classification = signalFreshnessClassification({ key: failure.key, source: failure.source });
    return {
      ...failure,
      classification,
      blocking: classification === "CORE_REQUIRED",
    };
  });
  const blockingFailures = unavailableSignals.filter((failure) => failure.blocking);
  const nonBlockingLimitations = unavailableSignals.filter((failure) => !failure.blocking);
  const status = blockingFailures.length
    ? "degraded"
    : nonBlockingLimitations.length
      ? "success_with_limited_confidence"
      : "success";
  return {
    stageId: "fusion",
    label: "Stage 5: Fusion",
    status,
    startedAt,
    finishedAt,
    durationMs: durationMs(startedAt, finishedAt),
    sourceIds: ["signal-cache", "derived-signal-processing"],
    pulledEvents: 0,
    pulledMetrics: refresh.counts.total,
    persistedEvents: 0,
    persistedMetrics: derived.persisted.derivedSignals,
    failedSources: blockingFailures.length,
    degradedSources: status === "success_with_limited_confidence" ? nonBlockingLimitations.length : blockingFailures.length ? 1 : 0,
    deadLetters: 0,
    retryCount: 0,
    details: {
      operationalStatus: status,
      blocking: Boolean(blockingFailures.length),
      blockingMissingInputs: blockingFailures.map((failure) => failure.key),
      nonBlockingMissingInputs: nonBlockingLimitations.map((failure) => failure.key),
      confidenceLimitedBy: nonBlockingLimitations.length ? "optional/free/premium unavailable inputs" : null,
      signalCounts: refresh.counts,
      derivedSignalsPersisted: derived.persisted.derivedSignals,
    },
  };
}

function failedFusionStage(startedAt: string, error: unknown): SchedulerStageRun {
  const finishedAt = new Date().toISOString();
  return {
    stageId: "fusion",
    label: "Stage 5: Fusion",
    status: "failed",
    startedAt,
    finishedAt,
    durationMs: durationMs(startedAt, finishedAt),
    sourceIds: ["signal-cache", "derived-signal-processing"],
    pulledEvents: 0,
    pulledMetrics: 0,
    persistedEvents: 0,
    persistedMetrics: 0,
    failedSources: 1,
    degradedSources: 0,
    deadLetters: 1,
    retryCount: 0,
    error: error instanceof Error ? error.message : String(error),
  };
}

function aggregateIngestionSummary(runId: string, startedAt: string, finishedAt: string, stages: SchedulerStageRun[], summaries: IngestionRunSummary[]): IngestionRunSummary {
  const storageMode = summaries.some((summary) => summary.storageMode === "supabase") ? "supabase" : summaries.some((summary) => summary.storageMode === "local_fallback") ? "local_fallback" : "memory";
  return {
    runId,
    startedAt,
    finishedAt,
    storageMode,
    pulledEvents: stages.reduce((sum, stage) => sum + stage.pulledEvents, 0),
    pulledMetrics: stages.reduce((sum, stage) => sum + stage.pulledMetrics, 0),
    persistedEvents: stages.reduce((sum, stage) => sum + stage.persistedEvents, 0),
    persistedMetrics: stages.reduce((sum, stage) => sum + stage.persistedMetrics, 0),
    rawEventsInserted: summaries.reduce((sum, summary) => sum + (summary.rawEventsInserted ?? 0), 0),
    rawEventsUpdated: summaries.reduce((sum, summary) => sum + (summary.rawEventsUpdated ?? 0), 0),
    normalizedEventsCreated: summaries.reduce((sum, summary) => sum + (summary.normalizedEventsCreated ?? 0), 0),
    eventClustersCreated: summaries.reduce((sum, summary) => sum + (summary.eventClustersCreated ?? 0), 0),
    duplicatesDetected: summaries.reduce((sum, summary) => sum + (summary.duplicatesDetected ?? 0), 0),
    successfulSources: summaries.reduce((sum, summary) => sum + summary.successfulSources, 0),
    degradedSources: summaries.reduce((sum, summary) => sum + summary.degradedSources, 0),
    failedSources: summaries.reduce((sum, summary) => sum + summary.failedSources, 0),
    skippedSources: summaries.reduce((sum, summary) => sum + summary.skippedSources, 0),
    deadLetters: stages.reduce((sum, stage) => sum + stage.deadLetters, 0),
    sourceHealth: summaries.flatMap((summary) => summary.sourceHealth),
    logs: summaries.flatMap((summary) => summary.logs),
    deadLetterEntries: summaries.flatMap((summary) => summary.deadLetterEntries),
    diagnostics: summaries.flatMap((summary) => summary.diagnostics ?? []),
  };
}

function schedulerStatus(stages: SchedulerStageRun[]) {
  if (stages.some((stage) => stage.status === "failed" && stage.stageId !== "etf")) return "failed" as const;
  if (stages.some((stage) => stage.status === "failed" || stage.status === "degraded")) return "degraded" as const;
  if (stages.some((stage) => stage.status === "success_with_limited_confidence")) return "success_with_limited_confidence" as const;
  return "success" as const;
}

function staleSignalCount() {
  return getSignalSnapshot().signals.filter((signal) => {
    const freshness = resolveSignalFreshness(signal);
    return freshness.countsAgainstGlobalFreshness && (freshness.state === "stale" || freshness.state === "obsolete");
  }).length;
}

type SchedulerRunOptions = Pick<SchedulerRunRecord, "schedulerSource" | "executionEnvironment">;

function ingestionOptionsForStage(stage: (typeof INGESTION_SCHEDULER_STAGES)[number], options: SchedulerRunOptions) {
  const externalCron = options.schedulerSource === "external_cron_job_org";
  return {
    sourceIds: [...stage.sourceIds],
    stageId: stage.stageId,
    maxAttemptsOverride: externalCron ? 1 : undefined,
    timeoutMsOverride: externalCron ? ("timeoutMs" in stage ? stage.timeoutMs : 6_000) : undefined,
  };
}

async function runSchedulerStage(stage: (typeof INGESTION_SCHEDULER_STAGES)[number], options: SchedulerRunOptions = {}) {
  const stageStartedAt = new Date().toISOString();
  try {
    const stageTimeoutMs = options.schedulerSource === "external_cron_job_org" ? ("timeoutMs" in stage ? stage.timeoutMs : 18_000) : "timeoutMs" in stage ? stage.timeoutMs : DEFAULT_STAGE_TIMEOUT_MS;
    const summary = await withStageTimeout(runIngestionFoundation(ingestionOptionsForStage(stage, options)), stage.label, stageTimeoutMs);
    return { stageRun: stageFromSummary(stage, summary), summary };
  } catch (error) {
    return { stageRun: failedStage(stage, stageStartedAt, error), summary: null };
  }
}

export async function runStagedScheduledIngestion(trigger: SchedulerRunRecord["trigger"] = "cron_http", options: SchedulerRunOptions = {}) {
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const stages: SchedulerStageRun[] = [];
  const summaries: IngestionRunSummary[] = [];

  const runStagesInParallel = options.schedulerSource === "external_cron_job_org";
  if (runStagesInParallel) {
    const stageResults = await Promise.all(INGESTION_SCHEDULER_STAGES.map((stage) => runSchedulerStage(stage, options)));
    stages.push(...stageResults.map((result) => result.stageRun));
    summaries.push(...stageResults.map((result) => result.summary).filter((summary): summary is IngestionRunSummary => Boolean(summary)));
  } else {
    for (const stage of INGESTION_SCHEDULER_STAGES) {
      const result = await runSchedulerStage(stage, options);
      if (result.summary) summaries.push(result.summary);
      stages.push(result.stageRun);
    }
  }

  const fusionStartedAt = new Date().toISOString();
  try {
    const refresh = await withStageTimeout(refreshSignalCache(), "Stage 5: Signal Cache Refresh");
    const derived = await withStageTimeout(runDerivedSignalProcessing(runId), "Stage 5: Derived Signal Processing");
    stages.push(fusionStage(fusionStartedAt, refresh, derived));
  } catch (error) {
    stages.push(failedFusionStage(fusionStartedAt, error));
  }

  const finishedAt = new Date().toISOString();
  const status = schedulerStatus(stages);
  const retryCount = stages.reduce((sum, stage) => sum + stage.retryCount, 0);
  const successRate = stages.length
    ? Math.round(
        (stages.reduce((sum, stage) => sum + (stage.status === "success" ? 1 : stage.status === "success_with_limited_confidence" ? 0.85 : 0), 0) /
          stages.length) *
          100,
      )
    : 0;
  const schedulerRun: SchedulerRunRecord = {
    runId,
    trigger,
    schedulerSource: options.schedulerSource ?? (trigger === "manual_http" ? "manual_http" : trigger === "local_scheduler" ? "local_scheduler" : trigger === "ui_refresh_catchup" ? "ui_refresh_catchup" : trigger === "simulation" ? "simulation" : "unknown_http"),
    executionEnvironment: options.executionEnvironment ?? process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "local",
    status,
    startedAt,
    finishedAt,
    durationMs: durationMs(startedAt, finishedAt),
    refreshEveryMinutes: REFRESH_INTERVAL_MINUTES,
    nextRunAt: new Date(Date.parse(finishedAt) + REFRESH_INTERVAL_MINUTES * 60_000).toISOString(),
    stages,
    failedStage: stages.find((stage) => stage.status === "failed" && stage.stageId !== "etf")?.stageId ?? null,
    retryCount,
    successRate,
    staleSignals: staleSignalCount(),
    rootCause: "Cron used to run ingestion, cache refresh and derived processing as one monolithic HTTP response with a large payload; the hardened route records stage results and returns a compact scheduler summary.",
  };

  const forecastValidations = validateDueForecasts(new Date(finishedAt));
  const forecastSnapshots = buildForecastSnapshots(runId, new Date(finishedAt));
  await persistForecastValidations(forecastValidations);
  await persistForecastSnapshots(forecastSnapshots);

  const schedulerStorageMode = await persistSchedulerRun(schedulerRun);
  const ingestionStorageMode = await persistIngestionRun(aggregateIngestionSummary(runId, startedAt, finishedAt, stages, summaries));
  schedulerRun.schedulerStorageMode = schedulerStorageMode;
  schedulerRun.ingestionStorageMode = ingestionStorageMode;
  schedulerRun.storageMode = schedulerStorageMode === "supabase" || ingestionStorageMode === "supabase" ? "supabase" : "local_fallback";

  return schedulerRun;
}

export function simulateSchedulerCycles(cycles = 12, baseRun?: SchedulerRunRecord | null) {
  const reference = baseRun ?? null;
  const stages = reference?.stages.length ? reference.stages : INGESTION_SCHEDULER_STAGES.map((stage) => ({
    stageId: stage.stageId,
    label: stage.label,
    status: "success" as const,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
    durationMs: 0,
    sourceIds: [...stage.sourceIds],
    pulledEvents: 0,
    pulledMetrics: 0,
    persistedEvents: 0,
    persistedMetrics: 0,
    failedSources: 0,
    degradedSources: 0,
    deadLetters: 0,
    retryCount: 0,
  }));
  const failedCycles = reference?.status === "failed" ? Math.max(1, Math.round(cycles * 0.25)) : 0;
  const degradedCycles = reference?.status === "degraded" ? Math.max(1, Math.round(cycles * 0.25)) : reference?.status === "success_with_limited_confidence" ? Math.max(1, Math.round(cycles * 0.08)) : 0;
  const successfulCycles = Math.max(0, cycles - failedCycles - degradedCycles);
  return {
    cycles,
    successfulCycles,
    degradedCycles,
    failedCycles,
    simulatedHours: 72,
    staleSignals: reference?.staleSignals ?? staleSignalCount(),
    missedUpdates: failedCycles,
    failedTasks: stages.filter((stage) => stage.status === "failed").map((stage) => stage.stageId),
    averageDurationMs: reference?.durationMs ?? stages.reduce((sum, stage) => sum + stage.durationMs, 0),
    noteFa: "این شبیه‌سازی ۱۲ چرخه بر پایه آخرین اجرای واقعی scheduler و وضعیت stageها انجام می‌شود؛ ۷۲ ساعت واقعی صبر نشده است.",
  };
}
