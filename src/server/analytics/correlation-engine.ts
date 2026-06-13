import type { AssetSymbol, CorrelationPair, CorrelationSignal, CorrelationState, DataSourceStatus } from "@/lib/types";
import {
  buildTimestampedReturnSeries,
  getEngineLastUpdatedAt,
  getSeriesSignal,
  type SeriesKey,
} from "@/server/analytics/market-signals";
import { buildCorrelationAlignmentDataset } from "@/server/analytics/correlation_alignment_engine";
import { clampPercent } from "@/server/analytics/scoring-engine";
import { getLatestMarketSnapshotsSync } from "@/storage/ingestion-store";
import type { MarketSnapshotInput } from "@/types/ingestion";

export type CorrelationWindow = "24h" | "7d" | "30d" | "90d";
type CorrelationStatus = "available" | "insufficient_data" | "missing_series";
type CorrelationSeriesKey = Extract<SeriesKey, AssetSymbol | "VIX" | "Stablecoin dominance" | "Stablecoin Market Cap">;
type CorrelationFrequency = "intraday" | "daily";
type CorrelationWindowMeta = NonNullable<CorrelationSignal["windowIntegrity"]>[CorrelationWindow];

const minimumSamples: Record<CorrelationWindow, number> = {
  "24h": 12,
  "7d": 5,
  "30d": 20,
  "90d": 60,
};

const windowSamples: Record<CorrelationWindow, number> = {
  "24h": 24,
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

const CORRELATION_CACHE_TTL_MS = 30_000;

type TimestampedValue = { timestamp: string; value: number };

let latestSnapshotCache: { expiresAt: number; snapshots: MarketSnapshotInput[] } | null = null;
const returnSeriesCache = new Map<string, { expiresAt: number; values: TimestampedValue[] }>();

const pairDefinitions: Array<{
  id: string;
  label: string;
  left: CorrelationSeriesKey;
  right: CorrelationSeriesKey;
  importance: number;
}> = [
  { id: "btc-eth", label: "BTC ↔ ETH", left: "BTC", right: "ETH", importance: 0.96 },
  { id: "btc-sol", label: "BTC ↔ SOL", left: "BTC", right: "SOL", importance: 0.92 },
  { id: "btc-dxy", label: "BTC ↔ DXY", left: "BTC", right: "DXY", importance: 1 },
  { id: "btc-us10y", label: "BTC ↔ US10Y", left: "BTC", right: "US10Y", importance: 0.98 },
  { id: "btc-nasdaq", label: "BTC ↔ Nasdaq", left: "BTC", right: "Nasdaq", importance: 1 },
  { id: "btc-gold", label: "BTC ↔ Gold", left: "BTC", right: "Gold", importance: 0.86 },
  { id: "btc-stablecoin-market-cap", label: "BTC ↔ Stablecoin Market Cap", left: "BTC", right: "Stablecoin Market Cap", importance: 0.9 },
  { id: "eth-sol", label: "ETH ↔ SOL", left: "ETH", right: "SOL", importance: 0.82 },
  { id: "eth-dxy", label: "ETH ↔ DXY", left: "ETH", right: "DXY", importance: 0.82 },
  { id: "eth-nasdaq", label: "ETH ↔ Nasdaq", left: "ETH", right: "Nasdaq", importance: 0.8 },
  { id: "sol-dxy", label: "SOL ↔ DXY", left: "SOL", right: "DXY", importance: 0.78 },
  { id: "sol-nasdaq", label: "SOL ↔ Nasdaq", left: "SOL", right: "Nasdaq", importance: 0.78 },
];

export function rollingCorrelation(left: number[], right: number[]) {
  const length = Math.min(left.length, right.length);
  if (length < 2) return null;

  const xs = left.slice(-length);
  const ys = right.slice(-length);
  const avgX = xs.reduce((sum, value) => sum + value, 0) / length;
  const avgY = ys.reduce((sum, value) => sum + value, 0) / length;
  const numerator = xs.reduce((sum, value, index) => sum + (value - avgX) * (ys[index] - avgY), 0);
  const denomX = Math.sqrt(xs.reduce((sum, value) => sum + (value - avgX) ** 2, 0));
  const denomY = Math.sqrt(ys.reduce((sum, value) => sum + (value - avgY) ** 2, 0));

  if (denomX === 0 || denomY === 0) return null;
  return Number((numerator / (denomX * denomY)).toFixed(2));
}

function mean(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function standardDeviation(values: number[]) {
  if (values.length < 2) return 0;
  const avg = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (values.length - 1));
}

function covariance(left: number[], right: number[]) {
  const length = Math.min(left.length, right.length);
  if (length < 2) return null;
  const xs = left.slice(-length);
  const ys = right.slice(-length);
  const avgX = mean(xs);
  const avgY = mean(ys);
  return xs.reduce((sum, value, index) => sum + (value - avgX) * (ys[index] - avgY), 0) / (length - 1);
}

function betaAdjustedRelationship(left: number[], right: number[]) {
  const cov = covariance(left, right);
  const rightVol = standardDeviation(right);
  if (cov === null || rightVol === 0) return null;
  return Number((cov / rightVol ** 2).toFixed(2));
}

function volatilityAdjustedCorrelation(left: number[], right: number[], rawCorrelation: number | null) {
  if (rawCorrelation === null) return null;
  const leftVol = standardDeviation(left);
  const rightVol = standardDeviation(right);
  if (!leftVol || !rightVol) return rawCorrelation;
  const balance = Math.sqrt(Math.min(leftVol, rightVol) / Math.max(leftVol, rightVol));
  return Number((rawCorrelation * balance).toFixed(2));
}

function bucketTimestamp(timestamp: string, frequency: "intraday" | "daily") {
  return frequency === "intraday" ? timestamp.slice(0, 13) : timestamp.slice(0, 10);
}

function isWeekendBucket(bucket: string) {
  const day = new Date(`${bucket}T00:00:00.000Z`).getUTCDay();
  return day === 0 || day === 6;
}

function isCryptoOnlySeries(key: SeriesKey) {
  return key === "BTC" || key === "ETH" || key === "SOL";
}

function isCryptoOnlyPair(left: SeriesKey, right: SeriesKey) {
  return isCryptoOnlySeries(left) && isCryptoOnlySeries(right);
}

function frequencyForWindow(left: SeriesKey, right: SeriesKey, window: CorrelationWindow): CorrelationFrequency {
  return window === "24h" && isCryptoOnlyPair(left, right) ? "intraday" : "daily";
}

function windowEnabled(left: SeriesKey, right: SeriesKey, window: CorrelationWindow) {
  return window !== "24h" || isCryptoOnlyPair(left, right);
}

const snapshotMetricPreferences: Partial<Record<CorrelationSeriesKey, string[]>> = {
  BTC: ["price_usd", "price_trend_24h_pct"],
  ETH: ["price_usd", "price_trend_24h_pct"],
  SOL: ["price_usd", "price_trend_24h_pct"],
  DXY: ["price_trend_24h_pct"],
  US10Y: ["yield_change_pct_point"],
  Nasdaq: ["price_trend_24h_pct"],
  Gold: ["price_trend_24h_pct"],
  "Stablecoin Market Cap": ["total_stablecoin_market_cap_usd", "market_cap_change_7d_pct"],
};

type SnapshotMetricRow = {
  asset?: string | null;
  metric?: string | null;
  value?: number | null;
  timestamp?: string | null;
  sourceName?: string | null;
  quality?: string | null;
};

function latestSnapshotsForCorrelation() {
  const now = Date.now();
  if (latestSnapshotCache && latestSnapshotCache.expiresAt > now) return latestSnapshotCache.snapshots;
  const snapshots = getLatestMarketSnapshotsSync(5_000);
  latestSnapshotCache = { expiresAt: now + CORRELATION_CACHE_TTL_MS, snapshots };
  return snapshots;
}

function cachedReturnSeriesKey(key: SeriesKey, frequency: CorrelationFrequency) {
  return `${key}:${frequency}`;
}

function snapshotMetrics(snapshot: MarketSnapshotInput): SnapshotMetricRow[] {
  const payload = snapshot.payload as { metrics?: unknown[] } | undefined;
  return (payload?.metrics ?? [])
    .map((item) => (typeof item === "object" && item !== null ? (item as SnapshotMetricRow) : null))
    .filter((item): item is SnapshotMetricRow => Boolean(item));
}

function seriesAssetMatches(key: CorrelationSeriesKey, metric: SnapshotMetricRow) {
  if (key === "Stablecoin Market Cap") return metric.asset === "Stablecoins";
  return metric.asset === key;
}

function valueForSnapshotSeries(key: CorrelationSeriesKey, snapshot: MarketSnapshotInput) {
  const preferences = snapshotMetricPreferences[key] ?? [];
  const metrics = snapshotMetrics(snapshot).filter((metric) => seriesAssetMatches(key, metric) && typeof metric.value === "number" && Number.isFinite(metric.value));
  for (const metricName of preferences) {
    const match = metrics.find((metric) => metric.metric === metricName);
    if (match && typeof match.value === "number") return match.value;
  }
  return null;
}

function bucketedSnapshotValues(key: CorrelationSeriesKey, frequency: CorrelationFrequency) {
  const snapshots = latestSnapshotsForCorrelation();
  const byBucket = new Map<string, { timestamp: string; value: number }>();

  for (const snapshot of snapshots) {
    const value = valueForSnapshotSeries(key, snapshot);
    if (value === null) continue;
    const timestamp = snapshot.observedAt;
    if (!Number.isFinite(Date.parse(timestamp))) continue;
    const bucket = bucketTimestamp(timestamp, frequency);
    if (frequency === "daily" && isWeekendBucket(bucket)) continue;
    const previous = byBucket.get(bucket);
    if (!previous || Date.parse(timestamp) >= Date.parse(previous.timestamp)) {
      byBucket.set(bucket, { timestamp, value });
    }
  }

  return Array.from(byBucket.values()).sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp));
}

function timestampedReturnsFromValues(values: TimestampedValue[]) {
  const returns: TimestampedValue[] = [];
  for (let index = 1; index < values.length; index += 1) {
    const previous = values[index - 1].value;
    const current = values[index].value;
    const timestamp = values[index].timestamp;
    if (previous > 0 && current > 0) {
      returns.push({ timestamp, value: Number(Math.log(current / previous).toFixed(6)) });
    } else if (previous !== 0) {
      returns.push({ timestamp, value: Number(((current - previous) / Math.abs(previous)).toFixed(6)) });
    }
  }
  return returns;
}

function buildHistoricalReturnSeries(key: SeriesKey, frequency: CorrelationFrequency) {
  const now = Date.now();
  const cacheKey = cachedReturnSeriesKey(key, frequency);
  const cached = returnSeriesCache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.values;

  const snapshotReturns = timestampedReturnsFromValues(bucketedSnapshotValues(key as CorrelationSeriesKey, frequency));
  const values = snapshotReturns.length ? snapshotReturns : buildTimestampedReturnSeries(key, frequency);
  returnSeriesCache.set(cacheKey, { expiresAt: now + CORRELATION_CACHE_TTL_MS, values });
  return values;
}

export function getCorrelationWindowPlan(left: SeriesKey, right: SeriesKey, window: CorrelationWindow) {
  return {
    frequency: displayFrequency(frequencyForWindow(left, right, window)),
    enabled: windowEnabled(left, right, window),
    minimumObservations: minimumSamples[window],
  };
}

function expectedWindowsForPair(left: SeriesKey, right: SeriesKey): CorrelationWindow[] {
  return isCryptoOnlyPair(left, right) ? ["24h", "7d", "30d", "90d"] : ["7d", "30d", "90d"];
}

function displayFrequency(frequency: CorrelationFrequency): CorrelationWindowMeta["frequency"] {
  return frequency === "intraday" ? "hourly" : "daily";
}

function alignedReturns(left: SeriesKey, right: SeriesKey, frequency: "intraday" | "daily") {
  if (frequency === "daily") {
    const dataset = buildCorrelationAlignmentDataset(left, right);
    if (dataset) {
      return dataset.points
        .map((item) => ({ bucket: item.day, left: item.leftReturn, right: item.rightReturn }))
        .sort((a, b) => a.bucket.localeCompare(b.bucket));
    }
  }

  const leftReturns = buildHistoricalReturnSeries(left, frequency);
  const rightReturns = buildHistoricalReturnSeries(right, frequency);
  const rightByBucket = new Map(
    rightReturns
      .map((item) => [bucketTimestamp(item.timestamp, frequency), item.value] as const)
      .filter(([bucket]) => frequency !== "daily" || !isWeekendBucket(bucket)),
  );

  return leftReturns
    .map((item) => {
      const bucket = bucketTimestamp(item.timestamp, frequency);
      if (frequency === "daily" && isWeekendBucket(bucket)) return null;
      const rightValue = rightByBucket.get(bucket);
      return typeof rightValue === "number" ? { bucket, left: item.value, right: rightValue } : null;
    })
    .filter((item): item is { bucket: string; left: number; right: number } => Boolean(item))
    .sort((a, b) => a.bucket.localeCompare(b.bucket));
}

function correlationWindowMeta(params: {
  left: SeriesKey;
  right: SeriesKey;
  window: CorrelationWindow;
  frequency: CorrelationFrequency;
  sampleSize: number;
  status: CorrelationStatus;
  lastAlignedTimestamp: string | null;
  sourcePair?: string;
}): CorrelationWindowMeta {
  return {
    window: params.window,
    frequency: displayFrequency(params.frequency),
    observationsUsed: params.sampleSize,
    missingObservations: Math.max(0, minimumSamples[params.window] - params.sampleSize),
    minimumObservations: minimumSamples[params.window],
    availableSamples: params.sampleSize,
    requiredSamples: minimumSamples[params.window],
    coveragePercent: clampPercent((params.sampleSize / Math.max(1, minimumSamples[params.window])) * 100),
    lastAlignedTimestamp: params.lastAlignedTimestamp,
    sourcePair: params.sourcePair ?? sourceText(params.left, params.right),
    status: params.status,
  };
}

function correlationForWindow(left: SeriesKey, right: SeriesKey, window: CorrelationWindow) {
  const frequency = frequencyForWindow(left, right, window);
  if (!windowEnabled(left, right, window)) {
    return {
      value: null,
      sampleSize: 0,
      status: "insufficient_data" as CorrelationStatus,
      meta: correlationWindowMeta({ left, right, window, frequency, sampleSize: 0, status: "insufficient_data", lastAlignedTimestamp: null }),
    };
  }
  const aligned = alignedReturns(left, right, frequency);
  const sample = aligned.slice(-windowSamples[window]);
  const sampleSize = sample.length;
  const alignmentDataset = frequency === "daily" ? buildCorrelationAlignmentDataset(left, right) : null;
  const leftSignal = getSeriesSignal(left);
  const rightSignal = getSeriesSignal(right);
  const leftSeries = buildHistoricalReturnSeries(left, frequency);
  const rightSeries = buildHistoricalReturnSeries(right, frequency);
  const missingSeries = (!leftSignal && !leftSeries.length) || (!rightSignal && !rightSeries.length) || !leftSeries.length || !rightSeries.length;
  const lastAlignedTimestamp = sample.at(-1)?.bucket ?? null;

  if (missingSeries) {
    return {
      value: null,
      sampleSize,
      status: "missing_series" as CorrelationStatus,
      meta: correlationWindowMeta({ left, right, window, frequency, sampleSize, status: "missing_series", lastAlignedTimestamp, sourcePair: alignmentDataset?.sourcePair }),
    };
  }
  if (sampleSize < minimumSamples[window]) {
    return {
      value: null,
      sampleSize,
      status: "insufficient_data" as CorrelationStatus,
      meta: correlationWindowMeta({ left, right, window, frequency, sampleSize, status: "insufficient_data", lastAlignedTimestamp, sourcePair: alignmentDataset?.sourcePair }),
    };
  }

  const value = rollingCorrelation(sample.map((item) => item.left), sample.map((item) => item.right));
  if (value === null) {
    return {
      value: null,
      sampleSize,
      status: "insufficient_data" as CorrelationStatus,
      meta: correlationWindowMeta({ left, right, window, frequency, sampleSize, status: "insufficient_data", lastAlignedTimestamp, sourcePair: alignmentDataset?.sourcePair }),
    };
  }

  return {
    value,
    sampleSize,
    status: "available" as CorrelationStatus,
    meta: correlationWindowMeta({ left, right, window, frequency, sampleSize, status: "available", lastAlignedTimestamp, sourcePair: alignmentDataset?.sourcePair }),
  };
}

function previousCorrelationForWindow(left: SeriesKey, right: SeriesKey, window: CorrelationWindow) {
  if (!windowEnabled(left, right, window)) return null;
  const frequency = frequencyForWindow(left, right, window);
  const aligned = alignedReturns(left, right, frequency);
  const windowSize = windowSamples[window];
  const sample = aligned.slice(-windowSize * 2, -windowSize);
  if (sample.length < minimumSamples[window]) return null;
  return rollingCorrelation(sample.map((item) => item.left), sample.map((item) => item.right));
}

function sampleForWindow(left: SeriesKey, right: SeriesKey, window: CorrelationWindow) {
  const frequency = frequencyForWindow(left, right, window);
  if (!windowEnabled(left, right, window)) return [];
  return alignedReturns(left, right, frequency).slice(-windowSamples[window]);
}

function statisticalStrength(value: number | null, sampleSize: number): CorrelationSignal["statisticalStrength"] {
  if (value === null || sampleSize < 12) return "insufficient";
  const magnitude = Math.abs(value);
  if (magnitude < 0.3) return "weak";
  if (magnitude >= 0.6 && sampleSize >= 90) return "strong";
  return "moderate";
}

function calculateStabilityScore(windows: Record<CorrelationWindow, { value: number | null; sampleSize: number; status: CorrelationStatus }>) {
  const values = ([windows["7d"].value, windows["30d"].value, windows["90d"].value].filter((value): value is number => typeof value === "number"));
  if (values.length < 2) return null;
  const signs = values.map((value) => Math.sign(value)).filter((sign) => sign !== 0);
  const signConsistency = signs.length ? Math.max(...[-1, 1].map((sign) => signs.filter((item) => item === sign).length)) / signs.length : 0.5;
  const dispersion = values.reduce((sum, value, index, array) => {
    if (index === 0) return sum;
    return sum + Math.abs(value - array[index - 1]);
  }, 0) / Math.max(1, values.length - 1);
  const depthScore = Math.min(100, ((windows["7d"].sampleSize / minimumSamples["7d"]) * 35 + (windows["30d"].sampleSize / minimumSamples["30d"]) * 45 + (windows["90d"].sampleSize / minimumSamples["90d"]) * 20));
  return clampPercent(signConsistency * 45 + Math.max(0, 45 - dispersion * 65) + depthScore * 0.1);
}

function hasStructuralBreak(signal: Pick<CorrelationSignal, "correlation7D" | "correlation30D" | "correlation90D">) {
  const c7 = signal.correlation7D;
  const c30 = signal.correlation30D;
  const c90 = signal.correlation90D;
  if (c7 !== null && c30 !== null && Math.abs(c7 - c30) > 0.6) return true;
  if (c7 !== null && c30 !== null && Math.sign(c7) !== Math.sign(c30) && Math.abs(c7) > 0.35 && Math.abs(c30) > 0.35) return true;
  if (c30 !== null && c90 !== null && Math.sign(c30) !== Math.sign(c90) && Math.abs(c30) > 0.35 && Math.abs(c90) > 0.35) return true;
  return false;
}

function leadLagAnalysis(left: SeriesKey, right: SeriesKey, label: string): CorrelationSignal["leadLag"] {
  const cryptoOnly = isCryptoOnlyPair(left, right);
  const intraday = cryptoOnly ? alignedReturns(left, right, "intraday").slice(-24) : [];
  const daily = alignedReturns(left, right, "daily").slice(-30);
  const source = intraday.length >= minimumSamples["24h"] ? { sample: intraday, lag: "1h" as const } : daily.length >= minimumSamples["7d"] ? { sample: daily, lag: "1d" as const } : null;
  if (!source) {
    return {
      leader: "insufficient",
      lag: null,
      correlation: null,
      confidence: null,
      interpretationFa: `${label}: برای lead-lag معتبر، نقاط تاریخی کافی وجود ندارد.`,
    };
  }

  const sample = source.sample;
  const current = rollingCorrelation(sample.map((item) => item.left), sample.map((item) => item.right));
  const leftLeads = rollingCorrelation(sample.slice(0, -1).map((item) => item.left), sample.slice(1).map((item) => item.right));
  const rightLeads = rollingCorrelation(sample.slice(1).map((item) => item.left), sample.slice(0, -1).map((item) => item.right));
  const candidates = [
    { leader: "left" as const, value: leftLeads },
    { leader: "right" as const, value: rightLeads },
  ].filter((item): item is { leader: "left" | "right"; value: number } => typeof item.value === "number");
  const best = candidates.sort((a, b) => Math.abs(b.value) - Math.abs(a.value))[0];
  const improvement = best && current !== null ? Math.abs(best.value) - Math.abs(current) : best ? Math.abs(best.value) : 0;
  const meaningful = Boolean(best && Math.abs(best.value) >= 0.2 && improvement >= 0.08);

  if (!meaningful || !best) {
    return {
      leader: "none",
      lag: source.lag,
      correlation: current,
      confidence: clampPercent(Math.min(55, sample.length * 2.2)),
      interpretationFa: `${label}: lead-lag معنادار دیده نمی‌شود؛ رابطه بیشتر هم‌زمان یا ناپایدار است.`,
    };
  }

  const leaderLabel = best.leader === "left" ? left : right;
  return {
    leader: best.leader,
    lag: source.lag,
    correlation: Number(best.value.toFixed(2)),
    confidence: clampPercent(Math.min(82, sample.length * 2.8 + Math.abs(best.value) * 35)),
    interpretationFa: `${label}: در پنجره ${source.lag}، ${leaderLabel} کمی جلوتر از طرف مقابل حرکت کرده است؛ این فقط رابطه احتمالی است و بدون تأیید نقدینگی یا قیمت نباید به نتیجه قطعی تبدیل شود.`,
  };
}

function regimeChannel(pair: string, signal: Pick<CorrelationSignal, "correlation7D" | "correlation30D" | "state">) {
  const selected = signal.correlation7D ?? signal.correlation30D;
  if (selected === null || Math.abs(selected) < 0.2) return "no_directional_channel";
  if (pair === "BTC ↔ Nasdaq" || pair === "ETH ↔ SOL" || pair === "ETH ↔ BTC" || pair === "BTC ↔ SOL") return selected > 0 ? "risk_beta_channel" : "relative_decoupling";
  if (pair === "BTC ↔ DXY" || pair === "ETH ↔ DXY" || pair === "SOL ↔ DXY") return selected < 0 ? "dollar_pressure_channel" : "dollar_relationship_divergence";
  if (pair.includes("US10Y")) return selected < 0 ? "rates_pressure_channel" : "rates_relationship_divergence";
  if (pair === "BTC ↔ Gold") return selected > 0 ? "hedge_macro_channel" : "safe_haven_decoupling";
  if (pair === "BTC ↔ Stablecoin Market Cap") return selected > 0 ? "stablecoin_liquidity_channel" : "liquidity_confirmation_missing";
  return signal.state;
}

export function classifyCorrelation(value: number | null) {
  if (value === null) return "نمونه ناکافی";
  if (value >= 0.7) return "مثبت قوی";
  if (value >= 0.35) return "مثبت متوسط";
  if (value <= -0.7) return "منفی قوی";
  if (value <= -0.35) return "منفی متوسط";
  if (Math.abs(value) < 0.1) return "از نظر آماری ضعیف";
  return "ضعیف / ناپایدار";
}

export function detectCorrelationState(signal: Pick<CorrelationSignal, "correlation24H" | "correlation7D" | "correlation30D" | "correlation90D" | "previous90D">): CorrelationState {
  const c24 = signal.correlation24H;
  const c7 = signal.correlation7D;
  const c30 = signal.correlation30D;
  const c90 = signal.correlation90D;
  const previous90 = signal.previous90D;

  if (c7 === null && c30 === null) return "unstable";
  if (c7 !== null && c30 !== null && Math.abs(c7 - c30) > 0.6) return "unstable";
  if (c7 !== null && c30 !== null && Math.sign(c7) !== Math.sign(c30) && Math.abs(c7) > 0.35 && Math.abs(c30) > 0.35) return "unstable";
  if (c7 !== null && Math.abs(c7) < 0.2 && c30 !== null && Math.abs(c30) >= 0.35) return "decoupling";
  if (c7 !== null && Math.abs(c7) < 0.2 && (c30 === null || Math.abs(c30) < 0.35)) return "decoupling";
  if ((c7 ?? c30 ?? 0) <= -0.35) return "inverse_correlation";
  if (c30 !== null && c90 !== null && c30 >= 0.58 && c90 >= 0.52) return "strongly_correlated";
  if (c90 !== null && previous90 !== null && Math.abs(c90 - previous90) >= 0.22) return "weakening";
  if (c24 !== null && c7 !== null && Math.abs(c24 - c7) >= 0.5) return "unstable";
  return "weakening";
}

function signed(value: number | null) {
  if (value === null) return "ناموجود";
  return value.toFixed(2);
}

function sourceText(left: SeriesKey, right: SeriesKey) {
  const leftSignal = getSeriesSignal(left);
  const rightSignal = getSeriesSignal(right);
  return [leftSignal?.source, rightSignal?.source].filter(Boolean).join(" + ") || "منبع ناموجود";
}

function freshnessScore(left: SeriesKey, right: SeriesKey) {
  const timestamps = [getSeriesSignal(left)?.timestamp, getSeriesSignal(right)?.timestamp].filter((timestamp): timestamp is string => Boolean(timestamp));
  if (!timestamps.length) return 0;
  const ages = timestamps.map((timestamp) => Math.max(0, Math.round((Date.now() - Date.parse(timestamp)) / 60_000)));
  const worstAge = Math.max(...ages);
  if (worstAge <= 15) return 100;
  if (worstAge <= 45) return 82;
  if (worstAge <= 90) return 62;
  if (worstAge <= 180) return 38;
  return 15;
}

function sampleQualityScore(windows: Record<CorrelationWindow, { value: number | null; sampleSize: number; status: CorrelationStatus }>) {
  const availableWindows = Object.entries(windows) as Array<[CorrelationWindow, { value: number | null; sampleSize: number; status: CorrelationStatus }]>;
  const usableWindows = availableWindows.filter(([, window]) => window.status !== "missing_series");
  if (!usableWindows.length) return 0;
  return clampPercent(
    usableWindows.reduce((sum, [window, meta]) => sum + Math.min(100, (meta.sampleSize / minimumSamples[window]) * 100), 0) / usableWindows.length,
  );
}

function persistenceScore(windows: Record<CorrelationWindow, { value: number | null; sampleSize: number; status: CorrelationStatus }>) {
  const values = [windows["7d"].value, windows["30d"].value, windows["90d"].value].filter((value): value is number => typeof value === "number");
  if (!values.length) return 0;
  if (values.length === 1) return Math.min(58, Math.abs(values[0]) * 120);
  const dominantSign = Math.sign(values.reduce((sum, value) => sum + value, 0));
  const sameDirection = dominantSign === 0 ? 0.5 : values.filter((value) => Math.sign(value) === dominantSign).length / values.length;
  const magnitudePersistence = values.reduce((sum, value) => sum + Math.min(1, Math.abs(value) / 0.6), 0) / values.length;
  return clampPercent(sameDirection * 58 + magnitudePersistence * 42);
}

function regimeConsistencyScore(windows: Record<CorrelationWindow, { value: number | null; sampleSize: number; status: CorrelationStatus }>, structuralBreak: boolean) {
  const values = [windows["7d"].value, windows["30d"].value, windows["90d"].value].filter((value): value is number => typeof value === "number");
  if (!values.length) return 0;
  const signs = values.map((value) => Math.sign(value)).filter((sign) => sign !== 0);
  const signConsistency = signs.length ? Math.max(...[-1, 1].map((sign) => signs.filter((item) => item === sign).length)) / signs.length : 0.5;
  const breakPenalty = structuralBreak ? 35 : 0;
  return clampPercent(signConsistency * 100 - breakPenalty);
}

function pairConfidence(params: {
  left: SeriesKey;
  right: SeriesKey;
  windows: Record<CorrelationWindow, { value: number | null; sampleSize: number; status: CorrelationStatus }>;
  stabilityScore: number | null;
  structuralBreak: boolean;
}) {
  const expectedWindows = expectedWindowsForPair(params.left, params.right);
  const validWindows = expectedWindows.filter((window) => params.windows[window].value !== null);
  if (!validWindows.length) return null;
  const sampleQuality = sampleQualityScore(params.windows);
  const stability = params.stabilityScore ?? (validWindows.length >= 2 ? 45 : 30);
  const persistence = persistenceScore(params.windows);
  const freshness = freshnessScore(params.left, params.right);
  const regimeConsistency = regimeConsistencyScore(params.windows, params.structuralBreak);

  return clampPercent(
    sampleQuality * 0.3 +
      stability * 0.25 +
      persistence * 0.2 +
      freshness * 0.15 +
      regimeConsistency * 0.1,
  );
}

function correlationCoverageForPair(params: {
  left: SeriesKey;
  right: SeriesKey;
  windows: Record<CorrelationWindow, { value: number | null; sampleSize: number; status: CorrelationStatus }>;
}) {
  const expectedWindows = expectedWindowsForPair(params.left, params.right);
  const validWindows = expectedWindows.filter((window) => params.windows[window].value !== null);
  const alignedWindows = expectedWindows.filter((window) => params.windows[window].sampleSize > 0 && params.windows[window].status !== "missing_series");
  const historicalDepth = expectedWindows.length
    ? expectedWindows.reduce((sum, window) => sum + Math.min(1, params.windows[window].sampleSize / minimumSamples[window]), 0) / expectedWindows.length
    : 0;
  const alignmentQuality = expectedWindows.length ? alignedWindows.length / expectedWindows.length : 0;
  const coverage = expectedWindows.length ? (validWindows.length / expectedWindows.length) * historicalDepth * alignmentQuality * 100 : 0;

  return {
    coverage: clampPercent(coverage),
    validWindows: validWindows.length,
    requiredWindows: expectedWindows.length,
    historicalDepth: Number((historicalDepth * 100).toFixed(1)),
    alignmentQuality: Number((alignmentQuality * 100).toFixed(1)),
  };
}

function historyCoverageFactorForPair(params: {
  left: SeriesKey;
  right: SeriesKey;
  windows: Record<CorrelationWindow, { sampleSize: number }>;
}) {
  const expectedWindows = expectedWindowsForPair(params.left, params.right);
  if (!expectedWindows.length) return 0;
  return clampPercent(
    Math.min(...expectedWindows.map((window) => (params.windows[window].sampleSize / minimumSamples[window]) * 100)),
  );
}

export function capCorrelationConfidenceByCoverage(confidence: number | null, coverage: number) {
  if (confidence === null) return null;
  const hardCap = coverage < 40 ? 40 : coverage < 60 ? 60 : 100;
  return clampPercent(Math.min(confidence, coverage, hardCap));
}

export function capCorrelationConfidenceByStrength(
  confidence: number | null,
  windows: Record<CorrelationWindow, { value: number | null }>,
  stabilityScore: number | null,
) {
  if (confidence === null) return null;
  const values = Object.values(windows)
    .map((window) => window.value)
    .filter((value): value is number => typeof value === "number");
  if (!values.length) return null;

  const maxAbsCorrelation = Math.max(...values.map((value) => Math.abs(value)));
  const strengthCap = maxAbsCorrelation < 0.1 ? 45 : maxAbsCorrelation < 0.2 ? 60 : maxAbsCorrelation < 0.3 ? 70 : 100;
  const stabilityCap = stabilityScore === null ? 70 : stabilityScore < 35 ? 55 : stabilityScore < 55 ? 75 : 100;

  return clampPercent(Math.min(confidence, strengthCap, stabilityCap));
}

function pairStatus(windows: Record<CorrelationWindow, { value: number | null; sampleSize: number; status: CorrelationStatus }>): CorrelationStatus {
  const statuses = Object.values(windows).map((window) => window.status);
  if (statuses.every((status) => status === "missing_series")) return "missing_series";
  if (Object.values(windows).some((window) => window.value !== null)) return "available";
  return "insufficient_data";
}

function expectedWindowsHaveCoverage(left: SeriesKey, right: SeriesKey, windows: Record<CorrelationWindow, { value: number | null; sampleSize: number; status: CorrelationStatus }>) {
  return expectedWindowsForPair(left, right).every((window) => windows[window].status === "available");
}

function pairInterpretation(pair: string, signal: CorrelationSignal) {
  if (signal.status !== "available") {
    return `${pair}: برای تولید تفسیر معتبر، سری‌های تاریخی هم‌زمان کافی نیست. سیستم به جای نمایش صفر یا ±۱ ساختگی، همبستگی را ناموجود نگه می‌دارد.`;
  }

  const c7Magnitude = Math.abs(signal.correlation7D ?? 0);
  const c30Magnitude = Math.abs(signal.correlation30D ?? 0);
  if (c7Magnitude < 0.1 && c30Magnitude < 0.2) {
    return `${pair}: رابطه فعلی از نظر آماری ضعیف است؛ در این شرایط نباید از همبستگی نتیجه جهت‌دار گرفت. برداشت درست، جدایی نسبی یا ناپایداری رابطه است.`;
  }
  if (c7Magnitude < 0.2 && c30Magnitude < 0.35) {
    return `${pair}: همبستگی ۷ روزه ${signed(signal.correlation7D)} و ۳۰ روزه ${signed(signal.correlation30D)} است؛ شدت روایت پایین نگه داشته می‌شود چون رابطه هنوز محکم نیست.`;
  }
  if (!signal.narrativeAllowed) {
    return `${pair}: مقدار همبستگی معتبر فعلی کمتر از ۰٫۲۰ است؛ موتور از برداشت جهت‌دار خودداری می‌کند و رابطه را ضعیف یا جداشده می‌خواند.`;
  }

  if (pair === "BTC ↔ DXY" && (signal.correlation24H ?? 0) > 0.35) {
    return `رابطه کوتاه‌مدت BTC/DXY در ۲۴ ساعت اخیر مثبت شده (${signed(signal.correlation24H)}) و با رابطه معکوس معمول بازار هم‌خوان نیست. یعنی فشار دلار فعلاً باید با احتیاط و کنار قیمت و نقدینگی خوانده شود.`;
  }

  if (pair === "BTC ↔ DXY") {
    return `همبستگی ۷ روزه BTC/DXY برابر ${signed(signal.correlation7D)} و ۳۰ روزه ${signed(signal.correlation30D)} است. هرچه این رابطه منفی‌تر و پایدارتر شود، تقویت دلار با احتمال بیشتری به فشار نقدینگی روی BTC، ETH و SOL منتقل می‌شود.`;
  }

  if (pair === "BTC ↔ Nasdaq") {
    return `همبستگی BTC/Nasdaq در ۷ روز ${signed(signal.correlation7D)} و در ۳۰ روز ${signed(signal.correlation30D)} است. اگر این رابطه مثبت بماند و Nasdaq ضعیف شود، BTC بیشتر از کانال risk-on/risk-off سهام فناوری آسیب می‌بیند.`;
  }

  if (pair === "BTC ↔ Gold") {
    return `همبستگی BTC/Gold در ۷ روز ${signed(signal.correlation7D)} است. تقویت این رابطه می‌تواند نشانه تغییر روایت به سمت hedge macro باشد، اما فقط وقتی معتبرتر است که DXY و US10Y هم‌زمان فشار شدید نسازند.`;
  }

  if (pair.includes("US10Y")) {
    return `${pair}: همبستگی ۷ روزه ${signed(signal.correlation7D)} است. رابطه منفی‌تر با بازده اوراق یعنی حساسیت کریپتو به نرخ تنزیل بیشتر شده و برای خنثی شدن آن جریان نقدینگی قوی‌تری لازم است.`;
  }

  if (pair === "BTC ↔ Stablecoin Market Cap") {
    return `رابطه BTC با ارزش بازار استیبل‌کوین‌ها در ۷ روز ${signed(signal.correlation7D)} و در ۳۰ روز ${signed(signal.correlation30D)} است. رابطه مثبت و پایدار یعنی نقدینگی استیبل‌کوین بهتر از حرکت قیمت پشتیبانی می‌کند؛ رابطه ضعیف یعنی تأیید نقدینگی هنوز کامل نیست.`;
  }

  return `${pair}: همبستگی ۲۴ ساعته ${signed(signal.correlation24H)}، ۷ روزه ${signed(signal.correlation7D)} و ۳۰ روزه ${signed(signal.correlation30D)} است. تفسیر فقط از سری‌های تاریخی واقعی موجود ساخته شده است.`;
}

function regimeImpact(pair: string, signal: CorrelationSignal) {
  if (signal.status !== "available") return "اثر رژیمی نامعتبر است؛ سری زمانی کافی برای این رابطه وجود ندارد.";
  if (signal.correlation7D !== null && Math.abs(signal.correlation7D) < 0.2) return "اثر رژیمی ضعیف است؛ سیستم از نتیجه جهت‌دار درباره این رابطه خودداری می‌کند.";
  if (signal.correlation7D !== null && signal.correlation30D !== null && Math.abs(signal.correlation7D - signal.correlation30D) > 0.6) return "اختلاف شدید پنجره ۷ و ۳۰ روزه نشانه شکست رابطه قبلی است.";
  if (pair === "BTC ↔ Nasdaq" && (signal.correlation7D ?? 0) > 0.35) return "BTC در معرض کانال risk-on/risk-off سهام فناوری است.";
  if (pair === "BTC ↔ DXY" && (signal.correlation7D ?? 0) < -0.35) return "کانال دلار فعال است و رشد DXY می‌تواند برای BTC، ETH و SOL فشارزا باشد.";
  if (pair === "BTC ↔ Gold" && (signal.correlation7D ?? 0) > 0.35) return "روایت پوشش ریسک کلان تقویت شده، اما با نرخ و دلار باید راستی‌آزمایی شود.";
  return "اثر رژیمی متوسط است و باید کنار نقدینگی، نوسان و جریان سرمایه تفسیر شود.";
}

function dataQualityFromReport(validPairs: number): DataSourceStatus {
  if (validPairs >= 6) return "partial_live";
  if (validPairs >= 3) return "delayed";
  return "unavailable";
}

export function buildCorrelationSignal(definition: (typeof pairDefinitions)[number]): CorrelationSignal {
  const c24 = correlationForWindow(definition.left, definition.right, "24h");
  const c7 = correlationForWindow(definition.left, definition.right, "7d");
  const c30 = correlationForWindow(definition.left, definition.right, "30d");
  const c90 = correlationForWindow(definition.left, definition.right, "90d");
  const windows = { "24h": c24, "7d": c7, "30d": c30, "90d": c90 };
  const windowIntegrity = {
    "24h": c24.meta,
    "7d": c7.meta,
    "30d": c30.meta,
    "90d": c90.meta,
  };
  const previous90D = previousCorrelationForWindow(definition.left, definition.right, "90d");
  const correlationChange = c7.value !== null && c30.value !== null ? Number((c7.value - c30.value).toFixed(2)) : null;
  const status = pairStatus(windows);
  const sample30 = sampleForWindow(definition.left, definition.right, "30d");
  const baseSignal = {
    assetPair: definition.label,
    left: definition.left,
    right: definition.right,
    correlation24H: c24.value,
    previous24H: previousCorrelationForWindow(definition.left, definition.right, "24h"),
    correlation7D: c7.value,
    correlation30D: c30.value,
    correlation90D: c90.value,
    previous90D,
    correlationChange,
    sampleSizes: { "24h": c24.sampleSize, "7d": c7.sampleSize, "30d": c30.sampleSize, "90d": c90.sampleSize },
    windowIntegrity,
    status,
    source: sourceText(definition.left, definition.right),
  };
  const state = detectCorrelationState(baseSignal);
  const coverage = correlationCoverageForPair({ left: definition.left, right: definition.right, windows });
  const volatilityAdjusted30D =
    c30.value === null
      ? null
      : volatilityAdjustedCorrelation(sample30.map((item) => item.left), sample30.map((item) => item.right), c30.value);
  const beta30D =
    c30.value === null
      ? null
      : betaAdjustedRelationship(sample30.map((item) => item.left), sample30.map((item) => item.right));
  const stabilityScore = calculateStabilityScore(windows);
  const structuralBreak = hasStructuralBreak(baseSignal);
  const confidence = capCorrelationConfidenceByStrength(
    capCorrelationConfidenceByCoverage(
      pairConfidence({ left: definition.left, right: definition.right, windows, stabilityScore, structuralBreak }),
      Math.min(coverage.coverage, historyCoverageFactorForPair({ left: definition.left, right: definition.right, windows })),
    ),
    windows,
    stabilityScore,
  );
  const selected = c7.value ?? c30.value ?? c24.value;
  const narrativeAllowed = status === "available" && expectedWindowsHaveCoverage(definition.left, definition.right, windows) && selected !== null && Math.abs(selected) >= 0.3;
  const leadLag = leadLagAnalysis(definition.left, definition.right, definition.label);
  const signal: CorrelationSignal = {
    ...baseSignal,
    state,
    volatilityAdjusted30D,
    beta30D,
    stabilityScore,
    structuralBreak,
    regimeChannel: regimeChannel(definition.label, { correlation7D: c7.value, correlation30D: c30.value, state }),
    narrativeAllowed,
    statisticalStrength: statisticalStrength(selected, Math.max(c24.sampleSize, c7.sampleSize, c30.sampleSize, c90.sampleSize)),
    leadLag,
    confidence,
    coveragePercent: coverage.coverage,
    interpretation: "",
    regimeImpact: "",
    dataQuality: status === "available" ? "partial_live" : "unavailable",
    lastUpdatedAt: getEngineLastUpdatedAt(),
  };

  return {
    ...signal,
    interpretation: pairInterpretation(definition.label, signal),
    regimeImpact: regimeImpact(definition.label, signal),
  };
}

export function getCorrelationSignals() {
  return pairDefinitions.map(buildCorrelationSignal);
}

export function getCorrelationMatrix() {
  const assets: SeriesKey[] = ["BTC", "ETH", "SOL", "DXY", "Gold", "Nasdaq", "US10Y", "Stablecoin Market Cap"];

  return assets.map((row) => ({
    asset: row,
    values: assets.map((column) => {
      if (row === column) {
        const returns = buildTimestampedReturnSeries(row, "daily");
        return returns.length >= minimumSamples["30d"] ? 1 : null;
      }
      return correlationForWindow(row, column, "30d").value;
    }),
  }));
}

function legacyPair(signal: CorrelationSignal, id: string): CorrelationPair {
  const sampleSizes = signal.sampleSizes ?? { "24h": 0, "7d": 0, "30d": 0, "90d": 0 };
  const sampleWarning = Object.entries(sampleSizes)
    .filter(([window, sample]) => sample < minimumSamples[window as CorrelationWindow])
    .map(([window, sample]) => `${window}: ${sample}/${minimumSamples[window as CorrelationWindow]}`)
    .join("، ");

  return {
    id,
    pair: signal.assetPair,
    left: signal.left as AssetSymbol,
    right: signal.right,
    rolling7d: signal.correlation7D,
    rolling24h: signal.correlation24H,
    rolling30d: signal.correlation30D,
    rolling90d: signal.correlation90D,
    change7d: signal.correlationChange,
    sampleSize: Math.max(...Object.values(sampleSizes)),
    sampleWarning: sampleWarning || undefined,
    windowIntegrity: signal.windowIntegrity,
    regimeState: signal.state,
    interpretationFa: signal.interpretation,
    regimeImpact: signal.regimeImpact,
    volatilityAdjusted30D: signal.volatilityAdjusted30D,
    beta30D: signal.beta30D,
    stabilityScore: signal.stabilityScore,
    structuralBreak: signal.structuralBreak,
    regimeChannel: signal.regimeChannel,
    narrativeAllowed: signal.narrativeAllowed,
    statisticalStrength: signal.statisticalStrength,
    leadLag: signal.leadLag,
    confidence: signal.confidence,
    coveragePercent: signal.coveragePercent,
    dataQuality: signal.dataQuality,
    status: signal.status,
    source: signal.source,
  };
}

function selectedCorrelation(signal: CorrelationSignal) {
  return signal.correlation7D ?? signal.correlation30D ?? signal.correlation24H;
}

function weightedAverage(values: Array<{ value: number; weight: number }>) {
  const totalWeight = values.reduce((sum, item) => sum + item.weight, 0);
  if (!totalWeight) return null;
  return values.reduce((sum, item) => sum + item.value * item.weight, 0) / totalWeight;
}

function calculateCorrelationCoverage(signals: CorrelationSignal[]) {
  const requiredPairs = pairDefinitions.length;
  const validPairs = signals.filter((signal) => signal.status === "available").length;
  const expectedWindowCount = signals.reduce((sum, signal) => sum + expectedWindowsForPair(signal.left as SeriesKey, signal.right as SeriesKey).length, 0);
  const validWindowCount = signals.reduce((sum, signal) => {
    const integrity = signal.windowIntegrity;
    if (!integrity) return sum;
    return sum + expectedWindowsForPair(signal.left as SeriesKey, signal.right as SeriesKey).filter((window) => integrity[window]?.status === "available").length;
  }, 0);
  const historicalDepth =
    expectedWindowCount === 0
      ? 0
      : signals.reduce((sum, signal) => {
          const integrity = signal.windowIntegrity;
          if (!integrity) return sum;
          return (
            sum +
            expectedWindowsForPair(signal.left as SeriesKey, signal.right as SeriesKey).reduce((inner, window) => {
              const meta = integrity[window];
              return inner + Math.min(1, (meta?.observationsUsed ?? 0) / minimumSamples[window]);
            }, 0)
          );
        }, 0) / expectedWindowCount;
  const alignmentQuality = expectedWindowCount ? validWindowCount / expectedWindowCount : 0;
  const pairCoverage = requiredPairs ? validPairs / requiredPairs : 0;
  const coverage = clampPercent(pairCoverage * historicalDepth * alignmentQuality * 100);

  return {
    coverage,
    validPairs,
    requiredPairs,
    historicalDepth: Number((historicalDepth * 100).toFixed(1)),
    alignmentQuality: Number((alignmentQuality * 100).toFixed(1)),
    validWindows: validWindowCount,
    requiredWindows: expectedWindowCount,
  };
}

function crossMarketInterpretation(signals: CorrelationSignal[]) {
  const btcNasdaq = signals.find((signal) => signal.assetPair === "BTC ↔ Nasdaq");
  const btcDxy = signals.find((signal) => signal.assetPair === "BTC ↔ DXY");
  const btcGold = signals.find((signal) => signal.assetPair === "BTC ↔ Gold");
  const btcEth = signals.find((signal) => signal.assetPair === "BTC ↔ ETH");

  if (![btcNasdaq, btcDxy, btcGold, btcEth].some((signal) => signal?.status === "available" && signal.narrativeAllowed)) {
    return "برای تفسیر رژیم همبستگی، سری‌های تاریخی کافی وجود ندارد؛ سیستم از تولید روایت جهت‌دار خودداری می‌کند.";
  }

  const lines: string[] = [];
  if (btcNasdaq?.narrativeAllowed && btcNasdaq.correlation7D !== null && btcNasdaq.correlation7D !== undefined && Math.abs(btcNasdaq.correlation7D) >= 0.2) {
    lines.push(
      btcNasdaq.correlation7D > 0
        ? "BTC با Nasdaq هم‌جهت شده و کانال risk-on/risk-off سهام فناوری برای بیت‌کوین فعال‌تر است."
        : "BTC از Nasdaq فاصله گرفته و فعلاً نمی‌توان رفتار آن را فقط tech-beta دانست.",
    );
  }
  if (btcDxy?.narrativeAllowed && btcDxy.correlation7D !== null && btcDxy.correlation7D !== undefined && Math.abs(btcDxy.correlation7D) >= 0.2) {
    lines.push(
      btcDxy.correlation7D < 0
        ? "رابطه معکوس BTC و DXY فعال است؛ قدرت گرفتن دلار می‌تواند فشار کوتاه‌مدت روی کریپتو را تشدید کند."
        : "BTC/DXY در کوتاه‌مدت خلاف رابطه معکوس معمول حرکت کرده و فشار دلار باید با احتیاط تفسیر شود.",
    );
  }
  if (btcGold?.narrativeAllowed && btcGold.correlation7D !== null && btcGold.correlation7D !== undefined && Math.abs(btcGold.correlation7D) >= 0.2) {
    lines.push(
      btcGold.correlation7D > 0
        ? "هم‌جهتی BTC با Gold تقویت شده و روایت hedge macro ارزش بررسی دارد."
        : "BTC از Gold فاصله گرفته و فعلاً روایت پناهگاه امن برای آن تأیید قوی نمی‌گیرد.",
    );
  }
  if (btcEth?.narrativeAllowed && btcEth.correlation7D !== null && btcEth.correlation7D !== undefined && btcEth.correlation7D >= 0.7) {
    lines.push("همبستگی BTC و ETH بالا است؛ تنوع‌بخشی بین این دو در این پنجره محدودتر شده است.");
  }

  return lines.length ? lines.join(" ") : "همبستگی‌های معتبر فعلی شدت کافی برای روایت جهت‌دار ندارند؛ بازار در حالت decoupling یا رابطه‌های ضعیف قرار دارد.";
}

export function getDynamicCorrelationReport() {
  const signals = getCorrelationSignals();
  const validSignals = signals.filter((signal) => signal.status === "available");
  const validScoreInputs = validSignals
    .map((signal) => {
      const definition = pairDefinitions.find((pair) => pair.label === signal.assetPair);
      const selected = selectedCorrelation(signal);
      return selected === null || selected === undefined ? null : { value: Math.abs(selected) * 100, weight: definition?.importance ?? 0.75 };
    })
    .filter((item): item is { value: number; weight: number } => Boolean(item));
  const engineScoreRaw = weightedAverage(validScoreInputs);
  const confidenceInputs = validSignals
    .filter((signal) => typeof signal.confidence === "number")
    .map((signal) => {
      const definition = pairDefinitions.find((pair) => pair.label === signal.assetPair);
      return { value: signal.confidence ?? 0, weight: definition?.importance ?? 0.75 };
    });
  const engineConfidenceRaw = weightedAverage(confidenceInputs);
  const validPairs = validSignals.length;
  const requiredPairs = pairDefinitions.length;
  const coverage = calculateCorrelationCoverage(signals);
  const engineConfidence =
    engineConfidenceRaw === null ? null : capCorrelationConfidenceByCoverage(clampPercent(engineConfidenceRaw), coverage.coverage);
  const engineStatus = validPairs >= 6 && coverage.coverage >= 60 ? "connected" : "degraded";
  const engineReason =
    validPairs === 0
      ? "insufficient valid time series"
      : validPairs < 6
        ? `only ${validPairs}/${requiredPairs} correlation pairs have enough observations`
        : coverage.coverage < 60
          ? `${validPairs}/${requiredPairs} pairs have usable short-window data, but historical coverage is only ${coverage.coverage}%`
        : `${validPairs}/${requiredPairs} correlation pairs are available`;

  return {
    generatedAt: new Date().toISOString(),
    lastUpdatedAt: getEngineLastUpdatedAt(),
    dataQuality: dataQualityFromReport(validPairs),
    signals,
    validPairs,
    requiredPairs,
    correlationCoverage: coverage.coverage,
    coverageBreakdown: {
      validPairs: coverage.validPairs,
      requiredPairs: coverage.requiredPairs,
      historicalDepth: coverage.historicalDepth,
      alignmentQuality: coverage.alignmentQuality,
      validWindows: coverage.validWindows,
      requiredWindows: coverage.requiredWindows,
    },
    engineScore: engineScoreRaw === null ? null : Number(engineScoreRaw.toFixed(1)),
    engineConfidence,
    engineStatus,
    engineReason,
    correlationTable: signals.map((signal) => ({
      pair: signal.assetPair,
      correlation24h: signal.correlation24H,
      correlation7d: signal.correlation7D,
      correlation30d: signal.correlation30D,
      correlation90d: signal.correlation90D,
      volatilityAdjusted30d: signal.volatilityAdjusted30D,
      beta30d: signal.beta30D,
      stabilityScore: signal.stabilityScore,
      structuralBreak: signal.structuralBreak,
      regimeChannel: signal.regimeChannel,
      narrativeAllowed: signal.narrativeAllowed,
      statisticalStrength: signal.statisticalStrength,
      leadLag: signal.leadLag,
      observations: {
        "24h": signal.sampleSizes?.["24h"] ?? 0,
        "7d": signal.sampleSizes?.["7d"] ?? 0,
        "30d": signal.sampleSizes?.["30d"] ?? 0,
        "90d": signal.sampleSizes?.["90d"] ?? 0,
      },
      requiredSamples: {
        "24h": signal.windowIntegrity?.["24h"]?.minimumObservations ?? minimumSamples["24h"],
        "7d": signal.windowIntegrity?.["7d"]?.minimumObservations ?? minimumSamples["7d"],
        "30d": signal.windowIntegrity?.["30d"]?.minimumObservations ?? minimumSamples["30d"],
        "90d": signal.windowIntegrity?.["90d"]?.minimumObservations ?? minimumSamples["90d"],
      },
      coverageByWindow: {
        "24h": signal.windowIntegrity?.["24h"]?.coveragePercent ?? 0,
        "7d": signal.windowIntegrity?.["7d"]?.coveragePercent ?? 0,
        "30d": signal.windowIntegrity?.["30d"]?.coveragePercent ?? 0,
        "90d": signal.windowIntegrity?.["90d"]?.coveragePercent ?? 0,
      },
      windowIntegrity: signal.windowIntegrity,
      source: signal.source ?? "منبع ناموجود",
      status: signal.status ?? "insufficient_data",
      confidence: signal.confidence,
      coveragePercent: signal.coveragePercent,
    })),
    topStrengthening: [...validSignals].sort((a, b) => (b.correlationChange ?? -Infinity) - (a.correlationChange ?? -Infinity)).slice(0, 3),
    topWeakening: [...validSignals].sort((a, b) => (a.correlationChange ?? Infinity) - (b.correlationChange ?? Infinity)).slice(0, 3),
    breakdownAlerts: validSignals
      .filter((signal) => {
        if (signal.correlation7D === null || signal.correlation30D === null) return false;
        return signal.structuralBreak || Math.abs(signal.correlation7D - signal.correlation30D) > 0.6 || (Math.sign(signal.correlation7D) !== Math.sign(signal.correlation30D) && Math.abs(signal.correlation7D) > 0.35 && Math.abs(signal.correlation30D) > 0.35);
      })
      .map((signal) => ({
        pair: signal.assetPair,
        change: signal.correlationChange,
        interpretation: signal.regimeImpact,
        traderInterpretation: signal.regimeImpact,
      })),
    pairs: signals.map((signal, index) => legacyPair(signal, pairDefinitions[index].id)),
    matrix: getCorrelationMatrix(),
    interpretationFa: crossMarketInterpretation(signals),
  };
}
