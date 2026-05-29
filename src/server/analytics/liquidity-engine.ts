import type { DirectionalBias, LiquidityEngineOutput, LiquidityState, LiquidityV2State, NormalizedSignal } from "@/lib/types";
import { calculateAdaptiveModuleConfidence } from "@/server/analytics/adaptive-confidence-engine";
import { buildLiquidityProxySnapshot } from "@/server/analytics/derived-signal-engine";
import { deriveBaseScores, getEngineLastUpdatedAt, getSignalSnapshot, weightedAverage } from "@/server/analytics/market-signals";
import { clampPercent, clampSigned } from "@/server/analytics/scoring-engine";
import { calculateDataQualityScore, confidenceLabel, dataQualityLabel, normalizeSignalScore, validationReason } from "@/server/analytics/quality-engine";

export interface LiquidityInputVector {
  dxyTrend: number | null;
  us10yTrend: number | null;
  stablecoinMarketCapTrend: number | null;
  usdtSupplyTrend: number | null;
  usdcSupplyTrend: number | null;
  btcEtfFlow: number | null;
  ethEtfFlow: number | null;
  exchangeReserveTrend: number | null;
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
    btcEtfFlow: signalValue(byKey, "btc_etf_flow_24h"),
    ethEtfFlow: signalValue(byKey, "eth_etf_flow_24h"),
    exchangeReserveTrend: signalValue(byKey, "exchange_reserves_btc_7d"),
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
  const spot = input.spotVolumeTrend === null ? null : input.spotVolumeTrend * 2.2;
  const futures = input.futuresVolumeTrend === null || input.spotVolumeTrend === null ? null : -Math.max(0, input.futuresVolumeTrend - Math.max(0, input.spotVolumeTrend)) * 1.4;
  const funding = input.fundingRate === null ? null : normalizeSignalScore({ key: "funding_btc", value: input.fundingRate, quality: "live" });
  const openInterest = input.openInterestTrend === null ? null : normalizeSignalScore({ key: "open_interest_btc_24h", value: input.openInterestTrend, quality: "live" });
  const score = weightedAvailable([
    { value: stablecoin, weight: 0.25 },
    { value: etf, weight: 0.2 },
    { value: reserves, weight: 0.1 },
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
  const spot = input.spotVolumeTrend === null ? null : clampSigned(input.spotVolumeTrend * 2.2);
  const score = weightedAvailable([
    { value: stablecoin, weight: 0.3 },
    { value: btcEtf, weight: 0.24 },
    { value: ethEtf, weight: 0.08 },
    { value: reserves, weight: 0.18 },
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
    "open_interest_btc_24h",
    "funding_btc",
    "spot_volume_btc_24h",
    "futures_volume_btc_24h",
  ]);
  const relevant = signals.filter((signal) => relevantKeys.has(signal.key));
  if (!relevant.length || relevant.every((signal) => signal.quality === "unavailable")) return "unavailable" as const;
  if (relevant.some((signal) => signal.quality === "estimated")) return "estimated" as const;
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
  const liquidityState = detectLiquidityStateFromSigned(liquidityScoreSignedRaw, leverageStressRaw);
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
  const confidenceScore =
    proxyConfidence !== null
      ? clampPercent((confidenceDetail.score ?? proxyConfidence) * 0.38 + proxyConfidence * 0.62 - proxySnapshot.unavailablePremiumInputs.length * 2)
      : confidenceDetail.score ?? 0;
  const outputConfidenceDetail =
    proxyConfidence !== null
      ? {
          ...confidenceDetail,
          available: true,
          score: confidenceScore,
          label: confidenceLabel(confidenceScore),
          formula: `${confidenceDetail.formula} برای حالت proxy، confidence نهایی از ترکیب adaptive confidence و confidence سیگنال‌های مشتق‌شده ساخته می‌شود و نبود premium inputs جریمه می‌گیرد.`,
          explanation:
            "اطمینان نقدینگی از داده‌های رایگان، proxyهای مشتق‌شده، تازگی منابع و جریمه نبود ETF/exchange-reserve مستقیم محاسبه شده است؛ بنابراین نبود داده پریمیوم خروجی را قطع نمی‌کند.",
        }
      : confidenceDetail;
  const stablecoinBiasScore = scoreStablecoins(input.stablecoinMarketCapTrend);
  const etfBiasScore = scoreEtfFlow(input.btcEtfFlow);
  const stablecoinTrend = stablecoinBiasScore === null ? "mixed" : biasFromScore(stablecoinBiasScore);
  const etfFlowStatus = etfBiasScore === null ? "mixed" : biasFromScore(etfBiasScore);
  const qualityScore = calculateDataQualityScore({ signals: snapshot.signals, requiredSignals: 12 });

  const warnings = [
    leverageStressRaw !== null && realSpotLiquidityScore !== null && leverageStressRaw >= 72 && realSpotLiquidityScore <= 10
      ? "هشدار: اهرم معاملاتی بالاست اما نقدینگی اسپات تأیید کافی ندارد؛ احتمال رالی اهرمی یا دام لیکوییدیشن افزایش می‌یابد."
      : "",
    input.btcEtfFlow === null ? "جریان ETF بیت‌کوین ناموجود است؛ موتور اجازه نمی‌دهد این کانال به‌صورت ساختگی به نفع یا ضرر بازار وزن بگیرد." : "",
    stablecoinScore !== null && stablecoinScore <= 0 ? "رشد استیبل‌کوین‌ها زیر آستانه حمایتی ۰٫۳۵٪ هفتگی است؛ پشتوانه نقدینگی نقدی ضعیف‌تر از حالت expansion است." : "",
    macroLiquidityScore !== null && macroLiquidityScore < -20 ? "DXY یا US10Y در حال فشار به نقدینگی کلان هستند؛ این کانال می‌تواند اثر خبرهای مثبت کریپتو را محدود کند." : "",
  ].filter(Boolean);

  const decomposition = [
    `نوع داده: ${proxySnapshot.sourceType === "proxy" ? "proxy/derived" : proxySnapshot.sourceType}؛ نبود منابع premium فقط confidence را کاهش می‌دهد و خروجی core را قطع نمی‌کند.`,
    `نقدینگی واقعی اسپات: ${realSpotLiquidityScore ?? "ناموجود"}/100؛ آستانه حمایتی زمانی فعال است که استیبل‌کوین‌ها بالای ۰٫۳۵٪ رشد کنند و ETF/حجم اسپات هم‌زمان مثبت باشند.`,
    `نقدینگی اهرمی: ${leveragedLiquidityScore ?? "ناموجود"}/100؛ بالاتر از ۶۵ یعنی حرکت بیشتر به OI، Funding Rate (نرخ فاندینگ) و futures volume وابسته است.`,
    `نقدینگی کلان: ${macroLiquidityScore ?? "ناموجود"}/100؛ DXY مثبت و رشد US10Y این بخش را منفی می‌کند.`,
    `پایداری نقدینگی: ${liquiditySustainabilityScore ?? "ناموجود"}/100؛ زیر ۴۵ یعنی ادامه حرکت بدون تأیید اسپات و استیبل‌کوین شکننده است.`,
  ];

  const explanation =
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

  return {
    ...scores,
    condition: conditionFromState(liquidityState),
    liquidityState,
    v2State,
    liquidityScoreSigned,
    liquidityScore: clampPercent(50 + liquidityScoreSigned / 2),
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
    formula:
      "امتیاز نقدینگی = ۰٫۴۲ × نقدینگی کلان + ۰٫۵۸ × نقدینگی کریپتو؛ نقدینگی کلان از فشار معکوس DXY و US10Y ساخته می‌شود؛ نقدینگی کریپتو از استیبل‌کوین‌ها، جریان ETF، ذخایر صرافی و حجم اسپات وزن می‌گیرد.",
    decomposition,
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
    missingInputs: proxySnapshot.payload && Array.isArray(proxySnapshot.payload.missingInputs) ? proxySnapshot.payload.missingInputs as string[] : [],
    proxySignals: ["macro_pressure_proxy", "crypto_liquidity_proxy", "stablecoin_liquidity_signal"],
    lastUpdatedAt: getEngineLastUpdatedAt(),
  };
}

export function getLiquidityReport() {
  return calculateLiquidityEngine();
}
