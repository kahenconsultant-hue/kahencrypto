import "server-only";

import { productionSources, summarizeSources } from "@/collectors/registry";
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

export function getDashboardReliabilityReport() {
  return getIntelligenceReliabilityReportSync();
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

