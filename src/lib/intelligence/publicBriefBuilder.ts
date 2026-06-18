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
import { capPublicConfidence, clamp } from "@/lib/intelligence/moduleGating";
import {
  getDashboardAlerts,
  getDashboardForecastValidationCenter,
  getDashboardFreshnessReport,
  getDashboardLatestNormalizedEvents,
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

const liveQualities = new Set(["live", "partial_live", "delayed", "proxy"]);

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function numberFrom(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
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

function freshnessLabel(signal?: NormalizedSignal) {
  if (!signal || signal.value === null || signal.quality === "unavailable") return "داده مستقیم در دسترس نیست";
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

function factor(key: string, score: number | null, weight: number, labelFa: string): PublicFactorScore {
  return { key, score, weight, labelFa, available: score !== null };
}

function factorsFor(asset: AssetRegistryItem, signals: SignalMap): PublicFactorScore[] {
  const symbol = asset.symbol;
  const lower = symbol.toLowerCase();
  const priceSignal = signals[`${lower}_trend_24h`];
  const priceScore = priceMomentumScore({
    change24hPct: signalValue(signals, `${lower}_trend_24h`),
    change7dPct: signalValue(signals, `${lower}_trend_7d`),
    change30dPct: signalValue(signals, `${lower}_trend_30d`),
  });
  const marketCap = signalValue(signals, `${lower}_market_cap`);
  const volumeScore = volumeLiquidityScore({
    volume24h: signalValue(signals, `spot_volume_${lower}_24h`) ?? signalValue(signals, `${lower}_volume_24h`),
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
    asset.allowDerivativesIfAvailable && (signalAvailable(signals, `funding_${lower}`) || signalAvailable(signals, `open_interest_${lower}_24h`))
      ? -Math.min(35, Math.abs(signalValue(signals, `funding_${lower}`) ?? 0) * 10_000 + Math.max(0, signalValue(signals, `open_interest_${lower}_24h`) ?? 0) * 0.5)
      : null;

  if (symbol === "USDT") {
    return [
      factor("peg_stability", signalAvailable(signals, "usdt_peg_deviation") ? -Math.abs(signalValue(signals, "usdt_peg_deviation") ?? 0) * 100 : null, 0.2, "ثبات قیمت تتر"),
      factor("usdt_supply_trend", stablecoinScore, 0.45, "روند عرضه و ارزش بازار استیبل‌کوین‌ها"),
      factor("regulatory_sanction_news", sentimentScore === null ? null : clamp(sentimentScore, -100, 100), 0.2, "خبرهای مقرراتی/تحریمی"),
      factor("data_coverage", priceSignal ? null : 10, 0.15, "کیفیت داده"),
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

function assetConfidence(asset: AssetRegistryItem, signals: SignalMap, coverage: number) {
  const lower = asset.symbol.toLowerCase();
  const hasPrice = !asset.allowPriceBias || signalAvailable(signals, `${lower}_trend_24h`);
  const stablecoinMissing = !signalAvailable(signals, "stablecoin_market_cap_7d") && !signalAvailable(signals, "usdt_supply_7d");
  const freshness = Math.round(
    clamp(
      [
        prefixedSignal(signals, asset.symbol, "trend_24h"),
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

function buildAssetBrief(asset: AssetRegistryItem, signals: SignalMap): PublicAssetBrief {
  const factors = factorsFor(asset, signals);
  const weighted = weightedImpactScore(factors);
  const confidence = assetConfidence(asset, signals, weighted.coverage);
  const biasFa = classifyAssetBias(asset, weighted.impactScore, confidence, weighted.coverage);
  const availableDrivers = factors
    .filter((factorItem) => factorItem.available)
    .sort((a, b) => Math.abs(b.score ?? 0) * b.weight - Math.abs(a.score ?? 0) * a.weight)
    .slice(0, 4)
    .map((factorItem) => `${factorItem.labelFa}: ${factorItem.score !== null && factorItem.score >= 0 ? "حمایتی" : "فشار"}`);
  const hiddenFactors = factors.filter((factorItem) => !factorItem.available).map((factorItem) => factorItem.labelFa);
  const priceSignal = prefixedSignal(signals, asset.symbol, "trend_24h");
  const statusFa = asset.symbol === "USDT" ? "پایش ثبات/ریسک" : weighted.coverage < 50 ? "داده محدود" : biasFa;

  return {
    symbol: asset.symbol,
    name: asset.name,
    persianName: asset.persianName,
    statusFa,
    biasFa,
    impactScore: weighted.impactScore,
    confidence,
    dataCoverage: weighted.coverage,
    coverageLabelFa: coverageLabelFa(weighted.coverage),
    mainDriverFa: availableDrivers[0] ?? "داده مستقیم کافی برای محرک غالب وجود ندارد",
    driversFa: asset.symbol === "USDT"
      ? [
          "تتر به‌عنوان ابزار نقدینگی و پایداری سنجیده می‌شود، نه دارایی جهت‌دار.",
          ...availableDrivers.slice(0, 3),
        ]
      : availableDrivers.length
        ? availableDrivers
        : ["پایش فقط؛ داده قیمت/حجم مستقیم برای نتیجه‌گیری عمومی کافی نیست."],
    invalidationFa:
      confidence < 45
        ? "اگر داده قیمت، نقدینگی و خبرهای مرتبط در دو بروزرسانی بعدی کامل‌تر نشود، نتیجه‌گیری جهت‌دار مجاز نیست."
        : "اگر محرک اصلی در دو بروزرسانی متوالی خلاف جهت فعلی حرکت کند، سناریو باید بازنگری شود.",
    freshnessLabelFa: freshnessLabel(priceSignal),
    hiddenFactors,
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

function buildCompactDataConfidence(signals: SignalMap, forecastConclusive: number): CompactDataLayer[] {
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

  return [
    layer("price_momentum", "قیمت/مومنتوم", ["btc_trend_24h", "eth_trend_24h", "sol_trend_24h"], "در جدول و کارت دارایی‌ها استفاده می‌شود."),
    layer("macro", "کلان", ["dxy_trend_24h", "us10y_trend_24h", "nasdaq_trend_24h", "gold_trend_24h"], "با برچسب تأخیر/بروز شده در سناریو استفاده می‌شود."),
    layer("stablecoin", "استیبل‌کوین", ["stablecoin_market_cap_7d", "usdt_supply_7d", "usdc_supply_7d"], "اگر ناقص باشد اطمینان نقدینگی محدود می‌شود."),
    layer("etf", "ETF", ["btc_etf_flow_7d", "eth_etf_flow_7d"], "فقط برای BTC و ETH؛ جدول صادرکننده در Audit است."),
    layer("sentiment", "سنتیمنت", ["news_sentiment_macro"], "فقط خبرهای پرارتباط در جمع‌بندی اثر می‌گذارند."),
    layer("derivatives", "فیوچرز/اهرم", ["funding_btc", "funding_eth", "funding_sol", "open_interest_btc_24h"], "در صورت نبود funding/OI از public پنهان می‌شود."),
    {
      layer: "correlation",
      layerFa: "همبستگی",
      statusFa: "فقط در صورت نمونه کافی",
      coverage: null,
      publicActionFa: "ماتریس کامل در Audit است؛ public فقط محرک‌های قابل اتکا را نشان می‌دهد.",
    },
    {
      layer: "forecast_validation",
      layerFa: "اعتبارسنجی forecast",
      statusFa: forecastConclusive >= 100 ? "قابل نمایش فشرده" : "در حال جمع‌آوری",
      coverage: forecastConclusive >= 100 ? 100 : null,
      publicActionFa: "پنل کامل اعتبارسنجی در public نمایش داده نمی‌شود.",
    },
    {
      layer: "usdt_network_risk",
      layerFa: "ریسک شبکه USDT",
      statusFa: "داده مستقیم ناکافی",
      coverage: null,
      publicActionFa: "TRON/ERC20 و freeze risk فقط با منبع مستقیم در Audit/USDT نمایش داده می‌شود.",
    },
  ];
}

function buildMainDrivers(signals: SignalMap, assets: PublicAssetBrief[]): PublicDriver[] {
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
  const derivativesAvailable = signalAvailable(signals, "funding_btc") || signalAvailable(signals, "open_interest_btc_24h");

  if (macroScore !== null) {
    drivers.push({
      titleFa: "فشار کلان: DXY / US10Y / Nasdaq / Gold",
      direction: macroScore >= 18 ? "supportive" : macroScore <= -18 ? "pressure" : "mixed",
      directionFa: macroScore >= 18 ? "حمایتی" : macroScore <= -18 ? "فشار" : "دوگانه",
      affectedAssets: ["BTC", "ETH", "SOL", "DXY", "Gold", "US10Y"],
      confidence: Math.round(Math.min(80, Math.abs(macroScore) + 35)),
      explanationFa: macroScore < 0 ? "ترکیب دلار/بازده اوراق هنوز برای دارایی‌های پرریسک فشارساز است." : "محرک‌های کلان فشار شدیدی نشان نمی‌دهند و می‌توانند فضای ریسک را آرام‌تر کنند.",
      invalidationFa: "اگر DXY و US10Y در دو بروزرسانی متوالی خلاف جهت فعلی حرکت کنند، خوانش کلان بازنگری می‌شود.",
    });
  }

  if (stableScore !== null) {
    drivers.push({
      titleFa: "نقدینگی استیبل‌کوین",
      direction: stableScore >= 20 ? "supportive" : stableScore <= -20 ? "pressure" : "neutral",
      directionFa: stableScore >= 20 ? "حمایتی" : stableScore <= -20 ? "فشار" : "خنثی",
      affectedAssets: assets.map((asset) => asset.symbol),
      confidence: Math.round(Math.min(82, Math.abs(stableScore) + 38)),
      explanationFa: stableScore >= 0 ? "روند استیبل‌کوین‌ها نقش حمایتی/خنثی در نقدینگی بازار دارد." : "روند استیبل‌کوین‌ها نشانه فشار یا ضعف نقدینگی را تقویت می‌کند.",
      invalidationFa: "اگر تغییر ۷ روزه stablecoin market cap و USDT supply خلاف جهت فعلی شود، این محرک تضعیف می‌شود.",
    });
  }

  if (btcEtf !== null || ethEtf !== null) {
    const net = (btcEtf ?? 0) + (ethEtf ?? 0);
    drivers.push({
      titleFa: "جریان ETF بیت‌کوین و اتریوم",
      direction: net > 0 ? "supportive" : net < 0 ? "pressure" : "neutral",
      directionFa: net > 0 ? "حمایتی" : net < 0 ? "فشار" : "خنثی",
      affectedAssets: ["BTC", "ETH"],
      confidence: 62,
      explanationFa: "ETF فقط برای BTC و ETH به‌صورت aggregate وارد گزارش عمومی می‌شود؛ جدول صادرکننده در Audit باقی می‌ماند.",
      invalidationFa: "اگر جریان خالص ۷ روزه ETF خلاف جهت فعلی شود، اثر این محرک تغییر می‌کند.",
    });
  }

  if (sentiment !== null && Math.abs(sentiment) >= 20) {
    drivers.push({
      titleFa: "سنتیمنت و ریسک خبری",
      direction: sentiment > 0 ? "supportive" : "pressure",
      directionFa: sentiment > 0 ? "حمایتی" : "فشار",
      affectedAssets: ["BTC", "ETH", "SOL", "USDT"],
      confidence: Math.round(Math.min(78, Math.abs(sentiment) + 35)),
      explanationFa: "فقط خبرهای با relevance کافی وارد جمع‌بندی عمومی می‌شوند؛ خوراک کامل خبر در Audit است.",
      invalidationFa: "اگر خبرهای تازه‌تر و مستقل جهت مخالف را تأیید کنند، وزن سنتیمنت کاهش می‌یابد.",
    });
  }

  if (derivativesAvailable) {
    drivers.push({
      titleFa: "فشار فیوچرز/اهرم عمومی",
      direction: "mixed",
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
  const scored = numberFrom(center.scoredForecasts) ?? 0;
  const accuracy = numberFrom(center.overallAccuracy24h);
  return {
    statusFa: scored >= 100 && accuracy !== null ? `اعتبارسنجی فشرده: دقت ۲۴ساعته ${accuracy}٪` : `اعتبارسنجی forecast هنوز در حال جمع‌آوری شواهد است. نمونه قابل قضاوت: ${scored}`,
    conclusiveCount: scored,
    publicAccuracy: scored >= 100 ? accuracy : null,
  };
}

export function buildPublicMarketBrief(): PublicMarketBrief {
  const snapshot = getDashboardSignalSnapshot();
  const signals = snapshot.byKey as SignalMap;
  const reliability = asRecord(getDashboardReliabilityReport());
  const freshness = asRecord(getDashboardFreshnessReport());
  const regime = asRecord(getDashboardMarketRegime());
  const liquidity = asRecord(getDashboardLiquidityReport());
  const risk = asRecord(getDashboardRiskReport());
  const alerts = getDashboardAlerts();
  const assets = TARGET_ASSETS.map((asset) => buildAssetBrief(asset, signals));
  const averageCoverage = Math.round(assets.reduce((sum, asset) => sum + asset.dataCoverage, 0) / Math.max(1, assets.length));
  const reliabilityCoverage = Math.round((numberFrom(reliability.coreReliability) ?? numberFrom(reliability.marketReliability) ?? averageCoverage / 100) * 100);
  const globalCoverage = Math.round(clamp(Math.max(averageCoverage, Math.min(95, reliabilityCoverage)), 0, 100));
  const globalConfidence = capPublicConfidence({
    confidence: Math.round((numberFrom(reliability.coreReliability) ?? 0.48) * 100),
    coverage: globalCoverage,
    freshness: freshness.overallFreshnessState === "fresh" ? 90 : freshness.overallFreshnessState === "recent" ? 75 : 55,
    assetCoverageBelowHalf: globalCoverage < 50,
  });
  const mode = dataModeFrom(freshness, globalCoverage);
  const liquidityScore = numberFrom(liquidity.liquidityHealthScore) ?? numberFrom(liquidity.score) ?? numberFrom(liquidity.cryptoLiquidityProxyScore);
  const riskScore = numberFrom(risk.riskScore) ?? numberFrom(risk.score);
  const macroScore = macroPressureScore({
    dxyChangePct: signalValue(signals, "dxy_trend_24h"),
    us10yChange: signalValue(signals, "us10y_trend_24h"),
    nasdaqChangePct: signalValue(signals, "nasdaq_trend_24h"),
    goldChangePct: signalValue(signals, "gold_trend_24h"),
  });
  const drivers = buildMainDrivers(signals, assets);
  const forecast = forecastBadge();

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
    compactDataConfidence: buildCompactDataConfidence(signals, forecast.conclusiveCount),
    forecastBadge: forecast,
    disclaimerFa: "این گزارش سیگنال خرید یا فروش نیست. خروجی C.M.I.P فقط برای تحلیل رژیم بازار، ریسک، نقدینگی و سناریوهای محتمل استفاده می‌شود.",
  };
}
