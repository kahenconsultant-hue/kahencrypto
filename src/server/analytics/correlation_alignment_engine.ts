import type { SeriesKey } from "@/server/analytics/market-signals";
import { getLatestMarketSnapshotsSync } from "@/storage/ingestion-store";
import type { MarketSnapshotInput } from "@/types/ingestion";

type CorrelationWindow = "24h" | "7d" | "30d" | "90d";
type AlignmentSeriesKey = Extract<SeriesKey, "BTC" | "ETH" | "SOL" | "DXY" | "Gold" | "Nasdaq" | "US10Y" | "Stablecoin Market Cap">;

export type AlignedCorrelationPoint = {
  day: string;
  leftReturn: number;
  rightReturn: number;
  leftValue: number;
  rightValue: number;
  rightForwardFilled: boolean;
};

export type CorrelationAlignmentDataset = {
  pairId: string;
  label: string;
  left: AlignmentSeriesKey;
  right: AlignmentSeriesKey;
  points: AlignedCorrelationPoint[];
  legacyExactPoints: number;
  availableSamples: number;
  requiredSamples: Record<Extract<CorrelationWindow, "7d" | "30d" | "90d">, number>;
  coveragePercentByWindow: Record<Extract<CorrelationWindow, "7d" | "30d" | "90d">, number>;
  lastAlignedDay: string | null;
  sourcePair: string;
};

type SnapshotMetricRow = {
  asset?: string | null;
  metric?: string | null;
  value?: number | null;
};

type DailyClosePoint = {
  day: string;
  timestamp: string;
  value: number;
};

type AlignedLevelPoint = {
  day: string;
  left: DailyClosePoint;
  right: DailyClosePoint;
  rightForwardFilled: boolean;
};

export const alignmentTargetPairs: Array<{ id: string; label: string; left: AlignmentSeriesKey; right: AlignmentSeriesKey }> = [
  { id: "btc-dxy", label: "BTC ↔ DXY", left: "BTC", right: "DXY" },
  { id: "btc-gold", label: "BTC ↔ Gold", left: "BTC", right: "Gold" },
  { id: "btc-nasdaq", label: "BTC ↔ Nasdaq", left: "BTC", right: "Nasdaq" },
  { id: "btc-us10y", label: "BTC ↔ US10Y", left: "BTC", right: "US10Y" },
  { id: "eth-dxy", label: "ETH ↔ DXY", left: "ETH", right: "DXY" },
  { id: "eth-nasdaq", label: "ETH ↔ Nasdaq", left: "ETH", right: "Nasdaq" },
  { id: "sol-nasdaq", label: "SOL ↔ Nasdaq", left: "SOL", right: "Nasdaq" },
];

const snapshotMetricPreferences: Partial<Record<AlignmentSeriesKey, string[]>> = {
  BTC: ["price_usd", "price_trend_24h_pct"],
  ETH: ["price_usd", "price_trend_24h_pct"],
  SOL: ["price_usd", "price_trend_24h_pct"],
  DXY: ["price_trend_24h_pct"],
  US10Y: ["yield_change_pct_point"],
  Nasdaq: ["price_trend_24h_pct"],
  Gold: ["price_trend_24h_pct"],
  "Stablecoin Market Cap": ["total_stablecoin_market_cap_usd", "market_cap_change_7d_pct"],
};

const dailyRequiredSamples: Record<Extract<CorrelationWindow, "7d" | "30d" | "90d">, number> = {
  "7d": 5,
  "30d": 20,
  "90d": 60,
};

const dailyWindowSamples: Record<Extract<CorrelationWindow, "7d" | "30d" | "90d">, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

const alignmentCache = new Map<string, { expiresAt: number; dataset: CorrelationAlignmentDataset }>();
const ALIGNMENT_CACHE_TTL_MS = 30_000;

function rollingCorrelationValue(left: number[], right: number[]) {
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

function utcDay(timestamp: string) {
  return timestamp.slice(0, 10);
}

function dayTimestamp(day: string) {
  return `${day}T23:59:59.000Z`;
}

function isWeekendDay(day: string) {
  const date = new Date(`${day}T00:00:00.000Z`);
  const weekday = date.getUTCDay();
  return weekday === 0 || weekday === 6;
}

function dayDiff(left: string, right: string) {
  return Math.round((Date.parse(`${right}T00:00:00.000Z`) - Date.parse(`${left}T00:00:00.000Z`)) / 86_400_000);
}

function addDays(day: string, offset: number) {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

function hasMissingWeekdayBetween(previousDay: string, currentDay: string) {
  const diff = dayDiff(previousDay, currentDay);
  if (diff <= 1) return false;
  for (let offset = 1; offset < diff; offset += 1) {
    if (!isWeekendDay(addDays(previousDay, offset))) return true;
  }
  return false;
}

function isMacroSeries(key: AlignmentSeriesKey) {
  return key === "DXY" || key === "Gold" || key === "Nasdaq" || key === "US10Y";
}

function snapshotMetrics(snapshot: MarketSnapshotInput): SnapshotMetricRow[] {
  const payload = snapshot.payload as { metrics?: unknown[] } | undefined;
  return (payload?.metrics ?? [])
    .map((item) => (typeof item === "object" && item !== null ? (item as SnapshotMetricRow) : null))
    .filter((item): item is SnapshotMetricRow => Boolean(item));
}

function seriesAssetMatches(key: AlignmentSeriesKey, metric: SnapshotMetricRow) {
  if (key === "Stablecoin Market Cap") return metric.asset === "Stablecoins";
  return metric.asset === key;
}

function valueForSnapshotSeries(key: AlignmentSeriesKey, snapshot: MarketSnapshotInput) {
  const preferences = snapshotMetricPreferences[key] ?? [];
  const metrics = snapshotMetrics(snapshot).filter((metric) => seriesAssetMatches(key, metric) && typeof metric.value === "number" && Number.isFinite(metric.value));
  for (const metricName of preferences) {
    const match = metrics.find((metric) => metric.metric === metricName);
    if (match && typeof match.value === "number") return match.value;
  }
  return null;
}

function buildDailyCloseSeries(key: AlignmentSeriesKey, snapshots: MarketSnapshotInput[]) {
  const byDay = new Map<string, DailyClosePoint>();
  for (const snapshot of snapshots) {
    const value = valueForSnapshotSeries(key, snapshot);
    if (value === null) continue;
    if (!Number.isFinite(Date.parse(snapshot.observedAt))) continue;
    const day = utcDay(snapshot.observedAt);
    const previous = byDay.get(day);
    if (!previous || Date.parse(snapshot.observedAt) >= Date.parse(previous.timestamp)) {
      byDay.set(day, { day, timestamp: snapshot.observedAt, value });
    }
  }
  return Array.from(byDay.values()).sort((left, right) => left.day.localeCompare(right.day));
}

function returnValue(previous: number, current: number) {
  if (previous > 0 && current > 0) return Number(Math.log(current / previous).toFixed(6));
  if (previous !== 0) return Number(((current - previous) / Math.abs(previous)).toFixed(6));
  return null;
}

function buildAlignedLevels(left: AlignmentSeriesKey, right: AlignmentSeriesKey, snapshots: MarketSnapshotInput[]) {
  const leftSeries = buildDailyCloseSeries(left, snapshots);
  const rightSeries = buildDailyCloseSeries(right, snapshots);
  const leftByDay = new Map(leftSeries.map((point) => [point.day, point]));
  const rightByDay = new Map(rightSeries.map((point) => [point.day, point]));
  const allDays = Array.from(new Set([...leftSeries.map((point) => point.day), ...rightSeries.map((point) => point.day)])).sort();
  const aligned: AlignedLevelPoint[] = [];
  let latestRight: DailyClosePoint | null = null;

  for (const day of allDays) {
    const directRight = rightByDay.get(day);
    if (directRight) latestRight = directRight;
    const leftPoint = leftByDay.get(day);
    if (!leftPoint) continue;

    let rightPoint = directRight ?? null;
    let rightForwardFilled = false;
    if (!rightPoint && isMacroSeries(right) && isWeekendDay(day) && latestRight) {
      rightPoint = { ...latestRight, day, timestamp: dayTimestamp(day) };
      rightForwardFilled = true;
    }
    if (!rightPoint) continue;
    aligned.push({ day, left: leftPoint, right: rightPoint, rightForwardFilled });
  }

  return aligned;
}

function buildAlignedReturnPoints(left: AlignmentSeriesKey, right: AlignmentSeriesKey, snapshots: MarketSnapshotInput[]) {
  const levels = buildAlignedLevels(left, right, snapshots);
  const points: AlignedCorrelationPoint[] = [];
  for (let index = 1; index < levels.length; index += 1) {
    const previous = levels[index - 1];
    const current = levels[index];
    if (hasMissingWeekdayBetween(previous.day, current.day)) continue;
    const leftReturn = returnValue(previous.left.value, current.left.value);
    const rightReturn = returnValue(previous.right.value, current.right.value);
    if (leftReturn === null || rightReturn === null) continue;
    points.push({
      day: current.day,
      leftReturn,
      rightReturn,
      leftValue: current.left.value,
      rightValue: current.right.value,
      rightForwardFilled: current.rightForwardFilled,
    });
  }
  return points;
}

function legacyExactDailyReturnPoints(left: AlignmentSeriesKey, right: AlignmentSeriesKey, snapshots: MarketSnapshotInput[]) {
  const buildReturns = (key: AlignmentSeriesKey) => {
    const values = buildDailyCloseSeries(key, snapshots).filter((point) => !isWeekendDay(point.day));
    const returns: Array<{ day: string; value: number }> = [];
    for (let index = 1; index < values.length; index += 1) {
      const value = returnValue(values[index - 1].value, values[index].value);
      if (value !== null) returns.push({ day: values[index].day, value });
    }
    return returns;
  };
  const leftReturns = buildReturns(left);
  const rightByDay = new Map(buildReturns(right).map((point) => [point.day, point.value]));
  return leftReturns.filter((point) => typeof rightByDay.get(point.day) === "number").length;
}

function coveragePct(availableSamples: number, window: Extract<CorrelationWindow, "7d" | "30d" | "90d">) {
  return Math.round(Math.min(1, availableSamples / dailyRequiredSamples[window]) * 100);
}

export function buildCorrelationAlignmentDataset(left: SeriesKey, right: SeriesKey): CorrelationAlignmentDataset | null {
  if (!snapshotMetricPreferences[left as AlignmentSeriesKey] || !snapshotMetricPreferences[right as AlignmentSeriesKey]) return null;
  const leftKey = left as AlignmentSeriesKey;
  const rightKey = right as AlignmentSeriesKey;
  const cacheKey = `${leftKey}:${rightKey}`;
  const cached = alignmentCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.dataset;

  const snapshots = getLatestMarketSnapshotsSync(8_000);
  const target = alignmentTargetPairs.find((pair) => pair.left === leftKey && pair.right === rightKey);
  const points = buildAlignedReturnPoints(leftKey, rightKey, snapshots);
  const dataset: CorrelationAlignmentDataset = {
    pairId: target?.id ?? `${leftKey.toLowerCase()}-${rightKey.toLowerCase().replace(/\s+/g, "-")}`,
    label: target?.label ?? `${leftKey} ↔ ${rightKey}`,
    left: leftKey,
    right: rightKey,
    points,
    legacyExactPoints: legacyExactDailyReturnPoints(leftKey, rightKey, snapshots),
    availableSamples: points.length,
    requiredSamples: { ...dailyRequiredSamples },
    coveragePercentByWindow: {
      "7d": coveragePct(Math.min(points.length, dailyWindowSamples["7d"]), "7d"),
      "30d": coveragePct(Math.min(points.length, dailyWindowSamples["30d"]), "30d"),
      "90d": coveragePct(Math.min(points.length, dailyWindowSamples["90d"]), "90d"),
    },
    lastAlignedDay: points.at(-1)?.day ?? null,
    sourcePair: "UTC daily close alignment from persisted market_snapshots",
  };
  alignmentCache.set(cacheKey, { expiresAt: Date.now() + ALIGNMENT_CACHE_TTL_MS, dataset });
  return dataset;
}

export function getAlignedReturnSample(left: SeriesKey, right: SeriesKey, window: Extract<CorrelationWindow, "7d" | "30d" | "90d">) {
  const dataset = buildCorrelationAlignmentDataset(left, right);
  if (!dataset) return null;
  return {
    dataset,
    sample: dataset.points.slice(-dailyWindowSamples[window]).map((point) => ({ bucket: point.day, left: point.leftReturn, right: point.rightReturn })),
  };
}

export function buildCorrelationAlignmentSnapshots(runId?: string): MarketSnapshotInput[] {
  const observedAt = new Date().toISOString();
  return alignmentTargetPairs.map((pair) => {
    const dataset = buildCorrelationAlignmentDataset(pair.left, pair.right);
    return {
      runId,
      snapshotKey: `correlation_alignment:${pair.id}`,
      asset: pair.left,
      metricSet: "correlation_aligned_daily_series",
      sourceType: dataset?.availableSamples ? "derived" : "unavailable",
      quality: dataset?.availableSamples ? "partial_live" : "unavailable",
      freshnessStatus: dataset?.availableSamples ? "fresh" : "unavailable",
      sourceIds: ["market_snapshots", "correlation_alignment_engine"],
      metricCount: dataset?.availableSamples ?? 0,
      observedAt,
      payload: {
        pairId: pair.id,
        label: pair.label,
        left: pair.left,
        right: pair.right,
        availableSamples: dataset?.availableSamples ?? 0,
        legacyExactPoints: dataset?.legacyExactPoints ?? 0,
        requiredSamples: dataset?.requiredSamples ?? dailyRequiredSamples,
        coveragePercentByWindow: dataset?.coveragePercentByWindow ?? { "7d": 0, "30d": 0, "90d": 0 },
        lastAlignedDay: dataset?.lastAlignedDay ?? null,
        points: dataset?.points.slice(-180) ?? [],
      },
    };
  });
}

export function buildCorrelationAlignmentAudit() {
  const rows = alignmentTargetPairs.map((pair) => {
    const dataset = buildCorrelationAlignmentDataset(pair.left, pair.right);
    const sample30 = dataset?.points.slice(-dailyWindowSamples["30d"]) ?? [];
    const correlation30d = sample30.length >= dailyRequiredSamples["30d"] ? rollingCorrelationValue(sample30.map((point) => point.leftReturn), sample30.map((point) => point.rightReturn)) : null;
    return {
      pair: pair.label,
      coverageBefore: dataset ? coveragePct(Math.min(dataset.legacyExactPoints, dailyWindowSamples["30d"]), "30d") : 0,
      coverageAfter: dataset?.coveragePercentByWindow["30d"] ?? 0,
      legacyUsableObservations: dataset?.legacyExactPoints ?? 0,
      alignedUsableObservations: dataset?.availableSamples ?? 0,
      latestAlignedDay: dataset?.lastAlignedDay ?? null,
      correlation30d,
      confidence:
        dataset && correlation30d !== null
          ? Math.min(dataset.coveragePercentByWindow["30d"], Math.abs(correlation30d) < 0.1 ? 45 : Math.abs(correlation30d) < 0.2 ? 60 : 100)
          : null,
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    rows,
  };
}
