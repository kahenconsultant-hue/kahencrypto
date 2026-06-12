import type { DirectionalBias, IntelligenceAssetSymbol, TransmissionChannel } from "@/lib/types";
import { getAssetImpactProfiles } from "@/server/analytics/asset-impact-engine";
import { getDynamicCorrelationReport } from "@/server/analytics/correlation-engine";
import { getLiquidityReport } from "@/server/analytics/liquidity-engine";
import { getMarketRegimeReport } from "@/server/analytics/market-regime-engine";
import { getRiskReport } from "@/server/analytics/risk-engine";
import { getSentimentReport } from "@/server/analytics/sentiment-engine";
import { getSeriesHistory, getSeriesSignal, supportedEngineAssets, type SeriesKey } from "@/server/analytics/market-signals";
import type { ForecastDirection, ForecastPredictionHorizon, ForecastSnapshotInput } from "@/types/ingestion";

const horizonMs: Record<ForecastPredictionHorizon, number> = {
  "24H": 24 * 60 * 60 * 1000,
  "7D": 7 * 24 * 60 * 60 * 1000,
  "30D": 30 * 24 * 60 * 60 * 1000,
};

const assetTypeByAsset: Record<IntelligenceAssetSymbol, string> = {
  BTC: "crypto",
  ETH: "crypto",
  SOL: "crypto",
  USDT: "stablecoin_infrastructure",
  DXY: "macro_fx",
  Gold: "macro_defensive",
  Nasdaq: "macro_risk_asset",
  US10Y: "macro_rates",
};

const engineByChannel: Record<TransmissionChannel, string> = {
  liquidity: "Liquidity Engine",
  rates: "Macro Engine",
  dollar: "Macro Engine",
  risk_on_risk_off: "Risk Engine",
  etf_flows: "ETF Engine",
  stablecoin_flows: "Stablecoin Engine",
  onchain_activity: "Stablecoin Engine",
  geopolitical_risk: "Geopolitical Engine",
  regulatory_risk: "Geopolitical Engine",
  sentiment_news_shock: "Sentiment Engine",
  correlation_breakdown: "Correlation Engine",
  leverage: "Risk Engine",
};

function directionFromBias(bias: DirectionalBias): ForecastDirection {
  if (bias === "bullish") return "up";
  if (bias === "bearish") return "down";
  if (bias === "neutral") return "neutral";
  return "mixed";
}

function latestReferenceValue(asset: IntelligenceAssetSymbol) {
  const history = getSeriesHistory(asset as SeriesKey, asset === "BTC" || asset === "ETH" || asset === "SOL" ? "intraday" : "daily");
  const latest = history.at(-1);
  if (latest && Number.isFinite(latest.value)) return latest.value;

  const signal = getSeriesSignal(asset as SeriesKey);
  if (signal?.history?.length) {
    const fallback = signal.history.filter((item) => Number.isFinite(item.value)).at(-1);
    if (fallback) return fallback.value;
  }

  return null;
}

function engineContributionsForProfile(profile: ReturnType<typeof getAssetImpactProfiles>[number]) {
  const contributions: Record<string, number | null> = {
    "ETF Engine": null,
    "Liquidity Engine": null,
    "Stablecoin Engine": null,
    "Sentiment Engine": null,
    "Correlation Engine": null,
    "Macro Engine": null,
    "Geopolitical Engine": null,
    "Risk Engine": null,
    "Regime Engine": null,
  };

  for (const channel of profile.transmissionChannels) {
    const engine = engineByChannel[channel];
    if (!engine) continue;
    contributions[engine] = Math.max(contributions[engine] ?? 0, Math.min(100, Math.abs(profile.impactScore)));
  }

  contributions["Regime Engine"] = Math.min(100, Math.abs(profile.impactScore) * 0.75);
  contributions["Risk Engine"] = Math.max(contributions["Risk Engine"] ?? 0, profile.directionalBias === "bearish" ? Math.min(100, Math.abs(profile.impactScore)) : 25);

  return contributions;
}

function compactDrivers(profile: ReturnType<typeof getAssetImpactProfiles>[number], regimeLabel: string, liquidityScore: number | null, riskScore: number | null) {
  return [
    ...profile.mainDrivers,
    ...profile.opposingDrivers.slice(0, 2).map((driver) => `مخالف: ${driver}`),
    `رژیم: ${regimeLabel}`,
    liquidityScore === null ? "نقدینگی: ناموجود" : `نقدینگی: ${liquidityScore}/100`,
    riskScore === null ? "ریسک: ناموجود" : `ریسک: ${riskScore}/100`,
  ].filter(Boolean).slice(0, 8);
}

export function buildForecastSnapshots(runId: string, now = new Date()): ForecastSnapshotInput[] {
  const profiles = getAssetImpactProfiles();
  const risk = getRiskReport();
  const liquidity = getLiquidityReport();
  const regime = getMarketRegimeReport();
  const sentiment = getSentimentReport();
  const correlation = getDynamicCorrelationReport();
  const regimeLabel = regime.regimeLabel ?? regime.active;
  const timestamp = now.toISOString();
  const snapshots: ForecastSnapshotInput[] = [];

  for (const asset of supportedEngineAssets) {
    if (asset === "Fed") continue;
    const typedAsset = asset as IntelligenceAssetSymbol;
    const profile = profiles.find((item) => item.asset === typedAsset);
    if (!profile) continue;
    const referenceValue = latestReferenceValue(typedAsset);
    if (referenceValue === null) continue;
    const predictedConfidence = profile.confidence.available ? profile.confidence.score : null;
    if (predictedConfidence === null) continue;

    const baseContributions = engineContributionsForProfile(profile);
    baseContributions["Liquidity Engine"] = liquidity.dataQuality === "unavailable" ? null : Math.max(baseContributions["Liquidity Engine"] ?? 0, liquidity.confidence);
    baseContributions["Risk Engine"] = risk.riskScore === null ? baseContributions["Risk Engine"] : Math.max(baseContributions["Risk Engine"] ?? 0, risk.confidence.score ?? 0);
    baseContributions["Sentiment Engine"] = sentiment.confidence.available ? Math.max(baseContributions["Sentiment Engine"] ?? 0, sentiment.confidence.score ?? 0) : baseContributions["Sentiment Engine"];
    baseContributions["Correlation Engine"] = correlation.engineConfidence === null ? baseContributions["Correlation Engine"] : Math.max(baseContributions["Correlation Engine"] ?? 0, correlation.engineConfidence);
    baseContributions["Macro Engine"] = Math.max(baseContributions["Macro Engine"] ?? 0, regime.confidence);

    for (const predictionHorizon of ["24H", "7D", "30D"] as ForecastPredictionHorizon[]) {
      snapshots.push({
        snapshotId: `forecast:${runId}:${typedAsset}:${predictionHorizon}`,
        timestamp,
        asset: typedAsset,
        assetType: assetTypeByAsset[typedAsset],
        predictionHorizon,
        predictedDirection: directionFromBias(profile.directionalBias),
        predictedBias: profile.directionalBias,
        predictedConfidence,
        riskScore: risk.riskScore,
        liquidityScore: liquidity.liquidityHealthScore ?? liquidity.liquidityScore,
        regime: regimeLabel,
        mainDrivers: compactDrivers(profile, regimeLabel, liquidity.liquidityHealthScore ?? liquidity.liquidityScore, risk.riskScore),
        priceAtPrediction: referenceValue,
        validationDate: new Date(now.getTime() + horizonMs[predictionHorizon]).toISOString(),
        runId,
        engineContributions: baseContributions,
      });
    }
  }

  return snapshots;
}
