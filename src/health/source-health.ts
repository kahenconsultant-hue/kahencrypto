import { productionSources } from "@/collectors/registry";
import {
  getLatestRawEvents,
  getLatestRawEventsSync,
  getLatestRawMetrics,
  getLatestRawMetricsSync,
  getLatestIngestionRun,
  getLatestSourceHealth,
  getLatestSourceHealthSync,
} from "@/storage/ingestion-store";
import type { CollectorOutput, IngestionFoundationStatus, IngestionLogEntry, IngestionStorageMode, SourceHealthSnapshot } from "@/types/ingestion";

function minutesSince(timestamp: string | null | undefined) {
  if (!timestamp) return null;
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.round((Date.now() - parsed) / 60_000));
}

export function healthFromCollectorOutput(output: CollectorOutput, previous?: SourceHealthSnapshot): SourceHealthSnapshot {
  const success = output.status === "success" || output.status === "degraded";
  const failed = output.status === "failed" || output.status === "api_key_missing";
  const consecutiveFailures = failed ? (previous?.consecutiveFailures ?? 0) + 1 : 0;
  const lastSuccessAt = success ? output.fetchedAt : previous?.lastSuccessAt ?? null;
  const nextRetryAt =
    failed && output.source.enabled
      ? new Date(Date.now() + output.source.retryPolicy.backoffMs * Math.max(1, consecutiveFailures)).toISOString()
      : null;

  return {
    sourceId: output.source.id,
    sourceName: output.source.name,
    status: output.status,
    tier: output.source.tier,
    latencyMs: output.latencyMs,
    freshnessMinutes: success ? minutesSince(output.fetchedAt) : minutesSince(lastSuccessAt),
    errorRate: failed ? 1 : output.status === "degraded" ? 0.35 : 0,
    consecutiveFailures,
    lastSuccessAt,
    lastFailureAt: failed ? output.fetchedAt : previous?.lastFailureAt ?? null,
    lastError: output.error,
    nextRetryAt,
    updatedAt: new Date().toISOString(),
  };
}

export function buildIngestionLog(params: {
  runId: string;
  output: CollectorOutput;
  attempts: number;
  storageMode: IngestionStorageMode;
}): IngestionLogEntry {
  return {
    runId: params.runId,
    sourceId: params.output.source.id,
    sourceName: params.output.source.name,
    status: params.output.status,
    message:
      params.output.status === "success"
        ? "Collector completed successfully."
        : params.output.status === "degraded"
          ? "Collector completed with partial or low-quality data."
          : params.output.status === "api_key_missing"
            ? "Collector disabled because a required API key is missing."
            : params.output.error ?? "Collector failed.",
    attempts: params.attempts,
    latencyMs: params.output.latencyMs,
    rawEvents: params.output.rawEvents.length,
    rawMetrics: params.output.rawMetrics.length,
    storageMode: params.storageMode,
    error: params.output.error,
    createdAt: new Date().toISOString(),
  };
}

export function getIngestionFoundationStatusSync(): IngestionFoundationStatus {
  const sourceHealth = getLatestSourceHealthSync();
  const latestEvents = getLatestRawEventsSync(20);
  const latestMetrics = getLatestRawMetricsSync(40);
  const byId = new Map(sourceHealth.map((source) => [source.sourceId, source]));
  const criticalSources = productionSources.filter((source) => source.tier === 1);
  const criticalOnline = criticalSources.filter((source) => {
    const health = byId.get(source.id);
    return health?.status === "success" || health?.status === "degraded";
  }).length;

  return {
    generatedAt: new Date().toISOString(),
    storageMode: sourceHealth.length || latestEvents.length || latestMetrics.length ? "local_fallback" : "memory",
    sourcesTotal: productionSources.length,
    sourcesEnabled: productionSources.filter((source) => source.enabled).length,
    criticalSourcesTotal: criticalSources.length,
    criticalSourcesOnline: criticalOnline,
    failedSources: sourceHealth.filter((source) => source.status === "failed" || source.status === "api_key_missing").length,
    degradedSources: sourceHealth.filter((source) => source.status === "degraded").length,
    latestEvents,
    latestMetrics,
    sourceHealth,
  };
}

export async function getIngestionFoundationStatus(): Promise<IngestionFoundationStatus> {
  const sourceHealth = await getLatestSourceHealth();
  const latestEvents = await getLatestRawEvents(20);
  const latestMetrics = await getLatestRawMetrics(40);
  const latestRun = await getLatestIngestionRun();
  const byId = new Map(sourceHealth.map((source) => [source.sourceId, source]));
  const criticalSources = productionSources.filter((source) => source.tier === 1);
  const criticalOnline = criticalSources.filter((source) => {
    const health = byId.get(source.id);
    return health?.status === "success" || health?.status === "degraded";
  }).length;

  return {
    generatedAt: new Date().toISOString(),
    storageMode: latestRun?.storageMode ?? (sourceHealth.length || latestEvents.length || latestMetrics.length ? "local_fallback" : "memory"),
    sourcesTotal: productionSources.length,
    sourcesEnabled: productionSources.filter((source) => source.enabled).length,
    criticalSourcesTotal: criticalSources.length,
    criticalSourcesOnline: criticalOnline,
    failedSources: sourceHealth.filter((source) => source.status === "failed" || source.status === "api_key_missing").length,
    degradedSources: sourceHealth.filter((source) => source.status === "degraded").length,
    latestEvents,
    latestMetrics,
    sourceHealth,
  };
}
