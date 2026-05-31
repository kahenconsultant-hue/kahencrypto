import { productionSources } from "@/collectors/registry";
import type { DataQuality, IntelligenceAssetSymbol } from "@/lib/types";
import { getDynamicCorrelationReport } from "@/server/analytics/correlation-engine";
import { getDerivedSignalReport } from "@/server/analytics/derived-signal-engine";
import { getLiquidityReport } from "@/server/analytics/liquidity-engine";
import { getMarketRegimeReport } from "@/server/analytics/market-regime-engine";
import { getSignalSnapshot } from "@/server/analytics/market-signals";
import { getSentimentReport } from "@/server/analytics/sentiment-engine";
import { generateSmartAlerts } from "@/server/alerts/smart-alert-engine";
import { getIntelligenceReliabilityReportSync } from "@/server/intelligence/reliability-engine";
import {
  getLatestDeadLetters,
  getLatestIngestionLogs,
  getLatestIngestionRun,
  getLatestRawEvents,
  getLatestRawMetrics,
  getLatestSourceHealth,
  getLatestStorageWriteReportsSync,
} from "@/storage/ingestion-store";
import type {
  IngestionLogEntry,
  RawEventInput,
  RawMetricInput,
  SourceDefinition,
  SourceHealthSnapshot,
} from "@/types/ingestion";

export type AdminSourceStatus = "connected" | "degraded" | "disconnected";
export type MetricAvailability = "available" | "missing" | "estimated";

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

export interface AlertAuditRow {
  alertId: string;
  alertName: string;
  dataSourcesUsed: string[];
  indicatorCount: number;
  confidence: number | null;
  missingInputs: string[];
  riskLevel: string;
  flagged: boolean;
  explanationFa: string;
}

export interface ApiLogRow {
  sourceName: string;
  endpoint: string | null;
  success: boolean;
  latencyMs: number | null;
  timestamp: string;
  errorMessage: string | null;
}

export interface DataQualityScores {
  sourceReliabilityScore: number;
  freshnessScore: number;
  coverageScore: number;
  engineReliabilityScore: number;
  overallPlatformHealthScore: number;
  dataCoveragePercent: number;
  connectedSources: number;
  totalSources: number;
  enginesHealthy: number;
  totalEngines: number;
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
  marketCoverage: MarketCoverageRow[];
  newsSources: NewsSourceHealthRow[];
  macroData: MacroMetricRow[];
  stablecoinData: StablecoinMetricRow[];
  engineHealth: EngineHealthRow[];
  alertAudit: AlertAuditRow[];
  apiLogs: ApiLogRow[];
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

const stablecoinMetricMap = [
  { metric: "USDT Supply", signalKeys: ["usdt_supply_7d"] },
  { metric: "USDC Supply", signalKeys: ["usdc_supply_7d"] },
  { metric: "Stablecoin Dominance", signalKeys: ["stablecoin_dominance"] },
  { metric: "Exchange Inflows", signalKeys: ["stablecoin_exchange_inflows"] },
  { metric: "Exchange Outflows", signalKeys: ["stablecoin_exchange_outflows"] },
];

const liquidityInputs = [
  "dxy_trend_24h",
  "us10y_trend_24h",
  "stablecoin_market_cap_7d",
  "usdt_supply_7d",
  "usdc_supply_7d",
  "btc_etf_flow_24h",
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
  if (matched.some((signal) => signal.value !== null && signal.quality !== "unavailable")) return "available";
  return "missing";
}

function firstSignal(keys: string[], signals: ReturnType<typeof getSignalSnapshot>["byKey"]) {
  return keys.map((key) => signals[key]).find((signal) => signal && signal.value !== null && signal.quality !== "unavailable") ?? null;
}

function sourceStatus(source: SourceDefinition, health: SourceHealthSnapshot | undefined): AdminSourceStatus {
  if (!source.enabled || health?.status === "disabled") return "disconnected";
  if (!health) return "disconnected";
  if (health.status === "failed" || health.status === "api_key_missing") return "disconnected";
  const freshness = health.freshnessMinutes ?? minutesSince(health.lastSuccessAt);
  const expected = Math.max(45, Math.round(source.pollingIntervalSeconds / 60) * 2);
  if (health.status === "degraded" || (freshness !== null && freshness > expected)) return "degraded";
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
    const status = sourceStatus(source, health);
    const coveragePercent = sourceCoverage({ source, health, rawEvents: params.rawEvents, rawMetrics: params.rawMetrics, signals: params.signals });
    const freshnessMinutes = health?.freshnessMinutes ?? minutesSince(health?.lastSuccessAt);
    const expected = Math.max(45, Math.round(source.pollingIntervalSeconds / 60) * 2);
    const warningFa =
      !source.enabled
        ? source.disabledReason ?? "این منبع در تنظیمات فعلی غیرفعال است."
        : !health
          ? "برای این منبع هنوز اجرای موفق یا health snapshot ثبت نشده است."
          : health.status === "api_key_missing"
            ? "کلید API این منبع تنظیم نشده است."
            : health.lastError
              ? health.lastError
              : freshnessMinutes !== null && freshnessMinutes > expected
                ? `داده از بازه مورد انتظار عقب افتاده است؛ آخرین دریافت موفق ${freshnessMinutes} دقیقه پیش بود.`
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
      lastSuccessfulUpdate: health?.lastSuccessAt ?? null,
      lastError: health?.lastError ?? null,
      responseTimeMs: health?.latencyMs ?? null,
      freshnessMinutes,
      coveragePercent,
      warningFa,
    };
  });
}

function buildMarketCoverage(signals: ReturnType<typeof getSignalSnapshot>["byKey"]): MarketCoverageRow[] {
  return (["BTC", "ETH", "SOL", "USDT"] as IntelligenceAssetSymbol[]).map((asset) => {
    const metrics = marketCoverageMap[asset].map((definition) => {
      const signal = firstSignal(definition.signalKeys, signals);
      return {
        key: definition.key,
        labelFa: definition.labelFa,
        status: metricStatus(definition.signalKeys, signals),
        source: signal?.source ?? null,
        freshnessMinutes: minutesSince(signal?.timestamp),
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
    return {
      metric: definition.metric,
      latestValue: signal?.value ?? null,
      source: signal?.source ?? null,
      timestamp: signal?.timestamp ?? null,
      freshnessMinutes: minutesSince(signal?.timestamp),
      status: metricStatus(definition.signalKeys, signals),
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

  const validCorrelationSignals = correlations.signals.filter((signal) => signal.confidence !== null && signal.dataQuality !== "unavailable");
  const correlationCoverage = correlations.signals.length ? clampScore((validCorrelationSignals.length / correlations.signals.length) * 100) : 0;
  const correlationConfidence = validCorrelationSignals.length ? average(validCorrelationSignals.map((signal) => signal.confidence ?? 0)) : null;
  const sentimentCoverage = sentiment.highImpactHeadlines.length ? 100 : signalCoverage(sentimentInputs.slice(2), signals);

  const rows: EngineHealthRow[] = [
    {
      engineName: "Liquidity Engine",
      status: engineStatus(signalCoverage(liquidityInputs, signals), liquidity.confidence),
      lastRun: liquidity.lastUpdatedAt,
      inputCoveragePercent: signalCoverage(liquidityInputs, signals),
      confidenceQuality: confidenceQuality(liquidity.confidence),
      engineScore: liquidity.liquidityScoreSigned,
      missingInputs: liquidity.missingInputs?.length ? liquidity.missingInputs : missingSignals(liquidityInputs, signals),
      warningFa: liquidity.warnings?.join(" | ") ?? null,
    },
    {
      engineName: "Correlation Engine",
      status: engineStatus(correlationCoverage, correlationConfidence),
      lastRun: correlations.lastUpdatedAt,
      inputCoveragePercent: correlationCoverage,
      confidenceQuality: confidenceQuality(correlationConfidence),
      engineScore: correlations.breakdownAlerts.length,
      missingInputs: correlations.signals.filter((signal) => signal.confidence === null).map((signal) => signal.assetPair),
      warningFa: correlationCoverage < 50 ? "برای برخی جفت‌ها sample size یا سری بازده کافی وجود ندارد." : null,
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

function buildAlertAudit(): AlertAuditRow[] {
  return generateSmartAlerts().map((alert) => {
    const dataSourcesUsed = [...new Set([...(alert.evidence ?? []), ...alert.monitoringFa].filter(Boolean))];
    const indicatorCount = (alert.evidence ?? []).length;
    const missingInputs = dataSourcesUsed.filter((item) => /unavailable|missing|ناموجود|API|premium/i.test(item));
    return {
      alertId: alert.id,
      alertName: alert.titleFa,
      dataSourcesUsed,
      indicatorCount,
      confidence: Number.isFinite(alert.confidence) ? alert.confidence : null,
      missingInputs,
      riskLevel: alert.priority ?? alert.level,
      flagged: indicatorCount < 3,
      explanationFa: alert.causalChain ?? alert.reasoningFa,
    };
  });
}

function buildApiLogs(logs: IngestionLogEntry[]): ApiLogRow[] {
  const endpointBySource = new Map(productionSources.map((source) => [source.id, source.endpoint ?? null]));
  return logs.slice(0, 100).map((log) => ({
    sourceName: log.sourceName,
    endpoint: endpointBySource.get(log.sourceId) ?? null,
    success: log.status === "success" || log.status === "degraded",
    latencyMs: log.latencyMs,
    timestamp: log.createdAt,
    errorMessage: log.error ?? (log.status === "failed" || log.status === "api_key_missing" ? log.message : null),
  }));
}

function buildScores(params: {
  dataSources: DataSourceHealthRow[];
  marketCoverage: MarketCoverageRow[];
  engineHealth: EngineHealthRow[];
}) {
  const enabled = params.dataSources.filter((source) => source.enabled);
  const connected = enabled.filter((source) => source.status === "connected").length;
  const sourceReliabilityScore = enabled.length ? clampScore((connected / enabled.length) * 100) : 0;
  const freshnessScores = enabled.map((source) => {
    if (source.freshnessMinutes === null) return 0;
    if (source.freshnessMinutes <= 15) return 100;
    if (source.freshnessMinutes <= 45) return 80;
    if (source.freshnessMinutes <= 90) return 60;
    if (source.freshnessMinutes <= 180) return 35;
    return 10;
  });
  const freshnessScore = clampScore(average(freshnessScores));
  const coverageScore = clampScore(average([
    average(params.marketCoverage.map((item) => item.coveragePercent)),
    average(enabled.map((source) => source.coveragePercent)),
  ]));
  const enginesHealthy = params.engineHealth.filter((engine) => engine.status === "connected").length;
  const engineReliabilityScore = params.engineHealth.length ? clampScore((enginesHealthy / params.engineHealth.length) * 100) : 0;
  const overallPlatformHealthScore = clampScore(
    sourceReliabilityScore * 0.28 + freshnessScore * 0.22 + coverageScore * 0.26 + engineReliabilityScore * 0.24,
  );

  return {
    sourceReliabilityScore,
    freshnessScore,
    coverageScore,
    engineReliabilityScore,
    overallPlatformHealthScore,
    dataCoveragePercent: coverageScore,
    connectedSources: connected,
    totalSources: enabled.length,
    enginesHealthy,
    totalEngines: params.engineHealth.length,
  };
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
  const [sourceHealth, rawEvents, rawMetrics, logs, deadLetters, lastIngestionRun] = await Promise.all([
    getLatestSourceHealth(),
    getLatestRawEvents(500),
    getLatestRawMetrics(500),
    getLatestIngestionLogs(100),
    getLatestDeadLetters(100),
    getLatestIngestionRun(),
  ]);

  const signalSnapshot = getSignalSnapshot();
  const dataSources = buildDataSources({ health: sourceHealth, rawEvents, rawMetrics, signals: signalSnapshot.byKey });
  const marketCoverage = buildMarketCoverage(signalSnapshot.byKey);
  const newsSources = buildNewsSources(rawEvents, sourceHealth);
  const macroData = buildMetricRows(macroMetricMap, signalSnapshot.byKey);
  const stablecoinData = buildMetricRows(stablecoinMetricMap, signalSnapshot.byKey);
  const engineHealth = buildEngineHealth(signalSnapshot.byKey);
  const alertAudit = buildAlertAudit();
  const apiLogs = buildApiLogs(logs);
  const scores = buildScores({ dataSources, marketCoverage, engineHealth });
  const reliability = getIntelligenceReliabilityReportSync();
  const storageWriteFailures = getLatestStorageWriteReportsSync(50).filter((report) => report.status === "failed");

  return {
    generatedAt: new Date().toISOString(),
    lastIngestionRun,
    dataSources,
    marketCoverage,
    newsSources,
    macroData,
    stablecoinData,
    engineHealth,
    alertAudit,
    apiLogs,
    scores: {
      ...scores,
      coverageScore: clampScore((scores.coverageScore + reliability.overallReliability * 100) / 2),
      overallPlatformHealthScore: clampScore((scores.overallPlatformHealthScore * 0.7) + (reliability.overallReliability * 100 * 0.3)),
    },
    failures: {
      failedSources: dataSources.filter((source) => source.status === "disconnected" && source.enabled),
      staleSources: dataSources.filter((source) => (source.freshnessMinutes ?? 0) > 90),
      missingApiKeySources: dataSources.filter((source) => /api key|کلید API/i.test(source.warningFa ?? "")),
      deadLetters,
      storageWriteFailures,
    },
    debug: buildDebugPayload({ rawEvents, rawMetrics, logs }),
  };
}
