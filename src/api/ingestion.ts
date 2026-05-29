import { randomUUID } from "node:crypto";
import { getAllSources, getEnabledSources } from "@/collectors/registry";
import { marketSignalCollector } from "@/collectors/api/market-signal-collector";
import { rssCollector } from "@/collectors/rss/rss-collector";
import { dedupeRawEvents } from "@/processors/deduplication";
import { auditRawEventDedup, normalizeAndClusterRawEvents } from "@/processors/event-normalization";
import { healthFromCollectorOutput, buildIngestionLog } from "@/health/source-health";
import { getEnvironmentValidationReport } from "@/health/environment-report";
import { runCollectorWithRetry } from "@/queues/ingestion-queue";
import {
  getRecentRawEventsForNormalization,
  getLatestSourceHealthSync,
  persistDeadLetters,
  persistEventClusters,
  persistIngestionLogs,
  persistIngestionRun,
  persistNormalizedEvents,
  persistReliabilitySnapshot,
  persistRawEvents,
  persistRawMetrics,
  persistMarketSnapshots,
  persistSourceDefinitions,
  persistSourceHealth,
  persistTelemetryLogs,
  getLatestStorageWriteReportsSync,
} from "@/storage/ingestion-store";
import type { Collector, FreshnessStatus, IngestionDeadLetterEntry, IngestionRunSummary, IngestionStorageMode, MarketSnapshotInput, RawMetricInput, SourceDefinition, TelemetryLogInput } from "@/types/ingestion";

function collectorFor(source: SourceDefinition): Collector {
  if (source.parser === "market_signals") return marketSignalCollector;
  if (source.parser === "rss") return rssCollector;
  return {
    sourceType: source.sourceType,
    async collect() {
      return {
        source,
        status: "disabled",
        fetchedAt: new Date().toISOString(),
        latencyMs: 0,
        rawEvents: [],
        rawMetrics: [],
        error: `No collector registered for parser ${source.parser}.`,
      };
    },
  };
}

function hasRequiredEnv(source: SourceDefinition) {
  return (source.requiredEnvKeys ?? []).every((key) => Boolean(process.env[key]));
}

function minutesSince(timestamp: string | null | undefined) {
  if (!timestamp) return null;
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.round((Date.now() - parsed) / 60_000));
}

function freshnessStatus(timestamp: string | null | undefined): FreshnessStatus {
  const age = minutesSince(timestamp);
  if (age === null) return "unavailable";
  if (age <= 15) return "live";
  if (age <= 45) return "fresh";
  if (age <= 90) return "delayed";
  if (age <= 180) return "stale";
  return "stale_critical";
}

function aggregateQuality(metrics: RawMetricInput[]) {
  if (!metrics.length) return "unavailable" as const;
  if (metrics.some((metric) => metric.quality === "unavailable")) return "partial_live" as const;
  if (metrics.some((metric) => metric.quality === "estimated")) return "estimated" as const;
  if (metrics.some((metric) => metric.quality === "delayed")) return "delayed" as const;
  if (metrics.some((metric) => metric.quality === "partial_live")) return "partial_live" as const;
  return "live" as const;
}

function buildMarketSnapshotsFromMetrics(runId: string, metrics: RawMetricInput[], observedAt: string): MarketSnapshotInput[] {
  const usable = metrics.filter((metric) => metric.value !== null && metric.quality !== "unavailable" && metric.quality !== "estimated");
  const grouped = new Map<string, RawMetricInput[]>();
  for (const metric of usable) {
    const key = metric.asset ? `asset:${metric.asset}` : `group:${metric.group}`;
    grouped.set(key, [...(grouped.get(key) ?? []), metric]);
  }

  return Array.from(grouped.entries()).map(([key, rows]) => {
    const [kind, label] = key.split(":");
    const latestTimestamp =
      rows
        .map((row) => row.timestamp)
        .filter((timestamp): timestamp is string => Boolean(timestamp))
        .sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? observedAt;

    return {
      runId,
      snapshotKey: key,
      asset: kind === "asset" ? label : undefined,
      metricSet: kind === "asset" ? "asset_market_metrics" : label,
      sourceType: "direct",
      quality: aggregateQuality(rows),
      freshnessStatus: freshnessStatus(latestTimestamp),
      sourceIds: Array.from(new Set(rows.map((row) => row.sourceId))),
      metricCount: rows.length,
      observedAt,
      payload: {
        metrics: rows.map((row) => ({
          sourceId: row.sourceId,
          sourceName: row.sourceName,
          asset: row.asset ?? null,
          group: row.group,
          metric: row.metric,
          value: row.value,
          previousValue: row.previousValue ?? null,
          changeAbs: row.changeAbs ?? null,
          changePct: row.changePct ?? null,
          quality: row.quality,
          reliability: row.reliability,
          sampleSize: row.sampleSize ?? 0,
          timestamp: row.timestamp,
        })),
      },
    };
  });
}

export async function runIngestionFoundation(): Promise<IngestionRunSummary> {
  const runId = randomUUID();
  const startedAt = new Date().toISOString();
  const sources = getEnabledSources();
  const sourceDefinitionStore = await persistSourceDefinitions(getAllSources());
  const previousHealth = new Map(getLatestSourceHealthSync().map((source) => [source.sourceId, source]));
  const results = await Promise.all(
    sources.map(async (source) => {
      if (!hasRequiredEnv(source)) {
        return {
          output: {
            source,
            status: "api_key_missing" as const,
            fetchedAt: new Date().toISOString(),
            latencyMs: 0,
            rawEvents: [],
            rawMetrics: [],
            error: `Missing required env keys: ${(source.requiredEnvKeys ?? []).filter((key) => !process.env[key]).join(", ")}`,
          },
          attempts: 0,
        };
      }
      return runCollectorWithRetry(source, collectorFor(source));
    }),
  );

  const rawEvents = dedupeRawEvents(results.flatMap((result) => result.output.rawEvents));
  const dedupAudit = auditRawEventDedup(results.flatMap((result) => result.output.rawEvents));
  const rawMetrics = results.flatMap((result) => result.output.rawMetrics);
  const eventStore = await persistRawEvents(rawEvents);
  const metricStore = await persistRawMetrics(rawMetrics);
  const observedAt = new Date().toISOString();
  const marketSnapshots = buildMarketSnapshotsFromMetrics(runId, rawMetrics, observedAt);
  const marketSnapshotStore = await persistMarketSnapshots(marketSnapshots);
  const recentRawEvents = await getRecentRawEventsForNormalization(500);
  const normalization = normalizeAndClusterRawEvents(recentRawEvents);
  const normalizedStore = await persistNormalizedEvents(normalization.normalizedEvents);
  const clusterStore = await persistEventClusters(normalization.eventClusters);
  const storageMode: IngestionStorageMode = eventStore.storageMode === "supabase" || metricStore.storageMode === "supabase" ? "supabase" : "local_fallback";
  const sourceHealth = results.map((result) => healthFromCollectorOutput(result.output, previousHealth.get(result.output.source.id)));
  const healthStore = await persistSourceHealth(sourceHealth);
  const logs = results.map((result) =>
    buildIngestionLog({
      runId,
      output: result.output,
      attempts: result.attempts,
      storageMode,
    }),
  );
  const deadLetterEntries: IngestionDeadLetterEntry[] = results
    .filter((result) => result.output.status === "failed" || result.output.status === "api_key_missing")
    .map((result) => ({
      runId,
      sourceId: result.output.source.id,
      sourceName: result.output.source.name,
      status: result.output.status,
      attempts: result.attempts,
      error: result.output.error ?? "Collector failed without a specific error.",
      payload: {
        parser: result.output.source.parser,
        endpoint: result.output.source.endpoint,
        tier: result.output.source.tier,
        requiredEnvKeys: result.output.source.requiredEnvKeys ?? [],
        rawEvents: result.output.rawEvents.length,
        rawMetrics: result.output.rawMetrics.length,
      },
      failedAt: result.output.fetchedAt,
      nextRetryAt: sourceHealth.find((source) => source.sourceId === result.output.source.id)?.nextRetryAt ?? null,
    }));
  const logStore = await persistIngestionLogs(logs);
  const deadLetterStore = await persistDeadLetters(deadLetterEntries);

  const finalStorageMode: IngestionStorageMode =
    eventStore.storageMode === "supabase" ||
    metricStore.storageMode === "supabase" ||
    sourceDefinitionStore === "supabase" ||
    healthStore === "supabase" ||
    logStore === "supabase" ||
    deadLetterStore === "supabase" ||
    normalizedStore.storageMode === "supabase" ||
    clusterStore.storageMode === "supabase" ||
    marketSnapshotStore.storageMode === "supabase"
      ? "supabase"
      : "local_fallback";

  const summary: IngestionRunSummary = {
    runId,
    startedAt,
    finishedAt: new Date().toISOString(),
    storageMode: finalStorageMode,
    pulledEvents: rawEvents.length,
    pulledMetrics: rawMetrics.length,
    persistedEvents: eventStore.persisted,
    persistedMetrics: metricStore.persisted,
    rawEventsInserted: eventStore.inserted,
    rawEventsUpdated: eventStore.updated,
    normalizedEventsCreated: normalizedStore.storageMode === "supabase" ? normalizedStore.persisted : 0,
    eventClustersCreated: clusterStore.storageMode === "supabase" ? clusterStore.persisted : 0,
    duplicatesDetected: normalization.duplicatesDetected + dedupAudit.duplicateHashes,
    successfulSources: sourceHealth.filter((source) => source.status === "success").length,
    degradedSources: sourceHealth.filter((source) => source.status === "degraded").length,
    failedSources: sourceHealth.filter((source) => source.status === "failed" || source.status === "api_key_missing").length,
    skippedSources: sourceHealth.filter((source) => source.status === "disabled").length,
    deadLetters: deadLetterEntries.length,
    sourceHealth,
    logs,
    deadLetterEntries,
  };
  await persistIngestionRun(summary);
  const envReport = await getEnvironmentValidationReport();
  const telemetryLogs: TelemetryLogInput[] = [
    {
      runId,
      scope: "ingestion",
      eventType: "ingestion_run_completed",
      level: summary.failedSources ? "warning" : "info",
      message: `Ingestion completed with ${summary.pulledEvents} raw events, ${summary.pulledMetrics} raw metrics and ${marketSnapshots.length} market snapshots.`,
      durationMs: Math.max(0, Date.parse(summary.finishedAt) - Date.parse(summary.startedAt)),
      tableName: "ingestion_runs",
      payload: {
        storageMode: summary.storageMode,
        rawEventsInserted: summary.rawEventsInserted,
        rawEventsUpdated: summary.rawEventsUpdated,
        normalizedEventsCreated: summary.normalizedEventsCreated,
        eventClustersCreated: summary.eventClustersCreated,
        marketSnapshotsCreated: marketSnapshotStore.persisted,
        deadLetters: summary.deadLetters,
        failedSources: summary.failedSources,
      },
      observedAt: summary.finishedAt,
    },
  ];
  const telemetryStore = await persistTelemetryLogs(telemetryLogs);
  await persistReliabilitySnapshot({
    runId,
    storageMode: summary.storageMode,
    supabaseConnected: envReport.supabaseConnected,
    serviceRoleAvailable: envReport.serviceRoleAvailable,
    activeSources: sources.length,
    failedSources: summary.failedSources,
    missingApiKeys: envReport.missingOptionalApiKeys,
    coverage: {
      successfulSources: summary.successfulSources,
      degradedSources: summary.degradedSources,
      failedSources: summary.failedSources,
      pulledEvents: summary.pulledEvents,
      pulledMetrics: summary.pulledMetrics,
      rawEventsInserted: summary.rawEventsInserted,
      rawEventsUpdated: summary.rawEventsUpdated,
      normalizedEventsCreated: summary.normalizedEventsCreated,
      eventClustersCreated: summary.eventClustersCreated,
      marketSnapshotsCreated: marketSnapshotStore.persisted,
      telemetryLogsCreated: telemetryStore === "supabase" ? telemetryLogs.length : 0,
      duplicatesDetected: summary.duplicatesDetected,
      dedupAudit,
    },
    writeStatus: getLatestStorageWriteReportsSync(20),
  });

  return summary;
}
