import "server-only";

import { productionSources, summarizeSources } from "@/collectors/registry";
import { dataQualityFromFreshness, getFreshnessReportSync } from "@/health/freshness-engine";
import { moduleDataSourceStatus, type DataSourceStatus, type ModuleStatusKey } from "@/lib/data-source-status";
import { categoryLabels, pricingPlans, usdtRiskCenter } from "@/lib/production-data";
import { generateSmartAlerts } from "@/server/alerts/smart-alert-engine";
import { getAiLayerStatus, getLatestEventExplanations } from "@/server/ai/event-explanation-layer";
import { getAssetImpactProfiles } from "@/server/analytics/asset-impact-engine";
import { getDynamicCorrelationReport } from "@/server/analytics/correlation-engine";
import { getDerivedSignalReport } from "@/server/analytics/derived-signal-engine";
import { getLiquidityReport } from "@/server/analytics/liquidity-engine";
import { getMarketRegimeReport } from "@/server/analytics/market-regime-engine";
import { getRefreshHealth, getSignalSnapshot, minutesSinceEngineUpdate, REFRESH_INTERVAL_MINUTES } from "@/server/analytics/market-signals";
import { getSentimentReport } from "@/server/analytics/sentiment-engine";
import { getIntelligenceReliabilityReportSync } from "@/server/intelligence/reliability-engine";
import { getIngestionFoundationStatusSync } from "@/health/source-health";
import { getLatestRawEventsSync } from "@/storage/ingestion-store";

export const dashboardCategoryLabels = categoryLabels;
export const dashboardPricingPlans = pricingPlans;
export const dashboardUsdtRiskCenter = usdtRiskCenter;
export const DASHBOARD_REFRESH_INTERVAL_MINUTES = REFRESH_INTERVAL_MINUTES;

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
  etfFlows: ["btc_etf_flow_24h", "eth_etf_flow_24h"],
  liquidity: ["stablecoin_market_cap_7d", "usdt_supply_7d", "spot_volume_btc_24h", "dxy_trend_24h", "us10y_trend_24h"],
  correlations: ["btc_trend_24h", "eth_trend_24h", "sol_trend_24h", "nasdaq_trend_24h", "dxy_trend_24h", "gold_trend_24h"],
  sentiment: ["news_sentiment_macro"],
  geopoliticalRisk: ["geopolitical_event_score"],
  derivedSignals: ["dxy_trend_24h", "us10y_trend_24h", "stablecoin_market_cap_7d", "btc_trend_24h", "eth_trend_24h", "sol_trend_24h"],
  dataQuality: ["btc_trend_24h", "eth_trend_24h", "sol_trend_24h", "dxy_trend_24h"],
};

function combineStatuses(statuses: DataSourceStatus[]): DataSourceStatus {
  if (!statuses.length) return "unavailable";
  const usable = statuses.filter((status) => status !== "unavailable" && status !== "estimated");
  if (!usable.length) return statuses.includes("estimated") ? "estimated" : "unavailable";
  if (usable.every((status) => status === "live")) return "live";
  if (usable.every((status) => status === "delayed")) return "delayed";
  return "partial_live";
}

function signalStatus(keys: string[]): DataSourceStatus {
  const snapshot = getSignalSnapshot();
  return combineStatuses(
    keys.map((key) => {
      const signal = snapshot.byKey[key];
      if (!signal || signal.value === null || signal.quality === "unavailable") return "unavailable";
      return dataQualityFromFreshness(signal.quality, signal.timestamp);
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
  const reliability = getIntelligenceReliabilityReportSync();
  const rawEvents = getLatestRawEventsSync(12);
  const foundation = getIngestionFoundationStatusSync();
  const statuses = { ...moduleDataSourceStatus } as Record<ModuleStatusKey, DataSourceStatus>;

  for (const [module, keys] of Object.entries(moduleSignalKeys) as Array<[ModuleStatusKey, string[]]>) {
    statuses[module] = signalStatus(keys);
  }

  statuses.latestNews = rawEvents.length ? combineStatuses(rawEvents.map((event) => dataQualityFromFreshness(event.quality, event.timestamp))) : "unavailable";
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
  return getIntelligenceReliabilityReportSync();
}

export function getDashboardFreshnessReport() {
  return getFreshnessReportSync();
}

export function getDashboardDerivedSignals() {
  return getDerivedSignalReport();
}

export function getDashboardMarketRegime() {
  return getMarketRegimeReport();
}

export function getDashboardAlerts() {
  return generateSmartAlerts();
}

export function getDashboardSignalSnapshot() {
  return getSignalSnapshot();
}

export function getDashboardAssetImpactProfiles() {
  return getAssetImpactProfiles();
}

export function getDashboardLiquidityReport() {
  return getLiquidityReport();
}

export function getDashboardCorrelationReport() {
  return getDynamicCorrelationReport();
}

export function getDashboardSentimentReport() {
  return getSentimentReport();
}

export function getDashboardAiStatus() {
  return getAiLayerStatus();
}

export function getDashboardEventExplanations(limit = 8) {
  return getLatestEventExplanations(limit);
}

export function getDashboardRefreshHealth() {
  return getRefreshHealth();
}

export function getDashboardMinutesSinceEngineUpdate() {
  return minutesSinceEngineUpdate();
}

export function getDashboardLatestRawEvents(limit = 40) {
  return getLatestRawEventsSync(limit);
}

export function getDashboardSourceSummary() {
  return summarizeSources();
}

export function getDashboardIngestionFoundationStatus() {
  return getIngestionFoundationStatusSync();
}

export function getDashboardSourceDefinitions() {
  return productionSources;
}
