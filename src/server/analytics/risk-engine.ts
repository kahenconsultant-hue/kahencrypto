import type { AssetSymbol, ConfidenceResult, DataSourceStatus, DirectionalBias, IntelligenceAssetSymbol, NormalizedSignal } from "@/lib/types";
import { calculateAdaptiveModuleConfidence } from "@/server/analytics/adaptive-confidence-engine";
import { getAssetImpactProfiles } from "@/server/analytics/asset-impact-engine";
import { getDynamicCorrelationReport } from "@/server/analytics/correlation-engine";
import { getLiquidityReport } from "@/server/analytics/liquidity-engine";
import { getMarketRegimeReport } from "@/server/analytics/market-regime-engine";
import { getEngineLastUpdatedAt, getSignalSnapshot } from "@/server/analytics/market-signals";
import { normalizeSignalScore, validationReason } from "@/server/analytics/quality-engine";
import { clampPercent } from "@/server/analytics/scoring-engine";
import { getIntelligenceReliabilityReportSync } from "@/server/intelligence/reliability-engine";

export type RiskLevel = "low" | "moderate" | "elevated" | "high" | "critical" | "unavailable";
export type DominantPressure = "macro" | "liquidity" | "leverage" | "volatility" | "sentiment" | "data_quality" | "mixed" | "unavailable";
export type UncertaintyLevel = "low" | "moderate" | "high" | "unavailable";

export interface RiskPressureBreakdown {
  macro: number | null;
  liquidity: number | null;
  leverage: number | null;
  volatility: number | null;
  sentiment: number | null;
  dataQuality: number | null;
}

export interface AssetRiskProfile {
  asset: IntelligenceAssetSymbol;
  riskScore: number | null;
  riskLevel: RiskLevel;
  primaryRisk: DominantPressure;
  explanationFa: string;
  confidence: number | null;
}

export interface BasicRiskEngineOutput {
  moduleName: "risk_engine_v1";
  status: DataSourceStatus;
  sourceType: "direct" | "derived" | "proxy" | "unavailable";
  riskScore: number | null;
  riskLevel: RiskLevel;
  dominantPressure: DominantPressure;
  uncertaintyLevel: UncertaintyLevel;
  pressureBreakdown: RiskPressureBreakdown;
  confidence: ConfidenceResult;
  driversFa: string[];
  invalidationFa: string[];
  monitoringFa: string[];
  assetRisks: AssetRiskProfile[];
  explanationFa: string;
  lastUpdatedAt: string;
}

const riskSignals = [
  "btc_trend_24h",
  "eth_trend_24h",
  "sol_trend_24h",
  "dxy_trend_24h",
  "us10y_trend_24h",
  "nasdaq_trend_24h",
  "gold_trend_24h",
  "vix_trend_24h",
  "stablecoin_market_cap_7d",
  "usdt_supply_7d",
  "funding_btc",
  "open_interest_btc_24h",
  "spot_volume_btc_24h",
  "futures_volume_btc_24h",
  "news_sentiment_macro",
  "geopolitical_event_score",
];

const RISK_REPORT_CACHE_TTL_MS = 30_000;

let riskReportCache:
  | {
      expiresAt: number;
      value: BasicRiskEngineOutput;
    }
  | null = null;

function usableSignal(signal: NormalizedSignal | undefined) {
  return Boolean(signal && signal.value !== null && signal.quality !== "unavailable" && signal.quality !== "estimated");
}

function signalScore(signal: NormalizedSignal | undefined) {
  if (!signal || !usableSignal(signal)) return null;
  return normalizeSignalScore(signal);
}

function pressureFromBullishScore(score: number | null) {
  return score === null ? null : Math.max(0, -score);
}

function weightedNullable(values: Array<{ value: number | null; weight: number }>) {
  const available = values.filter((item): item is { value: number; weight: number } => item.value !== null && Number.isFinite(item.value));
  if (!available.length) return null;
  const totalWeight = available.reduce((sum, item) => sum + item.weight, 0);
  return clampPercent(available.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight);
}

function riskLevel(score: number | null): RiskLevel {
  if (score === null) return "unavailable";
  if (score >= 80) return "critical";
  if (score >= 65) return "high";
  if (score >= 45) return "elevated";
  if (score >= 25) return "moderate";
  return "low";
}

export const classifyRiskLevel = riskLevel;

function scoreToHealth(score: number | null) {
  return score === null ? null : clampPercent(50 + score / 2);
}

function etfHealthFromSignals(snapshot: ReturnType<typeof getSignalSnapshot>) {
  const signal = snapshot.byKey.btc_etf_flow_7d ?? snapshot.byKey.btc_etf_flow_24h;
  return scoreToHealth(signalScore(signal));
}

function stablecoinHealthFromSignals(snapshot: ReturnType<typeof getSignalSnapshot>) {
  const signal = snapshot.byKey.stablecoin_market_cap_7d ?? snapshot.byKey.usdt_supply_7d;
  return scoreToHealth(signalScore(signal));
}

export function applyRiskFloors(params: {
  riskScore: number | null;
  liquidityScore: number | null;
  etfScore: number | null;
  stablecoinScore: number | null;
}) {
  if (params.riskScore === null) {
    return {
      score: null,
      appliedFloor: null,
      reasons: [] as string[],
    };
  }

  let floor: number | null = null;
  const reasons: string[] = [];
  if (params.liquidityScore !== null && params.liquidityScore < 25) {
    floor = Math.max(floor ?? 0, 40);
    reasons.push("Liquidity Score زیر ۲۵ است؛ ریسک نمی‌تواند Low بماند.");
  }
  if (params.liquidityScore !== null && params.liquidityScore < 25 && params.etfScore !== null && params.etfScore < 30) {
    floor = Math.max(floor ?? 0, 45);
    reasons.push("Liquidity زیر ۲۵ و ETF Score زیر ۳۰ است؛ کف ریسک به ۴۵ افزایش یافت.");
  }
  if (
    params.liquidityScore !== null &&
    params.liquidityScore < 25 &&
    params.etfScore !== null &&
    params.etfScore < 30 &&
    params.stablecoinScore !== null &&
    params.stablecoinScore < 40
  ) {
    floor = Math.max(floor ?? 0, 50);
    reasons.push("Liquidity، ETF و Stablecoin هم‌زمان ضعیف‌اند؛ کف ریسک به ۵۰ افزایش یافت.");
  }

  return {
    score: floor === null ? params.riskScore : clampPercent(Math.max(params.riskScore, floor)),
    appliedFloor: floor,
    reasons,
  };
}

function uncertaintyLevel(confidence: ConfidenceResult, pressureBreakdown: RiskPressureBreakdown): UncertaintyLevel {
  if (!confidence.available || confidence.score === null) return "unavailable";
  const availablePressures = Object.values(pressureBreakdown).filter((value): value is number => typeof value === "number");
  if (!availablePressures.length) return "unavailable";
  const spread = Math.max(...availablePressures) - Math.min(...availablePressures);
  if (confidence.score < 40 || spread < 12) return "high";
  if (confidence.score < 58 || spread < 24) return "moderate";
  return "low";
}

function applyMissingInputUncertaintyFloor(level: UncertaintyLevel, snapshot: ReturnType<typeof getSignalSnapshot>): UncertaintyLevel {
  if (level === "unavailable") return level;
  const exchangeFlowMissing =
    !usableSignal(snapshot.byKey.exchange_inflows) || !usableSignal(snapshot.byKey.exchange_outflows);
  if (!exchangeFlowMissing) return level;
  if (level === "low") return "moderate";
  return level;
}

function dominantPressure(pressureBreakdown: RiskPressureBreakdown): DominantPressure {
  const entries = Object.entries(pressureBreakdown)
    .filter((entry): entry is [keyof RiskPressureBreakdown, number] => typeof entry[1] === "number")
    .sort((left, right) => right[1] - left[1]);
  if (!entries.length) return "unavailable";
  const [top, second] = entries;
  if (second && top[1] - second[1] < 8) return "mixed";
  if (top[1] < 22) return "mixed";
  if (top[0] === "dataQuality") return "data_quality";
  return top[0];
}

function pressureLabelFa(pressure: DominantPressure) {
  const labels: Record<DominantPressure, string> = {
    macro: "فشار کلان",
    liquidity: "فشار نقدینگی",
    leverage: "فشار اهرمی",
    volatility: "فشار نوسان",
    sentiment: "فشار خبری/سنتیمنت",
    data_quality: "ریسک کیفیت داده",
    mixed: "فشار ترکیبی",
    unavailable: "ناموجود",
  };
  return labels[pressure];
}

function buildPressureBreakdown(): RiskPressureBreakdown {
  const snapshot = getSignalSnapshot();
  const liquidity = getLiquidityReport();
  const reliability = getIntelligenceReliabilityReportSync();
  const dxyPressure = pressureFromBullishScore(signalScore(snapshot.byKey.dxy_trend_24h));
  const us10yPressure = pressureFromBullishScore(signalScore(snapshot.byKey.us10y_trend_24h));
  const nasdaqPressure = pressureFromBullishScore(signalScore(snapshot.byKey.nasdaq_trend_24h));
  const vixPressure = pressureFromBullishScore(signalScore(snapshot.byKey.vix_trend_24h));
  const stablecoinPressure = pressureFromBullishScore(signalScore(snapshot.byKey.stablecoin_market_cap_7d));
  const fundingPressure = pressureFromBullishScore(signalScore(snapshot.byKey.funding_btc));
  const openInterestPressure = pressureFromBullishScore(signalScore(snapshot.byKey.open_interest_btc_24h));
  const sentimentPressure = pressureFromBullishScore(signalScore(snapshot.byKey.news_sentiment_macro));
  const geopoliticalPressure = snapshot.byKey.geopolitical_event_score?.value === null ? null : Math.max(0, (snapshot.byKey.geopolitical_event_score?.value ?? 0) - 35);

  return {
    macro: weightedNullable([
      { value: dxyPressure, weight: 0.34 },
      { value: us10yPressure, weight: 0.34 },
      { value: nasdaqPressure, weight: 0.22 },
      { value: vixPressure, weight: 0.1 },
    ]),
    liquidity: weightedNullable([
      { value: liquidity.dataQuality === "unavailable" ? null : Math.max(0, -liquidity.liquidityScoreSigned), weight: 0.38 },
      { value: liquidity.realSpotLiquidityScore === undefined ? null : Math.max(0, 45 - liquidity.realSpotLiquidityScore), weight: 0.22 },
      { value: liquidity.liquiditySustainabilityScore === undefined ? null : Math.max(0, 55 - liquidity.liquiditySustainabilityScore), weight: 0.2 },
      { value: stablecoinPressure, weight: 0.2 },
    ]),
    leverage: weightedNullable([
      { value: liquidity.dataQuality === "unavailable" ? null : liquidity.leverageStress, weight: 0.44 },
      { value: liquidity.dataQuality === "unavailable" ? null : liquidity.speculativeHeat, weight: 0.24 },
      { value: fundingPressure, weight: 0.16 },
      { value: openInterestPressure, weight: 0.16 },
    ]),
    volatility: weightedNullable([
      { value: vixPressure, weight: 0.5 },
      { value: pressureFromBullishScore(signalScore(snapshot.byKey.btc_trend_24h)), weight: 0.18 },
      { value: pressureFromBullishScore(signalScore(snapshot.byKey.eth_trend_24h)), weight: 0.14 },
      { value: pressureFromBullishScore(signalScore(snapshot.byKey.sol_trend_24h)), weight: 0.18 },
    ]),
    sentiment: weightedNullable([
      { value: sentimentPressure, weight: 0.55 },
      { value: geopoliticalPressure, weight: 0.45 },
    ]),
    dataQuality: clampPercent(Math.max(0, 100 - reliability.coreReliability * 100) * 0.68 + reliability.staleSources * 3 + reliability.obsoleteSources * 5),
  };
}

function calculateRiskScore(pressureBreakdown: RiskPressureBreakdown) {
  return weightedNullable([
    { value: pressureBreakdown.macro, weight: 0.26 },
    { value: pressureBreakdown.liquidity, weight: 0.28 },
    { value: pressureBreakdown.leverage, weight: 0.2 },
    { value: pressureBreakdown.volatility, weight: 0.12 },
    { value: pressureBreakdown.sentiment, weight: 0.08 },
    { value: pressureBreakdown.dataQuality, weight: 0.06 },
  ]);
}

function assetRiskFromImpact(asset: IntelligenceAssetSymbol, bias: DirectionalBias, impactScore: number, confidence: number | null, dominant: DominantPressure): AssetRiskProfile {
  const bearishPressure = bias === "bearish" ? Math.abs(impactScore) : bias === "mixed" ? Math.min(55, Math.abs(impactScore) + 18) : bias === "neutral" ? 28 : Math.max(12, 30 - impactScore);
  const confidencePenalty = confidence === null ? 18 : Math.max(0, 55 - confidence) * 0.32;
  const stablecoinPenalty = asset === "USDT" && bias === "bearish" ? 18 : 0;
  const score = clampPercent(bearishPressure + confidencePenalty + stablecoinPenalty);
  const assetFa: Record<IntelligenceAssetSymbol, string> = {
    BTC: "BTC",
    ETH: "ETH",
    SOL: "SOL",
    USDT: "USDT",
    DXY: "DXY",
    Gold: "Gold",
    Nasdaq: "Nasdaq",
    US10Y: "US10Y",
  };

  return {
    asset,
    riskScore: score,
    riskLevel: riskLevel(score),
    primaryRisk: dominant,
    confidence,
    explanationFa:
      asset === "DXY" || asset === "US10Y"
        ? `${assetFa[asset]} در این سیستم دارایی معاملاتی کریپتو نیست؛ به‌عنوان کانال انتقال فشار کلان سنجیده می‌شود.`
        : `${assetFa[asset]} از مسیر ${pressureLabelFa(dominant)} ریسک می‌گیرد؛ امتیاز اثر ${impactScore} و سطح اطمینان ${confidence ?? "ناموجود"}٪ است.`,
  };
}

function buildDrivers(pressure: RiskPressureBreakdown, dominant: DominantPressure, riskScore: number | null) {
  const snapshot = getSignalSnapshot();
  const liquidity = getLiquidityReport();
  const regime = getMarketRegimeReport();
  const exchangeFlowMissing =
    !usableSignal(snapshot.byKey.exchange_inflows) || !usableSignal(snapshot.byKey.exchange_outflows);
  const drivers = [
    riskScore === null ? "داده کافی برای محاسبه ریسک پایه وجود ندارد." : `ریسک کلی ${riskScore}/100 است و فشار غالب ${pressureLabelFa(dominant)} تشخیص داده شده است.`,
    `رژیم بازار: ${regime.regimeLabel ?? regime.active} با اطمینان ${regime.confidenceDetail?.available ? `${regime.confidence}%` : "ناموجود"}.`,
    liquidity.dataQuality === "unavailable"
      ? "لایه نقدینگی ناموجود است و ریسک نقدینگی به‌صورت جهت‌دار محاسبه نمی‌شود."
      : `نقدینگی: امتیاز ${liquidity.liquidityScoreSigned}/100، پایداری ${liquidity.liquiditySustainabilityScore ?? "ناموجود"}/100 و اهرم ${liquidity.leverageStress}/100.`,
    pressure.macro !== null ? `فشار کلان ${pressure.macro}/100 است؛ این بخش از DXY، US10Y، Nasdaq و VIX ساخته می‌شود.` : "فشار کلان ناموجود است.",
    exchangeFlowMissing ? "Exchange inflow/outflow ناموجود است؛ این نبود داده uncertainty را بالا می‌برد و برای کاهش ریسک استفاده نمی‌شود." : "",
    pressure.dataQuality !== null && pressure.dataQuality > 30 ? `ریسک کیفیت داده ${pressure.dataQuality}/100 است؛ confidence باید محافظه‌کارانه خوانده شود.` : "",
  ];
  return drivers.filter(Boolean);
}

export function calculateBasicRiskEngine(): BasicRiskEngineOutput {
  const snapshot = getSignalSnapshot();
  const selectedSignals = riskSignals.map((key) => snapshot.byKey[key]).filter((signal): signal is NormalizedSignal => Boolean(signal));
  const pressureBreakdown = buildPressureBreakdown();
  const rawScore = calculateRiskScore(pressureBreakdown);
  const liquidity = getLiquidityReport();
  const etfScore = etfHealthFromSignals(snapshot);
  const stablecoinScore = stablecoinHealthFromSignals(snapshot);
  const riskFloor = applyRiskFloors({
    riskScore: rawScore,
    liquidityScore: liquidity.liquidityHealthScore ?? liquidity.liquidityScore ?? null,
    etfScore,
    stablecoinScore,
  });
  const score = riskFloor.score;
  const dominant = dominantPressure(pressureBreakdown);
  const validation = validationReason(selectedSignals, ["btc_trend_24h", "dxy_trend_24h", "us10y_trend_24h", "stablecoin_market_cap_7d"]);
  const correlations = getDynamicCorrelationReport();
  const correlationInstability = correlations.breakdownAlerts.length ? Math.min(20, correlations.breakdownAlerts.length * 4) : 0;
  const confidence = calculateAdaptiveModuleConfidence({
    moduleName: "Basic Risk Engine v1",
    signals: selectedSignals,
    requiredGroups: ["price", "macro", "liquidity", "stablecoins", "leverage", "volatility", "sentiment"],
    criticalKeys: ["btc_trend_24h", "dxy_trend_24h", "us10y_trend_24h", "stablecoin_market_cap_7d"],
    signalAgreement: dominant === "mixed" ? 48 : clampPercent(62 + (score ?? 0) * 0.22 - correlationInstability),
    historicalConsistency: getMarketRegimeReport().changedLast24h ? 58 : 72,
    marketConfirmation: getLiquidityReport().dataQuality === "unavailable" ? 42 : 64,
    minimumGroups: 4,
  });
  const usableScore = validation && !confidence.available ? null : score;
  const level = riskLevel(usableScore);
  const uncertainty = applyMissingInputUncertaintyFloor(uncertaintyLevel(confidence, pressureBreakdown), snapshot);
  const assetRisks = getAssetImpactProfiles().map((profile) =>
    assetRiskFromImpact(profile.asset, profile.directionalBias, profile.impactScore, profile.confidence.score, dominant),
  );
  const status: DataSourceStatus = usableScore === null ? "unavailable" : confidence.score !== null && confidence.score >= 58 ? "partial_live" : "delayed";

  return {
    moduleName: "risk_engine_v1",
    status,
    sourceType: usableScore === null ? "unavailable" : "derived",
    riskScore: usableScore,
    riskLevel: level,
    dominantPressure: usableScore === null ? "unavailable" : dominant,
    uncertaintyLevel: uncertainty,
    pressureBreakdown,
    confidence,
    driversFa: buildDrivers(pressureBreakdown, dominant, usableScore),
    invalidationFa:
      usableScore === null
        ? ["برای فعال شدن risk engine، حداقل قیمت BTC، DXY، US10Y و روند استیبل‌کوین‌ها باید با تازگی قابل قبول موجود باشند."]
        : [
            "ریسک کلان زمانی پایین‌تر می‌آید که DXY و US10Y در دو بروزرسانی متوالی آرام شوند.",
            "ریسک نقدینگی زمانی ضعیف می‌شود که stablecoin market cap بالای ۰٫۳۵٪ هفتگی رشد کند و حجم اسپات بهتر شود.",
            "ریسک اهرمی زمانی کاهش می‌یابد که Funding Rate و Open Interest بدون افت قیمت تخلیه شوند.",
          ],
    monitoringFa: [
      "DXY و US10Y در پنجره ۲۴ ساعته",
      "رشد هفتگی stablecoin market cap و USDT supply",
      "Funding Rate، Open Interest و نسبت futures volume به spot volume",
      "همبستگی BTC/Nasdaq و BTC/DXY در پنجره ۷ روزه",
      "وضعیت freshness و source health برای جلوگیری از confidence ساختگی",
    ],
    assetRisks,
    explanationFa:
      usableScore === null
        ? `داده کافی برای محاسبه ریسک پایه وجود ندارد. ${validation ?? confidence.explanation}`
        : `ریسک پایه C.M.I.P در سطح «${level}» قرار دارد. فشار غالب ${pressureLabelFa(dominant)} است و سطح عدم‌قطعیت «${uncertainty}» محاسبه شده.${riskFloor.reasons.length ? ` ${riskFloor.reasons.join(" ")}` : ""} این خروجی سناریومحور است و سیگنال خرید/فروش نیست.`,
    lastUpdatedAt: getEngineLastUpdatedAt(),
  };
}

export function getRiskReport() {
  const now = Date.now();
  if (riskReportCache && riskReportCache.expiresAt > now) {
    return riskReportCache.value;
  }

  const value = calculateBasicRiskEngine();
  riskReportCache = {
    expiresAt: now + RISK_REPORT_CACHE_TTL_MS,
    value,
  };
  return value;
}
