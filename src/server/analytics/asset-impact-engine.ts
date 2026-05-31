import type { DirectionalBias, DirectionalImpactProfile, IntelligenceAssetSymbol, TransmissionChannel } from "@/lib/types";
import { getDynamicCorrelationReport } from "@/server/analytics/correlation-engine";
import { getLiquidityReport } from "@/server/analytics/liquidity-engine";
import { biasForRegimeAsset, getMarketRegimeReport } from "@/server/analytics/market-regime-engine";
import { getSentimentReport } from "@/server/analytics/sentiment-engine";
import { generateAssetScenarios } from "@/server/analytics/scenario-engine";
import { getEngineLastUpdatedAt, getSignalSnapshot } from "@/server/analytics/market-signals";
import { calculateAdaptiveModuleConfidence } from "@/server/analytics/adaptive-confidence-engine";
import { calculateImpactScore, clampSigned, signalAgreementScore } from "@/server/analytics/scoring-engine";
import type { NormalizedSignal, SignalGroup } from "@/lib/types";

const assets: IntelligenceAssetSymbol[] = ["BTC", "ETH", "SOL", "USDT", "DXY", "Gold", "Nasdaq", "US10Y"];

const assetLabels: Record<IntelligenceAssetSymbol, string> = {
  BTC: "بیت‌کوین",
  ETH: "اتریوم",
  SOL: "سولانا",
  USDT: "ریسک تتر",
  DXY: "شاخص دلار",
  Gold: "طلا",
  Nasdaq: "نزدک",
  US10Y: "بازده اوراق ۱۰ ساله آمریکا",
};

const biasLabels: Record<DirectionalBias, string> = {
  bullish: "مثبت",
  bearish: "منفی",
  neutral: "خنثی",
  mixed: "دوگانه",
};

const channelLabels: Record<TransmissionChannel, string> = {
  liquidity: "نقدینگی",
  rates: "نرخ بهره",
  dollar: "شاخص دلار",
  risk_on_risk_off: "ریسک‌پذیری / ریسک‌گریزی",
  etf_flows: "جریان ETF",
  stablecoin_flows: "جریان استیبل‌کوین",
  onchain_activity: "داده آن‌چین",
  geopolitical_risk: "ریسک ژئوپلیتیک",
  regulatory_risk: "ریسک رگولاتوری",
  sentiment_news_shock: "شوک خبری و سنتیمنت بازار",
  correlation_breakdown: "شکست همبستگی",
  leverage: "اهرم معاملاتی",
};

const regimeLabelsFa: Record<string, string> = {
  "Risk-On Expansion": "گسترش ریسک‌پذیری",
  "Weak Risk-On": "ریسک‌پذیری ضعیف",
  "Fragile Risk-On": "ریسک‌پذیری شکننده",
  "Liquidity-Constrained Risk-On": "ریسک‌پذیری محدودشده با نقدینگی",
  "Risk-Off Defensive": "دفاعی / ریسک‌گریز",
  "Liquidity Squeeze": "فشار نقدینگی",
  "Dollar Strength Pressure": "فشار ناشی از تقویت دلار",
  "Rates Shock": "شوک نرخ بهره",
  "Crypto-Specific Bullish": "حمایت اختصاصی کریپتو",
  "Crypto-Specific Stress": "تنش اختصاصی کریپتو",
  "Geopolitical Shock": "شوک ژئوپلیتیک",
  "Neutral / Transition": "خنثی / در حال گذار",
  "High Volatility Unclear Regime": "نوسان بالا با رژیم نامشخص",
};

function biasFromImpact(score: number): DirectionalBias {
  if (score >= 18) return "bullish";
  if (score <= -18) return "bearish";
  if (Math.abs(score) <= 7) return "neutral";
  return "mixed";
}

function usableSignalValue(snapshot: ReturnType<typeof getSignalSnapshot>, key: string) {
  const signal = snapshot.byKey[key];
  if (!signal || signal.value === null || signal.quality === "unavailable" || signal.quality === "estimated") return null;
  return signal.value;
}

function scoreValue(value: number | null) {
  return value ?? 0;
}

const assetConfidenceSignalKeys: Record<IntelligenceAssetSymbol, string[]> = {
  BTC: [
    "btc_trend_24h",
    "nasdaq_trend_24h",
    "dxy_trend_24h",
    "us10y_trend_24h",
    "gold_trend_24h",
    "vix_trend_24h",
    "stablecoin_market_cap_7d",
    "usdt_supply_7d",
    "btc_etf_flow_24h",
    "funding_btc",
    "open_interest_btc_24h",
    "spot_volume_btc_24h",
    "futures_volume_btc_24h",
    "exchange_reserves_btc_7d",
    "news_sentiment_macro",
    "geopolitical_event_score",
  ],
  ETH: [
    "eth_trend_24h",
    "btc_trend_24h",
    "nasdaq_trend_24h",
    "dxy_trend_24h",
    "us10y_trend_24h",
    "vix_trend_24h",
    "stablecoin_market_cap_7d",
    "usdt_supply_7d",
    "eth_etf_flow_24h",
    "funding_btc",
    "open_interest_btc_24h",
    "spot_volume_btc_24h",
    "news_sentiment_macro",
  ],
  SOL: [
    "sol_trend_24h",
    "btc_trend_24h",
    "nasdaq_trend_24h",
    "dxy_trend_24h",
    "vix_trend_24h",
    "stablecoin_market_cap_7d",
    "usdt_supply_7d",
    "funding_btc",
    "open_interest_btc_24h",
    "spot_volume_btc_24h",
    "futures_volume_btc_24h",
    "news_sentiment_macro",
    "geopolitical_event_score",
  ],
  USDT: [
    "usdt_supply_7d",
    "usdc_supply_7d",
    "stablecoin_market_cap_7d",
    "dxy_trend_24h",
    "spot_volume_btc_24h",
    "news_sentiment_macro",
    "geopolitical_event_score",
  ],
  DXY: ["dxy_trend_24h", "us10y_trend_24h", "nasdaq_trend_24h", "gold_trend_24h", "vix_trend_24h", "btc_trend_24h", "news_sentiment_macro", "geopolitical_event_score"],
  Gold: ["gold_trend_24h", "dxy_trend_24h", "us10y_trend_24h", "vix_trend_24h", "btc_trend_24h", "news_sentiment_macro", "geopolitical_event_score"],
  Nasdaq: ["nasdaq_trend_24h", "btc_trend_24h", "eth_trend_24h", "sol_trend_24h", "dxy_trend_24h", "us10y_trend_24h", "vix_trend_24h", "news_sentiment_macro"],
  US10Y: ["us10y_trend_24h", "dxy_trend_24h", "nasdaq_trend_24h", "gold_trend_24h", "vix_trend_24h", "btc_trend_24h", "news_sentiment_macro", "geopolitical_event_score"],
};

const assetRequiredSignalGroups: Record<IntelligenceAssetSymbol, SignalGroup[]> = {
  BTC: ["price", "macro", "liquidity", "stablecoins", "leverage", "sentiment", "volatility"],
  ETH: ["price", "macro", "liquidity", "stablecoins", "leverage", "sentiment", "volatility"],
  SOL: ["price", "macro", "liquidity", "stablecoins", "leverage", "sentiment", "volatility"],
  USDT: ["stablecoins", "liquidity", "macro", "sentiment", "geopolitical"],
  DXY: ["macro", "price", "volatility", "sentiment", "geopolitical"],
  Gold: ["macro", "price", "volatility", "sentiment", "geopolitical"],
  Nasdaq: ["macro", "price", "volatility", "sentiment"],
  US10Y: ["macro", "price", "volatility", "sentiment", "geopolitical"],
};

function confidenceSignalsForAsset(asset: IntelligenceAssetSymbol, snapshot: ReturnType<typeof getSignalSnapshot>): NormalizedSignal[] {
  return assetConfidenceSignalKeys[asset]
    .map((key) => snapshot.byKey[key])
    .filter((signal): signal is NormalizedSignal => Boolean(signal));
}

function sampleQualityForAsset(signals: NormalizedSignal[]) {
  const usable = signals.filter((signal) => signal.value !== null && signal.quality !== "unavailable" && signal.quality !== "estimated");
  if (!usable.length) return 0;
  const raw = usable.reduce((sum, signal) => {
    const size = signal.sampleSize ?? 0;
    if (size >= 90) return sum + 100;
    if (size >= 30) return sum + 80;
    if (size >= 10) return sum + 55;
    if (size > 0) return sum + 32;
    return sum + 18;
  }, 0);
  return Math.round(raw / usable.length);
}

function marketConfirmationForAsset(asset: IntelligenceAssetSymbol, assetTrend: number | null, impactScore: number, components: ReturnType<typeof assetSpecificInputs>["components"]) {
  if (assetTrend === null) {
    return asset === "USDT" ? 45 : 38;
  }

  if (asset === "DXY" || asset === "US10Y") {
    return Math.max(35, 100 - Math.min(70, Math.abs(impactScore / 2 + assetTrend * 12)));
  }

  if (asset === "Gold") {
    const defensiveConfirmation = components.newsSeverityScore >= 0 || components.volatilityScore <= 0 ? 62 : 48;
    return Math.max(35, Math.min(88, defensiveConfirmation + Math.abs(assetTrend) * 2));
  }

  return Math.max(35, 100 - Math.min(70, Math.abs(impactScore / 2 - assetTrend * 12)));
}

function assetTrendKey(asset: IntelligenceAssetSymbol) {
  if (asset === "BTC") return "btc_trend_24h";
  if (asset === "ETH") return "eth_trend_24h";
  if (asset === "SOL") return "sol_trend_24h";
  if (asset === "DXY") return "dxy_trend_24h";
  if (asset === "Gold") return "gold_trend_24h";
  if (asset === "Nasdaq") return "nasdaq_trend_24h";
  if (asset === "US10Y") return "us10y_trend_24h";
  return "usdt_supply_7d";
}

function assetSpecificInputs(asset: IntelligenceAssetSymbol) {
  const snapshot = getSignalSnapshot();
  const liquidity = getLiquidityReport();
  const regime = getMarketRegimeReport().engine;
  const sentiment = getSentimentReport();
  const correlation = getDynamicCorrelationReport();
  const assetSentiment = sentiment.confidence.available ? sentiment.byAsset.find((entry) => entry.asset === asset)?.score ?? 0 : 0;
  const btcNasdaq = correlation.signals.find((signal) => signal.assetPair === "BTC ↔ Nasdaq");
  const btcDxy = correlation.signals.find((signal) => signal.assetPair === "BTC ↔ DXY");
  const btcGold = correlation.signals.find((signal) => signal.assetPair === "BTC ↔ Gold");
  const assetTrend = usableSignalValue(snapshot, assetTrendKey(asset));
  const nasdaqTrend = usableSignalValue(snapshot, "nasdaq_trend_24h");
  const dxyTrend = usableSignalValue(snapshot, "dxy_trend_24h");
  const goldTrend = usableSignalValue(snapshot, "gold_trend_24h");
  const us10yTrend = usableSignalValue(snapshot, "us10y_trend_24h");
  const geopoliticalScore = usableSignalValue(snapshot, "geopolitical_event_score");
  const btcEtfFlow = usableSignalValue(snapshot, "btc_etf_flow_24h");
  const ethEtfFlow = usableSignalValue(snapshot, "eth_etf_flow_24h");
  const exchangeReserves = usableSignalValue(snapshot, "exchange_reserves_btc_7d");
  const usdtSupply = usableSignalValue(snapshot, "usdt_supply_7d");
  const solTrend = usableSignalValue(snapshot, "sol_trend_24h");
  const ethTrend = usableSignalValue(snapshot, "eth_trend_24h");
  const vixTrend = usableSignalValue(snapshot, "vix_trend_24h");
  const missingInputs = [
    assetTrend === null ? `${asset} trend` : "",
    nasdaqTrend === null && (asset === "BTC" || asset === "ETH" || asset === "SOL" || asset === "Nasdaq") ? "Nasdaq" : "",
    dxyTrend === null && (asset === "BTC" || asset === "DXY") ? "DXY" : "",
    us10yTrend === null && (asset === "Gold" || asset === "US10Y") ? "US10Y" : "",
    btcEtfFlow === null && asset === "BTC" ? "BTC ETF flow" : "",
    ethEtfFlow === null && asset === "ETH" ? "ETH ETF flow" : "",
  ].filter(Boolean);
  const regimeBias = biasForRegimeAsset(regime.regimeLabel, asset);
  const regimeScore = regimeBias === "bullish" ? 55 : regimeBias === "bearish" ? -55 : regimeBias === "neutral" ? 0 : -12;
  const liquidityScore =
    asset === "DXY" || asset === "US10Y"
      ? liquidity.dataQuality === "unavailable" ? 0 : -liquidity.liquidityScoreSigned
      : asset === "Gold"
        ? regime.regimeLabel === "Geopolitical Shock"
          ? 34
          : liquidity.dataQuality === "unavailable" ? 0 : liquidity.liquidityScoreSigned * 0.2
        : asset === "USDT"
          ? liquidity.stablecoinExpansion ? liquidity.stablecoinExpansion - 50 : 0
          : liquidity.dataQuality === "unavailable" ? 0 : liquidity.liquidityScoreSigned * (asset === "SOL" ? 1.25 : asset === "ETH" ? 1.05 : 1);
  const correlationScore =
    asset === "BTC"
      ? clampSigned(scoreValue(btcNasdaq?.correlation7D ?? null) * scoreValue(nasdaqTrend) * 18 - scoreValue(btcDxy?.correlation7D ?? null) * scoreValue(dxyTrend) * 22 + scoreValue(btcGold?.correlation7D ?? null) * scoreValue(goldTrend) * 8)
      : asset === "ETH" || asset === "SOL"
        ? clampSigned(scoreValue(nasdaqTrend) * 20)
        : asset === "Gold"
          ? clampSigned(scoreValue(geopoliticalScore) * 0.45 - scoreValue(us10yTrend) * 120)
          : 0;
  const flowScore =
    asset === "BTC"
      ? clampSigned(scoreValue(btcEtfFlow) / 2_200_000 + -scoreValue(exchangeReserves) * 18)
      : asset === "ETH"
        ? clampSigned(scoreValue(ethEtfFlow) / 2_000_000)
        : asset === "USDT"
          ? clampSigned(scoreValue(usdtSupply) * 22)
          : asset === "SOL"
            ? clampSigned(scoreValue(solTrend) * 14)
            : 0;
  const volatilityScore = asset === "USDT" ? -15 : clampSigned(-scoreValue(vixTrend) * (asset === "SOL" ? 4.2 : asset === "ETH" ? 3.2 : 2.4));
  const newsSeverityScore = assetSentiment;
  let impact = calculateImpactScore({
    regime_score: regimeScore,
    liquidity_score: liquidityScore,
    correlation_score: correlationScore,
    sentiment_score: assetSentiment,
    flow_score: flowScore,
    volatility_score: volatilityScore,
    news_severity_score: newsSeverityScore,
  });

  if (asset === "ETH") {
    impact = {
      score: clampSigned(regimeScore * 0.18 + liquidityScore * 0.18 + correlationScore * 0.18 + assetSentiment * 0.12 + flowScore * 0.12 + volatilityScore * 0.07 + scoreValue(ethTrend) * 4),
      formula: "ETH: ۰٫۱۸×رژیم + ۰٫۱۸×نقدینگی + ۰٫۱۸×همبستگی/tech beta + ۰٫۱۲×سنتیمنت + ۰٫۱۲×ETF/flow + ۰٫۰۷×نوسان + وزن روند ETH.",
    };
  }
  if (asset === "SOL") {
    impact = {
      score: clampSigned(regimeScore * 0.2 + liquidityScore * 0.18 + correlationScore * 0.16 + assetSentiment * 0.1 + flowScore * 0.09 - (liquidity.dataQuality === "unavailable" ? 0 : liquidity.leverageStress) * 0.12 + volatilityScore * 0.1),
      formula: "SOL: ۰٫۲۰×رژیم + ۰٫۱۸×نقدینگی + ۰٫۱۶×همبستگی با risk appetite + ۰٫۱۰×سنتیمنت + ۰٫۰۹×جریان اکوسیستم + جریمه اهرم + ۰٫۱۰×نوسان.",
    };
  }
  if (asset === "USDT") {
    impact = {
      score: clampSigned(-(liquidity.stablecoinExpansion ? 100 - liquidity.stablecoinExpansion : 0) * 0.28 - (liquidity.dataQuality === "unavailable" ? 0 : Math.max(0, -liquidity.liquidityScoreSigned) * 0.2) - (liquidity.dataQuality === "unavailable" ? 0 : Math.max(0, liquidity.leverageStress - 65) * 0.22) + flowScore * 0.18 - Math.max(0, assetSentiment) * 0.05),
      formula: "USDT risk: ریسک از ضعف رشد استیبل‌کوین، فشار نقدینگی، اهرم بالا و جریان عرضه ساخته می‌شود؛ برای USDT سوگیری قیمت تولید نمی‌شود.",
    };
  }

  return { snapshot, liquidity, regime, sentiment, correlation, assetTrend, impact, missingInputs, components: { regimeScore, liquidityScore, correlationScore, assetSentiment, flowScore, volatilityScore, newsSeverityScore } };
}

function channelsForAsset(asset: IntelligenceAssetSymbol, components: ReturnType<typeof assetSpecificInputs>["components"]): TransmissionChannel[] {
  const channels: TransmissionChannel[] = [];
  if (Math.abs(components.liquidityScore) > 12) channels.push("liquidity");
  if (asset === "DXY") channels.push("dollar");
  if (asset === "US10Y") channels.push("rates");
  if (asset === "BTC" || asset === "ETH") channels.push("etf_flows");
  if (asset === "USDT") channels.push("stablecoin_flows", "regulatory_risk");
  if (Math.abs(components.correlationScore) > 12) channels.push("correlation_breakdown");
  if (Math.abs(components.assetSentiment) > 8) channels.push("sentiment_news_shock");
  if (Math.abs(components.volatilityScore) > 10) channels.push("risk_on_risk_off");
  return Array.from(new Set<TransmissionChannel>(channels.length ? channels : ["risk_on_risk_off"]));
}

export function generateAssetImpactProfile(asset: IntelligenceAssetSymbol): DirectionalImpactProfile {
  const data = assetSpecificInputs(asset);
  const values = Object.values(data.components);
  const assetSignals = confidenceSignalsForAsset(asset, data.snapshot);
  const regimeStability = data.regime.regimeLabel === data.regime.previousRegimeLabel ? 78 : 60;
  const transitionPenalty = Math.min(18, Math.max(0, data.regime.transitionProbability - 45) * 0.4);
  const confidence = calculateAdaptiveModuleConfidence({
    moduleName: `asset_impact_${asset}`,
    signals: assetSignals,
    requiredGroups: assetRequiredSignalGroups[asset],
    signalAgreement: signalAgreementScore(values),
    historicalConsistency: Math.max(35, regimeStability - transitionPenalty),
    marketConfirmation: marketConfirmationForAsset(asset, data.assetTrend, data.impact.score, data.components),
    sampleQuality: sampleQualityForAsset(assetSignals),
    minimumGroups: 4,
  });
  const hasUsableImpact = confidence.available;
  const outputImpactScore = hasUsableImpact ? data.impact.score : 0;
  const bias = hasUsableImpact ? biasFromImpact(data.impact.score) : "mixed";
  const assetName = assetLabels[asset];
  const regimeLabel = data.regime.regimeLabel ?? "Neutral / Transition";
  const regimeName = regimeLabelsFa[regimeLabel] ?? regimeLabel;
  const missingInputText = data.missingInputs.length ? `ورودی‌های ناقص: ${data.missingInputs.join("، ")}.` : "";
  const scoreFormula = hasUsableImpact ? `فرمول امتیاز اثر: ${data.impact.formula}` : "فرمول امتیاز اثر اجرا نشد؛ حداقل پوشش داده مستقل برای تولید نقشه جهت‌دار فراهم نیست.";
  const liquidityDriver =
    data.liquidity.dataQuality === "unavailable"
      ? "نقدینگی: داده معتبر برای این لایه در دسترس نیست؛ سیستم آن را به‌عنوان نیروی خنثی واقعی نمایش نمی‌دهد."
      : `نقدینگی: امتیاز کل ${data.liquidity.liquidityScoreSigned}/100؛ نقدینگی اسپات ${data.liquidity.realSpotLiquidityScore ?? "ناموجود"}/100 و پایداری ${data.liquidity.liquiditySustainabilityScore ?? "ناموجود"}/100 است.`;
  const flowDriver =
    data.missingInputs.some((input) => input.includes("ETF") || input.includes("trend"))
      ? `جریان سرمایه: بخشی از داده‌های اختصاصی ${assetName} ناموجود است؛ ${missingInputText || "بنابراین جریان سرمایه با وزن محدود وارد محاسبه شده است."}`
      : `جریان سرمایه: امتیاز ${Math.round(data.components.flowScore)}/100؛ ETF، استیبل‌کوین یا جریان اختصاصی دارایی در این بخش وزن می‌گیرد.`;
  const mainDrivers = hasUsableImpact
    ? [
        `رژیم بازار: ${regimeName}؛ اثر آن برای ${assetName} ${data.components.regimeScore > 0 ? "حمایتی" : data.components.regimeScore < 0 ? "فشارزا" : "خنثی"} است.`,
        liquidityDriver,
        flowDriver,
      ]
    : [
        `داده کافی برای نقشه اثر معتبر ${assetName} وجود ندارد.`,
        confidence.explanation,
        missingInputText || "حداقل چهار گروه سیگنال مستقل باید فعال باشد تا score و جهت اثر نمایش داده شود.",
      ];
  const opposingDrivers = [
    hasUsableImpact && data.components.correlationScore * data.impact.score < 0 ? `همبستگی (Correlation) با سناریوی اصلی هم‌سو نیست؛ امتیاز اثر آن ${Math.round(data.components.correlationScore)} است.` : "",
    hasUsableImpact && data.components.assetSentiment * data.impact.score < 0 ? `سنتیمنت بازار برخلاف جهت اثر کمی حرکت می‌کند؛ امتیاز آن ${Math.round(data.components.assetSentiment)} است.` : "",
    hasUsableImpact && data.components.volatilityScore * data.impact.score < 0 ? `نوسان بازار بخشی از جهت اصلی را خنثی می‌کند؛ امتیاز نوسان ${Math.round(data.components.volatilityScore)} است.` : "",
  ].filter(Boolean);
  const invalidationCondition =
    !hasUsableImpact
      ? `برای اعتبارسنجی نقشه اثر ${assetName}، ابتدا داده‌های ناقص باید وارد شوند و حداقل چهار گروه مستقل سیگنال با تازگی قابل قبول فعال باشد.`
      : bias === "bearish"
      ? `سناریوی منفی ${assetName} زمانی ضعیف می‌شود که DXY و US10Y آرام شوند و در یک تا دو بروزرسانی بعدی جریان ETF یا استیبل‌کوین‌ها مثبت شود.`
      : bias === "bullish"
        ? `سناریوی مثبت ${assetName} زمانی زیر سؤال می‌رود که جریان ETF یا استیبل‌کوین معکوس شود، یا همبستگی‌ها دوباره به نفع رژیم ریسک‌گریز بچرخند.`
        : `سناریوی دوگانه ${assetName} فقط وقتی روشن‌تر می‌شود که دست‌کم دو محرک اصلی، مثل نقدینگی و همبستگی، هم‌جهت شوند.`;

  const traderInterpretation =
    !hasUsableImpact
      ? `برای ${assetName} فعلاً خروجی جهت‌دار معتبر تولید نمی‌شود. این وضعیت به معنی خنثی بودن بازار نیست؛ یعنی داده کافی برای تفکیک سناریوی مثبت، منفی یا دوگانه وجود ندارد.`
      : asset === "BTC"
      ? bias === "bearish"
        ? "بیت‌کوین فعلاً بیشتر مثل دارایی پرریسک رفتار می‌کند تا پناهگاه امن. اگر DXY و بازده اوراق بالا بمانند، حتی خبرهای خنثی یا مثبت کریپتو برای تغییر سناریو کافی نیستند؛ تأیید ETF و همبستگی با طلا باید جداگانه دیده شود."
        : "برای بیت‌کوین، مسیر اصلی از ترکیب ETF، شاخص دلار، بازده اوراق و همبستگی با Nasdaq/Gold ساخته می‌شود. این خروجی نقشه سناریو است، نه دستور ورود یا خروج."
      : asset === "ETH"
        ? "اتریوم علاوه بر ماکرو، به بتای فناوری، وضعیت L2، staking و DeFi حساس است. وقتی نقدینگی کلان ضعیف باشد، خبرهای اکوسیستمی فقط زمانی اثر جدی دارند که با بهبود ETH/BTC و حجم اسپات همراه شوند."
        : asset === "SOL"
          ? "سولانا بیشترین حساسیت را به ریسک‌پذیری خرده‌فروشی، فعالیت DEX و اهرم معاملاتی دارد. در رژیم فشار نقدینگی، SOL معمولاً سریع‌تر از BTC نوسان می‌گیرد و باید کنار نرخ فاندینگ و حجم معاملات فیوچرز خوانده شود."
          : asset === "USDT"
            ? "برای تتر، جهت قیمتی مطرح نیست؛ تمرکز روی پایداری نقدینگی، توزیع شبکه‌ها، ریسک مسدودسازی یا تحریم، ذخایر صرافی و پریمیوم محلی است. افزایش عرضه زمانی حمایتی است که با ریسک نگه‌داری دارایی یا خروج از صرافی‌ها خنثی نشود."
            : asset === "DXY"
              ? "شاخص دلار یک محرک کلان است. تقویت آن معمولاً هزینه نقدینگی دلاری را بالا می‌برد و برای BTC، ETH و SOL فشار ریسک‌گریزی ایجاد می‌کند."
              : asset === "Gold"
                ? "طلا در این مدل نقش پناهگاه امن دارد. حمایت طلا فقط وقتی برای BTC هم معنی‌دار است که همبستگی BTC/Gold بالا برود و هم‌زمان فشار DXY و US10Y شدت نگیرد."
                : asset === "Nasdaq"
                  ? "نزدک کانال انتقال ریسک فناوری است. وقتی BTC/ETH/SOL با Nasdaq همبستگی بالایی دارند، ضعف سهام رشد می‌تواند حتی بدون تیتر منفی کریپتو فشار ایجاد کند."
                  : "US10Y کانال نرخ تنزیل است. رشد بازده اوراق هزینه سرمایه را بالا می‌برد و معمولاً برای دارایی‌های پرریسک، مخصوصاً کریپتو و سهام فناوری، فشارزا است.";

  return {
    asset,
    directionalBias: bias,
    impactScore: outputImpactScore,
    confidence,
    timeframe: "7d",
    mainDrivers,
    opposingDrivers: opposingDrivers.length ? opposingDrivers : hasUsableImpact ? ["محرک مخالف معناداری با وزن کافی دیده نمی‌شود؛ با این حال کیفیت داده و بروزرسانی بعدی باید رصد شود."] : ["محرک مخالف قابل محاسبه نیست، چون نقشه اثر اصلی هنوز از آستانه اعتبار عبور نکرده است."],
    transmissionChannels: channelsForAsset(asset, data.components),
    regimeDependency: `وابسته به رژیم «${regimeName}»؛ احتمال گذار رژیم ${data.regime.transitionProbability}٪ محاسبه شده است.`,
    invalidationCondition,
    traderInterpretation,
    evidence: [
      hasUsableImpact ? `امتیاز اثر ${assetName}: ${outputImpactScore}` : `امتیاز اثر ${assetName}: ناموجود؛ داده مستقل کافی وجود ندارد.`,
      scoreFormula,
      hasUsableImpact ? `اطمینان محاسبه‌شده: ${confidence.score}٪` : confidence.explanation,
      missingInputText,
      `کانال‌های اثرگذار: ${channelsForAsset(asset, data.components).map((channel) => channelLabels[channel]).join("، ")}`,
      ...data.regime.keyDrivers.slice(0, 2),
    ].filter(Boolean),
    scoreFormula,
    scenarios: generateAssetScenarios(asset),
    lastUpdatedAt: getEngineLastUpdatedAt(),
  };
}

export function getAssetImpactProfiles() {
  return assets.map(generateAssetImpactProfile);
}
