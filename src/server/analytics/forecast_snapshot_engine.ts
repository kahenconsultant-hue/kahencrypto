import type { DataPoint, DirectionalBias, IntelligenceAssetSymbol } from "@/lib/types";
import { getSeriesHistory, getSeriesSignal, getSignalSnapshot, supportedEngineAssets, type SeriesKey } from "@/server/analytics/market-signals";
import { clampPercent } from "@/server/analytics/scoring-engine";
import { getLatestLiquidityScoreSync, getLatestRegimeInputSync } from "@/storage/ingestion-store";
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

function usableSignal(point: DataPoint | null | undefined) {
  return Boolean(point && point.value !== null && point.quality !== "unavailable" && point.quality !== "estimated");
}

function signalConfidence(point: DataPoint | null | undefined) {
  if (!usableSignal(point)) return null;
  return Math.max(0, Math.min(100, Math.round(point?.confidenceBase ?? point?.reliability ?? 0)));
}

function trendForAsset(asset: IntelligenceAssetSymbol) {
  if (asset === "USDT") return getSignalSnapshot().byKey.usdt_supply_7d ?? null;
  return getSeriesSignal(asset as SeriesKey);
}

function biasFromScore(score: number): DirectionalBias {
  if (score >= 15) return "bullish";
  if (score <= -15) return "bearish";
  return "neutral";
}

function directionScoreForAsset(asset: IntelligenceAssetSymbol, trendValue: number | null, liquidityScore: number | null, riskScore: number | null, regimeLabel: string) {
  const trendComponent = trendValue === null ? 0 : Math.max(-40, Math.min(40, trendValue * (asset === "SOL" ? 8 : asset === "US10Y" ? 80 : 7)));
  const liquidityComponent = liquidityScore === null ? 0 : (liquidityScore - 50) * 0.42;
  const riskComponent = riskScore === null ? 0 : -(riskScore - 50) * 0.36;
  const regimeComponent = /risk_off|دفاعی|فشار|squeeze|contraction/i.test(regimeLabel) ? -10 : /risk_on|expansion|گسترش/i.test(regimeLabel) ? 10 : 0;

  if (asset === "DXY" || asset === "Gold" || asset === "US10Y") return trendComponent;
  if (asset === "Nasdaq") return trendComponent + riskComponent * 0.45;
  if (asset === "USDT") return trendComponent - liquidityComponent * 0.35 + Math.max(0, riskComponent) * 0.3;
  return trendComponent + liquidityComponent + riskComponent + regimeComponent;
}

function liquidityHealthFromStoredScore(score: number | null | undefined) {
  return typeof score === "number" && Number.isFinite(score) ? clampPercent(50 + score * 0.5) : null;
}

function riskScoreFromSignals(liquidityScore: number | null) {
  const snapshot = getSignalSnapshot();
  const dxy = usableSignal(snapshot.byKey.dxy_trend_24h) && typeof snapshot.byKey.dxy_trend_24h.value === "number" ? snapshot.byKey.dxy_trend_24h.value : null;
  const us10y = usableSignal(snapshot.byKey.us10y_trend_24h) && typeof snapshot.byKey.us10y_trend_24h.value === "number" ? snapshot.byKey.us10y_trend_24h.value : null;
  const btc = usableSignal(snapshot.byKey.btc_trend_24h) && typeof snapshot.byKey.btc_trend_24h.value === "number" ? snapshot.byKey.btc_trend_24h.value : null;
  const liquidityRisk = liquidityScore === null ? 10 : Math.max(0, 50 - liquidityScore) * 0.55;
  const dollarRisk = dxy === null ? 0 : Math.max(0, dxy) * 22;
  const ratesRisk = us10y === null ? 0 : Math.max(0, us10y) * 180;
  const cryptoRisk = btc === null ? 0 : Math.max(0, -btc) * 6;
  return clampPercent(28 + liquidityRisk + dollarRisk + ratesRisk + cryptoRisk);
}

function engineContributions(params: {
  asset: IntelligenceAssetSymbol;
  liquidityConfidence: number | null;
  riskConfidence: number | null;
  regimeConfidence: number | null;
  trendConfidence: number | null;
}) {
  const snapshot = getSignalSnapshot();
  const etfKey = params.asset === "BTC" ? "btc_etf_flow_24h" : params.asset === "ETH" ? "eth_etf_flow_24h" : null;
  const stablecoinSignal = snapshot.byKey.total_stablecoin_market_cap_usd ?? snapshot.byKey.stablecoin_market_cap_7d;
  const sentimentSignal = snapshot.byKey.news_sentiment_macro;
  const geopoliticalSignal = snapshot.byKey.geopolitical_event_score;

  return {
    "ETF Engine": null,
    "Liquidity Engine": params.liquidityConfidence,
    "Stablecoin Engine": signalConfidence(stablecoinSignal),
    "Sentiment Engine": signalConfidence(sentimentSignal),
    "Correlation Engine": null,
    "Macro Engine": params.regimeConfidence,
    "Geopolitical Engine": signalConfidence(geopoliticalSignal),
    "Risk Engine": params.riskConfidence,
    "Regime Engine": params.regimeConfidence,
    ...(etfKey ? { "ETF Engine": signalConfidence(snapshot.byKey[etfKey]) } : {}),
  } satisfies Record<string, number | null>;
}

function compactDrivers(params: {
  asset: IntelligenceAssetSymbol;
  trendValue: number | null;
  trendSource: string;
  regimeLabel: string;
  liquidityScore: number | null;
  riskScore: number | null;
}) {
  return [
    params.trendValue === null ? `${params.asset}: روند معتبر در دسترس نیست` : `${params.asset}: روند منبع ${params.trendSource} برابر ${params.trendValue}`,
    `رژیم: ${params.regimeLabel}`,
    params.liquidityScore === null ? "نقدینگی: ناموجود" : `نقدینگی: ${params.liquidityScore}/100`,
    params.riskScore === null ? "ریسک: ناموجود" : `ریسک: ${params.riskScore}/100`,
  ].filter(Boolean).slice(0, 8);
}

export function buildForecastSnapshots(runId: string, now = new Date()): ForecastSnapshotInput[] {
  const liquiditySnapshot = getLatestLiquidityScoreSync();
  const regimeSnapshot = getLatestRegimeInputSync();
  const regimeLabel = regimeSnapshot?.regime ?? "neutral_mixed";
  const liquidityScore = liquidityHealthFromStoredScore(liquiditySnapshot?.cryptoLiquidityProxyScore);
  const riskScore = riskScoreFromSignals(liquidityScore);
  const timestamp = now.toISOString();
  const snapshots: ForecastSnapshotInput[] = [];

  for (const asset of supportedEngineAssets) {
    if (asset === "Fed") continue;
    const typedAsset = asset as IntelligenceAssetSymbol;
    const referenceValue = latestReferenceValue(typedAsset);
    if (referenceValue === null) continue;
    const trendSignal = trendForAsset(typedAsset);
    const trendValue = usableSignal(trendSignal) && typeof trendSignal?.value === "number" ? trendSignal.value : null;
    const trendConfidence = signalConfidence(trendSignal);
    const confidenceInputs = [trendConfidence, liquiditySnapshot?.confidence ?? null, regimeSnapshot?.confidence ?? null]
      .filter((item): item is number => typeof item === "number")
      .map((item) => Math.max(0, Math.min(100, item)));
    const predictedConfidence = confidenceInputs.length ? Math.min(...confidenceInputs) : null;
    if (predictedConfidence === null) continue;
    if (!Number.isFinite(predictedConfidence)) continue;

    const score = directionScoreForAsset(typedAsset, trendValue, liquidityScore, riskScore, regimeLabel);
    const predictedBias = biasFromScore(score);

    const baseContributions = engineContributions({
      asset: typedAsset,
      liquidityConfidence: liquiditySnapshot?.confidence ?? null,
      riskConfidence: riskScore,
      regimeConfidence: regimeSnapshot?.confidence ?? null,
      trendConfidence,
    });

    for (const predictionHorizon of ["24H", "7D", "30D"] as ForecastPredictionHorizon[]) {
      snapshots.push({
        snapshotId: `forecast:${runId}:${typedAsset}:${predictionHorizon}`,
        timestamp,
        asset: typedAsset,
        assetType: assetTypeByAsset[typedAsset],
        predictionHorizon,
        predictedDirection: directionFromBias(predictedBias),
        predictedBias,
        predictedConfidence,
        riskScore,
        liquidityScore,
        regime: regimeLabel,
        mainDrivers: compactDrivers({
          asset: typedAsset,
          trendValue,
          trendSource: trendSignal?.source ?? "ناموجود",
          regimeLabel,
          liquidityScore,
          riskScore,
        }),
        priceAtPrediction: referenceValue,
        validationDate: new Date(now.getTime() + horizonMs[predictionHorizon]).toISOString(),
        runId,
        engineContributions: baseContributions,
      });
    }
  }

  return snapshots;
}
