import "server-only";

import { TARGET_ASSETS, TARGET_ASSET_UNIVERSE_LABEL_FA, type AssetRegistryItem, type TargetAssetSymbol } from "@/lib/assets/targetAssets";
import {
  capAssetConfidenceByPublicQuality,
  coverageLabelFa,
  classifyAssetBias,
  etfFlowScore,
  macroPressureScore,
  priceMomentumScore,
  stablecoinLiquidityScore,
  volumeLiquidityScore,
  weightedImpactScore,
  type PublicFactorScore,
} from "@/lib/intelligence/assetScoring";
import {
  HUMANIZER_VERSION,
  humanizeReportBlock,
  validateHumanizedMeaningDiversity,
  type HumanizedReportBlock,
} from "@/lib/intelligence/humanReport";
import { capPublicConfidence, clamp, forecastPublicBadgeState } from "@/lib/intelligence/moduleGating";
import {
  applyConfidenceGuard,
  resolveEvidenceFreshness,
  type ConfidenceEngineInput,
  type ConfidenceEngineKey,
  type ConfidenceGuardResult,
  type EvidenceFreshnessStatus,
} from "@/lib/report/confidenceGuard";
import {
  buildEtfEvidenceClaim,
  explainPriceRegimeDivergence,
  interpretEtfFlow,
  interpretStablecoinLiquidity,
  priceActionStatus,
  type EtfInterpretation,
  type StablecoinInterpretation,
} from "@/lib/report/dataEvidence";
import { formatNumber } from "@/lib/utils";
import {
  normalizeMacroSource,
  normalizePublicMacroText,
  type NormalizedMacroSource,
} from "@/lib/macro/normalizeMacroSources";
import { assertPersianTextIntegrity } from "@/lib/report/persianTextIntegrity";
import {
  buildDerivativesLiteSummary,
  type MarketDerivativesSummary,
  type PublicDerivativesAsset,
} from "@/lib/intelligence/derivativesLite";
import {
  getDashboardAlerts,
  getDashboardCausalMarketGraph,
  getDashboardForecastValidationCenter,
  getDashboardFreshnessReport,
  getDashboardLiquidityIntelligenceStack,
  getDashboardLiquidityReport,
  getDashboardMarketRegime,
  getDashboardReliabilityReport,
  getDashboardRiskReport,
  getDashboardSignalSnapshot,
} from "@/server/dashboard/dashboard-service";
import type { NormalizedSignal } from "@/lib/types";

export type PublicMarketBrief = {
  generatedAt: string;
  dataMode: "live" | "semi_live" | "delayed" | "limited";
  dataModeFa: string;
  updateFrequencyLabel: string;
  globalConfidence: number;
  globalCoverage: number;
  confidenceGuard: ConfidenceGuardResult;
  dataEvidence: PublicDataEvidence;
  derivativesLite: MarketDerivativesSummary;
  audit: PublicReportAudit;
  targetUniverseLabelFa: string;
  marketVerdict: {
    regime: string;
    regimeFa: string;
    liquidityState: string;
    liquidityStateFa: string;
    liquidityExplanationFa: string;
    globalConfidence: number;
    riskLevel: string;
    riskLevelFa: string;
    macroPressure: string;
    macroPressureFa: string;
    summaryFa: string;
    invalidationFa: string;
    humanized: HumanizedReportBlock;
  };
  assets: PublicAssetBrief[];
  mainDrivers: PublicDriver[];
  invalidation: {
    conditionsFa: string[];
    watchNextFa: string[];
  };
  compactDataConfidence: CompactDataLayer[];
  forecastBadge: {
    statusFa: string;
    conclusiveCount: number;
    publicAccuracy: number | null;
  };
  operationalDashboard: PublicOperationalDashboard;
  reportRecord: {
    raw_engine_output: Record<string, unknown>;
    humanized_report_output: Record<string, unknown>;
    humanizer_version: string;
    generated_at: string;
    data_quality_status: string;
  };
  disclaimerFa: string;
};

export type PublicAssetBrief = {
  symbol: TargetAssetSymbol;
  name: string;
  persianName: string;
  statusFa: string;
  biasFa: string;
  impactScore: number | null;
  confidence: number;
  dataCoverage: number;
  coverageLabelFa: string;
  mainDriverFa: string;
  driversFa: string[];
  invalidationFa: string;
  freshnessLabelFa: string;
  hiddenFactors: string[];
  missingDataFlags: string[];
  mainNumericDriverFa: string;
  priceAction24h: {
    latestPriceUsd: number | null;
    changePct: number | null;
    volume24hUsd: number | null;
    sourceName: string;
    sourceUrl: string;
    timestamp: string | null;
    status: "positive" | "negative" | "neutral" | "unavailable";
    statusFa: string;
  };
  regimeView: {
    change7dPct: number | null;
    change30dPct: number | null;
    volumeTrend7dPct: number | null;
    volumeTrend30dPct: number | null;
    score: number | null;
    labelFa: string;
    confidence: number;
    explanationFa: string | null;
  };
  humanized: HumanizedReportBlock;
  derivatives: PublicDerivativesAsset | null;
};

export type PublicSourceEvidence = {
  sourceName: string | null;
  sourceUrl: string | null;
  fetchedAt: string | null;
  latestDataTimestamp: string | null;
  freshnessStatus: EvidenceFreshnessStatus;
  freshnessLabelFa: string;
};

export type PublicEtfAssetEvidence = PublicSourceEvidence & {
  asset: "BTC" | "ETH";
  latestDate: string | null;
  dailyNetFlowUsd: number | null;
  sevenDayNetFlowUsd: number | null;
  thirtyDayNetFlowUsd: number | null;
  interpretation: EtfInterpretation;
  interpretationFa: string;
};

export type PublicMacroEvidence = PublicSourceEvidence & {
  id: "DXY" | "USD_BROAD" | "US10Y" | "Nasdaq" | "Gold";
  publicLabel: string;
  publicLabelFa: string;
  technicalLabel: string;
  macroSourceType: NormalizedMacroSource["macroSourceType"];
  sourceSymbol: string | null;
  isProxy: boolean;
  proxyWarning: string | null;
  latest: number | null;
  change1d: number | null;
  change7d: number | null;
  changeUnit: "percent" | "basis_point";
};

export type PublicDataEvidence = {
  stablecoin: PublicSourceEvidence & {
    totalStablecoinMarketCapUsd: number | null;
    totalStablecoinChange7dPct: number | null;
    totalStablecoinChange30dPct: number | null;
    usdtMarketCapUsd: number | null;
    usdtChange7dPct: number | null;
    usdtChange30dPct: number | null;
    interpretation: StablecoinInterpretation;
    interpretationFa: string;
  };
  etf: {
    btc: PublicEtfAssetEvidence;
    eth: PublicEtfAssetEvidence;
  };
  macro: PublicMacroEvidence[];
};

export type PublicReportAudit = {
  reportId: string;
  generatedAt: string;
  mode: string;
  rawConfidence: number;
  confidenceCap: number;
  finalConfidence: number;
  capReasons: string[];
  weightedCoverage: number;
  sources: Array<{
    category: ConfidenceEngineKey;
    sourceName: string | null;
    sourceUrl: string | null;
    fetchedAt: string | null;
    latestDataTimestamp: string | null;
    freshnessStatus: EvidenceFreshnessStatus;
    parseStatus: ConfidenceEngineInput["parseStatus"];
    numericFieldsAvailable: string[];
  }>;
  engines: Record<ConfidenceEngineKey, ConfidenceEngineInput>;
  derivativesAudit: MarketDerivativesSummary["audit"];
  macroSources: NormalizedMacroSource[];
};

export type PublicDriver = {
  titleFa: string;
  direction: "supportive" | "pressure" | "neutral" | "mixed";
  directionFa: string;
  affectedAssets: string[];
  confidence: number;
  explanationFa: string;
  invalidationFa: string;
  humanized: HumanizedReportBlock;
};

export type CompactDataLayer = {
  layer: string;
  layerFa: string;
  statusFa: string;
  coverage: number | null;
  publicActionFa: string;
};

export type PublicOperationalDashboard = {
  liquidity: {
    score: number | null;
    labelFa: string;
    confidence: number | null;
    coverage: number | null;
    explanationFa: string;
    engines: PublicEngineScore[];
  };
  regime: {
    labelFa: string;
    confidence: number | null;
    transitionProbability: number | null;
    riskScore: number | null;
    liquidityScore: number | null;
    leverageScore: number | null;
    macroScore: number | null;
    probabilities: Array<{
      labelFa: string;
      probability: number | null;
    }>;
  };
  activeEdges: PublicActiveEdge[];
  mainAlerts: PublicMainAlert[];
  analysisEngines: PublicEngineScore[];
};

export type PublicEngineScore = {
  id: string;
  labelFa: string;
  score: number | null;
  coverage: number | null;
  confidence: number | null;
  statusFa: string;
  explanationFa: string;
};

export type PublicActiveEdge = {
  id: string;
  sourceFa: string;
  targetFa: string;
  channelFa: string;
  relationshipFa: string;
  strengthFa: string;
  confidence: number | null;
  probability: number | null;
  explanationFa: string;
  affectedAssets: string[];
};

export type PublicMainAlert = {
  id: string;
  titleFa: string;
  levelFa: string;
  confidence: number | null;
  riskFa: string;
  whyFa: string;
  affectedAssets: string[];
  expiresAt: string | null;
};

export type IntelligenceAuditPayload = {
  sourceHealth: unknown;
  missingInputs: unknown;
  staleSignals: unknown;
  forecastValidation: unknown;
  fullCausalGraph: unknown;
  correlationDiagnostics: unknown;
  derivativesDiagnostics: unknown;
  etfDiagnostics: unknown;
  newsFeedFull: unknown;
  calculationTrace: unknown;
};

type SignalMap = Record<string, NormalizedSignal | undefined>;
type PublicMarketData = {
  symbol: TargetAssetSymbol;
  priceUsd: number | null;
  change24hPct: number | null;
  change7dPct: number | null;
  change30dPct: number | null;
  volume24hUsd: number | null;
  marketCapUsd: number | null;
  lastUpdatedAt: string | null;
  source: "CoinGecko";
};
type PublicMarketDataMap = Partial<Record<TargetAssetSymbol, PublicMarketData>>;
type BuiltAssetBrief = {
  brief: PublicAssetBrief;
  priceDataAvailable: boolean;
  priceMomentumAvailable: boolean;
  sentimentOnly: boolean;
  verifiedFuturesAvailable: boolean;
  deepDataLimited: boolean;
};
type LayerCoverageState = {
  layers: CompactDataLayer[];
  priceMomentumCoverage: number;
  macroCoverage: number;
  stablecoinCoverage: number;
  etfCoverage: number;
  sentimentCoverage: number;
  futuresCoverage: number;
  coreLayerCoverage: number;
  stablecoinDataMissing: boolean;
  hasFundingAndOIForAtLeastBtcEth: boolean;
  derivativesPublicReady: boolean;
};

type LiquidityLayerDirection = "pressure" | "neutral" | "supportive" | "mixed";

const liveQualities = new Set(["live", "partial_live", "delayed", "proxy"]);
let marketDataCache: { expiresAt: number; data: PublicMarketDataMap } | null = null;

const ASSET_INVALIDATION_FA: Record<TargetAssetSymbol, string> = {
  USDT: "شرط بازنگری: اگر peg پایدار بماند، عرضه USDT بهبود یابد و خبر معتبر جدید درباره ریسک شبکه/ناشر ثبت نشود، ریسک تتر باید بازنگری شود.",
  BTC: "شرط بازنگری: اگر DXY/US10Y آرام شوند و جریان ETF بیت‌کوین در دو بروزرسانی متوالی مثبت شود، سناریوی فشار بیت‌کوین تضعیف می‌شود.",
  TRX: "شرط بازنگری: اگر قیمت و حجم TRX بهتر شود و داده‌های مرتبط با نقدینگی شبکه/USDT روی TRON تأییدکننده باشند، برداشت خنثی باید بازنگری شود.",
  ETH: "شرط بازنگری: اگر ETF اتریوم و Nasdaq همزمان بهبود نشان دهند، سناریوی فشار اتریوم باید بازنگری شود.",
  TON: "شرط بازنگری: اگر خبرهای اکوسیستم TON با رشد قیمت و حجم تأیید شوند، برداشت خنثی یا فشار محدود باید بازنگری شود.",
  SOL: "شرط بازنگری: اگر مومنتوم قیمت و حجم سولانا با کاهش ریسک فیوچرز همراه شود، سناریوی فشار سولانا تضعیف می‌شود.",
  XRP: "شرط بازنگری: اگر خبرهای رگولاتوری XRP مثبت شوند و همزمان مومنتوم قیمت بهبود یابد، سناریوی فشار تضعیف می‌شود.",
  DOGE: "شرط بازنگری: اگر سنتیمنت مثبت DOGE با افزایش حجم و شکست مومنتوم تأیید شود، برداشت خنثی باید بازنگری شود.",
  BNB: "شرط بازنگری: اگر ریسک اکوسیستم Binance کاهش یابد و حجم/مومنتوم BNB بهتر شود، سناریوی فشار BNB تضعیف می‌شود.",
  ADA: "شرط بازنگری: اگر مومنتوم ADA و سنتیمنت اکوسیستم همزمان بهتر شوند، برداشت خنثی باید بازنگری شود.",
};

function liquidityDirectionFromScore(score: number | null, pressureThreshold = -25, supportiveThreshold = 25): LiquidityLayerDirection {
  if (score === null) return "mixed";
  if (score <= pressureThreshold) return "pressure";
  if (score >= supportiveThreshold) return "supportive";
  return "neutral";
}

function liquidityDirectionFa(direction: LiquidityLayerDirection) {
  if (direction === "pressure") return "تحت فشار";
  if (direction === "supportive") return "بهبوددهنده";
  if (direction === "neutral") return "خنثی / بدون نشانه قوی";
  return "دوگانه / در انتظار روشن‌تر شدن";
}

function liquidityNarrative(params: { total: LiquidityLayerDirection; stablecoin: LiquidityLayerDirection }) {
  if (params.total === "pressure" && params.stablecoin === "neutral") {
    return "وضعیت نقدینگی کل: تحت فشار. نقدینگی استیبل‌کوین: خنثی / بدون نشانه قوی. فشار اصلی بیشتر از ETF، حجم یا سایر لایه‌های نقدینگی می‌آید.";
  }
  if (params.stablecoin === "pressure") {
    return "نقدینگی استیبل‌کوین: تحت فشار. روند استیبل‌کوین‌ها ضعف نقدینگی نقدی را تقویت می‌کند.";
  }
  if (params.stablecoin === "supportive") {
    return "نقدینگی استیبل‌کوین: بهبوددهنده. روند استیبل‌کوین‌ها نشانه بهبود نقدینگی نقدی را تقویت می‌کند.";
  }
  return `وضعیت نقدینگی کل: ${liquidityDirectionFa(params.total)}. نقدینگی استیبل‌کوین: ${liquidityDirectionFa(params.stablecoin)}.`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function numberFrom(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizePublicTextTree<T>(value: T, macroSource: NormalizedMacroSource): T {
  if (typeof value === "string") return normalizePublicMacroText(value, macroSource) as T;
  if (Array.isArray(value)) return value.map((item) => normalizePublicTextTree(item, macroSource)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, normalizePublicTextTree(item, macroSource)]),
    ) as T;
  }
  return value;
}

const PUBLIC_SOURCE_URLS = {
  coingecko: "https://api.coingecko.com/api/v3/coins/markets",
  defiLlama: "https://stablecoins.llama.fi/stablecoincharts/all",
  defiLlamaAssets: "https://stablecoins.llama.fi/stablecoins?includePrices=true",
  farsideBtc: "https://farside.co.uk/bitcoin-etf-flow-all-data/",
  farsideEth: "https://farside.co.uk/ethereum-etf-flow-all-data/",
  theBlockBtc: "https://www.theblock.co/data/etfs/bitcoin-etf/spot-bitcoin-etf-flows",
  theBlockEth: "https://www.theblock.co/data/etfs/ethereum-etf/spot-ethereum-etf-flows",
  fred: "https://fred.stlouisfed.org/",
  yahoo: "https://finance.yahoo.com/",
} as const;

function evidenceFreshnessLabelFa(status: EvidenceFreshnessStatus) {
  if (status === "fresh") return "بروز";
  if (status === "last_trading_day") return "آخرین روز معاملاتی";
  if (status === "stale") return "کهنه";
  return "ناموجود";
}

function sourceUrlFor(signal: NormalizedSignal | undefined, category: ConfidenceEngineKey, asset?: "BTC" | "ETH") {
  const source = signal?.source.toLowerCase() ?? "";
  if (category === "stablecoinLiquidity") return source.includes("circulating supply") ? PUBLIC_SOURCE_URLS.defiLlamaAssets : PUBLIC_SOURCE_URLS.defiLlama;
  if (category === "etfFlow") {
    if (source.includes("the block")) return asset === "ETH" ? PUBLIC_SOURCE_URLS.theBlockEth : PUBLIC_SOURCE_URLS.theBlockBtc;
    return asset === "ETH" ? PUBLIC_SOURCE_URLS.farsideEth : PUBLIC_SOURCE_URLS.farsideBtc;
  }
  if (category === "macro") {
    const fredSeries = source.match(/fred\s+(dgs10|dtwexbgs|dgs2|t10y2y)/i)?.[1]?.toUpperCase();
    if (fredSeries) return `${PUBLIC_SOURCE_URLS.fred}series/${fredSeries}`;
    if (source.includes("nasdaq")) return `${PUBLIC_SOURCE_URLS.yahoo}quote/%5EIXIC`;
    if (source.includes("gold")) return `${PUBLIC_SOURCE_URLS.yahoo}quote/GC=F`;
    if (source.includes("dxy")) return `${PUBLIC_SOURCE_URLS.yahoo}quote/DX-Y.NYB`;
    if (source.includes("us10y")) return `${PUBLIC_SOURCE_URLS.yahoo}quote/%5ETNX`;
    return PUBLIC_SOURCE_URLS.yahoo;
  }
  if (category === "priceMomentum") return PUBLIC_SOURCE_URLS.coingecko;
  return null;
}

function latestHistoryPoint(signal: NormalizedSignal | undefined) {
  const history = signal?.history?.filter((point) => Number.isFinite(point.value) && Number.isFinite(Date.parse(point.timestamp))) ?? [];
  return history.sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp)).at(-1) ?? null;
}

function historyChange(signal: NormalizedSignal | undefined, days: number, mode: "percent" | "basis_point") {
  const history = signal?.history?.filter((point) => Number.isFinite(point.value) && Number.isFinite(Date.parse(point.timestamp))) ?? [];
  if (history.length < 2) return null;
  const sorted = history.sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp));
  const latest = sorted.at(-1)!;
  const target = Date.parse(latest.timestamp) - days * 24 * 60 * 60 * 1000;
  const previous = [...sorted].reverse().find((point) => Date.parse(point.timestamp) <= target);
  if (!previous || previous.value === 0) return null;
  return mode === "basis_point"
    ? Number(((latest.value - previous.value) * 100).toFixed(2))
    : Number((((latest.value - previous.value) / previous.value) * 100).toFixed(4));
}

function firstAvailableSignal(signals: SignalMap, keys: string[]) {
  return keys.map((key) => signals[key]).find((signal) => signal && signal.value !== null && signal.quality !== "unavailable");
}

function sourceEvidence(
  category: ConfidenceEngineKey,
  signal: NormalizedSignal | undefined,
  fetchedAt: string,
  asset?: "BTC" | "ETH",
): PublicSourceEvidence {
  const latestDataTimestamp = latestHistoryPoint(signal)?.timestamp ?? signal?.timestamp ?? null;
  const freshnessStatus = resolveEvidenceFreshness(category, latestDataTimestamp);
  return {
    sourceName: signal?.source ?? null,
    sourceUrl: sourceUrlFor(signal, category, asset),
    fetchedAt: signal ? fetchedAt : null,
    latestDataTimestamp,
    freshnessStatus,
    freshnessLabelFa: evidenceFreshnessLabelFa(freshnessStatus),
  };
}

function etfInterpretationFa(value: EtfInterpretation) {
  if (value === "supportive") return "ورود خالص سرمایه";
  if (value === "pressure") return "خروج خالص سرمایه";
  if (value === "neutral") return "جریان دوگانه";
  return "تفسیر جهت‌دار مجاز نیست";
}

function stablecoinInterpretationFa(value: StablecoinInterpretation) {
  if (value === "supportive") return "نقدینگی استیبل‌کوین بهبوددهنده است";
  if (value === "pressure") return "نقدینگی استیبل‌کوین تحت فشار است";
  if (value === "mixed") return "نقدینگی استیبل‌کوین دوگانه و حمایت آن ضعیف است";
  return "تغییرات ۷ و ۳۰ روزه کامل نیست؛ تفسیر جهت‌دار مجاز نیست";
}

function buildDataEvidence(signals: SignalMap, marketData: PublicMarketDataMap, fetchedAt: string): PublicDataEvidence {
  const stablecoinSignal = firstAvailableSignal(signals, ["total_stablecoin_market_cap_usd", "stablecoin_market_cap_7d", "stablecoin_market_cap_30d"]);
  const stablecoin7d = signalValue(signals, "stablecoin_market_cap_7d");
  const stablecoin30d = signalValue(signals, "stablecoin_market_cap_30d");
  const stablecoinInterpretation = interpretStablecoinLiquidity(stablecoin7d, stablecoin30d);
  const stablecoinSource = sourceEvidence("stablecoinLiquidity", stablecoinSignal, fetchedAt);

  const etfAsset = (asset: "BTC" | "ETH"): PublicEtfAssetEvidence => {
    const lower = asset.toLowerCase();
    const signal = firstAvailableSignal(signals, [`${lower}_etf_flow_24h`, `${lower}_etf_flow_7d`, `${lower}_etf_flow_30d`]);
    const dailyNetFlowUsd = etfFlowUsdFromSignal(signalValue(signals, `${lower}_etf_flow_24h`));
    const sevenDayNetFlowUsd = etfFlowUsdFromSignal(signalValue(signals, `${lower}_etf_flow_7d`));
    const thirtyDayNetFlowUsd = etfFlowUsdFromSignal(signalValue(signals, `${lower}_etf_flow_30d`));
    const interpretation = interpretEtfFlow(dailyNetFlowUsd, sevenDayNetFlowUsd);
    const source = sourceEvidence("etfFlow", signal, fetchedAt, asset);
    return {
      ...source,
      asset,
      latestDate: source.latestDataTimestamp?.slice(0, 10) ?? null,
      dailyNetFlowUsd,
      sevenDayNetFlowUsd,
      thirtyDayNetFlowUsd,
      interpretation,
      interpretationFa: etfInterpretationFa(interpretation),
    };
  };

  const macroMetric = (id: PublicMacroEvidence["id"], key: string, unit: PublicMacroEvidence["changeUnit"]): PublicMacroEvidence => {
    const signal = signals[key];
    const source = sourceEvidence("macro", signal, fetchedAt);
    const normalizedSource = normalizeMacroSource({ symbol: id, sourceName: signal?.source ?? null });
    const labels =
      id === "US10Y"
        ? { publicLabel: "US10Y", publicLabelFa: "بازده اوراق ۱۰ساله آمریکا" }
        : id === "Nasdaq"
          ? { publicLabel: "Nasdaq", publicLabelFa: "نزدک" }
          : id === "Gold"
            ? { publicLabel: "Gold", publicLabelFa: "طلا" }
            : { publicLabel: normalizedSource.publicLabel, publicLabelFa: normalizedSource.publicLabelFa };
    const publicId = normalizedSource.shortCode === "USD_BROAD" ? "USD_BROAD" : id;
    return {
      ...source,
      id: publicId,
      sourceName: normalizedSource.technicalLabel,
      publicLabel: labels.publicLabel,
      publicLabelFa: labels.publicLabelFa,
      technicalLabel: normalizedSource.technicalLabel,
      macroSourceType: normalizedSource.macroSourceType,
      sourceSymbol: normalizedSource.sourceSymbol,
      isProxy: normalizedSource.isProxy,
      proxyWarning: normalizedSource.proxyWarning,
      latest: latestHistoryPoint(signal)?.value ?? null,
      change1d: signalValue(signals, key) === null ? null : unit === "basis_point" ? Number(((signalValue(signals, key) ?? 0) * 100).toFixed(2)) : signalValue(signals, key),
      change7d: historyChange(signal, 7, unit),
      changeUnit: unit,
    };
  };

  return {
    stablecoin: {
      ...stablecoinSource,
      totalStablecoinMarketCapUsd: signalValue(signals, "total_stablecoin_market_cap_usd"),
      totalStablecoinChange7dPct: stablecoin7d,
      totalStablecoinChange30dPct: stablecoin30d,
      usdtMarketCapUsd: marketData.USDT?.marketCapUsd ?? null,
      usdtChange7dPct: signalValue(signals, "usdt_supply_7d"),
      usdtChange30dPct: signalValue(signals, "usdt_supply_30d"),
      interpretation: stablecoinInterpretation,
      interpretationFa: stablecoinInterpretationFa(stablecoinInterpretation),
    },
    etf: {
      btc: etfAsset("BTC"),
      eth: etfAsset("ETH"),
    },
    macro: [
      macroMetric("DXY", "dxy_trend_24h", "percent"),
      macroMetric("US10Y", "us10y_trend_24h", "basis_point"),
      macroMetric("Nasdaq", "nasdaq_trend_24h", "percent"),
      macroMetric("Gold", "gold_trend_24h", "percent"),
    ],
  };
}

function engineInput(params: {
  category: ConfidenceEngineKey;
  signals: Array<NormalizedSignal | undefined>;
  requiredCount: number;
  fetchedAt: string;
  forceMissingWhenIncomplete?: boolean;
}): ConfidenceEngineInput {
  const availableSignals = params.signals.filter(
    (signal): signal is NormalizedSignal => Boolean(signal && signal.value !== null && signal.quality !== "unavailable" && signal.quality !== "estimated"),
  );
  const timestamp = availableSignals
    .map((signal) => latestHistoryPoint(signal)?.timestamp ?? signal.timestamp)
    .filter((value): value is string => Boolean(value))
    .sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null;
  const freshnessStatus = resolveEvidenceFreshness(params.category, timestamp);
  const incomplete = availableSignals.length < params.requiredCount;
  const status =
    availableSignals.length === 0 || (params.forceMissingWhenIncomplete && incomplete)
      ? "missing"
      : incomplete
        ? "partial"
        : freshnessStatus === "stale"
          ? "available_but_stale"
          : "available_and_fresh";
  const sources = Array.from(new Set(availableSignals.map((signal) => signal.source)));
  const confidence = availableSignals.length
    ? Math.round(availableSignals.reduce((sum, signal) => sum + signal.reliability, 0) / availableSignals.length)
    : null;
  return {
    status,
    confidence,
    sourceName: sources.join(" + ") || null,
    sourceUrl: sourceUrlFor(availableSignals[0], params.category),
    fetchedAt: availableSignals.length ? params.fetchedAt : null,
    latestDataTimestamp: timestamp,
    freshnessStatus,
    parseStatus: availableSignals.length === 0 ? "failed" : incomplete ? "partial" : "success",
    numericFieldsAvailable: availableSignals.map((signal) => signal.key),
  };
}

function buildConfidenceEngines(
  signals: SignalMap,
  marketData: PublicMarketDataMap,
  fetchedAt: string,
  derivativesLite: MarketDerivativesSummary,
): Record<ConfidenceEngineKey, ConfidenceEngineInput> {
  const priceRows = TARGET_ASSETS.map((asset) => marketData[asset.symbol]).filter((row): row is PublicMarketData => Boolean(row?.priceUsd !== null && row?.change24hPct !== null));
  const priceTimestamp = priceRows.map((row) => row.lastUpdatedAt).filter((value): value is string => Boolean(value)).sort((left, right) => Date.parse(right) - Date.parse(left))[0] ?? null;
  const priceFreshness = resolveEvidenceFreshness("priceMomentum", priceTimestamp);
  const priceStatus = priceRows.length === 0 ? "missing" : priceRows.length < TARGET_ASSETS.length ? "partial" : priceFreshness === "stale" ? "available_but_stale" : "available_and_fresh";
  const priceMomentum: ConfidenceEngineInput = {
    status: priceStatus,
    confidence: priceRows.length ? 85 : null,
    sourceName: priceRows.length ? "CoinGecko" : null,
    sourceUrl: priceRows.length ? PUBLIC_SOURCE_URLS.coingecko : null,
    fetchedAt: priceRows.length ? fetchedAt : null,
    latestDataTimestamp: priceTimestamp,
    freshnessStatus: priceFreshness,
    parseStatus: priceRows.length === 0 ? "failed" : priceRows.length < TARGET_ASSETS.length ? "partial" : "success",
    numericFieldsAvailable: priceRows.flatMap((row) => [`${row.symbol}_price`, `${row.symbol}_change_24h`]),
  };

  const stablecoinSignals = [signals.total_stablecoin_market_cap_usd, signals.stablecoin_market_cap_7d, signals.stablecoin_market_cap_30d];
  const etfSignals = [signals.btc_etf_flow_24h, signals.btc_etf_flow_7d, signals.eth_etf_flow_24h, signals.eth_etf_flow_7d];
  const macroSignals = [signals.dxy_trend_24h, signals.us10y_trend_24h];
  const derivativeSignals = [signals.funding_btc, signals.open_interest_btc_24h, signals.funding_eth, signals.open_interest_eth_24h];
  const macroInput = engineInput({ category: "macro", signals: macroSignals, requiredCount: 2, fetchedAt });
  const dollarSource = normalizeMacroSource({ symbol: "DXY", sourceName: signals.dxy_trend_24h?.source ?? null });
  macroInput.limitations = dollarSource.isProxy ? ["broad_usd_proxy_not_true_dxy"] : [];
  const derivativeInputBase = engineInput({ category: "derivatives", signals: derivativeSignals, requiredCount: 4, fetchedAt });
  const derivativesInput: ConfidenceEngineInput = {
    ...derivativeInputBase,
    status:
      derivativesLite.availableAssetsCount === 0
        ? "missing"
        : derivativesLite.assets.every((asset) => asset.stale || !asset.derivativesAvailable)
          ? "available_but_stale"
          : derivativesLite.coverage < 100
            ? "partial"
            : "available_and_fresh",
    confidence: derivativesLite.confidence,
    parseStatus: derivativesLite.availableAssetsCount === 0 ? "failed" : derivativesLite.coverage < 100 ? "partial" : "success",
    limitations: [
      ...(!derivativesLite.liquidationAvailable ? ["liquidation_missing"] : []),
      ...(derivativesLite.derivativesScope === "exchange_level_proxy" ? ["exchange_level_proxy"] : []),
    ],
  };
  return {
    priceMomentum,
    stablecoinLiquidity: engineInput({ category: "stablecoinLiquidity", signals: stablecoinSignals, requiredCount: 3, fetchedAt, forceMissingWhenIncomplete: true }),
    etfFlow: engineInput({ category: "etfFlow", signals: etfSignals, requiredCount: 4, fetchedAt }),
    macro: macroInput,
    derivatives: derivativesInput,
    sentimentNews: engineInput({ category: "sentimentNews", signals: [signals.news_sentiment_macro], requiredCount: 1, fetchedAt }),
  };
}

async function fetchPublicCoinGeckoMarketData(): Promise<PublicMarketDataMap> {
  const now = Date.now();
  if (marketDataCache && marketDataCache.expiresAt > now) return marketDataCache.data;

  const ids = TARGET_ASSETS.map((asset) => asset.coingeckoId).join(",");
  const idToAsset = new Map(TARGET_ASSETS.map((asset) => [asset.coingeckoId, asset]));
  const url =
    `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&ids=${encodeURIComponent(ids)}` +
    "&order=market_cap_desc&per_page=250&page=1&sparkline=false&price_change_percentage=24h,7d,30d";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3_500);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        accept: "application/json",
        "user-agent": "CMIP-PublicMarketBrief/1.0",
      },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`CoinGecko public market fetch failed: ${response.status}`);
    const rows = (await response.json()) as Array<Record<string, unknown>>;
    const data: PublicMarketDataMap = {};

    for (const row of rows) {
      const id = typeof row.id === "string" ? row.id : "";
      const asset = idToAsset.get(id);
      if (!asset) continue;
      data[asset.symbol] = {
        symbol: asset.symbol,
        priceUsd: numberFrom(row.current_price),
        change24hPct: numberFrom(row.price_change_percentage_24h_in_currency) ?? numberFrom(row.price_change_percentage_24h),
        change7dPct: numberFrom(row.price_change_percentage_7d_in_currency),
        change30dPct: numberFrom(row.price_change_percentage_30d_in_currency),
        volume24hUsd: numberFrom(row.total_volume),
        marketCapUsd: numberFrom(row.market_cap),
        lastUpdatedAt: typeof row.last_updated === "string" ? row.last_updated : null,
        source: "CoinGecko",
      };
    }

    marketDataCache = { expiresAt: now + 60_000, data };
    return data;
  } catch {
    marketDataCache = { expiresAt: now + 20_000, data: {} };
    return {};
  } finally {
    clearTimeout(timeout);
  }
}

function signalValue(signals: SignalMap, key: string) {
  const signal = signals[key];
  if (!signal || signal.value === null || signal.quality === "unavailable") return null;
  return signal.value;
}

function signalAvailable(signals: SignalMap, key: string) {
  const signal = signals[key];
  return Boolean(signal && signal.value !== null && liveQualities.has(signal.quality));
}

function signalFreshnessLabel(signal?: NormalizedSignal) {
  if (!signal || signal.value === null || signal.quality === "unavailable") return "داده محدود";
  if (signal.quality === "live" || signal.quality === "partial_live") return "بروز شده";
  if (signal.quality === "delayed") return "با تأخیر";
  if (signal.quality === "proxy") return "برآورد جایگزین / داده غیرمستقیم";
  return "داده محدود";
}

function prefixedSignal(signals: SignalMap, asset: TargetAssetSymbol, suffix: string) {
  return signals[`${asset.toLowerCase()}_${suffix}`];
}

function etfFlowUsdFromSignal(value: number | null) {
  if (value === null) return null;
  return Math.abs(value) < 100_000 ? value * 1_000_000 : value;
}

function marketChange(assetMarketData: PublicMarketData | undefined, signals: SignalMap, lower: string, horizon: "24h" | "7d" | "30d") {
  if (horizon === "24h") return assetMarketData?.change24hPct ?? signalValue(signals, `${lower}_trend_24h`);
  if (horizon === "7d") return assetMarketData?.change7dPct ?? signalValue(signals, `${lower}_trend_7d`);
  return assetMarketData?.change30dPct ?? signalValue(signals, `${lower}_trend_30d`);
}

function marketCapValue(assetMarketData: PublicMarketData | undefined, signals: SignalMap, lower: string) {
  return assetMarketData?.marketCapUsd ?? signalValue(signals, `${lower}_market_cap`);
}

function volumeValue(assetMarketData: PublicMarketData | undefined, signals: SignalMap, lower: string) {
  return assetMarketData?.volume24hUsd ?? signalValue(signals, `spot_volume_${lower}_24h`) ?? signalValue(signals, `${lower}_volume_24h`);
}

function hasPriceData(asset: AssetRegistryItem, assetMarketData: PublicMarketData | undefined, signals: SignalMap) {
  if (!asset.allowPriceBias) return true;
  const lower = asset.symbol.toLowerCase();
  return Boolean(
    (assetMarketData?.priceUsd !== null && assetMarketData?.priceUsd !== undefined && assetMarketData.change24hPct !== null && assetMarketData.change24hPct !== undefined) ||
      signalAvailable(signals, `${lower}_trend_24h`),
  );
}

function hasVerifiedFutures(asset: AssetRegistryItem, signals: SignalMap) {
  if (!asset.allowDerivativesIfAvailable || !asset.binanceFuturesSymbol) return false;
  const lower = asset.symbol.toLowerCase();
  return signalAvailable(signals, `funding_${lower}`) && signalAvailable(signals, `open_interest_${lower}_24h`);
}

function publicDataLabel(asset: AssetRegistryItem, params: { priceDataAvailable: boolean; stablecoinDataAvailable: boolean; sentimentOnly: boolean; deepDataLimited: boolean }) {
  if (asset.symbol === "USDT") return "داده شبکه/ناشر محدود است";
  if (!params.priceDataAvailable) return "داده قیمت ناموجود";
  if (params.sentimentOnly) return "فقط پایش خبری/سنتیمنت";
  if (params.deepDataLimited) return "داده‌های عمیق بازار کامل نیستند";
  return "بروز شده";
}

function factor(key: string, score: number | null, weight: number, labelFa: string): PublicFactorScore {
  return { key, score, weight, labelFa, available: score !== null };
}

function factorsFor(asset: AssetRegistryItem, signals: SignalMap, assetMarketData: PublicMarketData | undefined, derivatives: PublicDerivativesAsset | null): PublicFactorScore[] {
  const symbol = asset.symbol;
  const lower = symbol.toLowerCase();
  const priceScore = priceMomentumScore({
    change7dPct: marketChange(assetMarketData, signals, lower, "7d"),
    change30dPct: marketChange(assetMarketData, signals, lower, "30d"),
  });
  const marketCap = marketCapValue(assetMarketData, signals, lower);
  const volumeScore = volumeLiquidityScore({
    volume24h: volumeValue(assetMarketData, signals, lower),
    marketCap,
  });
  const macroScore = macroPressureScore({
    dxyChangePct: signalValue(signals, "dxy_trend_24h"),
    us10yChange: signalValue(signals, "us10y_trend_24h"),
    nasdaqChangePct: signalValue(signals, "nasdaq_trend_24h"),
    goldChangePct: signalValue(signals, "gold_trend_24h"),
    sentimentRiskHigh: (signalValue(signals, "geopolitical_event_score") ?? 0) > 50,
  });
  const stablecoinScore = stablecoinLiquidityScore({
    totalStablecoin7dPct: signalValue(signals, "stablecoin_market_cap_7d"),
    usdtSupply7dPct: signalValue(signals, "usdt_supply_7d"),
    usdcSupply7dPct: signalValue(signals, "usdc_supply_7d"),
  });
  const etfScore = asset.allowDirectETF
    ? etfFlowScore({
        flow24hUsd: etfFlowUsdFromSignal(signalValue(signals, `${lower}_etf_flow_24h`)),
        flow7dUsd: etfFlowUsdFromSignal(signalValue(signals, `${lower}_etf_flow_7d`)),
        assetMarketCapUsd: marketCap,
      })
    : null;
  const sentimentScore = signalValue(signals, "news_sentiment_macro");
  const derivativesScore =
    derivatives?.derivativesAvailable && !derivatives.stale && derivatives.leverageRiskScore !== null
      ? derivatives.directionalDerivativesBias === "bullish"
        ? Math.max(5, 20 - derivatives.leverageRiskScore * 0.12)
        : derivatives.directionalDerivativesBias === "bearish"
          ? -Math.max(8, derivatives.leverageRiskScore * 0.25)
          : derivatives.directionalDerivativesBias === "deleveraging"
            ? -5
            : derivatives.directionalDerivativesBias === "squeeze-risk"
              ? -Math.min(18, derivatives.leverageRiskScore * 0.2)
              : 0
      : null;

  if (symbol === "USDT") {
    return [
      factor("peg_stability", signalAvailable(signals, "usdt_peg_deviation") ? -Math.abs(signalValue(signals, "usdt_peg_deviation") ?? 0) * 100 : null, 0.2, "ثبات قیمت تتر"),
      factor("usdt_supply_trend", stablecoinScore, 0.45, "روند عرضه و ارزش بازار استیبل‌کوین‌ها"),
      factor("regulatory_sanction_news", sentimentScore === null ? null : clamp(sentimentScore, -100, 100), 0.2, "خبرهای مقرراتی/تحریمی"),
      factor("data_coverage", assetMarketData?.marketCapUsd ? 20 : null, 0.15, "کیفیت داده"),
    ];
  }

  if (asset.coverageTier === "full") {
    const etfKey = symbol === "BTC" ? "btc_etf_flow" : "eth_etf_flow";
    return [
      factor("price_momentum", priceScore, symbol === "BTC" ? 0.22 : 0.24, "مومنتوم قیمت"),
      factor("volume_liquidity", volumeScore, 0.12, "نقدشوندگی حجم"),
      factor("macro_sensitivity", macroScore, symbol === "BTC" ? 0.18 : 0.16, "حساسیت کلان"),
      factor("stablecoin_liquidity", stablecoinScore, symbol === "BTC" ? 0.16 : 0.14, "نقدینگی استیبل‌کوین"),
      factor(etfKey, etfScore, symbol === "BTC" ? 0.18 : 0.16, "جریان ETF"),
      factor("derivatives_if_available", derivativesScore, symbol === "BTC" ? 0.06 : 0.05, "فشار اهرمی"),
      factor("sentiment", sentimentScore, symbol === "BTC" ? 0.08 : 0.07, "سنتیمنت"),
    ];
  }

  if (asset.coverageTier === "medium") {
    return [
      factor("price_momentum", priceScore, 0.35, "مومنتوم قیمت"),
      factor("volume_liquidity", volumeScore, 0.2, "نقدشوندگی حجم"),
      factor("market_liquidity_context", stablecoinScore, 0.15, "زمینه نقدینگی بازار"),
      factor("asset_specific_news", sentimentScore, 0.15, "خبر و سنتیمنت مرتبط"),
      factor("derivatives_if_available", derivativesScore, 0.07, "فیوچرز در صورت دسترسی"),
      factor("sentiment", sentimentScore, 0.08, "سنتیمنت عمومی"),
    ];
  }

  return [
    factor("price_momentum", priceScore, 0.45, "مومنتوم قیمت"),
    factor("volume_liquidity", volumeScore, 0.25, "نقدشوندگی حجم"),
    factor("sentiment", sentimentScore, 0.2, "سنتیمنت"),
    factor("speculative_or_ecosystem_context", derivativesScore, 0.1, "ریسک سفته‌بازانه/اکوسیستم"),
  ];
}

function assetConfidence(asset: AssetRegistryItem, signals: SignalMap, assetMarketData: PublicMarketData | undefined, coverage: number) {
  const lower = asset.symbol.toLowerCase();
  const hasPrice = hasPriceData(asset, assetMarketData, signals);
  const stablecoinMissing = !signalAvailable(signals, "stablecoin_market_cap_7d") && !signalAvailable(signals, "usdt_supply_7d");
  const freshness = Math.round(
    clamp(
      [
        assetMarketData?.lastUpdatedAt ? ({ quality: "live" } as Pick<NormalizedSignal, "quality">) : prefixedSignal(signals, asset.symbol, "trend_24h"),
        signals.stablecoin_market_cap_7d,
        signals.dxy_trend_24h,
        signals.us10y_trend_24h,
      ].filter(Boolean).reduce((sum, signal) => sum + (signal?.quality === "live" || signal?.quality === "partial_live" ? 90 : signal?.quality === "delayed" ? 70 : 45), 0) /
        Math.max(1, [prefixedSignal(signals, asset.symbol, "trend_24h"), signals.stablecoin_market_cap_7d, signals.dxy_trend_24h, signals.us10y_trend_24h].filter(Boolean).length),
      20,
      95,
    ),
  );
  const sourceHealth = Math.min(90, Math.max(35, coverage + 15));
  const signalAlignment = coverage >= 60 ? 65 : 45;
  const sampleQuality = asset.coverageTier === "full" ? 65 : asset.coverageTier === "medium" ? 48 : 38;
  const base = 0.35 * coverage + 0.2 * sourceHealth + 0.2 * freshness + 0.15 * signalAlignment + 0.1 * sampleQuality;
  const etfPenalty = asset.allowDirectETF && !signalAvailable(signals, `${lower}_etf_flow_7d`) ? 8 : 0;

  return capPublicConfidence({
    confidence: base - etfPenalty,
    coverage,
    freshness,
    priceDataMissing: !hasPrice,
    stablecoinDataMissing: stablecoinMissing,
    assetCoverageBelowHalf: coverage < 50,
  });
}

function factorDriverText(factorItem: PublicFactorScore, weak = false) {
  if (factorItem.score === null) return `${factorItem.labelFa}: ناموجود`;
  if (weak) return `${factorItem.labelFa} محدود: در انتظار روشن‌تر شدن با قیمت و حجم`;
  const neutralThreshold = ["usdt_supply_trend", "stablecoin_liquidity", "market_liquidity_context"].includes(factorItem.key) ? 25 : 15;
  if (Math.abs(factorItem.score) < neutralThreshold) return `${factorItem.labelFa}: خنثی / در انتظار روشن‌تر شدن`;
  return `${factorItem.labelFa}: ${factorItem.score > 0 ? "بهبوددهنده" : "فشار منفی"}`;
}

function buildAssetBrief(asset: AssetRegistryItem, signals: SignalMap, assetMarketData: PublicMarketData | undefined, derivatives: PublicDerivativesAsset | null): BuiltAssetBrief {
  const factors = factorsFor(asset, signals, assetMarketData, derivatives);
  const weighted = weightedImpactScore(factors);
  const priceDataAvailable = hasPriceData(asset, assetMarketData, signals);
  const verifiedFuturesAvailable = Boolean(derivatives?.derivativesAvailable && !derivatives.stale && derivatives.latestFundingRate !== null && derivatives.openInterest24hChangePct !== null);
  const stablecoinDataAvailable = signalAvailable(signals, "stablecoin_market_cap_7d") || signalAvailable(signals, "usdt_supply_7d");
  const priceMomentumAvailable = factors.some((factorItem) => factorItem.key === "price_momentum" && factorItem.available);
  const availableNonSentiment = factors.filter((factorItem) => factorItem.available && !["sentiment", "asset_specific_news", "regulatory_sanction_news"].includes(factorItem.key));
  const sentimentOnly = !priceMomentumAvailable && availableNonSentiment.length === 0 && factors.some((factorItem) => factorItem.available && factorItem.key.includes("sentiment"));
  const deepDataLimited = priceDataAvailable && factors.some((factorItem) => !factorItem.available && !["sentiment", "asset_specific_news"].includes(factorItem.key));
  const hasDirectEtfData = asset.allowDirectETF && factors.some((factorItem) => factorItem.available && factorItem.key.includes("_etf_flow"));
  const hasAssetSpecificDeepData = verifiedFuturesAvailable || hasDirectEtfData;
  const networkIssuerDataMissing = asset.symbol === "USDT";
  const confidence = capAssetConfidenceByPublicQuality({
    symbol: asset.symbol,
    coverageTier: asset.coverageTier,
    confidence: assetConfidence(asset, signals, assetMarketData, weighted.coverage),
    deepDataLimited,
    hasDerivatives: verifiedFuturesAvailable,
    hasAssetSpecificDeepData,
    networkIssuerDataMissing,
  });
  const publicImpactScore = weighted.coverage < 50 && !priceDataAvailable ? null : weighted.impactScore;
  const biasFa = classifyAssetBias(asset, publicImpactScore, confidence, weighted.coverage);
  const availableDrivers = factors
    .filter((factorItem) => factorItem.available)
    .sort((a, b) => Math.abs(b.score ?? 0) * b.weight - Math.abs(a.score ?? 0) * a.weight)
    .slice(0, 4)
    .map((factorItem) => factorDriverText(factorItem, sentimentOnly || weighted.coverage < 50));
  const hiddenFactors = factors.filter((factorItem) => !factorItem.available).map((factorItem) => factorItem.labelFa);
  const priceSignal = prefixedSignal(signals, asset.symbol, "trend_24h");
  const dataLabel = publicDataLabel(asset, { priceDataAvailable, stablecoinDataAvailable, sentimentOnly, deepDataLimited });
  const lowCoverageLiteLabel = asset.coverageTier === "lite" && weighted.coverage < 50 && priceDataAvailable ? "فقط پایش خبری/مومنتوم محدود" : dataLabel;
  const statusFa = asset.symbol === "USDT" ? "پایش ثبات/ریسک" : weighted.coverage < 50 && publicImpactScore === null ? lowCoverageLiteLabel : biasFa;
  const invalidationFa = ASSET_INVALIDATION_FA[asset.symbol];
  const priceChange24h = marketChange(assetMarketData, signals, asset.symbol.toLowerCase(), "24h");
  const priceChange7d = marketChange(assetMarketData, signals, asset.symbol.toLowerCase(), "7d");
  const priceChange30d = marketChange(assetMarketData, signals, asset.symbol.toLowerCase(), "30d");
  const priceStatus = priceActionStatus(priceChange24h);
  const regimeDivergenceFa = explainPriceRegimeDivergence(priceChange24h, publicImpactScore);
  const mainNumericDriverFa =
    priceChange7d !== null
      ? `تغییر قیمت ۷روزه: ${priceChange7d > 0 ? "+" : ""}${formatNumber(priceChange7d, 2)}٪`
      : priceChange30d !== null
        ? `تغییر قیمت ۳۰روزه: ${priceChange30d > 0 ? "+" : ""}${formatNumber(priceChange30d, 2)}٪`
        : "محرک عددی معتبر در دسترس نیست";
  const driversFa =
    asset.symbol === "USDT"
      ? [
          "تتر به‌عنوان ابزار نقدینگی و پایداری سنجیده می‌شود، نه دارایی جهت‌دار.",
          stablecoinDataAvailable
            ? "داده عرضه و ارزش بازار استیبل‌کوین‌ها موجود است؛ اما توزیع شبکه TRON/ERC20، ذخایر ناشر، جریان صرافی‌ها و ریسک freeze فقط با منبع مستقیم نمایش داده می‌شود."
            : "داده عرضه/ارزش بازار استیبل‌کوین محدود است؛ شبکه و ناشر نیز فقط در بخش بررسی فنی با منبع مستقیم نمایش داده می‌شوند.",
          ...availableDrivers.slice(0, 2),
        ]
      : availableDrivers.length
        ? [
            dataLabel === "داده‌های عمیق بازار کامل نیستند"
              ? "قیمت و مومنتوم عمومی موجود است؛ داده‌های عمیق مثل مشتقات، آنچین یا جریان شبکه محدود هستند."
              : dataLabel,
            ...(regimeDivergenceFa ? [regimeDivergenceFa] : []),
            ...availableDrivers.slice(0, regimeDivergenceFa ? 2 : 3),
          ]
        : ["پایش فقط؛ داده قیمت/حجم مستقیم برای نتیجه‌گیری عمومی کافی نیست."];
  const humanized = humanizeReportBlock(
    {
      symbol: asset.symbol,
      statusFa,
      biasFa,
      impactScore: publicImpactScore,
      confidence,
      coverage: weighted.coverage,
      driversFa,
      invalidationFa,
    },
    {
      kind: "asset",
      titleFa: `${asset.symbol} — ${asset.persianName}`,
      assetSymbol: asset.symbol,
      assetNameFa: asset.persianName,
      statusFa,
      biasFa,
      impactScore: publicImpactScore,
      confidence,
      coverage: weighted.coverage,
      driversFa,
      invalidationFa,
      dataQualityLabelFa: deepDataLimited ? "داده‌های عمیق بازار کامل نیستند" : coverageLabelFa(weighted.coverage),
    },
  );

  return {
    brief: {
      symbol: asset.symbol,
      name: asset.name,
      persianName: asset.persianName,
      statusFa,
      biasFa,
      impactScore: publicImpactScore,
      confidence,
      dataCoverage: weighted.coverage,
      coverageLabelFa: coverageLabelFa(weighted.coverage),
      mainDriverFa: availableDrivers[0] ?? (priceDataAvailable ? "داده‌های عمیق بازار کامل نیستند؛ محرک غالب عمومی قطعی نیست." : "داده قیمت ناموجود؛ نتیجه‌گیری جهت‌دار مجاز نیست."),
      driversFa,
      invalidationFa,
      freshnessLabelFa: asset.symbol === "USDT" ? "داده شبکه/ناشر محدود است" : dataLabel === "بروز شده" ? signalFreshnessLabel(priceSignal) : dataLabel,
      hiddenFactors,
      missingDataFlags: hiddenFactors.slice(0, 4),
      mainNumericDriverFa,
      priceAction24h: {
        latestPriceUsd: assetMarketData?.priceUsd ?? null,
        changePct: priceChange24h,
        volume24hUsd: volumeValue(assetMarketData, signals, asset.symbol.toLowerCase()),
        sourceName: assetMarketData?.source ?? signals[`${asset.symbol.toLowerCase()}_trend_24h`]?.source ?? "منبع قیمت ناموجود",
        sourceUrl: PUBLIC_SOURCE_URLS.coingecko,
        timestamp: assetMarketData?.lastUpdatedAt ?? signals[`${asset.symbol.toLowerCase()}_trend_24h`]?.timestamp ?? null,
        status: priceStatus.status,
        statusFa: priceStatus.labelFa,
      },
      regimeView: {
        change7dPct: priceChange7d,
        change30dPct: priceChange30d,
        volumeTrend7dPct: null,
        volumeTrend30dPct: null,
        score: publicImpactScore,
        labelFa: biasFa,
        confidence,
        explanationFa: regimeDivergenceFa,
      },
      humanized,
      derivatives,
    },
    priceDataAvailable,
    priceMomentumAvailable,
    sentimentOnly,
    verifiedFuturesAvailable,
    deepDataLimited,
  };
}

function dataModeFrom(freshnessReport: Record<string, unknown>, globalCoverage: number): PublicMarketBrief["dataMode"] {
  const state = String(freshnessReport.overallFreshnessState ?? "");
  if (globalCoverage < 45) return "limited";
  if (state === "fresh" || state === "recent") return "semi_live";
  if (state === "delayed" || state === "stale") return "delayed";
  return "limited";
}

function dataModeFa(mode: PublicMarketBrief["dataMode"]) {
  if (mode === "live") return "زنده";
  if (mode === "semi_live") return "بروز شده";
  if (mode === "delayed") return "با تأخیر";
  return "محدود";
}

function buildCompactDataConfidence(
  signals: SignalMap,
  assetBuilds: BuiltAssetBrief[],
  forecast: PublicMarketBrief["forecastBadge"],
  derivativesLite: MarketDerivativesSummary,
): LayerCoverageState {
  const layer = (layerKey: string, layerFa: string, keys: string[], publicActionFa: string): CompactDataLayer => {
    const available = keys.filter((key) => signalAvailable(signals, key)).length;
    const coverage = Math.round((available / Math.max(1, keys.length)) * 100);
    return {
      layer: layerKey,
      layerFa,
      statusFa: coverage >= 70 ? "قابل نمایش عمومی" : coverage >= 40 ? "محدود" : "فقط بررسی فنی / جمع‌آوری",
      coverage,
      publicActionFa,
    };
  };
  const priceMomentumCoverage = Math.round((assetBuilds.filter((asset) => asset.priceMomentumAvailable).length / TARGET_ASSETS.length) * 100);
  const macroLayer = layer("macro", "کلان", ["dxy_trend_24h", "us10y_trend_24h", "nasdaq_trend_24h", "gold_trend_24h"], "با برچسب تأخیر/بروز شده در سناریو استفاده می‌شود.");
  const stablecoinLayer = layer("stablecoin", "استیبل‌کوین", ["total_stablecoin_market_cap_usd", "usdt_supply_7d", "stablecoin_market_cap_7d"], "اگر ناقص باشد اطمینان نقدینگی محدود می‌شود.");
  const etfKeys = ["btc_etf_flow_24h", "btc_etf_flow_7d", "eth_etf_flow_24h", "eth_etf_flow_7d"];
  const availableEtfInputs = etfKeys.filter((key) => signalAvailable(signals, key)).length;
  const etfCoverage = Math.round((availableEtfInputs / etfKeys.length) * 100);
  const etfLayer: CompactDataLayer = {
    layer: "etf",
    layerFa: "ETF برای BTC/ETH",
    statusFa: etfCoverage === 100 ? "ETF برای BTC/ETH: ۱۰۰٪" : etfCoverage > 0 ? "ETF برای BTC/ETH: ناقص" : "ETF برای BTC/ETH: ناموجود",
    coverage: etfCoverage,
    publicActionFa: "فقط برای بیت‌کوین و اتریوم؛ برای سایر دارایی‌ها نامرتبط است.",
  };
  const sentimentCoverage = signalAvailable(signals, "news_sentiment_macro") ? Math.round((assetBuilds.filter((asset) => asset.priceDataAvailable).length / TARGET_ASSETS.length) * 70) : 0;
  const futuresCoverage = derivativesLite.coverage;
  const hasFundingAndOIForAtLeastBtcEth = hasVerifiedFutures(TARGET_ASSETS.find((asset) => asset.symbol === "BTC")!, signals) && hasVerifiedFutures(TARGET_ASSETS.find((asset) => asset.symbol === "ETH")!, signals);
  const derivativesPublicReady = hasFundingAndOIForAtLeastBtcEth && futuresCoverage >= 60;
  const priceLayer: CompactDataLayer = {
    layer: "price_momentum",
    layerFa: "قیمت/مومنتوم",
    statusFa: priceMomentumCoverage >= 70 ? "قابل نمایش عمومی" : priceMomentumCoverage >= 40 ? "محدود" : "فقط بررسی فنی / جمع‌آوری",
    coverage: priceMomentumCoverage,
    publicActionFa: "از CoinGecko/سیگنال‌های موجود برای جدول و کارت دارایی‌ها استفاده می‌شود.",
  };
  const sentimentLayer: CompactDataLayer = {
    layer: "sentiment",
    layerFa: "سنتیمنت",
    statusFa: sentimentCoverage >= 60 ? "محدود / قابل استفاده" : sentimentCoverage > 0 ? "محدود" : "در حال جمع‌آوری",
    coverage: sentimentCoverage,
    publicActionFa: "فقط خبرهای پرارتباط وارد جمع‌بندی می‌شوند؛ خوراک کامل خبر در بخش بررسی فنی است.",
  };
  const derivativesLayer: CompactDataLayer = {
    layer: "derivatives",
    layerFa: "فیوچرز/اهرم",
    statusFa: derivativesPublicReady ? "فعال محدود؛ لیکوییدیشن موجود نیست" : futuresCoverage > 0 ? "محدود؛ فقط برای دارایی‌های دارای داده معتبر فیوچرز" : "محدود / فقط بررسی فنی",
    coverage: futuresCoverage,
    publicActionFa: derivativesPublicReady
      ? "Funding و Open Interest موجود است؛ لیکوییدیشن غایب و نمای فقط صرافی‌محور است."
      : "محدود / فقط بررسی فنی",
  };
  const forecastLayer: CompactDataLayer = {
    layer: "forecast_validation",
    layerFa: "اعتبارسنجی پیش‌بینی",
    statusFa:
      forecast.conclusiveCount === 0
        ? "هنوز برای نمایش عمومی دقت کافی ندارد"
        : forecast.conclusiveCount >= 100
          ? "قابل نمایش فشرده"
          : "در حال جمع‌آوری",
    coverage: forecast.conclusiveCount >= 100 ? 100 : null,
    publicActionFa: forecast.conclusiveCount === 0 ? "نمونه قابل قضاوت: 0" : `نمونه قابل قضاوت: ${forecast.conclusiveCount}`,
  };

  const layers = [
    priceLayer,
    macroLayer,
    stablecoinLayer,
    etfLayer,
    sentimentLayer,
    derivativesLayer,
    {
      layer: "correlation",
      layerFa: "همبستگی",
      statusFa: "در حال جمع‌آوری / فقط بررسی فنی",
      coverage: null,
      publicActionFa: "ماتریس کامل در بخش بررسی فنی است؛ گزارش عمومی فقط محرک‌های قابل اتکا را نشان می‌دهد.",
    },
    forecastLayer,
    {
      layer: "usdt_network_risk",
      layerFa: "ریسک شبکه USDT",
      statusFa: "داده مستقیم ناکافی / فقط بررسی فنی",
      coverage: null,
      publicActionFa: "TRON/ERC20 و ریسک مسدودسازی فقط با منبع مستقیم در بخش بررسی فنی/USDT نمایش داده می‌شود.",
    },
  ];

  return {
    layers,
    priceMomentumCoverage,
    macroCoverage: macroLayer.coverage ?? 0,
    stablecoinCoverage: stablecoinLayer.coverage ?? 0,
    etfCoverage: etfLayer.coverage ?? 0,
    sentimentCoverage,
    futuresCoverage,
    coreLayerCoverage: Math.round((priceMomentumCoverage + (macroLayer.coverage ?? 0) + (stablecoinLayer.coverage ?? 0) + sentimentCoverage) / 4),
    stablecoinDataMissing: (stablecoinLayer.coverage ?? 0) < 67,
    hasFundingAndOIForAtLeastBtcEth,
    derivativesPublicReady,
  };
}

export function buildDriverLabel(driverType: "macro" | "stablecoin" | "etf" | "sentiment" | "derivatives", direction: PublicDriver["direction"], strength: "weak" | "moderate" | "strong" = "moderate") {
  const strengthFa = strength === "weak" ? "محدود" : strength === "strong" ? "قوی" : "";
  const suffix = strengthFa ? ` ${strengthFa}` : "";
  const labels = {
    macro: {
      supportive: `کلان: بهبوددهنده${suffix}`,
      pressure: `کلان: فشار منفی${suffix}`,
      neutral: "کلان: خنثی / بدون نشانه قوی",
      mixed: "کلان: دوگانه / در انتظار روشن‌تر شدن",
    },
    stablecoin: {
      supportive: `نقدینگی استیبل‌کوین: بهبوددهنده${suffix}`,
      pressure: `نقدینگی استیبل‌کوین: فشار منفی${suffix}`,
      neutral: "نقدینگی استیبل‌کوین: خنثی / بدون نشانه قوی",
      mixed: "نقدینگی استیبل‌کوین: دوگانه / در انتظار روشن‌تر شدن",
    },
    etf: {
      supportive: `ETF بیت‌کوین و اتریوم: بهبوددهنده${suffix}`,
      pressure: `ETF بیت‌کوین و اتریوم: فشار منفی${suffix}`,
      neutral: "ETF بیت‌کوین و اتریوم: خنثی",
      mixed: "ETF بیت‌کوین و اتریوم: دوگانه / در انتظار روشن‌تر شدن",
    },
    sentiment: {
      supportive: `سنتیمنت: بهبوددهنده${suffix}`,
      pressure: `سنتیمنت: فشار منفی${suffix}`,
      neutral: "سنتیمنت: خنثی",
      mixed: "سنتیمنت: دوگانه / در انتظار روشن‌تر شدن",
    },
    derivatives: {
      supportive: "فیوچرز/اهرم: کاهش فشار",
      pressure: "فیوچرز/اهرم: ریسک شکنندگی",
      neutral: "فیوچرز/اهرم: خنثی",
      mixed: "فیوچرز/اهرم: دوگانه / فقط با تأیید",
    },
  } as const;

  return labels[driverType][direction];
}

function strengthFromScore(score: number) {
  const abs = Math.abs(score);
  if (abs >= 55) return "strong" as const;
  if (abs >= 25) return "moderate" as const;
  return "weak" as const;
}

function withHumanizedDriver(driver: Omit<PublicDriver, "humanized">): PublicDriver {
  return {
    ...driver,
    humanized: humanizeReportBlock(driver, {
      kind: "driver",
      titleFa: driver.titleFa,
      statusFa: driver.directionFa,
      directionFa: driver.directionFa,
      confidence: driver.confidence,
      coverage: driver.confidence,
      reasoningFa: driver.explanationFa,
      invalidationFa: driver.invalidationFa,
    }),
  };
}

function buildMainDrivers(
  signals: SignalMap,
  assets: PublicAssetBrief[],
  layerState: LayerCoverageState,
  evidence: PublicDataEvidence,
  confidenceGuard: ConfidenceGuardResult,
): PublicDriver[] {
  const drivers: PublicDriver[] = [];
  const macroScore = macroPressureScore({
    dxyChangePct: signalValue(signals, "dxy_trend_24h"),
    us10yChange: signalValue(signals, "us10y_trend_24h"),
    nasdaqChangePct: signalValue(signals, "nasdaq_trend_24h"),
    goldChangePct: signalValue(signals, "gold_trend_24h"),
    sentimentRiskHigh: (signalValue(signals, "geopolitical_event_score") ?? 0) > 50,
  });
  const sentiment = signalValue(signals, "news_sentiment_macro");
  const derivativesAvailable = layerState.derivativesPublicReady && confidenceGuard.missingCriticalData.includes("derivatives") === false;
  const dxyEvidence = evidence.macro.find((item) => item.id === "DXY" || item.id === "USD_BROAD");
  const us10yEvidence = evidence.macro.find((item) => item.id === "US10Y");

  if (macroScore !== null && (dxyEvidence?.change1d !== null || us10yEvidence?.change1d !== null)) {
    const dxyChange = dxyEvidence?.change1d ?? null;
    const yieldChange = us10yEvidence?.change1d ?? null;
    const direction =
      dxyChange !== null && yieldChange !== null && dxyChange > 0 && yieldChange > 0
        ? "pressure"
        : dxyChange !== null && yieldChange !== null && dxyChange < 0 && yieldChange < 0
          ? "supportive"
          : "mixed";
    const evidenceParts = [
      dxyChange === null ? null : `${dxyEvidence?.publicLabelFa ?? "شاخص قدرت دلار"} یک‌روزه ${dxyChange > 0 ? "+" : ""}${formatNumber(dxyChange, 2)}٪`,
      yieldChange === null ? null : `US10Y یک‌روزه ${yieldChange > 0 ? "+" : ""}${formatNumber(yieldChange, 1)} واحد پایه`,
    ].filter((value): value is string => Boolean(value));
    drivers.push(withHumanizedDriver({
      titleFa: buildDriverLabel("macro", direction, strengthFromScore(macroScore)),
      direction,
      directionFa: direction === "supportive" ? "بهبوددهنده" : direction === "pressure" ? "فشار منفی" : "دوگانه",
      affectedAssets: ["BTC", "ETH", "SOL", "DXY", "Gold", "US10Y"],
      confidence: Math.min(confidenceGuard.engineCaps.byEngine.macro, Math.round(Math.min(80, Math.abs(macroScore) + 35))),
      explanationFa: `${evidenceParts.join("؛ ")}. منبع: ${dxyEvidence?.sourceName ?? us10yEvidence?.sourceName ?? "ناموجود"}؛ آخرین داده: ${dxyEvidence?.latestDataTimestamp?.slice(0, 10) ?? us10yEvidence?.latestDataTimestamp?.slice(0, 10) ?? "ناموجود"}.`,
      invalidationFa: "اگر DXY و US10Y در دو بروزرسانی متوالی خلاف جهت فعلی حرکت کنند، خوانش کلان بازنگری می‌شود.",
    }));
  }

  if (evidence.stablecoin.interpretation !== "unavailable") {
    const direction =
      evidence.stablecoin.interpretation === "supportive"
        ? "supportive"
        : evidence.stablecoin.interpretation === "pressure"
          ? "pressure"
          : "mixed";
    const stableScore = stablecoinLiquidityScore({
      totalStablecoin7dPct: evidence.stablecoin.totalStablecoinChange7dPct,
      usdtSupply7dPct: evidence.stablecoin.usdtChange7dPct,
    }) ?? 0;
    drivers.push(withHumanizedDriver({
      titleFa: buildDriverLabel("stablecoin", direction, strengthFromScore(stableScore)),
      direction,
      directionFa: direction === "supportive" ? "بهبوددهنده" : direction === "pressure" ? "فشار منفی" : "خنثی",
      affectedAssets: assets.map((asset) => asset.symbol),
      confidence: Math.min(confidenceGuard.engineCaps.liquidityEngineConfidence, Math.round(Math.min(82, Math.abs(stableScore) + 38))),
      explanationFa: `ارزش کل استیبل‌کوین‌ها در ۷ روز ${formatNumber(evidence.stablecoin.totalStablecoinChange7dPct ?? 0, 2)}٪ و در ۳۰ روز ${formatNumber(evidence.stablecoin.totalStablecoinChange30dPct ?? 0, 2)}٪ تغییر کرده است. منبع: ${evidence.stablecoin.sourceName ?? "ناموجود"}؛ بروزرسانی: ${evidence.stablecoin.latestDataTimestamp?.slice(0, 10) ?? "ناموجود"}.`,
      invalidationFa: "اگر تغییر ۷ روزه stablecoin market cap و USDT supply خلاف جهت فعلی شود، این محرک تضعیف می‌شود.",
    }));
  }

  const etfValues = [
    evidence.etf.btc.dailyNetFlowUsd,
    evidence.etf.btc.sevenDayNetFlowUsd,
    evidence.etf.eth.dailyNetFlowUsd,
    evidence.etf.eth.sevenDayNetFlowUsd,
  ].filter((value): value is number => value !== null);
  const flowText = [evidence.etf.btc, evidence.etf.eth]
    .map((item) =>
      buildEtfEvidenceClaim({
        asset: item.asset,
        dailyFlowUsd: item.dailyNetFlowUsd,
        sevenDayFlowUsd: item.sevenDayNetFlowUsd,
        sourceName: item.sourceName,
        latestDate: item.latestDate,
      }),
    )
    .filter((value): value is string => Boolean(value));
  if (etfValues.length > 0 && flowText.length > 0) {
    const direction = etfValues.every((value) => value > 0) ? "supportive" : etfValues.every((value) => value < 0) ? "pressure" : "neutral";
    drivers.push(withHumanizedDriver({
      titleFa: buildDriverLabel("etf", direction, "moderate"),
      direction,
      directionFa: direction === "supportive" ? "بهبوددهنده" : direction === "pressure" ? "فشار منفی" : "خنثی",
      affectedAssets: ["BTC", "ETH"],
      confidence: Math.min(60, confidenceGuard.engineCaps.byEngine.etfFlow),
      explanationFa: flowText.join("؛ "),
      invalidationFa: "اگر جریان خالص ۷ روزه ETF خلاف جهت فعلی شود، اثر این محرک تغییر می‌کند.",
    }));
  }

  if (sentiment !== null && Math.abs(sentiment) >= 20) {
    drivers.push(withHumanizedDriver({
      titleFa: buildDriverLabel("sentiment", sentiment > 0 ? "supportive" : "pressure", strengthFromScore(sentiment)),
      direction: sentiment > 0 ? "supportive" : "pressure",
      directionFa: sentiment > 0 ? "بهبوددهنده" : "فشار منفی",
      affectedAssets: ["BTC", "ETH", "SOL", "USDT"],
      confidence: Math.round(Math.min(78, Math.abs(sentiment) + 35)),
      explanationFa: "فقط خبرهای با ارتباط بازار کافی وارد جمع‌بندی عمومی می‌شوند؛ خوراک کامل خبر در بخش بررسی فنی است.",
      invalidationFa: "اگر خبرهای تازه‌تر و مستقل جهت مخالف را تأیید کنند، وزن سنتیمنت کاهش می‌یابد.",
    }));
  }

  if (derivativesAvailable) {
    drivers.push(withHumanizedDriver({
      titleFa: buildDriverLabel("derivatives", "pressure", "weak"),
      direction: "pressure",
      directionFa: "ریسک شکنندگی",
      affectedAssets: ["BTC", "ETH", "SOL"],
      confidence: 55,
      explanationFa: "funding/open interest فقط وقتی داده واقعی عمومی موجود باشد نمایش داده می‌شود و سیگنال خرید/فروش نیست.",
      invalidationFa: "اگر funding و open interest بدون فشار قیمت تخلیه شوند، ریسک اهرمی کاهش می‌یابد.",
    }));
  }

  return drivers.slice(0, 5);
}

function forecastBadge() {
  const center = asRecord(getDashboardForecastValidationCenter());
  const summary = asRecord(center.summary);
  const scored = numberFrom(summary.scoredForecasts) ?? numberFrom(center.scoredForecasts) ?? 0;
  const accuracy = numberFrom(summary.overallAccuracy24h) ?? numberFrom(center.overallAccuracy24h);
  const publicState = forecastPublicBadgeState({
    accurate: accuracy === null ? 0 : Math.round((scored * accuracy) / 100),
    incorrect: accuracy === null ? scored : Math.max(0, scored - Math.round((scored * accuracy) / 100)),
  });
  return {
    statusFa: publicState.labelFa,
    conclusiveCount: scored,
    publicAccuracy: scored >= 100 ? accuracy : null,
  };
}

function sourceHealthCoverageFrom(reliability: Record<string, unknown>) {
  const direct =
    numberFrom(reliability.sourceReliability) ??
    numberFrom(reliability.coreReliability) ??
    numberFrom(reliability.marketReliability) ??
    numberFrom(reliability.coreReliabilityScore);
  if (direct === null) return 50;
  return Math.round(clamp(direct <= 1 ? direct * 100 : direct, 0, 100));
}

function signalAlignmentFrom(assets: PublicAssetBrief[], drivers: PublicDriver[]) {
  const directionalAssets = assets.filter((asset) => asset.impactScore !== null && asset.confidence >= 45);
  if (!directionalAssets.length) return 40;
  const positive = directionalAssets.filter((asset) => (asset.impactScore ?? 0) >= 15).length;
  const negative = directionalAssets.filter((asset) => (asset.impactScore ?? 0) <= -15).length;
  const dominant = Math.max(positive, negative);
  const driverConsistency = drivers.length ? drivers.filter((driver) => driver.direction !== "mixed").length / drivers.length : 0.4;
  return Math.round(clamp(35 + (dominant / directionalAssets.length) * 35 + driverConsistency * 25, 35, 95));
}

const causalNodeLabelsFa: Record<string, string> = {
  DXY: "شاخص دلار",
  US10Y: "بازده ۱۰ ساله آمریکا",
  macro_liquidity: "نقدینگی کلان",
  crypto_liquidity: "نقدینگی کریپتو",
  stablecoin_supply: "عرضه استیبل‌کوین",
  etf_flows: "جریان ETF",
  institutional_demand: "تقاضای نهادی",
  derivatives_leverage: "اهرم فیوچرز",
  market_fragility: "شکنندگی بازار",
  news_sentiment: "سنتیمنت خبری",
  risk_appetite: "ریسک‌پذیری بازار",
  BTC: "بیت‌کوین",
  ETH: "اتریوم",
  SOL: "سولانا",
  USDT: "تتر",
  Gold: "طلا",
  Nasdaq: "نزدک",
};

const regimeLabelsFa: Record<string, string> = {
  "Risk-On Expansion": "گسترش ریسک‌پذیری",
  "Weak Risk-On": "ریسک‌پذیری ضعیف",
  "Fragile Risk-On": "ریسک‌پذیری شکننده",
  "Liquidity-Constrained Risk-On": "ریسک‌پذیری محدودشده با نقدینگی",
  "Risk-Off Defensive": "دفاعی / ریسک‌گریز",
  "Liquidity Squeeze": "فشار نقدینگی",
  "Dollar Strength Pressure": "فشار تقویت دلار",
  "Rates Shock": "شوک نرخ بهره",
  "Crypto-Specific Bullish": "حمایت اختصاصی کریپتو",
  "Crypto-Specific Stress": "فشار اختصاصی کریپتو",
  "Geopolitical Shock": "شوک ژئوپلیتیک",
  "Neutral / Transition": "خنثی / در حال گذار",
  "High Volatility Unclear Regime": "نوسان بالا / رژیم نامشخص",
};

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function labelNodeFa(value: unknown) {
  const key = String(value ?? "");
  return causalNodeLabelsFa[key] ?? causalNodeLabelsFa[key.replaceAll("-", "_")] ?? key.replaceAll("_", " ");
}

function regimeLabelFa(value: unknown) {
  const key = String(value ?? "");
  return regimeLabelsFa[key] ?? key.replaceAll("_", " ");
}

function edgeRelationshipFa(value: unknown) {
  const key = String(value ?? "");
  if (key === "supports") return "حمایت‌کننده";
  if (key === "pressures") return "فشارآور";
  if (key === "amplifies") return "تقویت‌کننده ریسک";
  if (key === "dampens") return "کاهنده فشار";
  return "نامطمئن";
}

function edgeStrengthFa(value: unknown) {
  const key = String(value ?? "");
  if (key === "strong") return "قوی";
  if (key === "moderate") return "متوسط";
  if (key === "weak") return "ضعیف";
  return "داده ناکافی";
}

function channelFa(value: unknown) {
  const key = String(value ?? "");
  const labels: Record<string, string> = {
    liquidity: "نقدینگی",
    rates: "نرخ بهره",
    dollar: "دلار",
    risk_on_risk_off: "ریسک‌پذیری",
    etf_flows: "ETF",
    stablecoin_flows: "استیبل‌کوین",
    onchain_activity: "آنچین",
    geopolitical_risk: "ژئوپلیتیک",
    regulatory_risk: "رگولاتوری",
    sentiment_news_shock: "خبر/سنتیمنت",
    correlation_breakdown: "همبستگی",
    leverage: "اهرم",
  };
  return labels[key] ?? "بازار";
}

function engineStatusFa(value: unknown) {
  const key = String(value ?? "");
  if (key === "connected") return "فعال";
  if (key === "degraded") return "فعال با محدودیت";
  if (key === "missing") return "ناموجود";
  if (key === "disconnected") return "قطع";
  return "در حال بررسی";
}

function alertLevelFa(value: unknown) {
  const key = String(value ?? "");
  if (key === "Critical") return "بحرانی";
  if (key === "Important") return "مهم";
  if (key === "Watch") return "نیازمند رصد";
  return "اطلاعی";
}

function buildOperationalDashboard(params: {
  regime: Record<string, unknown>;
  liquidity: Record<string, unknown>;
  risk: Record<string, unknown>;
  liquidityScore: number | null;
  riskScore: number | null;
  macroScore: number | null;
  globalConfidence: number;
  globalCoverage: number;
  liquidityStateFa: string;
  liquidityExplanationFa: string;
  confidenceGuard: ConfidenceGuardResult;
}): PublicOperationalDashboard {
  const liquidityStack = asRecord(getDashboardLiquidityIntelligenceStack());
  const graph = asRecord(getDashboardCausalMarketGraph());
  const alerts = asArray(getDashboardAlerts()).map(asRecord);
  const stackEngines = asArray(liquidityStack.engines).map(asRecord);
  const stackConfidence = numberFrom(liquidityStack.finalConfidence);
  const stackCoverage =
    stackEngines.length > 0
      ? Math.round(stackEngines.reduce((sum, engine) => sum + (numberFrom(engine.coverage) ?? 0), 0) / stackEngines.length)
      : null;

  const liquidityEngines: PublicEngineScore[] = stackEngines.map((engine, index) => ({
    id: String(engine.id ?? `liquidity-engine-${index}`),
    labelFa: String(engine.labelFa ?? "موتور نقدینگی"),
    score: numberFrom(engine.score),
    coverage: numberFrom(engine.coverage),
    confidence: numberFrom(engine.confidence),
    statusFa: engineStatusFa(engine.status),
    explanationFa: String(engine.explanationFa ?? "این موتور بخشی از تصویر نقدینگی بازار را می‌سنجد."),
  }));

  const rawRegimeEngineConfidence = numberFrom(params.regime.confidence);
  const regimeEngineConfidence = rawRegimeEngineConfidence === null
    ? null
    : Math.min(rawRegimeEngineConfidence, params.confidenceGuard.engineCaps.marketRegimeConfidence);
  const transition = asRecord(params.regime.transitionAnalysis);
  const regimeProbabilities = asArray(params.regime.regimeProbabilities)
    .map(asRecord)
    .slice(0, 4)
    .map((item) => ({
      labelFa: regimeLabelFa(item.label ?? item.state),
      probability: numberFrom(item.probability),
    }));

  const analysisEngines: PublicEngineScore[] = [
    {
      id: "regime",
      labelFa: "موتور رژیم بازار",
      score: regimeEngineConfidence,
      coverage: params.globalCoverage,
      confidence: regimeEngineConfidence ?? params.globalConfidence,
      statusFa: regimeEngineConfidence === null ? "فعال با محدودیت" : "فعال",
      explanationFa: "رژیم بازار از ترکیب دلار، بازده اوراق، نقدینگی، مومنتوم و کیفیت داده ساخته می‌شود.",
    },
    {
      id: "liquidity",
      labelFa: "موتور نقدینگی",
      score: params.liquidityScore,
      coverage: stackCoverage,
      confidence: Math.min(
        stackConfidence ?? numberFrom(params.liquidity.liquidityRegimeConfidence) ?? params.globalConfidence,
        params.confidenceGuard.engineCaps.liquidityEngineConfidence,
      ),
      statusFa: params.liquidityScore === null ? "فعال با محدودیت" : "فعال",
      explanationFa: params.liquidityExplanationFa,
    },
    {
      id: "risk",
      labelFa: "موتور ریسک",
      score: params.riskScore,
      coverage: params.globalCoverage,
      confidence: Math.min(
        numberFrom(params.risk.confidence) ?? params.globalConfidence,
        params.confidenceGuard.engineCaps.riskEngineConfidence,
      ),
      statusFa: params.riskScore === null ? "فعال با محدودیت" : "فعال",
      explanationFa: "امتیاز ریسک نشان می‌دهد فضای فعلی بیشتر احتیاطی است یا آرام‌تر.",
    },
    {
      id: "macro",
      labelFa: "موتور کلان",
      score: params.macroScore,
      coverage: params.globalCoverage,
      confidence: Math.min(params.globalConfidence, params.confidenceGuard.engineCaps.byEngine.macro),
      statusFa: params.macroScore === null ? "فعال با محدودیت" : "فعال",
      explanationFa: "این موتور فشار دلار، نرخ بهره، نزدک و طلا را به زبان بازار کریپتو خلاصه می‌کند.",
    },
    ...liquidityEngines,
  ].slice(0, 9);

  const activeEdges: PublicActiveEdge[] = asArray(graph.activeEdges)
    .map(asRecord)
    .slice(0, 5)
    .map((edge, index) => ({
      id: String(edge.id ?? `edge-${index}`),
      sourceFa: labelNodeFa(edge.source),
      targetFa: labelNodeFa(edge.target),
      channelFa: channelFa(edge.channel),
      relationshipFa: edgeRelationshipFa(edge.relationship),
      strengthFa: edgeStrengthFa(edge.strength),
      confidence: numberFrom(edge.confidence),
      probability: numberFrom(edge.probability),
      explanationFa: String(edge.explanationFa ?? "این رابطه فعال است، اما همچنان احتمالی تفسیر می‌شود."),
      affectedAssets: asArray(edge.affectedAssets).map(String).slice(0, 6),
    }));

  const mainAlerts: PublicMainAlert[] = alerts
    .sort((left, right) => (numberFrom(right.importance) ?? 0) - (numberFrom(left.importance) ?? 0))
    .slice(0, 4)
    .map((alert, index) => ({
      id: String(alert.id ?? `alert-${index}`),
      titleFa: String(alert.titleFa ?? "هشدار بازار"),
      levelFa: alertLevelFa(alert.level),
      confidence: numberFrom(alert.confidence),
      riskFa: String(alert.severityReasonFa ?? alert.scenarioFa ?? "شدت هشدار بر اساس داده‌های موجود محدود شده است."),
      whyFa: String(alert.whyItMattersFa ?? alert.reasoningFa ?? "این هشدار یکی از محرک‌های اصلی بازار را نشان می‌دهد."),
      affectedAssets: asArray(alert.affectedAssets).map(String).slice(0, 8),
      expiresAt: typeof alert.expiresAt === "string" ? alert.expiresAt : null,
    }));

  return {
    liquidity: {
      score: params.liquidityScore,
      labelFa: params.liquidityStateFa,
      confidence: Math.min(
        stackConfidence ?? numberFrom(params.liquidity.liquidityRegimeConfidence) ?? params.globalConfidence,
        params.confidenceGuard.engineCaps.liquidityEngineConfidence,
      ),
      coverage: stackCoverage,
      explanationFa: params.liquidityExplanationFa,
      engines: liquidityEngines,
    },
    regime: {
      labelFa: String(params.regime.regimeFa ?? params.regime.labelFa ?? regimeLabelFa(params.regime.regimeLabel)),
      confidence: regimeEngineConfidence ?? params.globalConfidence,
      transitionProbability: numberFrom(transition.probability) ?? numberFrom(params.regime.transitionProbability),
      riskScore: params.riskScore,
      liquidityScore: params.liquidityScore,
      leverageScore: numberFrom(params.regime.leverageScore) ?? numberFrom(params.liquidity.leverageStress),
      macroScore: params.macroScore,
      probabilities: regimeProbabilities,
    },
    activeEdges,
    mainAlerts,
    analysisEngines,
  };
}

function capAssetsForReport(assetBuilds: BuiltAssetBrief[], confidenceCap: number) {
  return assetBuilds.map((built) => {
    const confidence = Math.min(built.brief.confidence, confidenceCap);
    if (confidence === built.brief.confidence) return built.brief;
    const brief = built.brief;
    return {
      ...brief,
      confidence,
      regimeView: { ...brief.regimeView, confidence },
      humanized: humanizeReportBlock(
        {
          symbol: brief.symbol,
          statusFa: brief.statusFa,
          biasFa: brief.biasFa,
          impactScore: brief.impactScore,
          confidence,
          coverage: brief.dataCoverage,
          driversFa: brief.driversFa,
          invalidationFa: brief.invalidationFa,
        },
        {
          kind: "asset",
          titleFa: `${brief.symbol} — ${brief.persianName}`,
          assetSymbol: brief.symbol,
          assetNameFa: brief.persianName,
          statusFa: brief.statusFa,
          biasFa: brief.biasFa,
          impactScore: brief.impactScore,
          confidence,
          coverage: brief.dataCoverage,
          driversFa: brief.driversFa,
          invalidationFa: brief.invalidationFa,
          dataQualityLabelFa: brief.coverageLabelFa,
        },
      ),
    };
  });
}

export async function buildPublicMarketBrief(): Promise<PublicMarketBrief> {
  const snapshot = getDashboardSignalSnapshot();
  const signals = snapshot.byKey as SignalMap;
  const marketData = await fetchPublicCoinGeckoMarketData();
  const generatedAt = new Date().toISOString();
  const reliability = asRecord(getDashboardReliabilityReport());
  const freshness = asRecord(getDashboardFreshnessReport());
  const regime = asRecord(getDashboardMarketRegime());
  const liquidity = asRecord(getDashboardLiquidityReport());
  const risk = asRecord(getDashboardRiskReport());
  const derivativesLite = buildDerivativesLiteSummary(
    signals,
    Object.fromEntries(
      TARGET_ASSETS.filter((asset) => asset.symbol !== "USDT").map((asset) => [
        asset.symbol,
        { change24hPct: marketData[asset.symbol]?.change24hPct ?? null, change7dPct: marketData[asset.symbol]?.change7dPct ?? null },
      ]),
    ),
  );
  const assetBuilds = TARGET_ASSETS.map((asset) =>
    buildAssetBrief(asset, signals, marketData[asset.symbol], asset.symbol === "USDT" ? null : derivativesLite.assets.find((item) => item.asset === asset.symbol) ?? null),
  );
  const preliminaryAssets = assetBuilds.map((asset) => asset.brief);
  const averageConfidence = Math.round(preliminaryAssets.reduce((sum, asset) => sum + asset.confidence, 0) / Math.max(1, preliminaryAssets.length));
  const sourceHealthCoverage = sourceHealthCoverageFrom(reliability);
  const rawLiquidityScore = numberFrom(liquidity.liquidityHealthScore) ?? numberFrom(liquidity.score) ?? numberFrom(liquidity.cryptoLiquidityProxyScore);
  const riskScore = numberFrom(risk.riskScore) ?? numberFrom(risk.score);
  const rawMacroScore = macroPressureScore({
    dxyChangePct: signalValue(signals, "dxy_trend_24h"),
    us10yChange: signalValue(signals, "us10y_trend_24h"),
    nasdaqChangePct: signalValue(signals, "nasdaq_trend_24h"),
    goldChangePct: signalValue(signals, "gold_trend_24h"),
  });
  const rawStableScore = stablecoinLiquidityScore({
    totalStablecoin7dPct: signalValue(signals, "stablecoin_market_cap_7d"),
    usdtSupply7dPct: signalValue(signals, "usdt_supply_7d"),
    usdcSupply7dPct: signalValue(signals, "usdc_supply_7d"),
  });
  const forecast = forecastBadge();
  const layerState = buildCompactDataConfidence(signals, assetBuilds, forecast, derivativesLite);
  const dataEvidence = buildDataEvidence(signals, marketData, generatedAt);
  const engineInputs = buildConfidenceEngines(signals, marketData, generatedAt, derivativesLite);
  const coverageProbe = applyConfidenceGuard({ rawConfidence: 100, reportMode: "public_market_brief", engines: engineInputs });
  const preliminaryDrivers = buildMainDrivers(signals, preliminaryAssets, layerState, dataEvidence, coverageProbe);
  const signalAlignment = signalAlignmentFrom(preliminaryAssets, preliminaryDrivers);
  const rawConfidence = Math.round(
    clamp(
      0.35 * averageConfidence +
        0.25 * coverageProbe.dataCoverageWeighted +
        0.2 * signalAlignment +
        0.2 * sourceHealthCoverage,
      0,
      100,
    ),
  );
  const confidenceGuard = applyConfidenceGuard({ rawConfidence, reportMode: "public_market_brief", engines: engineInputs });
  const globalConfidence = confidenceGuard.finalConfidence;
  const globalCoverage = confidenceGuard.dataCoverageWeighted;
  const assets = capAssetsForReport(assetBuilds, confidenceGuard.confidenceCap);
  const drivers = buildMainDrivers(signals, assets, layerState, dataEvidence, confidenceGuard);
  const humanizedDiversity = validateHumanizedMeaningDiversity(assets.map((asset) => asset.humanized));
  if (!humanizedDiversity.valid) console.warn(`CMIP ${HUMANIZER_VERSION} repetition warning`, humanizedDiversity);

  const stablecoinMissing = confidenceGuard.missingCriticalData.includes("stablecoinLiquidity");
  const macroMissing = confidenceGuard.missingCriticalData.includes("macro");
  const liquidityScore = stablecoinMissing ? null : rawLiquidityScore;
  const macroScore = macroMissing ? null : rawMacroScore;
  const stableScore = dataEvidence.stablecoin.interpretation === "unavailable" ? null : rawStableScore;
  const mode = dataModeFrom(freshness, globalCoverage);
  const totalLiquidityDirection: LiquidityLayerDirection = liquidityScore === null ? "mixed" : liquidityScore <= 40 ? "pressure" : liquidityScore <= 60 ? "neutral" : "supportive";
  const stablecoinLiquidityDirection: LiquidityLayerDirection =
    dataEvidence.stablecoin.interpretation === "supportive"
      ? "supportive"
      : dataEvidence.stablecoin.interpretation === "pressure"
        ? "pressure"
        : dataEvidence.stablecoin.interpretation === "mixed"
          ? "mixed"
          : "neutral";
  const liquidityExplanationFa = stablecoinMissing
    ? "تغییرات تاریخی ۷ و ۳۰ روزه استیبل‌کوین کامل نیست؛ امتیاز و ادعای جهت‌دار نقدینگی در گزارش عمومی غیرفعال شده است."
    : liquidityNarrative({ total: totalLiquidityDirection, stablecoin: stablecoinLiquidityDirection });
  const liquidityStateFa =
    liquidityScore === null
      ? "نقدینگی نامطمئن"
      : liquidityScore <= 20
        ? "فشار شدید نقدینگی"
        : liquidityScore <= 40
          ? "نقدینگی ضعیف"
          : liquidityScore <= 60
            ? "نقدینگی خنثی"
            : liquidityScore <= 80
              ? "نقدینگی سالم"
              : "گسترش نقدینگی";
  const riskLevelFa =
    riskScore === null
      ? "ریسک نامطمئن"
      : riskScore >= 80
        ? "ریسک بحرانی"
        : riskScore >= 65
        ? "ریسک بالا"
        : riskScore >= 45
            ? "ریسک رو به افزایش"
            : riskScore >= 25
              ? "ریسک متوسط"
              : "ریسک پایین";
  const macroPressureFa = macroScore === null ? "داده کلان محدود" : macroScore < -20 ? "فشار کلان" : macroScore > 20 ? "حمایت کلان نسبی" : "کلان دوگانه";
  const etfEvidenceAvailable = dataEvidence.etf.btc.interpretation !== "unavailable" || dataEvidence.etf.eth.interpretation !== "unavailable";
  const marketSummaryFa =
    globalConfidence < 40
      ? "پوشش و اعتماد به کیفیت تحلیل برای سناریوی قطعی کافی نیست؛ گزارش فقط وضعیت داده و محرک‌های قابل پایش را نشان می‌دهد."
      : `بازار کریپتو فعلاً جهت قطعی ندارد. ${liquidityScore === null ? "داده تاریخی نقدینگی برای نتیجه‌گیری جهت‌دار کامل نیست." : `وضعیت نقدینگی «${liquidityStateFa}» است.`} ${etfEvidenceAvailable ? "ارقام ETF در بخش شواهد عددی ثبت شده‌اند." : "جریان ETF عددی در دسترس نیست."}`;
  const marketReasoningFa = `این جمع‌بندی بر پایه پوشش وزنی ${formatNumber(globalCoverage, 0)}٪، وضعیت «${macroPressureFa}» و «${riskLevelFa}» ساخته شده است. ${confidenceGuard.capReasonsFa.length ? `سقف اعتماد به دلیل ${confidenceGuard.capReasonsFa.join("، ")} اعمال شده است.` : "محدودیت بحرانی تازه‌ای ثبت نشده است."}`;
  const marketVerdictHumanized = humanizeReportBlock(
    {
      statusFa: String(regime.regimeFa ?? regime.labelFa ?? (globalConfidence < 40 ? "نتیجه قطعی مجاز نیست" : "فضای کلی بازار با داده محدود")),
      confidence: globalConfidence,
      coverage: globalCoverage,
      impactScore: macroScore,
      summaryFa: marketSummaryFa,
      invalidationFa: "اگر دو محرک اصلی در دو بروزرسانی متوالی خلاف جهت فعلی حرکت کنند، سناریوی بازار باید بازنگری شود.",
    },
    {
      kind: "market",
      titleFa: "جمع‌بندی بازار",
      statusFa: String(regime.regimeFa ?? regime.labelFa ?? "فضای کلی بازار با داده محدود"),
      confidence: globalConfidence,
      coverage: globalCoverage,
      impactScore: macroScore,
      riskLabelFa: riskLevelFa,
      reasoningFa: marketReasoningFa,
      invalidationFa: "اگر دو محرک اصلی در دو بروزرسانی متوالی خلاف جهت فعلی حرکت کنند، سناریوی بازار باید بازنگری شود.",
    },
  );
  const operationalDashboard = buildOperationalDashboard({
    regime,
    liquidity,
    risk,
    liquidityScore,
    riskScore,
    macroScore,
    globalConfidence,
    globalCoverage,
    liquidityStateFa,
    liquidityExplanationFa,
    confidenceGuard,
  });
  const audit: PublicReportAudit = {
    reportId: `cmip-${generatedAt}`,
    generatedAt,
    mode,
    rawConfidence: confidenceGuard.rawConfidence,
    confidenceCap: confidenceGuard.confidenceCap,
    finalConfidence: confidenceGuard.finalConfidence,
    capReasons: confidenceGuard.capReasons,
    weightedCoverage: confidenceGuard.dataCoverageWeighted,
    sources: (Object.entries(engineInputs) as Array<[ConfidenceEngineKey, ConfidenceEngineInput]>).map(([category, engine]) => ({
      category,
      sourceName: engine.sourceName,
      sourceUrl: engine.sourceUrl,
      fetchedAt: engine.fetchedAt,
      latestDataTimestamp: engine.latestDataTimestamp,
      freshnessStatus: engine.freshnessStatus,
      parseStatus: engine.parseStatus,
      numericFieldsAvailable: engine.numericFieldsAvailable,
    })),
    engines: engineInputs,
    derivativesAudit: derivativesLite.audit,
    macroSources: dataEvidence.macro.map((item) => ({
      macroSourceType: item.macroSourceType,
      sourceSymbol: item.sourceSymbol,
      publicLabel: item.publicLabel,
      publicLabelFa: item.publicLabelFa,
      technicalLabel: item.technicalLabel,
      shortCode: item.id === "USD_BROAD" ? "USD_BROAD" : item.id === "DXY" ? "DXY" : "MACRO",
      isProxy: item.isProxy,
      proxyWarning: item.proxyWarning,
    })),
  };

  const dollarMacroSource = dataEvidence.macro.find((item) => item.id === "USD_BROAD" || item.id === "DXY");
  const normalizedDollarSource = dollarMacroSource
    ? normalizeMacroSource({ symbol: dollarMacroSource.sourceSymbol, sourceName: dollarMacroSource.technicalLabel })
    : normalizeMacroSource({ symbol: "DXY" });
  const normalizePublic = <T,>(value: T) => normalizePublicTextTree(value, normalizedDollarSource);

  const brief: PublicMarketBrief = {
    generatedAt,
    dataMode: mode,
    dataModeFa: dataModeFa(mode),
    updateFrequencyLabel: "بروزرسانی عمومی هر ۳۰ دقیقه؛ داده‌های کلان و ETF ممکن است با تأخیر باشند.",
    globalConfidence,
    globalCoverage,
    confidenceGuard,
    dataEvidence,
    derivativesLite,
    audit,
    targetUniverseLabelFa: TARGET_ASSET_UNIVERSE_LABEL_FA,
    marketVerdict: normalizePublic({
      regime: String(regime.regime ?? regime.currentRegime ?? "limited"),
      regimeFa: String(regime.regimeFa ?? regime.labelFa ?? (globalConfidence < 40 ? "نتیجه قطعی مجاز نیست" : "فضای کلی بازار با داده محدود")),
      liquidityState: String(liquidity.state ?? liquidity.classification ?? "limited"),
      liquidityStateFa,
      liquidityExplanationFa,
      globalConfidence,
      riskLevel: String(risk.level ?? "limited"),
      riskLevelFa,
      macroPressure: macroScore === null ? "limited" : macroScore < -20 ? "pressure" : macroScore > 20 ? "supportive" : "mixed",
      macroPressureFa,
      summaryFa: marketSummaryFa,
      invalidationFa: "اگر دو محرک اصلی در دو بروزرسانی متوالی خلاف جهت فعلی حرکت کنند، سناریوی بازار باید بازنگری شود.",
      humanized: marketVerdictHumanized,
    }),
    assets: normalizePublic(assets),
    mainDrivers: normalizePublic(drivers.slice(0, 5)),
    invalidation: normalizePublic({
      conditionsFa: [
        "اگر DXY و US10Y در دو بروزرسانی متوالی آرام شوند، فشار کلان کاهش می‌یابد.",
        "اگر ارزش بازار استیبل‌کوین‌ها و جریان ETF همزمان بهبود یابد، خوانش نقدینگی بهتر می‌شود.",
        "اگر funding/open interest بدون افت قیمت تخلیه شود، ریسک اهرمی کاهش می‌یابد.",
      ],
      watchNextFa: ["DXY و US10Y", "ETF Flow بیت‌کوین و اتریوم", "تغییر ۷ روزه stablecoin market cap و USDT supply"],
    }),
    compactDataConfidence: layerState.layers,
    forecastBadge: forecast,
    operationalDashboard: normalizePublic(operationalDashboard),
    reportRecord: {
      raw_engine_output: {
        rawConfidence,
        weightedCoverage: globalCoverage,
        confidenceCap: confidenceGuard.confidenceCap,
        finalConfidence: globalConfidence,
        rawLiquidityScore,
        liquidityScore,
        stableScore,
        rawMacroScore,
        macroScore,
        riskScore,
        forecast,
        capReasons: confidenceGuard.capReasons,
        engines: engineInputs,
        dataEvidence,
        derivativesLite,
      },
      humanized_report_output: {
        marketVerdict: normalizePublic(marketVerdictHumanized),
        assets: normalizePublic(assets.map((asset) => asset.humanized)),
        drivers: normalizePublic(drivers.map((driver) => driver.humanized)),
      },
      humanizer_version: HUMANIZER_VERSION,
      generated_at: generatedAt,
      data_quality_status: globalCoverage >= 75 ? "پوشش داده مناسب" : globalCoverage >= 50 ? "پوشش داده متوسط" : "داده ناقص یا در انتظار روشن‌تر شدن",
    },
    disclaimerFa: "این گزارش توصیه مالی نیست؛ فقط وضعیت فعلی بازار را خلاصه می‌کند.",
  };

  assertPersianTextIntegrity(
    JSON.stringify({
      marketVerdict: brief.marketVerdict,
      assets: brief.assets,
      drivers: brief.mainDrivers,
      invalidation: brief.invalidation,
      operationalDashboard: brief.operationalDashboard,
    }),
  );
  return brief;
}
