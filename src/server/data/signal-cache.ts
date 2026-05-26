import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { DataPoint, SignalGroup } from "@/lib/types";
import { fetchCurrentDataPoints, requiredSignalKeys } from "@/server/data/adapters";

export const SIGNAL_CACHE_TTL_MINUTES = 30;
const SIGNAL_CACHE_PATH = process.env.CMIP_SIGNAL_CACHE_PATH ?? join(process.cwd(), ".cache", "cmip", "latest-signals.json");

type CachePayload = {
  generatedAt: string;
  expiresAt: string;
  points: DataPoint[];
};

let memoryPayload: CachePayload | null = null;

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
  btc_trend_24h: "price",
  eth_trend_24h: "price",
  sol_trend_24h: "price",
  nasdaq_trend_24h: "macro",
  dxy_trend_24h: "macro",
  us10y_trend_24h: "macro",
  gold_trend_24h: "macro",
  vix_trend_24h: "volatility",
  usdt_supply_7d: "stablecoins",
  usdc_supply_7d: "stablecoins",
  stablecoin_market_cap_7d: "liquidity",
  btc_etf_flow_24h: "flows",
  eth_etf_flow_24h: "flows",
  funding_btc: "leverage",
  open_interest_btc_24h: "leverage",
  spot_volume_btc_24h: "liquidity",
  futures_volume_btc_24h: "leverage",
  exchange_reserves_btc_7d: "onchain",
  news_sentiment_macro: "sentiment",
  geopolitical_event_score: "geopolitical",
};

export function buildUnavailableDataPoints(keys = requiredSignalKeys): DataPoint[] {
  return keys.map((key) => unavailablePoint(key, groupByKey[key] ?? "price"));
}

function readPayload(): CachePayload | null {
  try {
    if (memoryPayload) return memoryPayload;
    if (!existsSync(SIGNAL_CACHE_PATH)) return null;
    memoryPayload = JSON.parse(readFileSync(SIGNAL_CACHE_PATH, "utf8")) as CachePayload;
    return memoryPayload;
  } catch {
    return null;
  }
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
  const points = await fetchCurrentDataPoints();
  const generatedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + SIGNAL_CACHE_TTL_MINUTES * 60_000).toISOString();
  const payload: CachePayload = { generatedAt, expiresAt, points };

  mkdirSync(dirname(SIGNAL_CACHE_PATH), { recursive: true });
  writeFileSync(SIGNAL_CACHE_PATH, JSON.stringify(payload, null, 2));
  memoryPayload = payload;

  const liveCount = points.filter((point) => point.quality === "live").length;
  const delayedCount = points.filter((point) => point.quality === "delayed").length;
  const unavailableCount = points.filter((point) => point.quality === "unavailable").length;
  const estimatedCount = points.filter((point) => point.quality === "estimated").length;

  return {
    generatedAt,
    expiresAt,
    ttlMinutes: SIGNAL_CACHE_TTL_MINUTES,
    cachePath: SIGNAL_CACHE_PATH,
    counts: {
      total: points.length,
      live: liveCount,
      delayed: delayedCount,
      unavailable: unavailableCount,
      estimated: estimatedCount,
    },
    failedSources: points
      .filter((point) => point.quality === "unavailable" || point.error)
      .map((point) => ({
        key: point.key,
        source: point.source,
        error: point.error,
      })),
  };
}
