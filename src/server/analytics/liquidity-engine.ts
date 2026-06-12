import type { DirectionalBias, LiquidityEngineOutput, LiquidityRegimeV2, LiquidityState, LiquidityV2State, NormalizedSignal } from "@/lib/types";
import { calculateAdaptiveModuleConfidence } from "@/server/analytics/adaptive-confidence-engine";
import { buildLiquidityProxySnapshot } from "@/server/analytics/derived-signal-engine";
import { deriveBaseScores, getEngineLastUpdatedAt, getSignalSnapshot, weightedAverage } from "@/server/analytics/market-signals";
import { clampPercent, clampSigned } from "@/server/analytics/scoring-engine";
import { calculateDataQualityScore, confidenceLabel, dataQualityLabel, normalizeSignalScore, validationReason } from "@/server/analytics/quality-engine";
import {
  calibrateConfidenceByCoverage,
  classifyLiquidityHealth,
  enforceLiquidityNarrativeConsistency,
  liquidityHealthFromSigned,
  strictLiquidityNarrative,
} from "@/server/analytics/intelligence-quality";

export interface LiquidityInputVector {
  dxyTrend: number | null;
  us10yTrend: number | null;
  stablecoinMarketCapTrend: number | null;
  usdtSupplyTrend: number | null;
  usdcSupplyTrend: number | null;
  btcEtfFlow: number | null;
  ethEtfFlow: number | null;
  exchangeReserveTrend: number | null;
  exchangeInflows: number | null;
  exchangeOutflows: number | null;
  openInterestTrend: number | null;
  fundingRate: number | null;
  spotVolumeTrend: number | null;
  futuresVolumeTrend: number | null;
}

function signalValue(signals: Record<string, NormalizedSignal>, key: string) {
  const signal = signals[key];
  if (!signal || signal.value === null || signal.quality === "unavailable" || signal.quality === "estimated") return null;
  return signal.value;
}

export function buildLiquidityInput(): LiquidityInputVector {
  const { byKey } = getSignalSnapshot();
  return {
    dxyTrend: signalValue(byKey, "dxy_trend_24h"),
    us10yTrend: signalValue(byKey, "us10y_trend_24h"),
    stablecoinMarketCapTrend: signalValue(byKey, "stablecoin_market_cap_7d"),
    usdtSupplyTrend: signalValue(byKey, "usdt_supply_7d"),
    usdcSupplyTrend: signalValue(byKey, "usdc_supply_7d"),
    btcEtfFlow: signalValue(byKey, "btc_etf_flow_7d") ?? signalValue(byKey, "btc_etf_flow_24h"),
    ethEtfFlow: signalValue(byKey, "eth_etf_flow_7d") ?? signalValue(byKey, "eth_etf_flow_24h"),
    exchangeReserveTrend: signalValue(byKey, "exchange_reserves_btc_7d"),
    exchangeInflows: signalValue(byKey, "exchange_inflows"),
    exchangeOutflows: signalValue(byKey, "exchange_outflows"),
    openInterestTrend: signalValue(byKey, "open_interest_btc_24h"),
    fundingRate: signalValue(byKey, "funding_btc"),
    spotVolumeTrend: signalValue(byKey, "spot_volume_btc_24h"),
    futuresVolumeTrend: signalValue(byKey, "futures_volume_btc_24h"),
  };
}

function scoreEtfFlow(value: number | null) {
  if (value === null) return null;
  return clampSigned(value / 2_000_000);
}

function scoreStablecoins(value: number | null) {
  if (value === null) return null;
  return clampSigned(value * 22);
}

function scoreExchangeReserves(value: number | null) {
  if (value === null) return null;
  return clampSigned(-value * 28);
}

function scoreExchangeFlows(input: Pick<LiquidityInputVector, "exchangeInflows" | "exchangeOutflows">) {
  if (input.exchangeInflows === null || input.exchangeOutflows === null) return null;
  const netOutflow = input.exchangeOutflows - input.exchangeInflows;
  return clampSigned(netOutflow / 15_000_000);
}

function weightedAvailable(values: Array<{ value: number | null; weight: number }>) {
  const available = values.filter((item): item is { value: number; weight: number } => item.value !== null && Number.isFinite(item.value));
  if (!available.length) return null;
  return weightedAverage(available);
}

function scoreMacroLiquidity(input: LiquidityInputVector) {
  const dxy = input.dxyTrend === null ? null : -input.dxyTrend * 22;
  const rates = input.us10yTrend === null ? null : -input.us10yTrend * 180;
  const score = weightedAvailable([{ value: dxy, weight: 0.3 }, { value: rates, weight: 0.3 }]);
  return score === null ? null : clampSigned(score);
}

function scoreCryptoLiquidity(input: LiquidityInputVector) {
  const stablecoin = scoreStablecoins(input.stablecoinMarketCapTrend);
  const etf = scoreEtfFlow(input.btcEtfFlow);
  const reserves = scoreExchangeReserves(input.exchangeReserveTrend);
  const exchangeFlows = scoreExchangeFlows(input);
  const spot = input.spotVolumeTrend === null ? null : input.spotVolumeTrend * 2.2;
  const futures = input.futuresVolumeTrend === null || input.spotVolumeTrend === null ? null : -Math.max(0, input.futuresVolumeTrend - Math.max(0, input.spotVolumeTrend)) * 1.4;
  const funding = input.fundingRate === null ? null : normalizeSignalScore({ key: "funding_btc", value: input.fundingRate, quality: "live" });
  const openInterest = input.openInterestTrend === null ? null : normalizeSignalScore({ key: "open_interest_btc_24h", value: input.openInterestTrend, quality: "live" });
  const score = weightedAvailable([
    { value: stablecoin, weight: 0.25 },
    { value: etf, weight: 0.2 },
    { value: reserves, weight: 0.1 },
    { value: exchangeFlows, weight: 0.1 },
    { value: spot, weight: 0.15 },
    { value: futures, weight: 0.1 },
    { value: funding, weight: 0.05 },
    { value: openInterest, weight: 0.05 },
  ]);
  return score === null ? null : clampSigned(score);
}

export function scoreRealSpotLiquidity(input: LiquidityInputVector) {
  const stablecoin = scoreStablecoins(input.stablecoinMarketCapTrend);
  const btcEtf = scoreEtfFlow(input.btcEtfFlow);
  const ethEtf = scoreEtfFlow(input.ethEtfFlow);
  const reserves = scoreExchangeReserves(input.exchangeReserveTrend);
  const exchangeFlows = scoreExchangeFlows(input);
  const spot = input.spotVolumeTrend === null ? null : clampSigned(input.spotVolumeTrend * 2.2);
  const score = weightedAvailable([
    { value: stablecoin, weight: 0.3 },
    { value: btcEtf, weight: 0.24 },
    { value: ethEtf, weight: 0.08 },
    { value: reserves, weight: 0.18 },
    { value: exchangeFlows, weight: 0.12 },
    { value: spot, weight: 0.2 },
  ]);
  return score === null ? null : clampSigned(score);
}

export function scoreLeveragedLiquidity(input: LiquidityInputVector) {
  const fundingHeat = input.fundingRate === null ? null : input.fundingRate > 0.06 ? 95 : input.fundingRate > 0.025 ? 78 : input.fundingRate > 0 ? 42 : input.fundingRate < -0.02 ? 58 : 22;
  const openInterestHeat = input.openInterestTrend === null ? null : input.openInterestTrend >= 8 ? 92 : input.openInterestTrend >= 3 ? 72 : input.openInterestTrend <= -5 ? 18 : 36;
  const futuresVsSpot =
    input.futuresVolumeTrend === null || input.spotVolumeTrend === null
      ? null
      : clampPercent(45 + Math.max(0, input.futuresVolumeTrend - Math.max(0, input.spotVolumeTrend)) * 2.2 + Math.max(0, input.futuresVolumeTrend) * 0.55);
  const score = weightedAvailable([
    { value: fundingHeat, weight: 0.35 },
    { value: openInterestHeat, weight: 0.35 },
    { value: futuresVsSpot, weight: 0.3 },
  ]);
  return score === null ? null : clampPercent(score);
}

export function detectLiquidityV2State(params: {
  liquidityScoreSigned: number | null;
  macroLiquidityScore: number | null;
  cryptoLiquidityScore: number | null;
  realSpotLiquidityScore: number | null;
  leveragedLiquidityScore: number | null;
  leverageStress: number | null;
  sustainabilityScore: number | null;
  stablecoinScore: number | null;
  btcEtfFlow: number | null;
}): LiquidityV2State {
  const etfWeakOrUnavailable = params.btcEtfFlow === null || params.btcEtfFlow <= 0;
  const stablecoinWeak = params.stablecoinScore !== null && params.stablecoinScore <= 5;
  if (params.liquidityScoreSigned !== null && params.liquidityScoreSigned <= -45) return "liquidity_squeeze";
  if (params.macroLiquidityScore !== null && params.cryptoLiquidityScore !== null && params.macroLiquidityScore <= -35 && params.cryptoLiquidityScore <= -20) return "liquidity_squeeze";
  if (params.leverageStress !== null && params.realSpotLiquidityScore !== null && params.leverageStress >= 72 && params.realSpotLiquidityScore <= 10) return "speculative_overheating";
  if (params.liquidityScoreSigned !== null && params.realSpotLiquidityScore !== null && params.leverageStress !== null && params.sustainabilityScore !== null && params.liquidityScoreSigned > 25 && params.realSpotLiquidityScore > 25 && params.leverageStress < 65 && params.sustainabilityScore >= 58) return "healthy_expansion";
  if (params.liquidityScoreSigned !== null && params.leveragedLiquidityScore !== null && params.realSpotLiquidityScore !== null && params.liquidityScoreSigned > 12 && params.leveragedLiquidityScore >= 66 && params.realSpotLiquidityScore <= 20) return "leverage_driven_expansion";
  if (params.realSpotLiquidityScore !== null && params.leveragedLiquidityScore !== null && params.realSpotLiquidityScore <= 8 && params.leveragedLiquidityScore >= 55 && (etfWeakOrUnavailable || stablecoinWeak)) return "weak_participation_rally";
  if (params.macroLiquidityScore !== null && params.realSpotLiquidityScore !== null && params.macroLiquidityScore < -20 && params.realSpotLiquidityScore <= 15) return "defensive_positioning";
  return "neutral_mixed";
}

export function detectLiquidityStateFromSigned(score: number | null, leverageStress: number | null): LiquidityState {
  if (score === null && leverageStress === null) return "neutral";
  const effectiveScore = score ?? 0;
  const effectiveLeverage = leverageStress ?? 0;
  if (effectiveScore <= -55 || (effectiveScore < -25 && effectiveLeverage >= 70)) return "contraction";
  if (effectiveScore >= 55 && leverageStress !== null && effectiveLeverage < 72) return "expansion";
  if (effectiveLeverage >= 76) return "overheating";
  if (effectiveScore < -15 || effectiveLeverage >= 66) return "fragile";
  return "neutral";
}

function conditionFromState(state: LiquidityState): LiquidityEngineOutput["condition"] {
  if (state === "expansion") return "Expanding";
  if (state === "contraction") return "Contracting";
  if (state === "fragile" || state === "overheating") return "Stress";
  if (state === "neutral") return "Neutral";
  return "Unclear";
}

function liquidityStateFromStrict(classification: ReturnType<typeof classifyLiquidityHealth>["class"], leverageStress: number | null): LiquidityState {
  if (classification === "stress") return "contraction";
  if (classification === "weak") return leverageStress !== null && leverageStress >= 70 ? "overheating" : "fragile";
  if (classification === "supportive" || classification === "expansion") return leverageStress !== null && leverageStress >= 76 ? "overheating" : "expansion";
  return leverageStress !== null && leverageStress >= 66 ? "fragile" : "neutral";
}

function liquidityDataQuality(signals: NormalizedSignal[]) {
  const relevantKeys = new Set([
    "dxy_trend_24h",
    "us10y_trend_24h",
    "stablecoin_market_cap_7d",
    "usdt_supply_7d",
    "usdc_supply_7d",
    "btc_etf_flow_24h",
    "eth_etf_flow_24h",
    "exchange_reserves_btc_7d",
    "exchange_inflows",
    "exchange_outflows",
    "open_interest_btc_24h",
    "funding_btc",
    "spot_volume_btc_24h",
    "futures_volume_btc_24h",
  ]);
  const relevant = signals.filter((signal) => relevantKeys.has(signal.key));
  if (!relevant.length || relevant.every((signal) => signal.quality === "unavailable")) return "unavailable" as const;
  if (relevant.some((signal) => signal.quality === "estimated")) return "estimated" as const;
  if (relevant.some((signal) => signal.quality === "proxy")) return "proxy" as const;
  if (relevant.some((signal) => signal.quality === "unavailable")) return "partial_live" as const;
  if (relevant.some((signal) => signal.quality === "delayed")) return "delayed" as const;
  return "live" as const;
}

function biasFromScore(score: number): DirectionalBias {
  if (score >= 18) return "bullish";
  if (score <= -18) return "bearish";
  if (Math.abs(score) < 8) return "neutral";
  return "mixed";
}

function liquidityV2Label(state: LiquidityV2State) {
  const labels: Record<LiquidityV2State, string> = {
    healthy_expansion: "گسترش سالم نقدینگی",
    leverage_driven_expansion: "گسترش اهرمی نقدینگی",
    liquidity_squeeze: "فشار شدید نقدینگی",
    speculative_overheating: "داغ‌شدن سفته‌بازانه",
    weak_participation_rally: "رالی با مشارکت ضعیف",
    defensive_positioning: "چینش دفاعی سرمایه",
    neutral_mixed: "خنثی / ترکیبی",
  };
  return labels[state];
}

function liquidityRegimeV2Label(regime: LiquidityRegimeV2) {
  const labels: Record<LiquidityRegimeV2, string> = {
    supportive: "نقدینگی حمایتی",
    tightening: "انقباض نقدینگی",
    stressed: "نقدینگی تحت فشار",
    fragmented: "نقدینگی تکه‌تکه",
    insufficient_data: "داده ناکافی",
  };
  return labels[regime];
}

function signedToHealthScore(score: number | null) {
  return score === null ? null : clampPercent(50 + score / 2);
}

function describeLayer(label: string, score: number | null, supportiveAt = 58, weakAt = 45) {
  if (score === null) return `${label}: ناموجود`;
  if (score >= supportiveAt) return `${label}: حمایتی (${Math.round(score)}/100)`;
  if (score < weakAt) return `${label}: فشارزا (${Math.round(score)}/100)`;
  return `${label}: خنثی/مرزی (${Math.round(score)}/100)`;
}

export function deriveLiquidityRegimeV2(params: {
  macroHealth: number | null;
  realSpotHealth: number | null;
  leveragedHealth: number | null;
  stablecoinHealth: number | null;
  etfHealth: number | null;
  exchangeFlowHealth: number | null;
  sustainability: number | null;
  leverageStress: number | null;
  coverage: number;
  missingSignals: string[];
}): {
  regime: LiquidityRegimeV2;
  confidence: number;
  bottlenecks: string[];
  confirmations: string[];
  narrativeFa: string;
} {
  const structuralScores = [params.macroHealth, params.realSpotHealth, params.stablecoinHealth, params.etfHealth, params.exchangeFlowHealth].filter(
    (score): score is number => score !== null,
  );
  if (structuralScores.length < 2 || params.coverage < 25) {
    return {
      regime: "insufficient_data",
      confidence: clampPercent(Math.min(params.coverage, 35)),
      bottlenecks: ["پوشش داده ساختاری نقدینگی کافی نیست."],
      confirmations: [],
      narrativeFa: "داده ساختاری کافی برای رژیم نقدینگی V2 وجود ندارد؛ موتور ترجیح می‌دهد خروجی را نامشخص نگه دارد تا نتیجه مطمئن اما غلط نسازد.",
    };
  }

  const bottlenecks = [
    params.macroHealth !== null && params.macroHealth < 45 ? "فشار دلار/نرخ، نقدینگی کلان را محدود کرده است." : "",
    params.realSpotHealth !== null && params.realSpotHealth < 45 ? "نقدینگی واقعی اسپات ضعیف است." : "",
    params.stablecoinHealth !== null && params.stablecoinHealth < 45 ? "رشد استیبل‌کوین‌ها برای expansion کافی نیست." : "",
    params.etfHealth === null ? "جریان ETF برای تأیید نهادی ناموجود است." : params.etfHealth < 45 ? "جریان ETF فشار خروج یا ضعف ورود را نشان می‌دهد." : "",
    params.exchangeFlowHealth === null ? "ورودی/خروجی صرافی‌ها ناموجود است و uncertainty نقدینگی را بالا نگه می‌دارد." : params.exchangeFlowHealth < 45 ? "جریان صرافی‌ها حمایتی نیست." : "",
    params.leverageStress !== null && params.leverageStress >= 70 ? "اهرم معاملاتی بالا، پایداری نقدینگی را شکننده می‌کند." : "",
    params.sustainability !== null && params.sustainability < 45 ? "پایداری نقدینگی زیر آستانه ۴۵ است." : "",
  ].filter(Boolean);

  const confirmations = [
    params.macroHealth !== null && params.macroHealth >= 58 ? "فشار کلان فروکش کرده یا حمایتی است." : "",
    params.realSpotHealth !== null && params.realSpotHealth >= 58 ? "نقدینگی اسپات واقعی تأیید حمایتی دارد." : "",
    params.stablecoinHealth !== null && params.stablecoinHealth >= 58 ? "استیبل‌کوین‌ها پشتوانه نقدی بهتری نشان می‌دهند." : "",
    params.etfHealth !== null && params.etfHealth >= 58 ? "ETF Flow تأیید نهادی مثبت می‌دهد." : "",
    params.exchangeFlowHealth !== null && params.exchangeFlowHealth >= 58 ? "جریان صرافی‌ها با خروج/کاهش فشار فروش سازگار است." : "",
    params.leverageStress !== null && params.leverageStress < 65 ? "اهرم معاملاتی هنوز در محدوده شکننده بحرانی نیست." : "",
  ].filter(Boolean);

  const weakStructuralCount = [params.macroHealth, params.realSpotHealth, params.stablecoinHealth, params.etfHealth, params.exchangeFlowHealth].filter(
    (score) => score !== null && score < 45,
  ).length;
  const supportiveStructuralCount = [params.macroHealth, params.realSpotHealth, params.stablecoinHealth, params.etfHealth, params.exchangeFlowHealth].filter(
    (score) => score !== null && score >= 58,
  ).length;
  const macroTight = params.macroHealth !== null && params.macroHealth < 45;
  const spotWeak = params.realSpotHealth !== null && params.realSpotHealth < 45;
  const stablecoinWeak = params.stablecoinHealth !== null && params.stablecoinHealth < 45;
  const leverageHigh = params.leverageStress !== null && params.leverageStress >= 70;
  const missingCriticalFlows = params.etfHealth === null || params.exchangeFlowHealth === null;

  let regime: LiquidityRegimeV2 = "fragmented";
  if ((weakStructuralCount >= 3 && (spotWeak || stablecoinWeak)) || (spotWeak && leverageHigh)) {
    regime = "stressed";
  } else if (macroTight && (spotWeak || stablecoinWeak || (params.sustainability !== null && params.sustainability < 50))) {
    regime = "tightening";
  } else if (supportiveStructuralCount >= 3 && !leverageHigh && (params.sustainability === null || params.sustainability >= 55)) {
    regime = "supportive";
  } else if (missingCriticalFlows || Math.abs(supportiveStructuralCount - weakStructuralCount) <= 1) {
    regime = "fragmented";
  }

  const confidence = clampPercent(
    Math.min(
      params.coverage,
      35 + structuralScores.length * 8 + confirmations.length * 4 - bottlenecks.length * 3 - (missingCriticalFlows ? 8 : 0),
    ),
  );
  const label = liquidityRegimeV2Label(regime);
  const layerSummary = [
    describeLayer("ماکرو", params.macroHealth),
    describeLayer("اسپات", params.realSpotHealth),
    describeLayer("استیبل‌کوین", params.stablecoinHealth),
    describeLayer("ETF", params.etfHealth),
    describeLayer("جریان صرافی", params.exchangeFlowHealth),
  ].join("؛ ");
  const narrativeFa =
    regime === "supportive"
      ? `${label}: دست‌کم سه لایه ساختاری نقدینگی حمایتی هستند و اهرم در محدوده بحرانی نیست. ${layerSummary}. این وضعیت تا وقتی معتبر است که ETF یا استیبل‌کوین‌ها واژگون نشوند.`
      : regime === "tightening"
        ? `${label}: فشار دلار/نرخ با ضعف یکی از لایه‌های نقدینگی کریپتو هم‌زمان شده است. ${layerSummary}. این خروجی expansion نیست و confidence با پوشش داده سقف‌گذاری شده است.`
        : regime === "stressed"
          ? `${label}: چند لایه ساختاری ضعیف است یا حرکت بیشتر به leverage وابسته شده است. ${layerSummary}. تا وقتی اسپات، استیبل‌کوین یا ETF تأیید ندهند، هر رشد قیمت شکننده‌تر خوانده می‌شود.`
          : `${label}: سیگنال‌ها بین لایه‌های نقدینگی هم‌جهت نیستند یا ETF/Exchange Flow ناموجود است. ${layerSummary}. نتیجه directional قوی مجاز نیست مگر دو منبع مستقل دیگر هم‌سو شوند.`;

  return { regime, confidence, bottlenecks, confirmations, narrativeFa };
}

export function calculateLiquidityEngine(input: LiquidityInputVector = buildLiquidityInput()): LiquidityEngineOutput {
  const snapshot = getSignalSnapshot();
  const proxySnapshot = buildLiquidityProxySnapshot();
  const macroLiquidityScore = scoreMacroLiquidity(input);
  const cryptoLiquidityScore = scoreCryptoLiquidity(input);
  const realSpotLiquidityScore = scoreRealSpotLiquidity(input);
  const leveragedLiquidityScore = scoreLeveragedLiquidity(input);
  const totalLiquidity = weightedAvailable([{ value: macroLiquidityScore, weight: 0.42 }, { value: cryptoLiquidityScore, weight: 0.58 }]);
  const liquidityScoreSignedRaw = totalLiquidity === null ? null : clampSigned(totalLiquidity);
  const leverageStressInputs = weightedAvailable([
    { value: input.openInterestTrend === null ? null : input.openInterestTrend * 4, weight: 0.34 },
    { value: input.fundingRate === null ? null : input.fundingRate * 900, weight: 0.34 },
    { value: input.futuresVolumeTrend === null || input.spotVolumeTrend === null ? null : Math.max(0, input.futuresVolumeTrend - input.spotVolumeTrend) * 1.1, weight: 0.32 },
  ]);
  const leverageStressRaw = leverageStressInputs === null ? null : clampPercent(50 + leverageStressInputs);
  const liquidityScoreSigned = liquidityScoreSignedRaw ?? 0;
  const leverageStress = leverageStressRaw ?? 0;
  const stablecoinScore = scoreStablecoins(input.stablecoinMarketCapTrend);
  const etfUnavailablePenalty = input.btcEtfFlow === null ? 8 : 0;
  const liquiditySustainabilityRaw = weightedAvailable([
    { value: realSpotLiquidityScore, weight: 0.35 },
    { value: macroLiquidityScore, weight: 0.25 },
    { value: stablecoinScore, weight: 0.15 },
    { value: leverageStressRaw === null ? null : -leverageStressRaw, weight: 0.25 },
  ]);
  const liquiditySustainabilityScore = liquiditySustainabilityRaw === null ? null : clampPercent(50 + liquiditySustainabilityRaw - etfUnavailablePenalty);
  const institutionalFlowRaw = weightedAvailable([
    { value: scoreEtfFlow(input.btcEtfFlow), weight: 0.7 },
    { value: scoreEtfFlow(input.ethEtfFlow), weight: 0.3 },
  ]);
  const institutionalFlow = institutionalFlowRaw === null ? 0 : clampPercent(50 + institutionalFlowRaw * 0.5);
  const stablecoinExpansionRaw = weightedAvailable([
    { value: scoreStablecoins(input.stablecoinMarketCapTrend), weight: 0.6 },
    { value: scoreStablecoins(input.usdtSupplyTrend), weight: 0.25 },
    { value: scoreStablecoins(input.usdcSupplyTrend), weight: 0.15 },
  ]);
  const stablecoinExpansion = stablecoinExpansionRaw === null ? 0 : clampPercent(50 + stablecoinExpansionRaw);
  const speculativeHeatRaw = weightedAvailable([
    { value: leverageStressRaw, weight: 0.55 },
    { value: input.futuresVolumeTrend === null ? null : Math.max(0, input.futuresVolumeTrend) * 1.7, weight: 0.25 },
    { value: input.spotVolumeTrend === null ? null : -Math.max(0, input.spotVolumeTrend) * 0.7, weight: 0.2 },
  ]);
  const speculativeHeat = speculativeHeatRaw === null ? 0 : clampPercent(50 + speculativeHeatRaw * 0.42);
  const riskCompression = liquidityScoreSignedRaw === null || leverageStressRaw === null ? 0 : clampPercent(50 + liquidityScoreSignedRaw * 0.28 - leverageStressRaw * 0.18);
  const rawLiquidityHealthScore = liquidityHealthFromSigned(liquidityScoreSignedRaw);
  const v2State = detectLiquidityV2State({
    liquidityScoreSigned: liquidityScoreSignedRaw,
    macroLiquidityScore,
    cryptoLiquidityScore,
    realSpotLiquidityScore,
    leveragedLiquidityScore,
    leverageStress: leverageStressRaw,
    sustainabilityScore: liquiditySustainabilityScore,
    stablecoinScore,
    btcEtfFlow: input.btcEtfFlow,
  });
  const liquiditySignals = snapshot.signals.filter((signal) => ["price", "macro", "liquidity", "stablecoins", "leverage"].includes(signal.group));
  const confidenceDetail = calculateAdaptiveModuleConfidence({
    moduleName: "Free-data Liquidity Proxy Engine",
    signals: liquiditySignals,
    requiredGroups: ["price", "macro", "liquidity", "stablecoins"],
    criticalKeys: ["dxy_trend_24h", "us10y_trend_24h", "stablecoin_market_cap_7d"],
    signalAgreement: macroLiquidityScore === null || cryptoLiquidityScore === null ? 45 : 72 - Math.min(40, Math.abs(macroLiquidityScore - cryptoLiquidityScore) * 0.25),
    historicalConsistency: 67,
    marketConfirmation: input.btcEtfFlow === null || input.spotVolumeTrend === null ? 35 : Math.max(35, 100 - Math.abs(input.btcEtfFlow / 6_000_000 - input.spotVolumeTrend)),
  });
  const scores = deriveBaseScores();
  const invalidReason = validationReason(snapshot.signals, ["dxy_trend_24h", "us10y_trend_24h", "stablecoin_market_cap_7d"]);
  const proxyUsable = proxySnapshot.sourceType !== "unavailable" && proxySnapshot.cryptoLiquidityProxyScore !== null;
  const effectiveInvalidReason = proxyUsable ? null : invalidReason;
  const proxyConfidence = proxyUsable && proxySnapshot.confidence !== null ? proxySnapshot.confidence : null;
  const rawConfidenceScore =
    proxyConfidence !== null
      ? clampPercent((confidenceDetail.score ?? proxyConfidence) * 0.38 + proxyConfidence * 0.62 - proxySnapshot.unavailablePremiumInputs.length * 2)
      : confidenceDetail.score ?? 0;
  const etfMissing = input.btcEtfFlow === null && input.ethEtfFlow === null;
  const exchangeFlowsMissing = input.exchangeInflows === null || input.exchangeOutflows === null;
  const stablecoinLayerMissing = input.stablecoinMarketCapTrend === null && input.usdtSupplyTrend === null && input.usdcSupplyTrend === null;
  const confidenceCap = Math.min(
    etfMissing && exchangeFlowsMissing ? 55 : exchangeFlowsMissing ? 65 : etfMissing ? 70 : 100,
    stablecoinLayerMissing && exchangeFlowsMissing && etfMissing ? 40 : stablecoinLayerMissing && exchangeFlowsMissing ? 55 : stablecoinLayerMissing ? 70 : 100,
  );
  const liquidityRequiredKeys = [
    "dxy_trend_24h",
    "us10y_trend_24h",
    "total_stablecoin_market_cap_usd",
    "stablecoin_market_cap_7d",
    "stablecoin_market_cap_30d",
    "usdt_supply_7d",
    "usdt_supply_30d",
    "usdc_supply_7d",
    "usdc_supply_30d",
    "spot_volume_btc_24h",
    "btc_etf_flow_7d",
    "eth_etf_flow_7d",
    "exchange_inflows",
    "exchange_outflows",
    "open_interest_btc_24h",
    "funding_btc",
  ];
  const confidenceCalibration = calibrateConfidenceByCoverage({
    rawConfidence: clampPercent(Math.min(rawConfidenceScore, confidenceCap)),
    signals: snapshot.signals,
    requiredKeys: liquidityRequiredKeys,
    missingPenaltyKeys: ["btc_etf_flow_7d", "eth_etf_flow_7d", "exchange_inflows", "exchange_outflows", "open_interest_btc_24h", "funding_btc"],
    maxAgeMinutesByKey: {
      total_stablecoin_market_cap_usd: 3 * 24 * 60,
      stablecoin_market_cap_7d: 3 * 24 * 60,
      stablecoin_market_cap_30d: 3 * 24 * 60,
      usdt_supply_7d: 3 * 24 * 60,
      usdt_supply_30d: 3 * 24 * 60,
      usdc_supply_7d: 3 * 24 * 60,
      usdc_supply_30d: 3 * 24 * 60,
      btc_etf_flow_7d: 7 * 24 * 60,
      eth_etf_flow_7d: 7 * 24 * 60,
    },
    proxyDerived: proxySnapshot.sourceType === "proxy" || proxySnapshot.sourceType === "derived",
  });
  const missingStructuralLiquidityPenalty = [
    input.btcEtfFlow,
    input.ethEtfFlow,
    input.exchangeInflows,
    input.exchangeOutflows,
    input.spotVolumeTrend,
  ].filter((item) => item === null).length * 5;
  const staleLiquidityPenalty = confidenceCalibration.staleSignals.length * 4;
  const liquidityHealthScore = rawLiquidityHealthScore === null
    ? null
    : clampPercent(
        Math.min(
          rawLiquidityHealthScore,
          liquiditySustainabilityScore ?? rawLiquidityHealthScore,
          confidenceCalibration.independentSourceCount >= 2 ? confidenceCalibration.dataCoveragePercent + 12 : confidenceCalibration.dataCoveragePercent,
        ) - missingStructuralLiquidityPenalty - staleLiquidityPenalty,
      );
  const strictClassification = classifyLiquidityHealth(liquidityHealthScore);
  const liquidityState = liquidityStateFromStrict(strictClassification.class, leverageStressRaw);
  const confidenceScore = confidenceCalibration.score;
  const outputConfidenceDetail =
    proxyConfidence !== null
      ? {
          ...confidenceDetail,
          available: true,
          score: confidenceScore,
          label: confidenceLabel(confidenceScore),
          formula: `${confidenceDetail.formula} برای حالت proxy، confidence نهایی از ترکیب adaptive confidence و confidence سیگنال‌های مشتق‌شده ساخته می‌شود، سپس با پوشش داده، تازگی و نبود premium inputs سقف‌گذاری می‌شود.`,
          explanation:
            confidenceCalibration.reason ||
            "اطمینان نقدینگی از داده‌های رایگان، proxyهای مشتق‌شده، تازگی منابع و جریمه نبود ETF/exchange-reserve مستقیم محاسبه شده است؛ بنابراین نبود داده پریمیوم خروجی را قطع نمی‌کند.",
        }
      : {
          ...confidenceDetail,
          score: confidenceScore,
          label: confidenceLabel(confidenceScore),
          formula: `${confidenceDetail.formula} سپس با پوشش داده، تازگی و نبود ETF/Exchange Flow سقف‌گذاری می‌شود.`,
          explanation: confidenceCalibration.reason || confidenceDetail.explanation,
        };
  const stablecoinBiasScore = scoreStablecoins(input.stablecoinMarketCapTrend);
  const etfBiasScore = scoreEtfFlow(input.btcEtfFlow);
  const exchangeFlowScore = scoreExchangeFlows(input);
  const spotContributionScore = input.spotVolumeTrend === null ? null : clampSigned(input.spotVolumeTrend * 2.2);
  const derivativesContributionScore = leveragedLiquidityScore === null ? null : clampSigned((50 - leveragedLiquidityScore) * 0.8);
  const sentimentSignalScore = signalValue(snapshot.byKey, "news_sentiment_macro");
  const sentimentContributionScore = sentimentSignalScore === null ? null : clampSigned(sentimentSignalScore * 0.25);
  const macroHealth = signedToHealthScore(macroLiquidityScore);
  const realSpotHealth = signedToHealthScore(realSpotLiquidityScore);
  const stablecoinHealth = signedToHealthScore(stablecoinBiasScore);
  const etfHealth = signedToHealthScore(etfBiasScore);
  const exchangeFlowHealth = signedToHealthScore(exchangeFlowScore);
  const leveragedHealth = leveragedLiquidityScore;
  const liquidityRegime = deriveLiquidityRegimeV2({
    macroHealth,
    realSpotHealth,
    leveragedHealth,
    stablecoinHealth,
    etfHealth,
    exchangeFlowHealth,
    sustainability: liquiditySustainabilityScore,
    leverageStress: leverageStressRaw,
    coverage: confidenceCalibration.dataCoveragePercent,
    missingSignals: confidenceCalibration.missingSignals,
  });
  const stablecoinTrend = stablecoinBiasScore === null ? "mixed" : biasFromScore(stablecoinBiasScore);
  const etfFlowStatus = etfBiasScore === null ? "mixed" : biasFromScore(etfBiasScore);
  const qualityScore = calculateDataQualityScore({ signals: snapshot.signals, requiredSignals: 12 });
  const liquidityContributionBreakdown = [
    {
      layer: "macro" as const,
      labelFa: "Macro Contribution",
      contribution: macroLiquidityScore === null ? null : Math.round(macroLiquidityScore * 0.42),
      source: "DXY + US10Y",
    },
    {
      layer: "stablecoin" as const,
      labelFa: "Stablecoin Contribution",
      contribution: stablecoinBiasScore === null ? null : Math.round(stablecoinBiasScore * 0.145),
      source: "DefiLlama stablecoin trend",
    },
    {
      layer: "etf" as const,
      labelFa: "ETF Contribution",
      contribution: etfBiasScore === null ? null : Math.round(etfBiasScore * 0.116),
      source: "BTC/ETH ETF flow module",
    },
    {
      layer: "spot" as const,
      labelFa: "Spot Contribution",
      contribution: spotContributionScore === null ? null : Math.round(spotContributionScore * 0.087),
      source: "Spot volume trend",
    },
    {
      layer: "derivatives" as const,
      labelFa: "Derivative Contribution",
      contribution: derivativesContributionScore === null ? null : Math.round(derivativesContributionScore * 0.116),
      source: "Funding, open interest and futures/spot volume pressure",
    },
    {
      layer: "sentiment" as const,
      labelFa: "Sentiment Contribution",
      contribution: sentimentContributionScore === null ? null : 0,
      source: sentimentContributionScore === null ? "Market-relevant sentiment unavailable" : `Diagnostic only: sentiment pressure ${Math.round(sentimentContributionScore)}`,
    },
  ];

  const warnings = [
    leverageStressRaw !== null && realSpotLiquidityScore !== null && leverageStressRaw >= 72 && realSpotLiquidityScore <= 10
      ? "هشدار: اهرم معاملاتی بالاست اما نقدینگی اسپات تأیید کافی ندارد؛ احتمال رالی اهرمی یا دام لیکوییدیشن افزایش می‌یابد."
      : "",
    input.btcEtfFlow === null ? "جریان ETF بیت‌کوین ناموجود است؛ موتور اجازه نمی‌دهد این کانال به‌صورت ساختگی به نفع یا ضرر بازار وزن بگیرد." : "",
    exchangeFlowsMissing ? "ورودی/خروجی صرافی‌ها از منبع معتبر در دسترس نیست؛ confidence نقدینگی سقف‌گذاری شده و هشدارهای نقدینگی نباید High شوند." : "",
    stablecoinScore !== null && stablecoinScore <= 0 ? "رشد استیبل‌کوین‌ها زیر آستانه حمایتی ۰٫۳۵٪ هفتگی است؛ پشتوانه نقدینگی نقدی ضعیف‌تر از حالت expansion است." : "",
    macroLiquidityScore !== null && macroLiquidityScore < -20 ? "DXY یا US10Y در حال فشار به نقدینگی کلان هستند؛ این کانال می‌تواند اثر خبرهای مثبت کریپتو را محدود کند." : "",
  ].filter(Boolean);

  const decomposition = [
    `نوع داده: ${proxySnapshot.sourceType === "proxy" ? "proxy/derived" : proxySnapshot.sourceType}؛ نبود منابع premium فقط confidence را کاهش می‌دهد و خروجی core را قطع نمی‌کند.`,
    `نقدینگی واقعی اسپات: ${realSpotLiquidityScore ?? "ناموجود"}/100؛ آستانه حمایتی زمانی فعال است که استیبل‌کوین‌ها بالای ۰٫۳۵٪ رشد کنند و ETF/حجم اسپات هم‌زمان مثبت باشند.`,
    `نقدینگی اهرمی: ${leveragedLiquidityScore ?? "ناموجود"}/100؛ بالاتر از ۶۵ یعنی حرکت بیشتر به OI، Funding Rate (نرخ فاندینگ) و futures volume وابسته است.`,
    `نقدینگی کلان: ${macroLiquidityScore ?? "ناموجود"}/100؛ DXY مثبت و رشد US10Y این بخش را منفی می‌کند.`,
    `پایداری نقدینگی: ${liquiditySustainabilityScore ?? "ناموجود"}/100؛ زیر ۴۵ یعنی ادامه حرکت بدون تأیید اسپات و استیبل‌کوین شکننده است.`,
    `سقف confidence نقدینگی: ${confidenceCap}/100؛ ETF یا exchange flow ناموجود، سقف را پایین می‌آورد.`,
    `طبقه‌بندی سخت‌گیرانه: ${strictClassification.labelFa} با امتیاز سلامت ${liquidityHealthScore ?? "ناموجود"}/100؛ coverage ورودی ${confidenceCalibration.dataCoveragePercent}/100 است.`,
    `رژیم نقدینگی V2: ${liquidityRegimeV2Label(liquidityRegime.regime)} با confidence ${liquidityRegime.confidence}/100؛ این رژیم از تفکیک ماکرو، اسپات واقعی، ETF، استیبل‌کوین، exchange flow و اهرم ساخته شده است.`,
    `Liquidity Contribution Breakdown: ${liquidityContributionBreakdown.map((item) => `${item.labelFa}: ${item.contribution ?? "Missing"}`).join("؛ ")}؛ Final Score: ${liquidityHealthScore ?? "ناموجود"}/100.`,
  ];

  const strictNarrative = strictLiquidityNarrative({
    score: liquidityHealthScore,
    labelFa: strictClassification.labelFa,
    missingInputs: confidenceCalibration.missingSignals,
    staleCount: confidenceCalibration.staleSignals.length,
  });

  const scenarioExplanation =
    effectiveInvalidReason
      ? `داده کافی برای تحلیل معتبر وجود ندارد. ${effectiveInvalidReason}`
      : v2State === "speculative_overheating"
        ? `وضعیت نقدینگی «${liquidityV2Label(v2State)}» است: leverage stress بالای ۷۲ قرار دارد، اما نقدینگی واقعی اسپات به آستانه حمایتی نرسیده است. اگر Funding Rate (نرخ فاندینگ) و Open Interest (موقعیت‌های باز) رشد کنند ولی ETF یا stablecoin supply تأیید ندهند، حرکت قیمت بیشتر مستعد برگشت تند و لیکوییدیشن است.`
        : v2State === "weak_participation_rally"
          ? `وضعیت نقدینگی «${liquidityV2Label(v2State)}» است: قیمت یا بتای بازار می‌تواند بالا برود، اما پشتوانه آن از سمت ETF، استیبل‌کوین و حجم اسپات هنوز کافی نیست. تداوم این سناریو نیاز دارد stablecoin market cap بالای میانگین ۷ روزه رشد کند و DXY زیر روند کوتاه‌مدت خود برگردد.`
          : v2State === "liquidity_squeeze"
            ? `وضعیت نقدینگی «${liquidityV2Label(v2State)}» است: کانال دلار/نرخ و جریان‌های کریپتو هم‌زمان فشارزا هستند. در چنین ساختاری، BTC و SOL معمولاً تا وقتی DXY و US10Y آرام نشوند یا ETF inflow برگردد، با سقف‌گذاری ریسک مواجه می‌شوند.`
            : v2State === "healthy_expansion"
              ? `وضعیت نقدینگی «${liquidityV2Label(v2State)}» است: نقدینگی واقعی اسپات مثبت است، اهرم داغ نشده و فشار DXY/US10Y از حد بحرانی عبور نکرده است. اعتبار این سناریو با رشد پایدار استیبل‌کوین‌ها و تداوم ETF inflow تقویت می‌شود.`
              : `وضعیت نقدینگی «${liquidityV2Label(v2State)}» است. موتور بین نقدینگی اسپات، اهرمی و کلان تفکیک می‌کند؛ تا وقتی پایداری نقدینگی بالای ۵۸ نرود، خروجی به‌عنوان حمایت پایدار برای ریسک‌پذیری تفسیر نمی‌شود.`;
  const explanation = effectiveInvalidReason
    ? scenarioExplanation
    : enforceLiquidityNarrativeConsistency({
        healthScore: liquidityHealthScore,
        labelFa: strictClassification.labelFa,
        narrative: `${strictNarrative} ${scenarioExplanation}`,
        fallback: strictNarrative,
      });

  return {
    ...scores,
    condition: strictClassification.condition === "Unclear" ? conditionFromState(liquidityState) : strictClassification.condition,
    liquidityState,
    v2State,
    liquidityRegimeV2: liquidityRegime.regime,
    liquidityRegimeLabelFa: liquidityRegimeV2Label(liquidityRegime.regime),
    liquidityRegimeConfidence: liquidityRegime.confidence,
    liquidityBottlenecks: liquidityRegime.bottlenecks,
    liquidityConfirmations: liquidityRegime.confirmations,
    liquidityRegimeNarrativeFa: liquidityRegime.narrativeFa,
    liquidityLayerScores: {
      macro: macroHealth,
      realSpot: realSpotHealth,
      leveraged: leveragedHealth,
      stablecoin: stablecoinHealth,
      etf: etfHealth,
      exchangeFlows: exchangeFlowHealth,
    },
    strictLiquidityClass: strictClassification.class,
    strictLiquidityLabelFa: strictClassification.labelFa,
    liquidityScoreSigned,
    liquidityHealthScore: liquidityHealthScore ?? undefined,
    liquidityScore: liquidityHealthScore ?? clampPercent(50 + liquidityScoreSigned / 2),
    macroLiquidityScore: macroLiquidityScore ?? 0,
    cryptoLiquidityScore: cryptoLiquidityScore ?? 0,
    realSpotLiquidityScore: realSpotLiquidityScore ?? undefined,
    leveragedLiquidityScore: leveragedLiquidityScore ?? undefined,
    liquiditySustainabilityScore: liquiditySustainabilityScore ?? undefined,
    stablecoinTrend,
    etfFlowStatus,
    leverageStress,
    institutionalFlow,
    stablecoinExpansion,
    speculativeHeat,
    riskCompression,
    confidence: confidenceScore,
    confidenceDetail: outputConfidenceDetail,
    dataCoveragePercent: confidenceCalibration.dataCoveragePercent,
    confidenceCalibrationReason: confidenceCalibration.reason,
    formula:
      "امتیاز نقدینگی = ۰٫۴۲ × نقدینگی کلان + ۰٫۵۸ × نقدینگی کریپتو؛ نقدینگی کلان از فشار معکوس DXY و US10Y ساخته می‌شود؛ نقدینگی کریپتو از استیبل‌کوین‌ها، جریان ETF، ذخایر صرافی و حجم اسپات وزن می‌گیرد.",
    decomposition,
    liquidityContributionBreakdown,
    warnings,
    explanation,
    historicalComparison:
      liquidityScoreSigned < -20
        ? "این شرایط به فازهای tightening شبیه‌تر است تا expansion 2021؛ تفاوت مهم این است که کانال ETF فقط در صورت داده معتبر می‌تواند بخشی از فشار را کاهش دهد."
        : "این وضعیت فقط در صورت تایید stablecoin expansion و spot volume می‌تواند به چرخه‌های liquidity expansion شبیه شود؛ صرف رشد futures volume کافی نیست.",
    dataQuality: effectiveInvalidReason
      ? "unavailable"
      : proxyUsable
        ? proxySnapshot.quality
        : dataQualityLabel(
            Math.min(
              qualityScore,
              calculateDataQualityScore({ signals: snapshot.signals.filter((signal) => ["price", "macro", "liquidity", "stablecoins", "leverage"].includes(signal.group)), requiredSignals: 6 }),
            ),
          ) ?? liquidityDataQuality(snapshot.signals),
    sourceType: proxySnapshot.sourceType,
    unavailablePremiumInputs: proxySnapshot.unavailablePremiumInputs,
    missingInputs: Array.from(new Set([
      ...(proxySnapshot.payload && Array.isArray(proxySnapshot.payload.missingInputs) ? proxySnapshot.payload.missingInputs as string[] : []),
      ...confidenceCalibration.missingSignals,
    ])),
    proxySignals: ["macro_pressure_proxy", "crypto_liquidity_proxy", "stablecoin_liquidity_signal"],
    lastUpdatedAt: getEngineLastUpdatedAt(),
  };
}

export function getLiquidityReport() {
  return calculateLiquidityEngine();
}
