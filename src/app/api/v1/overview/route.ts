import { apiJson, apiOptions } from "@/lib/api-response";
import {
  getNewsGroupedByCategory,
  pricingPlans,
  sourceHealth,
} from "@/lib/production-data";
import {
  DASHBOARD_REFRESH_INTERVAL_MINUTES,
  getDashboardAiStatus,
  getDashboardAlerts,
  getDashboardAssetImpactProfiles,
  getDashboardBasicIntelligence,
  getDashboardCausalMarketGraph,
  getDashboardCorrelationReport,
  getDashboardDerivedSignals,
  getDashboardForecastValidationCenter,
  getDashboardFreshnessReport,
  getDashboardIngestionFoundationStatus,
  getDashboardIntegrityReport,
  getDashboardLiquidityIntelligenceStack,
  getDashboardLiquidityReport,
  getDashboardMarketRegime,
  getDashboardModuleDataSourceStatus,
  getDashboardReliabilityReport,
  getDashboardRiskReport,
  getDashboardSentimentReport,
  getDashboardSignalSnapshot,
  getDashboardUsdtRiskCenter,
  ensureDashboardSignalCacheFresh,
} from "@/server/dashboard/dashboard-service";
import { getEtfFlowSnapshotSync } from "@/server/data/etf-flow-module";
import { getUnifiedIntelligenceReport } from "@/server/intelligence/unified-intelligence-engine";

export function OPTIONS() {
  return apiOptions();
}

export async function GET() {
  await ensureDashboardSignalCacheFresh();
  const snapshot = getDashboardSignalSnapshot();
  const ingestionFoundation = getDashboardIngestionFoundationStatus();
  const freshnessReport = getDashboardFreshnessReport();
  const reliability = getDashboardReliabilityReport();
  const dataSourceStatus = getDashboardModuleDataSourceStatus();
  const alerts = getDashboardAlerts();
  const integrity = getDashboardIntegrityReport();
  const unifiedIntelligence = getUnifiedIntelligenceReport();
  const etfFlows = [
    { issuer: "BTC ETF basket", signal: snapshot.byKey.btc_etf_flow_24h, snapshot: getEtfFlowSnapshotSync("BTC") },
    { issuer: "ETH ETF basket", signal: snapshot.byKey.eth_etf_flow_24h, snapshot: getEtfFlowSnapshotSync("ETH") },
  ].map((row) => ({
    issuer: row.issuer,
    netFlow: row.signal?.value ?? null,
    netFlow7d: row.snapshot.netFlow7d,
    netFlow30d: row.snapshot.netFlow30d,
    providerBreakdown: row.snapshot.providerBreakdown,
    providerBreakdown7d: row.snapshot.providerBreakdown7d,
    providerBreakdown30d: row.snapshot.providerBreakdown30d,
    source: row.signal?.source ?? null,
    sourceUrl: row.snapshot.sourceUrl ?? null,
    latestDate: row.snapshot.latestDate ?? null,
    freshness: row.snapshot.freshness,
    quality: row.signal?.quality ?? "unavailable",
    reliability: row.signal?.reliability ?? 0,
    timestamp: row.signal?.timestamp ?? null,
    error: row.signal?.error ?? "برای live شدن، env یا crawler ETF لازم است.",
  }));

  return apiJson({
    generatedAt: new Date().toISOString(),
    legal: {
      disclaimer:
        "این API فقط هوش سناریومحور و آموزشی بازار را ارائه می‌کند و مشاوره سرمایه‌گذاری، سیگنال خرید/فروش یا پیشنهاد اهرم معاملاتی نیست.",
    },
    dataSourceStatus,
    freshnessReport,
    ingestionFoundation,
    intelligenceReliability: reliability,
    aiLayer: getDashboardAiStatus(),
    basicIntelligence: getDashboardBasicIntelligence(),
    forecastValidation: getDashboardForecastValidationCenter(),
    causalMarketGraph: getDashboardCausalMarketGraph(),
    marketRegime: getDashboardMarketRegime(),
    risk: getDashboardRiskReport(),
    derivedSignals: getDashboardDerivedSignals(),
    alerts,
    integrity,
    liquidity: getDashboardLiquidityReport(),
    liquidityIntelligence: getDashboardLiquidityIntelligenceStack(),
    correlations: getDashboardCorrelationReport(),
    assetImpacts: getDashboardAssetImpactProfiles(),
    unifiedIntelligence,
    assets: unifiedIntelligence.assets,
    etfFlows,
    sentiment: getDashboardSentimentReport(),
    dataQuality: {
      refreshIntervalMinutes: DASHBOARD_REFRESH_INTERVAL_MINUTES,
      ...snapshot,
    },
    usdtRiskCenter: getDashboardUsdtRiskCenter(),
    newsByCategory: getNewsGroupedByCategory(),
    sourceHealth: ingestionFoundation.sourceHealth.length ? ingestionFoundation.sourceHealth : sourceHealth.slice(0, 36),
    pricingPlans,
  });
}
