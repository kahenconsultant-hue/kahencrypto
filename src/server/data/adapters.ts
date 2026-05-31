import type { AssetSymbol, DataPoint, DataQuality, DataSeriesPoint, SignalGroup, SourceType } from "@/lib/types";
import { getEtfFlows } from "@/server/data/etf-flow-module";

export interface AdapterResult<T = number> {
  value: T | null;
  previousValue?: T | null;
  timestamp: string | null;
  source: string;
  sourceType?: SourceType;
  quality: DataQuality;
  reliability: number;
  sampleSize?: number;
  history?: DataSeriesPoint[];
  intradayHistory?: DataSeriesPoint[];
  error?: string;
  estimatedReason?: string;
}

export interface DataAdapter<T = number> {
  id: string;
  fetchPoint(key: string): Promise<AdapterResult<T>>;
}

const developmentFallbackRequested = process.env.CMIP_ALLOW_DEV_FALLBACK === "true";
const allowDevelopmentFallback = developmentFallbackRequested && process.env.NODE_ENV !== "production";
const requestTimeoutMs = 8_000;

function unavailable(source: string, error: string, reliability = 0): AdapterResult {
  return {
    value: null,
    previousValue: null,
    timestamp: null,
    source,
    quality: "unavailable",
    reliability,
    error,
  };
}

function live(params: {
  value: number;
  previousValue?: number | null;
  timestamp?: string | null;
  source: string;
  reliability: number;
  sourceType?: SourceType;
  quality?: DataQuality;
  history?: DataSeriesPoint[];
  intradayHistory?: DataSeriesPoint[];
}): AdapterResult {
  return {
    value: Number.isFinite(params.value) ? Number(params.value.toFixed(4)) : null,
    previousValue: typeof params.previousValue === "number" && Number.isFinite(params.previousValue) ? Number(params.previousValue.toFixed(4)) : null,
    timestamp: params.timestamp ?? new Date().toISOString(),
    source: params.source,
    sourceType: params.sourceType ?? "API",
    quality: params.quality ?? "live",
    reliability: params.reliability,
    sampleSize: params.history?.length ?? params.intradayHistory?.length ?? 1,
    history: params.history,
    intradayHistory: params.intradayHistory,
  };
}

function devFallback(params: {
  value: number;
  previousValue: number;
  source: string;
  reliability: number;
  reason: string;
}): AdapterResult {
  if (developmentFallbackRequested && process.env.NODE_ENV === "production") {
    return unavailable(params.source, "fallback توسعه در محیط production غیرفعال است؛ مقدار برآوردی تولید نمی‌شود.", params.reliability);
  }

  if (!allowDevelopmentFallback) {
    return unavailable(params.source, "منبع زنده یا cache معتبر در دسترس نیست؛ fallback توسعه فقط با CMIP_ALLOW_DEV_FALLBACK=true فعال می‌شود.", params.reliability);
  }

  return {
    value: params.value,
    previousValue: params.previousValue,
    timestamp: new Date().toISOString(),
    source: params.source,
    quality: "estimated",
    reliability: params.reliability,
    estimatedReason: params.reason,
  };
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "accept": "application/json,text/plain,*/*",
        "user-agent": "CMIP/1.0 market intelligence data adapter",
        ...(init?.headers ?? {}),
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

async function fetchJsonWithStatus<T>(url: string, init?: RequestInit): Promise<{ data: T | null; status: number; error?: string }> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "accept": "application/json,text/plain,*/*",
        "user-agent": "CMIP/1.0 market intelligence data adapter",
        ...(init?.headers ?? {}),
      },
    });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return { data: null, status: response.status, error: body.slice(0, 300) || response.statusText };
    }
    return { data: (await response.json()) as T, status: response.status };
  } catch (error) {
    return { data: null, status: 0, error: error instanceof Error ? error.message : "Network request failed." };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchText(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "accept": "application/rss+xml,application/xml,text/xml,text/plain,*/*",
        "user-agent": "CMIP/1.0 market intelligence data adapter",
      },
    });
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function percentChange(current: number, previous: number) {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

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

async function fetchBinanceKlines(baseUrl: string, symbol: string, interval = "1h", limit = 49) {
  return fetchJson<BinanceKline[]>(`${baseUrl}?symbol=${symbol}&interval=${interval}&limit=${limit}`);
}

function klineHistory(rows: BinanceKline[] | null | undefined): DataSeriesPoint[] {
  return (rows ?? [])
    .map((row) => ({
      timestamp: new Date(row[0]).toISOString(),
      value: Number(row[4]),
    }))
    .filter((row) => Number.isFinite(row.value));
}

async function fetchBinanceTrend(symbol: "BTCUSDT" | "ETHUSDT" | "SOLUSDT") {
  const [data, dailyData] = await Promise.all([
    fetchBinanceKlines("https://api.binance.com/api/v3/klines", symbol, "1h", 240),
    fetchBinanceKlines("https://api.binance.com/api/v3/klines", symbol, "1d", 140),
  ]);
  if (!data?.length || data.length < 25) return null;
  const first = Number(data[data.length - 25][1]);
  const last = Number(data[data.length - 1][4]);
  const previous = Number(data[data.length - 2][4]);
  const change = percentChange(last, first);
  const previousChange = percentChange(previous, first);
  if (change === null || previousChange === null) return null;
  return live({
    value: change,
    previousValue: previousChange,
    timestamp: new Date(data[data.length - 1][0]).toISOString(),
    source: `Binance spot public klines ${symbol}`,
    reliability: symbol === "SOLUSDT" ? 80 : 84,
    sourceType: "API",
    intradayHistory: klineHistory(data),
    history: klineHistory(dailyData),
  });
}

type CoinGeckoMarketChart = {
  prices?: Array<[number, number]>;
  total_volumes?: Array<[number, number]>;
  market_caps?: Array<[number, number]>;
};

async function fetchCoinGeckoMarketChart(id: "bitcoin" | "ethereum" | "solana", days = 7) {
  return fetchJson<CoinGeckoMarketChart>(`https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${days}&interval=hourly`);
}

function marketChartHistory(rows: Array<[number, number]> | undefined): DataSeriesPoint[] {
  return (rows ?? [])
    .map(([timestamp, value]) => ({ timestamp: new Date(timestamp).toISOString(), value: Number(value) }))
    .filter((row) => Number.isFinite(row.value));
}

async function fetchCoinGeckoTrend(id: "bitcoin" | "ethereum" | "solana") {
  const data = await fetchCoinGeckoMarketChart(id, 7);
  const prices = data?.prices ?? [];
  if (prices.length < 25) return null;
  const first = prices[Math.max(0, prices.length - 25)][1];
  const previous = prices[prices.length - 2][1];
  const last = prices[prices.length - 1][1];
  const change = percentChange(last, first);
  const previousChange = percentChange(previous, first);
  if (change === null || previousChange === null) return null;
  return live({
    value: change,
    previousValue: previousChange,
    timestamp: new Date(prices[prices.length - 1][0]).toISOString(),
    source: `CoinGecko public market_chart ${id}`,
    reliability: 78,
    sourceType: "API",
    quality: "delayed",
    intradayHistory: marketChartHistory(prices),
    history: marketChartHistory(data?.market_caps),
  });
}

async function fetchCoinGeckoVolumeTrend(id: "bitcoin") {
  const data = await fetchCoinGeckoMarketChart(id, 7);
  const volumes = data?.total_volumes ?? [];
  if (volumes.length < 48) return null;
  const currentWindow = volumes.slice(-24);
  const previousWindow = volumes.slice(-48, -24);
  const currentVolume = currentWindow.reduce((sum, row) => sum + Number(row[1] || 0), 0);
  const previousVolume = previousWindow.reduce((sum, row) => sum + Number(row[1] || 0), 0);
  const change = percentChange(currentVolume, previousVolume);
  if (change === null) return null;
  return live({
    value: change,
    previousValue: 0,
    timestamp: new Date(volumes[volumes.length - 1][0]).toISOString(),
    source: "CoinGecko public BTC total volume",
    reliability: 76,
    quality: "delayed",
    sourceType: "API",
    history: marketChartHistory(volumes),
  });
}

async function fetchBinanceVolumeTrend(symbol: "BTCUSDT" | "ETHUSDT" | "SOLUSDT", futures = false) {
  const baseUrl = futures ? "https://fapi.binance.com/fapi/v1/klines" : "https://api.binance.com/api/v3/klines";
  const data = await fetchBinanceKlines(baseUrl, symbol, "1h", 49);
  if (!data?.length || data.length < 48) return null;
  const currentWindow = data.slice(-24);
  const previousWindow = data.slice(-48, -24);
  const currentVolume = currentWindow.reduce((sum, row) => sum + Number(row[7] || 0), 0);
  const previousVolume = previousWindow.reduce((sum, row) => sum + Number(row[7] || 0), 0);
  const change = percentChange(currentVolume, previousVolume);
  if (change === null) return null;
  return live({
    value: change,
    previousValue: 0,
    timestamp: new Date(data[data.length - 1][0]).toISOString(),
    source: futures ? "Binance Futures public volume" : "Binance spot public volume",
    reliability: futures ? 78 : 84,
  });
}

type YahooChartResponse = {
  chart?: {
    result?: Array<{
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          close?: Array<number | null>;
        }>;
      };
    }>;
  };
};

type YahooChartResult = NonNullable<NonNullable<YahooChartResponse["chart"]>["result"]>[number];

function yahooHistory(result: YahooChartResult | null): DataSeriesPoint[] {
  const timestamps = result?.timestamp ?? [];
  const closes = result?.indicators?.quote?.[0]?.close ?? [];
  return closes
    .map((value: number | null, index: number) =>
      typeof value === "number" && Number.isFinite(value) && typeof timestamps[index] === "number"
        ? { timestamp: new Date(timestamps[index] * 1000).toISOString(), value }
        : null,
    )
    .filter((row: DataSeriesPoint | null): row is DataSeriesPoint => Boolean(row));
}

async function fetchYahooChart(symbol: string, range: string, interval: string) {
  const encoded = encodeURIComponent(symbol);
  const data = await fetchJson<YahooChartResponse>(`https://query1.finance.yahoo.com/v8/finance/chart/${encoded}?range=${range}&interval=${interval}`);
  return data?.chart?.result?.[0] ?? null;
}

async function fetchYahooTrend(symbol: string, source: string, reliability: number, mode: "percent" | "point" = "percent") {
  const [result, dailyResult] = await Promise.all([fetchYahooChart(symbol, "10d", "1h"), fetchYahooChart(symbol, "6mo", "1d")]);
  const closes = result?.indicators?.quote?.[0]?.close?.filter((value): value is number => typeof value === "number" && Number.isFinite(value)) ?? [];
  if (closes.length < 2) return null;
  const first = closes[Math.max(0, closes.length - 25)];
  const previous = closes[closes.length - 2];
  const last = closes[closes.length - 1];
  const value = mode === "point" ? (last - first) / 10 : percentChange(last, first);
  const previousValue = mode === "point" ? (previous - first) / 10 : percentChange(previous, first);
  if (value === null || previousValue === null) return null;
  const timestamp = result?.timestamp?.length ? new Date(result.timestamp[result.timestamp.length - 1] * 1000).toISOString() : new Date().toISOString();
  return live({
    value,
    previousValue,
    timestamp,
    source,
    reliability,
    quality: "delayed",
    sourceType: "API",
    intradayHistory: yahooHistory(result),
    history: yahooHistory(dailyResult),
  });
}

type FredSeriesId = "CPIAUCSL" | "PPIACO" | "FEDFUNDS" | "UNRATE" | "DGS10" | "DGS2" | "T10Y2Y" | "DTWEXBGS";
type FredObservation = { date?: string; value?: string };
type FredObservationResponse = {
  observations?: FredObservation[];
  error_code?: number;
  error_message?: string;
};

const fredMeta: Record<FredSeriesId, { label: string; reliability: number; frequency: "daily" | "monthly" }> = {
  CPIAUCSL: { label: "CPI", reliability: 96, frequency: "monthly" },
  PPIACO: { label: "PPI", reliability: 95, frequency: "monthly" },
  FEDFUNDS: { label: "Fed Funds Rate", reliability: 97, frequency: "monthly" },
  UNRATE: { label: "Unemployment Rate", reliability: 95, frequency: "monthly" },
  DGS10: { label: "US 10-Year Treasury Yield", reliability: 96, frequency: "daily" },
  DGS2: { label: "US 2-Year Treasury Yield", reliability: 94, frequency: "daily" },
  T10Y2Y: { label: "10Y minus 2Y Yield Spread", reliability: 94, frequency: "daily" },
  DTWEXBGS: { label: "Trade Weighted US Dollar Index", reliability: 92, frequency: "daily" },
};

const fredCache = new Map<string, Promise<AdapterResult | null>>();

function fredError(status: number, error: string | undefined) {
  if (status === 400 || status === 401 || status === 403) return `FRED API key is invalid or rejected: ${error ?? "authorization failed"}`;
  if (status === 429) return "FRED API rate limit reached.";
  if (status >= 500) return `FRED endpoint failed with HTTP ${status}.`;
  return error ?? `FRED endpoint failed with HTTP ${status}.`;
}

function latestValidFredObservations(observations: FredObservation[] | undefined) {
  return (observations ?? [])
    .map((observation) => ({
      date: observation.date ?? "",
      value: observation.value === "." ? NaN : Number(observation.value),
    }))
    .filter((observation) => observation.date && Number.isFinite(observation.value))
    .sort((left, right) => Date.parse(left.date) - Date.parse(right.date));
}

async function fetchFredSeries(seriesId: FredSeriesId, mode: "latest" | "percent_change" | "point_change" = "latest") {
  const key = process.env.FRED_API_KEY;
  const meta = fredMeta[seriesId];
  if (!key) return unavailable(`FRED ${seriesId}`, "Missing FRED_API_KEY.", 0);

  const cacheKey = `${seriesId}:${mode}`;
  if (fredCache.has(cacheKey)) return fredCache.get(cacheKey)!;

  const promise = (async (): Promise<AdapterResult | null> => {
    const url = new URL("https://api.stlouisfed.org/fred/series/observations");
    url.searchParams.set("series_id", seriesId);
    url.searchParams.set("api_key", key);
    url.searchParams.set("file_type", "json");
    url.searchParams.set("sort_order", "desc");
    url.searchParams.set("limit", "120");

    const response = await fetchJsonWithStatus<FredObservationResponse>(url.toString());
    if (!response.data?.observations?.length) {
      return unavailable(`FRED ${seriesId}`, fredError(response.status, response.error ?? response.data?.error_message), 0);
    }

    const observations = latestValidFredObservations(response.data.observations);
    if (observations.length < 2) return unavailable(`FRED ${seriesId}`, "FRED did not return two valid observations.", 0);
    const latest = observations[observations.length - 1];
    const previous = observations[observations.length - 2];
    const value =
      mode === "point_change"
        ? latest.value - previous.value
        : mode === "percent_change"
          ? percentChange(latest.value, previous.value)
          : latest.value;
    const previousValue = mode === "latest" ? previous.value : 0;
    if (value === null || !Number.isFinite(value)) return unavailable(`FRED ${seriesId}`, "FRED latest value could not be transformed.", 0);

    return live({
      value,
      previousValue,
      timestamp: new Date().toISOString(),
      source: `FRED ${seriesId} ${meta.label} latest observation ${latest.date}`,
      reliability: meta.reliability,
      quality: "delayed",
      sourceType: "API",
      history: observations.map((observation) => ({
        timestamp: new Date(`${observation.date}T00:00:00.000Z`).toISOString(),
        value: observation.value,
      })),
    });
  })();

  fredCache.set(cacheKey, promise);
  return promise;
}

function extractStablecoinUsd(row: unknown): number | null {
  if (!row || typeof row !== "object") return null;
  const candidate = row as Record<string, unknown>;
  const direct = candidate.totalCirculatingUSD;
  if (typeof direct === "number") return direct;
  if (direct && typeof direct === "object") {
    const pegged = (direct as Record<string, unknown>).peggedUSD;
    if (typeof pegged === "number") return pegged;
  }
  return null;
}

async function fetchStablecoinMarketCapTrend() {
  const data = await fetchJson<unknown[]>("https://stablecoins.llama.fi/stablecoincharts/all");
  if (!Array.isArray(data) || data.length < 8) return null;
  const last = extractStablecoinUsd(data[data.length - 1]);
  const weekAgo = extractStablecoinUsd(data[Math.max(0, data.length - 8)]);
  if (last === null || weekAgo === null) return null;
  const change = percentChange(last, weekAgo);
  if (change === null) return null;
  return live({
    value: change,
    previousValue: 0,
    timestamp: new Date().toISOString(),
    source: "DefiLlama stablecoin market cap chart",
    reliability: 88,
    quality: "delayed",
    sourceType: "API",
    history: data
      .map((row) => {
        const value = extractStablecoinUsd(row);
        const date = typeof row === "object" && row !== null ? (row as Record<string, unknown>).date : null;
        const timestamp = typeof date === "number" ? new Date(date * 1000).toISOString() : null;
        return value !== null && timestamp ? { timestamp, value } : null;
      })
      .filter((row): row is DataSeriesPoint => Boolean(row))
      .slice(-180),
  });
}

async function fetchStablecoinMarketCapChange(daysBack: 7 | 30) {
  const data = await fetchJson<unknown[]>("https://stablecoins.llama.fi/stablecoincharts/all");
  if (!Array.isArray(data) || data.length < daysBack + 1) return null;
  const last = extractStablecoinUsd(data[data.length - 1]);
  const previous = extractStablecoinUsd(data[Math.max(0, data.length - 1 - daysBack)]);
  if (last === null || previous === null) return null;
  const change = percentChange(last, previous);
  if (change === null) return null;
  return live({
    value: change,
    previousValue: 0,
    timestamp: new Date().toISOString(),
    source: `DefiLlama stablecoin market cap ${daysBack}d change`,
    reliability: 88,
    quality: "delayed",
    sourceType: "API",
    history: data
      .map((row) => {
        const value = extractStablecoinUsd(row);
        const date = typeof row === "object" && row !== null ? (row as Record<string, unknown>).date : null;
        const timestamp = typeof date === "number" ? new Date(date * 1000).toISOString() : null;
        return value !== null && timestamp ? { timestamp, value } : null;
      })
      .filter((row): row is DataSeriesPoint => Boolean(row))
      .slice(-180),
  });
}

async function fetchStablecoinTotalMarketCap() {
  const data = await fetchJson<unknown[]>("https://stablecoins.llama.fi/stablecoincharts/all");
  if (!Array.isArray(data) || !data.length) return null;
  const last = extractStablecoinUsd(data[data.length - 1]);
  if (last === null) return null;
  return live({
    value: last,
    previousValue: null,
    timestamp: new Date().toISOString(),
    source: "DefiLlama total stablecoin market cap",
    reliability: 88,
    quality: "delayed",
    sourceType: "API",
  });
}

type CoinGeckoGlobal = {
  data?: {
    total_market_cap?: {
      usd?: number;
    };
  };
};

async function fetchStablecoinDominance() {
  const [stablecoins, global] = await Promise.all([
    fetchStablecoinTotalMarketCap(),
    fetchJson<CoinGeckoGlobal>("https://api.coingecko.com/api/v3/global"),
  ]);
  const stablecoinMarketCap = stablecoins?.value;
  const totalMarketCap = global?.data?.total_market_cap?.usd;
  if (typeof stablecoinMarketCap !== "number" || typeof totalMarketCap !== "number" || totalMarketCap <= 0) {
    return unavailable("DefiLlama + CoinGecko stablecoin dominance", "Stablecoin dominance requires total stablecoin cap and total crypto market cap from real sources.", 0);
  }
  return live({
    value: (stablecoinMarketCap / totalMarketCap) * 100,
    previousValue: null,
    timestamp: new Date().toISOString(),
    source: "DefiLlama stablecoin cap / CoinGecko global market cap",
    reliability: 82,
    quality: "delayed",
    sourceType: "API",
  });
}

type StablecoinListResponse = {
  peggedAssets?: Array<{
    id?: string;
    symbol?: string;
    circulating?: { peggedUSD?: number };
    circulatingPrevDay?: { peggedUSD?: number };
    circulatingPrevWeek?: { peggedUSD?: number };
  }>;
};

async function fetchStablecoinAssetTrend(symbol: "USDT" | "USDC") {
  const data = await fetchJson<StablecoinListResponse>("https://stablecoins.llama.fi/stablecoins?includePrices=true");
  const asset = data?.peggedAssets?.find((item) => item.symbol?.toUpperCase() === symbol);
  const current = asset?.circulating?.peggedUSD;
  const previous = asset?.circulatingPrevWeek?.peggedUSD ?? asset?.circulatingPrevDay?.peggedUSD;
  if (typeof current !== "number" || typeof previous !== "number") return null;
  const change = percentChange(current, previous);
  if (change === null) return null;
  return live({
    value: change,
    previousValue: 0,
    timestamp: new Date().toISOString(),
    source: `DefiLlama ${symbol} circulating supply`,
    reliability: symbol === "USDT" ? 88 : 86,
    quality: "delayed",
    sourceType: "API",
  });
}

async function fetchCoinGeckoMarketCap(id: "bitcoin" | "ethereum" | "solana") {
  const data = await fetchCoinGeckoMarketChart(id, 7);
  const marketCaps = data?.market_caps ?? [];
  if (!marketCaps.length) return null;
  const latest = marketCaps[marketCaps.length - 1];
  const previous = marketCaps.length > 1 ? marketCaps[marketCaps.length - 2] : null;
  const value = Number(latest[1]);
  if (!Number.isFinite(value)) return null;
  return live({
    value,
    previousValue: previous ? Number(previous[1]) : null,
    timestamp: new Date(latest[0]).toISOString(),
    source: `CoinGecko public market cap ${id}`,
    reliability: 76,
    quality: "delayed",
    sourceType: "API",
    history: marketChartHistory(marketCaps),
  });
}

async function fetchFundingRate(symbol: "BTCUSDT" | "ETHUSDT" | "SOLUSDT" = "BTCUSDT") {
  const data = await fetchJson<{ lastFundingRate?: string; time?: number }>(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${symbol}`);
  const rate = Number(data?.lastFundingRate);
  if (!Number.isFinite(rate)) return null;
  return live({
    value: rate * 100,
    previousValue: null,
    timestamp: data?.time ? new Date(data.time).toISOString() : new Date().toISOString(),
    source: `Binance Futures public funding rate ${symbol}`,
    reliability: 82,
  });
}

async function fetchOpenInterestTrend(symbol: "BTCUSDT" | "ETHUSDT" | "SOLUSDT" = "BTCUSDT") {
  const data = await fetchJson<Array<{ sumOpenInterestValue?: string; timestamp?: number }>>(`https://fapi.binance.com/futures/data/openInterestHist?symbol=${symbol}&period=1h&limit=25`);
  if (!data?.length || data.length < 2) return null;
  const first = Number(data[0].sumOpenInterestValue);
  const last = Number(data[data.length - 1].sumOpenInterestValue);
  const previous = Number(data[data.length - 2].sumOpenInterestValue);
  const change = percentChange(last, first);
  const previousChange = percentChange(previous, first);
  if (change === null || previousChange === null) return null;
  const lastRow = data[data.length - 1];
  return live({
    value: change,
    previousValue: previousChange,
    timestamp: lastRow?.timestamp ? new Date(lastRow.timestamp).toISOString() : new Date().toISOString(),
    source: `Binance Futures public open interest history ${symbol}`,
    reliability: 80,
  });
}

function stripXml(value: string) {
  return value.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function parseRssTitles(xml: string) {
  return Array.from(xml.matchAll(/<item[\s\S]*?<title>([\s\S]*?)<\/title>[\s\S]*?<\/item>/gi))
    .map((match) => stripXml(match[1]))
    .filter(Boolean)
    .slice(0, 40);
}

const macroNegativeTerms = ["hawkish", "higher for longer", "inflation", "yield", "yields rise", "rates rise", "tariff", "sanction", "selloff", "risk-off"];
const macroPositiveTerms = ["rate cut", "dovish", "liquidity", "inflow", "approval", "easing", "soft landing", "rally"];
const geopoliticalTerms = ["war", "attack", "sanction", "nato", "opec", "treasury", "white house", "oil", "iran", "russia", "china", "security"];

function scoreTitles(titles: string[]) {
  const text = titles.join(" ").toLowerCase();
  const negative = macroNegativeTerms.reduce((count, term) => count + (text.includes(term) ? 1 : 0), 0);
  const positive = macroPositiveTerms.reduce((count, term) => count + (text.includes(term) ? 1 : 0), 0);
  return Math.max(-100, Math.min(100, (positive - negative) * 12));
}

async function fetchNewsScore(kind: "macro" | "geopolitical") {
  const feeds =
    kind === "macro"
      ? [
          "https://www.federalreserve.gov/feeds/press_all.xml",
          "https://www.cnbc.com/id/100003114/device/rss/rss.html",
          "https://www.coindesk.com/arc/outboundfeeds/rss/",
          "https://cointelegraph.com/rss",
        ]
      : [
          "https://home.treasury.gov/news/press-releases/rss",
          "https://www.whitehouse.gov/briefing-room/feed/",
          "https://www.nato.int/cps/en/natohq/rss.xml",
          "https://www.cnbc.com/id/100003114/device/rss/rss.html",
        ];
  const texts = await Promise.all(feeds.map(fetchText));
  const titles = texts.flatMap((text) => (text ? parseRssTitles(text) : []));
  if (!titles.length) return null;
  if (kind === "geopolitical") {
    const joined = titles.join(" ").toLowerCase();
    const hits = geopoliticalTerms.reduce((count, term) => count + (joined.includes(term) ? 1 : 0), 0);
    return live({
      value: Math.min(100, hits * 11),
      previousValue: 0,
      timestamp: new Date().toISOString(),
    source: "Official RSS basket: Treasury / White House / NATO / CNBC",
    reliability: 82,
    quality: "delayed",
    sourceType: "RSS",
    });
  }

  return live({
    value: scoreTitles(titles),
    previousValue: 0,
    timestamp: new Date().toISOString(),
    source: "RSS basket: Fed / CNBC / CoinDesk / Cointelegraph",
    reliability: 80,
    quality: "delayed",
    sourceType: "RSS",
  });
}

async function fetchEnvNumeric(key: string, source: string, reliability: number) {
  const value = Number(process.env[key]);
  if (!Number.isFinite(value)) return null;
  return live({
    value,
    previousValue: null,
    timestamp: process.env[`${key}_TIMESTAMP`] ?? new Date().toISOString(),
    source,
    reliability,
    quality: "delayed",
  });
}

const fallbackValues: Record<string, { value: number; previousValue: number; source: string; reliability: number; reason: string }> = {
  btc_trend_24h: { value: -1.8, previousValue: 0.4, source: "Binance BTCUSDT public endpoint", reliability: 82, reason: "دریافت عمومی Binance در این runtime ناموفق بود؛ فقط با فعال‌سازی توسعه از snapshot استفاده می‌شود." },
  eth_trend_24h: { value: -1.1, previousValue: 0.2, source: "Binance ETHUSDT public endpoint", reliability: 82, reason: "دریافت عمومی Binance در این runtime ناموفق بود؛ فقط با فعال‌سازی توسعه از snapshot استفاده می‌شود." },
  sol_trend_24h: { value: -3.4, previousValue: 1.2, source: "Binance SOLUSDT public endpoint", reliability: 80, reason: "دریافت عمومی Binance در این runtime ناموفق بود؛ فقط با فعال‌سازی توسعه از snapshot استفاده می‌شود." },
  nasdaq_trend_24h: { value: -0.9, previousValue: 0.3, source: "Yahoo Finance / Nasdaq delayed feed", reliability: 80, reason: "خوراک Yahoo Finance در این runtime در دسترس نبود." },
  dxy_trend_24h: { value: 0.7, previousValue: 0.2, source: "Yahoo Finance DXY delayed feed", reliability: 82, reason: "خوراک DXY در این runtime در دسترس نبود." },
  us10y_trend_24h: { value: 0.11, previousValue: 0.03, source: "Yahoo Finance / US10Y delayed feed", reliability: 84, reason: "خوراک بازده ۱۰ ساله در این runtime در دسترس نبود." },
  gold_trend_24h: { value: 0.8, previousValue: 0.1, source: "Yahoo Finance / Gold delayed feed", reliability: 80, reason: "خوراک طلا در این runtime در دسترس نبود." },
  vix_trend_24h: { value: 7.6, previousValue: 1.9, source: "Yahoo Finance / VIX delayed feed", reliability: 78, reason: "خوراک VIX در این runtime در دسترس نبود." },
  usdt_supply_7d: { value: 0.9, previousValue: 0.3, source: "DefiLlama stablecoins", reliability: 86, reason: "داده DefiLlama در این runtime در دسترس نبود." },
  usdc_supply_7d: { value: -0.2, previousValue: 0.1, source: "DefiLlama stablecoins", reliability: 84, reason: "داده DefiLlama در این runtime در دسترس نبود." },
  stablecoin_market_cap_7d: { value: 0.5, previousValue: 0.2, source: "DefiLlama stablecoins", reliability: 86, reason: "داده DefiLlama در این runtime در دسترس نبود." },
  funding_btc: { value: 0.018, previousValue: 0.009, source: "Binance Futures funding", reliability: 82, reason: "داده Funding در این runtime در دسترس نبود." },
  open_interest_btc_24h: { value: 5.2, previousValue: 1.4, source: "Binance Futures open interest", reliability: 80, reason: "داده Open Interest در این runtime در دسترس نبود." },
  spot_volume_btc_24h: { value: -8.4, previousValue: 3.1, source: "Binance spot volume", reliability: 82, reason: "داده حجم اسپات در این runtime در دسترس نبود." },
  futures_volume_btc_24h: { value: 12.5, previousValue: 4.8, source: "Binance futures volume", reliability: 78, reason: "داده حجم فیوچرز در این runtime در دسترس نبود." },
  news_sentiment_macro: { value: -42, previousValue: -18, source: "Official/RSS news basket", reliability: 80, reason: "RSSهای خبری در این runtime در دسترس نبودند." },
  geopolitical_event_score: { value: 64, previousValue: 41, source: "Official geopolitical RSS basket", reliability: 82, reason: "RSSهای رسمی ژئوپلیتیک در این runtime در دسترس نبودند." },
};

function fallbackPoint(key: string): AdapterResult {
  const fallback = fallbackValues[key];
  if (!fallback) return unavailable("C.M.I.P adapter registry", `برای ${key} adapter تعریف نشده است.`);
  return devFallback(fallback);
}

export const marketDataAdapter: DataAdapter = {
  id: "marketDataAdapter",
  async fetchPoint(key) {
    if (key === "btc_trend_24h") return (await fetchBinanceTrend("BTCUSDT")) ?? (await fetchCoinGeckoTrend("bitcoin")) ?? fallbackPoint(key);
    if (key === "eth_trend_24h") return (await fetchBinanceTrend("ETHUSDT")) ?? (await fetchCoinGeckoTrend("ethereum")) ?? fallbackPoint(key);
    if (key === "sol_trend_24h") return (await fetchBinanceTrend("SOLUSDT")) ?? (await fetchCoinGeckoTrend("solana")) ?? fallbackPoint(key);
    if (key === "btc_market_cap") return (await fetchCoinGeckoMarketCap("bitcoin")) ?? unavailable("CoinGecko BTC market cap", "CoinGecko BTC market cap unavailable.");
    if (key === "eth_market_cap") return (await fetchCoinGeckoMarketCap("ethereum")) ?? unavailable("CoinGecko ETH market cap", "CoinGecko ETH market cap unavailable.");
    if (key === "sol_market_cap") return (await fetchCoinGeckoMarketCap("solana")) ?? unavailable("CoinGecko SOL market cap", "CoinGecko SOL market cap unavailable.");
    if (key === "spot_volume_btc_24h") return (await fetchBinanceVolumeTrend("BTCUSDT")) ?? (await fetchCoinGeckoVolumeTrend("bitcoin")) ?? fallbackPoint(key);
    if (key === "spot_volume_eth_24h") return (await fetchBinanceVolumeTrend("ETHUSDT")) ?? unavailable("Binance ETH spot volume", "ETH spot volume unavailable.");
    if (key === "spot_volume_sol_24h") return (await fetchBinanceVolumeTrend("SOLUSDT")) ?? unavailable("Binance SOL spot volume", "SOL spot volume unavailable.");
    if (key === "futures_volume_btc_24h") return (await fetchBinanceVolumeTrend("BTCUSDT", true)) ?? fallbackPoint(key);
    if (key === "futures_volume_eth_24h") return (await fetchBinanceVolumeTrend("ETHUSDT", true)) ?? unavailable("Binance ETH futures volume", "ETH futures volume unavailable.");
    if (key === "futures_volume_sol_24h") return (await fetchBinanceVolumeTrend("SOLUSDT", true)) ?? unavailable("Binance SOL futures volume", "SOL futures volume unavailable.");
    return fallbackPoint(key);
  },
};

export const macroDataAdapter: DataAdapter = {
  id: "macroDataAdapter",
  async fetchPoint(key) {
    if (key === "nasdaq_trend_24h") return (await fetchYahooTrend("^IXIC", "Yahoo Finance delayed Nasdaq Composite", 80)) ?? fallbackPoint(key);
    if (key === "dxy_trend_24h") {
      return process.env.FRED_API_KEY
        ? (await fetchFredSeries("DTWEXBGS", "percent_change")) ?? (await fetchYahooTrend("DX-Y.NYB", "Yahoo Finance delayed DXY", 82)) ?? fallbackPoint(key)
        : (await fetchYahooTrend("DX-Y.NYB", "Yahoo Finance delayed DXY", 82)) ?? fallbackPoint(key);
    }
    if (key === "gold_trend_24h") return (await fetchYahooTrend("GC=F", "Yahoo Finance delayed Gold futures", 80)) ?? fallbackPoint(key);
    if (key === "us10y_trend_24h") {
      return process.env.FRED_API_KEY
        ? (await fetchFredSeries("DGS10", "point_change")) ?? (await fetchYahooTrend("^TNX", "Yahoo Finance delayed US10Y yield", 84, "point")) ?? fallbackPoint(key)
        : (await fetchYahooTrend("^TNX", "Yahoo Finance delayed US10Y yield", 84, "point")) ?? fallbackPoint(key);
    }
    if (key === "us2y_trend_24h") return (await fetchFredSeries("DGS2", "point_change")) ?? unavailable("FRED DGS2", "US2Y requires FRED_API_KEY or successful FRED fetch.");
    if (key === "yield_curve_10y2y") return (await fetchFredSeries("T10Y2Y", "latest")) ?? unavailable("FRED T10Y2Y", "Yield spread requires FRED_API_KEY or successful FRED fetch.");
    if (key === "cpi_latest") return (await fetchFredSeries("CPIAUCSL", "latest")) ?? unavailable("FRED CPIAUCSL", "CPI requires FRED_API_KEY.");
    if (key === "ppi_latest") return (await fetchFredSeries("PPIACO", "latest")) ?? unavailable("FRED PPIACO", "PPI requires FRED_API_KEY.");
    if (key === "fed_funds_rate") return (await fetchFredSeries("FEDFUNDS", "latest")) ?? unavailable("FRED FEDFUNDS", "Fed Funds Rate requires FRED_API_KEY.");
    if (key === "unemployment_rate") return (await fetchFredSeries("UNRATE", "latest")) ?? unavailable("FRED UNRATE", "Employment data requires FRED_API_KEY.");
    if (key === "vix_trend_24h") return (await fetchYahooTrend("^VIX", "Yahoo Finance delayed VIX", 78)) ?? fallbackPoint(key);
    return fallbackPoint(key);
  },
};

export const newsAdapter: DataAdapter = {
  id: "newsAdapter",
  async fetchPoint(key) {
    if (key === "geopolitical_event_score") return (await fetchNewsScore("geopolitical")) ?? fallbackPoint(key);
    return fallbackPoint(key);
  },
};

export const sentimentAdapter: DataAdapter = {
  id: "sentimentAdapter",
  async fetchPoint(key) {
    if (key === "news_sentiment_macro") return (await fetchNewsScore("macro")) ?? fallbackPoint(key);
    return fallbackPoint(key);
  },
};

export const etfFlowAdapter: DataAdapter = {
  id: "etfFlowAdapter",
  async fetchPoint(key) {
    if (key === "btc_etf_flow_24h") {
      const snapshot = await getEtfFlows("BTC", "24h");
      if (snapshot.netFlow24h !== null) return live({ value: snapshot.netFlow24h, previousValue: null, timestamp: snapshot.timestamp, source: snapshot.source, reliability: 88, quality: snapshot.freshness === "stale" ? "delayed" : "partial_live", sourceType: "API" });
      return unavailable(snapshot.source, snapshot.error ?? "BTC ETF flow source is missing.", 0);
    }
    if (key === "eth_etf_flow_24h") {
      const snapshot = await getEtfFlows("ETH", "24h");
      if (snapshot.netFlow24h !== null) return live({ value: snapshot.netFlow24h, previousValue: null, timestamp: snapshot.timestamp, source: snapshot.source, reliability: 78, quality: snapshot.freshness === "stale" ? "delayed" : "partial_live", sourceType: "API" });
      return unavailable(snapshot.source, snapshot.error ?? "ETH ETF flow source is missing.", 0);
    }
    return fallbackPoint(key);
  },
};

export const stablecoinAdapter: DataAdapter = {
  id: "stablecoinAdapter",
  async fetchPoint(key) {
    if (key === "stablecoin_market_cap_7d") return (await fetchStablecoinMarketCapTrend()) ?? fallbackPoint(key);
    if (key === "stablecoin_market_cap_30d") return (await fetchStablecoinMarketCapChange(30)) ?? unavailable("DefiLlama stablecoin market cap 30d", "Stablecoin 30d change unavailable.");
    if (key === "total_stablecoin_market_cap_usd") return (await fetchStablecoinTotalMarketCap()) ?? unavailable("DefiLlama stablecoin market cap", "Total stablecoin market cap unavailable.");
    if (key === "stablecoin_dominance") return (await fetchStablecoinDominance()) ?? unavailable("DefiLlama + CoinGecko stablecoin dominance", "Stablecoin dominance cannot be calculated without real total crypto market cap.");
    if (key === "usdt_supply_7d") return (await fetchStablecoinAssetTrend("USDT")) ?? fallbackPoint(key);
    if (key === "usdc_supply_7d") return (await fetchStablecoinAssetTrend("USDC")) ?? fallbackPoint(key);
    return fallbackPoint(key);
  },
};

export const onchainAdapter: DataAdapter = {
  id: "onchainAdapter",
  async fetchPoint(key) {
    if (key === "exchange_reserves_btc_7d") {
      return (await fetchEnvNumeric("CMIP_BTC_EXCHANGE_RESERVES_7D", "Configured Glassnode/CryptoQuant exchange reserves feed", 88)) ?? unavailable("Exchange reserves adapter", "Exchange reserve source is not configured; no fallback value is generated.");
    }
    if (key === "exchange_inflows" || key === "exchange_outflows") return unavailable("Exchange flow adapter", "Exchange inflow/outflow source is not configured; no fallback value is generated.");
    return fallbackPoint(key);
  },
};

export const correlationAdapter: DataAdapter = {
  id: "correlationAdapter",
  async fetchPoint(key) {
    if (key === "funding_btc") return (await fetchFundingRate("BTCUSDT")) ?? fallbackPoint(key);
    if (key === "funding_eth") return (await fetchFundingRate("ETHUSDT")) ?? unavailable("Binance ETH funding", "ETH funding unavailable.");
    if (key === "funding_sol") return (await fetchFundingRate("SOLUSDT")) ?? unavailable("Binance SOL funding", "SOL funding unavailable.");
    if (key === "open_interest_btc_24h") return (await fetchOpenInterestTrend("BTCUSDT")) ?? fallbackPoint(key);
    if (key === "open_interest_eth_24h") return (await fetchOpenInterestTrend("ETHUSDT")) ?? unavailable("Binance ETH open interest", "ETH open interest unavailable.");
    if (key === "open_interest_sol_24h") return (await fetchOpenInterestTrend("SOLUSDT")) ?? unavailable("Binance SOL open interest", "SOL open interest unavailable.");
    return fallbackPoint(key);
  },
};

export const regimeAdapter: DataAdapter = { id: "regimeAdapter", fetchPoint: async (key) => fallbackPoint(key) };
export const alertAdapter: DataAdapter = { id: "alertAdapter", fetchPoint: async (key) => fallbackPoint(key) };

const adapterByKey: Record<string, { adapter: DataAdapter; group: SignalGroup }> = {
  btc_trend_24h: { adapter: marketDataAdapter, group: "price" },
  eth_trend_24h: { adapter: marketDataAdapter, group: "price" },
  sol_trend_24h: { adapter: marketDataAdapter, group: "price" },
  btc_market_cap: { adapter: marketDataAdapter, group: "price" },
  eth_market_cap: { adapter: marketDataAdapter, group: "price" },
  sol_market_cap: { adapter: marketDataAdapter, group: "price" },
  nasdaq_trend_24h: { adapter: macroDataAdapter, group: "macro" },
  dxy_trend_24h: { adapter: macroDataAdapter, group: "macro" },
  us10y_trend_24h: { adapter: macroDataAdapter, group: "macro" },
  us2y_trend_24h: { adapter: macroDataAdapter, group: "macro" },
  yield_curve_10y2y: { adapter: macroDataAdapter, group: "macro" },
  cpi_latest: { adapter: macroDataAdapter, group: "macro" },
  ppi_latest: { adapter: macroDataAdapter, group: "macro" },
  fed_funds_rate: { adapter: macroDataAdapter, group: "macro" },
  unemployment_rate: { adapter: macroDataAdapter, group: "macro" },
  gold_trend_24h: { adapter: macroDataAdapter, group: "macro" },
  vix_trend_24h: { adapter: macroDataAdapter, group: "volatility" },
  usdt_supply_7d: { adapter: stablecoinAdapter, group: "stablecoins" },
  usdc_supply_7d: { adapter: stablecoinAdapter, group: "stablecoins" },
  stablecoin_market_cap_7d: { adapter: stablecoinAdapter, group: "liquidity" },
  stablecoin_market_cap_30d: { adapter: stablecoinAdapter, group: "liquidity" },
  total_stablecoin_market_cap_usd: { adapter: stablecoinAdapter, group: "stablecoins" },
  stablecoin_dominance: { adapter: stablecoinAdapter, group: "stablecoins" },
  btc_etf_flow_24h: { adapter: etfFlowAdapter, group: "flows" },
  eth_etf_flow_24h: { adapter: etfFlowAdapter, group: "flows" },
  funding_btc: { adapter: correlationAdapter, group: "leverage" },
  funding_eth: { adapter: correlationAdapter, group: "leverage" },
  funding_sol: { adapter: correlationAdapter, group: "leverage" },
  open_interest_btc_24h: { adapter: correlationAdapter, group: "leverage" },
  open_interest_eth_24h: { adapter: correlationAdapter, group: "leverage" },
  open_interest_sol_24h: { adapter: correlationAdapter, group: "leverage" },
  spot_volume_btc_24h: { adapter: marketDataAdapter, group: "liquidity" },
  spot_volume_eth_24h: { adapter: marketDataAdapter, group: "liquidity" },
  spot_volume_sol_24h: { adapter: marketDataAdapter, group: "liquidity" },
  futures_volume_btc_24h: { adapter: marketDataAdapter, group: "leverage" },
  futures_volume_eth_24h: { adapter: marketDataAdapter, group: "leverage" },
  futures_volume_sol_24h: { adapter: marketDataAdapter, group: "leverage" },
  exchange_reserves_btc_7d: { adapter: onchainAdapter, group: "onchain" },
  exchange_inflows: { adapter: onchainAdapter, group: "onchain" },
  exchange_outflows: { adapter: onchainAdapter, group: "onchain" },
  news_sentiment_macro: { adapter: sentimentAdapter, group: "sentiment" },
  geopolitical_event_score: { adapter: newsAdapter, group: "geopolitical" },
};

export const requiredSignalKeys = Object.keys(adapterByKey);

const descriptorByKey: Record<string, { asset: AssetSymbol | "VIX" | "Stablecoins"; metric: string; sourceType: SourceType }> = {
  btc_trend_24h: { asset: "BTC", metric: "price_trend_24h_pct", sourceType: "API" },
  eth_trend_24h: { asset: "ETH", metric: "price_trend_24h_pct", sourceType: "API" },
  sol_trend_24h: { asset: "SOL", metric: "price_trend_24h_pct", sourceType: "API" },
  btc_market_cap: { asset: "BTC", metric: "market_cap_usd", sourceType: "API" },
  eth_market_cap: { asset: "ETH", metric: "market_cap_usd", sourceType: "API" },
  sol_market_cap: { asset: "SOL", metric: "market_cap_usd", sourceType: "API" },
  nasdaq_trend_24h: { asset: "Nasdaq", metric: "price_trend_24h_pct", sourceType: "API" },
  dxy_trend_24h: { asset: "DXY", metric: "price_trend_24h_pct", sourceType: "API" },
  us10y_trend_24h: { asset: "US10Y", metric: "yield_change_pct_point", sourceType: "API" },
  us2y_trend_24h: { asset: "US10Y", metric: "us2y_yield_change_pct_point", sourceType: "API" },
  yield_curve_10y2y: { asset: "US10Y", metric: "yield_curve_10y2y_pct_point", sourceType: "API" },
  cpi_latest: { asset: "Fed", metric: "cpi_index_latest", sourceType: "API" },
  ppi_latest: { asset: "Fed", metric: "ppi_index_latest", sourceType: "API" },
  fed_funds_rate: { asset: "Fed", metric: "fed_funds_rate_pct", sourceType: "API" },
  unemployment_rate: { asset: "Fed", metric: "unemployment_rate_pct", sourceType: "API" },
  gold_trend_24h: { asset: "Gold", metric: "price_trend_24h_pct", sourceType: "API" },
  vix_trend_24h: { asset: "VIX", metric: "volatility_trend_24h_pct", sourceType: "API" },
  usdt_supply_7d: { asset: "USDT", metric: "supply_change_7d_pct", sourceType: "API" },
  usdc_supply_7d: { asset: "Stablecoins", metric: "usdc_supply_change_7d_pct", sourceType: "API" },
  stablecoin_market_cap_7d: { asset: "Stablecoins", metric: "market_cap_change_7d_pct", sourceType: "API" },
  stablecoin_market_cap_30d: { asset: "Stablecoins", metric: "market_cap_change_30d_pct", sourceType: "API" },
  total_stablecoin_market_cap_usd: { asset: "Stablecoins", metric: "total_stablecoin_market_cap_usd", sourceType: "API" },
  stablecoin_dominance: { asset: "Stablecoins", metric: "stablecoin_dominance_pct", sourceType: "API" },
  btc_etf_flow_24h: { asset: "BTC", metric: "etf_net_flow_24h_usd", sourceType: "API" },
  eth_etf_flow_24h: { asset: "ETH", metric: "etf_net_flow_24h_usd", sourceType: "API" },
  funding_btc: { asset: "BTC", metric: "funding_rate_pct", sourceType: "API" },
  funding_eth: { asset: "ETH", metric: "funding_rate_pct", sourceType: "API" },
  funding_sol: { asset: "SOL", metric: "funding_rate_pct", sourceType: "API" },
  open_interest_btc_24h: { asset: "BTC", metric: "open_interest_change_24h_pct", sourceType: "API" },
  open_interest_eth_24h: { asset: "ETH", metric: "open_interest_change_24h_pct", sourceType: "API" },
  open_interest_sol_24h: { asset: "SOL", metric: "open_interest_change_24h_pct", sourceType: "API" },
  spot_volume_btc_24h: { asset: "BTC", metric: "spot_volume_change_24h_pct", sourceType: "API" },
  spot_volume_eth_24h: { asset: "ETH", metric: "spot_volume_change_24h_pct", sourceType: "API" },
  spot_volume_sol_24h: { asset: "SOL", metric: "spot_volume_change_24h_pct", sourceType: "API" },
  futures_volume_btc_24h: { asset: "BTC", metric: "futures_volume_change_24h_pct", sourceType: "API" },
  futures_volume_eth_24h: { asset: "ETH", metric: "futures_volume_change_24h_pct", sourceType: "API" },
  futures_volume_sol_24h: { asset: "SOL", metric: "futures_volume_change_24h_pct", sourceType: "API" },
  exchange_reserves_btc_7d: { asset: "BTC", metric: "exchange_reserves_change_7d_pct", sourceType: "premium" },
  exchange_inflows: { asset: "USDT", metric: "exchange_inflows_usd", sourceType: "premium" },
  exchange_outflows: { asset: "USDT", metric: "exchange_outflows_usd", sourceType: "premium" },
  news_sentiment_macro: { asset: "BTC", metric: "macro_news_sentiment_score", sourceType: "RSS" },
  geopolitical_event_score: { asset: "Gold", metric: "geopolitical_event_score", sourceType: "RSS" },
};

function enrichPoint(key: string, result: AdapterResult, group: SignalGroup): DataPoint {
  const descriptor = descriptorByKey[key];
  const value = typeof result.value === "number" ? result.value : null;
  const previousValue = typeof result.previousValue === "number" ? result.previousValue : null;
  const timestamp = result.timestamp;
  const delayMinutes = timestamp ? Math.max(0, Math.round((Date.now() - new Date(timestamp).getTime()) / 60_000)) : undefined;
  const changeAbs = value !== null && previousValue !== null ? Number((value - previousValue).toFixed(4)) : null;
  const changePct = value !== null && previousValue !== null && previousValue !== 0 ? Number((((value - previousValue) / Math.abs(previousValue)) * 100).toFixed(4)) : null;

  return {
    id: key,
    key,
    asset: descriptor?.asset,
    metric: descriptor?.metric ?? key,
    value,
    previousValue,
    changeAbs,
    changePct,
    timestamp,
    delayMinutes,
    source: result.source,
    sourceType: result.sourceType ?? descriptor?.sourceType ?? "API",
    quality: result.quality,
    reliability: result.reliability,
    confidenceBase: result.reliability,
    sampleSize: result.sampleSize ?? result.history?.length ?? result.intradayHistory?.length ?? (value === null ? 0 : 1),
    history: result.history,
    intradayHistory: result.intradayHistory,
    group,
    error: result.error,
    estimatedReason: result.estimatedReason,
  };
}

export async function fetchCurrentDataPoints(keys = requiredSignalKeys): Promise<DataPoint[]> {
  const results = await Promise.all(
    keys.map(async (key) => {
      const registry = adapterByKey[key];
      if (!registry) {
        return enrichPoint(key, unavailable("C.M.I.P adapter registry", `برای ${key} adapter ثبت نشده است.`), "price");
      }
      const result = await registry.adapter.fetchPoint(key);
      return enrichPoint(key, result, registry.group);
    }),
  );

  return results;
}

export function getDevelopmentDataPoints(keys = requiredSignalKeys): DataPoint[] {
  return keys.map((key) => {
    const registry = adapterByKey[key];
    const result = fallbackPoint(key);
    return enrichPoint(key, result, registry?.group ?? "price");
  });
}
