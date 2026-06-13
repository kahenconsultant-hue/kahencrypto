import { productionSources } from "@/collectors/registry";
import { buildFreshnessReportFromInputs, type FreshnessReport, type OperationalHealthState } from "@/health/freshness-engine";
import type { DataPoint, DataQuality, NormalizedSignal, SignalGroup } from "@/lib/types";
import { getSignalSnapshot } from "@/server/analytics/market-signals";
import { freshnessScore, minutesSince } from "@/server/analytics/quality-engine";
import { clampPercent } from "@/server/analytics/scoring-engine";
import {
  getLatestIngestionRun,
  getLatestIngestionRunSync,
  getLatestRawEvents,
  getLatestRawEventsSync,
  getLatestRawMetrics,
  getLatestRawMetricsSync,
  getLatestSchedulerRunsSync,
  getLatestSourceHealth,
  getLatestSourceHealthSync,
} from "@/storage/ingestion-store";
import type { IngestionRunSummary, RawEventInput, RawMetricInput, SourceHealthSnapshot } from "@/types/ingestion";

export type CoverageDimension = "macro" | "crypto" | "liquidity" | "derivatives" | "sentiment" | "geopolitical";
export type IntelligenceReliabilityStatus = "healthy" | "degraded" | "critical";

export interface CoverageBreakdown {
  dimension: CoverageDimension;
  score: number;
  status: IntelligenceReliabilityStatus;
  sourceAvailability: number;
  signalCoverage: number;
  freshness: number;
  onlineSources: number;
  totalSources: number;
  availableSignals: number;
  requiredSignals: number;
  missingSignals: string[];
  staleSignals: string[];
  degradedSources: string[];
  explanationFa: string;
}

export interface IntelligenceReliabilityReport {
  generatedAt: string;
  overallReliability: number;
  overallStatus: IntelligenceReliabilityStatus;
  reliabilityState: OperationalHealthState;
  coreReliability: number;
  premiumCoverage: number;
  analysisMode: "free_data_plus_proxies" | "direct_core_data" | "degraded_core_data" | "insufficient_core_data";
  disabledPremiumModules: string[];
  availableCoreModules: string[];
  activeFreeSources: number;
  missingPremiumSources: string[];
  macroCoverage: number;
  cryptoCoverage: number;
  liquidityCoverage: number;
  derivativesCoverage: number;
  sentimentCoverage: number;
  geopoliticalCoverage: number;
  criticalSourcesOnline: number;
  criticalSourcesTotal: number;
  degradedModules: string[];
  missingCriticalSources: string[];
  missingApiKeys: string[];
  activeSources: number;
  failedSources: number;
  staleSources: number;
  obsoleteSources: number;
  eventsObserved: number;
  metricsObserved: number;
  lastIngestionRun: {
    runId: string;
    finishedAt: string;
    failedSources: number;
    deadLetters: number;
    storageMode: string;
  } | null;
  coverage: Record<CoverageDimension, CoverageBreakdown>;
  freshness: FreshnessReport["summary"] & {
    overallFreshnessState: FreshnessReport["overallFreshnessState"];
    overallHealthState: FreshnessReport["overallHealthState"];
    latestDataAt: string | null;
    latestRefreshAt: string | null;
    refreshAgeMinutes: number | null;
  };
  confidenceCaps: {
    global: number;
    alerts: number;
    regime: number;
    liquidity: number;
    correlations: number;
    sentiment: number;
  };
  warningsFa: string[];
}

const dimensionWeights: Record<CoverageDimension, number> = {
  macro: 0.22,
  crypto: 0.24,
  liquidity: 0.24,
  derivatives: 0.12,
  sentiment: 0.1,
  geopolitical: 0.08,
};

const dimensionSourceCategories: Record<CoverageDimension, string[]> = {
  macro: ["market_data", "central_banks", "economic_data"],
  crypto: ["market_data", "crypto_media", "financial_media"],
  liquidity: ["market_data", "stablecoins", "etf", "onchain"],
  derivatives: ["market_data", "derivatives"],
  sentiment: ["financial_media", "crypto_media", "sentiment"],
  geopolitical: ["geopolitics", "central_banks", "financial_media"],
};

const dimensionSignalGroups: Record<CoverageDimension, SignalGroup[]> = {
  macro: ["macro", "volatility"],
  crypto: ["price"],
  liquidity: ["liquidity", "stablecoins", "flows", "onchain"],
  derivatives: ["leverage"],
  sentiment: ["sentiment", "news"],
  geopolitical: ["geopolitical"],
};

const requiredSignalKeys: Record<CoverageDimension, string[]> = {
  macro: ["dxy_trend_24h", "us10y_trend_24h", "nasdaq_trend_24h", "gold_trend_24h", "vix_trend_24h", "cpi_latest", "fed_funds_rate", "unemployment_rate"],
  crypto: ["btc_trend_24h", "eth_trend_24h", "sol_trend_24h", "btc_market_cap", "eth_market_cap", "sol_market_cap"],
  liquidity: [
    "stablecoin_market_cap_7d",
    "stablecoin_market_cap_30d",
    "total_stablecoin_market_cap_usd",
    "stablecoin_dominance",
    "usdt_supply_7d",
    "usdt_supply_30d",
    "usdc_supply_7d",
    "usdc_supply_30d",
    "spot_volume_btc_24h",
    "btc_etf_flow_24h",
    "eth_etf_flow_24h",
    "exchange_reserves_btc_7d",
  ],
  derivatives: [
    "funding_btc",
    "funding_eth",
    "funding_sol",
    "open_interest_btc_24h",
    "open_interest_eth_24h",
    "open_interest_sol_24h",
    "futures_volume_btc_24h",
    "futures_volume_eth_24h",
    "futures_volume_sol_24h",
  ],
  sentiment: ["news_sentiment_macro"],
  geopolitical: ["geopolitical_event_score"],
};

const moduleByDimension: Record<CoverageDimension, string[]> = {
  macro: ["Macro dashboard", "market regime"],
  crypto: ["asset impact map", "price/correlation analysis"],
  liquidity: ["liquidity engine", "ETF flow analysis", "USDT risk"],
  derivatives: ["derivatives stress analysis", "leverage alerts"],
  sentiment: ["sentiment engine", "AI event explanations"],
  geopolitical: ["geopolitical risk analysis"],
};

function statusFromScore(score: number): IntelligenceReliabilityStatus {
  if (score >= 0.72) return "healthy";
  if (score >= 0.45) return "degraded";
  return "critical";
}

function pointIsAvailable(point: Pick<DataPoint | RawMetricInput | NormalizedSignal, "value" | "quality">) {
  return point.value !== null && point.quality !== "unavailable" && point.quality !== "estimated";
}

function healthScore(source: SourceHealthSnapshot | undefined) {
  if (!source) return 0;
  if (source.status === "success") return 1;
  if (source.status === "degraded") return 0.62;
  return 0;
}

function healthFreshness(source: SourceHealthSnapshot | undefined) {
  if (!source) return 0;
  return freshnessScore(minutesSince(source.updatedAt)) / 100;
}

function signalFreshness(signal: Pick<NormalizedSignal | RawMetricInput, "timestamp" | "quality" | "value">) {
  if (!pointIsAvailable(signal)) return 0;
  return freshnessScore(minutesSince(signal.timestamp)) / 100;
}

function eventFreshness(event: RawEventInput) {
  return freshnessScore(minutesSince(event.timestamp)) / 100;
}

function reliabilityByQuality(quality: DataQuality) {
  if (quality === "live") return 1;
  if (quality === "partial_live") return 0.75;
  if (quality === "delayed") return 0.58;
  if (quality === "proxy") return 0.46;
  if (quality === "estimated") return 0;
  return 0;
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

function dimensionSources(dimension: CoverageDimension) {
  const categories = new Set(dimensionSourceCategories[dimension]);
  return productionSources.filter((source) => categories.has(source.category) && source.intelligenceClass !== "premium");
}

function metricSignalsForDimension(dimension: CoverageDimension, metrics: RawMetricInput[], snapshotSignals: NormalizedSignal[]) {
  const groups = new Set(dimensionSignalGroups[dimension]);
  const keys = new Set(requiredSignalKeys[dimension]);
  const metricSignals = metrics.filter((metric) => groups.has(metric.group) || keys.has(metric.metric));
  const cacheSignals = snapshotSignals.filter((signal) => groups.has(signal.group) || keys.has(signal.key));
  return [...cacheSignals, ...metricSignals];
}

function buildDimensionCoverage(params: {
  dimension: CoverageDimension;
  sourceHealth: SourceHealthSnapshot[];
  rawMetrics: RawMetricInput[];
  rawEvents: RawEventInput[];
  signals: NormalizedSignal[];
}): CoverageBreakdown {
  const sources = dimensionSources(params.dimension);
  const healthById = new Map(params.sourceHealth.map((source) => [source.sourceId, source]));
  const sourceScores = sources.map((source) => {
    const health = healthById.get(source.id);
    const tierWeight = source.tier === 1 ? 1 : source.tier === 2 ? 0.72 : 0.45;
    return healthScore(health) * tierWeight;
  });
  const maxSourceScores = sources.map((source) => (source.tier === 1 ? 1 : source.tier === 2 ? 0.72 : 0.45));
  const sourceAvailability = maxSourceScores.reduce((sum, score) => sum + score, 0)
    ? sourceScores.reduce((sum, score) => sum + score, 0) / maxSourceScores.reduce((sum, score) => sum + score, 0)
    : 0;

  const requiredKeys = requiredSignalKeys[params.dimension];
  const signals = metricSignalsForDimension(params.dimension, params.rawMetrics, params.signals);
  const availableKeys = new Set(
    signals
      .filter(pointIsAvailable)
      .map((signal) => ("key" in signal && signal.key ? signal.key : signal.metric))
      .filter(Boolean),
  );
  const availableGroups = new Set(signals.filter(pointIsAvailable).map((signal) => signal.group));
  const requiredGroups = dimensionSignalGroups[params.dimension];
  const keyCoverage = requiredKeys.length ? requiredKeys.filter((key) => availableKeys.has(key)).length / requiredKeys.length : 0;
  const groupCoverage = requiredGroups.length ? requiredGroups.filter((group) => availableGroups.has(group)).length / requiredGroups.length : 0;
  const eventCoverage =
    params.dimension === "sentiment" || params.dimension === "geopolitical"
      ? params.rawEvents.filter((event) =>
          params.dimension === "geopolitical"
            ? event.category === "geopolitics" || event.sourceName.toLowerCase().includes("treasury")
            : event.category === "financial_media" || event.category === "crypto_media" || event.category === "central_banks",
        ).length > 0
        ? 0.35
        : 0
      : 0;
  const signalCoverage = Math.min(1, Math.max(keyCoverage, groupCoverage) + eventCoverage);
  const freshness = average([
    ...sources.map((source) => healthFreshness(healthById.get(source.id))),
    ...signals.map(signalFreshness),
    ...params.rawEvents.slice(0, 20).map(eventFreshness),
  ]);
  const staleSignals = unique(
    signals
      .filter((signal) => pointIsAvailable(signal) && minutesSince(signal.timestamp) > 90)
      .map((signal) => ("key" in signal && signal.key ? signal.key : signal.metric))
      .filter((metric): metric is string => Boolean(metric)),
  );
  const missingSignals = requiredKeys.filter((key) => !availableKeys.has(key));
  const degradedSources = sources
    .map((source) => healthById.get(source.id))
    .filter((health): health is SourceHealthSnapshot => Boolean(health))
    .filter((health) => health.status !== "success")
    .map((health) => `${health.sourceName}: ${health.status}`);
  const score = Math.max(0, Math.min(1, sourceAvailability * 0.45 + signalCoverage * 0.35 + freshness * 0.2));
  const status = statusFromScore(score);

  return {
    dimension: params.dimension,
    score: Number(score.toFixed(2)),
    status,
    sourceAvailability: Number(sourceAvailability.toFixed(2)),
    signalCoverage: Number(signalCoverage.toFixed(2)),
    freshness: Number(freshness.toFixed(2)),
    onlineSources: sources.filter((source) => {
      const health = healthById.get(source.id);
      return health?.status === "success" || health?.status === "degraded";
    }).length,
    totalSources: sources.length,
    availableSignals: signals.filter(pointIsAvailable).length,
    requiredSignals: requiredKeys.length,
    missingSignals,
    staleSignals,
    degradedSources,
    explanationFa:
      status === "healthy"
        ? "پوشش این لایه برای تولید تحلیل با محدودیت معمول کافی است."
        : status === "degraded"
          ? "پوشش این لایه ناقص است؛ confidence باید کاهش یابد و تحلیل باید سناریومحور باقی بماند."
          : "پوشش این لایه برای نتیجه‌گیری جهت‌دار کافی نیست و ماژول‌های وابسته باید خروجی را ناموجود یا هشدار کیفیت داده نشان دهند.",
  };
}

function buildReliabilityReport(params: {
  sourceHealth: SourceHealthSnapshot[];
  rawMetrics: RawMetricInput[];
  rawEvents: RawEventInput[];
  lastRun: IngestionRunSummary | null;
  schedulerLastRunAt?: string | null;
}): IntelligenceReliabilityReport {
  const snapshot = getSignalSnapshot();
  const dimensions: CoverageDimension[] = ["macro", "crypto", "liquidity", "derivatives", "sentiment", "geopolitical"];
  const freshnessReport = buildFreshnessReportFromInputs({
    sourceHealth: params.sourceHealth,
    rawMetrics: params.rawMetrics,
    rawEvents: params.rawEvents,
    signals: snapshot.signals,
    lastRun: params.lastRun,
    schedulerLastRunAt: params.schedulerLastRunAt,
  });
  const coverageEntries = dimensions.map((dimension) =>
    buildDimensionCoverage({
      dimension,
      sourceHealth: params.sourceHealth,
      rawMetrics: params.rawMetrics,
      rawEvents: params.rawEvents,
      signals: snapshot.signals,
    }),
  );
  const coverage = Object.fromEntries(coverageEntries.map((entry) => [entry.dimension, entry])) as Record<CoverageDimension, CoverageBreakdown>;
  const overallReliability = Number(
    coverageEntries
      .reduce((sum, entry) => sum + entry.score * dimensionWeights[entry.dimension], 0)
      .toFixed(2),
  );
  const sourceHealthById = new Map(params.sourceHealth.map((source) => [source.sourceId, source]));
  const coreMarketFallbackHealthy = ["success", "degraded"].includes(sourceHealthById.get("cmip-public-market-signal-adapters")?.status ?? "");
  const coreSources = productionSources.filter((source) => (source.intelligenceClass ?? "core") === "core");
  const premiumSources = productionSources.filter((source) => (source.intelligenceClass ?? "core") !== "core");
  const criticalSources = productionSources.filter((source) => {
    if (coreMarketFallbackHealthy && (source.id === "binance-public-rest" || source.id === "bybit-public-rest")) return false;
    return source.tier === 1 && (source.intelligenceClass ?? "core") === "core";
  });
  const missingCriticalSources = criticalSources
    .filter((source) => {
      const health = sourceHealthById.get(source.id);
      return !health || (health.status !== "success" && health.status !== "degraded");
    })
    .map((source) => source.name);
  const enabledCoreSources = coreSources.filter((source) => source.enabled);
  const activeFreeSources = enabledCoreSources.filter((source) => {
    const health = sourceHealthById.get(source.id);
    return health?.status === "success" || health?.status === "degraded";
  }).length;
  const coreReliability = Number(
    (coverage.macro.score * 0.28 + coverage.crypto.score * 0.26 + coverage.liquidity.score * 0.24 + coverage.sentiment.score * 0.14 + coverage.geopolitical.score * 0.08).toFixed(2),
  );
  const premiumWeights = premiumSources.map((source): number => (source.enabled ? 1 : 0));
  const premiumCoverage = Number((premiumWeights.length ? premiumWeights.reduce((sum, item) => sum + item, 0) / premiumWeights.length : 0).toFixed(2));
  const missingPremiumSources = premiumSources.filter((source) => !source.enabled || !sourceHealthById.get(source.id)).map((source) => source.name);
  const disabledPremiumModules = Array.from(
    new Set(
      premiumSources
        .filter((source) => !source.enabled)
        .map((source) => source.premiumModule ?? source.category)
        .concat([
          process.env.CMIP_BTC_ETF_FLOW_24H ? "" : "ETF flow direct feed",
          process.env.CMIP_BTC_EXCHANGE_RESERVES_7D ? "" : "exchange reserves",
        ])
        .filter(Boolean),
    ),
  );
  const availableCoreModules = [
    coverage.macro.score >= 0.4 ? "macro_pressure" : "",
    coverage.crypto.score >= 0.4 ? "asset_price_context" : "",
    coverage.liquidity.score >= 0.4 ? "liquidity_proxy" : "",
    coverage.derivatives.score >= 0.35 ? "leverage_proxy" : "",
    coverage.sentiment.score >= 0.35 ? "rss_sentiment_context" : "",
    coverage.geopolitical.score >= 0.35 ? "geopolitical_context" : "",
  ].filter(Boolean);
  const staleSources = freshnessReport.summary.staleSources;
  const obsoleteSources = freshnessReport.summary.obsoleteSources;
  const degradedModules = unique(
    coverageEntries
      .filter((entry) => entry.status !== "healthy")
      .flatMap((entry) => moduleByDimension[entry.dimension]),
  );
  const etfSignals = snapshot.signals.filter((signal) => signal.key.includes("etf_flow"));
  if (etfSignals.some((signal) => !pointIsAvailable(signal))) degradedModules.push("ETF flow enrichment");
  const missingCoreMacroInputs = ["cpi_latest", "fed_funds_rate", "unemployment_rate"].filter((key) => !pointIsAvailable(snapshot.byKey[key]));
  if (missingCoreMacroInputs.length) degradedModules.push("macro engine");
  if (!process.env.OPENAI_API_KEY) degradedModules.push("AI summaries");
  const activeSources = productionSources.filter((source) => source.enabled).length;
  const failedSources = params.sourceHealth.filter((source) => source.status === "failed" || source.status === "api_key_missing").length;
  const sourceMissingKeys = premiumSources.flatMap((source) => (source.requiredEnvKeys ?? []).filter((key) => !process.env[key]));
  const optionalMissingKeys = ["COINGECKO_API_KEY", "TRADINGECONOMICS_API_KEY", "COINGLASS_API_KEY", "FRED_API_KEY", "WHALE_ALERT_API_KEY", "GLASSNODE_API_KEY", "CRYPTOQUANT_API_KEY"].filter((key) => !process.env[key]);
  const missingApiKeys = unique([...sourceMissingKeys, ...optionalMissingKeys]);
  const criticalSourcesOnline = criticalSources.length - missingCriticalSources.length;
  const analysisMode =
    coreReliability >= 0.75 && premiumCoverage >= 0.35
      ? "direct_core_data"
      : coreReliability >= 0.55
        ? "free_data_plus_proxies"
        : coreReliability >= 0.35
          ? "degraded_core_data"
          : "insufficient_core_data";
  const overallStatus = analysisMode === "insufficient_core_data" ? "critical" : coreReliability < 0.55 ? "degraded" : "healthy";
  const globalCap = clampPercent(coreReliability * 100);
  const warningsFa = [
    missingCriticalSources.length
      ? `برخی منابع رایگان اصلی ناموجود یا ناموفق هستند: ${missingCriticalSources.slice(0, 4).join("، ")}${missingCriticalSources.length > 4 ? "…" : ""}`
      : "",
    staleSources || obsoleteSources ? `${staleSources + obsoleteSources} منبع فعال stale/obsolete هستند و نباید به شکل تازه یا زنده نمایش داده شوند.` : "",
    ...freshnessReport.summary.warningsFa,
    !process.env.OPENAI_API_KEY ? "OPENAI_API_KEY تنظیم نشده است؛ ترجمه و توضیح AI به‌صورت production فعال نیست." : "",
    missingCoreMacroInputs.length
      ? `Macro Engine به داده‌های اصلی FRED کامل وصل نیست؛ ورودی‌های ناموجود: ${missingCoreMacroInputs.join("، ")}. هشدارهای کلان قوی نباید تولید شوند.`
      : "",
    disabledPremiumModules.length ? `پوشش premium محدود است: ${disabledPremiumModules.slice(0, 4).join("، ")}. تحلیل core با پروکسی‌های رایگان ادامه دارد.` : "",
    degradedModules.length ? "برخی ماژول‌ها در حالت degraded هستند و نباید confidence بالا نشان دهند." : "",
  ].filter(Boolean);

  return {
    generatedAt: new Date().toISOString(),
    overallReliability,
    overallStatus,
    reliabilityState: freshnessReport.overallHealthState,
    coreReliability,
    premiumCoverage,
    analysisMode,
    disabledPremiumModules,
    availableCoreModules,
    activeFreeSources,
    missingPremiumSources,
    macroCoverage: coverage.macro.score,
    cryptoCoverage: coverage.crypto.score,
    liquidityCoverage: coverage.liquidity.score,
    derivativesCoverage: coverage.derivatives.score,
    sentimentCoverage: coverage.sentiment.score,
    geopoliticalCoverage: coverage.geopolitical.score,
    criticalSourcesOnline,
    criticalSourcesTotal: criticalSources.length,
    degradedModules: unique(degradedModules),
    missingCriticalSources,
    missingApiKeys,
    activeSources,
    failedSources,
    staleSources,
    obsoleteSources,
    eventsObserved: params.rawEvents.length,
    metricsObserved: params.rawMetrics.length,
    lastIngestionRun: params.lastRun
      ? {
          runId: params.lastRun.runId,
          finishedAt: params.lastRun.finishedAt,
          failedSources: params.lastRun.failedSources,
          deadLetters: params.lastRun.deadLetters,
          storageMode: params.lastRun.storageMode,
        }
      : null,
    coverage,
    freshness: {
      ...freshnessReport.summary,
      overallFreshnessState: freshnessReport.overallFreshnessState,
      overallHealthState: freshnessReport.overallHealthState,
      latestDataAt: freshnessReport.latestDataAt,
      latestRefreshAt: freshnessReport.latestRefreshAt,
      refreshAgeMinutes: freshnessReport.refreshAgeMinutes,
    },
    confidenceCaps: {
      global: globalCap,
      alerts: clampPercent(Math.min(globalCap, missingCoreMacroInputs.length === 3 ? 45 : 100, coverage.macro.score * 30 + coverage.crypto.score * 25 + coverage.liquidity.score * 25 + coverage.derivatives.score * 20)),
      regime: clampPercent(Math.min(globalCap, missingCoreMacroInputs.length === 3 ? 55 : 100, coverage.macro.score * 35 + coverage.crypto.score * 25 + coverage.liquidity.score * 25 + coverage.derivatives.score * 15)),
      liquidity: clampPercent(Math.min(globalCap, coverage.liquidity.score * 50 + coverage.macro.score * 30 + coverage.derivatives.score * 20)),
      correlations: clampPercent(Math.min(globalCap, coverage.crypto.score * 55 + coverage.macro.score * 45)),
      sentiment: clampPercent(Math.min(globalCap, coverage.sentiment.score * 70 + coverage.crypto.score * 30)),
    },
    warningsFa,
  };
}

export function getIntelligenceReliabilityReportSync(): IntelligenceReliabilityReport {
  const latestSchedulerRun = getLatestSchedulerRunsSync(1)[0] ?? null;
  return buildReliabilityReport({
    sourceHealth: getLatestSourceHealthSync(),
    rawMetrics: getLatestRawMetricsSync(200),
    rawEvents: getLatestRawEventsSync(200),
    lastRun: getLatestIngestionRunSync(),
    schedulerLastRunAt: latestSchedulerRun?.finishedAt ?? null,
  });
}

export async function getIntelligenceReliabilityReport(): Promise<IntelligenceReliabilityReport> {
  const [sourceHealth, rawMetrics, rawEvents, lastRun] = await Promise.all([
    getLatestSourceHealth(),
    getLatestRawMetrics(300),
    getLatestRawEvents(300),
    getLatestIngestionRun(),
  ]);
  return buildReliabilityReport({ sourceHealth, rawMetrics, rawEvents, lastRun });
}

export function capConfidenceByReliability(score: number | null, cap: number) {
  if (score === null) return null;
  return Math.min(score, cap);
}
