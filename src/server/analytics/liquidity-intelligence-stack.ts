import type { DataSourceStatus, NormalizedSignal } from "@/lib/types";
import { getSignalSnapshot } from "@/server/analytics/market-signals";
import { clampPercent } from "@/server/analytics/scoring-engine";
import { classifyLiquidityHealth, isFreshUsableSignal, signalAgeMinutes, strictLiquidityNarrative } from "@/server/analytics/intelligence-quality";
import { calculateLiquidityEngine } from "@/server/analytics/liquidity-engine";
import { getSentimentReport } from "@/server/analytics/sentiment-engine";

type LiquiditySubEngineId = "stablecoin" | "etf" | "derivatives" | "macro_calendar" | "sentiment";
type LiquidityEngineStatus = "connected" | "degraded" | "missing";

interface LiquiditySubEngine {
  id: LiquiditySubEngineId;
  labelFa: string;
  status: LiquidityEngineStatus;
  score: number | null;
  confidence: number;
  coverage: number;
  freshness: DataSourceStatus;
  sourceCount: number;
  lastUpdated: string | null;
  missingInputs: string[];
  usedInputs: string[];
  classification: string;
  explanationFa: string;
  details: Record<string, unknown>;
}

function signal(key: string) {
  return getSignalSnapshot().byKey[key];
}

function usable(key: string, maxAgeMinutes?: number) {
  const item = signal(key);
  return isFreshUsableSignal(item, maxAgeMinutes) ? item.value : null;
}

function sourceCount(keys: string[]) {
  return new Set(keys.map((key) => signal(key)?.source).filter(Boolean)).size;
}

function latestTimestamp(keys: string[]) {
  const timestamps = keys.map((key) => signal(key)?.timestamp).filter((timestamp): timestamp is string => Boolean(timestamp));
  if (!timestamps.length) return null;
  return timestamps.sort((a, b) => Date.parse(b) - Date.parse(a))[0] ?? null;
}

function freshness(keys: string[], maxAgeMinutes = 90): DataSourceStatus {
  const available = keys.map(signal).filter((item): item is NormalizedSignal => Boolean(item && item.value !== null && item.quality !== "unavailable"));
  if (!available.length) return "unavailable";
  if (available.some((item) => item.quality === "estimated")) return "estimated";
  if (available.some((item) => item.quality === "proxy")) return "proxy";
  const worstAge = Math.max(...available.map((item) => signalAgeMinutes(item) ?? 0));
  if (worstAge > maxAgeMinutes) return "unavailable";
  if (worstAge > Math.min(90, maxAgeMinutes / 2)) return "delayed";
  return available.length === keys.length ? "live" : "partial_live";
}

function coverage(keys: string[], maxAgeMinutes?: number) {
  if (!keys.length) return 0;
  return clampPercent((keys.filter((key) => usable(key, maxAgeMinutes) !== null).length / keys.length) * 100);
}

function buildInputLists(keys: string[], maxAgeMinutes?: number) {
  return {
    usedInputs: keys.filter((key) => usable(key, maxAgeMinutes) !== null),
    missingInputs: keys.filter((key) => usable(key, maxAgeMinutes) === null),
  };
}

function scoreGrowth(value: number | null) {
  if (value === null) return null;
  if (value <= -1) return 15;
  if (value <= -0.25) return 28;
  if (value < 0.35) return 50;
  if (value < 1) return 68;
  return 84;
}

function scoreEtfFlow(value: number | null) {
  if (value === null) return null;
  if (value <= -500_000_000) return 15;
  if (value <= -100_000_000) return 30;
  if (Math.abs(value) < 100_000_000) return 50;
  if (value < 500_000_000) return 68;
  return 84;
}

function weightedScore(values: Array<{ value: number | null; weight: number }>) {
  const available = values.filter((item): item is { value: number; weight: number } => item.value !== null && Number.isFinite(item.value));
  if (!available.length) return null;
  const total = available.reduce((sum, item) => sum + item.weight, 0);
  return clampPercent(available.reduce((sum, item) => sum + item.value * item.weight, 0) / total);
}

function healthStatus(score: number | null, coveragePercent: number): LiquidityEngineStatus {
  if (score === null || coveragePercent === 0) return "missing";
  return coveragePercent >= 70 ? "connected" : "degraded";
}

function stablecoinClassification(score: number | null) {
  if (score === null) return "Missing";
  if (score < 25) return "Contraction";
  if (score < 45) return "Weak";
  if (score < 60) return "Neutral";
  if (score < 75) return "Expansion";
  return "Strong Expansion";
}

function buildStablecoinEngine(): LiquiditySubEngine {
  const stablecoinMaxAgeMinutes = 3 * 24 * 60;
  const keys = [
    "usdt_supply_7d",
    "usdt_supply_30d",
    "usdc_supply_7d",
    "usdc_supply_30d",
    "total_stablecoin_market_cap_usd",
    "stablecoin_market_cap_7d",
    "stablecoin_market_cap_30d",
    "stablecoin_dominance",
  ];
  const inputLists = buildInputLists(keys, stablecoinMaxAgeMinutes);
  const score = weightedScore([
    { value: scoreGrowth(usable("stablecoin_market_cap_7d", stablecoinMaxAgeMinutes)), weight: 0.28 },
    { value: scoreGrowth(usable("stablecoin_market_cap_30d", stablecoinMaxAgeMinutes)), weight: 0.2 },
    { value: scoreGrowth(usable("usdt_supply_7d", stablecoinMaxAgeMinutes)), weight: 0.18 },
    { value: scoreGrowth(usable("usdt_supply_30d", stablecoinMaxAgeMinutes)), weight: 0.1 },
    { value: scoreGrowth(usable("usdc_supply_7d", stablecoinMaxAgeMinutes)), weight: 0.12 },
    { value: scoreGrowth(usable("usdc_supply_30d", stablecoinMaxAgeMinutes)), weight: 0.06 },
    { value: usable("stablecoin_dominance", stablecoinMaxAgeMinutes) === null ? null : 55, weight: 0.06 },
  ]);
  const inputCoverage = coverage(keys, stablecoinMaxAgeMinutes);
  return {
    id: "stablecoin",
    labelFa: "موتور استیبل‌کوین",
    status: healthStatus(score, inputCoverage),
    score,
    confidence: clampPercent(Math.min(inputCoverage, score === null ? 0 : 45 + inputCoverage * 0.45)),
    coverage: inputCoverage,
    freshness: freshness(keys, stablecoinMaxAgeMinutes),
    sourceCount: sourceCount(inputLists.usedInputs),
    lastUpdated: latestTimestamp(inputLists.usedInputs),
    ...inputLists,
    classification: stablecoinClassification(score),
    explanationFa:
      score === null
        ? "داده معتبر DefiLlama برای عرضه و ارزش بازار استیبل‌کوین‌ها در دسترس نیست؛ موتور استیبل‌کوین Missing می‌ماند."
        : `موتور استیبل‌کوین با پوشش ${inputCoverage}٪ و طبقه‌بندی ${stablecoinClassification(score)} کار می‌کند؛ رشد ۷ و ۳۰ روزه و تغییر عرضه USDT/USDC وزن اصلی را دارند.`,
    details: {
      currentValue: usable("total_stablecoin_market_cap_usd", stablecoinMaxAgeMinutes),
      change7d: usable("stablecoin_market_cap_7d", stablecoinMaxAgeMinutes),
      change30d: usable("stablecoin_market_cap_30d", stablecoinMaxAgeMinutes),
      usdtSupply7d: usable("usdt_supply_7d", stablecoinMaxAgeMinutes),
      usdtSupply30d: usable("usdt_supply_30d", stablecoinMaxAgeMinutes),
      usdcSupply7d: usable("usdc_supply_7d", stablecoinMaxAgeMinutes),
      usdcSupply30d: usable("usdc_supply_30d", stablecoinMaxAgeMinutes),
      dominance: usable("stablecoin_dominance", stablecoinMaxAgeMinutes),
    },
  };
}

function buildEtfEngine(): LiquiditySubEngine {
  const keys = ["btc_etf_flow_24h", "btc_etf_flow_7d", "btc_etf_flow_30d", "eth_etf_flow_24h", "eth_etf_flow_7d", "eth_etf_flow_30d"];
  const etfMaxAgeMinutes = 7 * 24 * 60;
  const inputLists = buildInputLists(keys, etfMaxAgeMinutes);
  const score = weightedScore([
    { value: scoreEtfFlow(usable("btc_etf_flow_7d", etfMaxAgeMinutes) ?? usable("btc_etf_flow_24h", etfMaxAgeMinutes)), weight: 0.68 },
    { value: scoreEtfFlow(usable("eth_etf_flow_7d", etfMaxAgeMinutes) ?? usable("eth_etf_flow_24h", etfMaxAgeMinutes)), weight: 0.32 },
  ]);
  const inputCoverage = coverage(keys, etfMaxAgeMinutes);
  const missingSource = score === null;
  return {
    id: "etf",
    labelFa: "موتور ETF",
    status: missingSource ? "missing" : inputCoverage >= 70 ? "connected" : "degraded",
    score,
    confidence: missingSource ? 0 : clampPercent(Math.min(inputCoverage, 40 + inputCoverage * 0.35)),
    coverage: inputCoverage,
    freshness: freshness(keys, etfMaxAgeMinutes),
    sourceCount: sourceCount(inputLists.usedInputs),
    lastUpdated: latestTimestamp(inputLists.usedInputs),
    ...inputLists,
    classification: missingSource ? "Missing" : score >= 65 ? "Inflow Support" : score <= 35 ? "Outflow Pressure" : "Neutral Flow",
    explanationFa:
      score === null
        ? "جریان ETF از Farside یا منبع عمومی معتبر جایگزین موجود نیست؛ موتور ETF مقدار نمی‌سازد و confidence این لایه صفر می‌ماند."
        : `جریان ETF فقط از منبع واقعی خوانده شده است؛ score ${score}/100 بدون استنتاج از حجم بازار ساخته شده.`,
    details: {
      btcNetFlow24h: usable("btc_etf_flow_24h", etfMaxAgeMinutes),
      btcNetFlow7d: usable("btc_etf_flow_7d", etfMaxAgeMinutes),
      btcNetFlow30d: usable("btc_etf_flow_30d", etfMaxAgeMinutes),
      ethNetFlow24h: usable("eth_etf_flow_24h", etfMaxAgeMinutes),
      ethNetFlow7d: usable("eth_etf_flow_7d", etfMaxAgeMinutes),
      ethNetFlow30d: usable("eth_etf_flow_30d", etfMaxAgeMinutes),
      netFlow7d: usable("btc_etf_flow_7d", etfMaxAgeMinutes),
      netFlow30d: usable("btc_etf_flow_30d", etfMaxAgeMinutes),
      publicEtfFlowStatus: score === null ? "Missing" : "Available",
    },
  };
}

function derivativeHeatScore(funding: number | null, oi: number | null) {
  if (funding === null && oi === null) return null;
  const fundingRisk = funding === null ? null : funding > 0.06 ? 95 : funding > 0.025 ? 78 : funding > 0 ? 48 : funding < -0.02 ? 62 : 28;
  const oiRisk = oi === null ? null : oi >= 8 ? 88 : oi >= 3 ? 68 : oi <= -5 ? 25 : 42;
  return weightedScore([
    { value: fundingRisk, weight: 0.52 },
    { value: oiRisk, weight: 0.48 },
  ]);
}

function derivativesClassification(risk: number | null) {
  if (risk === null) return "Missing";
  if (risk >= 85) return "Extreme";
  if (risk >= 68) return "Speculative";
  if (risk >= 48) return "Elevated";
  return "Healthy";
}

function buildDerivativesEngine(): LiquiditySubEngine {
  const keys = ["funding_btc", "funding_eth", "funding_sol", "open_interest_btc_24h", "open_interest_eth_24h", "open_interest_sol_24h", "futures_volume_btc_24h", "spot_volume_btc_24h"];
  const inputLists = buildInputLists(keys);
  const risk = weightedScore([
    { value: derivativeHeatScore(usable("funding_btc"), usable("open_interest_btc_24h")), weight: 0.48 },
    { value: derivativeHeatScore(usable("funding_eth"), usable("open_interest_eth_24h")), weight: 0.26 },
    { value: derivativeHeatScore(usable("funding_sol"), usable("open_interest_sol_24h")), weight: 0.18 },
    {
      value:
        usable("futures_volume_btc_24h") === null || usable("spot_volume_btc_24h") === null
          ? null
          : clampPercent(45 + Math.max(0, (usable("futures_volume_btc_24h") ?? 0) - Math.max(0, usable("spot_volume_btc_24h") ?? 0)) * 1.4),
      weight: 0.08,
    },
  ]);
  const liquidityScore = risk === null ? null : clampPercent(100 - risk);
  const inputCoverage = coverage(keys);
  return {
    id: "derivatives",
    labelFa: "موتور مشتقات",
    status: healthStatus(liquidityScore, inputCoverage),
    score: liquidityScore,
    confidence: liquidityScore === null ? 0 : clampPercent(Math.min(inputCoverage, 35 + inputCoverage * 0.45)),
    coverage: inputCoverage,
    freshness: freshness(keys),
    sourceCount: sourceCount(inputLists.usedInputs),
    lastUpdated: latestTimestamp(inputLists.usedInputs),
    ...inputLists,
    classification: derivativesClassification(risk),
    explanationFa:
      risk === null
        ? "داده معتبر funding/open interest موجود نیست؛ موتور مشتقات Missing می‌ماند."
        : `ریسک مشتقات ${risk}/100 و طبقه‌بندی ${derivativesClassification(risk)} است؛ برای fusion، score نقدینگی مشتقات برابر ${liquidityScore}/100 استفاده می‌شود.`,
    details: {
      derivativesRiskScore: risk,
      derivativesLiquidityScore: liquidityScore,
      leveragePressureScore: risk,
      btcFunding: usable("funding_btc"),
      btcOpenInterest: usable("open_interest_btc_24h"),
      ethFunding: usable("funding_eth"),
      solFunding: usable("funding_sol"),
    },
  };
}

function buildMacroCalendarEngine(): LiquiditySubEngine {
  const keys = ["cpi_latest", "ppi_latest", "fed_funds_rate", "unemployment_rate", "dxy_trend_24h", "us10y_trend_24h", "vix_trend_24h"];
  const inputLists = buildInputLists(keys);
  const dxy = usable("dxy_trend_24h");
  const us10y = usable("us10y_trend_24h");
  const vix = usable("vix_trend_24h");
  const eventRisk = weightedScore([
    { value: dxy === null ? null : dxy > 0.5 ? 78 : dxy > 0.15 ? 62 : dxy < -0.15 ? 35 : 48, weight: 0.32 },
    { value: us10y === null ? null : us10y > 0.08 ? 82 : us10y > 0.03 ? 64 : us10y < -0.03 ? 34 : 48, weight: 0.32 },
    { value: vix === null ? null : vix > 5 ? 82 : vix > 2 ? 64 : vix < -2 ? 34 : 48, weight: 0.2 },
    { value: usable("fed_funds_rate") === null ? null : 50, weight: 0.16 },
  ]);
  const liquidityScore = eventRisk === null ? null : clampPercent(100 - eventRisk);
  const inputCoverage = coverage(keys);
  const classification = eventRisk === null ? "Missing" : eventRisk >= 80 ? "Critical" : eventRisk >= 65 ? "High" : eventRisk >= 45 ? "Moderate" : "Low";
  return {
    id: "macro_calendar",
    labelFa: "موتور تقویم کلان",
    status: healthStatus(liquidityScore, inputCoverage),
    score: liquidityScore,
    confidence: liquidityScore === null ? 0 : clampPercent(Math.min(inputCoverage, 38 + inputCoverage * 0.42)),
    coverage: inputCoverage,
    freshness: freshness(keys),
    sourceCount: sourceCount(inputLists.usedInputs),
    lastUpdated: latestTimestamp(inputLists.usedInputs),
    ...inputLists,
    classification,
    explanationFa:
      eventRisk === null
        ? "داده FRED/تقویم کلان کافی موجود نیست؛ موتور تقویم کلان Missing است."
        : `ریسک رویداد/شوک کلان ${eventRisk}/100 و طبقه‌بندی ${classification} است؛ نبود TradingEconomics یعنی upcoming event schedule ناموجود می‌ماند.`,
    details: {
      macroEventRiskScore: eventRisk,
      upcomingEventRisk: null,
      liquidityShockProbability: eventRisk,
      cpi: usable("cpi_latest"),
      ppi: usable("ppi_latest"),
      fedFunds: usable("fed_funds_rate"),
      unemployment: usable("unemployment_rate"),
      missingCalendarSource: "TradingEconomics calendar optional",
    },
  };
}

function buildSentimentLiquidityEngine(): LiquiditySubEngine {
  const sentiment = getSentimentReport();
  const score = sentiment.confidence.available ? clampPercent(50 + sentiment.sentimentScore / 2) : null;
  const inputCoverage = sentiment.highImpactHeadlines.length ? clampPercent(Math.min(100, sentiment.highImpactHeadlines.length * 12.5)) : 0;
  const classification = score === null ? "Missing" : score >= 70 ? "Risk Appetite Support" : score <= 35 ? "Sentiment Pressure" : "Neutral Sentiment";
  return {
    id: "sentiment",
    labelFa: "موتور سنتیمنت نقدینگی",
    status: score === null ? "missing" : inputCoverage >= 60 ? "connected" : "degraded",
    score,
    confidence: sentiment.confidence.score ?? 0,
    coverage: inputCoverage,
    freshness: sentiment.highImpactHeadlines.length ? "partial_live" : "unavailable",
    sourceCount: new Set(sentiment.highImpactHeadlines.map((headline) => headline.source)).size,
    lastUpdated: sentiment.lastUpdatedAt,
    usedInputs: sentiment.highImpactHeadlines.map((headline) => headline.id),
    missingInputs: sentiment.highImpactHeadlines.length ? [] : ["market_relevant_normalized_events"],
    classification,
    explanationFa:
      score === null
        ? "خبرهای دارای relevance کافی برای سنتیمنت نقدینگی موجود نیست؛ اطلاعیه‌های اداری کم‌اثر وارد score نمی‌شوند."
        : `سنتیمنت نقدینگی از ${sentiment.highImpactHeadlines.length} headline با relevance کافی ساخته شد؛ طبقه‌بندی ${classification} است.`,
    details: {
      sentimentLiquidityScore: score,
      sentimentRiskScore: score === null ? null : clampPercent(100 - score),
      narrativeMomentum: sentiment.sentimentScore,
      averageRelevance: sentiment.highImpactHeadlines.length
        ? Math.round(sentiment.highImpactHeadlines.reduce((sum, item) => sum + item.marketRelevanceScore, 0) / sentiment.highImpactHeadlines.length)
        : null,
    },
  };
}

const defaultWeights: Record<LiquiditySubEngineId, number> = {
  stablecoin: 0.4,
  etf: 0.2,
  derivatives: 0.15,
  macro_calendar: 0.15,
  sentiment: 0.1,
};

export function getLiquidityIntelligenceStack() {
  const engines = [
    buildStablecoinEngine(),
    buildEtfEngine(),
    buildDerivativesEngine(),
    buildMacroCalendarEngine(),
    buildSentimentLiquidityEngine(),
  ];
  const availableEngines = engines.filter((engine) => engine.score !== null && engine.status !== "missing");
  const structuralAvailableEngines = availableEngines.filter((engine) => engine.id !== "sentiment");
  const scoreEligibleEngines = structuralAvailableEngines.length ? availableEngines : [];
  const totalWeight = scoreEligibleEngines.reduce((sum, engine) => sum + defaultWeights[engine.id], 0);
  const contributions = engines.map((engine) => {
    const isEligible = scoreEligibleEngines.some((candidate) => candidate.id === engine.id);
    const redistributedWeight = engine.score === null || !totalWeight || !isEligible ? 0 : defaultWeights[engine.id] / totalWeight;
    return {
      engineId: engine.id,
      labelFa: engine.labelFa,
      originalWeight: defaultWeights[engine.id],
      redistributedWeight,
      score: engine.score,
      contribution: engine.score === null ? null : Math.round(engine.score * redistributedWeight),
      status: engine.status,
    };
  });
  const rawFusionScore = totalWeight
    ? clampPercent(
        contributions.reduce((sum, item) => sum + (item.score === null ? 0 : item.score * item.redistributedWeight), 0),
      )
    : null;
  const liquidityHealthSource = calculateLiquidityEngine();
  const finalLiquidityScore = liquidityHealthSource.liquidityHealthScore ?? rawFusionScore;
  const classification = classifyLiquidityHealth(finalLiquidityScore);
  const independentEngines = scoreEligibleEngines.filter((engine) => engine.sourceCount > 0).length;
  const averageCoverage = engines.reduce((sum, engine) => sum + engine.coverage, 0) / engines.length;
  const weightedCoverage = engines.reduce((sum, engine) => sum + engine.coverage * defaultWeights[engine.id], 0);
  const baseConfidence = scoreEligibleEngines.length
    ? scoreEligibleEngines.reduce((sum, engine) => sum + engine.confidence * (defaultWeights[engine.id] / Math.max(totalWeight, 0.01)), 0)
    : 0;
  const missingEnginePenalty = engines.filter((engine) => engine.status === "missing").length * 6;
  const confidenceCap = finalLiquidityScore === null
    ? 0
    : independentEngines >= 2
      ? clampPercent(Math.min(weightedCoverage, averageCoverage - missingEnginePenalty + 20))
      : clampPercent(Math.min(45, weightedCoverage - missingEnginePenalty));
  const finalConfidence = finalLiquidityScore === null ? 0 : clampPercent(Math.min(baseConfidence, confidenceCap));
  const unavailableEngines = engines.filter((engine) => engine.status === "missing").map((engine) => engine.labelFa);
  const confirmingEngines = scoreEligibleEngines.filter((engine) => engine.score !== null && engine.score >= 60).map((engine) => engine.labelFa);
  const disagreeingEngines = scoreEligibleEngines.filter((engine) => engine.score !== null && engine.score < 45).map((engine) => engine.labelFa);
  const narrative = finalLiquidityScore === null
    ? "داده ساختاری کافی برای ساخت Liquidity Fusion وجود ندارد؛ سنتیمنت به‌تنهایی امتیاز نقدینگی نهایی تولید نمی‌کند."
    : strictLiquidityNarrative({
        score: finalLiquidityScore,
        labelFa: classification.labelFa,
        missingInputs: engines.flatMap((engine) => engine.missingInputs).slice(0, 8),
        staleCount: 0,
      });

  return {
    generatedAt: new Date().toISOString(),
    engines,
    contributions,
    finalLiquidityScore,
    rawFusionScore,
    liquidityHealthScoreSource: "LiquidityHealthScore",
    finalLiquidityClass: classification.class,
    finalLiquidityLabelFa: classification.labelFa,
    finalConfidence,
    confidenceCap,
    confidenceCapReason:
      independentEngines >= 2
        ? `confidence با coverage میانگین و نبود ${unavailableEngines.length} موتور محدود شده است.`
        : "کمتر از دو موتور مستقل تأییدکننده موجود است؛ confidence با پایین‌ترین coverage محدود شد.",
    confirmingEngines,
    disagreeingEngines,
    unavailableEngines,
    narrativeFa: narrative,
    noFabricationFa: "ETF، whale، exchange inflow/outflow و on-chain premium در صورت نبود منبع معتبر Missing می‌مانند و در fusion وزن نمی‌گیرند.",
  };
}
