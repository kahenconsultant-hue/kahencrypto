import "server-only";

import { productionSources, summarizeSources } from "@/collectors/registry";
import { dataQualityFromFreshness, getFreshnessReportSync } from "@/health/freshness-engine";
import { moduleDataSourceStatus, type DataSourceStatus, type ModuleStatusKey } from "@/lib/data-source-status";
import { categoryLabels, pricingPlans } from "@/lib/production-data";
import { generateSmartAlerts } from "@/server/alerts/smart-alert-engine";
import { getAiLayerStatus, getLatestEventExplanations } from "@/server/ai/event-explanation-layer";
import { getAssetImpactProfiles } from "@/server/analytics/asset-impact-engine";
import { getBasicIntelligenceReport } from "@/server/analytics/basic-intelligence-engine";
import { getCausalMarketGraph } from "@/server/analytics/causal-market-graph";
import { getDynamicCorrelationReport } from "@/server/analytics/correlation-engine";
import { getDerivedSignalReport } from "@/server/analytics/derived-signal-engine";
import { getForecastValidationCenter } from "@/server/analytics/forecast_validation_center";
import { getLiquidityReport } from "@/server/analytics/liquidity-engine";
import { getLiquidityIntelligenceStack } from "@/server/analytics/liquidity-intelligence-stack";
import { getIntelligenceIntegrityReport } from "@/server/analytics/intelligence-integrity-engine";
import { getMarketRegimeReport } from "@/server/analytics/market-regime-engine";
import { getRefreshHealth, getSignalSnapshot, minutesSinceEngineUpdate, REFRESH_INTERVAL_MINUTES } from "@/server/analytics/market-signals";
import { getRiskReport } from "@/server/analytics/risk-engine";
import { getSentimentReport } from "@/server/analytics/sentiment-engine";
import { getUsdtRiskCenter } from "@/server/analytics/usdt-risk-engine";
import { getSignalCacheStatusSync, loadSharedSignalCache, refreshSignalCache } from "@/server/data/signal-cache";
import { getIntelligenceReliabilityReportSync } from "@/server/intelligence/reliability-engine";
import { getIngestionFoundationStatusSync } from "@/health/source-health";
import { getLatestNormalizedEventsSync, getLatestRawEventsSync, hydrateRuntimeStoreFromSupabase } from "@/storage/ingestion-store";

export const dashboardCategoryLabels = categoryLabels;
export const dashboardPricingPlans = pricingPlans;
export const getDashboardUsdtRiskCenter = getUsdtRiskCenter;
export const DASHBOARD_REFRESH_INTERVAL_MINUTES = REFRESH_INTERVAL_MINUTES;

const DASHBOARD_CACHE_TTL_MS = 30_000;

type DashboardCacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const dashboardCache = new Map<string, DashboardCacheEntry<unknown>>();
let activeSignalRefresh: Promise<unknown> | null = null;

function scheduleDashboardSignalRefresh() {
  activeSignalRefresh ??= refreshSignalCache()
    .then((result) => {
      dashboardCache.clear();
      return result;
    })
    .catch((error) => {
      console.warn("[cmip-dashboard] background signal cache refresh failed", error);
      return null;
    })
    .finally(() => {
      activeSignalRefresh = null;
    });

  return activeSignalRefresh;
}

export async function ensureDashboardSignalCacheFresh() {
  await Promise.all([loadSharedSignalCache(), hydrateRuntimeStoreFromSupabase()]);
  const status = getSignalCacheStatusSync();
  if (status.exists && !status.stale) return { refreshed: false, status };

  scheduleDashboardSignalRefresh();

  return { refreshed: false, backgroundRefreshScheduled: true, status };
}

function getCachedDashboardValue<T>(key: string, factory: () => T, ttlMs = DASHBOARD_CACHE_TTL_MS): T {
  const now = Date.now();
  const cached = dashboardCache.get(key) as DashboardCacheEntry<T> | undefined;

  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const value = factory();
  dashboardCache.set(key, { expiresAt: now + ttlMs, value });
  return value;
}

const moduleSignalKeys: Partial<Record<ModuleStatusKey, string[]>> = {
  macroSummary: ["dxy_trend_24h", "us10y_trend_24h", "nasdaq_trend_24h", "gold_trend_24h"],
  btcIntelligence: ["btc_trend_24h", "dxy_trend_24h", "us10y_trend_24h", "stablecoin_market_cap_7d"],
  ethIntelligence: ["eth_trend_24h", "btc_trend_24h", "nasdaq_trend_24h", "stablecoin_market_cap_7d"],
  solIntelligence: ["sol_trend_24h", "btc_trend_24h", "nasdaq_trend_24h", "spot_volume_btc_24h"],
  usdtRisk: ["usdt_supply_7d", "stablecoin_market_cap_7d"],
  dxyIntelligence: ["dxy_trend_24h"],
  goldIntelligence: ["gold_trend_24h"],
  nasdaqIntelligence: ["nasdaq_trend_24h"],
  us10yIntelligence: ["us10y_trend_24h"],
  etfFlows: ["btc_etf_flow_24h", "btc_etf_flow_7d", "btc_etf_flow_30d", "eth_etf_flow_24h", "eth_etf_flow_7d", "eth_etf_flow_30d"],
  liquidity: ["stablecoin_market_cap_7d", "usdt_supply_7d", "spot_volume_btc_24h", "dxy_trend_24h", "us10y_trend_24h"],
  correlations: ["btc_trend_24h", "eth_trend_24h", "sol_trend_24h", "nasdaq_trend_24h", "dxy_trend_24h", "gold_trend_24h"],
  sentiment: ["news_sentiment_macro"],
  geopoliticalRisk: ["geopolitical_event_score"],
  derivedSignals: ["dxy_trend_24h", "us10y_trend_24h", "stablecoin_market_cap_7d", "btc_trend_24h", "eth_trend_24h", "sol_trend_24h"],
  dataQuality: ["btc_trend_24h", "eth_trend_24h", "sol_trend_24h", "dxy_trend_24h"],
  causality: ["dxy_trend_24h", "us10y_trend_24h", "stablecoin_market_cap_7d", "btc_trend_24h", "funding_btc"],
};

function combineStatuses(statuses: DataSourceStatus[]): DataSourceStatus {
  if (!statuses.length) return "unavailable";
  const usable = statuses.filter((status) => status !== "unavailable" && status !== "estimated");
  if (!usable.length) return statuses.includes("estimated") ? "estimated" : "unavailable";
  if (usable.every((status) => status === "live")) return "live";
  if (usable.every((status) => status === "delayed")) return "delayed";
  if (usable.every((status) => status === "proxy")) return "proxy";
  return "partial_live";
}

function signalStatus(keys: string[]): DataSourceStatus {
  const snapshot = getDashboardSignalSnapshot();
  return combineStatuses(
    keys.map((key) => {
      const signal = snapshot.byKey[key];
      if (!signal || signal.value === null || signal.quality === "unavailable") return "unavailable";
      return dataQualityFromFreshness(signal.quality, signal.timestamp, signal);
    }),
  );
}

function staleAdjusted(status: DataSourceStatus): DataSourceStatus {
  const refresh = getRefreshHealth();
  if (!refresh.failedRefresh || refresh.ageMinutes === null) return status;
  if (refresh.ageMinutes > REFRESH_INTERVAL_MINUTES * 6) return status === "unavailable" ? status : "unavailable";
  if (status === "live" || status === "partial_live") return "delayed";
  return status;
}

export function getDashboardModuleDataSourceStatus(): Record<ModuleStatusKey, DataSourceStatus> {
  const reliability = getDashboardReliabilityReport();
  const rawEvents = getDashboardLatestRawEvents(12);
  const normalizedEvents = getDashboardLatestNormalizedEvents(12);
  const foundation = getDashboardIngestionFoundationStatus();
  const statuses = { ...moduleDataSourceStatus } as Record<ModuleStatusKey, DataSourceStatus>;

  for (const [module, keys] of Object.entries(moduleSignalKeys) as Array<[ModuleStatusKey, string[]]>) {
    statuses[module] = signalStatus(keys);
  }

  statuses.latestNews = rawEvents.length || normalizedEvents.length
    ? combineStatuses([
        ...rawEvents.map((event) => dataQualityFromFreshness(event.quality, event.timestamp)),
        ...normalizedEvents.map((event) => dataQualityFromFreshness(event.quality, event.eventTimestamp)),
      ])
    : "unavailable";
  statuses.ingestionHealth = foundation.sourceHealth.length ? (foundation.failedSources > 0 ? "partial_live" : "live") : "unavailable";
  statuses.marketRegime = reliability.coreReliability >= 0.45 ? statuses.marketRegime : "unavailable";
  statuses.topAlerts = reliability.coreReliability >= 0.35 ? combineStatuses([statuses.liquidity, statuses.macroSummary, statuses.sentiment]) : "unavailable";
  statuses.adminConsole = statuses.ingestionHealth;
  statuses.widgetEmbed = combineStatuses([statuses.marketRegime, statuses.liquidity, statuses.latestNews]);

  return Object.fromEntries(
    Object.entries(statuses).map(([module, status]) => [module, staleAdjusted(status)]),
  ) as Record<ModuleStatusKey, DataSourceStatus>;
}

export function getDashboardReliabilityReport() {
  return getCachedDashboardValue("reliability-report", () => getIntelligenceReliabilityReportSync());
}

export function getDashboardFreshnessReport() {
  return getCachedDashboardValue("freshness-report", () => getFreshnessReportSync());
}

export function getDashboardDerivedSignals() {
  return getCachedDashboardValue("derived-signals", () => getDerivedSignalReport());
}

export function getDashboardForecastValidationCenter() {
  return getCachedDashboardValue("forecast-validation-center", () => getForecastValidationCenter(), 10_000);
}

export function getDashboardCausalMarketGraph() {
  return getCachedDashboardValue("causal-market-graph", () => getCausalMarketGraph(), 10_000);
}

export function getDashboardBasicIntelligence() {
  return getCachedDashboardValue("basic-intelligence", () => getBasicIntelligenceReport());
}

export function getDashboardRiskReport() {
  return getCachedDashboardValue("risk-report", () => getRiskReport());
}

export function getDashboardMarketRegime() {
  return getCachedDashboardValue("market-regime", () => getMarketRegimeReport());
}

export function getDashboardAlerts() {
  return getCachedDashboardValue("smart-alerts", () => generateSmartAlerts());
}

export function getDashboardIntegrityReport() {
  return getCachedDashboardValue("integrity-report", () => getIntelligenceIntegrityReport({ alerts: getDashboardAlerts() }));
}

export function getDashboardSignalSnapshot() {
  return getCachedDashboardValue("signal-snapshot", () => getSignalSnapshot(), 10_000);
}

export function getDashboardAssetImpactProfiles() {
  return getCachedDashboardValue("asset-impact-profiles", () => getAssetImpactProfiles());
}

export function getDashboardLiquidityReport() {
  return getCachedDashboardValue("liquidity-report", () => getLiquidityReport());
}

export function getDashboardLiquidityIntelligenceStack() {
  return getCachedDashboardValue("liquidity-intelligence-stack", () => getLiquidityIntelligenceStack());
}

export function getDashboardCorrelationReport() {
  return getCachedDashboardValue("correlation-report", () => getDynamicCorrelationReport());
}

export function getDashboardSentimentReport() {
  return getCachedDashboardValue("sentiment-report", () => getSentimentReport());
}

export function getDashboardAiStatus() {
  return getCachedDashboardValue("ai-status", () => getAiLayerStatus());
}

export function getDashboardEventExplanations(limit = 8) {
  return getCachedDashboardValue(`event-explanations:${limit}`, () => getLatestEventExplanations(limit));
}

export function getDashboardRefreshHealth() {
  const freshness = getFreshnessReportSync();
  const base = getRefreshHealth();
  const failedRefresh = freshness.overallFreshnessState !== "fresh";
  return {
    ...base,
    ageMinutes: freshness.refreshAgeMinutes,
    freshness: freshness.overallFreshnessState,
    failedRefresh,
    nextScheduledUpdateMinutes: freshness.refreshAgeMinutes === null ? 0 : Math.max(0, REFRESH_INTERVAL_MINUTES - freshness.refreshAgeMinutes),
    warning: failedRefresh ? freshness.summary.warningsFa[0] ?? "تازگی داده با وضعیت منابع/سیگنال‌ها سازگار نیست." : null,
  };
}

export function getDashboardMinutesSinceEngineUpdate() {
  return getFreshnessReportSync().refreshAgeMinutes ?? minutesSinceEngineUpdate();
}

export function getDashboardLatestRawEvents(limit = 40) {
  return getCachedDashboardValue(`latest-raw-events:${limit}`, () => getLatestRawEventsSync(limit), 10_000);
}

export function getDashboardLatestNormalizedEvents(limit = 100) {
  return getCachedDashboardValue(`latest-normalized-events:${limit}`, () => getLatestNormalizedEventsSync(limit), 10_000);
}

export function getDashboardSourceSummary() {
  return getCachedDashboardValue("source-summary", () => summarizeSources());
}

export function getDashboardIngestionFoundationStatus() {
  return getCachedDashboardValue("ingestion-foundation-status", () => getIngestionFoundationStatusSync(), 10_000);
}

export function getDashboardSourceDefinitions() {
  return productionSources;
}
