import type { DirectionalBias, DirectionalImpactProfile, IntelligenceAssetSymbol, IntelligenceSourceConfig, NormalizedSignal, SmartAlert } from "@/lib/types";
import { getSourcesForAsset } from "@/collectors/registry";
import { getDynamicCorrelationReport } from "@/server/analytics/correlation-engine";
import { getForecastValidationCenter } from "@/server/analytics/forecast_validation_center";
import { getLiquidityReport } from "@/server/analytics/liquidity-engine";
import { getLiquidityIntelligenceStack } from "@/server/analytics/liquidity-intelligence-stack";
import { getMarketRegimeReport } from "@/server/analytics/market-regime-engine";
import { getSignalSnapshot } from "@/server/analytics/market-signals";
import { getRiskReport } from "@/server/analytics/risk-engine";
import { getSentimentReport } from "@/server/analytics/sentiment-engine";
import { generateAssetImpactProfile } from "@/server/analytics/asset-impact-engine";
import { getIntelligenceReliabilityReportSync } from "@/server/intelligence/reliability-engine";
import { generateSmartAlerts } from "@/server/alerts/smart-alert-engine";
import { clampPercent } from "@/server/analytics/scoring-engine";

export type UnifiedAssetKey = "btc" | "eth" | "sol" | "usdt" | "dxy" | "gold" | "nasdaq" | "us10y";
export type UnifiedIntelligenceMode = "FULL_INTELLIGENCE" | "PARTIAL_INTELLIGENCE" | "NO_DATA";

export interface UnifiedScoreCard {
  label: string;
  value: number | null;
  detail: string;
  tone: "good" | "warn" | "bad" | "neutral";
}

export interface UnifiedDriverCard {
  title: string;
  body: string;
  tone: "positive" | "negative" | "neutral" | "warning";
  source: string;
}

export interface UnifiedCorrelationCard {
  pair: string;
  correlation24h: number | null;
  correlation7d: number | null;
  correlation30d: number | null;
  observations: {
    "24h": number;
    "7d": number;
    "30d": number;
  };
  requiredSamples: {
    "24h": number;
    "7d": number;
    "30d": number;
  };
  coveragePercent: number;
  status: string;
  confidence: number | null;
  source: string;
}

export interface UnifiedForecastWidget {
  status: string;
  labelFa: string;
  accuracy24h: number | null;
  accuracy7d: number | null;
  forecastCount: number;
  currentConfidence: number | null;
}

export interface UnifiedInheritedStates {
  fusionScore: number | null;
  regime: string;
  liquidityState: string;
  macroState: string;
  etfState: string;
  correlationState: string;
  newsState: string;
}

export interface UnifiedAssetIntelligence {
  key: UnifiedAssetKey;
  symbol: IntelligenceAssetSymbol;
  titleFa: string;
  roleFa: string;
  mode: UnifiedIntelligenceMode;
  modeLabelFa: string;
  globalCoverage: number;
  fusionActive: boolean;
  bias: Exclude<DirectionalBias, "mixed">;
  confidence: number;
  inherited: UnifiedInheritedStates;
  scoreCards: UnifiedScoreCard[];
  mainDrivers: UnifiedDriverCard[];
  headwinds: UnifiedDriverCard[];
  riskCards: UnifiedDriverCard[];
  invalidationConditions: string[];
  scenarioSummary: string;
  correlationCards: UnifiedCorrelationCard[];
  forecastValidation: UnifiedForecastWidget;
  alerts: SmartAlert[];
  sourceMapping: IntelligenceSourceConfig[];
  sourceSignals: NormalizedSignal[];
  missingInputs: string[];
  suppressedOutputs: string[];
  generatedAt: string;
  lastUpdatedAt: string;
  impactProfile: DirectionalImpactProfile;
}

export interface UnifiedIntelligenceReport {
  generatedAt: string;
  globalCoverage: number;
  fusionActive: boolean;
  mode: UnifiedIntelligenceMode;
  assets: Record<UnifiedAssetKey, UnifiedAssetIntelligence>;
  consistency: {
    dashboardLiquidity: string;
    dashboardRegime: string;
    assetCount: number;
    suppressedOutputs: number;
  };
}

const assetRegistry: Record<UnifiedAssetKey, { symbol: IntelligenceAssetSymbol; titleFa: string; roleFa: string }> = {
  btc: {
    symbol: "BTC",
    titleFa: "بیت‌کوین",
    roleFa: "دارایی کلان نهادی؛ حساس به ETF، دلار، نرخ بهره، نقدینگی و رژیم ریسک.",
  },
  eth: {
    symbol: "ETH",
    titleFa: "اتریوم",
    roleFa: "بتای فناوری و اکوسیستم؛ حساس به نقدینگی، ETF، BTC و روایت‌های DeFi/L2.",
  },
  sol: {
    symbol: "SOL",
    titleFa: "سولانا",
    roleFa: "دارایی high-beta؛ حساس به اهرم، حجم، ریسک‌پذیری خرده‌فروشی و نقدینگی.",
  },
  usdt: {
    symbol: "USDT",
    titleFa: "ریسک تتر",
    roleFa: "زیرساخت نقدینگی؛ تمرکز بر عرضه، شبکه، ریسک رگولاتوری و پایداری استیبل‌کوین.",
  },
  dxy: {
    symbol: "DXY",
    titleFa: "شاخص دلار",
    roleFa: "فشار نقدینگی جهانی؛ تقویت دلار معمولاً برای دارایی‌های پرریسک فشارزا است.",
  },
  gold: {
    symbol: "Gold",
    titleFa: "طلا",
    roleFa: "پناهگاه کلان؛ حساس به نرخ واقعی، دلار، تنش ژئوپلیتیک و تقاضای دفاعی.",
  },
  nasdaq: {
    symbol: "Nasdaq",
    titleFa: "نزدک",
    roleFa: "کانال ریسک فناوری؛ برای BTC/ETH/SOL زمانی مهم‌تر است که همبستگی فعال باشد.",
  },
  us10y: {
    symbol: "US10Y",
    titleFa: "بازده اوراق ۱۰ ساله آمریکا",
    roleFa: "کانال نرخ تنزیل؛ رشد بازده معمولاً ریسک دارایی‌های رشد و کریپتو را بالا می‌برد.",
  },
};

const assetSignalKeys: Record<UnifiedAssetKey, string[]> = {
  btc: ["btc_trend_24h", "btc_price_usd", "btc_market_cap", "btc_volume_24h_usd", "btc_etf_flow_7d", "funding_btc", "open_interest_btc_24h"],
  eth: ["eth_trend_24h", "eth_price_usd", "eth_market_cap", "eth_volume_24h_usd", "eth_etf_flow_7d", "funding_eth", "open_interest_eth_24h"],
  sol: ["sol_trend_24h", "sol_price_usd", "sol_market_cap", "sol_volume_24h_usd", "funding_sol", "open_interest_sol_24h"],
  usdt: ["usdt_supply_7d", "usdt_supply_30d", "total_stablecoin_market_cap_usd", "stablecoin_market_cap_7d", "stablecoin_dominance"],
  dxy: ["dxy_trend_24h", "us10y_trend_24h", "gold_trend_24h", "nasdaq_trend_24h"],
  gold: ["gold_trend_24h", "dxy_trend_24h", "us10y_trend_24h", "geopolitical_event_score"],
  nasdaq: ["nasdaq_trend_24h", "btc_trend_24h", "eth_trend_24h", "sol_trend_24h", "dxy_trend_24h", "us10y_trend_24h"],
  us10y: ["us10y_trend_24h", "dxy_trend_24h", "yield_curve_10y2y", "fed_funds_rate", "cpi_latest"],
};

const sharedSignalKeys = [
  "dxy_trend_24h",
  "us10y_trend_24h",
  "nasdaq_trend_24h",
  "gold_trend_24h",
  "stablecoin_market_cap_7d",
  "total_stablecoin_market_cap_usd",
  "btc_etf_flow_7d",
  "eth_etf_flow_7d",
  "news_sentiment_macro",
  "geopolitical_event_score",
];

const biasLabelsFa: Record<Exclude<DirectionalBias, "mixed">, string> = {
  bullish: "مثبت",
  neutral: "خنثی",
  bearish: "منفی",
};

function normalizeReliability(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return value <= 1 ? Math.round(value * 100) : clampPercent(value);
}

function signalUsable(signal: NormalizedSignal | undefined) {
  return Boolean(signal && signal.value !== null && signal.quality !== "unavailable" && signal.quality !== "estimated");
}

function signalValue(signal: NormalizedSignal | undefined) {
  return signalUsable(signal) && typeof signal?.value === "number" ? signal.value : null;
}

function signedSignalScore(signal: NormalizedSignal | undefined, multiplier = 1) {
  const value = signalValue(signal);
  if (value === null) return 0;
  return Math.max(-40, Math.min(40, value * multiplier));
}

function computeSignalCoverage(signals: NormalizedSignal[]) {
  if (!signals.length) return 0;
  return clampPercent(Math.round((signals.filter(signalUsable).length / signals.length) * 100));
}

function computeGlobalCoverage(snapshot: ReturnType<typeof getSignalSnapshot>) {
  const coreKeys = [
    "btc_trend_24h",
    "eth_trend_24h",
    "sol_trend_24h",
    "dxy_trend_24h",
    "us10y_trend_24h",
    "nasdaq_trend_24h",
    "gold_trend_24h",
    "stablecoin_market_cap_7d",
    "total_stablecoin_market_cap_usd",
    "btc_etf_flow_7d",
    "news_sentiment_macro",
  ];
  const signalCoverage = computeSignalCoverage(coreKeys.map((key) => snapshot.byKey[key]).filter(Boolean) as NormalizedSignal[]);
  const reliability = getIntelligenceReliabilityReportSync();
  const reliabilityCoverage = normalizeReliability(reliability.coreReliability);
  return clampPercent(Math.round(signalCoverage * 0.55 + reliabilityCoverage * 0.45));
}

function modeFromCoverage(globalCoverage: number, fusionActive: boolean): UnifiedIntelligenceMode {
  if (fusionActive && globalCoverage > 70) return "FULL_INTELLIGENCE";
  if (fusionActive && globalCoverage > 50) return "PARTIAL_INTELLIGENCE";
  if (globalCoverage > 50) return "PARTIAL_INTELLIGENCE";
  return "NO_DATA";
}

function modeLabel(mode: UnifiedIntelligenceMode) {
  if (mode === "FULL_INTELLIGENCE") return "هوش کامل";
  if (mode === "PARTIAL_INTELLIGENCE") return "هوش جزئی فعال";
  return "ناموجود";
}

function scoreTone(value: number | null, inverted = false): UnifiedScoreCard["tone"] {
  if (value === null) return "neutral";
  const score = inverted ? 100 - value : value;
  if (score >= 65) return "good";
  if (score >= 45) return "neutral";
  if (score >= 25) return "warn";
  return "bad";
}

function biasFromScore(score: number): Exclude<DirectionalBias, "mixed"> {
  if (score >= 10) return "bullish";
  if (score <= -10) return "bearish";
  return "neutral";
}

function assetDirectionScore(params: {
  asset: UnifiedAssetKey;
  impact: DirectionalImpactProfile;
  snapshot: ReturnType<typeof getSignalSnapshot>;
  liquidityScore: number | null;
  riskScore: number | null;
  sentimentScore: number;
}) {
  const signalKeys = assetSignalKeys[params.asset];
  const trendSignal = signalKeys.map((key) => params.snapshot.byKey[key]).find((signal) => signal?.metric?.includes("trend") || signal?.key.includes("trend"));
  const trendScore = signedSignalScore(trendSignal, params.asset === "us10y" ? 70 : params.asset === "sol" ? 8 : 6);
  const liquidityComponent = params.asset === "dxy" || params.asset === "us10y"
    ? params.liquidityScore === null ? 0 : (50 - params.liquidityScore) * 0.22
    : params.asset === "gold"
      ? params.liquidityScore === null ? 0 : (50 - params.liquidityScore) * 0.08
      : params.liquidityScore === null ? 0 : (params.liquidityScore - 50) * 0.28;
  const riskComponent = params.riskScore === null
    ? 0
    : params.asset === "dxy" || params.asset === "us10y" || params.asset === "gold"
      ? (params.riskScore - 50) * 0.15
      : -(params.riskScore - 50) * 0.26;
  const impactComponent = params.impact.confidence.available ? params.impact.impactScore * 0.45 : params.impact.impactScore * 0.2;
  const sentimentComponent = params.asset === "dxy" || params.asset === "us10y" ? -params.sentimentScore * 0.08 : params.sentimentScore * 0.12;

  return Math.max(-100, Math.min(100, trendScore + liquidityComponent + riskComponent + impactComponent + sentimentComponent));
}

function inheritedStates(params: {
  fusionScore: number | null;
  liquidityLabel: string;
  regimeLabel: string;
  regimeInterpretation: string;
  correlationStatus: string;
  correlationCoverage: number;
  sentimentAccepted: number;
  sentimentScore: number;
  snapshot: ReturnType<typeof getSignalSnapshot>;
}): UnifiedInheritedStates {
  const btcEtf = params.snapshot.byKey.btc_etf_flow_7d ?? params.snapshot.byKey.btc_etf_flow_24h;
  const ethEtf = params.snapshot.byKey.eth_etf_flow_7d ?? params.snapshot.byKey.eth_etf_flow_24h;
  const etfPieces = [
    btcEtf ? `BTC ETF: ${signalUsable(btcEtf) ? "فعال" : "ناموجود"}` : "BTC ETF: ناموجود",
    ethEtf ? `ETH ETF: ${signalUsable(ethEtf) ? "فعال" : "ناموجود"}` : "ETH ETF: ناموجود",
  ];

  return {
    fusionScore: params.fusionScore,
    regime: params.regimeLabel,
    liquidityState: params.liquidityLabel,
    macroState: params.regimeInterpretation,
    etfState: etfPieces.join(" | "),
    correlationState: `${params.correlationStatus} · پوشش ${params.correlationCoverage}%`,
    newsState: `${params.sentimentAccepted} خبر پذیرفته‌شده · سنتیمنت ${params.sentimentScore}`,
  };
}

function positiveDriver(title: string, body: string, source: string): UnifiedDriverCard {
  return { title, body, source, tone: "positive" };
}

function negativeDriver(title: string, body: string, source: string): UnifiedDriverCard {
  return { title, body, source, tone: "negative" };
}

function neutralDriver(title: string, body: string, source: string): UnifiedDriverCard {
  return { title, body, source, tone: "neutral" };
}

function buildDriverCards(params: {
  impact: DirectionalImpactProfile;
  inherited: UnifiedInheritedStates;
  confidence: number;
  globalCoverage: number;
  liquidityScore: number | null;
  riskScore: number | null;
  sentimentScore: number;
  mode: UnifiedIntelligenceMode;
}) {
  const mainDrivers: UnifiedDriverCard[] = [];
  const headwinds: UnifiedDriverCard[] = [];

  if (params.impact.mainDrivers.length) {
    for (const item of params.impact.mainDrivers.slice(0, 3)) {
      if (item.includes("داده کافی")) continue;
      mainDrivers.push(positiveDriver("محرک ساختاری", item, "Asset Impact + Unified Layer"));
    }
  }

  if (typeof params.liquidityScore === "number") {
    const card = params.liquidityScore >= 55
      ? positiveDriver("نقدینگی", `${params.inherited.liquidityState} با امتیاز ${params.liquidityScore}/100 وارد سناریوی دارایی شده است.`, "Liquidity Fusion")
      : negativeDriver("نقدینگی", `${params.inherited.liquidityState} با امتیاز ${params.liquidityScore}/100 سقف خوش‌بینی را محدود می‌کند.`, "Liquidity Fusion");
    (params.liquidityScore >= 55 ? mainDrivers : headwinds).push(card);
  }

  if (typeof params.riskScore === "number" && params.riskScore >= 45) {
    headwinds.push(negativeDriver("ریسک بازار", `Risk Engine سطح ${params.riskScore}/100 را نشان می‌دهد؛ این عامل confidence را محدود می‌کند.`, "Risk Engine"));
  }

  if (Math.abs(params.sentimentScore) >= 10) {
    const body = `News State روی ${params.sentimentScore} است؛ این اثر فقط با خبرهای پذیرفته‌شده و relevance کافی وارد تحلیل شده است.`;
    (params.sentimentScore > 0 ? mainDrivers : headwinds).push(params.sentimentScore > 0 ? positiveDriver("خبر و سنتیمنت", body, "Sentiment Engine") : negativeDriver("خبر و سنتیمنت", body, "Sentiment Engine"));
  }

  if (params.mode === "PARTIAL_INTELLIGENCE") {
    headwinds.push({
      title: "محدودیت داده",
      body: `Fusion فعال است، اما پوشش کل ${params.globalCoverage}% است؛ خروجی به‌عنوان هوش جزئی و با confidence محدود نمایش داده می‌شود.`,
      source: "Unified Intelligence Layer",
      tone: "warning",
    });
  }

  for (const item of params.impact.opposingDrivers.slice(0, 2)) {
    if (!item.includes("قابل محاسبه نیست")) {
      headwinds.push(negativeDriver("محرک مخالف", item, "Asset Impact"));
    }
  }

  return {
    mainDrivers: mainDrivers.length ? mainDrivers.slice(0, 5) : [neutralDriver("محرک غالب", "هیچ محرک مثبت غالب با کیفیت کافی دیده نمی‌شود؛ خروجی فعلی بیشتر سناریومحور است.", "Unified Intelligence Layer")],
    headwinds: headwinds.length ? headwinds.slice(0, 5) : [neutralDriver("ریسک مکمل", "محرک منفی غالب دیده نمی‌شود، اما freshness و coverage همچنان باید رصد شود.", "Unified Intelligence Layer")],
  };
}

function buildRiskCards(params: {
  missingInputs: string[];
  inherited: UnifiedInheritedStates;
  confidence: number;
  impact: DirectionalImpactProfile;
}) {
  return [
    {
      title: "کیفیت داده",
      body: params.missingInputs.length
        ? `ورودی‌های ناقص: ${params.missingInputs.slice(0, 5).join("، ")}. این موارد مقدارسازی نشده‌اند و فقط confidence را کاهش می‌دهند.`
        : "ورودی‌های اصلی این دارایی از لایه مشترک در دسترس هستند.",
      source: "Signal Snapshot",
      tone: params.missingInputs.length ? "warning" : "positive",
    },
    {
      title: "شرط ابطال",
      body: params.impact.invalidationCondition,
      source: "Asset Impact + Regime",
      tone: "warning",
    },
    {
      title: "هماهنگی داشبورد",
      body: `رژیم: ${params.inherited.regime} · نقدینگی: ${params.inherited.liquidityState} · اطمینان دارایی: ${params.confidence}%.`,
      source: "Unified Intelligence Layer",
      tone: "neutral",
    },
  ] satisfies UnifiedDriverCard[];
}

function buildCorrelationCards(asset: IntelligenceAssetSymbol, correlation: ReturnType<typeof getDynamicCorrelationReport>): UnifiedCorrelationCard[] {
  const alias = asset === "Gold" ? "Gold" : asset;
  return correlation.correlationTable
    .filter((row) => row.pair.includes(alias))
    .slice(0, 4)
    .map((row) => ({
      pair: row.pair,
      correlation24h: row.correlation24h,
      correlation7d: row.correlation7d,
      correlation30d: row.correlation30d,
      observations: {
        "24h": row.observations["24h"],
        "7d": row.observations["7d"],
        "30d": row.observations["30d"],
      },
      requiredSamples: {
        "24h": row.requiredSamples["24h"],
        "7d": row.requiredSamples["7d"],
        "30d": row.requiredSamples["30d"],
      },
      coveragePercent: row.coveragePercent ?? row.coverageByWindow["7d"] ?? 0,
      status: row.status,
      confidence: row.confidence,
      source: row.source,
    }));
}

function buildForecastWidget(asset: IntelligenceAssetSymbol, forecast: ReturnType<typeof getForecastValidationCenter>): UnifiedForecastWidget {
  const row = forecast.assets.find((item) => item.asset === asset);
  return {
    status: row?.validationStatus ?? "inconclusive",
    labelFa: row?.validationLabel ?? "در انتظار داده واقعی",
    accuracy24h: row?.accuracy24h ?? null,
    accuracy7d: row?.accuracy7d ?? null,
    forecastCount: row?.forecastCount ?? 0,
    currentConfidence: row?.currentConfidence ?? null,
  };
}

function scoreCards(params: {
  fusionScore: number | null;
  riskScore: number | null;
  liquidityScore: number | null;
  macroScore: number | null;
  sentimentScore: number;
  correlationCoverage: number;
  forecastConfidence: number | null;
}) {
  return [
    {
      label: "Fusion",
      value: params.fusionScore,
      detail: params.fusionScore === null ? "Fusion فعال نیست." : "امتیاز مشترک از لایه Fusion.",
      tone: scoreTone(params.fusionScore),
    },
    {
      label: "Risk",
      value: params.riskScore,
      detail: "ریسک پایه از موتور ریسک مشترک.",
      tone: scoreTone(params.riskScore, true),
    },
    {
      label: "Liquidity",
      value: params.liquidityScore,
      detail: "LiquidityHealthScore واحد برای همه پنل‌ها.",
      tone: scoreTone(params.liquidityScore),
    },
    {
      label: "Macro",
      value: params.macroScore,
      detail: "فشار/ریسک کلان از Regime Engine.",
      tone: scoreTone(params.macroScore, true),
    },
    {
      label: "Sentiment",
      value: clampPercent(50 + params.sentimentScore / 2),
      detail: "بر پایه خبرهای پذیرفته‌شده، نه تیترهای low relevance.",
      tone: params.sentimentScore > 12 ? "good" : params.sentimentScore < -12 ? "warn" : "neutral",
    },
    {
      label: "Correlation",
      value: params.correlationCoverage,
      detail: "پوشش همبستگی‌های معتبر و هم‌تراز.",
      tone: scoreTone(params.correlationCoverage),
    },
    {
      label: "Forecast",
      value: params.forecastConfidence,
      detail: "آخرین confidence ثبت‌شده در Forecast Validation.",
      tone: scoreTone(params.forecastConfidence),
    },
  ] satisfies UnifiedScoreCard[];
}

function assetMissingInputs(assetSignals: NormalizedSignal[], impact: DirectionalImpactProfile) {
  const signalMissing = assetSignals
    .filter((signal) => !signalUsable(signal))
    .map((signal) => signal.label);
  const impactMissing = impact.confidence.missingGroups.map((group) => `گروه ${group}`);
  return Array.from(new Set([...signalMissing, ...impactMissing])).slice(0, 10);
}

function buildScenarioSummary(params: {
  asset: IntelligenceAssetSymbol;
  titleFa: string;
  bias: Exclude<DirectionalBias, "mixed">;
  confidence: number;
  inherited: UnifiedInheritedStates;
  mode: UnifiedIntelligenceMode;
}) {
  const biasFa = biasLabelsFa[params.bias];
  if (params.mode === "NO_DATA") {
    return `${params.titleFa}: داده مستقیم کافی برای سناریوی معتبر وجود ندارد؛ سیستم فعلاً نتیجه قطعی تولید نمی‌کند.`;
  }
  return `${params.titleFa}: سوگیری فعلی ${biasFa} با اطمینان ${params.confidence}% است. این برداشت از همان Fusion، رژیم «${params.inherited.regime}»، وضعیت نقدینگی «${params.inherited.liquidityState}» و لایه‌های خبر/همبستگی داشبورد ساخته شده است.`;
}

function sourceStatusForAsset(asset: IntelligenceAssetSymbol, signals: NormalizedSignal[]) {
  const sources = getSourcesForAsset(asset);
  return sources.map((source) => {
    const related = signals.find((signal) => source.assetRelevance.includes(asset) && signal.source && source.name.toLowerCase().includes(signal.source.toLowerCase().slice(0, 8)));
    return {
      ...source,
      currentStatus: related?.quality ?? source.currentStatus,
    };
  });
}

function buildAsset(
  key: UnifiedAssetKey,
  context: {
    snapshot: ReturnType<typeof getSignalSnapshot>;
    liquidityStack: ReturnType<typeof getLiquidityIntelligenceStack>;
    liquidity: ReturnType<typeof getLiquidityReport>;
    regime: ReturnType<typeof getMarketRegimeReport>;
    risk: ReturnType<typeof getRiskReport>;
    sentiment: ReturnType<typeof getSentimentReport>;
    correlation: ReturnType<typeof getDynamicCorrelationReport>;
    forecast: ReturnType<typeof getForecastValidationCenter>;
    alerts: SmartAlert[];
    globalCoverage: number;
    fusionActive: boolean;
    baseMode: UnifiedIntelligenceMode;
  },
): UnifiedAssetIntelligence {
  const registry = assetRegistry[key];
  const impact = generateAssetImpactProfile(registry.symbol);
  const assetSignals = [...assetSignalKeys[key], ...sharedSignalKeys]
    .map((signalKey) => context.snapshot.byKey[signalKey])
    .filter((signal): signal is NormalizedSignal => Boolean(signal));
  const liquidityScore = context.liquidityStack.finalLiquidityScore ?? context.liquidity.liquidityHealthScore ?? null;
  const riskScore = typeof context.risk.riskScore === "number" ? context.risk.riskScore : null;
  const macroScore = typeof context.regime.riskScore === "number" ? context.regime.riskScore : null;
  const directionScore = assetDirectionScore({
    asset: key,
    impact,
    snapshot: context.snapshot,
    liquidityScore,
    riskScore,
    sentimentScore: context.sentiment.sentimentScore,
  });
  const bias = biasFromScore(directionScore);
  const inherited = inheritedStates({
    fusionScore: liquidityScore,
    liquidityLabel: context.liquidityStack.finalLiquidityLabelFa ?? "ناموجود",
    regimeLabel: context.regime.regimeLabel ?? context.regime.label ?? "ناموجود",
    regimeInterpretation: context.regime.interpretationFa ?? "داده کلان از Regime Engine خوانده شد.",
    correlationStatus: context.correlation.engineStatus,
    correlationCoverage: context.correlation.correlationCoverage,
    sentimentAccepted: context.sentiment.acceptedHeadlinesCount,
    sentimentScore: context.sentiment.sentimentScore,
    snapshot: context.snapshot,
  });
  const sourceCoverage = computeSignalCoverage(assetSignals);
  const impactConfidence = impact.confidence.score ?? 0;
  const forecastValidation = buildForecastWidget(registry.symbol, context.forecast);
  const mode =
    context.baseMode === "NO_DATA" && context.fusionActive && context.globalCoverage > 50
      ? "PARTIAL_INTELLIGENCE"
      : context.baseMode === "FULL_INTELLIGENCE" && !impact.confidence.available
        ? "PARTIAL_INTELLIGENCE"
        : context.baseMode;
  const signalStrengthConfidence = clampPercent(40 + Math.min(35, Math.abs(directionScore) * 0.45));
  const forecastConfidence = forecastValidation.currentConfidence ?? 50;
  const calibratedBase = clampPercent(Math.round(
    sourceCoverage * 0.38
    + context.globalCoverage * 0.28
    + (impact.confidence.available ? impactConfidence : 45) * 0.16
    + forecastConfidence * 0.08
    + signalStrengthConfidence * 0.1,
  ));
  const confidence = clampPercent(Math.round(Math.min(
    context.globalCoverage,
    Math.max(30, sourceCoverage || context.globalCoverage),
    calibratedBase,
    mode === "FULL_INTELLIGENCE" ? 100 : 75,
  )));
  const missingInputs = assetMissingInputs(assetSignals, impact);
  const driverCards = buildDriverCards({
    impact,
    inherited,
    confidence,
    globalCoverage: context.globalCoverage,
    liquidityScore,
    riskScore,
    sentimentScore: context.sentiment.sentimentScore,
    mode,
  });
  const suppressedOutputs = [
    !impact.confidence.available && mode === "PARTIAL_INTELLIGENCE"
      ? "asset_impact_no_data_message_suppressed_by_partial_intelligence"
      : "",
    confidence < 45 ? "directional_certainty_capped_by_coverage" : "",
  ].filter(Boolean);

  return {
    key,
    symbol: registry.symbol,
    titleFa: registry.titleFa,
    roleFa: registry.roleFa,
    mode,
    modeLabelFa: modeLabel(mode),
    globalCoverage: context.globalCoverage,
    fusionActive: context.fusionActive,
    bias,
    confidence,
    inherited,
    scoreCards: scoreCards({
      fusionScore: liquidityScore,
      riskScore,
      liquidityScore,
      macroScore,
      sentimentScore: context.sentiment.sentimentScore,
      correlationCoverage: context.correlation.correlationCoverage,
      forecastConfidence: forecastValidation.currentConfidence,
    }),
    mainDrivers: driverCards.mainDrivers,
    headwinds: driverCards.headwinds,
    riskCards: buildRiskCards({ missingInputs, inherited, confidence, impact }),
    invalidationConditions: Array.from(new Set([
      impact.invalidationCondition,
      ...(context.regime.invalidationSignals ?? []).slice(0, 2),
      "اگر Fusion در بروزرسانی بعدی غیرفعال شود یا پوشش کل زیر ۵۰٪ بیاید، خروجی دارایی به حالت نامعتبر تنزل می‌کند.",
    ])).filter(Boolean),
    scenarioSummary: buildScenarioSummary({ asset: registry.symbol, titleFa: registry.titleFa, bias, confidence, inherited, mode }),
    correlationCards: buildCorrelationCards(registry.symbol, context.correlation),
    forecastValidation,
    alerts: context.alerts
      .filter((alert) => alert.affectedAssets.includes(registry.symbol))
      .sort((left, right) => right.importance - left.importance)
      .slice(0, 6),
    sourceMapping: sourceStatusForAsset(registry.symbol, assetSignals),
    sourceSignals: assetSignals,
    missingInputs,
    suppressedOutputs,
    generatedAt: new Date().toISOString(),
    lastUpdatedAt: context.snapshot.lastUpdatedAt,
    impactProfile: impact,
  };
}

export function getUnifiedIntelligenceReport(): UnifiedIntelligenceReport {
  const snapshot = getSignalSnapshot();
  const liquidityStack = getLiquidityIntelligenceStack();
  const liquidity = getLiquidityReport();
  const regime = getMarketRegimeReport();
  const risk = getRiskReport();
  const sentiment = getSentimentReport();
  const correlation = getDynamicCorrelationReport();
  const forecast = getForecastValidationCenter();
  const alerts = generateSmartAlerts();
  const globalCoverage = computeGlobalCoverage(snapshot);
  const fusionActive = typeof liquidityStack.finalLiquidityScore === "number" || typeof liquidity.liquidityHealthScore === "number";
  const baseMode = modeFromCoverage(globalCoverage, fusionActive);
  const context = {
    snapshot,
    liquidityStack,
    liquidity,
    regime,
    risk,
    sentiment,
    correlation,
    forecast,
    alerts,
    globalCoverage,
    fusionActive,
    baseMode,
  };
  const assets = Object.fromEntries(
    (Object.keys(assetRegistry) as UnifiedAssetKey[]).map((key) => [key, buildAsset(key, context)]),
  ) as Record<UnifiedAssetKey, UnifiedAssetIntelligence>;

  return {
    generatedAt: new Date().toISOString(),
    globalCoverage,
    fusionActive,
    mode: baseMode,
    assets,
    consistency: {
      dashboardLiquidity: liquidityStack.finalLiquidityLabelFa ?? "ناموجود",
      dashboardRegime: regime.regimeLabel ?? regime.label ?? "ناموجود",
      assetCount: Object.keys(assets).length,
      suppressedOutputs: Object.values(assets).reduce((sum, asset) => sum + asset.suppressedOutputs.length, 0),
    },
  };
}

export function getUnifiedAssetKeys() {
  return Object.keys(assetRegistry) as UnifiedAssetKey[];
}

export function getUnifiedAssetRegistry() {
  return assetRegistry;
}

export function getUnifiedAssetIntelligence(key: string) {
  const normalized = key.toLowerCase() as UnifiedAssetKey;
  if (!assetRegistry[normalized]) return null;
  return getUnifiedIntelligenceReport().assets[normalized];
}
