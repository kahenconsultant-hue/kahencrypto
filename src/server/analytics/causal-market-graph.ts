import type {
  AssetSymbol,
  CausalMarketEdge,
  CausalMarketGraphOutput,
  CausalMarketNode,
  CausalMarketPath,
  CausalRelationship,
  ConfidenceResult,
  DataSourceStatus,
  DirectionalBias,
  NormalizedSignal,
  TransmissionChannel,
} from "@/lib/types";
import { calculateAdaptiveModuleConfidence } from "@/server/analytics/adaptive-confidence-engine";
import { getDynamicCorrelationReport } from "@/server/analytics/correlation-engine";
import { getLiquidityReport } from "@/server/analytics/liquidity-engine";
import { getEngineLastUpdatedAt, getSignalSnapshot } from "@/server/analytics/market-signals";
import { getMarketRegimeReport } from "@/server/analytics/market-regime-engine";
import { normalizeSignalScore } from "@/server/analytics/quality-engine";
import { getRiskReport } from "@/server/analytics/risk-engine";
import { clampPercent } from "@/server/analytics/scoring-engine";

type EdgeDraft = {
  id: string;
  source: string;
  target: string;
  channel: TransmissionChannel;
  relationship: CausalRelationship;
  directionalBias: DirectionalBias;
  signals: NormalizedSignal[];
  missingInputs?: string[];
  effectScore: number | null;
  regimeSensitivity: string[];
  explanationFa: string;
  suppressionReasonFa?: string;
};

const requiredCausalKeys = [
  "dxy_trend_24h",
  "us10y_trend_24h",
  "btc_trend_24h",
  "eth_trend_24h",
  "sol_trend_24h",
  "stablecoin_market_cap_7d",
  "btc_etf_flow_7d",
  "funding_btc",
  "open_interest_btc_24h",
  "news_sentiment_macro",
  "geopolitical_event_score",
] as const;

function usableSignal(signal: NormalizedSignal | undefined): signal is NormalizedSignal {
  return Boolean(signal && signal.value !== null && signal.quality !== "unavailable" && signal.quality !== "estimated");
}

function signalByKey(key: string) {
  return getSignalSnapshot().byKey[key];
}

function usableSignals(keys: string[]) {
  return keys.map(signalByKey).filter(usableSignal);
}

function combinedQuality(signals: NormalizedSignal[]): DataSourceStatus {
  if (!signals.length) return "unavailable";
  if (signals.some((signal) => signal.quality === "proxy")) return "proxy";
  if (signals.some((signal) => signal.quality === "partial_live")) return "partial_live";
  if (signals.some((signal) => signal.quality === "delayed")) return "delayed";
  if (signals.every((signal) => signal.quality === "live")) return "live";
  return "partial_live";
}

function signalConfidence(signal: NormalizedSignal) {
  const sourceReliability = signal.reliability || signal.confidenceBase || 0;
  const sampleScore = signal.sampleSize && signal.sampleSize >= 30 ? 90 : signal.sampleSize && signal.sampleSize >= 10 ? 65 : 72;
  const qualityCap = signal.quality === "live" ? 100 : signal.quality === "partial_live" ? 84 : signal.quality === "delayed" ? 72 : signal.quality === "proxy" ? 58 : 0;
  return Math.min(qualityCap, clampPercent(sourceReliability * 0.72 + sampleScore * 0.28));
}

function edgeConfidence(signals: NormalizedSignal[], effectScore: number | null, extraCap = 100) {
  if (!signals.length || effectScore === null) return null;
  const sourceConfidence = signals.reduce((sum, signal) => sum + signalConfidence(signal), 0) / signals.length;
  const strength = Math.min(100, 35 + Math.abs(effectScore) * 0.65);
  const coverage = Math.min(100, signals.length * 34);
  return clampPercent(Math.min(sourceConfidence * 0.45 + strength * 0.35 + coverage * 0.2, extraCap));
}

function edgeProbability(effectScore: number | null, confidence: number | null) {
  if (effectScore === null || confidence === null) return null;
  return clampPercent(30 + Math.abs(effectScore) * 0.45 + confidence * 0.25);
}

function strengthLabel(probability: number | null, confidence: number | null): CausalMarketEdge["strength"] {
  if (probability === null || confidence === null) return "insufficient";
  const effective = Math.min(probability, confidence);
  if (effective >= 72) return "strong";
  if (effective >= 52) return "moderate";
  return "weak";
}

function buildEdge(draft: EdgeDraft): CausalMarketEdge {
  const missingInputs = draft.missingInputs ?? [];
  const active = draft.effectScore !== null && draft.signals.length > 0 && !draft.suppressionReasonFa;
  const confidence = active ? edgeConfidence(draft.signals, draft.effectScore) : null;
  const probability = edgeProbability(draft.effectScore, confidence);
  const status = active ? "active" : missingInputs.length || !draft.signals.length ? "insufficient_data" : "suppressed";
  return {
    id: draft.id,
    source: draft.source,
    target: draft.target,
    channel: draft.channel,
    relationship: active ? draft.relationship : "uncertain",
    directionalBias: active ? draft.directionalBias : "mixed",
    probability,
    confidence,
    strength: strengthLabel(probability, confidence),
    status,
    dataQuality: combinedQuality(draft.signals),
    sourceSignals: draft.signals.map((signal) => signal.key),
    missingInputs,
    regimeSensitivity: draft.regimeSensitivity,
    explanationFa: draft.suppressionReasonFa ?? draft.explanationFa,
  };
}

function relationFromEffect(effect: number | null, positiveIsSupport = true): Pick<EdgeDraft, "relationship" | "directionalBias"> {
  if (effect === null || Math.abs(effect) < 8) return { relationship: "uncertain", directionalBias: "neutral" };
  const supportive = positiveIsSupport ? effect > 0 : effect < 0;
  return {
    relationship: supportive ? "supports" : "pressures",
    directionalBias: supportive ? "bullish" : "bearish",
  };
}

function weightedEffect(parts: Array<{ value: number | null; weight: number }>) {
  const available = parts.filter((part): part is { value: number; weight: number } => typeof part.value === "number" && Number.isFinite(part.value));
  if (!available.length) return null;
  const totalWeight = available.reduce((sum, part) => sum + part.weight, 0);
  return Math.round(available.reduce((sum, part) => sum + part.value * part.weight, 0) / Math.max(1, totalWeight));
}

function score(key: string) {
  const signal = signalByKey(key);
  return usableSignal(signal) ? normalizeSignalScore(signal) : null;
}

function node(id: string, labelFa: string, type: CausalMarketNode["type"], score: number | null, status: DataSourceStatus): CausalMarketNode {
  return { id, labelFa, type, score, status };
}

function findCorrelation(pair: string) {
  return getDynamicCorrelationReport().signals.find((signal) => signal.assetPair === pair);
}

function correlationCap(pair: string) {
  const signal = findCorrelation(pair);
  if (!signal || signal.status !== "available" || !signal.narrativeAllowed) {
    return {
      cap: 48,
      reasonFa: `${pair}: همبستگی برای تأیید کانال انتقال کافی نیست؛ رابطه به‌عنوان علت مستقیم استفاده نمی‌شود.`,
    };
  }
  return {
    cap: Math.max(45, signal.confidence ?? 45),
    reasonFa: null,
  };
}

function macroLiquidityEffect() {
  return weightedEffect([
    { value: score("dxy_trend_24h"), weight: 0.56 },
    { value: score("us10y_trend_24h"), weight: 0.44 },
  ]);
}

function cryptoLiquidityEffect() {
  return weightedEffect([
    { value: score("stablecoin_market_cap_7d"), weight: 0.38 },
    { value: score("usdt_supply_7d"), weight: 0.2 },
    { value: score("usdc_supply_7d"), weight: 0.14 },
    { value: score("btc_etf_flow_7d") ?? score("btc_etf_flow_24h"), weight: 0.18 },
    { value: score("spot_volume_btc_24h"), weight: 0.1 },
  ]);
}

function leverageFragilityEffect() {
  return weightedEffect([
    { value: score("funding_btc"), weight: -0.42 },
    { value: score("open_interest_btc_24h"), weight: -0.36 },
    { value: score("futures_volume_btc_24h"), weight: -0.22 },
  ]);
}

function missing(keys: string[]) {
  return keys.filter((key) => !usableSignal(signalByKey(key)));
}

function activePath(id: string, chain: string[], edges: CausalMarketEdge[], affectedAssets: AssetSymbol[], narrativeFa: string, invalidationFa: string): CausalMarketPath {
  const activeEdges = edges.filter((edge) => edge.status === "active" && chain.includes(edge.source) && chain.includes(edge.target));
  const confidence = activeEdges.length ? clampPercent(activeEdges.reduce((sum, edge) => sum + (edge.confidence ?? 0), 0) / activeEdges.length) : null;
  const probability = activeEdges.length ? clampPercent(activeEdges.reduce((sum, edge) => sum + (edge.probability ?? 0), 0) / activeEdges.length) : null;
  const bearish = activeEdges.filter((edge) => edge.directionalBias === "bearish").length;
  const bullish = activeEdges.filter((edge) => edge.directionalBias === "bullish").length;
  return {
    id,
    chain,
    affectedAssets,
    probability,
    confidence,
    directionalBias: bullish > bearish ? "bullish" : bearish > bullish ? "bearish" : "mixed",
    narrativeFa,
    invalidationFa,
    evidence: activeEdges.map((edge) => edge.explanationFa).slice(0, 4),
  };
}

function confidenceForGraph(signals: NormalizedSignal[]): ConfidenceResult {
  return calculateAdaptiveModuleConfidence({
    moduleName: "causal_market_graph",
    signals,
    requiredGroups: ["price", "macro", "liquidity", "flows", "stablecoins", "leverage", "sentiment", "geopolitical"],
    criticalKeys: ["btc_trend_24h", "dxy_trend_24h", "us10y_trend_24h", "stablecoin_market_cap_7d"],
    signalAgreement: 58,
    historicalConsistency: 62,
    marketConfirmation: 54,
    minimumGroups: 4,
  });
}

export function getCausalMarketGraph(): CausalMarketGraphOutput {
  const snapshot = getSignalSnapshot();
  const signals = requiredCausalKeys.map((key) => snapshot.byKey[key]).filter((signal): signal is NormalizedSignal => Boolean(signal));
  const availableSignals = signals.filter(usableSignal);
  const liquidity = getLiquidityReport();
  const risk = getRiskReport();
  const regime = getMarketRegimeReport();

  const macroEffect = macroLiquidityEffect();
  const cryptoEffect = cryptoLiquidityEffect();
  const leverageEffect = leverageFragilityEffect();
  const btcCorrelationCap = correlationCap("BTC ↔ Nasdaq");
  const dxyCorrelationCap = correlationCap("BTC ↔ DXY");
  const us10yCorrelationCap = correlationCap("BTC ↔ US10Y");
  const confidence = confidenceForGraph(signals);

  const edges = [
    buildEdge({
      id: "us10y-to-macro-liquidity",
      source: "US10Y",
      target: "macro_liquidity",
      channel: "rates",
      ...relationFromEffect(score("us10y_trend_24h")),
      signals: usableSignals(["us10y_trend_24h"]),
      missingInputs: missing(["us10y_trend_24h"]),
      effectScore: score("us10y_trend_24h"),
      regimeSensitivity: ["risk_off", "contraction", "deleveraging"],
      explanationFa: "افزایش بازده اوراق احتمال فشار نرخ تنزیل و سخت‌تر شدن نقدینگی کلان را بالا می‌برد؛ این رابطه احتمالی است و با FRED/Yahoo/Futures تأیید می‌شود.",
    }),
    buildEdge({
      id: "dxy-to-macro-liquidity",
      source: "DXY",
      target: "macro_liquidity",
      channel: "dollar",
      ...relationFromEffect(score("dxy_trend_24h")),
      signals: usableSignals(["dxy_trend_24h"]),
      missingInputs: missing(["dxy_trend_24h"]),
      effectScore: score("dxy_trend_24h"),
      regimeSensitivity: ["risk_off", "macro_uncertainty", "contraction"],
      explanationFa: "تقویت دلار معمولاً فشار نقدینگی جهانی را بالا می‌برد؛ موتور این را علت قطعی نمی‌داند و فقط به‌صورت احتمال انتقال ریسک نمایش می‌دهد.",
    }),
    buildEdge({
      id: "macro-liquidity-to-crypto-liquidity",
      source: "macro_liquidity",
      target: "crypto_liquidity",
      channel: "liquidity",
      ...relationFromEffect(macroEffect),
      signals: usableSignals(["dxy_trend_24h", "us10y_trend_24h"]),
      missingInputs: missing(["dxy_trend_24h", "us10y_trend_24h"]),
      effectScore: macroEffect,
      regimeSensitivity: ["risk_on", "risk_off", "liquidity_expansion", "liquidity_contraction"],
      explanationFa: "ترکیب دلار و نرخ بهره مسیر بالادستی نقدینگی است؛ اگر هر دو فشارزا باشند، احتمال انتقال فشار به کریپتو بیشتر می‌شود.",
    }),
    buildEdge({
      id: "stablecoins-to-crypto-liquidity",
      source: "stablecoin_supply",
      target: "crypto_liquidity",
      channel: "stablecoin_flows",
      ...relationFromEffect(cryptoEffect),
      signals: usableSignals(["stablecoin_market_cap_7d", "usdt_supply_7d", "usdc_supply_7d"]),
      missingInputs: missing(["stablecoin_market_cap_7d", "usdt_supply_7d", "usdc_supply_7d"]),
      effectScore: cryptoEffect,
      regimeSensitivity: ["expansion", "contraction", "squeeze"],
      explanationFa: "رشد یا افت عرضه استیبل‌کوین‌ها ظرفیت نقدینگی نقدی بازار کریپتو را تغییر می‌دهد؛ اگر داده DefiLlama موجود نباشد، این edge غیرفعال می‌ماند.",
    }),
    buildEdge({
      id: "etf-to-institutional-demand",
      source: "etf_flows",
      target: "institutional_demand",
      channel: "etf_flows",
      ...relationFromEffect(score("btc_etf_flow_7d") ?? score("btc_etf_flow_24h")),
      signals: usableSignals(["btc_etf_flow_7d", "btc_etf_flow_24h"]),
      missingInputs: missing(["btc_etf_flow_7d", "btc_etf_flow_24h"]),
      effectScore: score("btc_etf_flow_7d") ?? score("btc_etf_flow_24h"),
      regimeSensitivity: ["accumulation", "distribution", "risk_on", "risk_off"],
      explanationFa: "جریان ETF فقط وقتی به‌عنوان تقاضای نهادی وارد graph می‌شود که ردیف واقعی ETF از منبع عمومی موجود باشد؛ مقدار تخمینی ساخته نمی‌شود.",
    }),
    buildEdge({
      id: "leverage-to-fragility",
      source: "derivatives_leverage",
      target: "market_fragility",
      channel: "leverage",
      relationship: leverageEffect === null ? "uncertain" : leverageEffect < 0 ? "amplifies" : "dampens",
      directionalBias: leverageEffect === null ? "mixed" : leverageEffect < 0 ? "bearish" : "neutral",
      signals: usableSignals(["funding_btc", "open_interest_btc_24h", "futures_volume_btc_24h"]),
      missingInputs: missing(["funding_btc", "open_interest_btc_24h", "futures_volume_btc_24h"]),
      effectScore: leverageEffect,
      regimeSensitivity: ["squeeze", "deleveraging", "speculative_mania"],
      explanationFa: "فاندینگ، open interest و حجم فیوچرز احتمال شکنندگی حرکت را نشان می‌دهند؛ بدون داده derivatives این مسیر نتیجه‌گیری جهت‌دار نمی‌سازد.",
    }),
    buildEdge({
      id: "nasdaq-to-risk-appetite",
      source: "Nasdaq",
      target: "risk_appetite",
      channel: "risk_on_risk_off",
      ...relationFromEffect(score("nasdaq_trend_24h")),
      signals: usableSignals(["nasdaq_trend_24h"]),
      missingInputs: missing(["nasdaq_trend_24h"]),
      effectScore: score("nasdaq_trend_24h"),
      regimeSensitivity: ["risk_on", "risk_off", "neutral"],
      suppressionReasonFa: btcCorrelationCap.reasonFa ?? undefined,
      explanationFa: "Nasdaq کانال ریسک فناوری است، اما فقط وقتی به BTC/ETH/SOL منتقل می‌شود که همبستگی کافی و پایدار باشد.",
    }),
    buildEdge({
      id: "crypto-liquidity-to-btc",
      source: "crypto_liquidity",
      target: "BTC",
      channel: "liquidity",
      ...relationFromEffect(liquidity.liquidityHealthScore === undefined ? cryptoEffect : liquidity.liquidityHealthScore - 50),
      signals: usableSignals(["stablecoin_market_cap_7d", "btc_etf_flow_7d", "spot_volume_btc_24h"]),
      missingInputs: missing(["stablecoin_market_cap_7d", "btc_etf_flow_7d", "spot_volume_btc_24h"]),
      effectScore: liquidity.liquidityHealthScore === undefined ? cryptoEffect : liquidity.liquidityHealthScore - 50,
      regimeSensitivity: ["risk_on", "risk_off", "squeeze", "expansion"],
      explanationFa: "نقدینگی کریپتو مسیر اصلی اثر بر BTC است؛ اگر نقدینگی ضعیف باشد، احتمال فشار یا حرکت شکننده بیشتر می‌شود.",
    }),
    buildEdge({
      id: "macro-pressure-to-btc",
      source: "macro_liquidity",
      target: "BTC",
      channel: "dollar",
      ...relationFromEffect(macroEffect),
      signals: usableSignals(["dxy_trend_24h", "us10y_trend_24h", "btc_trend_24h"]),
      missingInputs: missing(["dxy_trend_24h", "us10y_trend_24h", "btc_trend_24h"]),
      effectScore: macroEffect,
      regimeSensitivity: ["risk_off", "macro_uncertainty", "deleveraging"],
      suppressionReasonFa: dxyCorrelationCap.reasonFa ?? us10yCorrelationCap.reasonFa ?? undefined,
      explanationFa: "فشار دلار/نرخ وقتی برای BTC معتبرتر است که رابطه تاریخی BTC با DXY یا US10Y داده کافی داشته باشد.",
    }),
    buildEdge({
      id: "crypto-liquidity-to-eth-sol",
      source: "crypto_liquidity",
      target: "ETH_SOL_beta",
      channel: "liquidity",
      ...relationFromEffect(liquidity.liquidityHealthScore === undefined ? cryptoEffect : liquidity.liquidityHealthScore - 50),
      signals: usableSignals(["stablecoin_market_cap_7d", "eth_trend_24h", "sol_trend_24h", "spot_volume_sol_24h"]),
      missingInputs: missing(["stablecoin_market_cap_7d", "eth_trend_24h", "sol_trend_24h", "spot_volume_sol_24h"]),
      effectScore: liquidity.liquidityHealthScore === undefined ? cryptoEffect : liquidity.liquidityHealthScore - 50,
      regimeSensitivity: ["risk_on", "speculative_mania", "squeeze"],
      explanationFa: "ETH و SOL نسبت به نقدینگی و beta بازار حساس‌ترند؛ ضعف نقدینگی احتمال شکنندگی آن‌ها را بیشتر از BTC بالا می‌برد.",
    }),
    buildEdge({
      id: "geopolitical-to-risk",
      source: "geopolitical_risk",
      target: "market_risk",
      channel: "geopolitical_risk",
      relationship: score("geopolitical_event_score") === null ? "uncertain" : "amplifies",
      directionalBias: score("geopolitical_event_score") === null || score("geopolitical_event_score") === 0 ? "neutral" : "bearish",
      signals: usableSignals(["geopolitical_event_score"]),
      missingInputs: missing(["geopolitical_event_score"]),
      effectScore: score("geopolitical_event_score"),
      regimeSensitivity: ["panic", "risk_off", "macro_uncertainty"],
      explanationFa: "ریسک ژئوپلیتیک می‌تواند نوسان و تقاضای دفاعی را بالا ببرد؛ اثر آن فقط با رویدادهای relevant و نه خبرهای اداری فعال می‌شود.",
    }),
  ];

  const activeEdges = edges.filter((edge) => edge.status === "active");
  const suppressedEdges = edges.filter((edge) => edge.status !== "active");
  const missingInputs = [...new Set(edges.flatMap((edge) => edge.missingInputs))];
  const graphHealthScore = clampPercent(
    activeEdges.length * 6 +
      (confidence.score ?? 0) * 0.45 +
      Math.max(0, 100 - suppressedEdges.length * 6) * 0.22,
  );
  const riskScore = typeof risk.riskScore === "number" ? risk.riskScore : null;
  const nodes: CausalMarketNode[] = [
    node("US10Y", "بازده اوراق ۱۰ ساله", "macro", signalByKey("us10y_trend_24h")?.value ?? null, signalByKey("us10y_trend_24h")?.quality ?? "unavailable"),
    node("DXY", "شاخص دلار", "macro", signalByKey("dxy_trend_24h")?.value ?? null, signalByKey("dxy_trend_24h")?.quality ?? "unavailable"),
    node("macro_liquidity", "نقدینگی کلان", "liquidity", liquidity.macroLiquidityScore, liquidity.dataQuality),
    node("stablecoin_supply", "عرضه استیبل‌کوین", "flow", signalByKey("stablecoin_market_cap_7d")?.value ?? null, signalByKey("stablecoin_market_cap_7d")?.quality ?? "unavailable"),
    node("etf_flows", "جریان ETF", "flow", signalByKey("btc_etf_flow_7d")?.value ?? null, signalByKey("btc_etf_flow_7d")?.quality ?? "unavailable"),
    node("crypto_liquidity", "نقدینگی کریپتو", "liquidity", liquidity.liquidityHealthScore ?? liquidity.cryptoLiquidityScore, liquidity.dataQuality),
    node("derivatives_leverage", "اهرم مشتقات", "leverage", liquidity.leverageStress, liquidity.dataQuality),
    node("risk_appetite", "اشتیاق ریسک", "risk", signalByKey("nasdaq_trend_24h")?.value ?? null, signalByKey("nasdaq_trend_24h")?.quality ?? "unavailable"),
    node("market_risk", "ریسک بازار", "risk", riskScore, risk.status),
    node("BTC", "بیت‌کوین", "asset", signalByKey("btc_trend_24h")?.value ?? null, signalByKey("btc_trend_24h")?.quality ?? "unavailable"),
    node("ETH_SOL_beta", "بتای ETH/SOL", "asset", weightedEffect([{ value: score("eth_trend_24h"), weight: 0.45 }, { value: score("sol_trend_24h"), weight: 0.55 }]), combinedQuality(usableSignals(["eth_trend_24h", "sol_trend_24h"]))),
    node("regime", regime.regimeLabel ?? regime.active, "regime", regime.confidence, regime.engine.dataQuality),
  ];
  const dominantPaths = [
    activePath(
      "macro-liquidity-btc",
      ["US10Y", "DXY", "macro_liquidity", "crypto_liquidity", "BTC"],
      edges,
      ["BTC", "ETH", "SOL"],
      "مسیر اصلی فعلی از دلار/نرخ به نقدینگی و سپس BTC/ETH/SOL منتقل می‌شود، اما فقط به‌صورت احتمال و با سقف confidence ناشی از کیفیت داده.",
      "این مسیر ضعیف می‌شود اگر DXY و US10Y آرام شوند و هم‌زمان stablecoin یا ETF flow تأیید مثبت بدهد.",
    ),
    activePath(
      "stablecoin-etf-liquidity",
      ["stablecoin_supply", "etf_flows", "crypto_liquidity", "BTC"],
      edges,
      ["BTC", "ETH"],
      "مسیر نقدینگی داخلی کریپتو از استیبل‌کوین و ETF ساخته می‌شود؛ نبود ETF یا exchange flow باعث کاهش confidence می‌شود، نه ساخت مقدار جایگزین.",
      "این مسیر نامعتبر می‌شود اگر ETF flow ناموجود/منفی بماند و رشد استیبل‌کوین نتواند بالای روند ۷ روزه تثبیت شود.",
    ),
    activePath(
      "leverage-fragility",
      ["derivatives_leverage", "market_fragility", "BTC", "ETH_SOL_beta"],
      edges,
      ["BTC", "SOL"],
      "وقتی اهرم بالا و نقدینگی ضعیف باشد، حرکت بازار می‌تواند شکننده‌تر شود؛ این مسیر به‌خصوص برای SOL حساس‌تر است.",
      "اگر funding، open interest و futures volume آرام شوند و spot volume بهتر شود، این مسیر تضعیف می‌شود.",
    ),
  ].filter((path) => path.confidence !== null && path.probability !== null);
  const consistencyWarnings = [
    ...suppressedEdges.slice(0, 4).map((edge) => `${edge.id}: ${edge.explanationFa}`),
    ...(confidence.available ? [] : [confidence.explanation]),
  ];
  const dataQuality = graphHealthScore >= 70 ? "partial_live" : graphHealthScore >= 45 ? "delayed" : "unavailable";

  return {
    moduleName: "causal_market_graph",
    status: activeEdges.length >= 6 ? "partial_live" : activeEdges.length >= 3 ? "delayed" : "unavailable",
    graphHealthScore,
    confidence,
    dataQuality,
    nodes,
    edges,
    activeEdges,
    suppressedEdges,
    dominantPaths,
    missingInputs,
    consistencyWarnings,
    narrativeFa:
      dominantPaths[0]?.narrativeFa ??
      "زنجیره علیت قابل اتکا هنوز کامل نیست؛ موتور به‌جای ساخت روایت قطعی، مسیرهای ناکافی را suppressed نگه می‌دارد.",
    lastUpdatedAt: getEngineLastUpdatedAt(),
  };
}
