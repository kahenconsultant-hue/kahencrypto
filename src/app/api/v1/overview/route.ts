import { apiJson, apiOptions } from "@/lib/api-response";
import {
  assetIntelligence,
  getNewsGroupedByCategory,
  pricingPlans,
  sourceHealth,
  usdtRiskCenter,
} from "@/lib/production-data";
import { getAssetImpactProfiles } from "@/server/analytics/asset-impact-engine";
import { getDynamicCorrelationReport } from "@/server/analytics/correlation-engine";
import { getDerivedSignalReport } from "@/server/analytics/derived-signal-engine";
import { getLiquidityReport } from "@/server/analytics/liquidity-engine";
import { getMarketRegimeReport } from "@/server/analytics/market-regime-engine";
import { getSentimentReport } from "@/server/analytics/sentiment-engine";
import { getSignalSnapshot, REFRESH_INTERVAL_MINUTES } from "@/server/analytics/market-signals";
import { generateSmartAlerts } from "@/server/alerts/smart-alert-engine";
import { getAiLayerStatus } from "@/server/ai/event-explanation-layer";
import { getIntelligenceReliabilityReport } from "@/server/intelligence/reliability-engine";
import { moduleDataSourceStatus } from "@/lib/data-source-status";
import { getIngestionFoundationStatusSync } from "@/health/source-health";

export function OPTIONS() {
  return apiOptions();
}

export async function GET() {
  const snapshot = getSignalSnapshot();
  const ingestionFoundation = getIngestionFoundationStatusSync();
  const reliability = await getIntelligenceReliabilityReport();
  const etfFlows = [
    { issuer: "BTC ETF basket", signal: snapshot.byKey.btc_etf_flow_24h },
    { issuer: "ETH ETF basket", signal: snapshot.byKey.eth_etf_flow_24h },
  ].map((row) => ({
    issuer: row.issuer,
    netFlow: row.signal?.value ?? null,
    source: row.signal?.source ?? null,
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
    dataSourceStatus: moduleDataSourceStatus,
    ingestionFoundation,
    intelligenceReliability: reliability,
    aiLayer: getAiLayerStatus(),
    marketRegime: getMarketRegimeReport(),
    derivedSignals: getDerivedSignalReport(),
    alerts: generateSmartAlerts(),
    liquidity: getLiquidityReport(),
    correlations: getDynamicCorrelationReport(),
    assetImpacts: getAssetImpactProfiles(),
    assets: assetIntelligence,
    etfFlows,
    sentiment: getSentimentReport(),
    dataQuality: {
      refreshIntervalMinutes: REFRESH_INTERVAL_MINUTES,
      ...snapshot,
    },
    usdtRiskCenter,
    newsByCategory: getNewsGroupedByCategory(),
    sourceHealth: ingestionFoundation.sourceHealth.length ? ingestionFoundation.sourceHealth : sourceHealth.slice(0, 36),
    pricingPlans,
  });
}
