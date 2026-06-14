import { productionSources } from "@/collectors/registry";
import { freshnessScoreFromState, resolveSignalFreshness, resolveSourceFreshness, type FreshnessState } from "@/health/freshnessResolver";
import type { DataQuality, IntelligenceAssetSymbol } from "@/lib/types";
import { getDynamicCorrelationReport } from "@/server/analytics/correlation-engine";
import { getDerivedSignalReport } from "@/server/analytics/derived-signal-engine";
import { getLiquidityReport } from "@/server/analytics/liquidity-engine";
import { getLiquidityIntelligenceStack } from "@/server/analytics/liquidity-intelligence-stack";
import { getIntelligenceIntegrityReport, type IntegrityDashboardReport } from "@/server/analytics/intelligence-integrity-engine";
import { getMarketRegimeReport } from "@/server/analytics/market-regime-engine";
import { getSignalSnapshot } from "@/server/analytics/market-signals";
import { getSentimentReport } from "@/server/analytics/sentiment-engine";
import { generateSmartAlerts } from "@/server/alerts/smart-alert-engine";
import { buildAdapterBundleBreakdown, type AdapterBundleBreakdown } from "@/server/data/adapter-bundle-diagnostics";
import { freshnessFromLatestEtfDate, parsedRowsFromEtfDailyFlowRecords } from "@/server/data/farside-etf";
import { simulateSchedulerCycles } from "@/server/ingestion/scheduler";
import {
  getLatestDeadLetters,
  getLatestDataHealthSnapshots,
  getLatestEtfDailyFlows,
  getLatestIngestionLogs,
  getLatestIngestionRun,
  hydrateMarketSnapshotsFromSupabase,
  getLatestRawEvents,
  getLatestRawMetrics,
  getLatestSchedulerRuns,
  getLatestSourceHealth,
  getLatestStorageWriteReportsSync,
  type DataHealthSnapshotDbRow,
} from "@/storage/ingestion-store";
import type {
  IngestionLogEntry,
  IngestionSourceStatus,
  RawEventInput,
  RawMetricInput,
  SourceDefinition,
  SourceHealthSnapshot,
  StorageWriteReport,
} from "@/types/ingestion";

export type AdminSourceStatus = "connected" | "degraded" | "disconnected";
export type MetricAvailability = "available" | "missing" | "estimated" | "proxy";

export interface DataSourceHealthRow {
  sourceId: string;
  sourceName: string;
  sourceType: string;
  category: string;
  tier: number;
  accessModel: string;
  enabled: boolean;
  status: AdminSourceStatus;
  lastSuccessfulUpdate: string | null;
  lastError: string | null;
  responseTimeMs: number | null;
  freshnessMinutes: number | null;
  freshnessState?: FreshnessState;
  expectedIntervalMinutes?: number;
  coveragePercent: number;
  warningFa: string | null;
}

export interface MarketCoverageRow {
  asset: IntelligenceAssetSymbol;
  coveragePercent: number;
  metrics: Array<{
    key: string;
    labelFa: string;
    status: MetricAvailability;
    source: string | null;
    freshnessMinutes: number | null;
    value: number | null;
  }>;
}

export interface NewsSourceHealthRow {
  sourceId: string;
  sourceName: string;
  sourceType: string;
  category: string;
  articles24h: number;
  lastSuccessfulFetch: string | null;
  lastFailedFetch: string | null;
  coverageScore: number;
  lastError: string | null;
}

export interface MacroMetricRow {
  metric: string;
  latestValue: number | null;
  source: string | null;
  timestamp: string | null;
  freshnessMinutes: number | null;
  status: MetricAvailability;
}

export interface StablecoinMetricRow extends MacroMetricRow {}

export interface FredSeriesBreakdownRow {
  seriesId: string;
  label: string;
  status: MetricAvailability;
  latestValue: number | null;
  observationDate: string | null;
  fetchTimestamp: string | null;
  error: string | null;
}

export interface EtfIntelligenceHealthRow {
  asset: "BTC" | "ETH";
  sourceName: string;
  status: AdminSourceStatus;
  lastSuccessfulFetch: string | null;
  parsedRowsCount: number;
  latestEtfDate: string | null;
  latestTotalFlowUsdMillion: number | null;
  freshnessMinutes: number | null;
  freshnessStatus: "fresh" | "delayed" | "stale" | "unavailable";
  sourceUrl: string | null;
  error: string | null;
}

export interface EngineHealthRow {
  engineName: string;
  status: AdminSourceStatus;
  lastRun: string | null;
  inputCoveragePercent: number;
  confidenceQuality: string;
  engineScore: number | null;
  missingInputs: string[];
  warningFa: string | null;
}

export interface LiquidityIntelligenceHealthRow {
  engineId: string;
  engineName: string;
  status: AdminSourceStatus;
  score: number | null;
  coverage: number;
  confidence: number;
  freshness: DataQuality;
  missingInputs: string[];
  sourceCount: number;
  lastUpdate: string | null;
  contribution: number | null;
  redistributedWeight: number;
  explanationFa: string;
}

export interface AlertAuditRow {
  alertId: string;
  alertName: string;
  dataSourcesUsed: string[];
  indicatorCount: number;
  confidence: number | null;
  missingInputs: string[];
  dataCoveragePercent: number | null;
  supportingSignals: string[];
  invalidationCondition: string | null;
  alertQualityScore: number | null;
  riskLevel: string;
  flagged: boolean;
  explanationFa: string;
}

export interface ApiLogRow {
  sourceName: string;
  endpoint: string | null;
  status: IngestionSourceStatus;
  statusLabel: "Success" | "Degraded" | "Fail" | "Disabled" | "Missing Key";
  latencyMs: number | null;
  timestamp: string;
  errorMessage: string | null;
}

export interface CorrelationHealthRow {
  pair: string;
  correlation24h: number | null;
  correlation7d: number | null;
  correlation30d: number | null;
  correlation90d: number | null;
  volatilityAdjusted30d: number | null;
  beta30d: number | null;
  stabilityScore: number | null;
  structuralBreak: boolean;
  regimeChannel: string;
  narrativeAllowed: boolean;
  statisticalStrength?: "insufficient" | "weak" | "moderate" | "strong";
  leadLag: {
    leader: "left" | "right" | "none" | "insufficient";
    lag: "1h" | "1d" | null;
    correlation: number | null;
    confidence: number | null;
    interpretationFa: string;
  };
  observations24h: number;
  observations7d: number;
  observations30d: number;
  observations90d: number;
  windowIntegrity?: Record<"24h" | "7d" | "30d" | "90d", {
    window: "24h" | "7d" | "30d" | "90d";
    frequency: "hourly" | "daily";
    observationsUsed: number;
    missingObservations: number;
    minimumObservations: number;
    coveragePercent?: number;
    availableSamples?: number;
    requiredSamples?: number;
    lastAlignedTimestamp: string | null;
    sourcePair: string;
    status: "available" | "insufficient_data" | "missing_series";
  }>;
  source: string;
  status: "available" | "insufficient_data" | "missing_series";
  confidence: number | null;
  coveragePercent?: number;
}

export interface DataQualityScores {
  sourceReliabilityScore: number;
  freshnessScore: number;
  coverageScore: number;
  analyticsQualityScore: number;
  operationalReliabilityScore: number;
  marketReliabilityScore: number;
  engineReliabilityScore: number;
  overallPlatformHealthScore: number;
  productionReadinessScore: number;
  fusionHealthScore: number;
  confidenceConsistencyScore: number;
  dataCoveragePercent: number;
  connectedSources: number;
  totalSources: number;
  criticalCoreConnectedSources: number;
  criticalCoreTotalSources: number;
  allActiveConnectedSources: number;
  allActiveTotalSources: number;
  optionalPremiumActiveSources: number;
  optionalPremiumTotalSources: number;
  degradedSources: number;
  staleSources: number;
  disabledSources: number;
  enginesHealthy: number;
  totalEngines: number;
}

export interface SchedulerDashboardRow {
  stageId: string;
  label: string;
  status: "success" | "success_with_limited_confidence" | "degraded" | "failed" | "skipped";
  durationMs: number;
  failedSources: number;
  degradedSources: number;
  deadLetters: number;
  retryCount: number;
  details?: Record<string, unknown>;
  error: string | null;
}

export interface SchedulerDashboard {
  lastRun: string | null;
  nextRun: string | null;
  trigger: string | null;
  schedulerSource: string | null;
  executionEnvironment: string | null;
  storageMode: string | null;
  externalProductionRuns: number;
  localManualRuns: number;
  failedProductionRuns: number;
  durationMs: number | null;
  successRate: number;
  failedStage: string | null;
  retryCount: number;
  operationalReliabilityScore: number;
  status: "success" | "success_with_limited_confidence" | "degraded" | "failed" | "skipped";
  staleSignals: number;
  stages: SchedulerDashboardRow[];
  simulation: {
    cycles: number;
    simulatedHours: number;
    successfulCycles: number;
    degradedCycles: number;
    failedCycles: number;
    staleSignals: number;
    missedUpdates: number;
    failedTasks: string[];
    averageDurationMs: number;
    noteFa: string;
  };
}

export interface DebugPayload {
  rawApiResponses: Array<{
    sourceId: string;
    sourceName: string;
    titleOrMetric: string;
    rawPayload: unknown;
    timestamp: string | null;
  }>;
  mappedFields: Array<{
    sourceId: string;
    sourceName: string;
    field: string;
    value: unknown;
    quality: DataQuality;
  }>;
  transformationPipeline: string[];
  finalEngineInput: Record<string, unknown>;
}

export interface DataHealthDashboard {
  generatedAt: string;
  lastIngestionRun: Awaited<ReturnType<typeof getLatestIngestionRun>>;
  dataSources: DataSourceHealthRow[];
  adapterBundleBreakdown: AdapterBundleBreakdown;
  marketCoverage: MarketCoverageRow[];
  newsSources: NewsSourceHealthRow[];
  macroData: MacroMetricRow[];
  fredSeriesBreakdown: FredSeriesBreakdownRow[];
  stablecoinData: StablecoinMetricRow[];
  etfIntelligence: EtfIntelligenceHealthRow[];
  engineHealth: EngineHealthRow[];
  liquidityIntelligenceHealth: LiquidityIntelligenceHealthRow[];
  integrity: IntegrityDashboardReport;
  alertAudit: AlertAuditRow[];
  apiLogs: ApiLogRow[];
  correlationTable: CorrelationHealthRow[];
  scheduler: SchedulerDashboard;
  storageDiagnostics: StorageDiagnostics;
  scores: DataQualityScores;
  failures: {
    failedSources: DataSourceHealthRow[];
    staleSources: DataSourceHealthRow[];
    missingApiKeySources: DataSourceHealthRow[];
    deadLetters: Awaited<ReturnType<typeof getLatestDeadLetters>>;
    storageWriteFailures: ReturnType<typeof getLatestStorageWriteReportsSync>;
  };
  debug: DebugPayload;
}

export interface StorageDiagnostics {
  storageMode: string;
  supabaseStatus: "connected" | "degraded" | "disconnected";
  readSuccessRate: number;
  writeSuccessRate: number;
  timeoutCount: number;
  fallbackCount: number;
  slowQueryCount: number;
  averageQueryDurationMs: number;
  lastStorageFailure: StorageWriteReport | null;
  affectedTables: string[];
}

const marketCoverageMap: Record<IntelligenceAssetSymbol, Array<{ key: string; labelFa: string; signalKeys: string[] }>> = {
  BTC: [
    { key: "price", labelFa: "قیمت", signalKeys: ["btc_trend_24h"] },
    { key: "volume", labelFa: "حجم", signalKeys: ["spot_volume_btc_24h"] },
    { key: "market_cap", labelFa: "ارزش بازار", signalKeys: ["btc_market_cap"] },
    { key: "open_interest", labelFa: "موقعیت‌های باز", signalKeys: ["open_interest_btc_24h"] },
    { key: "funding_rate", labelFa: "نرخ فاندینگ", signalKeys: ["funding_btc"] },
    { key: "etf_flow", labelFa: "جریان ETF", signalKeys: ["btc_etf_flow_24h"] },
    { key: "stablecoin_flow", labelFa: "جریان استیبل‌کوین", signalKeys: ["stablecoin_market_cap_7d"] },
  ],
  ETH: [
    { key: "price", labelFa: "قیمت", signalKeys: ["eth_trend_24h"] },
    { key: "volume", labelFa: "حجم", signalKeys: ["spot_volume_eth_24h"] },
    { key: "market_cap", labelFa: "ارزش بازار", signalKeys: ["eth_market_cap"] },
    { key: "open_interest", labelFa: "موقعیت‌های باز", signalKeys: ["open_interest_eth_24h"] },
    { key: "funding_rate", labelFa: "نرخ فاندینگ", signalKeys: ["funding_eth"] },
    { key: "etf_flow", labelFa: "جریان ETF", signalKeys: ["eth_etf_flow_24h"] },
    { key: "stablecoin_flow", labelFa: "جریان استیبل‌کوین", signalKeys: ["stablecoin_market_cap_7d"] },
  ],
  SOL: [
    { key: "price", labelFa: "قیمت", signalKeys: ["sol_trend_24h"] },
    { key: "volume", labelFa: "حجم", signalKeys: ["spot_volume_sol_24h"] },
    { key: "market_cap", labelFa: "ارزش بازار", signalKeys: ["sol_market_cap"] },
    { key: "open_interest", labelFa: "موقعیت‌های باز", signalKeys: ["open_interest_sol_24h"] },
    { key: "funding_rate", labelFa: "نرخ فاندینگ", signalKeys: ["funding_sol"] },
    { key: "etf_flow", labelFa: "جریان ETF", signalKeys: ["sol_etf_flow_24h"] },
    { key: "stablecoin_flow", labelFa: "جریان استیبل‌کوین", signalKeys: ["stablecoin_market_cap_7d"] },
  ],
  USDT: [
    { key: "price", labelFa: "قیمت", signalKeys: ["usdt_price"] },
    { key: "volume", labelFa: "حجم", signalKeys: ["usdt_volume_24h"] },
    { key: "market_cap", labelFa: "ارزش بازار", signalKeys: ["usdt_supply_7d"] },
    { key: "open_interest", labelFa: "موقعیت‌های باز", signalKeys: ["usdt_open_interest"] },
    { key: "funding_rate", labelFa: "نرخ فاندینگ", signalKeys: ["usdt_funding"] },
    { key: "etf_flow", labelFa: "جریان ETF", signalKeys: ["usdt_etf_flow"] },
    { key: "stablecoin_flow", labelFa: "جریان استیبل‌کوین", signalKeys: ["usdt_supply_7d", "stablecoin_market_cap_7d"] },
  ],
  DXY: [],
  Gold: [],
  Nasdaq: [],
  US10Y: [],
};

const macroMetricMap = [
  { metric: "DXY", signalKeys: ["dxy_trend_24h"] },
  { metric: "US10Y", signalKeys: ["us10y_trend_24h"] },
  { metric: "Fed Funds Rate", signalKeys: ["fed_funds_rate"] },
  { metric: "CPI", signalKeys: ["cpi_latest", "cpi_yoy"] },
  { metric: "PPI", signalKeys: ["ppi_latest", "ppi_yoy"] },
  { metric: "Employment Data", signalKeys: ["employment_latest", "nfp_latest", "unemployment_rate"] },
];

const fredSeriesMap = [
  { seriesId: "CPIAUCSL", label: "CPI", signalKey: "cpi_latest" },
  { seriesId: "PPIACO", label: "PPI", signalKey: "ppi_latest" },
  { seriesId: "FEDFUNDS", label: "Fed Funds Rate", signalKey: "fed_funds_rate" },
  { seriesId: "UNRATE", label: "Unemployment Rate", signalKey: "unemployment_rate" },
  { seriesId: "DGS10", label: "US 10-Year Treasury Yield", signalKey: "us10y_trend_24h" },
  { seriesId: "DGS2", label: "US 2-Year Treasury Yield", signalKey: "us2y_trend_24h" },
  { seriesId: "T10Y2Y", label: "10Y minus 2Y Yield Spread", signalKey: "yield_curve_10y2y" },
  { seriesId: "DTWEXBGS", label: "Trade Weighted US Dollar Index", signalKey: "dxy_trend_24h" },
];

const stablecoinMetricMap = [
  { metric: "USDT Supply", signalKeys: ["usdt_supply_7d"] },
  { metric: "USDT Supply 30d", signalKeys: ["usdt_supply_30d"] },
  { metric: "USDC Supply", signalKeys: ["usdc_supply_7d"] },
  { metric: "USDC Supply 30d", signalKeys: ["usdc_supply_30d"] },
  { metric: "Stablecoin Dominance", signalKeys: ["stablecoin_dominance"] },
  { metric: "Total Stablecoin Market Cap", signalKeys: ["total_stablecoin_market_cap_usd"] },
  { metric: "Stablecoin Market Cap 7d Change", signalKeys: ["stablecoin_market_cap_7d"] },
  { metric: "Stablecoin Market Cap 30d Change", signalKeys: ["stablecoin_market_cap_30d"] },
  { metric: "Exchange Inflows", signalKeys: ["exchange_inflows"] },
  { metric: "Exchange Outflows", signalKeys: ["exchange_outflows"] },
];

const liquidityInputs = [
  "dxy_trend_24h",
  "us10y_trend_24h",
  "stablecoin_market_cap_7d",
  "stablecoin_market_cap_30d",
  "stablecoin_dominance",
  "usdt_supply_7d",
  "usdt_supply_30d",
  "usdc_supply_7d",
  "usdc_supply_30d",
  "btc_etf_flow_24h",
  "eth_etf_flow_24h",
  "exchange_inflows",
  "exchange_outflows",
  "spot_volume_btc_24h",
  "funding_btc",
  "open_interest_btc_24h",
];

const regimeInputs = [
  "btc_trend_24h",
  "eth_trend_24h",
  "sol_trend_24h",
  "dxy_trend_24h",
  "us10y_trend_24h",
  "nasdaq_trend_24h",
  "stablecoin_market_cap_7d",
];

const sentimentInputs = ["normalized_events", "rss_events", "btc_trend_24h", "eth_trend_24h", "sol_trend_24h"];

function minutesSince(timestamp: string | null | undefined, now = new Date()) {
  if (!timestamp) return null;
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.round((now.getTime() - parsed) / 60_000));
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, item) => sum + item, 0) / values.length : 0;
}

function isSignalAvailable(key: string, signals: ReturnType<typeof getSignalSnapshot>["byKey"]) {
  const signal = signals[key];
  return Boolean(signal && signal.value !== null && signal.quality !== "unavailable");
}

function metricStatus(keys: string[], signals: ReturnType<typeof getSignalSnapshot>["byKey"]): MetricAvailability {
  const matched = keys.map((key) => signals[key]).filter(Boolean);
  if (!matched.length) return "missing";
  if (matched.some((signal) => signal.value !== null && signal.quality === "estimated")) return "estimated";
  if (matched.some((signal) => signal.value !== null && signal.quality === "proxy")) return "proxy";
  if (matched.some((signal) => signal.value !== null && signal.quality !== "unavailable")) return "available";
  return "missing";
}

function isUsableMetricValue(value: number | null | undefined, quality: DataQuality | undefined) {
  return typeof value === "number" && Number.isFinite(value) && quality !== "unavailable" && quality !== "estimated";
}

function firstSignal(keys: string[], signals: ReturnType<typeof getSignalSnapshot>["byKey"]) {
  return keys.map((key) => signals[key]).find((signal) => signal && signal.value !== null && signal.quality !== "unavailable") ?? null;
}

function isMisattributedFredBundleError(message: string | null | undefined) {
  return Boolean(message && /Blocking core adapter failure/i.test(message) && /Core market fallback adapter|Binance market adapter|Bybit derivatives adapter|DefiLlama stablecoin adapter|CoinGecko market cap adapter|RSS\/news adapter/i.test(message));
}

function parseFredObservationDate(source: string | null | undefined) {
  const match = source?.match(/latest observation\s+(\d{4}-\d{2}-\d{2})/i);
  return match?.[1] ?? null;
}

function latestFredMetric(seriesId: string, rawMetrics: RawMetricInput[]) {
  return rawMetrics.find((metric) => metric.sourceId === "fred-api" && metric.sourceName.includes(`FRED ${seriesId}`)) ?? null;
}

function buildFredSeriesBreakdown(
  signals: ReturnType<typeof getSignalSnapshot>["byKey"],
  rawMetrics: RawMetricInput[],
): FredSeriesBreakdownRow[] {
  return fredSeriesMap.map((definition) => {
    const metric = latestFredMetric(definition.seriesId, rawMetrics);
    const signal = signals[definition.signalKey];
    const signalIsFred = signal?.source?.includes(`FRED ${definition.seriesId}`) ?? false;
    const sourceText = metric?.sourceName ?? (signalIsFred ? signal?.source : null);
    const latestValue = metric?.value ?? (signalIsFred ? signal?.value ?? null : null);
    const quality = metric?.quality ?? (signalIsFred ? signal?.quality : undefined);
    const status: MetricAvailability = isUsableMetricValue(latestValue, quality) ? "available" : "missing";

    return {
      seriesId: definition.seriesId,
      label: definition.label,
      status,
      latestValue: latestValue ?? null,
      observationDate: parseFredObservationDate(sourceText),
      fetchTimestamp: metric?.timestamp ?? (signalIsFred ? signal?.timestamp ?? null : null),
      error: metric?.error ?? (signalIsFred ? signal?.error ?? null : null),
    };
  });
}

function fredSourceEvidence(params: {
  source: SourceDefinition;
  health: SourceHealthSnapshot | undefined;
  rawMetrics: RawMetricInput[];
  signals: ReturnType<typeof getSignalSnapshot>["byKey"];
}) {
  if (params.source.id !== "fred-api") return null;

  const breakdown = buildFredSeriesBreakdown(params.signals, params.rawMetrics);
  const available = breakdown.filter((row) => row.status === "available");
  const failed = breakdown.filter((row) => row.status !== "available");
  const latestFetch = available
    .map((row) => row.fetchTimestamp)
    .filter((timestamp): timestamp is string => Boolean(timestamp))
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null;
  const errors = failed.map((row) => (row.error ? `${row.seriesId}: ${row.error}` : null)).filter((error): error is string => Boolean(error));

  if (!process.env.FRED_API_KEY) {
    return {
      status: "disconnected" as AdminSourceStatus,
      lastSuccessfulUpdate: null,
      lastError: "FRED_API_KEY تنظیم نشده است.",
      responseTimeMs: params.health?.latencyMs ?? null,
      freshnessMinutes: null,
      coveragePercent: 0,
      warningFa: "کلید API تنظیم نشده است: FRED_API_KEY",
    };
  }

  if (available.length) {
    return {
      status: available.length === breakdown.length ? "connected" as AdminSourceStatus : "degraded" as AdminSourceStatus,
      lastSuccessfulUpdate: latestFetch ?? params.health?.lastSuccessAt ?? null,
      lastError: errors.length ? errors.slice(0, 3).join(" | ") : null,
      responseTimeMs: params.health?.latencyMs ?? null,
      freshnessMinutes: minutesSince(latestFetch ?? params.health?.lastSuccessAt),
      coveragePercent: clampScore((available.length / Math.max(1, breakdown.length)) * 100),
      warningFa: errors.length ? `برخی سری‌های FRED کامل دریافت نشدند: ${errors.slice(0, 3).join(" | ")}` : null,
    };
  }

  if (params.health && !isMisattributedFredBundleError(params.health.lastError)) {
    return null;
  }

  return {
    status: "disconnected" as AdminSourceStatus,
    lastSuccessfulUpdate: null,
    lastError: "هیچ سری معتبر FRED در آخرین داده‌ها دیده نشد.",
    responseTimeMs: params.health?.latencyMs ?? null,
    freshnessMinutes: null,
    coveragePercent: 0,
    warningFa: "FRED_API_KEY موجود است، اما هیچ metric معتبر FRED ثبت نشده است.",
  };
}

function sourceStatus(source: SourceDefinition, health: SourceHealthSnapshot | undefined): AdminSourceStatus {
  if (!source.enabled || health?.status === "disabled") return "disconnected";
  if (!health) return "disconnected";
  if (health.status === "failed" || health.status === "api_key_missing") return "disconnected";
  const freshness = resolveSourceFreshness(source, health);
  if (freshness.state === "obsolete" || freshness.state === "unavailable") return "disconnected";
  const optionalOnlyAdapterDegradation = (health.lastError ?? "").match(/Core adapters\s+(\d+)\/(\d+); optional enrichments missing:/i);
  if (
    source.id === "cmip-public-market-signal-adapters" &&
    health.status === "degraded" &&
    optionalOnlyAdapterDegradation &&
    Number(optionalOnlyAdapterDegradation[1]) === Number(optionalOnlyAdapterDegradation[2])
  ) {
    return "connected";
  }
  if (health.status === "degraded" || freshness.state === "delayed" || freshness.state === "stale") return "degraded";
  return "connected";
}

function sourceCoverage(params: {
  source: SourceDefinition;
  health: SourceHealthSnapshot | undefined;
  rawEvents: RawEventInput[];
  rawMetrics: RawMetricInput[];
  signals: ReturnType<typeof getSignalSnapshot>["byKey"];
}) {
  if (!params.source.enabled) return 0;
  if (params.source.signalKeys?.length) {
    const available = params.source.signalKeys.filter((key) => isSignalAvailable(key, params.signals)).length;
    return clampScore((available / params.source.signalKeys.length) * 100);
  }
  const recentEvents = params.rawEvents.filter((event) => event.sourceId === params.source.id && isWithinHours(event.timestamp, 24)).length;
  const recentMetrics = params.rawMetrics.filter((metric) => metric.sourceId === params.source.id && isWithinHours(metric.timestamp, 24)).length;
  if (recentEvents || recentMetrics) return 100;
  if (params.health?.status === "success") return 60;
  if (params.health?.status === "degraded") return 35;
  return 0;
}

function isWithinHours(timestamp: string | null | undefined, hours: number) {
  if (!timestamp) return false;
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return false;
  return Date.now() - parsed <= hours * 60 * 60 * 1000;
}

function confidenceQuality(score: number | null | undefined) {
  if (score === null || score === undefined || !Number.isFinite(score)) return "ناموجود";
  if (score >= 75) return "قوی";
  if (score >= 58) return "متوسط";
  if (score >= 38) return "محدود";
  return "ضعیف";
}

function engineStatus(inputCoveragePercent: number, confidence: number | null | undefined): AdminSourceStatus {
  if (inputCoveragePercent < 35 || confidence === null || confidence === undefined) return "disconnected";
  if (inputCoveragePercent < 70 || confidence < 55) return "degraded";
  return "connected";
}

function buildDataSources(params: {
  health: SourceHealthSnapshot[];
  rawEvents: RawEventInput[];
  rawMetrics: RawMetricInput[];
  signals: ReturnType<typeof getSignalSnapshot>["byKey"];
}): DataSourceHealthRow[] {
  const healthById = new Map(params.health.map((item) => [item.sourceId, item]));
  return productionSources.map((source) => {
    const health = healthById.get(source.id);
    const sourceFreshness = resolveSourceFreshness(source, health);
    const fredEvidence = fredSourceEvidence({ source, health, rawMetrics: params.rawMetrics, signals: params.signals });
    const status = fredEvidence?.status ?? sourceStatus(source, health);
    const coveragePercent = fredEvidence?.coveragePercent ?? sourceCoverage({ source, health, rawEvents: params.rawEvents, rawMetrics: params.rawMetrics, signals: params.signals });
    const freshnessMinutes = fredEvidence?.freshnessMinutes ?? sourceFreshness.ageMinutes;
    const effectiveFreshness = fredEvidence?.lastSuccessfulUpdate
      ? resolveSourceFreshness(source, {
          ...(health ?? {
            sourceId: source.id,
            sourceName: source.name,
            status: "success",
            tier: source.tier,
            latencyMs: 0,
            freshnessMinutes: null,
            errorRate: 0,
            consecutiveFailures: 0,
            lastSuccessAt: null,
            lastFailureAt: null,
            updatedAt: fredEvidence.lastSuccessfulUpdate,
          }),
          lastSuccessAt: fredEvidence.lastSuccessfulUpdate,
        })
      : sourceFreshness;
    const missingEnvKeys = (source.requiredEnvKeys ?? []).filter((key) => !process.env[key]);
    const warningFa =
      fredEvidence
        ? fredEvidence.warningFa
        : !source.enabled
        ? missingEnvKeys.length
          ? `کلید API تنظیم نشده است: ${missingEnvKeys.join(", ")}`
          : source.disabledReason ?? "این منبع در تنظیمات فعلی غیرفعال است."
        : !health
          ? "برای این منبع هنوز اجرای موفق یا health snapshot ثبت نشده است."
          : health.status === "api_key_missing"
            ? "کلید API این منبع تنظیم نشده است."
            : health.lastError
              ? health.lastError
              : sourceFreshness.warningFa
                ? sourceFreshness.warningFa
                : null;

    return {
      sourceId: source.id,
      sourceName: source.name,
      sourceType: source.sourceType,
      category: source.category,
      tier: source.tier,
      accessModel: source.accessModel ?? "نامشخص",
      enabled: source.enabled,
      status,
      lastSuccessfulUpdate: fredEvidence?.lastSuccessfulUpdate ?? health?.lastSuccessAt ?? null,
      lastError: fredEvidence ? fredEvidence.lastError : isMisattributedFredBundleError(health?.lastError) ? null : health?.lastError ?? null,
      responseTimeMs: fredEvidence?.responseTimeMs ?? health?.latencyMs ?? null,
      freshnessMinutes,
      freshnessState: effectiveFreshness.state,
      expectedIntervalMinutes: effectiveFreshness.expectedIntervalMinutes,
      coveragePercent,
      warningFa,
    };
  });
}

function buildMarketCoverage(signals: ReturnType<typeof getSignalSnapshot>["byKey"]): MarketCoverageRow[] {
  return (["BTC", "ETH", "SOL", "USDT"] as IntelligenceAssetSymbol[]).map((asset) => {
    const metrics = marketCoverageMap[asset].map((definition) => {
      const signal = firstSignal(definition.signalKeys, signals);
      const signalFreshness = signal ? resolveSignalFreshness(signal) : null;
      return {
        key: definition.key,
        labelFa: definition.labelFa,
        status: metricStatus(definition.signalKeys, signals),
        source: signal?.source ?? null,
        freshnessMinutes: signalFreshness?.ageMinutes ?? null,
        value: signal?.value ?? null,
      };
    });
    const available = metrics.filter((metric) => metric.status !== "missing").length;
    return {
      asset,
      metrics,
      coveragePercent: clampScore((available / Math.max(1, metrics.length)) * 100),
    };
  });
}

function buildNewsSources(rawEvents: RawEventInput[], health: SourceHealthSnapshot[]): NewsSourceHealthRow[] {
  const healthById = new Map(health.map((item) => [item.sourceId, item]));
  const newsSources = productionSources.filter((source) =>
    source.sourceType === "rss" || ["financial_media", "crypto_media", "central_banks", "economic_data", "geopolitics"].includes(source.category),
  );

  return newsSources.map((source) => {
    const healthSnapshot = healthById.get(source.id);
    const articles24h = rawEvents.filter((event) => event.sourceId === source.id && isWithinHours(event.timestamp, 24)).length;
    const coverageScore =
      articles24h > 0
        ? 100
        : healthSnapshot?.status === "success"
          ? 65
          : healthSnapshot?.status === "degraded"
            ? 35
            : 0;

    return {
      sourceId: source.id,
      sourceName: source.name,
      sourceType: source.sourceType,
      category: source.category,
      articles24h,
      lastSuccessfulFetch: healthSnapshot?.lastSuccessAt ?? null,
      lastFailedFetch: healthSnapshot?.lastFailureAt ?? null,
      coverageScore,
      lastError: healthSnapshot?.lastError ?? null,
    };
  });
}

function buildMetricRows(
  definitions: Array<{ metric: string; signalKeys: string[] }>,
  signals: ReturnType<typeof getSignalSnapshot>["byKey"],
): MacroMetricRow[] {
  return definitions.map((definition) => {
    const signal = firstSignal(definition.signalKeys, signals);
    const signalFreshness = signal ? resolveSignalFreshness(signal) : null;
    return {
      metric: definition.metric,
      latestValue: signal?.value ?? null,
      source: signal?.source ?? null,
      timestamp: signal?.timestamp ?? null,
      freshnessMinutes: signalFreshness?.ageMinutes ?? null,
      status: metricStatus(definition.signalKeys, signals),
    };
  });
}

function buildEtfIntelligenceHealth(
  records: Awaited<ReturnType<typeof getLatestEtfDailyFlows>>,
  health: SourceHealthSnapshot[],
): EtfIntelligenceHealthRow[] {
  const healthById = new Map(health.map((item) => [item.sourceId, item]));
  return (["BTC", "ETH"] as const).map((asset) => {
    const sourceId = asset === "BTC" ? "farside-btc-etf-flows" : "farside-eth-etf-flows";
    const sourceHealth = healthById.get(sourceId);
    const parsedRows = parsedRowsFromEtfDailyFlowRecords(records.filter((record) => record.asset === asset));
    const latest = parsedRows[0] ?? null;
    const freshnessStatus = freshnessFromLatestEtfDate(latest?.date ?? null);
    const fallbackUsed = latest?.source.includes("The Block") ?? false;
    const status: AdminSourceStatus =
      !latest || latest.totalUsdMillion === null
        ? sourceHealth?.status === "failed"
          ? "disconnected"
          : "degraded"
        : fallbackUsed || sourceHealth?.status === "degraded"
          ? "degraded"
          : "connected";

    return {
      asset,
      sourceName: latest?.source ?? (asset === "BTC" ? "Farside BTC ETF flows" : "Farside ETH ETF flows"),
      status,
      lastSuccessfulFetch: latest?.fetchedAt ?? sourceHealth?.lastSuccessAt ?? null,
      parsedRowsCount: parsedRows.length,
      latestEtfDate: latest?.date ?? null,
      latestTotalFlowUsdMillion: latest?.totalUsdMillion ?? null,
      freshnessMinutes: minutesSince(latest?.fetchedAt ?? sourceHealth?.lastSuccessAt),
      freshnessStatus,
      sourceUrl: latest?.sourceUrl ?? null,
      error: fallbackUsed ? "Farside primary unavailable; real ETF data came from The Block public JSON fallback." : sourceHealth?.lastError ?? null,
    };
  });
}

function signalCoverage(keys: string[], signals: ReturnType<typeof getSignalSnapshot>["byKey"]) {
  const available = keys.filter((key) => isSignalAvailable(key, signals)).length;
  return clampScore((available / Math.max(1, keys.length)) * 100);
}

function missingSignals(keys: string[], signals: ReturnType<typeof getSignalSnapshot>["byKey"]) {
  return keys.filter((key) => !isSignalAvailable(key, signals));
}

function buildEngineHealth(signals: ReturnType<typeof getSignalSnapshot>["byKey"]): EngineHealthRow[] {
  const liquidity = getLiquidityReport();
  const correlations = getDynamicCorrelationReport();
  const regime = getMarketRegimeReport();
  const sentiment = getSentimentReport();
  const sentimentConfidenceScore = sentiment.confidence.score;

  const correlationCoverage = correlations.correlationCoverage ?? (correlations.requiredPairs ? clampScore((correlations.validPairs / correlations.requiredPairs) * 100) : 0);
  const correlationConfidence = correlations.engineConfidence;
  const sentimentCoverage = sentiment.highImpactHeadlines.length ? 100 : signalCoverage(sentimentInputs.slice(2), signals);

  const rows: EngineHealthRow[] = [
    {
      engineName: "Liquidity Engine",
      status: engineStatus(signalCoverage(liquidityInputs, signals), liquidity.confidence),
      lastRun: liquidity.lastUpdatedAt,
      inputCoveragePercent: signalCoverage(liquidityInputs, signals),
      confidenceQuality: confidenceQuality(liquidity.confidence),
      engineScore: liquidity.liquidityHealthScore ?? liquidity.liquidityScoreSigned,
      missingInputs: liquidity.missingInputs?.length ? liquidity.missingInputs : missingSignals(liquidityInputs, signals),
      warningFa: liquidity.warnings?.join(" | ") ?? null,
    },
    {
      engineName: "Correlation Engine",
      status: correlations.validPairs >= 6 ? "connected" : correlations.validPairs >= 3 ? "degraded" : "disconnected",
      lastRun: correlations.lastUpdatedAt,
      inputCoveragePercent: correlationCoverage,
      confidenceQuality: confidenceQuality(correlationConfidence),
      engineScore: correlations.engineScore,
      missingInputs: correlations.signals.filter((signal) => signal.status !== "available").map((signal) => signal.assetPair),
      warningFa: correlations.validPairs < 6 ? `Correlation Engine: ${correlations.engineReason}` : null,
    },
    {
      engineName: "Regime Engine",
      status: engineStatus(signalCoverage(regimeInputs, signals), regime.confidence),
      lastRun: regime.engine.lastUpdatedAt,
      inputCoveragePercent: signalCoverage(regimeInputs, signals),
      confidenceQuality: confidenceQuality(regime.confidence),
      engineScore: regime.engine.finalRegimeScore ?? regime.confidence,
      missingInputs: regime.engine.missingInputs?.length ? regime.engine.missingInputs : missingSignals(regimeInputs, signals),
      warningFa: regime.invalidationSignals?.join(" | ") ?? null,
    },
    {
      engineName: "Sentiment Engine",
      status: engineStatus(sentimentCoverage, sentimentConfidenceScore),
      lastRun: sentiment.lastUpdatedAt,
      inputCoveragePercent: sentimentCoverage,
      confidenceQuality: confidenceQuality(sentimentConfidenceScore),
      engineScore: sentiment.sentimentScore,
      missingInputs: sentiment.highImpactHeadlines.length ? [] : ["normalized_events"],
      warningFa: sentiment.whatChanged,
    },
  ];

  return rows;
}

function adminStatusFromLiquidity(status: "connected" | "degraded" | "missing"): AdminSourceStatus {
  if (status === "connected") return "connected";
  if (status === "degraded") return "degraded";
  return "disconnected";
}

function buildLiquidityIntelligenceHealth(): LiquidityIntelligenceHealthRow[] {
  const stack = getLiquidityIntelligenceStack();
  const contributionByEngine = new Map(stack.contributions.map((item) => [item.engineId, item]));
  return stack.engines.map((engine) => {
    const contribution = contributionByEngine.get(engine.id);
    return {
      engineId: engine.id,
      engineName: engine.labelFa,
      status: adminStatusFromLiquidity(engine.status),
      score: engine.score,
      coverage: engine.coverage,
      confidence: engine.confidence,
      freshness: engine.freshness,
      missingInputs: engine.missingInputs,
      sourceCount: engine.sourceCount,
      lastUpdate: engine.lastUpdated,
      contribution: contribution?.contribution ?? null,
      redistributedWeight: contribution?.redistributedWeight ?? 0,
      explanationFa: engine.explanationFa,
    };
  });
}

function buildAlertAudit(): AlertAuditRow[] {
  return generateSmartAlerts().map((alert) => {
    const dataSourcesUsed = [...new Set((alert.dataUsed ?? []).map((item) => `${item.label}: ${item.source}`))];
    const indicatorCount = (alert.dataUsed ?? []).filter((item) => item.status === "available").length;
    const missingInputs = alert.missingSignals ?? alert.missingCriticalInputs ?? (alert.dataUsed ?? []).filter((item) => item.status !== "available").map((item) => item.label);
    return {
      alertId: alert.id,
      alertName: alert.titleFa,
      dataSourcesUsed: dataSourcesUsed.length ? dataSourcesUsed : [...new Set([...(alert.evidence ?? []), ...alert.monitoringFa].filter(Boolean))],
      indicatorCount,
      confidence: Number.isFinite(alert.confidence) ? alert.confidence : null,
      missingInputs,
      dataCoveragePercent: alert.dataCoveragePercent ?? null,
      supportingSignals: alert.supportingSignals ?? [],
      invalidationCondition: alert.invalidationCondition ?? null,
      alertQualityScore: alert.alertQualityScore ?? null,
      riskLevel: alert.priority ?? alert.level,
      flagged: indicatorCount < 3 || (alert.dataCoveragePercent ?? 100) < 50,
      explanationFa: alert.confidenceCapReason ? `${alert.causalChain ?? alert.reasoningFa} ${alert.confidenceCapReason}` : alert.causalChain ?? alert.reasoningFa,
    };
  });
}

function buildApiLogs(logs: IngestionLogEntry[]): ApiLogRow[] {
  const sourceById = new Map(productionSources.map((source) => [source.id, source]));
  return logs.slice(0, 100).map((log) => {
    const source = sourceById.get(log.sourceId);
    const endpoint =
      source?.endpoint ??
      (source?.parser === "market_signals" ? "C.M.I.P internal adapter bundle" : source?.requiredEnvKeys?.length ? "API endpoint disabled until key is configured" : null);
    const primaryUnavailable = !source?.endpoint && source?.parser !== "market_signals";
    const misattributedFredBundleError = log.sourceId === "fred-api" && isMisattributedFredBundleError(log.error ?? log.message);
    const status = primaryUnavailable && log.status === "success" ? "failed" : misattributedFredBundleError ? "degraded" : log.status;
    const errorMessage =
      misattributedFredBundleError
        ? "این خطا مربوط به Internal Adapter Bundle بود و برای FRED در نظر گرفته نمی‌شود؛ وضعیت FRED از سری‌های خودش محاسبه می‌شود."
        : log.error ??
      (log.status === "api_key_missing"
        ? `Missing required env keys: ${(source?.requiredEnvKeys ?? []).filter((key) => !process.env[key]).join(", ")}`
        : log.status === "failed" || primaryUnavailable
          ? log.message
          : log.status === "degraded"
            ? log.message || "Primary source degraded; fallback or partial adapter output was used."
            : null);
    return {
      sourceName: log.sourceName,
      endpoint,
      status,
      statusLabel:
        status === "success"
          ? "Success"
          : status === "degraded"
            ? "Degraded"
            : status === "api_key_missing"
              ? "Missing Key"
              : status === "disabled"
                ? "Disabled"
                : "Fail",
      latencyMs: log.latencyMs,
      timestamp: log.createdAt,
      errorMessage,
    };
  });
}

function buildScores(params: {
  dataSources: DataSourceHealthRow[];
  marketCoverage: MarketCoverageRow[];
  engineHealth: EngineHealthRow[];
  scheduler: SchedulerDashboard;
  integrity: IntegrityDashboardReport;
}) {
  const enabled = params.dataSources.filter((source) => source.enabled);
  const scoredSources = enabled.filter((source) => source.tier === 1 && !/optional|premium|api_key_optional|paid/i.test(source.accessModel));
  const sourceCounts = summarizeSourceHealthCounts(params.dataSources);
  const scoringBase = scoredSources.length ? scoredSources : enabled;
  const connected = scoredSources.filter((source) => source.status === "connected").length;
  const sourceReliabilityScore = scoringBase.length ? clampScore((connected / scoringBase.length) * 100) : 0;
  const freshnessScores = scoringBase.map((source) => freshnessScoreFromState(source.freshnessState ?? "obsolete"));
  const freshnessScore = clampScore(average(freshnessScores));
  const coverageScore = clampScore(average([
    average(params.marketCoverage.map((item) => item.coveragePercent)),
    average(enabled.map((source) => source.coveragePercent)),
  ]));
  const enginesHealthy = params.engineHealth.filter((engine) => engine.status === "connected").length;
  const engineReliabilityScore = params.engineHealth.length ? clampScore((enginesHealthy / params.engineHealth.length) * 100) : 0;
  const coreEngineBelowHalf = params.engineHealth.some((engine) => engine.inputCoveragePercent < 50);
  const analyticsQualityScore = clampScore(average([
    engineReliabilityScore,
    average(params.engineHealth.map((engine) => engine.inputCoveragePercent)),
    average(params.engineHealth.map((engine) => (engine.confidenceQuality === "قوی" ? 90 : engine.confidenceQuality === "متوسط" ? 68 : engine.confidenceQuality === "محدود" ? 45 : engine.confidenceQuality === "ضعیف" ? 28 : 20))),
  ]));
  const overallPlatformHealthScore = calculateOverallPlatformHealthScore({
    analyticsQualityScore,
    operationalReliabilityScore: params.scheduler.operationalReliabilityScore,
    coverageScore,
    schedulerReliabilityScore: params.scheduler.operationalReliabilityScore,
    hasCoreEngineCoverageBelowHalf: coreEngineBelowHalf,
  });
  const marketReliabilityScore = clampScore(
    freshnessScore * 0.4 + coverageScore * 0.3 + sourceReliabilityScore * 0.2 + params.scheduler.operationalReliabilityScore * 0.1,
  );
  const fusionStage = params.scheduler.stages.find((stage) => stage.stageId === "fusion");
  const fusionHealthScore =
    fusionStage?.status === "success"
      ? 100
      : fusionStage?.status === "success_with_limited_confidence"
        ? 85
        : fusionStage?.status === "degraded"
          ? 60
          : fusionStage?.status === "failed"
            ? 0
            : engineReliabilityScore;
  const confidenceConsistencyScore = clampScore(
    100 - params.integrity.confidenceViolations.length * 15 - params.integrity.consistencyViolations.length * 10,
  );
  const productionReadinessScore = clampScore(
    params.scheduler.operationalReliabilityScore * 0.3 +
      freshnessScore * 0.25 +
      fusionHealthScore * 0.2 +
      sourceReliabilityScore * 0.15 +
      confidenceConsistencyScore * 0.1,
  );

  return {
    sourceReliabilityScore,
    freshnessScore,
    coverageScore,
    analyticsQualityScore,
    operationalReliabilityScore: params.scheduler.operationalReliabilityScore,
    marketReliabilityScore,
    engineReliabilityScore,
    overallPlatformHealthScore,
    productionReadinessScore,
    fusionHealthScore,
    confidenceConsistencyScore,
    dataCoveragePercent: coverageScore,
    connectedSources: connected,
    totalSources: enabled.length,
    ...sourceCounts,
    enginesHealthy,
    totalEngines: params.engineHealth.length,
  };
}

export function summarizeSourceHealthCounts(dataSources: DataSourceHealthRow[]) {
  const enabled = dataSources.filter((source) => source.enabled);
  const criticalCore = dataSources.filter(sourceIsCriticalCore);
  const optionalPremium = dataSources.filter((source) =>
    /optional|premium|api_key_optional|paid/i.test(source.accessModel) || source.tier >= 3,
  );
  return {
    criticalCoreConnectedSources: criticalCore.filter((source) => source.status === "connected").length,
    criticalCoreTotalSources: criticalCore.length,
    allActiveConnectedSources: enabled.filter((source) => source.status === "connected").length,
    allActiveTotalSources: enabled.length,
    optionalPremiumActiveSources: optionalPremium.filter((source) => source.enabled && source.status === "connected").length,
    optionalPremiumTotalSources: optionalPremium.length,
    degradedSources: enabled.filter((source) => source.status === "degraded").length,
    staleSources: enabled.filter((source) => sourceCountsAgainstGlobalFreshness(source) && (source.freshnessState === "stale" || source.freshnessState === "obsolete")).length,
    disabledSources: dataSources.filter((source) => !source.enabled).length,
  };
}

function sourceCountsAgainstGlobalFreshness(source: DataSourceHealthRow) {
  return sourceIsCriticalCore(source) && source.status !== "disconnected";
}

function sourceIsCriticalCore(source: DataSourceHealthRow) {
  return source.enabled && source.tier === 1 && !/optional|premium|api_key_optional|paid/i.test(source.accessModel);
}

function schedulerRecencyScore(timestamp: string | null) {
  if (!timestamp) return 0;
  const ageMinutes = Math.max(0, Math.round((Date.now() - Date.parse(timestamp)) / 60_000));
  if (!Number.isFinite(ageMinutes)) return 0;
  if (ageMinutes <= 35) return 100;
  if (ageMinutes <= 70) return 75;
  if (ageMinutes <= 180) return 45;
  return 20;
}

function buildSchedulerDashboard(runs: Awaited<ReturnType<typeof getLatestSchedulerRuns>>): SchedulerDashboard {
  const latest = runs[0] ?? null;
  const recentRuns = runs.slice(0, 48);
  const externalProductionRuns = recentRuns.filter((run) => run.schedulerSource === "external_cron_job_org" && run.executionEnvironment === "production").length;
  const localManualRuns = recentRuns.filter((run) => run.trigger === "manual_http" || run.schedulerSource === "manual_http" || run.executionEnvironment === "local" || run.executionEnvironment === "development").length;
  const failedProductionRuns = recentRuns.filter((run) => run.executionEnvironment === "production" && (run.status === "failed" || Boolean(run.failedStage))).length;
  const historicalSuccessRate = recentRuns.length
    ? average(recentRuns.map((run) => (run.status === "success" ? 100 : run.status === "success_with_limited_confidence" ? 90 : run.status === "degraded" ? 70 : run.status === "skipped" ? 35 : 0)))
    : 0;
  const latestStageSuccessRate = latest?.stages.length
    ? average(latest.stages.map((stage) => (stage.status === "success" ? 100 : stage.status === "success_with_limited_confidence" ? 85 : stage.status === "degraded" ? 70 : stage.status === "skipped" ? 35 : 0)))
    : 0;
  const stalePenalty = Math.min(12, latest?.staleSignals ?? 0);
  const operationalReliabilityScore = clampScore(
    latestStageSuccessRate * 0.52 + historicalSuccessRate * 0.18 + schedulerRecencyScore(latest?.finishedAt ?? null) * 0.2 + (latest ? Math.max(0, 100 - latest.retryCount * 8) : 0) * 0.1 - stalePenalty,
  );
  const simulation = simulateSchedulerCycles(12, latest);

  return {
    lastRun: latest?.finishedAt ?? null,
    nextRun: latest?.nextRunAt ?? null,
    trigger: latest?.trigger ?? null,
    schedulerSource: latest?.schedulerSource ?? null,
    executionEnvironment: latest?.executionEnvironment ?? null,
    storageMode: latest?.storageMode ?? null,
    externalProductionRuns,
    localManualRuns,
    failedProductionRuns,
    durationMs: latest?.durationMs ?? null,
    successRate: clampScore(historicalSuccessRate),
    failedStage: latest?.failedStage ?? null,
    retryCount: latest?.retryCount ?? 0,
    operationalReliabilityScore,
    status: latest?.status ?? "skipped",
    staleSignals: latest?.staleSignals ?? 0,
    stages:
      latest?.stages.map((stage) => ({
        stageId: stage.stageId,
        label: stage.label,
        status: stage.status,
        durationMs: stage.durationMs,
        failedSources: stage.failedSources,
        degradedSources: stage.degradedSources,
        deadLetters: stage.deadLetters,
        retryCount: stage.retryCount,
        details: stage.details,
        error: stage.error ?? null,
      })) ?? [],
    simulation,
  };
}

function buildCorrelationTable(): CorrelationHealthRow[] {
  return getDynamicCorrelationReport().correlationTable.map((row) => ({
    pair: row.pair,
    correlation24h: row.correlation24h,
    correlation7d: row.correlation7d,
    correlation30d: row.correlation30d,
    correlation90d: row.correlation90d,
    volatilityAdjusted30d: row.volatilityAdjusted30d,
    beta30d: row.beta30d,
    stabilityScore: row.stabilityScore,
    structuralBreak: row.structuralBreak,
    regimeChannel: row.regimeChannel,
    narrativeAllowed: row.narrativeAllowed,
    statisticalStrength: row.statisticalStrength,
    leadLag: row.leadLag,
    observations24h: row.observations["24h"],
    observations7d: row.observations["7d"],
    observations30d: row.observations["30d"],
    observations90d: row.observations["90d"],
    windowIntegrity: row.windowIntegrity,
    source: row.source,
    status: row.status,
    confidence: row.confidence,
    coveragePercent: row.coveragePercent,
  }));
}

function successRateForReports(reports: StorageWriteReport[], operation: "read" | "write") {
  const scoped = reports.filter((report) => (report.operation ?? "write") === operation && report.status !== "skipped");
  if (!scoped.length) return 0;
  return clampScore((scoped.filter((report) => report.status === "success").length / scoped.length) * 100);
}

function asNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function asSupabaseStatus(value: unknown): StorageDiagnostics["supabaseStatus"] {
  return value === "connected" || value === "degraded" || value === "disconnected" ? value : "disconnected";
}

function asStorageWriteReport(value: unknown): StorageWriteReport | null {
  if (!value || typeof value !== "object") return null;
  const report = value as Partial<StorageWriteReport>;
  if (typeof report.table !== "string" || typeof report.status !== "string" || typeof report.storageMode !== "string" || typeof report.attemptedAt !== "string") {
    return null;
  }
  return report as StorageWriteReport;
}

function storageDiagnosticsFromSnapshot(snapshot: DataHealthSnapshotDbRow | undefined, schedulerStorageMode: string | null): StorageDiagnostics | null {
  if (!snapshot) return null;
  const diagnostics = snapshot.storage_diagnostics ?? {};
  return {
    storageMode: String(diagnostics.storageMode ?? snapshot.storage_mode ?? schedulerStorageMode ?? "supabase"),
    supabaseStatus: asSupabaseStatus(diagnostics.supabaseStatus),
    readSuccessRate: asNumber(diagnostics.readSuccessRate),
    writeSuccessRate: asNumber(diagnostics.writeSuccessRate),
    timeoutCount: asNumber(diagnostics.timeoutCount),
    fallbackCount: asNumber(diagnostics.fallbackCount),
    slowQueryCount: asNumber(diagnostics.slowQueryCount),
    averageQueryDurationMs: asNumber(diagnostics.averageQueryDurationMs),
    lastStorageFailure: asStorageWriteReport(diagnostics.lastStorageFailure),
    affectedTables: asStringArray(diagnostics.affectedTables),
  };
}

function buildStorageDiagnostics(reports: StorageWriteReport[], schedulerStorageMode: string | null): StorageDiagnostics {
  const failed = reports.filter((report) => report.status === "failed");
  const fallback = reports.filter((report) => report.fallbackUsed || report.storageMode === "local_fallback" || report.storageMode === "degraded_supabase_fallback");
  const timeout = reports.filter((report) => /timed out|timeout/i.test(report.error ?? ""));
  const slow = reports.filter((report) => report.slowQuery);
  const durations = reports.map((report) => report.durationMs).filter((duration): duration is number => typeof duration === "number");
  const lastStorageFailure = failed
    .slice()
    .sort((left, right) => Date.parse(right.attemptedAt) - Date.parse(left.attemptedAt))[0] ?? null;
  const affectedTables = Array.from(new Set([...failed, ...fallback, ...slow].map((report) => report.table))).sort();
  const supabaseStatus: StorageDiagnostics["supabaseStatus"] =
    reports.some((report) => report.storageMode === "supabase" && report.status === "success")
      ? fallback.length || failed.length
        ? "degraded"
        : "connected"
      : "disconnected";

  return {
    storageMode: fallback.some((report) => report.storageMode === "degraded_supabase_fallback")
      ? "degraded_supabase_fallback"
      : schedulerStorageMode ?? (supabaseStatus === "connected" ? "supabase" : "local_fallback"),
    supabaseStatus,
    readSuccessRate: successRateForReports(reports, "read"),
    writeSuccessRate: successRateForReports(reports, "write"),
    timeoutCount: timeout.length,
    fallbackCount: fallback.length,
    slowQueryCount: slow.length,
    averageQueryDurationMs: Math.round(average(durations)),
    lastStorageFailure,
    affectedTables,
  };
}

export function calculateOverallPlatformHealthScore(params: {
  analyticsQualityScore: number;
  operationalReliabilityScore: number;
  coverageScore: number;
  schedulerReliabilityScore: number;
  hasCoreEngineCoverageBelowHalf?: boolean;
}) {
  const rawOverall = clampScore(
    params.analyticsQualityScore * 0.5 + params.operationalReliabilityScore * 0.3 + params.coverageScore * 0.2,
  );
  return clampScore(
    Math.min(
      rawOverall,
      params.schedulerReliabilityScore < 50 ? 65 : params.schedulerReliabilityScore < 70 ? 75 : 100,
      params.hasCoreEngineCoverageBelowHalf ? 60 : 100,
    ),
  );
}

function buildDebugPayload(params: {
  rawEvents: RawEventInput[];
  rawMetrics: RawMetricInput[];
  logs: IngestionLogEntry[];
}) {
  const signalSnapshot = getSignalSnapshot();
  const derived = getDerivedSignalReport();
  return {
    rawApiResponses: [
      ...params.rawEvents.slice(0, 12).map((event) => ({
        sourceId: event.sourceId,
        sourceName: event.sourceName,
        titleOrMetric: event.title,
        rawPayload: event.rawPayload ?? null,
        timestamp: event.timestamp,
      })),
      ...params.rawMetrics.slice(0, 12).map((metric) => ({
        sourceId: metric.sourceId,
        sourceName: metric.sourceName,
        titleOrMetric: metric.metric,
        rawPayload: metric.rawPayload ?? null,
        timestamp: metric.timestamp,
      })),
    ],
    mappedFields: signalSnapshot.signals.slice(0, 40).map((signal) => ({
      sourceId: signal.id ?? signal.key,
      sourceName: signal.source,
      field: signal.key,
      value: signal.value,
      quality: signal.quality,
    })),
    transformationPipeline: [
      "collector output",
      "raw_events / raw_metrics persistence",
      "normalization and deterministic classification",
      "derived/proxy signal calculation",
      "reliability and engine health scoring",
      "dashboard/admin rendering",
    ],
    finalEngineInput: {
      signalKeys: signalSnapshot.signals.map((signal) => signal.key),
      derivedSignals: derived.signals.map((signal) => ({
        signalKey: signal.signalKey,
        sourceType: signal.sourceType,
        score: signal.score,
        confidence: signal.confidence,
        missingInputs: signal.missingInputs,
      })),
      lastLogs: params.logs.slice(0, 8),
    },
  };
}

export async function getDataHealthDashboard(): Promise<DataHealthDashboard> {
  const [sourceHealth, rawEvents, rawMetrics, etfDailyFlows, logs, deadLetters, lastIngestionRun, schedulerRuns, dataHealthSnapshots] = await Promise.all([
    getLatestSourceHealth(),
    getLatestRawEvents(100),
    getLatestRawMetrics(100),
    getLatestEtfDailyFlows(1_200),
    getLatestIngestionLogs(100),
    getLatestDeadLetters(100),
    getLatestIngestionRun(),
    getLatestSchedulerRuns(48),
    getLatestDataHealthSnapshots(5),
  ]);
  await hydrateMarketSnapshotsFromSupabase();

  const signalSnapshot = getSignalSnapshot();
  const dataSources = buildDataSources({ health: sourceHealth, rawEvents, rawMetrics, signals: signalSnapshot.byKey });
  const adapterBundleBreakdown = buildAdapterBundleBreakdown(signalSnapshot.signals);
  const marketCoverage = buildMarketCoverage(signalSnapshot.byKey);
  const newsSources = buildNewsSources(rawEvents, sourceHealth);
  const macroData = buildMetricRows(macroMetricMap, signalSnapshot.byKey);
  const fredSeriesBreakdown = buildFredSeriesBreakdown(signalSnapshot.byKey, rawMetrics);
  const stablecoinData = buildMetricRows(stablecoinMetricMap, signalSnapshot.byKey);
  const etfIntelligence = buildEtfIntelligenceHealth(etfDailyFlows, sourceHealth);
  const engineHealth = buildEngineHealth(signalSnapshot.byKey);
  const liquidityIntelligenceHealth = buildLiquidityIntelligenceHealth();
  const alertAudit = buildAlertAudit();
  const integrity = getIntelligenceIntegrityReport({ alerts: generateSmartAlerts() });
  const apiLogs = buildApiLogs(logs);
  const correlationTable = buildCorrelationTable();
  const scheduler = buildSchedulerDashboard(schedulerRuns);
  const scores = buildScores({ dataSources, marketCoverage, engineHealth, scheduler, integrity });
  const storageReports = getLatestStorageWriteReportsSync(120);
  const storageDiagnostics = storageReports.length
    ? buildStorageDiagnostics(storageReports, scheduler.storageMode)
    : storageDiagnosticsFromSnapshot(dataHealthSnapshots[0], scheduler.storageMode) ?? buildStorageDiagnostics(storageReports, scheduler.storageMode);
  const storageWriteFailures = storageReports.filter((report) => report.status === "failed");
  const latestRunDeadLetters = deadLetters.filter(
    (letter) =>
      (!lastIngestionRun?.runId || letter.runId === lastIngestionRun.runId) &&
      !(letter.sourceId === "fred-api" && isMisattributedFredBundleError(letter.error)),
  );

  return {
    generatedAt: new Date().toISOString(),
    lastIngestionRun,
    dataSources,
    adapterBundleBreakdown,
    marketCoverage,
    newsSources,
    macroData,
    fredSeriesBreakdown,
    stablecoinData,
    etfIntelligence,
    engineHealth,
    liquidityIntelligenceHealth,
    integrity,
    alertAudit,
    apiLogs,
    correlationTable,
    scheduler,
    storageDiagnostics,
    scores,
    failures: {
      failedSources: dataSources.filter((source) => source.status === "disconnected" && source.enabled),
      staleSources: dataSources.filter(
        (source) => sourceCountsAgainstGlobalFreshness(source) && (source.freshnessState === "stale" || source.freshnessState === "obsolete"),
      ),
      missingApiKeySources: dataSources.filter((source) => /api key|کلید API/i.test(source.warningFa ?? "")),
      deadLetters: latestRunDeadLetters,
      storageWriteFailures,
    },
    debug: buildDebugPayload({ rawEvents, rawMetrics, logs }),
  };
}
