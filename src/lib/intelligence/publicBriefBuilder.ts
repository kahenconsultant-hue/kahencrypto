import "server-only";

import { TARGET_ASSETS, TARGET_ASSET_UNIVERSE_LABEL_FA, type AssetRegistryItem, type TargetAssetSymbol } from "@/lib/assets/targetAssets";
import {
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
import { capPublicConfidence, clamp, forecastPublicBadgeState } from "@/lib/intelligence/moduleGating";
import {
  getDashboardForecastValidationCenter,
  getDashboardFreshnessReport,
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
  targetUniverseLabelFa: string;
  marketVerdict: {
    regime: string;
    regimeFa: string;
    liquidityState: string;
    liquidityStateFa: string;
    riskLevel: string;
    riskLevelFa: string;
    macroPressure: string;
    macroPressureFa: string;
    summaryFa: string;
    invalidationFa: string;
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
};

export type PublicDriver = {
  titleFa: string;
  direction: "supportive" | "pressure" | "neutral" | "mixed";
  directionFa: string;
  affectedAssets: string[];
  confidence: number;
  explanationFa: string;
  invalidationFa: string;
};

export type CompactDataLayer = {
  layer: string;
  layerFa: string;
  statusFa: string;
  coverage: number | null;
  publicActionFa: string;
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
  derivativesPublicReady: boolean;
};

const liveQualities = new Set(["live", "partial_live", "delayed", "proxy"]);
let marketDataCache: { expiresAt: number; data: PublicMarketDataMap } | null = null;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function numberFrom(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
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
  if (signal.quality === "proxy") return "پراکسی / مشتق‌شده";
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
  if (params.deepDataLimited) return "داده عمیق محدود است";
  return "بروز شده";
}

function factor(key: string, score: number | null, weight: number, labelFa: string): PublicFactorScore {
  return { key, score, weight, labelFa, available: score !== null };
}

function factorsFor(asset: AssetRegistryItem, signals: SignalMap, assetMarketData: PublicMarketData | undefined): PublicFactorScore[] {
  const symbol = asset.symbol;
  const lower = symbol.toLowerCase();
  const priceScore = priceMomentumScore({
    change24hPct: marketChange(assetMarketData, signals, lower, "24h"),
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
    hasVerifiedFutures(asset, signals)
      ? -Math.min(35, Math.abs(signalValue(signals, `funding_${lower}`) ?? 0) * 10_000 + Math.max(0, signalValue(signals, `open_interest_${lower}_24h`) ?? 0) * 0.5)
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
  if (weak) return `${factorItem.labelFa} محدود: نیازمند تأیید با قیمت و حجم`;
  if (Math.abs(factorItem.score) < 15) return `${factorItem.labelFa}: خنثی / نیازمند تأیید`;
  return `${factorItem.labelFa}: ${factorItem.score > 0 ? "حمایتی" : "فشارزا"}`;
}

function buildAssetBrief(asset: AssetRegistryItem, signals: SignalMap, assetMarketData: PublicMarketData | undefined): BuiltAssetBrief {
  const factors = factorsFor(asset, signals, assetMarketData);
  const weighted = weightedImpactScore(factors);
  const priceDataAvailable = hasPriceData(asset, assetMarketData, signals);
  const verifiedFuturesAvailable = hasVerifiedFutures(asset, signals);
  const stablecoinDataAvailable = signalAvailable(signals, "stablecoin_market_cap_7d") || signalAvailable(signals, "usdt_supply_7d");
  const priceMomentumAvailable = factors.some((factorItem) => factorItem.key === "price_momentum" && factorItem.available);
  const availableNonSentiment = factors.filter((factorItem) => factorItem.available && !["sentiment", "asset_specific_news", "regulatory_sanction_news"].includes(factorItem.key));
  const sentimentOnly = !priceMomentumAvailable && availableNonSentiment.length === 0 && factors.some((factorItem) => factorItem.available && factorItem.key.includes("sentiment"));
  const deepDataLimited = priceDataAvailable && factors.some((factorItem) => !factorItem.available && !["sentiment", "asset_specific_news"].includes(factorItem.key));
  const confidence = assetConfidence(asset, signals, assetMarketData, weighted.coverage);
  const biasFa = classifyAssetBias(asset, weighted.impactScore, confidence, weighted.coverage);
  const availableDrivers = factors
    .filter((factorItem) => factorItem.available)
    .sort((a, b) => Math.abs(b.score ?? 0) * b.weight - Math.abs(a.score ?? 0) * a.weight)
    .slice(0, 4)
    .map((factorItem) => factorDriverText(factorItem, sentimentOnly || weighted.coverage < 50));
  const hiddenFactors = factors.filter((factorItem) => !factorItem.available).map((factorItem) => factorItem.labelFa);
  const priceSignal = prefixedSignal(signals, asset.symbol, "trend_24h");
  const dataLabel = publicDataLabel(asset, { priceDataAvailable, stablecoinDataAvailable, sentimentOnly, deepDataLimited });
  const lowCoverageLiteLabel = asset.coverageTier === "lite" && weighted.coverage < 50 && priceDataAvailable ? "فقط پایش خبری/مومنتوم محدود" : dataLabel;
  const statusFa = asset.symbol === "USDT" ? "پایش ثبات/ریسک" : weighted.coverage < 50 ? lowCoverageLiteLabel : biasFa;
  const publicImpactScore = weighted.coverage < 50 && !priceDataAvailable ? null : weighted.impactScore;

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
      mainDriverFa: availableDrivers[0] ?? (priceDataAvailable ? "داده عمیق محدود است؛ محرک غالب عمومی قطعی نیست." : "داده قیمت ناموجود؛ نتیجه‌گیری جهت‌دار مجاز نیست."),
      driversFa:
        asset.symbol === "USDT"
          ? [
              "تتر به‌عنوان ابزار نقدینگی و پایداری سنجیده می‌شود، نه دارایی جهت‌دار.",
              stablecoinDataAvailable
                ? "داده عرضه و ارزش بازار استیبل‌کوین‌ها موجود است؛ اما توزیع شبکه TRON/ERC20، ذخایر ناشر، جریان صرافی‌ها و ریسک freeze فقط با منبع مستقیم نمایش داده می‌شود."
                : "داده عرضه/ارزش بازار استیبل‌کوین محدود است؛ شبکه و ناشر نیز فقط در Audit با منبع مستقیم نمایش داده می‌شوند.",
              ...availableDrivers.slice(0, 2),
            ]
          : availableDrivers.length
            ? [
                dataLabel === "داده عمیق محدود است"
                  ? "قیمت و مومنتوم عمومی موجود است؛ داده‌های عمیق مثل مشتقات، آنچین یا جریان شبکه محدود هستند."
                  : dataLabel,
                ...availableDrivers.slice(0, 3),
              ]
            : ["پایش فقط؛ داده قیمت/حجم مستقیم برای نتیجه‌گیری عمومی کافی نیست."],
      invalidationFa:
        confidence < 45
          ? "اگر داده قیمت، نقدینگی و خبرهای مرتبط در دو بروزرسانی بعدی کامل‌تر نشود، نتیجه‌گیری جهت‌دار مجاز نیست."
          : "اگر محرک اصلی در دو بروزرسانی متوالی خلاف جهت فعلی حرکت کند، سناریو باید بازنگری شود.",
      freshnessLabelFa: asset.symbol === "USDT" ? "داده شبکه/ناشر محدود است" : dataLabel === "بروز شده" ? signalFreshnessLabel(priceSignal) : dataLabel,
      hiddenFactors,
    },
    priceDataAvailable,
    priceMomentumAvailable,
    sentimentOnly,
    verifiedFuturesAvailable,
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

function buildCompactDataConfidence(signals: SignalMap, assetBuilds: BuiltAssetBrief[], forecast: PublicMarketBrief["forecastBadge"]): LayerCoverageState {
  const layer = (layerKey: string, layerFa: string, keys: string[], publicActionFa: string): CompactDataLayer => {
    const available = keys.filter((key) => signalAvailable(signals, key)).length;
    const coverage = Math.round((available / Math.max(1, keys.length)) * 100);
    return {
      layer: layerKey,
      layerFa,
      statusFa: coverage >= 70 ? "قابل نمایش عمومی" : coverage >= 40 ? "محدود" : "فقط Audit / جمع‌آوری",
      coverage,
      publicActionFa,
    };
  };
  const priceMomentumCoverage = Math.round((assetBuilds.filter((asset) => asset.priceMomentumAvailable).length / TARGET_ASSETS.length) * 100);
  const macroLayer = layer("macro", "کلان", ["dxy_trend_24h", "us10y_trend_24h", "nasdaq_trend_24h", "gold_trend_24h"], "با برچسب تأخیر/بروز شده در سناریو استفاده می‌شود.");
  const stablecoinLayer = layer("stablecoin", "استیبل‌کوین", ["total_stablecoin_market_cap_usd", "usdt_supply_7d", "stablecoin_market_cap_7d"], "اگر ناقص باشد اطمینان نقدینگی محدود می‌شود.");
  const etfLayer = layer("etf", "ETF", ["btc_etf_flow_24h", "btc_etf_flow_7d", "eth_etf_flow_24h", "eth_etf_flow_7d"], "فقط برای BTC و ETH؛ برای سایر دارایی‌ها نامرتبط است.");
  const sentimentCoverage = signalAvailable(signals, "news_sentiment_macro") ? Math.round((assetBuilds.filter((asset) => asset.priceDataAvailable).length / TARGET_ASSETS.length) * 70) : 0;
  const futuresSymbols = TARGET_ASSETS.filter((asset) => asset.allowDerivativesIfAvailable && asset.binanceFuturesSymbol);
  const futuresCoverage = Math.round((assetBuilds.filter((asset) => asset.verifiedFuturesAvailable).length / Math.max(1, futuresSymbols.length)) * 100);
  const derivativesPublicReady = hasVerifiedFutures(TARGET_ASSETS.find((asset) => asset.symbol === "BTC")!, signals) && hasVerifiedFutures(TARGET_ASSETS.find((asset) => asset.symbol === "ETH")!, signals);
  const priceLayer: CompactDataLayer = {
    layer: "price_momentum",
    layerFa: "قیمت/مومنتوم",
    statusFa: priceMomentumCoverage >= 70 ? "قابل نمایش عمومی" : priceMomentumCoverage >= 40 ? "محدود" : "فقط Audit / جمع‌آوری",
    coverage: priceMomentumCoverage,
    publicActionFa: "از CoinGecko/سیگنال‌های موجود برای جدول و کارت دارایی‌ها استفاده می‌شود.",
  };
  const sentimentLayer: CompactDataLayer = {
    layer: "sentiment",
    layerFa: "سنتیمنت",
    statusFa: sentimentCoverage >= 60 ? "محدود / قابل استفاده" : sentimentCoverage > 0 ? "محدود" : "در حال جمع‌آوری",
    coverage: sentimentCoverage,
    publicActionFa: "فقط خبرهای پرارتباط وارد جمع‌بندی می‌شوند؛ خوراک کامل خبر در Audit است.",
  };
  const derivativesLayer: CompactDataLayer = {
    layer: "derivatives",
    layerFa: "فیوچرز/اهرم",
    statusFa: derivativesPublicReady ? "قابل نمایش محدود" : futuresCoverage > 0 ? "محدود؛ فقط برای دارایی‌های دارای funding/OI معتبر" : "محدود / فقط Audit",
    coverage: futuresCoverage,
    publicActionFa: derivativesPublicReady ? "در public فقط به‌عنوان شکنندگی/ریسک استفاده می‌شود، نه جهت قیمت." : "محدود / فقط Audit",
  };
  const forecastLayer: CompactDataLayer = {
    layer: "forecast_validation",
    layerFa: "اعتبارسنجی forecast",
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
      statusFa: "در حال جمع‌آوری / فقط Audit",
      coverage: null,
      publicActionFa: "ماتریس کامل در Audit است؛ public فقط محرک‌های قابل اتکا را نشان می‌دهد.",
    },
    forecastLayer,
    {
      layer: "usdt_network_risk",
      layerFa: "ریسک شبکه USDT",
      statusFa: "داده مستقیم ناکافی / فقط Audit",
      coverage: null,
      publicActionFa: "TRON/ERC20 و freeze risk فقط با منبع مستقیم در Audit/USDT نمایش داده می‌شود.",
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
    derivativesPublicReady,
  };
}

export function buildDriverLabel(driverType: "macro" | "stablecoin" | "etf" | "sentiment" | "derivatives", direction: PublicDriver["direction"], strength: "weak" | "moderate" | "strong" = "moderate") {
  const strengthFa = strength === "weak" ? "محدود" : strength === "strong" ? "قوی" : "";
  const suffix = strengthFa ? ` ${strengthFa}` : "";
  const labels = {
    macro: {
      supportive: `کلان: حمایتی${suffix}`,
      pressure: `کلان: فشارزا${suffix}`,
      neutral: "کلان: خنثی / بدون تأیید قوی",
      mixed: "کلان: دوگانه / نیازمند تأیید",
    },
    stablecoin: {
      supportive: `نقدینگی استیبل‌کوین: حمایتی${suffix}`,
      pressure: `نقدینگی استیبل‌کوین: فشارزا${suffix}`,
      neutral: "نقدینگی استیبل‌کوین: خنثی / بدون تأیید قوی",
      mixed: "نقدینگی استیبل‌کوین: دوگانه / نیازمند تأیید",
    },
    etf: {
      supportive: `ETF بیت‌کوین و اتریوم: حمایتی${suffix}`,
      pressure: `ETF بیت‌کوین و اتریوم: فشارزا${suffix}`,
      neutral: "ETF بیت‌کوین و اتریوم: خنثی",
      mixed: "ETF بیت‌کوین و اتریوم: دوگانه / نیازمند تأیید",
    },
    sentiment: {
      supportive: `سنتیمنت: حمایتی${suffix}`,
      pressure: `سنتیمنت: فشارزا${suffix}`,
      neutral: "سنتیمنت: خنثی",
      mixed: "سنتیمنت: دوگانه / نیازمند تأیید",
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

function buildMainDrivers(signals: SignalMap, assets: PublicAssetBrief[], layerState: LayerCoverageState): PublicDriver[] {
  const drivers: PublicDriver[] = [];
  const macroScore = macroPressureScore({
    dxyChangePct: signalValue(signals, "dxy_trend_24h"),
    us10yChange: signalValue(signals, "us10y_trend_24h"),
    nasdaqChangePct: signalValue(signals, "nasdaq_trend_24h"),
    goldChangePct: signalValue(signals, "gold_trend_24h"),
    sentimentRiskHigh: (signalValue(signals, "geopolitical_event_score") ?? 0) > 50,
  });
  const stableScore = stablecoinLiquidityScore({
    totalStablecoin7dPct: signalValue(signals, "stablecoin_market_cap_7d"),
    usdtSupply7dPct: signalValue(signals, "usdt_supply_7d"),
    usdcSupply7dPct: signalValue(signals, "usdc_supply_7d"),
  });
  const btcEtf = signalValue(signals, "btc_etf_flow_7d");
  const ethEtf = signalValue(signals, "eth_etf_flow_7d");
  const sentiment = signalValue(signals, "news_sentiment_macro");
  const derivativesAvailable = layerState.derivativesPublicReady;

  if (macroScore !== null) {
    const direction = macroScore >= 25 ? "supportive" : macroScore <= -25 ? "pressure" : "mixed";
    drivers.push({
      titleFa: buildDriverLabel("macro", direction, strengthFromScore(macroScore)),
      direction,
      directionFa: direction === "supportive" ? "حمایتی" : direction === "pressure" ? "فشارزا" : "دوگانه",
      affectedAssets: ["BTC", "ETH", "SOL", "DXY", "Gold", "US10Y"],
      confidence: Math.round(Math.min(80, Math.abs(macroScore) + 35)),
      explanationFa:
        direction === "pressure"
          ? "ترکیب دلار/بازده اوراق برای دارایی‌های پرریسک فشارساز است."
          : direction === "supportive"
            ? "محرک‌های کلان فشار شدیدی نشان نمی‌دهند و می‌توانند فضای ریسک را آرام‌تر کنند."
            : "محرک‌های کلان هم‌جهت نیستند و برای نتیجه‌گیری قوی نیاز به تأیید بیشتر دارند.",
      invalidationFa: "اگر DXY و US10Y در دو بروزرسانی متوالی خلاف جهت فعلی حرکت کنند، خوانش کلان بازنگری می‌شود.",
    });
  }

  if (stableScore !== null) {
    const direction = stableScore >= 25 ? "supportive" : stableScore <= -25 ? "pressure" : "neutral";
    drivers.push({
      titleFa: buildDriverLabel("stablecoin", direction, strengthFromScore(stableScore)),
      direction,
      directionFa: direction === "supportive" ? "حمایتی" : direction === "pressure" ? "فشارزا" : "خنثی",
      affectedAssets: assets.map((asset) => asset.symbol),
      confidence: Math.round(Math.min(82, Math.abs(stableScore) + 38)),
      explanationFa:
        direction === "supportive"
          ? "روند استیبل‌کوین‌ها نشانه بهبود نقدینگی نقدی را تقویت می‌کند."
          : direction === "pressure"
            ? "روند استیبل‌کوین‌ها ضعف نقدینگی نقدی را تقویت می‌کند."
            : "روند استیبل‌کوین‌ها هنوز تأیید قوی برای ورود یا خروج نقدینگی نشان نمی‌دهد.",
      invalidationFa: "اگر تغییر ۷ روزه stablecoin market cap و USDT supply خلاف جهت فعلی شود، این محرک تضعیف می‌شود.",
    });
  }

  if (btcEtf !== null || ethEtf !== null) {
    const net = (btcEtf ?? 0) + (ethEtf ?? 0);
    const direction = net > 0 ? "supportive" : net < 0 ? "pressure" : "neutral";
    drivers.push({
      titleFa: buildDriverLabel("etf", direction, "moderate"),
      direction,
      directionFa: direction === "supportive" ? "حمایتی" : direction === "pressure" ? "فشارزا" : "خنثی",
      affectedAssets: ["BTC", "ETH"],
      confidence: 62,
      explanationFa:
        direction === "pressure"
          ? "جریان خالص ETF برای BTC/ETH فشارزا خوانده می‌شود؛ جدول صادرکننده در Audit باقی می‌ماند."
          : direction === "supportive"
            ? "جریان خالص ETF برای BTC/ETH نقش حمایتی دارد؛ جدول صادرکننده در Audit باقی می‌ماند."
            : "جریان ETF برای BTC/ETH فعلاً جهت قوی ندارد؛ جدول صادرکننده در Audit باقی می‌ماند.",
      invalidationFa: "اگر جریان خالص ۷ روزه ETF خلاف جهت فعلی شود، اثر این محرک تغییر می‌کند.",
    });
  }

  if (sentiment !== null && Math.abs(sentiment) >= 20) {
    drivers.push({
      titleFa: buildDriverLabel("sentiment", sentiment > 0 ? "supportive" : "pressure", strengthFromScore(sentiment)),
      direction: sentiment > 0 ? "supportive" : "pressure",
      directionFa: sentiment > 0 ? "حمایتی" : "فشارزا",
      affectedAssets: ["BTC", "ETH", "SOL", "USDT"],
      confidence: Math.round(Math.min(78, Math.abs(sentiment) + 35)),
      explanationFa: "فقط خبرهای با relevance کافی وارد جمع‌بندی عمومی می‌شوند؛ خوراک کامل خبر در Audit است.",
      invalidationFa: "اگر خبرهای تازه‌تر و مستقل جهت مخالف را تأیید کنند، وزن سنتیمنت کاهش می‌یابد.",
    });
  }

  if (derivativesAvailable) {
    drivers.push({
      titleFa: buildDriverLabel("derivatives", "pressure", "weak"),
      direction: "pressure",
      directionFa: "ریسک شکنندگی",
      affectedAssets: ["BTC", "ETH", "SOL"],
      confidence: 55,
      explanationFa: "funding/open interest فقط وقتی داده واقعی عمومی موجود باشد نمایش داده می‌شود و سیگنال خرید/فروش نیست.",
      invalidationFa: "اگر funding و open interest بدون فشار قیمت تخلیه شوند، ریسک اهرمی کاهش می‌یابد.",
    });
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

function freshnessCoverageFrom(freshness: Record<string, unknown>) {
  const state = String(freshness.overallFreshnessState ?? "");
  if (state === "fresh") return 92;
  if (state === "recent") return 78;
  if (state === "delayed") return 58;
  if (state === "stale") return 35;
  return 45;
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

export async function buildPublicMarketBrief(): Promise<PublicMarketBrief> {
  const snapshot = getDashboardSignalSnapshot();
  const signals = snapshot.byKey as SignalMap;
  const marketData = await fetchPublicCoinGeckoMarketData();
  const reliability = asRecord(getDashboardReliabilityReport());
  const freshness = asRecord(getDashboardFreshnessReport());
  const regime = asRecord(getDashboardMarketRegime());
  const liquidity = asRecord(getDashboardLiquidityReport());
  const risk = asRecord(getDashboardRiskReport());
  const assetBuilds = TARGET_ASSETS.map((asset) => buildAssetBrief(asset, signals, marketData[asset.symbol]));
  const assets = assetBuilds.map((asset) => asset.brief);
  const averageCoverage = Math.round(assets.reduce((sum, asset) => sum + asset.dataCoverage, 0) / Math.max(1, assets.length));
  const averageConfidence = Math.round(assets.reduce((sum, asset) => sum + asset.confidence, 0) / Math.max(1, assets.length));
  const sourceHealthCoverage = sourceHealthCoverageFrom(reliability);
  const freshnessCoverage = freshnessCoverageFrom(freshness);
  const liquidityScore = numberFrom(liquidity.liquidityHealthScore) ?? numberFrom(liquidity.score) ?? numberFrom(liquidity.cryptoLiquidityProxyScore);
  const riskScore = numberFrom(risk.riskScore) ?? numberFrom(risk.score);
  const macroScore = macroPressureScore({
    dxyChangePct: signalValue(signals, "dxy_trend_24h"),
    us10yChange: signalValue(signals, "us10y_trend_24h"),
    nasdaqChangePct: signalValue(signals, "nasdaq_trend_24h"),
    goldChangePct: signalValue(signals, "gold_trend_24h"),
  });
  const forecast = forecastBadge();
  const layerState = buildCompactDataConfidence(signals, assetBuilds, forecast);
  const drivers = buildMainDrivers(signals, assets, layerState);
  const signalAlignment = signalAlignmentFrom(assets, drivers);
  const assetsWithCoverageBelow50 = assets.filter((asset) => asset.dataCoverage < 50).length;
  const priceDataMissingForAnyTargetAsset = assetBuilds.some((asset) => !asset.priceDataAvailable);
  const criticalMissingPenalty =
    (layerState.stablecoinDataMissing ? 10 : 0) +
    (priceDataMissingForAnyTargetAsset ? 8 : 0) +
    (layerState.macroCoverage < 50 ? 6 : 0) +
    (sourceHealthCoverage < 50 ? 6 : 0);
  const globalCoverage = Math.round(
    clamp(
      0.4 * averageCoverage + 0.25 * layerState.coreLayerCoverage + 0.2 * sourceHealthCoverage + 0.15 * freshnessCoverage,
      0,
      100,
    ),
  );
  let globalConfidence = Math.round(
    clamp(
      0.35 * averageConfidence + 0.25 * globalCoverage + 0.2 * signalAlignment + 0.2 * sourceHealthCoverage - criticalMissingPenalty,
      0,
      100,
    ),
  );
  if (assetsWithCoverageBelow50 >= 4) globalConfidence = Math.min(globalConfidence, 58);
  if (forecast.conclusiveCount < 100) globalConfidence = Math.min(globalConfidence, 65);
  if (!layerState.derivativesPublicReady) globalConfidence = Math.min(globalConfidence, 62);
  if (priceDataMissingForAnyTargetAsset) globalConfidence = Math.min(globalConfidence, 60);
  if (layerState.stablecoinDataMissing) globalConfidence = Math.min(globalConfidence, 55);
  globalConfidence = capPublicConfidence({
    confidence: globalConfidence,
    coverage: globalCoverage,
    freshness: freshnessCoverage,
    assetCoverageBelowHalf: globalCoverage < 50,
  });
  const mode = dataModeFrom(freshness, globalCoverage);

  return {
    generatedAt: new Date().toISOString(),
    dataMode: mode,
    dataModeFa: dataModeFa(mode),
    updateFrequencyLabel: "بروزرسانی عمومی هر ۳۰ دقیقه؛ داده‌های کلان و ETF ممکن است با تأخیر باشند.",
    globalConfidence,
    globalCoverage,
    targetUniverseLabelFa: TARGET_ASSET_UNIVERSE_LABEL_FA,
    marketVerdict: {
      regime: String(regime.regime ?? regime.currentRegime ?? "limited"),
      regimeFa: String(regime.regimeFa ?? regime.labelFa ?? (globalConfidence < 40 ? "سناریوی قطعی مجاز نیست" : "رژیم بازار با داده محدود")),
      liquidityState: String(liquidity.state ?? liquidity.classification ?? "limited"),
      liquidityStateFa:
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
                  : "گسترش نقدینگی",
      riskLevel: String(risk.level ?? "limited"),
      riskLevelFa:
        riskScore === null
          ? "ریسک نامطمئن"
          : riskScore >= 80
            ? "ریسک بحرانی"
            : riskScore >= 65
              ? "ریسک بالا"
              : riskScore >= 45
                ? "ریسک افزایشی"
                : riskScore >= 25
                  ? "ریسک متوسط"
                  : "ریسک پایین",
      macroPressure: macroScore === null ? "limited" : macroScore < -20 ? "pressure" : macroScore > 20 ? "supportive" : "mixed",
      macroPressureFa: macroScore === null ? "داده کلان محدود" : macroScore < -20 ? "فشار کلان" : macroScore > 20 ? "حمایت کلان نسبی" : "کلان دوگانه",
      summaryFa:
        globalConfidence < 40
          ? "پوشش و اطمینان برای سناریوی قطعی کافی نیست؛ گزارش فقط وضعیت داده و محرک‌های قابل پایش را نشان می‌دهد."
          : "بازار در وضعیت سناریویی خوانده می‌شود؛ محرک‌های کلان، نقدینگی استیبل‌کوین، ETF و خبرهای پرارتباط باید همزمان پایش شوند.",
      invalidationFa: "اگر دو محرک اصلی در دو بروزرسانی متوالی خلاف جهت فعلی حرکت کنند، سناریوی بازار باید بازنگری شود.",
    },
    assets,
    mainDrivers: drivers.slice(0, 5),
    invalidation: {
      conditionsFa: [
        "اگر DXY و US10Y در دو بروزرسانی متوالی آرام شوند، فشار کلان کاهش می‌یابد.",
        "اگر ارزش بازار استیبل‌کوین‌ها و جریان ETF همزمان بهبود یابد، خوانش نقدینگی بهتر می‌شود.",
        "اگر funding/open interest بدون افت قیمت تخلیه شود، ریسک اهرمی کاهش می‌یابد.",
      ],
      watchNextFa: ["DXY و US10Y", "ETF Flow بیت‌کوین و اتریوم", "تغییر ۷ روزه stablecoin market cap و USDT supply"],
    },
    compactDataConfidence: layerState.layers,
    forecastBadge: forecast,
    disclaimerFa: "این گزارش سیگنال خرید یا فروش نیست. خروجی C.M.I.P فقط برای تحلیل رژیم بازار، ریسک، نقدینگی و سناریوهای محتمل استفاده می‌شود.",
  };
}
