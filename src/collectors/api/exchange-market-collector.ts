import type { AssetSymbol, SignalGroup } from "@/lib/types";
import type { Collector, CollectorOutput, RawMetricInput, SourceDefinition } from "@/types/ingestion";

type ExchangeProvider = "binance" | "bybit";
type TrackedSymbol = "BTCUSDT" | "ETHUSDT" | "SOLUSDT";

const requestTimeoutMs = 8_000;
const trackedSymbols: Array<{ symbol: TrackedSymbol; asset: AssetSymbol }> = [
  { symbol: "BTCUSDT", asset: "BTC" },
  { symbol: "ETHUSDT", asset: "ETH" },
  { symbol: "SOLUSDT", asset: "SOL" },
];

type BinanceKline = [
  number,
  string,
  string,
  string,
  string,
  string,
  number,
  string,
  number,
  string,
  string,
  string,
];

type BybitKlineResponse = {
  retCode?: number;
  retMsg?: string;
  result?: {
    list?: string[][];
  };
};

async function fetchJson<T>(url: string): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: "application/json,text/plain,*/*",
        "user-agent": "CMIP/1.0 real ingestion exchange collector",
      },
    });
    if (!response.ok) return null;
    return (await response.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function endpointPayload(params: {
  provider: ExchangeProvider;
  endpoint: string;
  symbol: TrackedSymbol;
  category?: string;
  futures?: boolean;
  parserSuccess: boolean;
  fallbackUsed?: boolean;
  fallbackFor?: string;
  primaryError?: string;
}) {
  return {
    provider: params.provider,
    endpoint: params.endpoint,
    symbol: params.symbol,
    category: params.category,
    futures: params.futures,
    parserSuccess: params.parserSuccess,
    fallbackUsed: params.fallbackUsed ?? false,
    fallbackFor: params.fallbackFor,
    primaryError: params.primaryError,
  };
}

function isUsableMetric(row: RawMetricInput) {
  return row.quality !== "unavailable" && row.value !== null && Number.isFinite(Number(row.value));
}

function hasUsableMetrics(rows: RawMetricInput[]) {
  return rows.some(isUsableMetric);
}

function markFallback(row: RawMetricInput, fallbackFor: string, primaryRows: RawMetricInput | RawMetricInput[]) {
  const primaryError = Array.isArray(primaryRows)
    ? primaryRows.map((item) => item.error).filter(Boolean).join("; ") || undefined
    : primaryRows.error;
  return {
    ...row,
    reliability: Math.max(0, row.reliability - 6),
    rawPayload: {
      ...(row.rawPayload ?? {}),
      fallbackUsed: true,
      fallbackFor,
      primaryError,
    },
  };
}

function pctChange(current: number, previous: number) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function metric(params: {
  source: SourceDefinition;
  asset: AssetSymbol;
  group: SignalGroup;
  metric: string;
  value: number | null;
  previousValue?: number | null;
  timestamp: string | null;
  reliability: number;
  sampleSize?: number;
  error?: string;
  rawPayload?: Record<string, unknown>;
}): RawMetricInput {
  const value = typeof params.value === "number" && Number.isFinite(params.value) ? Number(params.value.toFixed(6)) : null;
  const previousValue =
    typeof params.previousValue === "number" && Number.isFinite(params.previousValue) ? Number(params.previousValue.toFixed(6)) : null;
  const changeAbs = value !== null && previousValue !== null ? Number((value - previousValue).toFixed(6)) : null;
  const changePct = value !== null && previousValue !== null && previousValue !== 0 ? Number((((value - previousValue) / Math.abs(previousValue)) * 100).toFixed(6)) : null;

  return {
    sourceId: params.source.id,
    sourceName: params.source.name,
    sourceType: params.source.sourceType,
    asset: params.asset,
    group: params.group,
    metric: params.metric,
    value,
    previousValue,
    changeAbs,
    changePct,
    timestamp: params.timestamp,
    quality: value === null ? "unavailable" : "live",
    reliability: value === null ? 0 : params.reliability,
    sampleSize: params.sampleSize ?? (value === null ? 0 : 1),
    error: params.error,
    rawPayload: params.rawPayload ?? {},
  };
}

function unavailableMetric(source: SourceDefinition, asset: AssetSymbol, group: SignalGroup, metricName: string, error: string, rawPayload?: Record<string, unknown>) {
  return metric({
    source,
    asset,
    group,
    metric: metricName,
    value: null,
    previousValue: null,
    timestamp: null,
    reliability: 0,
    sampleSize: 0,
    error,
    rawPayload,
  });
}

async function fetchBinanceKlines(symbol: TrackedSymbol, futures = false) {
  const endpoint = futures ? "https://fapi.binance.com/fapi/v1/klines" : "https://api.binance.com/api/v3/klines";
  return fetchJson<BinanceKline[]>(`${endpoint}?symbol=${symbol}&interval=1h&limit=49`);
}

function binancePriceAndVolumeMetrics(source: SourceDefinition, asset: AssetSymbol, symbol: TrackedSymbol, rows: BinanceKline[] | null, futures = false) {
  const endpoint = futures ? "https://fapi.binance.com/fapi/v1/klines" : "https://api.binance.com/api/v3/klines";
  if (!rows?.length || rows.length < 25) {
    return [
      unavailableMetric(source, asset, futures ? "leverage" : "price", futures ? "futures_volume_change_24h_pct" : "price_trend_24h_pct", "Binance kline sample is unavailable or too small.", endpointPayload({ provider: "binance", endpoint, symbol, futures, parserSuccess: false })),
    ];
  }

  const first = Number(rows[rows.length - 25][1]);
  const previous = Number(rows[rows.length - 2][4]);
  const last = Number(rows[rows.length - 1][4]);
  const trend = pctChange(last, first);
  const previousTrend = pctChange(previous, first);
  const timestamp = new Date(rows[rows.length - 1][0]).toISOString();

  if (futures) {
    const currentWindow = rows.slice(-24);
    const previousWindow = rows.slice(-48, -24);
    const currentVolume = currentWindow.reduce((sum, row) => sum + Number(row[7] || 0), 0);
    const previousVolume = previousWindow.reduce((sum, row) => sum + Number(row[7] || 0), 0);
    const volumeChange = pctChange(currentVolume, previousVolume);
    return [
      metric({
        source,
        asset,
        group: "leverage",
        metric: "futures_volume_change_24h_pct",
        value: volumeChange,
        previousValue: 0,
        timestamp,
        reliability: 82,
        sampleSize: rows.length,
        rawPayload: endpointPayload({ provider: "binance", endpoint, symbol, futures, parserSuccess: true }),
      }),
    ];
  }

  const currentWindow = rows.slice(-24);
  const previousWindow = rows.slice(-48, -24);
  const currentVolume = currentWindow.reduce((sum, row) => sum + Number(row[7] || 0), 0);
  const previousVolume = previousWindow.reduce((sum, row) => sum + Number(row[7] || 0), 0);
  const volumeChange = pctChange(currentVolume, previousVolume);

  return [
    metric({
      source,
      asset,
      group: "price",
      metric: "price_usd",
      value: last,
      previousValue: previous,
      timestamp,
      reliability: 88,
      sampleSize: rows.length,
      rawPayload: endpointPayload({ provider: "binance", endpoint, symbol, parserSuccess: true }),
    }),
    metric({
      source,
      asset,
      group: "price",
      metric: "price_trend_24h_pct",
      value: trend,
      previousValue: previousTrend,
      timestamp,
      reliability: 86,
      sampleSize: rows.length,
      rawPayload: endpointPayload({ provider: "binance", endpoint, symbol, parserSuccess: true }),
    }),
    metric({
      source,
      asset,
      group: "liquidity",
      metric: "spot_volume_change_24h_pct",
      value: volumeChange,
      previousValue: 0,
      timestamp,
      reliability: 84,
      sampleSize: rows.length,
      rawPayload: endpointPayload({ provider: "binance", endpoint, symbol, parserSuccess: true }),
    }),
  ];
}

async function fetchBinanceFunding(source: SourceDefinition, asset: AssetSymbol, symbol: TrackedSymbol) {
  const endpoint = "https://fapi.binance.com/fapi/v1/premiumIndex";
  const data = await fetchJson<{ lastFundingRate?: string; time?: number }>(`${endpoint}?symbol=${symbol}`);
  const rate = Number(data?.lastFundingRate);
  if (!Number.isFinite(rate)) {
    return unavailableMetric(source, asset, "leverage", "funding_rate_pct", "Binance funding rate is unavailable.", endpointPayload({ provider: "binance", endpoint, symbol, parserSuccess: false }));
  }
  return metric({
    source,
    asset,
    group: "leverage",
    metric: "funding_rate_pct",
    value: rate * 100,
    previousValue: null,
    timestamp: data?.time ? new Date(data.time).toISOString() : new Date().toISOString(),
    reliability: 82,
    rawPayload: endpointPayload({ provider: "binance", endpoint, symbol, parserSuccess: true }),
  });
}

async function fetchBinanceOpenInterest(source: SourceDefinition, asset: AssetSymbol, symbol: TrackedSymbol) {
  const endpoint = "https://fapi.binance.com/futures/data/openInterestHist";
  const rows = await fetchJson<Array<{ sumOpenInterestValue?: string; timestamp?: number }>>(
    `${endpoint}?symbol=${symbol}&period=1h&limit=25`,
  );
  if (!rows?.length || rows.length < 2) {
    return unavailableMetric(source, asset, "leverage", "open_interest_change_24h_pct", "Binance open interest history is unavailable or too small.", endpointPayload({ provider: "binance", endpoint, symbol, parserSuccess: false }));
  }
  const first = Number(rows[0].sumOpenInterestValue);
  const previous = Number(rows[rows.length - 2].sumOpenInterestValue);
  const last = Number(rows[rows.length - 1].sumOpenInterestValue);
  const value = pctChange(last, first);
  const previousValue = pctChange(previous, first);
  const lastTimestamp = rows[rows.length - 1].timestamp;
  const timestamp = typeof lastTimestamp === "number" ? new Date(lastTimestamp).toISOString() : new Date().toISOString();
  return metric({
    source,
    asset,
    group: "leverage",
    metric: "open_interest_change_24h_pct",
    value,
    previousValue,
    timestamp,
    reliability: 80,
    sampleSize: rows.length,
    rawPayload: endpointPayload({ provider: "binance", endpoint, symbol, parserSuccess: true }),
  });
}

async function collectBinanceSpotWithFallback(source: SourceDefinition, asset: AssetSymbol, symbol: TrackedSymbol) {
  const primary = binancePriceAndVolumeMetrics(source, asset, symbol, await fetchBinanceKlines(symbol, false), false);
  if (hasUsableMetrics(primary)) return primary;
  const fallback = bybitPriceAndVolumeMetrics(source, asset, symbol, await fetchBybitKlines(symbol, "spot"), "spot");
  return hasUsableMetrics(fallback) ? fallback.map((row) => markFallback(row, "binance_spot", primary)) : primary;
}

async function collectBinanceFuturesVolumeWithFallback(source: SourceDefinition, asset: AssetSymbol, symbol: TrackedSymbol) {
  const primary = binancePriceAndVolumeMetrics(source, asset, symbol, await fetchBinanceKlines(symbol, true), true);
  if (hasUsableMetrics(primary)) return primary;
  const fallback = bybitPriceAndVolumeMetrics(source, asset, symbol, await fetchBybitKlines(symbol, "linear"), "linear");
  return hasUsableMetrics(fallback) ? fallback.map((row) => markFallback(row, "binance_futures_volume", primary)) : primary;
}

async function collectBinanceFundingWithFallback(source: SourceDefinition, asset: AssetSymbol, symbol: TrackedSymbol) {
  const primary = await fetchBinanceFunding(source, asset, symbol);
  if (isUsableMetric(primary)) return primary;
  const fallback = await fetchBybitFunding(source, asset, symbol);
  return isUsableMetric(fallback) ? markFallback(fallback, "binance_funding", primary) : primary;
}

async function collectBinanceOpenInterestWithFallback(source: SourceDefinition, asset: AssetSymbol, symbol: TrackedSymbol) {
  const primary = await fetchBinanceOpenInterest(source, asset, symbol);
  if (isUsableMetric(primary)) return primary;
  const fallback = await fetchBybitOpenInterest(source, asset, symbol);
  return isUsableMetric(fallback) ? markFallback(fallback, "binance_open_interest", primary) : primary;
}

async function collectBybitSpotWithFallback(source: SourceDefinition, asset: AssetSymbol, symbol: TrackedSymbol) {
  const primary = bybitPriceAndVolumeMetrics(source, asset, symbol, await fetchBybitKlines(symbol, "spot"), "spot");
  if (hasUsableMetrics(primary)) return primary;
  const fallback = binancePriceAndVolumeMetrics(source, asset, symbol, await fetchBinanceKlines(symbol, false), false);
  return hasUsableMetrics(fallback) ? fallback.map((row) => markFallback(row, "bybit_spot", primary)) : primary;
}

async function collectBybitFuturesVolumeWithFallback(source: SourceDefinition, asset: AssetSymbol, symbol: TrackedSymbol) {
  const primary = bybitPriceAndVolumeMetrics(source, asset, symbol, await fetchBybitKlines(symbol, "linear"), "linear");
  if (hasUsableMetrics(primary)) return primary;
  const fallback = binancePriceAndVolumeMetrics(source, asset, symbol, await fetchBinanceKlines(symbol, true), true);
  return hasUsableMetrics(fallback) ? fallback.map((row) => markFallback(row, "bybit_futures_volume", primary)) : primary;
}

async function collectBybitFundingWithFallback(source: SourceDefinition, asset: AssetSymbol, symbol: TrackedSymbol) {
  const primary = await fetchBybitFunding(source, asset, symbol);
  if (isUsableMetric(primary)) return primary;
  const fallback = await fetchBinanceFunding(source, asset, symbol);
  return isUsableMetric(fallback) ? markFallback(fallback, "bybit_funding", primary) : primary;
}

async function collectBybitOpenInterestWithFallback(source: SourceDefinition, asset: AssetSymbol, symbol: TrackedSymbol) {
  const primary = await fetchBybitOpenInterest(source, asset, symbol);
  if (isUsableMetric(primary)) return primary;
  const fallback = await fetchBinanceOpenInterest(source, asset, symbol);
  return isUsableMetric(fallback) ? markFallback(fallback, "bybit_open_interest", primary) : primary;
}

async function collectBinance(source: SourceDefinition): Promise<RawMetricInput[]> {
  const rows = await Promise.all(
    trackedSymbols.flatMap(({ symbol, asset }) => [
      collectBinanceSpotWithFallback(source, asset, symbol),
      collectBinanceFuturesVolumeWithFallback(source, asset, symbol),
      collectBinanceFundingWithFallback(source, asset, symbol),
      collectBinanceOpenInterestWithFallback(source, asset, symbol),
    ]),
  );
  return rows.flat();
}

async function fetchBybitKlines(symbol: TrackedSymbol, category: "spot" | "linear") {
  const data = await fetchJson<BybitKlineResponse>(`https://api.bybit.com/v5/market/kline?category=${category}&symbol=${symbol}&interval=60&limit=49`);
  const rows = data?.result?.list ?? [];
  return rows
    .map((row) => ({
      timestamp: Number(row[0]),
      open: Number(row[1]),
      close: Number(row[4]),
      turnover: Number(row[6] ?? row[5]),
    }))
    .filter((row) => Number.isFinite(row.timestamp) && Number.isFinite(row.open) && Number.isFinite(row.close))
    .sort((left, right) => left.timestamp - right.timestamp);
}

function bybitPriceAndVolumeMetrics(source: SourceDefinition, asset: AssetSymbol, symbol: TrackedSymbol, rows: Awaited<ReturnType<typeof fetchBybitKlines>>, category: "spot" | "linear") {
  const endpoint = "https://api.bybit.com/v5/market/kline";
  if (!rows.length || rows.length < 25) {
    return [
      unavailableMetric(source, asset, category === "linear" ? "leverage" : "price", category === "linear" ? "futures_volume_change_24h_pct" : "price_trend_24h_pct", "Bybit kline sample is unavailable or too small.", endpointPayload({ provider: "bybit", endpoint, symbol, category, parserSuccess: false })),
    ];
  }
  const first = rows[rows.length - 25].open;
  const previous = rows[rows.length - 2].close;
  const last = rows[rows.length - 1].close;
  const trend = pctChange(last, first);
  const previousTrend = pctChange(previous, first);
  const timestamp = new Date(rows[rows.length - 1].timestamp).toISOString();
  const currentWindow = rows.slice(-24);
  const previousWindow = rows.slice(-48, -24);
  const currentVolume = currentWindow.reduce((sum, row) => sum + Number(row.turnover || 0), 0);
  const previousVolume = previousWindow.reduce((sum, row) => sum + Number(row.turnover || 0), 0);
  const volumeChange = pctChange(currentVolume, previousVolume);

  if (category === "linear") {
    return [
      metric({
        source,
        asset,
        group: "leverage",
        metric: "futures_volume_change_24h_pct",
        value: volumeChange,
        previousValue: 0,
        timestamp,
        reliability: 78,
        sampleSize: rows.length,
        rawPayload: endpointPayload({ provider: "bybit", endpoint, symbol, category, parserSuccess: true }),
      }),
    ];
  }

  return [
    metric({
      source,
      asset,
      group: "price",
      metric: "price_usd",
      value: last,
      previousValue: previous,
      timestamp,
      reliability: 82,
      sampleSize: rows.length,
      rawPayload: endpointPayload({ provider: "bybit", endpoint, symbol, category, parserSuccess: true }),
    }),
    metric({
      source,
      asset,
      group: "price",
      metric: "price_trend_24h_pct",
      value: trend,
      previousValue: previousTrend,
      timestamp,
      reliability: 80,
      sampleSize: rows.length,
      rawPayload: endpointPayload({ provider: "bybit", endpoint, symbol, category, parserSuccess: true }),
    }),
    metric({
      source,
      asset,
      group: "liquidity",
      metric: "spot_volume_change_24h_pct",
      value: volumeChange,
      previousValue: 0,
      timestamp,
      reliability: 78,
      sampleSize: rows.length,
      rawPayload: endpointPayload({ provider: "bybit", endpoint, symbol, category, parserSuccess: true }),
    }),
  ];
}

async function fetchBybitFunding(source: SourceDefinition, asset: AssetSymbol, symbol: TrackedSymbol) {
  const endpoint = "https://api.bybit.com/v5/market/tickers";
  const data = await fetchJson<{
    retCode?: number;
    result?: { list?: Array<{ fundingRate?: string; updatedTime?: string }> };
  }>(`${endpoint}?category=linear&symbol=${symbol}`);
  const row = data?.result?.list?.[0];
  const rawValue = Number(row?.fundingRate) * 100;
  if (!Number.isFinite(rawValue)) {
    return unavailableMetric(source, asset, "leverage", "funding_rate_pct", "Bybit funding_rate_pct is unavailable.", endpointPayload({ provider: "bybit", endpoint, symbol, category: "linear", parserSuccess: false }));
  }
  return metric({
    source,
    asset,
    group: "leverage",
    metric: "funding_rate_pct",
    value: rawValue,
    previousValue: null,
    timestamp: row?.updatedTime ? new Date(Number(row.updatedTime)).toISOString() : new Date().toISOString(),
    reliability: 78,
    rawPayload: endpointPayload({ provider: "bybit", endpoint, symbol, category: "linear", parserSuccess: true }),
  });
}

async function fetchBybitOpenInterest(source: SourceDefinition, asset: AssetSymbol, symbol: TrackedSymbol) {
  const endpoint = "https://api.bybit.com/v5/market/open-interest";
  const rows = await fetchJson<{
    retCode?: number;
    retMsg?: string;
    result?: { list?: Array<{ openInterest?: string; timestamp?: string }> };
  }>(`${endpoint}?category=linear&symbol=${symbol}&intervalTime=1h&limit=25`);
  const normalized = (rows?.result?.list ?? [])
    .map((row) => ({
      openInterest: Number(row.openInterest),
      timestamp: Number(row.timestamp),
    }))
    .filter((row) => Number.isFinite(row.openInterest))
    .sort((left, right) => left.timestamp - right.timestamp);
  if (normalized.length < 2) {
    return unavailableMetric(source, asset, "leverage", "open_interest_change_24h_pct", "Bybit open interest history is unavailable or too small.", endpointPayload({ provider: "bybit", endpoint, symbol, category: "linear", parserSuccess: false }));
  }
  const first = normalized[0].openInterest;
  const previous = normalized[normalized.length - 2].openInterest;
  const last = normalized[normalized.length - 1].openInterest;
  const value = pctChange(last, first);
  const previousValue = pctChange(previous, first);
  const timestamp = Number.isFinite(normalized[normalized.length - 1].timestamp) ? new Date(normalized[normalized.length - 1].timestamp).toISOString() : new Date().toISOString();
  return metric({
    source,
    asset,
    group: "leverage",
    metric: "open_interest_change_24h_pct",
    value,
    previousValue,
    timestamp,
    reliability: 74,
    sampleSize: normalized.length,
    rawPayload: endpointPayload({ provider: "bybit", endpoint, symbol, category: "linear", parserSuccess: true }),
  });
}

async function collectBybit(source: SourceDefinition): Promise<RawMetricInput[]> {
  const rows = await Promise.all(
    trackedSymbols.flatMap(({ symbol, asset }) => [
      collectBybitSpotWithFallback(source, asset, symbol),
      collectBybitFuturesVolumeWithFallback(source, asset, symbol),
      collectBybitFundingWithFallback(source, asset, symbol),
      collectBybitOpenInterestWithFallback(source, asset, symbol),
    ]),
  );
  return rows.flat();
}

function providerForSource(source: SourceDefinition): ExchangeProvider | null {
  if (source.id.includes("binance")) return "binance";
  if (source.id.includes("bybit")) return "bybit";
  return null;
}

export const exchangeMarketCollector: Collector = {
  sourceType: "api",
  async collect(source: SourceDefinition): Promise<CollectorOutput> {
    const started = Date.now();
    const provider = providerForSource(source);
    if (!provider) {
      return {
        source,
        status: "failed",
        fetchedAt: new Date().toISOString(),
        latencyMs: 0,
        rawEvents: [],
        rawMetrics: [],
        error: `Unsupported exchange source ${source.id}.`,
      };
    }

    try {
      const rawMetrics = provider === "binance" ? await collectBinance(source) : await collectBybit(source);
      const unavailable = rawMetrics.filter((row) => row.quality === "unavailable" || row.error).length;
      const usable = rawMetrics.filter(isUsableMetric).length;
      const fallbackUsed = rawMetrics.some((row) => Boolean((row.rawPayload as Record<string, unknown> | undefined)?.fallbackUsed));
      const status = rawMetrics.length === 0 || usable === 0 ? "failed" : unavailable > 0 || fallbackUsed ? "degraded" : "success";
      const fallbackSummary = fallbackUsed ? " Fallback source supplied one or more exchange metrics." : "";
      return {
        source,
        status,
        fetchedAt: new Date().toISOString(),
        latencyMs: Date.now() - started,
        rawEvents: [],
        rawMetrics,
        error: status === "failed"
          ? `${source.name} did not return usable public market metrics.`
          : status === "degraded"
            ? `${source.name} completed with partial exchange coverage.${fallbackSummary}`
            : undefined,
      };
    } catch (error) {
      return {
        source,
        status: "failed",
        fetchedAt: new Date().toISOString(),
        latencyMs: Date.now() - started,
        rawEvents: [],
        rawMetrics: [],
        error: error instanceof Error ? error.message : `${source.name} exchange collector failed.`,
      };
    }
  },
};
