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
  if (!rows?.length || rows.length < 25) {
    return [
      unavailableMetric(source, asset, futures ? "leverage" : "price", futures ? "futures_volume_change_24h_pct" : "price_trend_24h_pct", "Binance kline sample is unavailable or too small.", { provider: "binance", symbol, futures }),
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
        rawPayload: { provider: "binance", symbol, futures },
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
      rawPayload: { provider: "binance", symbol },
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
      rawPayload: { provider: "binance", symbol },
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
      rawPayload: { provider: "binance", symbol },
    }),
  ];
}

async function fetchBinanceFunding(source: SourceDefinition, asset: AssetSymbol, symbol: TrackedSymbol) {
  const data = await fetchJson<{ lastFundingRate?: string; time?: number }>(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${symbol}`);
  const rate = Number(data?.lastFundingRate);
  if (!Number.isFinite(rate)) {
    return unavailableMetric(source, asset, "leverage", "funding_rate_pct", "Binance funding rate is unavailable.", { provider: "binance", symbol });
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
    rawPayload: { provider: "binance", symbol },
  });
}

async function fetchBinanceOpenInterest(source: SourceDefinition, asset: AssetSymbol, symbol: TrackedSymbol) {
  const rows = await fetchJson<Array<{ sumOpenInterestValue?: string; timestamp?: number }>>(
    `https://fapi.binance.com/futures/data/openInterestHist?symbol=${symbol}&period=1h&limit=25`,
  );
  if (!rows?.length || rows.length < 2) {
    return unavailableMetric(source, asset, "leverage", "open_interest_change_24h_pct", "Binance open interest history is unavailable or too small.", { provider: "binance", symbol });
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
    rawPayload: { provider: "binance", symbol },
  });
}

async function collectBinance(source: SourceDefinition): Promise<RawMetricInput[]> {
  const rows = await Promise.all(
    trackedSymbols.flatMap(({ symbol, asset }) => [
      fetchBinanceKlines(symbol, false).then((klines) => binancePriceAndVolumeMetrics(source, asset, symbol, klines, false)),
      fetchBinanceKlines(symbol, true).then((klines) => binancePriceAndVolumeMetrics(source, asset, symbol, klines, true)),
      fetchBinanceFunding(source, asset, symbol),
      fetchBinanceOpenInterest(source, asset, symbol),
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
  if (!rows.length || rows.length < 25) {
    return [
      unavailableMetric(source, asset, category === "linear" ? "leverage" : "price", category === "linear" ? "futures_volume_change_24h_pct" : "price_trend_24h_pct", "Bybit kline sample is unavailable or too small.", { provider: "bybit", symbol, category }),
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
        rawPayload: { provider: "bybit", symbol, category },
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
      rawPayload: { provider: "bybit", symbol, category },
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
      rawPayload: { provider: "bybit", symbol, category },
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
      rawPayload: { provider: "bybit", symbol, category },
    }),
  ];
}

async function fetchBybitTickerMetric(source: SourceDefinition, asset: AssetSymbol, symbol: TrackedSymbol, metricName: "funding_rate_pct" | "open_interest_usd") {
  const data = await fetchJson<{
    retCode?: number;
    result?: { list?: Array<{ fundingRate?: string; openInterestValue?: string; updatedTime?: string }> };
  }>(`https://api.bybit.com/v5/market/tickers?category=linear&symbol=${symbol}`);
  const row = data?.result?.list?.[0];
  const rawValue = metricName === "funding_rate_pct" ? Number(row?.fundingRate) * 100 : Number(row?.openInterestValue);
  if (!Number.isFinite(rawValue)) {
    return unavailableMetric(source, asset, "leverage", metricName, `Bybit ${metricName} is unavailable.`, { provider: "bybit", symbol });
  }
  return metric({
    source,
    asset,
    group: "leverage",
    metric: metricName,
    value: rawValue,
    previousValue: null,
    timestamp: row?.updatedTime ? new Date(Number(row.updatedTime)).toISOString() : new Date().toISOString(),
    reliability: metricName === "funding_rate_pct" ? 78 : 72,
    rawPayload: { provider: "bybit", symbol },
  });
}

async function collectBybit(source: SourceDefinition): Promise<RawMetricInput[]> {
  const rows = await Promise.all(
    trackedSymbols.flatMap(({ symbol, asset }) => [
      fetchBybitKlines(symbol, "spot").then((klines) => bybitPriceAndVolumeMetrics(source, asset, symbol, klines, "spot")),
      fetchBybitKlines(symbol, "linear").then((klines) => bybitPriceAndVolumeMetrics(source, asset, symbol, klines, "linear")),
      fetchBybitTickerMetric(source, asset, symbol, "funding_rate_pct"),
      fetchBybitTickerMetric(source, asset, symbol, "open_interest_usd"),
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
      const status = rawMetrics.length === 0 || unavailable === rawMetrics.length ? "failed" : unavailable > 0 ? "degraded" : "success";
      return {
        source,
        status,
        fetchedAt: new Date().toISOString(),
        latencyMs: Date.now() - started,
        rawEvents: [],
        rawMetrics,
        error: status === "failed" ? `${source.name} did not return usable public market metrics.` : undefined,
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
