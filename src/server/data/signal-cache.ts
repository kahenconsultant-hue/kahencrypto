import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { DataPoint, SignalGroup } from "@/lib/types";
import { fetchCurrentDataPoints, requiredSignalKeys } from "@/server/data/adapters";
import { getLatestSharedSignalCache, persistSharedSignalCache, type SharedSignalCachePayload } from "@/storage/ingestion-store";

export const SIGNAL_CACHE_TTL_MINUTES = 30;
const SIGNAL_CACHE_PATH = process.env.CMIP_SIGNAL_CACHE_PATH ?? join(process.cwd(), ".cache", "cmip", "latest-signals.json");

type CachePayload = {
  generatedAt: string;
  expiresAt: string;
  points: DataPoint[];
  counts?: Record<string, number>;
  retainedPreviousSnapshot?: boolean;
  retentionReason?: string;
};

let memoryPayload: CachePayload | null = null;
let memoryPayloadMtimeMs = 0;
let sharedPayloadHydratedAt = 0;

const CRITICAL_SIGNAL_KEYS = [
  "btc_price_usd",
  "eth_price_usd",
  "sol_price_usd",
  "btc_trend_24h",
  "eth_trend_24h",
  "sol_trend_24h",
  "dxy_trend_24h",
  "us10y_trend_24h",
  "stablecoin_market_cap_7d",
  "btc_etf_flow_24h",
];

const MAX_PREVIOUS_RETENTION_MINUTES = SIGNAL_CACHE_TTL_MINUTES * 6;

function unavailablePoint(key: string, group: SignalGroup): DataPoint {
  return {
    id: key,
    key,
    metric: key,
    value: null,
    previousValue: null,
    changeAbs: null,
    changePct: null,
    timestamp: null,
    source: "C.M.I.P live adapter cache",
    sourceType: "API",
    quality: "unavailable",
    reliability: 0,
    confidenceBase: 0,
    sampleSize: 0,
    group,
    error: "هنوز refresh موفقی برای این منبع ثبت نشده است. مسیر /api/cron/ingest باید اجرا شود یا منبع زنده در دسترس باشد.",
  };
}

const groupByKey: Record<string, SignalGroup> = {
  btc_price_usd: "price",
  eth_price_usd: "price",
  sol_price_usd: "price",
  btc_trend_24h: "price",
  eth_trend_24h: "price",
  sol_trend_24h: "price",
  btc_volume_24h_usd: "liquidity",
  eth_volume_24h_usd: "liquidity",
  sol_volume_24h_usd: "liquidity",
  btc_market_cap: "price",
  eth_market_cap: "price",
  sol_market_cap: "price",
  nasdaq_trend_24h: "macro",
  dxy_trend_24h: "macro",
  us10y_trend_24h: "macro",
  us2y_trend_24h: "macro",
  yield_curve_10y2y: "macro",
  cpi_latest: "macro",
  ppi_latest: "macro",
  fed_funds_rate: "macro",
  unemployment_rate: "macro",
  gold_trend_24h: "macro",
  vix_trend_24h: "volatility",
  usdt_supply_7d: "stablecoins",
  usdt_supply_30d: "stablecoins",
  usdc_supply_7d: "stablecoins",
  usdc_supply_30d: "stablecoins",
  stablecoin_market_cap_7d: "liquidity",
  stablecoin_market_cap_30d: "liquidity",
  total_stablecoin_market_cap_usd: "stablecoins",
  stablecoin_dominance: "stablecoins",
  btc_etf_flow_24h: "flows",
  btc_etf_flow_7d: "flows",
  btc_etf_flow_30d: "flows",
  eth_etf_flow_24h: "flows",
  eth_etf_flow_7d: "flows",
  eth_etf_flow_30d: "flows",
  funding_btc: "leverage",
  funding_eth: "leverage",
  funding_sol: "leverage",
  open_interest_btc_24h: "leverage",
  open_interest_eth_24h: "leverage",
  open_interest_sol_24h: "leverage",
  liquidation_btc_24h: "leverage",
  spot_volume_btc_24h: "liquidity",
  spot_volume_eth_24h: "liquidity",
  spot_volume_sol_24h: "liquidity",
  futures_volume_btc_24h: "leverage",
  futures_volume_eth_24h: "leverage",
  futures_volume_sol_24h: "leverage",
  exchange_reserves_btc_7d: "onchain",
  exchange_inflows: "onchain",
  exchange_outflows: "onchain",
  news_sentiment_macro: "sentiment",
  geopolitical_event_score: "geopolitical",
};

export function buildUnavailableDataPoints(keys = requiredSignalKeys): DataPoint[] {
  return keys.map((key) => unavailablePoint(key, groupByKey[key] ?? "price"));
}

function readPayload(): CachePayload | null {
  try {
    if (!existsSync(SIGNAL_CACHE_PATH)) return memoryPayload;
    const fileMtimeMs = statSync(SIGNAL_CACHE_PATH).mtimeMs;
    if (memoryPayload && memoryPayloadMtimeMs === fileMtimeMs) return memoryPayload;
    if (memoryPayload && memoryPayloadMtimeMs > fileMtimeMs) return memoryPayload;
    memoryPayload = JSON.parse(readFileSync(SIGNAL_CACHE_PATH, "utf8")) as CachePayload;
    memoryPayloadMtimeMs = fileMtimeMs;
    return memoryPayload;
  } catch {
    return memoryPayload;
  }
}

function safeWriteLocalPayload(payload: CachePayload) {
  memoryPayload = payload;
  try {
    mkdirSync(dirname(SIGNAL_CACHE_PATH), { recursive: true });
    writeFileSync(SIGNAL_CACHE_PATH, JSON.stringify(payload, null, 2));
    memoryPayloadMtimeMs = statSync(SIGNAL_CACHE_PATH).mtimeMs;
  } catch {
    memoryPayloadMtimeMs = Date.now();
  }
}

function hasUsableValue(point: DataPoint | undefined) {
  return Boolean(
    point &&
      typeof point.value === "number" &&
      Number.isFinite(point.value) &&
      point.quality !== "unavailable" &&
      point.quality !== "estimated",
  );
}

function countByQuality(points: DataPoint[]) {
  return {
    total: points.length,
    live: points.filter((point) => point.quality === "live").length,
    delayed: points.filter((point) => point.quality === "delayed").length,
    partial_live: points.filter((point) => point.quality === "partial_live").length,
    proxy: points.filter((point) => point.quality === "proxy").length,
    unavailable: points.filter((point) => point.quality === "unavailable").length,
    estimated: points.filter((point) => point.quality === "estimated").length,
  };
}

function payloadQuality(payload: CachePayload | null) {
  const points = payload?.points ?? [];
  const byKey = new Map(points.map((point) => [point.key, point]));
  const generatedAt = payload?.generatedAt ? Date.parse(payload.generatedAt) : NaN;
  const ageMinutes = Number.isFinite(generatedAt) ? Math.max(0, Math.round((Date.now() - generatedAt) / 60_000)) : Number.POSITIVE_INFINITY;
  const usableTotal = points.filter(hasUsableValue).length;
  const usableCritical = CRITICAL_SIGNAL_KEYS.filter((key) => hasUsableValue(byKey.get(key))).length;
  const unavailable = points.filter((point) => point.quality === "unavailable").length;

  return {
    ageMinutes,
    usableTotal,
    usableCritical,
    unavailable,
  };
}

function shouldRetainPreviousSnapshot(candidate: CachePayload, previous: CachePayload | null) {
  if (!previous?.points?.length) return null;

  const previousQuality = payloadQuality(previous);
  const candidateQuality = payloadQuality(candidate);
  if (previousQuality.ageMinutes > MAX_PREVIOUS_RETENTION_MINUTES) return null;

  if (previousQuality.usableCritical >= candidateQuality.usableCritical + 2) {
    return `candidate lost core signal coverage (${candidateQuality.usableCritical}/${CRITICAL_SIGNAL_KEYS.length}) compared with previous snapshot (${previousQuality.usableCritical}/${CRITICAL_SIGNAL_KEYS.length}).`;
  }

  if (previousQuality.usableCritical > 0 && candidateQuality.usableCritical === 0) {
    return "candidate produced no usable core signals while a recent usable snapshot exists.";
  }

  if (previousQuality.usableTotal >= candidateQuality.usableTotal + 8 && candidateQuality.unavailable > previousQuality.unavailable + 8) {
    return `candidate replaced usable signals with unavailable values (${candidateQuality.unavailable} unavailable vs ${previousQuality.unavailable}).`;
  }

  return null;
}

function toCachePayload(payload: SharedSignalCachePayload): CachePayload {
  return {
    generatedAt: payload.generatedAt,
    expiresAt: payload.expiresAt,
    points: payload.points,
    counts: payload.counts,
    retainedPreviousSnapshot: payload.retainedPreviousSnapshot,
    retentionReason: payload.retentionReason,
  };
}

export async function loadSharedSignalCache(force = false) {
  if (!force && memoryPayload?.points?.length && Date.now() - sharedPayloadHydratedAt < 15_000) return memoryPayload;
  const shared = await getLatestSharedSignalCache();
  if (!shared?.points?.length) return memoryPayload;
  const payload = toCachePayload(shared);
  safeWriteLocalPayload(payload);
  sharedPayloadHydratedAt = Date.now();
  return payload;
}

export function getSignalCacheStatusSync() {
  const payload = readPayload();
  const now = Date.now();
  const expiresAt = payload?.expiresAt ? Date.parse(payload.expiresAt) : 0;
  const generatedAt = payload?.generatedAt ? Date.parse(payload.generatedAt) : 0;
  return {
    path: SIGNAL_CACHE_PATH,
    exists: Boolean(payload),
    generatedAt: payload?.generatedAt ?? null,
    expiresAt: payload?.expiresAt ?? null,
    stale: !payload || expiresAt <= now,
    ageMinutes: generatedAt ? Math.max(0, Math.round((now - generatedAt) / 60_000)) : null,
    ttlMinutes: SIGNAL_CACHE_TTL_MINUTES,
  };
}

export function getCachedDataPointsSync(): DataPoint[] {
  const payload = readPayload();
  if (!payload?.points?.length) return buildUnavailableDataPoints();

  const stale = Date.parse(payload.expiresAt) <= Date.now();
  if (!stale) return payload.points;

  return payload.points.map((point) => ({
    ...point,
    quality: point.quality === "live" || point.quality === "partial_live" ? "delayed" : point.quality,
    error: point.error ?? "cache از TTL سی دقیقه عبور کرده است؛ تا refresh بعدی این داده با برچسب delayed استفاده می‌شود.",
  }));
}

export async function refreshSignalCache() {
  const previous = (await loadSharedSignalCache(true)) ?? readPayload();
  const points = await fetchCurrentDataPoints();
  const generatedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + SIGNAL_CACHE_TTL_MINUTES * 60_000).toISOString();
  const candidate: CachePayload = { generatedAt, expiresAt, points, counts: countByQuality(points) };
  const retentionReason = shouldRetainPreviousSnapshot(candidate, previous);
  const payload: CachePayload = retentionReason && previous
    ? {
        ...previous,
        counts: countByQuality(previous.points),
        retainedPreviousSnapshot: true,
        retentionReason,
      }
    : candidate;

  safeWriteLocalPayload(payload);
  const storageMode = await persistSharedSignalCache(payload);
  const counts = payload.counts ?? countByQuality(payload.points);

  return {
    generatedAt: payload.generatedAt,
    expiresAt: payload.expiresAt,
    ttlMinutes: SIGNAL_CACHE_TTL_MINUTES,
    cachePath: SIGNAL_CACHE_PATH,
    storageMode,
    retainedPreviousSnapshot: payload.retainedPreviousSnapshot ?? false,
    retentionReason: payload.retentionReason ?? null,
    attemptedGeneratedAt: generatedAt,
    counts,
    failedSources: payload.points
      .filter((point) => point.quality === "unavailable" || point.error)
      .map((point) => ({
        key: point.key,
        source: point.source,
        error: point.error,
      })),
  };
}
