import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { createSupabaseServerClient } from "@/server/supabase/client";
import type {
  IngestionDeadLetterEntry,
  IngestionLogEntry,
  IngestionRunSummary,
  IngestionStorageMode,
  EventClusterInput,
  IntelligenceOutputInput,
  MarketSnapshotInput,
  NormalizedEventInput,
  DerivedSignalInput,
  LiquidityScoreSnapshotInput,
  RegimeInputSnapshotInput,
  RawEventPersistenceResult,
  RawEventInput,
  RawMetricInput,
  SourceHealthSnapshot,
  SourceDefinition,
  StorageWriteReport,
  TelemetryLogInput,
} from "@/types/ingestion";

const INGESTION_STORE_DIR = process.env.CMIP_INGESTION_STORE_PATH ?? join(process.cwd(), ".cache", "cmip", "ingestion");

function ensureStoreDir() {
  mkdirSync(INGESTION_STORE_DIR, { recursive: true });
}

function appendJsonl(filename: string, rows: unknown[]) {
  if (!rows.length) return;
  ensureStoreDir();
  appendFileSync(join(INGESTION_STORE_DIR, filename), rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
}

function writeLatest(filename: string, value: unknown) {
  ensureStoreDir();
  writeFileSync(join(INGESTION_STORE_DIR, filename), JSON.stringify(value, null, 2));
}

function readLatest<T>(filename: string, fallback: T): T {
  try {
    const path = join(INGESTION_STORE_DIR, filename);
    if (!existsSync(path)) return fallback;
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch {
    return fallback;
  }
}

function minutesSince(timestamp: string | null | undefined) {
  if (!timestamp) return null;
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.round((Date.now() - parsed) / 60_000));
}

function freshnessStatusFromTimestamp(timestamp: string | null | undefined) {
  const age = minutesSince(timestamp);
  if (age === null) return "unavailable" as const;
  if (age <= 15) return "live" as const;
  if (age <= 45) return "fresh" as const;
  if (age <= 90) return "delayed" as const;
  if (age <= 180) return "stale" as const;
  return "stale_critical" as const;
}

function sourceTypeReliability(sourceType: string, sourceId?: string) {
  if (sourceId === "treasury-press-rss") return 82;
  if (sourceType === "websocket") return 86;
  if (sourceType === "api") return 82;
  if (sourceType === "filings") return 78;
  if (sourceType === "rss") return 58;
  if (sourceType === "scraper") return 48;
  if (sourceType === "social") return 42;
  return 35;
}

function degradationState(health: SourceHealthSnapshot) {
  if (health.status === "disabled") return "sparse";
  if (health.status === "failed" || health.consecutiveFailures >= 3) return "unreliable";
  if (health.status === "api_key_missing") return "sparse";
  if (health.status === "degraded") return "degraded";
  if (health.freshnessMinutes !== null && health.freshnessMinutes > 180) return "unstable";
  return "healthy";
}

function sourceHealthReliability(health: SourceHealthSnapshot) {
  const freshnessPenalty = health.freshnessMinutes === null ? 20 : health.freshnessMinutes > 180 ? 45 : health.freshnessMinutes > 90 ? 28 : health.freshnessMinutes > 45 ? 14 : 0;
  const statusPenalty = health.status === "success" ? 0 : health.status === "degraded" ? 20 : health.status === "api_key_missing" ? 45 : health.status === "disabled" ? 55 : 70;
  return Math.max(0, Math.min(100, 100 - freshnessPenalty - statusPenalty - health.consecutiveFailures * 6 - Math.round(health.errorRate * 20)));
}

function writeStorageReport(report: StorageWriteReport) {
  const reports = readLatest<StorageWriteReport[]>("latest-storage-write-status.json", []);
  const next = [report, ...reports.filter((item) => item.table !== report.table)].slice(0, 50);
  writeLatest("latest-storage-write-status.json", next);
}

async function trySupabaseInsert(table: string, rows: unknown[], onConflict?: string): Promise<StorageWriteReport> {
  const attemptedAt = new Date().toISOString();
  const client = createSupabaseServerClient();
  if (!rows.length) {
    const report: StorageWriteReport = { table, rows: 0, status: "skipped", storageMode: client ? "supabase" : "local_fallback", attemptedAt };
    writeStorageReport(report);
    return report;
  }
  if (!client) {
    const report: StorageWriteReport = {
      table,
      rows: rows.length,
      status: "failed",
      storageMode: "local_fallback",
      attemptedAt,
      error: "Supabase env is not configured.",
    };
    writeStorageReport(report);
    return report;
  }
  const { error } = await client.from(table).upsert(rows as never, { ignoreDuplicates: false, onConflict });
  const report: StorageWriteReport = error
    ? { table, rows: rows.length, status: "failed", storageMode: "local_fallback", attemptedAt, error: error.message }
    : { table, rows: rows.length, status: "success", storageMode: "supabase", attemptedAt };
  writeStorageReport(report);
  return report;
}

function sourceDefinitionRow(source: SourceDefinition) {
  return {
    source_key: source.id,
    category_id: source.category,
    name: source.name,
    source_type: source.sourceType,
    endpoint: source.endpoint ?? "",
    auth_required: Boolean(source.requiredEnvKeys?.length),
    priority: source.priorityScore,
    enabled: source.enabled,
    polling_interval_seconds: source.pollingIntervalSeconds,
    timeout_ms: source.timeoutMs,
    parser: source.parser,
    tier: source.tier,
    asset_relevance: source.assetRelevance,
    required_env_keys: source.requiredEnvKeys ?? [],
    rate_limit_per_minute: source.rateLimitPerMinute ?? null,
    degraded_mode: source.degradedMode,
    metadata: {
      retryPolicy: source.retryPolicy,
      accessModel: source.accessModel ?? "core_free",
      intelligenceClass: source.intelligenceClass ?? "core",
      blocksCoreIntelligence: Boolean(source.blocksCoreIntelligence),
      disabledReason: source.disabledReason ?? null,
      premiumModule: source.premiumModule ?? null,
      signalKeys: source.signalKeys ?? [],
    },
    updated_at: new Date().toISOString(),
  };
}

function rawEventRow(event: RawEventInput) {
  const now = new Date().toISOString();
  const delayMinutes = minutesSince(event.timestamp);
  return {
    source_id_text: event.sourceId,
    source_name: event.sourceName,
    source_type: event.sourceType,
    category: event.category,
    title: event.title,
    content: event.content ?? null,
    url: event.url ?? null,
    language: event.language ?? "en",
    event_timestamp: event.timestamp,
    raw_payload: event.rawPayload ?? {},
    dedup_hash: event.dedupHash,
    quality: event.quality,
    source_reliability: sourceTypeReliability(event.sourceType, event.sourceId),
    freshness_status: freshnessStatusFromTimestamp(event.timestamp),
    delay_minutes: delayMinutes,
    retry_count: 0,
    last_seen_at: now,
    updated_at: now,
  };
}

function normalizedEventRow(event: NormalizedEventInput) {
  return {
    raw_event_id: event.rawEventId ?? null,
    source_id_text: event.sourceId,
    source_name: event.sourceName,
    source_type: event.sourceType,
    event_type: event.eventType,
    category: event.category,
    affected_assets: event.affectedAssets,
    title: event.title,
    summary: event.summary,
    url: event.url ?? null,
    language: event.language,
    published_at: event.publishedAt,
    event_timestamp: event.eventTimestamp,
    entities: event.entities,
    freshness_status: event.freshnessStatus,
    source_reliability: event.sourceReliability,
    normalized_payload: event.normalizedPayload,
    quality: event.quality,
    confidence: event.confidence,
    processing_status: event.processingStatus,
    updated_at: new Date().toISOString(),
  };
}

function eventClusterRow(cluster: EventClusterInput) {
  return {
    cluster_key: cluster.clusterKey,
    event_type: cluster.eventType,
    category: cluster.category,
    primary_title: cluster.primaryTitle,
    affected_assets: cluster.affectedAssets,
    entities: cluster.entities,
    first_seen_at: cluster.firstSeenAt,
    last_seen_at: cluster.lastSeenAt,
    event_count: cluster.eventCount,
    source_count: cluster.sourceCount,
    source_references: cluster.sourceReferences,
    similarity_method: cluster.similarityMethod,
    confidence: cluster.confidence,
    updated_at: new Date().toISOString(),
  };
}

function rawMetricRow(metric: RawMetricInput) {
  return {
    source_id_text: metric.sourceId,
    source_name: metric.sourceName,
    source_type: metric.sourceType,
    asset: metric.asset ?? null,
    signal_group: metric.group,
    metric: metric.metric,
    value: metric.value,
    previous_value: metric.previousValue ?? null,
    change_abs: metric.changeAbs ?? null,
    change_pct: metric.changePct ?? null,
    metric_timestamp: metric.timestamp,
    quality: metric.quality,
    reliability: metric.reliability,
    sample_size: metric.sampleSize ?? 0,
    freshness_status: freshnessStatusFromTimestamp(metric.timestamp),
    delay_minutes: minutesSince(metric.timestamp),
    confidence_base: metric.reliability,
    error: metric.error ?? null,
    raw_payload: metric.rawPayload ?? {},
  };
}

function sourceHealthRow(health: SourceHealthSnapshot) {
  return {
    source_id_text: health.sourceId,
    source_name: health.sourceName,
    status: health.status,
    tier: health.tier,
    latency_ms: health.latencyMs,
    freshness_minutes: health.freshnessMinutes,
    error_rate: health.errorRate,
    consecutive_failures: health.consecutiveFailures,
    degradation_state: degradationState(health),
    reliability_score: sourceHealthReliability(health),
    last_success_at: health.lastSuccessAt,
    last_failure_at: health.lastFailureAt,
    last_error: health.lastError ?? null,
    next_retry_at: health.nextRetryAt ?? null,
    updated_at: health.updatedAt,
  };
}

function marketSnapshotRow(snapshot: MarketSnapshotInput) {
  return {
    run_id: snapshot.runId ?? null,
    snapshot_key: snapshot.snapshotKey,
    asset: snapshot.asset ?? null,
    metric_set: snapshot.metricSet,
    source_type: snapshot.sourceType,
    quality: snapshot.quality,
    freshness_status: snapshot.freshnessStatus,
    source_ids: snapshot.sourceIds,
    metric_count: snapshot.metricCount,
    payload: snapshot.payload,
    observed_at: snapshot.observedAt,
  };
}

function intelligenceOutputRow(output: IntelligenceOutputInput) {
  return {
    run_id: output.runId ?? null,
    output_key: output.outputKey,
    module_name: output.moduleName,
    output_type: output.outputType,
    asset: output.asset ?? null,
    timeframe: output.timeframe ?? null,
    source_type: output.sourceType,
    status: output.status,
    score: output.score,
    confidence: output.confidence,
    confidence_label: output.confidenceLabel ?? null,
    data_quality: output.dataQuality,
    used_signals: output.usedSignals,
    missing_signals: output.missingSignals,
    stale_signals: output.staleSignals,
    narrative_fa: output.narrativeFa ?? null,
    calculations: output.calculations,
    payload: output.payload,
    generated_at: output.generatedAt,
  };
}

function telemetryLogRow(log: TelemetryLogInput) {
  return {
    run_id: log.runId ?? null,
    scope: log.scope,
    event_type: log.eventType,
    level: log.level,
    message: log.message,
    duration_ms: log.durationMs ?? null,
    source_id_text: log.sourceId ?? null,
    table_name: log.tableName ?? null,
    payload: log.payload,
    observed_at: log.observedAt,
  };
}

function ingestionLogRow(log: IngestionLogEntry) {
  return {
    run_id: log.runId,
    source_id_text: log.sourceId,
    source_name: log.sourceName,
    status: log.status,
    message: log.message,
    attempts: log.attempts,
    latency_ms: log.latencyMs,
    raw_events: log.rawEvents,
    raw_metrics: log.rawMetrics,
    storage_mode: log.storageMode,
    error: log.error ?? null,
    created_at: log.createdAt,
  };
}

function ingestionRunRow(summary: IngestionRunSummary) {
  return {
    run_id: summary.runId,
    started_at: summary.startedAt,
    finished_at: summary.finishedAt,
    storage_mode: summary.storageMode,
    pulled_events: summary.pulledEvents,
    pulled_metrics: summary.pulledMetrics,
    persisted_events: summary.persistedEvents,
    persisted_metrics: summary.persistedMetrics,
    raw_events_inserted: summary.rawEventsInserted ?? 0,
    raw_events_updated: summary.rawEventsUpdated ?? 0,
    normalized_events_created: summary.normalizedEventsCreated ?? 0,
    event_clusters_created: summary.eventClustersCreated ?? 0,
    duplicates_detected: summary.duplicatesDetected ?? 0,
    successful_sources: summary.successfulSources,
    degraded_sources: summary.degradedSources,
    failed_sources: summary.failedSources,
    skipped_sources: summary.skippedSources,
    dead_letters: summary.deadLetters,
  };
}

function deadLetterRow(entry: IngestionDeadLetterEntry) {
  return {
    run_id: entry.runId,
    source_id_text: entry.sourceId,
    source_name: entry.sourceName,
    status: entry.status,
    attempts: entry.attempts,
    error: entry.error,
    payload: entry.payload ?? {},
    failed_at: entry.failedAt,
    next_retry_at: entry.nextRetryAt ?? null,
  };
}

function derivedSignalRow(signal: DerivedSignalInput) {
  return {
    run_id: signal.runId ?? null,
    signal_key: signal.signalKey,
    label_fa: signal.labelFa,
    source_type: signal.sourceType,
    score: signal.score,
    confidence: signal.confidence,
    quality: signal.quality,
    affected_assets: signal.affectedAssets,
    time_horizon: signal.timeHorizon,
    used_inputs: signal.usedInputs,
    missing_inputs: signal.missingInputs,
    explanation_fa: signal.explanationFa,
    formula: signal.formula,
    payload: signal.payload,
    generated_at: signal.generatedAt,
  };
}

function liquidityScoreRow(score: LiquidityScoreSnapshotInput) {
  return {
    run_id: score.runId ?? null,
    score_key: score.scoreKey,
    source_type: score.sourceType,
    crypto_liquidity_proxy_score: score.cryptoLiquidityProxyScore,
    macro_liquidity_pressure_score: score.macroLiquidityPressureScore,
    stablecoin_pressure: score.stablecoinPressure,
    confidence: score.confidence,
    quality: score.quality,
    unavailable_premium_inputs: score.unavailablePremiumInputs,
    explanation_fa: score.explanationFa,
    payload: score.payload,
    generated_at: score.generatedAt,
  };
}

function regimeInputRow(input: RegimeInputSnapshotInput) {
  return {
    run_id: input.runId ?? null,
    regime_key: input.regimeKey,
    source_type: input.sourceType,
    regime: input.regime,
    confidence: input.confidence,
    quality: input.quality,
    used_inputs: input.usedInputs,
    missing_inputs: input.missingInputs,
    explanation_fa: input.explanationFa,
    payload: input.payload,
    generated_at: input.generatedAt,
  };
}

async function countExistingRawEvents(dedupHashes: string[]) {
  const client = createSupabaseServerClient();
  if (!client || !dedupHashes.length) return 0;
  const { count, error } = await client.from("raw_events").select("id", { count: "exact", head: true }).in("dedup_hash", dedupHashes);
  if (error) return 0;
  return count ?? 0;
}

export async function persistRawEvents(events: RawEventInput[]): Promise<RawEventPersistenceResult> {
  const unique = events;
  const existing = await countExistingRawEvents(unique.map((event) => event.dedupHash));
  const supabaseWrite = await trySupabaseInsert("raw_events", unique.map(rawEventRow), "dedup_hash");
  appendJsonl("raw-events.jsonl", unique);
  writeLatest("latest-events.json", unique.slice(0, 100));
  const updated = supabaseWrite.storageMode === "supabase" ? existing : 0;
  const inserted = supabaseWrite.storageMode === "supabase" ? Math.max(0, unique.length - existing) : unique.length;
  if (supabaseWrite.storageMode === "supabase") return { persisted: unique.length, inserted, updated, storageMode: "supabase" };
  return { persisted: unique.length, inserted, updated, storageMode: "local_fallback" };
}

export async function persistRawMetrics(metrics: RawMetricInput[]): Promise<{ persisted: number; storageMode: IngestionStorageMode }> {
  const supabaseWrite = await trySupabaseInsert("raw_metrics", metrics.map(rawMetricRow));
  appendJsonl("raw-metrics.jsonl", metrics);
  writeLatest("latest-metrics.json", metrics.slice(0, 200));
  if (supabaseWrite.storageMode === "supabase") return { persisted: metrics.length, storageMode: "supabase" };
  return { persisted: metrics.length, storageMode: "local_fallback" };
}

export async function persistNormalizedEvents(events: NormalizedEventInput[]): Promise<{ persisted: number; storageMode: IngestionStorageMode }> {
  const supabaseWrite = await trySupabaseInsert("normalized_events", events.map(normalizedEventRow), "raw_event_id");
  writeLatest("latest-normalized-events.json", events.slice(0, 200));
  if (supabaseWrite.storageMode === "supabase") return { persisted: events.length, storageMode: "supabase" };
  return { persisted: events.length, storageMode: "local_fallback" };
}

export async function persistEventClusters(clusters: EventClusterInput[]): Promise<{ persisted: number; storageMode: IngestionStorageMode }> {
  const supabaseWrite = await trySupabaseInsert("event_clusters", clusters.map(eventClusterRow), "cluster_key");
  if (supabaseWrite.storageMode === "supabase" && clusters.length) {
    const client = createSupabaseServerClient();
    const keys = clusters.map((cluster) => cluster.clusterKey);
    const oldest = clusters.reduce((min, cluster) => (Date.parse(cluster.firstSeenAt) < Date.parse(min) ? cluster.firstSeenAt : min), clusters[0].firstSeenAt);
    const newest = clusters.reduce((max, cluster) => (Date.parse(cluster.lastSeenAt) > Date.parse(max) ? cluster.lastSeenAt : max), clusters[0].lastSeenAt);
    await client
      ?.from("event_clusters")
      .delete()
      .gte("last_seen_at", oldest)
      .lte("first_seen_at", newest)
      .not("cluster_key", "in", `(${keys.join(",")})`);
  }
  writeLatest("latest-event-clusters.json", clusters.slice(0, 200));
  if (supabaseWrite.storageMode === "supabase") return { persisted: clusters.length, storageMode: "supabase" };
  return { persisted: clusters.length, storageMode: "local_fallback" };
}

export async function persistSourceHealth(health: SourceHealthSnapshot[]): Promise<IngestionStorageMode> {
  const supabaseWrite = await trySupabaseInsert("source_health", health.map(sourceHealthRow), "source_id_text");
  writeLatest("source-health.json", health);
  return supabaseWrite.storageMode;
}

export async function persistIngestionLogs(logs: IngestionLogEntry[]): Promise<IngestionStorageMode> {
  const supabaseWrite = await trySupabaseInsert("ingestion_logs", logs.map(ingestionLogRow));
  appendJsonl("ingestion-logs.jsonl", logs);
  writeLatest("latest-ingestion-logs.json", logs.slice(0, 100));
  return supabaseWrite.storageMode;
}

export async function persistIngestionRun(summary: IngestionRunSummary): Promise<IngestionStorageMode> {
  const supabaseWrite = await trySupabaseInsert("ingestion_runs", [ingestionRunRow(summary)], "run_id");
  writeLatest("latest-ingestion-run.json", summary);
  appendJsonl("ingestion-runs.jsonl", [summary]);
  return supabaseWrite.storageMode;
}

export async function persistDeadLetters(entries: IngestionDeadLetterEntry[]): Promise<IngestionStorageMode> {
  const supabaseWrite = await trySupabaseInsert("dead_letters", entries.map(deadLetterRow));
  appendJsonl("ingestion-dead-letters.jsonl", entries);
  writeLatest("latest-dead-letters.json", entries.slice(0, 100));
  return supabaseWrite.storageMode;
}

export async function persistSourceDefinitions(sources: SourceDefinition[]): Promise<IngestionStorageMode> {
  const supabaseWrite = await trySupabaseInsert("sources", sources.map(sourceDefinitionRow), "source_key");
  writeLatest("source-definitions.json", sources);
  return supabaseWrite.storageMode;
}

export async function persistReliabilitySnapshot(snapshot: {
  runId?: string;
  storageMode: IngestionStorageMode;
  supabaseConnected: boolean;
  serviceRoleAvailable: boolean;
  activeSources: number;
  failedSources: number;
  missingApiKeys: string[];
  coverage: Record<string, unknown>;
  writeStatus: StorageWriteReport[];
}): Promise<IngestionStorageMode> {
  const supabaseWrite = await trySupabaseInsert("reliability_snapshots", [
    {
      run_id: snapshot.runId ?? null,
      storage_mode: snapshot.storageMode,
      supabase_connected: snapshot.supabaseConnected,
      service_role_available: snapshot.serviceRoleAvailable,
      active_sources: snapshot.activeSources,
      failed_sources: snapshot.failedSources,
      missing_api_keys: snapshot.missingApiKeys,
      coverage: snapshot.coverage,
      write_status: snapshot.writeStatus,
      observed_at: new Date().toISOString(),
    },
  ]);
  writeLatest("latest-reliability-snapshot.json", snapshot);
  return supabaseWrite.storageMode;
}

export async function persistDerivedSignals(signals: DerivedSignalInput[]): Promise<{ persisted: number; storageMode: IngestionStorageMode }> {
  const supabaseWrite = await trySupabaseInsert("derived_signals", signals.map(derivedSignalRow));
  writeLatest("latest-derived-signals.json", signals);
  if (supabaseWrite.storageMode === "supabase") return { persisted: signals.length, storageMode: "supabase" };
  return { persisted: signals.length, storageMode: "local_fallback" };
}

export async function persistLiquidityScoreSnapshot(score: LiquidityScoreSnapshotInput): Promise<IngestionStorageMode> {
  const supabaseWrite = await trySupabaseInsert("liquidity_scores", [liquidityScoreRow(score)]);
  writeLatest("latest-liquidity-score.json", score);
  return supabaseWrite.storageMode;
}

export async function persistRegimeInputSnapshot(input: RegimeInputSnapshotInput): Promise<IngestionStorageMode> {
  const supabaseWrite = await trySupabaseInsert("regime_inputs", [regimeInputRow(input)]);
  writeLatest("latest-regime-input.json", input);
  return supabaseWrite.storageMode;
}

export async function persistMarketSnapshots(snapshots: MarketSnapshotInput[]): Promise<{ persisted: number; storageMode: IngestionStorageMode }> {
  const supabaseWrite = await trySupabaseInsert("market_snapshots", snapshots.map(marketSnapshotRow));
  writeLatest("latest-market-snapshots.json", snapshots);
  if (supabaseWrite.storageMode === "supabase") return { persisted: snapshots.length, storageMode: "supabase" };
  return { persisted: snapshots.length, storageMode: "local_fallback" };
}

export async function persistIntelligenceOutputs(outputs: IntelligenceOutputInput[]): Promise<{ persisted: number; storageMode: IngestionStorageMode }> {
  const supabaseWrite = await trySupabaseInsert("intelligence_outputs", outputs.map(intelligenceOutputRow));
  writeLatest("latest-intelligence-outputs.json", outputs);
  if (supabaseWrite.storageMode === "supabase") return { persisted: outputs.length, storageMode: "supabase" };
  return { persisted: outputs.length, storageMode: "local_fallback" };
}

export async function persistTelemetryLogs(logs: TelemetryLogInput[]): Promise<IngestionStorageMode> {
  const supabaseWrite = await trySupabaseInsert("telemetry_logs", logs.map(telemetryLogRow));
  appendJsonl("telemetry-logs.jsonl", logs);
  writeLatest("latest-telemetry-logs.json", logs.slice(0, 200));
  return supabaseWrite.storageMode;
}

export function getLatestRawEventsSync(limit = 40) {
  return readLatest<RawEventInput[]>("latest-events.json", []).slice(0, limit);
}

export function getLatestRawMetricsSync(limit = 80) {
  return readLatest<RawMetricInput[]>("latest-metrics.json", []).slice(0, limit);
}

export function getLatestNormalizedEventsSync(limit = 100) {
  return readLatest<NormalizedEventInput[]>("latest-normalized-events.json", []).slice(0, limit);
}

export function getLatestEventClustersSync(limit = 100) {
  return readLatest<EventClusterInput[]>("latest-event-clusters.json", []).slice(0, limit);
}

export function getLatestSourceHealthSync() {
  return readLatest<SourceHealthSnapshot[]>("source-health.json", []);
}

export function getLatestIngestionLogsSync(limit = 100) {
  return readLatest<IngestionLogEntry[]>("latest-ingestion-logs.json", []).slice(0, limit);
}

export function getLatestIngestionRunSync() {
  return readLatest<IngestionRunSummary | null>("latest-ingestion-run.json", null);
}

export function getLatestDeadLettersSync(limit = 100) {
  return readLatest<IngestionDeadLetterEntry[]>("latest-dead-letters.json", []).slice(0, limit);
}

export function getLatestStorageWriteReportsSync(limit = 50) {
  return readLatest<StorageWriteReport[]>("latest-storage-write-status.json", []).slice(0, limit);
}

export function getLatestDerivedSignalsSync() {
  return readLatest<DerivedSignalInput[]>("latest-derived-signals.json", []);
}

export function getLatestLiquidityScoreSync() {
  return readLatest<LiquidityScoreSnapshotInput | null>("latest-liquidity-score.json", null);
}

export function getLatestRegimeInputSync() {
  return readLatest<RegimeInputSnapshotInput | null>("latest-regime-input.json", null);
}

export function getLatestMarketSnapshotsSync(limit = 100) {
  return readLatest<MarketSnapshotInput[]>("latest-market-snapshots.json", []).slice(0, limit);
}

export function getLatestIntelligenceOutputsSync(limit = 100) {
  return readLatest<IntelligenceOutputInput[]>("latest-intelligence-outputs.json", []).slice(0, limit);
}

export function getLatestTelemetryLogsSync(limit = 100) {
  return readLatest<TelemetryLogInput[]>("latest-telemetry-logs.json", []).slice(0, limit);
}

async function selectSupabaseRows<T>(table: string, orderBy: string, limit: number): Promise<T[]> {
  const client = createSupabaseServerClient();
  if (!client) return [];
  const { data, error } = await client.from(table).select("*").order(orderBy, { ascending: false }).limit(limit);
  if (error || !data) return [];
  return data as T[];
}

type RawEventRow = ReturnType<typeof rawEventRow> & { id?: string; created_at?: string };
type RawMetricRow = ReturnType<typeof rawMetricRow> & { id?: string; created_at?: string };
type SourceHealthRow = ReturnType<typeof sourceHealthRow> & { id?: string };
type IngestionLogRow = ReturnType<typeof ingestionLogRow> & { id?: string };
type IngestionRunRow = ReturnType<typeof ingestionRunRow> & { id?: string; created_at?: string };
type DeadLetterRow = ReturnType<typeof deadLetterRow> & { id?: string };
type NormalizedEventRow = ReturnType<typeof normalizedEventRow> & { id?: string; created_at?: string };
type EventClusterRow = ReturnType<typeof eventClusterRow> & { id?: string; created_at?: string };
type MarketSnapshotRow = ReturnType<typeof marketSnapshotRow> & { id?: string; created_at?: string };
type IntelligenceOutputRow = ReturnType<typeof intelligenceOutputRow> & { id?: string; created_at?: string };
type TelemetryLogRow = ReturnType<typeof telemetryLogRow> & { id?: string; created_at?: string };

function rawEventFromRow(row: RawEventRow): RawEventInput {
  return {
    id: row.id,
    sourceId: row.source_id_text,
    sourceName: row.source_name,
    sourceType: row.source_type as RawEventInput["sourceType"],
    category: row.category as RawEventInput["category"],
    title: row.title,
    content: row.content ?? "",
    url: row.url ?? undefined,
    language: row.language,
    timestamp: row.event_timestamp,
    rawPayload: row.raw_payload,
    dedupHash: row.dedup_hash,
    quality: row.quality as RawEventInput["quality"],
  };
}

function marketSnapshotFromRow(row: MarketSnapshotRow): MarketSnapshotInput {
  return {
    runId: row.run_id ?? undefined,
    snapshotKey: row.snapshot_key,
    asset: row.asset ?? undefined,
    metricSet: row.metric_set,
    sourceType: row.source_type as MarketSnapshotInput["sourceType"],
    quality: row.quality as MarketSnapshotInput["quality"],
    freshnessStatus: row.freshness_status as MarketSnapshotInput["freshnessStatus"],
    sourceIds: row.source_ids ?? [],
    metricCount: Number(row.metric_count),
    payload: row.payload ?? {},
    observedAt: row.observed_at,
  };
}

function intelligenceOutputFromRow(row: IntelligenceOutputRow): IntelligenceOutputInput {
  return {
    runId: row.run_id ?? undefined,
    outputKey: row.output_key,
    moduleName: row.module_name,
    outputType: row.output_type,
    asset: row.asset ?? undefined,
    timeframe: row.timeframe ?? undefined,
    sourceType: row.source_type as IntelligenceOutputInput["sourceType"],
    status: row.status as IntelligenceOutputInput["status"],
    score: row.score === null ? null : Number(row.score),
    confidence: row.confidence === null ? null : Number(row.confidence),
    confidenceLabel: row.confidence_label ?? undefined,
    dataQuality: row.data_quality as IntelligenceOutputInput["dataQuality"],
    usedSignals: row.used_signals ?? [],
    missingSignals: row.missing_signals ?? [],
    staleSignals: row.stale_signals ?? [],
    narrativeFa: row.narrative_fa ?? undefined,
    calculations: row.calculations ?? {},
    payload: row.payload ?? {},
    generatedAt: row.generated_at,
  };
}

function telemetryLogFromRow(row: TelemetryLogRow): TelemetryLogInput {
  return {
    runId: row.run_id ?? undefined,
    scope: row.scope,
    eventType: row.event_type,
    level: row.level as TelemetryLogInput["level"],
    message: row.message,
    durationMs: row.duration_ms === null ? undefined : Number(row.duration_ms),
    sourceId: row.source_id_text ?? undefined,
    tableName: row.table_name ?? undefined,
    payload: row.payload ?? {},
    observedAt: row.observed_at,
  };
}

function normalizedEventFromRow(row: NormalizedEventRow): NormalizedEventInput {
  return {
    id: row.id,
    rawEventId: row.raw_event_id ?? undefined,
    sourceId: row.source_id_text ?? "",
    sourceName: row.source_name ?? "",
    sourceType: row.source_type as NormalizedEventInput["sourceType"],
    category: row.category as NormalizedEventInput["category"],
    title: row.title,
    summary: row.summary ?? "",
    url: row.url ?? undefined,
    language: row.language,
    publishedAt: row.published_at ?? row.event_timestamp,
    eventTimestamp: row.event_timestamp,
    eventType: row.event_type,
    affectedAssets: row.affected_assets ?? [],
    entities: row.entities ?? [],
    freshnessStatus: row.freshness_status as NormalizedEventInput["freshnessStatus"],
    sourceReliability: Number(row.source_reliability ?? 0),
    quality: row.quality as NormalizedEventInput["quality"],
    confidence: Number(row.confidence ?? 0),
    processingStatus: row.processing_status as NormalizedEventInput["processingStatus"],
    normalizedPayload: row.normalized_payload ?? {},
  };
}

function eventClusterFromRow(row: EventClusterRow): EventClusterInput {
  return {
    id: row.id,
    clusterKey: row.cluster_key,
    eventType: row.event_type,
    category: row.category as EventClusterInput["category"],
    primaryTitle: row.primary_title,
    affectedAssets: row.affected_assets ?? [],
    entities: row.entities ?? [],
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
    eventCount: Number(row.event_count),
    sourceCount: Number(row.source_count),
    sourceReferences: Array.isArray(row.source_references) ? row.source_references as EventClusterInput["sourceReferences"] : [],
    similarityMethod: row.similarity_method as EventClusterInput["similarityMethod"],
    confidence: Number(row.confidence),
  };
}

function rawMetricFromRow(row: RawMetricRow): RawMetricInput {
  return {
    id: row.id,
    sourceId: row.source_id_text,
    sourceName: row.source_name,
    sourceType: row.source_type as RawMetricInput["sourceType"],
    asset: row.asset as RawMetricInput["asset"],
    group: row.signal_group as RawMetricInput["group"],
    metric: row.metric,
    value: row.value === null ? null : Number(row.value),
    previousValue: row.previous_value === null ? null : Number(row.previous_value),
    changeAbs: row.change_abs === null ? null : Number(row.change_abs),
    changePct: row.change_pct === null ? null : Number(row.change_pct),
    timestamp: row.metric_timestamp,
    quality: row.quality as RawMetricInput["quality"],
    reliability: Number(row.reliability),
    sampleSize: Number(row.sample_size),
    error: row.error ?? undefined,
    rawPayload: row.raw_payload,
  };
}

function sourceHealthFromRow(row: SourceHealthRow): SourceHealthSnapshot {
  return {
    sourceId: row.source_id_text,
    sourceName: row.source_name,
    status: row.status as SourceHealthSnapshot["status"],
    tier: row.tier as SourceHealthSnapshot["tier"],
    latencyMs: Number(row.latency_ms),
    freshnessMinutes: row.freshness_minutes === null ? null : Number(row.freshness_minutes),
    errorRate: Number(row.error_rate),
    consecutiveFailures: Number(row.consecutive_failures),
    lastSuccessAt: row.last_success_at,
    lastFailureAt: row.last_failure_at,
    lastError: row.last_error ?? undefined,
    nextRetryAt: row.next_retry_at,
    updatedAt: row.updated_at,
  };
}

function ingestionLogFromRow(row: IngestionLogRow): IngestionLogEntry {
  return {
    id: row.id,
    runId: row.run_id,
    sourceId: row.source_id_text,
    sourceName: row.source_name,
    status: row.status as IngestionLogEntry["status"],
    message: row.message,
    attempts: Number(row.attempts),
    latencyMs: Number(row.latency_ms),
    rawEvents: Number(row.raw_events),
    rawMetrics: Number(row.raw_metrics),
    storageMode: row.storage_mode as IngestionStorageMode,
    error: row.error ?? undefined,
    createdAt: row.created_at,
  };
}

function deadLetterFromRow(row: DeadLetterRow): IngestionDeadLetterEntry {
  return {
    id: row.id,
    runId: row.run_id,
    sourceId: row.source_id_text,
    sourceName: row.source_name,
    status: row.status as IngestionDeadLetterEntry["status"],
    attempts: Number(row.attempts),
    error: row.error,
    payload: row.payload,
    failedAt: row.failed_at,
    nextRetryAt: row.next_retry_at,
  };
}

function ingestionRunFromRow(row: IngestionRunRow): IngestionRunSummary {
  return {
    runId: row.run_id,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    storageMode: row.storage_mode as IngestionStorageMode,
    pulledEvents: Number(row.pulled_events),
    pulledMetrics: Number(row.pulled_metrics),
    persistedEvents: Number(row.persisted_events),
    persistedMetrics: Number(row.persisted_metrics),
    rawEventsInserted: Number(row.raw_events_inserted ?? 0),
    rawEventsUpdated: Number(row.raw_events_updated ?? 0),
    normalizedEventsCreated: Number(row.normalized_events_created ?? 0),
    eventClustersCreated: Number(row.event_clusters_created ?? 0),
    duplicatesDetected: Number(row.duplicates_detected ?? 0),
    successfulSources: Number(row.successful_sources),
    degradedSources: Number(row.degraded_sources),
    failedSources: Number(row.failed_sources),
    skippedSources: Number(row.skipped_sources),
    deadLetters: Number(row.dead_letters),
    sourceHealth: [],
    logs: [],
    deadLetterEntries: [],
  };
}

export async function getLatestRawEvents(limit = 40) {
  const rows = await selectSupabaseRows<RawEventRow>("raw_events", "event_timestamp", limit);
  return rows.length ? rows.map(rawEventFromRow) : getLatestRawEventsSync(limit);
}

export async function getRecentRawEventsForNormalization(limit = 500) {
  const rows = await selectSupabaseRows<RawEventRow>("raw_events", "event_timestamp", limit);
  return rows.map(rawEventFromRow);
}

export async function getLatestNormalizedEvents(limit = 100) {
  const rows = await selectSupabaseRows<NormalizedEventRow>("normalized_events", "event_timestamp", limit);
  return rows.map(normalizedEventFromRow);
}

export async function getLatestEventClusters(limit = 100) {
  const rows = await selectSupabaseRows<EventClusterRow>("event_clusters", "last_seen_at", limit);
  return rows.map(eventClusterFromRow);
}

export async function getLatestRawMetrics(limit = 80) {
  const rows = await selectSupabaseRows<RawMetricRow>("raw_metrics", "created_at", limit);
  return rows.length ? rows.map(rawMetricFromRow) : getLatestRawMetricsSync(limit);
}

export async function getLatestSourceHealth() {
  const rows = await selectSupabaseRows<SourceHealthRow>("source_health", "updated_at", 200);
  return rows.length ? rows.map(sourceHealthFromRow) : getLatestSourceHealthSync();
}

export async function getLatestIngestionLogs(limit = 100) {
  const rows = await selectSupabaseRows<IngestionLogRow>("ingestion_logs", "created_at", limit);
  return rows.length ? rows.map(ingestionLogFromRow) : getLatestIngestionLogsSync(limit);
}

export async function getLatestDeadLetters(limit = 100) {
  const rows = await selectSupabaseRows<DeadLetterRow>("dead_letters", "failed_at", limit);
  return rows.length ? rows.map(deadLetterFromRow) : getLatestDeadLettersSync(limit);
}

export async function getLatestIngestionRun() {
  const rows = await selectSupabaseRows<IngestionRunRow>("ingestion_runs", "finished_at", 1);
  return rows.length ? ingestionRunFromRow(rows[0]) : getLatestIngestionRunSync();
}

export async function getLatestMarketSnapshots(limit = 100) {
  const rows = await selectSupabaseRows<MarketSnapshotRow>("market_snapshots", "observed_at", limit);
  return rows.length ? rows.map(marketSnapshotFromRow) : getLatestMarketSnapshotsSync(limit);
}

export async function getLatestIntelligenceOutputs(limit = 100) {
  const rows = await selectSupabaseRows<IntelligenceOutputRow>("intelligence_outputs", "generated_at", limit);
  return rows.length ? rows.map(intelligenceOutputFromRow) : getLatestIntelligenceOutputsSync(limit);
}

export async function getLatestTelemetryLogs(limit = 100) {
  const rows = await selectSupabaseRows<TelemetryLogRow>("telemetry_logs", "observed_at", limit);
  return rows.length ? rows.map(telemetryLogFromRow) : getLatestTelemetryLogsSync(limit);
}

export async function getSupabaseTableCounts(tableNames: string[]) {
  const client = createSupabaseServerClient();
  if (!client) return tableNames.map((table) => ({ table, count: null, error: "Supabase env is not configured." }));

  return Promise.all(
    tableNames.map(async (table) => {
      const { count, error } = await client.from(table).select("*", { count: "exact", head: true });
      return { table, count: count ?? null, error: error?.message };
    }),
  );
}

export function getIngestionStorePath() {
  ensureStoreDir();
  return INGESTION_STORE_DIR;
}

export function getIngestionStoreParent() {
  return dirname(INGESTION_STORE_DIR);
}
