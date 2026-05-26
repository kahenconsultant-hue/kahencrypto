import type {
  AssetSymbol,
  CorrelationSignal,
  DirectionalBias,
  EngineRegimeState,
  LiquidityEngineOutput,
  MacroRegimeLabel,
  MarketRegime,
  MarketRegimeEngineOutput,
  NormalizedSignal,
  RegimeNuance,
} from "@/lib/types";
import { calculateAdaptiveModuleConfidence } from "@/server/analytics/adaptive-confidence-engine";
import { getDynamicCorrelationReport } from "@/server/analytics/correlation-engine";
import { buildRegimeInputSnapshot } from "@/server/analytics/derived-signal-engine";
import { getLiquidityReport } from "@/server/analytics/liquidity-engine";
import { deriveBaseScores, getEngineLastUpdatedAt, getSignalSnapshot, weightedAverage } from "@/server/analytics/market-signals";
import { confidenceLabel } from "@/server/analytics/quality-engine";
import { clampPercent } from "@/server/analytics/scoring-engine";
import { getIntelligenceReliabilityReportSync } from "@/server/intelligence/reliability-engine";

export interface RegimeInputVector {
  btcTrend: number | null;
  ethTrend: number | null;
  solTrend: number | null;
  nasdaqTrend: number | null;
  dxyTrend: number | null;
  us10yTrend: number | null;
  goldTrend: number | null;
  vixTrend: number | null;
  stablecoinTrend: number | null;
  btcEtfFlow: number | null;
  ethEtfFlow: number | null;
  fundingRate: number | null;
  openInterest: number | null;
  newsSentiment: number | null;
  geopoliticalScore: number | null;
}

function value(signals: Record<string, NormalizedSignal>, key: string) {
  return signals[key]?.value ?? null;
}

export function buildRegimeInput(): RegimeInputVector {
  const { byKey } = getSignalSnapshot();
  return {
    btcTrend: value(byKey, "btc_trend_24h"),
    ethTrend: value(byKey, "eth_trend_24h"),
    solTrend: value(byKey, "sol_trend_24h"),
    nasdaqTrend: value(byKey, "nasdaq_trend_24h"),
    dxyTrend: value(byKey, "dxy_trend_24h"),
    us10yTrend: value(byKey, "us10y_trend_24h"),
    goldTrend: value(byKey, "gold_trend_24h"),
    vixTrend: value(byKey, "vix_trend_24h"),
    stablecoinTrend: value(byKey, "stablecoin_market_cap_7d"),
    btcEtfFlow: value(byKey, "btc_etf_flow_24h"),
    ethEtfFlow: value(byKey, "eth_etf_flow_24h"),
    fundingRate: value(byKey, "funding_btc"),
    openInterest: value(byKey, "open_interest_btc_24h"),
    newsSentiment: value(byKey, "news_sentiment_macro"),
    geopoliticalScore: value(byKey, "geopolitical_event_score"),
  };
}

export function mapEngineRegimeToLegacy(regime: EngineRegimeState): MarketRegime {
  const map: Record<EngineRegimeState, MarketRegime> = {
    risk_on: "Risk-On",
    risk_off: "Risk-Off",
    macro_uncertainty: "Macro Uncertainty",
    liquidity_expansion: "Liquidity Expansion",
    leverage_overheating: "Leverage Overheating",
    panic: "Panic",
    accumulation: "ETF Accumulation",
    distribution: "ETF Distribution",
    euphoric: "Euphoria",
    defensive: "Geopolitical Stress",
  };

  return map[regime];
}

function labelToEngine(label: MacroRegimeLabel): EngineRegimeState {
  const map: Record<MacroRegimeLabel, EngineRegimeState> = {
    "Risk-On Expansion": "risk_on",
    "Weak Risk-On": "risk_on",
    "Fragile Risk-On": "risk_on",
    "Liquidity-Constrained Risk-On": "risk_on",
    "Risk-Off Defensive": "risk_off",
    "Liquidity Squeeze": "risk_off",
    "Dollar Strength Pressure": "macro_uncertainty",
    "Rates Shock": "macro_uncertainty",
    "Crypto-Specific Bullish": "accumulation",
    "Crypto-Specific Stress": "distribution",
    "Geopolitical Shock": "defensive",
    "Neutral / Transition": "macro_uncertainty",
    "High Volatility Unclear Regime": "panic",
  };

  return map[label];
}

const regimeLabelFa: Record<MacroRegimeLabel, string> = {
  "Risk-On Expansion": "گسترش ریسک‌پذیری",
  "Weak Risk-On": "ریسک‌پذیری ضعیف",
  "Fragile Risk-On": "ریسک‌پذیری شکننده",
  "Liquidity-Constrained Risk-On": "ریسک‌پذیری محدودشده با نقدینگی",
  "Risk-Off Defensive": "دفاعی / ریسک‌گریز",
  "Liquidity Squeeze": "فشار نقدینگی",
  "Dollar Strength Pressure": "فشار ناشی از تقویت دلار",
  "Rates Shock": "شوک نرخ بهره",
  "Crypto-Specific Bullish": "حمایت اختصاصی بازار کریپتو",
  "Crypto-Specific Stress": "تنش اختصاصی بازار کریپتو",
  "Geopolitical Shock": "شوک ژئوپلیتیک",
  "Neutral / Transition": "خنثی / در حال گذار",
  "High Volatility Unclear Regime": "نوسان بالا با رژیم نامشخص",
};

function formatNullableCorrelation(value: number | null | undefined) {
  return typeof value === "number" ? value.toFixed(2) : "نمونه ناکافی";
}

function regimeDataQuality(signals: NormalizedSignal[]) {
  const relevant = signals.filter((signal) => signal.value !== null);
  if (!relevant.length || signals.every((signal) => signal.quality === "unavailable")) return "unavailable" as const;
  if (signals.some((signal) => signal.quality === "estimated")) return "estimated" as const;
  if (signals.some((signal) => signal.quality === "unavailable")) return "partial_live" as const;
  if (signals.some((signal) => signal.quality === "delayed")) return "delayed" as const;
  return "live" as const;
}

function cryptoMomentum(input: RegimeInputVector) {
  return weightedAverage([
    { value: input.btcTrend ?? 0, weight: 0.45 },
    { value: input.ethTrend ?? 0, weight: 0.3 },
    { value: input.solTrend ?? 0, weight: 0.25 },
  ]);
}

function scoreRegimeCandidates(input: RegimeInputVector, liquidityScore: number) {
  const dxyUp = Math.max(0, input.dxyTrend ?? 0) * 26;
  const ratesUp = Math.max(0, input.us10yTrend ?? 0) * 210;
  const nasdaqDown = Math.max(0, -(input.nasdaqTrend ?? 0)) * 18;
  const momentum = cryptoMomentum(input);
  const cryptoDown = Math.max(0, -momentum) * 15;
  const stablecoinDown = Math.max(0, -(input.stablecoinTrend ?? 0)) * 24;
  const etfPositive = Math.max(0, input.btcEtfFlow ?? 0) / 5_000_000;
  const etfNegative = Math.max(0, -(input.btcEtfFlow ?? 0)) / 5_000_000;
  const leverageHeat = Math.max(0, input.openInterest ?? 0) * 4 + Math.max(0, input.fundingRate ?? 0) * 1000;
  const vixShock = Math.max(0, input.vixTrend ?? 0) * 3.3;
  const geopolitics = input.geopoliticalScore ?? 0;
  const goldUp = Math.max(0, input.goldTrend ?? 0) * 18;
  const cryptoUp = Math.max(0, momentum) * 14;
  const riskOnBase = clampPercent((100 - Math.max(dxyUp, ratesUp)) * 0.22 + Math.max(0, input.nasdaqTrend ?? 0) * 15 + Math.max(0, liquidityScore) * 0.34 + cryptoUp);

  return {
    "Risk-On Expansion": riskOnBase,
    "Weak Risk-On": clampPercent(riskOnBase * 0.72 + Math.max(0, input.nasdaqTrend ?? 0) * 10 + Math.max(0, momentum) * 6),
    "Fragile Risk-On": clampPercent(riskOnBase * 0.56 + leverageHeat * 0.26 + Math.max(0, -liquidityScore) * 0.25 + Math.max(0, input.dxyTrend ?? 0) * 8),
    "Liquidity-Constrained Risk-On": clampPercent(riskOnBase * 0.58 + Math.max(0, -liquidityScore) * 0.36 + dxyUp * 0.12 + ratesUp * 0.1),
    "Risk-Off Defensive": clampPercent(dxyUp * 0.22 + ratesUp * 0.22 + nasdaqDown * 0.22 + cryptoDown * 0.2 + vixShock * 0.14),
    "Liquidity Squeeze": clampPercent(dxyUp * 0.2 + ratesUp * 0.22 + stablecoinDown * 0.18 + etfNegative * 0.22 + Math.max(0, -liquidityScore) * 0.18),
    "Dollar Strength Pressure": clampPercent(dxyUp * 0.55 + cryptoDown * 0.25 + nasdaqDown * 0.2),
    "Rates Shock": clampPercent(ratesUp * 0.58 + nasdaqDown * 0.22 + cryptoDown * 0.2),
    "Crypto-Specific Bullish": clampPercent(etfPositive * 0.42 + Math.max(0, input.stablecoinTrend ?? 0) * 16 + cryptoUp * 0.26 + Math.max(0, -(input.dxyTrend ?? 0)) * 10),
    "Crypto-Specific Stress": clampPercent(etfNegative * 0.3 + leverageHeat * 0.28 + cryptoDown * 0.28 + stablecoinDown * 0.14),
    "Geopolitical Shock": clampPercent(geopolitics * 0.48 + goldUp * 0.28 + vixShock * 0.16 + dxyUp * 0.08),
    "Neutral / Transition": 48,
    "High Volatility Unclear Regime": clampPercent(vixShock * 0.42 + leverageHeat * 0.32 + Math.abs((input.newsSentiment ?? 0)) * 0.26),
  } satisfies Record<MacroRegimeLabel, number>;
}

export function evaluateRiskOnConfirmation(input: RegimeInputVector, liquidity: LiquidityEngineOutput) {
  const momentum = cryptoMomentum(input);
  const flags = {
    nasdaqPositive: (input.nasdaqTrend ?? 0) > 0.15,
    cryptoLiquidityPositive: liquidity.cryptoLiquidityScore > 0 && (liquidity.realSpotLiquidityScore ?? 0) > 0,
    dxyNeutralOrWeakening: input.dxyTrend !== null && input.dxyTrend <= 0.15,
    leverageNotOverheated: liquidity.leverageStress < 70,
    cryptoMomentumAligned: momentum > 0.12 && (input.btcTrend ?? 0) > -0.2 && (input.ethTrend ?? 0) > -0.25 && (input.solTrend ?? 0) > -0.45,
    etfOrStablecoinConfirmation: (input.btcEtfFlow !== null && input.btcEtfFlow > 0) || (input.stablecoinTrend !== null && input.stablecoinTrend >= 0.35),
  };
  const confirmationCount = Object.values(flags).filter(Boolean).length;
  return { flags, confirmationCount, passed: confirmationCount === Object.keys(flags).length };
}

export function applyRegimePenalties(params: {
  label: MacroRegimeLabel;
  rawScore: number;
  input: RegimeInputVector;
  liquidity: LiquidityEngineOutput;
  correlations: CorrelationSignal[];
}) {
  const dxyRising = (params.input.dxyTrend ?? 0) > 0.15;
  const liquidityNegative = params.liquidity.liquidityScoreSigned < 0;
  const correlationUnstable = params.correlations.filter((signal) => signal.state === "unstable" || Math.abs(signal.correlation7D ?? 0) < 0.1).length;
  const riskOnLike =
    params.label === "Risk-On Expansion" ||
    params.label === "Weak Risk-On" ||
    params.label === "Fragile Risk-On" ||
    params.label === "Liquidity-Constrained Risk-On" ||
    params.label === "Crypto-Specific Bullish";
  const contradictionPenalty = riskOnLike && dxyRising && liquidityNegative ? 18 : dxyRising && liquidityNegative ? 8 : 0;
  const liquidityPenalty = riskOnLike ? (params.liquidity.liquidityScoreSigned <= -25 ? 24 : params.liquidity.liquidityScoreSigned <= 0 ? 14 : 0) : 0;
  const leveragePenalty = params.liquidity.leverageStress > 70 ? Math.min(24, 8 + (params.liquidity.leverageStress - 70) * 0.55) : 0;
  const dataQualityPenalty = (params.input.btcEtfFlow === null ? 10 : 0) + (params.liquidity.dataQuality === "unavailable" ? 14 : params.liquidity.dataQuality === "partial_live" ? 5 : 0);
  const correlationPenalty = Math.min(14, correlationUnstable * 3);
  const totalPenalty = contradictionPenalty + liquidityPenalty + leveragePenalty + dataQualityPenalty + correlationPenalty;
  return {
    penalties: {
      contradictionPenalty: Math.round(contradictionPenalty),
      liquidityPenalty: Math.round(liquidityPenalty),
      leveragePenalty: Math.round(leveragePenalty),
      dataQualityPenalty: Math.round(dataQualityPenalty),
      correlationPenalty: Math.round(correlationPenalty),
    },
    totalPenalty: Math.round(totalPenalty),
    finalScore: clampPercent(params.rawScore - totalPenalty),
  };
}

function chooseRegimeNuance(label: MacroRegimeLabel, finalScore: number, totalPenalty: number, confirmationCount: number): RegimeNuance {
  if (label === "Fragile Risk-On" || label === "Liquidity-Constrained Risk-On" || totalPenalty >= 26) return "fragile";
  if (confirmationCount <= 3 || finalScore < 55) return "conflicting";
  if (finalScore >= 75 && totalPenalty <= 10) return "strong";
  return "moderate";
}

function transitionAnalysis(params: {
  label: MacroRegimeLabel;
  nuance: RegimeNuance;
  finalScore: number;
  penalties: ReturnType<typeof applyRegimePenalties>["penalties"];
  input: RegimeInputVector;
  liquidity: LiquidityEngineOutput;
}) {
  const macroPressure = (params.input.dxyTrend ?? 0) > 0.15 || (params.input.us10yTrend ?? 0) > 0.03;
  const leveragePressure = params.liquidity.leverageStress >= 70;
  const liquidityWeak = params.liquidity.liquidityScoreSigned < 0 || (params.liquidity.liquiditySustainabilityScore ?? 50) < 45;
  const probability = clampPercent(34 + params.penalties.contradictionPenalty * 1.2 + params.penalties.liquidityPenalty * 1.1 + params.penalties.leveragePenalty + (macroPressure ? 12 : 0));
  if ((params.label === "Fragile Risk-On" || params.label === "Liquidity-Constrained Risk-On") && (macroPressure || liquidityWeak || leveragePressure)) {
    return {
      state: leveragePressure ? "leverage_instability" : liquidityWeak ? "failed_risk_on" : "macro_deterioration",
      probability,
      targetRegime: "Neutral / Transition" as MacroRegimeLabel,
      explanation: `احتمال گذار به خنثی/دفاعی بالا رفته چون ${macroPressure ? "DXY یا US10Y هنوز فشارزا است" : "فشار ماکرو آرام‌تر است"}، پایداری نقدینگی ${params.liquidity.liquiditySustainabilityScore ?? 0}/100 است و leverage stress روی ${params.liquidity.leverageStress}/100 قرار دارد.`,
    };
  }
  if (params.liquidity.liquiditySustainabilityScore !== undefined && params.liquidity.liquiditySustainabilityScore >= 58 && params.finalScore >= 62) {
    return {
      state: "strengthening_trend",
      probability: clampPercent(42 + params.finalScore * 0.35),
      targetRegime: params.label,
      explanation: "ساختار فعلی در حال تقویت است، چون پایداری نقدینگی بالای ۵۸ قرار دارد و جریمه‌های متناقض رژیم پایین‌تر از آستانه بحرانی هستند.",
    };
  }
  return {
    state: params.nuance === "conflicting" ? "unstable_transition" : "weakening_trend",
    probability: clampPercent(38 + Math.max(0, 60 - params.finalScore) * 0.45),
    targetRegime: "Neutral / Transition" as MacroRegimeLabel,
    explanation: "سیگنال‌ها برای یک رژیم پایدار هم‌جهت نیستند؛ برای تغییر وضعیت باید نقدینگی واقعی، دلار/نرخ و رفتار قیمت حداقل در دو بروزرسانی متوالی هم‌سو شوند.",
  };
}

export function calculateMarketRegime(input: RegimeInputVector = buildRegimeInput()): MarketRegimeEngineOutput {
  const snapshot = getSignalSnapshot();
  const liquidity = getLiquidityReport();
  const reliability = getIntelligenceReliabilityReportSync();
  const regimeInputSnapshot = buildRegimeInputSnapshot();
  const correlations = getDynamicCorrelationReport().signals;
  const candidateScores = scoreRegimeCandidates(input, liquidity.liquidityScoreSigned);
  const scoredCandidates = (Object.entries(candidateScores) as Array<[MacroRegimeLabel, number]>)
    .map(([label, rawScore]) => ({ label, rawScore, ...applyRegimePenalties({ label, rawScore, input, liquidity, correlations }) }))
    .sort((left, right) => right.finalScore - left.finalScore);
  const riskOnConfirmation = evaluateRiskOnConfirmation(input, liquidity);
  let selected = scoredCandidates[0];

  if (selected.label === "Risk-On Expansion" && !riskOnConfirmation.passed) {
    const constrainedLabel: MacroRegimeLabel =
      liquidity.liquidityScoreSigned < 0 || (input.dxyTrend ?? 0) > 0.15
        ? "Liquidity-Constrained Risk-On"
        : liquidity.leverageStress >= 70
          ? "Fragile Risk-On"
          : "Weak Risk-On";
    const rawScore = Math.max(candidateScores[constrainedLabel], selected.rawScore * 0.78);
    selected = { label: constrainedLabel, rawScore, ...applyRegimePenalties({ label: constrainedLabel, rawScore, input, liquidity, correlations }) };
  }

  if ((selected.label === "Weak Risk-On" || selected.label === "Fragile Risk-On" || selected.label === "Liquidity-Constrained Risk-On") && selected.finalScore < 42 && riskOnConfirmation.confirmationCount <= 3) {
    const rawScore = Math.max(candidateScores["Neutral / Transition"], 48);
    selected = { label: "Neutral / Transition", rawScore, ...applyRegimePenalties({ label: "Neutral / Transition", rawScore, input, liquidity, correlations }) };
  }

  const regimeLabel = selected.label;
  const topScore = selected.finalScore;
  const rawRegimeScore = selected.rawScore;
  const regimeNuance = chooseRegimeNuance(regimeLabel, topScore, selected.totalPenalty, riskOnConfirmation.confirmationCount);
  const transition = transitionAnalysis({ label: regimeLabel, nuance: regimeNuance, finalScore: topScore, penalties: selected.penalties, input, liquidity });
  const regime = labelToEngine(regimeLabel);
  const previousRegimeLabel: MacroRegimeLabel = regimeLabel;
  const previousRegime = labelToEngine(previousRegimeLabel);
  const changedLast24h = regimeLabel !== previousRegimeLabel;
  const confirmingSignals = snapshot.signals.filter((signal) => signal.value !== null && signal.quality !== "unavailable");
  const confidenceDetail = calculateAdaptiveModuleConfidence({
    moduleName: "Free-data Market Regime Proxy Engine",
    signals: snapshot.signals,
    requiredGroups: ["price", "macro", "liquidity", "stablecoins", "volatility"],
    criticalKeys: ["btc_trend_24h", "dxy_trend_24h", "us10y_trend_24h"],
    signalAgreement: clampPercent(topScore - selected.totalPenalty * 0.35),
    historicalConsistency: changedLast24h ? 58 : 72,
    marketConfirmation: clampPercent(100 - Math.abs((input.btcTrend ?? 0) - (input.nasdaqTrend ?? 0)) * 8),
  });
  const adaptiveConfidence = confidenceDetail.score === null ? 0 : Math.min(confidenceDetail.score, reliability.confidenceCaps.regime);
  const proxyConfidence =
    regimeInputSnapshot.sourceType !== "unavailable" && regimeInputSnapshot.confidence !== null ? Math.min(regimeInputSnapshot.confidence, reliability.confidenceCaps.regime) : null;
  const cappedConfidence =
    proxyConfidence !== null ? clampPercent(adaptiveConfidence * 0.4 + proxyConfidence * 0.6 - Math.min(8, regimeInputSnapshot.missingInputs.length * 2)) : adaptiveConfidence;
  const outputConfidenceDetail =
    proxyConfidence !== null
      ? {
          ...confidenceDetail,
          available: true,
          score: cappedConfidence,
          label: confidenceLabel(cappedConfidence),
          formula: `${confidenceDetail.formula} برای regime proxy، confidence نهایی با confidence سیگنال‌های مشتق‌شده و سقف reliability ترکیب می‌شود.`,
          explanation: "اطمینان رژیم از هم‌راستایی سیگنال‌های رایگان/پروکسی، کیفیت core data و جریمه داده‌های ناموجود ساخته شده است.",
        }
      : confidenceDetail;
  const scores = deriveBaseScores();
  const btcNasdaq = correlations.find((signal) => signal.assetPair === "BTC ↔ Nasdaq");
  const btcDxy = correlations.find((signal) => signal.assetPair === "BTC ↔ DXY");
  const dominantDrivers = [
    input.dxyTrend !== null ? `شاخص دلار (DXY) طی ۲۴ ساعت ${input.dxyTrend.toFixed(2)}٪ تغییر کرده؛ کانال دلار ${input.dxyTrend > 0 ? "فشارزا" : "حمایتی"} است.` : "داده معتبر برای شاخص دلار در دسترس نیست.",
    input.us10yTrend !== null ? `بازده اوراق ۱۰ ساله آمریکا (US10Y) ${input.us10yTrend.toFixed(2)} واحد تغییر کرده؛ کانال نرخ بهره ${input.us10yTrend > 0 ? "فشارزا" : "آرام‌تر"} است.` : "داده معتبر برای بازده اوراق ۱۰ ساله در دسترس نیست.",
    input.nasdaqTrend !== null ? `Nasdaq طی ۲۴ ساعت ${input.nasdaqTrend.toFixed(2)}٪ تغییر کرده و مسیر ریسک‌پذیری را به‌خصوص برای ETH و SOL منتقل می‌کند.` : "داده معتبر برای Nasdaq در دسترس نیست.",
    `امتیاز نقدینگی: ${liquidity.liquidityScoreSigned}/100؛ نقدینگی اسپات ${liquidity.realSpotLiquidityScore ?? 0}/100، اهرمی ${liquidity.leveragedLiquidityScore ?? 0}/100 و پایداری ${liquidity.liquiditySustainabilityScore ?? 0}/100 است.`,
    `جریمه رژیم: contradiction ${selected.penalties.contradictionPenalty}، liquidity ${selected.penalties.liquidityPenalty}، leverage ${selected.penalties.leveragePenalty}، data ${selected.penalties.dataQualityPenalty}.`,
    `همبستگی ۷ روزه BTC/Nasdaq برابر ${formatNullableCorrelation(btcNasdaq?.correlation7D)} و BTC/DXY برابر ${formatNullableCorrelation(btcDxy?.correlation7D)} است.`,
  ];
  const affectedAssets: AssetSymbol[] =
    regimeLabel === "Geopolitical Shock"
      ? ["BTC", "USDT", "DXY", "Gold", "US10Y"]
      : regimeLabel === "Crypto-Specific Bullish" || regimeLabel === "Crypto-Specific Stress"
        ? ["BTC", "ETH", "SOL", "USDT"]
        : ["BTC", "ETH", "SOL", "DXY", "Nasdaq", "US10Y", "Gold"];
  const invalidationSignals =
    regimeLabel === "Fragile Risk-On" || regimeLabel === "Liquidity-Constrained Risk-On" || regimeLabel === "Weak Risk-On"
      ? ["رشد استیبل‌کوین‌ها بالای ۰٫۳۵٪ هفتگی تثبیت شود.", "DXY زیر روند کوتاه‌مدت خود برگردد.", "leverage stress به زیر ۶۵ برسد.", "ETF یا حجم اسپات جریان حمایتی نشان دهد."]
      : regimeLabel === "Liquidity Squeeze" || regimeLabel === "Risk-Off Defensive"
      ? ["شاخص دلار به زیر میانگین ۷ روزه خود برگردد.", "بازده اوراق ۱۰ ساله در دو بروزرسانی پیاپی آرام‌تر شود.", "جریان خالص ETF بیت‌کوین مثبت شود.", "عرض بازار نزدک بهبود پیدا کند."]
      : regimeLabel === "Crypto-Specific Bullish"
        ? ["ورود سرمایه به ETFها معکوس شود.", "ارزش بازار استیبل‌کوین‌ها کوچک‌تر شود.", "نرخ فاندینگ سریع‌تر از حجم اسپات رشد کند.", "BTC تأیید همبستگی با Nasdaq یا Gold را از دست بدهد."]
        : ["در پنجره بروزرسانی بعدی، دست‌کم دو محرک اصلی خلاف جهت فعلی حرکت کنند."];

  return {
    regime,
    regimeLabel,
    regimeNuance,
    confidence: cappedConfidence,
    confidenceDetail: outputConfidenceDetail,
    previousRegime,
    previousRegimeLabel,
    changedLast24h,
    rawRegimeScore,
    finalRegimeScore: topScore,
    penalties: selected.penalties,
    transitionAnalysis: transition,
    transitionProbability: transition.probability,
    keyDrivers: dominantDrivers,
    affectedAssets,
    invalidationSignals,
    explanation:
      regimeInputSnapshot.regime === "insufficient_core_data"
        ? "داده‌های رایگان اصلی برای تشخیص رژیم کافی نیستند؛ سیستم رژیم قطعی تولید نمی‌کند و تا refresh بعدی فقط وضعیت کیفیت داده را نشان می‌دهد."
        : regimeLabel === "Liquidity-Constrained Risk-On"
        ? `ساختار فعلی «${regimeLabelFa[regimeLabel]}» است، نه expansion کامل. Nasdaq بخشی از اشتهای ریسک را حمایت می‌کند، اما امتیاز نقدینگی ${liquidity.liquidityScoreSigned}/100، پایداری نقدینگی ${liquidity.liquiditySustainabilityScore ?? 0}/100، وضعیت ETF ${input.btcEtfFlow === null ? "ناموجود" : "قابل محاسبه"} و leverage stress ${liquidity.leverageStress}/100 اجازه نمی‌دهد رژیم به‌عنوان Risk-On Expansion معتبر طبقه‌بندی شود.`
        : regimeLabel === "Fragile Risk-On"
          ? `ساختار فعلی «${regimeLabelFa[regimeLabel]}» است: حرکت ریسک‌پذیری دیده می‌شود، اما اهرم معاملاتی یا کیفیت نقدینگی پایداری آن را محدود می‌کند. اگر Funding Rate (نرخ فاندینگ) و Open Interest (موقعیت‌های باز) بالاتر بروند بدون اینکه ETF یا استیبل‌کوین تأیید کند، احتمال trap risk افزایش می‌یابد.`
          : regimeLabel === "Weak Risk-On"
            ? `ساختار فعلی «${regimeLabelFa[regimeLabel]}» است: بخشی از قیمت‌ها یا Nasdaq مثبت‌اند، اما همه شرط‌های نهادی برای expansion کامل تأیید نشده است. تا وقتی نقدینگی واقعی و دلار/نرخ هم‌جهت نشوند، این خروجی باید ضعیف‌تر از Risk-On Expansion خوانده شود.`
            : regimeLabel === "Liquidity Squeeze"
        ? "رژیم فعلی «فشار نقدینگی» است: تقویت دلار، بالا ماندن بازده اوراق، ضعف جریان ETF و ناپایداری ریسک‌پذیری به‌صورت هم‌زمان روی کریپتو فشار می‌گذارند. تا وقتی ورودی‌های نقدینگی بهتر نشوند، BTC، ETH و SOL بیشتر شبیه دارایی‌های پرریسک معامله می‌شوند تا پناهگاه امن."
        : regimeLabel === "Risk-Off Defensive"
          ? "رژیم فعلی «دفاعی / ریسک‌گریز» است: فشار کلان بر تیترهای خنثی کریپتو غلبه دارد. طلا می‌تواند از تنش ژئوپلیتیک حمایت بگیرد، اما برای اینکه BTC نقش پناهگاه امن بگیرد باید همبستگی آن با طلا تأیید شود و فشار دلار/نرخ کاهش یابد."
          : regimeLabel === "Crypto-Specific Bullish"
            ? "رژیم فعلی «حمایت اختصاصی بازار کریپتو» است: جریان‌های درون بازار کریپتو آن‌قدر قوی هستند که بخشی از فشار ماکرو را خنثی کنند. اعتبار این روایت به تداوم ETF و رشد استیبل‌کوین‌ها وابسته است، نه صرفاً به تیترهای خبری."
            : `رژیم فعلی «${regimeLabelFa[regimeLabel]}» است. هم‌راستایی سیگنال‌ها کامل نیست، بنابراین شرط ابطال، کیفیت داده و محرک‌های غالب باید کنار نتیجه دیده شوند.`,
    historicalComparison:
      "موتور رژیم، وضعیت فعلی را با چند الگوی تاریخی مقایسه می‌کند: گسترش نقدینگی ۲۰۲۱، چرخه انقباضی ۲۰۲۲، دوره راه‌اندازی ETFها، تنش بانکی و پاکسازی اهرم. snapshot فعلی بیشتر به فشار ماکرو در دوران ETF شباهت دارد تا گسترش فراگیر نقدینگی ۲۰۲۱.",
    dataQuality: regimeInputSnapshot.quality === "unavailable" ? "unavailable" : regimeDataQuality(snapshot.signals),
    sourceType: regimeInputSnapshot.sourceType,
    missingInputs: regimeInputSnapshot.missingInputs,
    proxySignals: regimeInputSnapshot.usedInputs,
    lastUpdatedAt: getEngineLastUpdatedAt(),
    marketRiskScore: scores.marketRiskScore,
    liquidityScore: liquidity.liquidityScore,
    macroStressScore: scores.macroStressScore,
    narrativeStrength: scores.narrativeStrength,
    volatilityRisk: scores.volatilityRisk,
  };
}

export function scoreRegime(input: {
  dxy: number;
  us10y: number;
  nasdaqMomentum: number;
  etfFlows: number;
  fundingRates: number;
  openInterest: number;
  stablecoinSupply: number;
  whaleActivity: number;
  volatility: number;
  sentiment: number;
  macroHeadlineStress: number;
}): { regime: MarketRegime; score: number; explanationFa: string } {
  const output = calculateMarketRegime({
    btcTrend: null,
    ethTrend: null,
    solTrend: null,
    nasdaqTrend: input.nasdaqMomentum / 20,
    dxyTrend: input.dxy / 50,
    us10yTrend: input.us10y / 500,
    goldTrend: null,
    vixTrend: input.volatility / 20,
    stablecoinTrend: input.stablecoinSupply / 25,
    btcEtfFlow: input.etfFlows * 1_000_000,
    ethEtfFlow: null,
    fundingRate: input.fundingRates / 1000,
    openInterest: input.openInterest / 10,
    newsSentiment: input.sentiment - 50,
    geopoliticalScore: input.macroHeadlineStress,
  });

  return { regime: mapEngineRegimeToLegacy(output.regime), score: output.confidence, explanationFa: output.explanation };
}

export function biasForRegimeAsset(regimeLabel: MacroRegimeLabel | undefined, asset: AssetSymbol): DirectionalBias {
  if (!regimeLabel) return "mixed";
  if (regimeLabel === "Risk-On Expansion" || regimeLabel === "Crypto-Specific Bullish") return asset === "DXY" || asset === "US10Y" ? "bearish" : "bullish";
  if (regimeLabel === "Weak Risk-On" || regimeLabel === "Fragile Risk-On" || regimeLabel === "Liquidity-Constrained Risk-On") {
    if (asset === "SOL") return "mixed";
    if (asset === "BTC" || asset === "ETH" || asset === "Nasdaq") return "mixed";
    if (asset === "DXY" || asset === "US10Y") return "bullish";
    return "neutral";
  }
  if (regimeLabel === "Liquidity Squeeze" || regimeLabel === "Rates Shock" || regimeLabel === "Dollar Strength Pressure") {
    if (asset === "DXY" || asset === "US10Y") return "bullish";
    if (asset === "Gold") return regimeLabel === "Rates Shock" ? "mixed" : "neutral";
    return "bearish";
  }
  if (regimeLabel === "Geopolitical Shock") return asset === "Gold" || asset === "DXY" || asset === "US10Y" ? "bullish" : asset === "USDT" ? "mixed" : "mixed";
  if (regimeLabel === "Crypto-Specific Stress") return asset === "USDT" ? "mixed" : "bearish";
  return "mixed";
}

export function getMarketRegimeReport() {
  const engine = calculateMarketRegime();
  const legacyActive = mapEngineRegimeToLegacy(engine.regime);

  return {
    active: legacyActive,
    label: engine.regimeLabel,
    regimeLabel: engine.regimeLabel,
    previousRegime: engine.previousRegime,
    previousRegimeLabel: engine.previousRegimeLabel,
    changedLast24h: engine.changedLast24h,
    transitionProbability: engine.transitionProbability,
    affectedAssets: engine.affectedAssets,
    confidenceDetail: engine.confidenceDetail,
    invalidationSignals: engine.invalidationSignals,
    secondary: ["ETF Accumulation", "Liquidity Contraction", "Geopolitical Stress"] as MarketRegime[],
    confidence: engine.confidence,
    riskScore: engine.marketRiskScore,
    liquidityScore: engine.liquidityScore,
    leverageScore: getLiquidityReport().leverageStress,
    stressScore: engine.macroStressScore,
    interpretationFa: engine.explanation,
    invalidationFa: engine.invalidationSignals?.join(" | ") ?? "برای ابطال، محرک‌های غالب باید خلاف جهت فعلی حرکت کنند.",
    engine,
    inputs: getLiquidityReport(),
    alertContext: engine.keyDrivers,
  };
}
