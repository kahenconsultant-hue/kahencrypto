import type { AssetSymbol, DataPoint, DataQuality, NewsCategory, SignalGroup, SourceType } from "@/lib/types";

export type IngestionSourceType = "rss" | "api" | "websocket" | "scraper" | "social" | "filings";
export type IngestionSourceStatus = "success" | "degraded" | "failed" | "api_key_missing" | "disabled";
export type IngestionStorageMode = "supabase" | "local_fallback" | "memory";
export type StorageWriteStatus = "success" | "failed" | "skipped";
export type FreshnessStatus = "live" | "fresh" | "delayed" | "stale" | "stale_critical" | "unavailable";
export type SourceAccessModel = "core_free" | "free_delayed" | "api_key_optional" | "premium_disabled" | "scraping_fallback";
export type IntelligenceSourceClass = "core" | "optional" | "premium";

export interface RetryPolicy {
  maxAttempts: number;
  backoffMs: number;
  backoffMultiplier: number;
}

export interface SourceDefinition {
  id: string;
  name: string;
  sourceType: IngestionSourceType;
  endpoint?: string;
  category: NewsCategory | "market_data" | "source_health";
  tier: 1 | 2 | 3;
  enabled: boolean;
  pollingIntervalSeconds: number;
  timeoutMs: number;
  priorityScore: number;
  parser: "rss" | "html_listing" | "market_signals" | "exchange_market" | "json" | "none";
  signalKeys?: string[];
  assetRelevance: Array<AssetSymbol | "VIX" | "Stablecoins">;
  requiredEnvKeys?: string[];
  retryPolicy: RetryPolicy;
  rateLimitPerMinute?: number;
  degradedMode: "disable_module" | "mark_unavailable" | "allow_partial";
  accessModel?: SourceAccessModel;
  intelligenceClass?: IntelligenceSourceClass;
  blocksCoreIntelligence?: boolean;
  disabledReason?: string;
  premiumModule?: string;
}

export interface RawEventInput {
  id?: string;
  sourceId: string;
  sourceName: string;
  sourceType: IngestionSourceType;
  category: NewsCategory;
  title: string;
  content: string;
  url?: string;
  language?: string;
  timestamp: string;
  rawPayload?: unknown;
  dedupHash: string;
  quality: DataQuality;
}

export interface RawEventPersistenceResult {
  persisted: number;
  inserted: number;
  updated: number;
  storageMode: IngestionStorageMode;
}

export interface NormalizedEventInput {
  id?: string;
  rawEventId?: string;
  sourceId: string;
  sourceName: string;
  sourceType: IngestionSourceType;
  category: NewsCategory;
  title: string;
  summary: string;
  url?: string;
  language: string;
  publishedAt: string;
  eventTimestamp: string;
  eventType: string;
  affectedAssets: string[];
  entities: string[];
  freshnessStatus: FreshnessStatus;
  sourceReliability: number;
  quality: DataQuality;
  confidence: number;
  processingStatus: "pending" | "processed" | "failed" | "skipped";
  normalizedPayload: Record<string, unknown>;
}

export interface EventClusterInput {
  id?: string;
  clusterKey: string;
  eventType: string;
  category: NewsCategory;
  primaryTitle: string;
  affectedAssets: string[];
  entities: string[];
  firstSeenAt: string;
  lastSeenAt: string;
  eventCount: number;
  sourceCount: number;
  sourceReferences: Array<{
    rawEventId?: string;
    normalizedEventId?: string;
    sourceId: string;
    sourceName: string;
    title: string;
    url?: string;
    publishedAt: string;
  }>;
  similarityMethod: "deterministic_token_overlap" | "url_match" | "single_event";
  confidence: number;
}

export interface RawMetricInput {
  id?: string;
  sourceId: string;
  sourceName: string;
  sourceType: SourceType | IngestionSourceType;
  asset?: DataPoint["asset"];
  group: SignalGroup;
  metric: string;
  value: number | null;
  previousValue?: number | null;
  changeAbs?: number | null;
  changePct?: number | null;
  timestamp: string | null;
  quality: DataQuality;
  reliability: number;
  sampleSize?: number;
  error?: string;
  rawPayload?: unknown;
}

export interface SourceHealthSnapshot {
  sourceId: string;
  sourceName: string;
  status: IngestionSourceStatus;
  tier: 1 | 2 | 3;
  latencyMs: number;
  freshnessMinutes: number | null;
  errorRate: number;
  consecutiveFailures: number;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastError?: string;
  nextRetryAt?: string | null;
  updatedAt: string;
}

export interface IngestionLogEntry {
  id?: string;
  runId: string;
  sourceId: string;
  sourceName: string;
  status: IngestionSourceStatus;
  message: string;
  attempts: number;
  latencyMs: number;
  rawEvents: number;
  rawMetrics: number;
  storageMode: IngestionStorageMode;
  error?: string;
  createdAt: string;
}

export interface IngestionDeadLetterEntry {
  id?: string;
  runId: string;
  sourceId: string;
  sourceName: string;
  status: IngestionSourceStatus;
  attempts: number;
  error: string;
  payload: unknown;
  failedAt: string;
  nextRetryAt?: string | null;
}

export interface StorageWriteReport {
  table: string;
  rows: number;
  status: StorageWriteStatus;
  storageMode: IngestionStorageMode;
  attemptedAt: string;
  error?: string;
}

export interface DerivedSignalInput {
  runId?: string;
  signalKey: string;
  labelFa: string;
  sourceType: "direct" | "derived" | "proxy" | "unavailable";
  score: number | null;
  confidence: number | null;
  quality: DataQuality;
  affectedAssets: string[];
  timeHorizon: string;
  usedInputs: string[];
  missingInputs: string[];
  explanationFa: string;
  formula: string;
  payload: Record<string, unknown>;
  generatedAt: string;
}

export interface LiquidityScoreSnapshotInput {
  runId?: string;
  scoreKey: string;
  sourceType: "direct" | "derived" | "proxy" | "unavailable";
  cryptoLiquidityProxyScore: number | null;
  macroLiquidityPressureScore: number | null;
  stablecoinPressure: number | null;
  confidence: number | null;
  quality: DataQuality;
  unavailablePremiumInputs: string[];
  explanationFa: string;
  payload: Record<string, unknown>;
  generatedAt: string;
}

export interface RegimeInputSnapshotInput {
  runId?: string;
  regimeKey: string;
  sourceType: "direct" | "derived" | "proxy" | "unavailable";
  regime: string;
  confidence: number | null;
  quality: DataQuality;
  usedInputs: string[];
  missingInputs: string[];
  explanationFa: string;
  payload: Record<string, unknown>;
  generatedAt: string;
}

export interface MarketSnapshotInput {
  runId?: string;
  snapshotKey: string;
  asset?: string;
  metricSet: string;
  sourceType: "direct" | "derived" | "proxy" | "unavailable";
  quality: DataQuality;
  freshnessStatus: FreshnessStatus;
  sourceIds: string[];
  metricCount: number;
  payload: Record<string, unknown>;
  observedAt: string;
}

export interface IntelligenceOutputInput {
  runId?: string;
  outputKey: string;
  moduleName: string;
  outputType: string;
  asset?: string;
  timeframe?: string;
  sourceType: "direct" | "derived" | "proxy" | "unavailable";
  status: "available" | "degraded" | "unavailable" | "suppressed";
  score: number | null;
  confidence: number | null;
  confidenceLabel?: string;
  dataQuality: DataQuality;
  usedSignals: string[];
  missingSignals: string[];
  staleSignals: string[];
  narrativeFa?: string;
  calculations: Record<string, unknown>;
  payload: Record<string, unknown>;
  generatedAt: string;
}

export interface TelemetryLogInput {
  runId?: string;
  scope: string;
  eventType: string;
  level: "debug" | "info" | "warning" | "error" | "critical";
  message: string;
  durationMs?: number;
  sourceId?: string;
  tableName?: string;
  payload: Record<string, unknown>;
  observedAt: string;
}

export interface CollectorOutput {
  source: SourceDefinition;
  status: IngestionSourceStatus;
  fetchedAt: string;
  latencyMs: number;
  rawEvents: RawEventInput[];
  rawMetrics: RawMetricInput[];
  error?: string;
}

export interface Collector {
  sourceType: IngestionSourceType;
  collect(source: SourceDefinition): Promise<CollectorOutput>;
}

export interface IngestionJobResult {
  output: CollectorOutput;
  attempts: number;
}

export interface IngestionRunSummary {
  runId: string;
  startedAt: string;
  finishedAt: string;
  storageMode: IngestionStorageMode;
  pulledEvents: number;
  pulledMetrics: number;
  persistedEvents: number;
  persistedMetrics: number;
  rawEventsInserted?: number;
  rawEventsUpdated?: number;
  normalizedEventsCreated?: number;
  eventClustersCreated?: number;
  duplicatesDetected?: number;
  successfulSources: number;
  degradedSources: number;
  failedSources: number;
  skippedSources: number;
  deadLetters: number;
  sourceHealth: SourceHealthSnapshot[];
  logs: IngestionLogEntry[];
  deadLetterEntries: IngestionDeadLetterEntry[];
  writeReports?: StorageWriteReport[];
}

export interface IngestionFoundationStatus {
  generatedAt: string;
  storageMode: IngestionStorageMode;
  sourcesTotal: number;
  sourcesEnabled: number;
  criticalSourcesTotal: number;
  criticalSourcesOnline: number;
  failedSources: number;
  degradedSources: number;
  latestEvents: RawEventInput[];
  latestMetrics: RawMetricInput[];
  sourceHealth: SourceHealthSnapshot[];
}
