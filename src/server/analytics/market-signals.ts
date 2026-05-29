import type { AssetSymbol, DataPoint, DataSeriesPoint, IntelligenceAssetSymbol, NormalizedSignal, SignalScores, TransmissionChannel } from "@/lib/types";
import { clampPercent, scoresToLegacyScores } from "@/server/analytics/scoring-engine";
import { getCachedDataPointsSync, getSignalCacheStatusSync } from "@/server/data/signal-cache";
import { freshnessStatus } from "@/server/analytics/quality-engine";

export type SeriesKey = IntelligenceAssetSymbol | "VIX" | "Stablecoin dominance" | "Liquidity" | "ETF flows" | "Tech Beta" | "Retail Risk Appetite";

export interface SourceQuality {
  name: string;
  status: DataPoint["quality"];
  reliabilityWeight: number;
  freshnessMinutes: number;
  latency: "realtime" | "intraday" | "daily" | "delayed";
  marketRelevance: number;
}

export const REFRESH_INTERVAL_MINUTES = 30;
let signalSnapshotMemo: ReturnType<typeof buildSignalSnapshot> | null = null;
let signalSnapshotMemoKey: string | null = null;
const returnSeriesMemo = new Map<string, number[]>();

export function getEngineLastUpdatedAt() {
  return getSignalCacheStatusSync().generatedAt ?? new Date().toISOString();
}

const channelByKey: Record<string, TransmissionChannel> = {
  btc_trend_24h: "risk_on_risk_off",
  eth_trend_24h: "risk_on_risk_off",
  sol_trend_24h: "risk_on_risk_off",
  nasdaq_trend_24h: "risk_on_risk_off",
  dxy_trend_24h: "dollar",
  us10y_trend_24h: "rates",
  gold_trend_24h: "geopolitical_risk",
  vix_trend_24h: "sentiment_news_shock",
  usdt_supply_7d: "stablecoin_flows",
  usdc_supply_7d: "stablecoin_flows",
  stablecoin_market_cap_7d: "stablecoin_flows",
  btc_etf_flow_24h: "etf_flows",
  eth_etf_flow_24h: "etf_flows",
  funding_btc: "leverage",
  open_interest_btc_24h: "leverage",
  spot_volume_btc_24h: "liquidity",
  futures_volume_btc_24h: "leverage",
  exchange_reserves_btc_7d: "onchain_activity",
  news_sentiment_macro: "sentiment_news_shock",
  geopolitical_event_score: "geopolitical_risk",
};

const labelByKey: Record<string, string> = {
  btc_trend_24h: "روند ۲۴ ساعته BTC",
  eth_trend_24h: "روند ۲۴ ساعته ETH",
  sol_trend_24h: "روند ۲۴ ساعته SOL",
  nasdaq_trend_24h: "روند ۲۴ ساعته Nasdaq",
  dxy_trend_24h: "روند ۲۴ ساعته شاخص دلار",
  us10y_trend_24h: "تغییر بازده اوراق ۱۰ ساله آمریکا",
  gold_trend_24h: "روند ۲۴ ساعته طلا",
  vix_trend_24h: "تغییر ۲۴ ساعته VIX",
  usdt_supply_7d: "تغییر ۷ روزه عرضه USDT",
  usdc_supply_7d: "تغییر ۷ روزه عرضه USDC",
  stablecoin_market_cap_7d: "تغییر ۷ روزه ارزش بازار استیبل‌کوین‌ها",
  btc_etf_flow_24h: "جریان ۲۴ ساعته ETF بیت‌کوین",
  eth_etf_flow_24h: "جریان ۲۴ ساعته ETF اتریوم",
  funding_btc: "نرخ فاندینگ BTC",
  open_interest_btc_24h: "تغییر موقعیت‌های باز BTC",
  spot_volume_btc_24h: "تغییر حجم اسپات BTC",
  futures_volume_btc_24h: "تغییر حجم فیوچرز BTC",
  exchange_reserves_btc_7d: "تغییر ۷ روزه ذخایر BTC در صرافی‌ها",
  news_sentiment_macro: "امتیاز سنتیمنت اخبار کلان",
  geopolitical_event_score: "امتیاز ریسک ژئوپلیتیک",
};

export function clampScore(value: number) {
  return clampPercent(value);
}

export function weightedAverage(values: Array<{ value: number; weight: number }>) {
  const totalWeight = values.reduce((sum, item) => sum + item.weight, 0);
  if (!totalWeight) return 0;
  return values.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight;
}

export function normalizeDataPoint(point: DataPoint): NormalizedSignal {
  const value = typeof point.value === "number" ? point.value : null;
  const previousValue = typeof point.previousValue === "number" ? point.previousValue : null;
  const change = value !== null && previousValue !== null ? Number((value - previousValue).toFixed(4)) : null;
  const direction = change === null ? "unavailable" : Math.abs(change) < 0.05 ? "flat" : change > 0 ? "up" : "down";

  return {
    id: point.id ?? point.key,
    key: point.key,
    label: labelByKey[point.key] ?? point.key,
    asset: point.asset,
    metric: point.metric,
    value,
    previousValue,
    changeAbs: point.changeAbs ?? change,
    changePct: point.changePct,
    change,
    direction,
    group: point.group,
    channel: channelByKey[point.key] ?? "liquidity",
    source: point.source,
    sourceType: point.sourceType,
    quality: point.quality,
    reliability: point.reliability,
    confidenceBase: point.confidenceBase ?? point.reliability,
    sampleSize: point.sampleSize,
    delayMinutes: point.delayMinutes,
    history: point.history,
    intradayHistory: point.intradayHistory,
    timestamp: point.timestamp,
    error: point.error,
    estimatedReason: point.estimatedReason,
  };
}

function buildSignalSnapshot(points: DataPoint[], cacheStatus: ReturnType<typeof getSignalCacheStatusSync>) {
  const signals = points.map(normalizeDataPoint);
  const byKey = Object.fromEntries(signals.map((signal) => [signal.key, signal])) as Record<string, NormalizedSignal>;
  const sourceQualityLayer = signals.map((signal): SourceQuality => {
    const freshnessMinutes = signal.timestamp ? Math.max(0, Math.round((Date.now() - new Date(signal.timestamp).getTime()) / 60_000)) : 10_000;
    return {
      name: signal.source,
      status: signal.quality,
      reliabilityWeight: signal.reliability,
      freshnessMinutes,
      latency: signal.quality === "live" ? "intraday" : signal.quality === "delayed" ? "delayed" : "daily",
      marketRelevance: signal.reliability,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    lastUpdatedAt: cacheStatus.generatedAt ?? getEngineLastUpdatedAt(),
    cacheStatus,
    signals,
    byKey,
    sourceQualityLayer,
  };
}

export function getSignalSnapshot(points?: DataPoint[]) {
  const cacheStatus = getSignalCacheStatusSync();
  if (!points) {
    const memoKey = `${cacheStatus.generatedAt ?? "none"}:${cacheStatus.stale}`;
    if (signalSnapshotMemo && signalSnapshotMemoKey === memoKey) return signalSnapshotMemo;
    signalSnapshotMemo = buildSignalSnapshot(getCachedDataPointsSync(), cacheStatus);
    signalSnapshotMemoKey = memoKey;
    return signalSnapshotMemo;
  }
  return buildSignalSnapshot(points, cacheStatus);
}

function usableSignalValue(snapshot: ReturnType<typeof getSignalSnapshot>, key: string) {
  const signal = snapshot.byKey[key];
  if (!signal || signal.value === null || signal.quality === "unavailable" || signal.quality === "estimated") return null;
  return signal.value;
}

function weightedAvailableScore(values: Array<{ value: number | null; weight: number }>) {
  const available = values.filter((item): item is { value: number; weight: number } => item.value !== null && Number.isFinite(item.value));
  if (!available.length) return null;
  return clampPercent(weightedAverage(available));
}

export function calculateConfidence(params: {
  sources: SourceQuality[];
  signalAlignment: number;
  historicalConsistency: number;
  volatilityRisk: number;
}) {
  const sourceDepth = Math.min(100, params.sources.length * 12);
  const freshness = weightedAverage(
    params.sources.map((source) => ({
      value: Math.max(25, 100 - source.freshnessMinutes / 8),
      weight: source.reliabilityWeight,
    })),
  );
  const reliability = weightedAverage(params.sources.map((source) => ({ value: source.reliabilityWeight, weight: source.marketRelevance })));
  const qualityPenalty =
    params.sources.filter((source) => source.status === "estimated").length * 5 +
    params.sources.filter((source) => source.status === "delayed").length * 3 +
    params.sources.filter((source) => source.status === "unavailable").length * 12;
  const volatilityPenalty = Math.max(0, params.volatilityRisk - 55) * 0.18;

  return clampPercent(reliability * 0.32 + freshness * 0.22 + sourceDepth * 0.14 + params.signalAlignment * 0.2 + params.historicalConsistency * 0.12 - qualityPenalty - volatilityPenalty);
}

export function deriveBaseScores(): SignalScores {
  const snapshot = getSignalSnapshot();
  const dxy = usableSignalValue(snapshot, "dxy_trend_24h");
  const us10y = usableSignalValue(snapshot, "us10y_trend_24h");
  const vix = usableSignalValue(snapshot, "vix_trend_24h");
  const newsSentiment = usableSignalValue(snapshot, "news_sentiment_macro");
  const stablecoins = usableSignalValue(snapshot, "stablecoin_market_cap_7d");
  const btcEtfFlow = usableSignalValue(snapshot, "btc_etf_flow_24h");
  const exchangeReserves = usableSignalValue(snapshot, "exchange_reserves_btc_7d");
  const spotVolume = usableSignalValue(snapshot, "spot_volume_btc_24h");
  const openInterest = usableSignalValue(snapshot, "open_interest_btc_24h");
  const geopolitical = usableSignalValue(snapshot, "geopolitical_event_score");

  const macroStressComponent = weightedAvailableScore([
    { value: dxy === null ? null : 50 + dxy * 18, weight: 0.3 },
    { value: us10y === null ? null : 50 + us10y * 180, weight: 0.34 },
    { value: vix === null ? null : 50 + vix * 2, weight: 0.18 },
    { value: newsSentiment === null ? null : 50 + Math.abs(Math.min(0, newsSentiment)) * 0.7, weight: 0.18 },
  ]);
  const liquidityComponent = weightedAvailableScore([
    { value: stablecoins === null ? null : 50 + stablecoins * 18, weight: 0.28 },
    { value: btcEtfFlow === null ? null : 50 + Math.max(-35, Math.min(35, btcEtfFlow / 7_000_000)), weight: 0.32 },
    { value: exchangeReserves === null ? null : 50 + Math.abs(Math.min(0, exchangeReserves)) * 18, weight: 0.18 },
    { value: spotVolume === null ? null : 50 + spotVolume * 2, weight: 0.22 },
  ]);
  const volatilityComponent = weightedAvailableScore([
    { value: vix === null ? null : 50 + vix * 2.1, weight: 0.54 },
    { value: openInterest === null ? null : 50 + openInterest * 1.8, weight: 0.46 },
  ]);
  const macroStressScore = macroStressComponent ?? 0;
  const liquidityScore = liquidityComponent ?? 0;
  const volatilityRisk = volatilityComponent ?? 0;
  const marketRiskScore = weightedAvailableScore([
    { value: macroStressComponent, weight: 0.48 },
    { value: volatilityComponent, weight: 0.3 },
    { value: liquidityComponent === null ? null : Math.max(0, 100 - liquidityComponent), weight: 0.22 },
  ]) ?? 0;
  const narrativeStrength = weightedAvailableScore([
    { value: newsSentiment === null ? null : 50 + Math.abs(newsSentiment) * 0.25, weight: 0.58 },
    { value: geopolitical === null ? null : 50 + Math.abs(geopolitical) * 0.18, weight: 0.42 },
  ]) ?? 0;

  return scoresToLegacyScores({ marketRisk: marketRiskScore, liquidity: liquidityScore, macroStress: macroStressScore, narrative: narrativeStrength, volatility: volatilityRisk });
}

const seriesKeyToSignalKey: Record<SeriesKey, string> = {
  BTC: "btc_trend_24h",
  ETH: "eth_trend_24h",
  SOL: "sol_trend_24h",
  USDT: "usdt_supply_7d",
  DXY: "dxy_trend_24h",
  Gold: "gold_trend_24h",
  Nasdaq: "nasdaq_trend_24h",
  US10Y: "us10y_trend_24h",
  VIX: "vix_trend_24h",
  "Stablecoin dominance": "stablecoin_market_cap_7d",
  Liquidity: "stablecoin_market_cap_7d",
  "ETF flows": "btc_etf_flow_24h",
  "Tech Beta": "nasdaq_trend_24h",
  "Retail Risk Appetite": "sol_trend_24h",
};

function orderedHistory(history: DataSeriesPoint[] | undefined) {
  return (history ?? [])
    .filter((item) => Number.isFinite(item.value) && Boolean(item.timestamp))
    .sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp));
}

function valuesToReturns(history: DataSeriesPoint[]) {
  const values = orderedHistory(history);
  const returns: number[] = [];
  for (let index = 1; index < values.length; index += 1) {
    const previous = values[index - 1].value;
    const current = values[index].value;
    if (previous > 0 && current > 0) {
      returns.push(Number(Math.log(current / previous).toFixed(6)));
    } else if (previous !== 0) {
      returns.push(Number(((current - previous) / Math.abs(previous)).toFixed(6)));
    }
  }
  return returns;
}

export function buildReturnSeries(key: SeriesKey, frequency: "intraday" | "daily" = "daily"): number[] {
  const cacheKey = `${getSignalCacheStatusSync().generatedAt ?? "none"}:${key}:${frequency}`;
  const cached = returnSeriesMemo.get(cacheKey);
  if (cached) return cached;
  const signalKey = seriesKeyToSignalKey[key];
  const signal = getSignalSnapshot().byKey[signalKey];
  if (!signal || signal.value === null || signal.quality === "unavailable" || signal.quality === "estimated") {
    returnSeriesMemo.set(cacheKey, []);
    return [];
  }
  const history = frequency === "intraday" ? signal.intradayHistory : signal.history;
  const returns = valuesToReturns(history ?? []);
  returnSeriesMemo.set(cacheKey, returns);
  return returns;
}

export function minutesSinceEngineUpdate(now = new Date()) {
  const timestamp = getSignalCacheStatusSync().generatedAt ?? getEngineLastUpdatedAt();
  const diff = now.getTime() - new Date(timestamp).getTime();
  return Math.max(0, Math.round(diff / 60_000));
}

export function getRefreshHealth(now = new Date()) {
  const cacheStatus = getSignalCacheStatusSync();
  const ageMinutes = cacheStatus.ageMinutes;
  const status = freshnessStatus(ageMinutes);
  const failedRefresh = ageMinutes !== null && ageMinutes > REFRESH_INTERVAL_MINUTES + 5;
  return {
    ...cacheStatus,
    freshness: status,
    failedRefresh,
    nextScheduledUpdateMinutes: ageMinutes === null ? 0 : Math.max(0, REFRESH_INTERVAL_MINUTES - ageMinutes),
    warning: failedRefresh ? `بروزرسانی از برنامه ۳۰ دقیقه‌ای عقب افتاده است؛ آخرین snapshot ${ageMinutes} دقیقه پیش ساخته شده.` : null,
  };
}

export function sourcesForEngine(names: string[]) {
  return getSignalSnapshot().sourceQualityLayer.filter((source) => names.some((name) => source.name.includes(name) || name.includes(source.name)));
}

export const supportedEngineAssets: AssetSymbol[] = ["BTC", "ETH", "SOL", "USDT", "DXY", "Gold", "Nasdaq", "US10Y"];
