import type { AssetSymbol, DataPoint, DataSeriesPoint, IntelligenceAssetSymbol, NormalizedSignal, SignalScores, TransmissionChannel } from "@/lib/types";
import { clampPercent, scoresToLegacyScores, weightedSum } from "@/server/analytics/scoring-engine";
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

export const sourceQualityLayer = getSignalSnapshot().sourceQualityLayer;

function valueOf(key: string, fallback = 0) {
  return getSignalSnapshot().byKey[key]?.value ?? fallback;
}

export const marketSignalSnapshot = {
  dxyPressure: 50 + valueOf("dxy_trend_24h") * 20,
  us10yPressure: 50 + valueOf("us10y_trend_24h") * 180,
  fedRepricing: 58,
  etfFlowImpulse: 50 + Math.max(-40, Math.min(40, valueOf("btc_etf_flow_24h") / 8_000_000)),
  stablecoinSupplyImpulse: 50 + valueOf("stablecoin_market_cap_7d") * 18,
  exchangeReserveDrain: 50 + Math.abs(Math.min(0, valueOf("exchange_reserves_btc_7d"))) * 22,
  fundingHeat: 50 + valueOf("funding_btc") * 950,
  openInterestHeat: 50 + valueOf("open_interest_btc_24h") * 4,
  liquidationDensity: 58,
  whaleExchangeInflow: 47,
  volatilityPressure: 50 + valueOf("vix_trend_24h") * 2.2,
  fearGreed: 48,
  geopoliticalStress: valueOf("geopolitical_event_score", 0),
  nasdaqMomentum: 50 + valueOf("nasdaq_trend_24h") * 14,
  goldHedgeDemand: 50 + valueOf("gold_trend_24h") * 16,
  ethNetworkActivity: 57,
  ethStakingRisk: 54,
  solDexActivity: 73,
  solRetailMomentum: 78,
  usdtIssuerRisk: 49,
  usdtLocalPremiumRisk: 62,
};

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
  const macroStressScore = clampPercent(
    weightedSum(
      {
        dxy: 50 + (snapshot.byKey.dxy_trend_24h?.value ?? 0) * 18,
        us10y: 50 + (snapshot.byKey.us10y_trend_24h?.value ?? 0) * 180,
        vix: 50 + (snapshot.byKey.vix_trend_24h?.value ?? 0) * 2,
        news: 50 + Math.abs(Math.min(0, snapshot.byKey.news_sentiment_macro?.value ?? 0)) * 0.7,
      },
      { dxy: 0.3, us10y: 0.34, vix: 0.18, news: 0.18 },
    ),
  );
  const liquidityScore = clampPercent(
    weightedSum(
      {
        stablecoins: 50 + (snapshot.byKey.stablecoin_market_cap_7d?.value ?? 0) * 18,
        etf: 50 + Math.max(-35, Math.min(35, (snapshot.byKey.btc_etf_flow_24h?.value ?? 0) / 7_000_000)),
        reserves: 50 + Math.abs(Math.min(0, snapshot.byKey.exchange_reserves_btc_7d?.value ?? 0)) * 18,
        spot: 50 + (snapshot.byKey.spot_volume_btc_24h?.value ?? 0) * 2,
      },
      { stablecoins: 0.28, etf: 0.32, reserves: 0.18, spot: 0.22 },
    ),
  );
  const volatilityRisk = clampPercent(50 + (snapshot.byKey.vix_trend_24h?.value ?? 0) * 2.1 + (snapshot.byKey.open_interest_btc_24h?.value ?? 0) * 1.8);
  const marketRiskScore = clampPercent(macroStressScore * 0.48 + volatilityRisk * 0.3 + Math.max(0, 100 - liquidityScore) * 0.22);
  const narrativeStrength = clampPercent(50 + Math.abs(snapshot.byKey.news_sentiment_macro?.value ?? 0) * 0.25 + Math.abs(snapshot.byKey.geopolitical_event_score?.value ?? 0) * 0.18);

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
