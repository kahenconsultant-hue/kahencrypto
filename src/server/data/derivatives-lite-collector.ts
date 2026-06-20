import { TARGET_ASSETS, type TargetAssetSymbol } from "@/lib/assets/targetAssets";

export type DerivativesAssetSymbol = Exclude<TargetAssetSymbol, "USDT">;
export type DerivativesProvider = "Binance" | "Bybit" | "OKX";
export type TrendDirection = "rising" | "falling" | "flat";

export type DerivativesProviderDiagnostic = {
  provider: DerivativesProvider;
  endpoint: string;
  status: "success" | "failed" | "skipped";
  httpStatus: number | null;
  durationMs: number;
  error: string | null;
};

export type DerivativesRawAssetSnapshot = {
  asset: DerivativesAssetSymbol;
  symbol: string | null;
  derivativesAvailable: boolean;
  sourceUsed: string | null;
  latestFundingRate: number | null;
  fundingRate24hAvg: number | null;
  fundingRate7dAvg: number | null;
  fundingRateDirection: TrendDirection | null;
  latestFundingTimestamp: string | null;
  latestOpenInterest: number | null;
  latestOpenInterestUsdValue: number | null;
  openInterest24hChangePct: number | null;
  openInterest7dChangePct: number | null;
  openInterestTrend: TrendDirection | null;
  latestOiTimestamp: string | null;
  longShortRatio: number | null;
  longShortTimestamp: string | null;
  liquidationProxy: null;
  missingFields: string[];
  fetchedAt: string;
  latestDataTimestamp: string | null;
  sourcesTried: DerivativesProvider[];
  sourcesSucceeded: DerivativesProvider[];
  diagnostics: DerivativesProviderDiagnostic[];
};

export type DerivativesLiteCollection = {
  mode: "lite_public_exchange_api";
  assets: DerivativesRawAssetSnapshot[];
  fetchedAt: string;
  sourcesTried: DerivativesProvider[];
  sourcesSucceeded: DerivativesProvider[];
  failedSymbols: string[];
  staleSymbols: string[];
  rateLimitEvents: number;
  parseErrors: number;
  diagnostics: DerivativesProviderDiagnostic[];
};

type JsonResult<T> = {
  data: T | null;
  status: number | null;
  durationMs: number;
  error: string | null;
};

type FundingPoint = { timestamp: number; ratePct: number };
type OiPoint = { timestamp: number; value: number; usdValue: number | null };
type ProviderSnapshot = {
  provider: DerivativesProvider;
  symbol: string;
  funding: FundingPoint[];
  oi: OiPoint[];
  latestOi: number | null;
  latestOiUsd: number | null;
  latestOiTimestamp: number | null;
  longShortRatio: number | null;
  longShortTimestamp: number | null;
  diagnostics: DerivativesProviderDiagnostic[];
};

const ASSETS = TARGET_ASSETS.filter((asset): asset is (typeof TARGET_ASSETS)[number] & { symbol: DerivativesAssetSymbol } => asset.symbol !== "USDT");
const PROVIDERS: DerivativesProvider[] = ["Binance", "Bybit", "OKX"];
const FETCH_TIMEOUT_MS = 5_000;
const CACHE_MS = 2 * 60_000;

let collectionCache: { expiresAt: number; value: DerivativesLiteCollection } | null = null;
let collectionPromise: Promise<DerivativesLiteCollection> | null = null;

function finite(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

function timestamp(value: unknown): number | null {
  const parsed = finite(value);
  return parsed !== null && parsed > 0 ? parsed : null;
}

function iso(value: number | null) {
  return value === null ? null : new Date(value).toISOString();
}

function percentChange(current: number | null, previous: number | null) {
  if (current === null || previous === null || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function trend(value: number | null, epsilon = 0.05): TrendDirection | null {
  if (value === null) return null;
  if (value > epsilon) return "rising";
  if (value < -epsilon) return "falling";
  return "flat";
}

function nearestAtOrBefore(points: OiPoint[], target: number) {
  const sorted = [...points].sort((left, right) => left.timestamp - right.timestamp);
  return [...sorted].reverse().find((point) => point.timestamp <= target) ?? sorted[0] ?? null;
}

function averageFunding(points: FundingPoint[], since: number) {
  const values = points.filter((point) => point.timestamp >= since).map((point) => point.ratePct);
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

async function fetchJson<T>(url: string): Promise<JsonResult<T>> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: "application/json",
        "user-agent": "CMIP-Derivatives-Lite/1.0",
      },
      cache: "no-store",
    });
    const text = await response.text();
    if (!response.ok) {
      return { data: null, status: response.status, durationMs: Date.now() - startedAt, error: text.slice(0, 300) || response.statusText };
    }
    try {
      return { data: JSON.parse(text) as T, status: response.status, durationMs: Date.now() - startedAt, error: null };
    } catch {
      return { data: null, status: response.status, durationMs: Date.now() - startedAt, error: "JSON parser failed." };
    }
  } catch (error) {
    return {
      data: null,
      status: null,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : "Network request failed.",
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function diagnostic(provider: DerivativesProvider, endpoint: string, result: JsonResult<unknown>): DerivativesProviderDiagnostic {
  return {
    provider,
    endpoint,
    status: result.data === null ? "failed" : "success",
    httpStatus: result.status,
    durationMs: result.durationMs,
    error: result.error,
  };
}

async function discoverBinance() {
  const endpoint = "https://fapi.binance.com/fapi/v1/exchangeInfo";
  const result = await fetchJson<{ symbols?: Array<{ symbol?: string; status?: string; contractType?: string; quoteAsset?: string }> }>(endpoint);
  const symbols = new Set(
    (result.data?.symbols ?? [])
      .filter((row) => row.status === "TRADING" && row.contractType === "PERPETUAL" && row.quoteAsset === "USDT")
      .map((row) => row.symbol)
      .filter((value): value is string => Boolean(value)),
  );
  return { symbols, diagnostic: diagnostic("Binance", endpoint, result) };
}

async function discoverBybit() {
  const endpoint = "https://api.bybit.com/v5/market/instruments-info?category=linear&limit=1000";
  const result = await fetchJson<{ retCode?: number; retMsg?: string; result?: { list?: Array<{ symbol?: string; status?: string; settleCoin?: string }> } }>(endpoint);
  const valid = result.data?.retCode === 0;
  const symbols = new Set(
    (valid ? result.data?.result?.list ?? [] : [])
      .filter((row) => row.status === "Trading" && row.settleCoin === "USDT")
      .map((row) => row.symbol)
      .filter((value): value is string => Boolean(value)),
  );
  const normalizedResult: JsonResult<unknown> = valid ? result : { ...result, data: null, error: result.data?.retMsg ?? result.error };
  return { symbols, diagnostic: diagnostic("Bybit", endpoint, normalizedResult) };
}

async function discoverOkx() {
  const endpoint = "https://www.okx.com/api/v5/public/instruments?instType=SWAP";
  const result = await fetchJson<{ code?: string; msg?: string; data?: Array<{ instId?: string; state?: string; ctType?: string; settleCcy?: string }> }>(endpoint);
  const valid = result.data?.code === "0";
  const symbols = new Set(
    (valid ? result.data?.data ?? [] : [])
      .filter((row) => row.state === "live" && row.ctType === "linear" && row.settleCcy === "USDT")
      .map((row) => row.instId)
      .filter((value): value is string => Boolean(value)),
  );
  const normalizedResult: JsonResult<unknown> = valid ? result : { ...result, data: null, error: result.data?.msg ?? result.error };
  return { symbols, diagnostic: diagnostic("OKX", endpoint, normalizedResult) };
}

async function fetchBinanceAsset(symbol: string): Promise<ProviderSnapshot> {
  const endpoints = {
    funding: `https://fapi.binance.com/fapi/v1/fundingRate?symbol=${symbol}&limit=30`,
    currentOi: `https://fapi.binance.com/fapi/v1/openInterest?symbol=${symbol}`,
    oi: `https://fapi.binance.com/futures/data/openInterestHist?symbol=${symbol}&period=1h&limit=168`,
    ratio: `https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=${symbol}&period=1h&limit=1`,
  };
  const [funding, currentOi, oi, ratio] = await Promise.all([
    fetchJson<Array<{ fundingRate?: string; fundingTime?: number }>>(endpoints.funding),
    fetchJson<{ openInterest?: string; time?: number }>(endpoints.currentOi),
    fetchJson<Array<{ sumOpenInterest?: string; sumOpenInterestValue?: string; timestamp?: number }>>(endpoints.oi),
    fetchJson<Array<{ longShortRatio?: string; timestamp?: number }>>(endpoints.ratio),
  ]);
  const oiRows = (oi.data ?? []).map((row) => ({ timestamp: timestamp(row.timestamp) ?? 0, value: finite(row.sumOpenInterest) ?? NaN, usdValue: finite(row.sumOpenInterestValue) })).filter((row) => row.timestamp > 0 && Number.isFinite(row.value));
  const latestHistory = [...oiRows].sort((left, right) => right.timestamp - left.timestamp)[0] ?? null;
  const ratioRow = ratio.data?.[0];
  return {
    provider: "Binance",
    symbol,
    funding: (funding.data ?? []).map((row) => ({ timestamp: timestamp(row.fundingTime) ?? 0, ratePct: (finite(row.fundingRate) ?? NaN) * 100 })).filter((row) => row.timestamp > 0 && Number.isFinite(row.ratePct)),
    oi: oiRows,
    latestOi: finite(currentOi.data?.openInterest) ?? latestHistory?.value ?? null,
    latestOiUsd: latestHistory?.usdValue ?? null,
    latestOiTimestamp: timestamp(currentOi.data?.time) ?? latestHistory?.timestamp ?? null,
    longShortRatio: finite(ratioRow?.longShortRatio),
    longShortTimestamp: timestamp(ratioRow?.timestamp),
    diagnostics: [diagnostic("Binance", endpoints.funding, funding), diagnostic("Binance", endpoints.currentOi, currentOi), diagnostic("Binance", endpoints.oi, oi), diagnostic("Binance", endpoints.ratio, ratio)],
  };
}

async function fetchBybitAsset(symbol: string): Promise<ProviderSnapshot> {
  const endpoints = {
    funding: `https://api.bybit.com/v5/market/funding/history?category=linear&symbol=${symbol}&limit=30`,
    ticker: `https://api.bybit.com/v5/market/tickers?category=linear&symbol=${symbol}`,
    oi: `https://api.bybit.com/v5/market/open-interest?category=linear&symbol=${symbol}&intervalTime=1h&limit=168`,
    ratio: `https://api.bybit.com/v5/market/account-ratio?category=linear&symbol=${symbol}&period=1h&limit=1`,
  };
  type BybitResponse<T> = { retCode?: number; retMsg?: string; result?: { list?: T[] } };
  const [funding, tickerResult, oi, ratio] = await Promise.all([
    fetchJson<BybitResponse<{ fundingRate?: string; fundingRateTimestamp?: string }>>(endpoints.funding),
    fetchJson<BybitResponse<{ openInterest?: string; openInterestValue?: string; fundingRate?: string; nextFundingTime?: string }>>(endpoints.ticker),
    fetchJson<BybitResponse<{ openInterest?: string; timestamp?: string }>>(endpoints.oi),
    fetchJson<BybitResponse<{ buyRatio?: string; sellRatio?: string; timestamp?: string }>>(endpoints.ratio),
  ]);
  const ticker = tickerResult.data?.result?.list?.[0];
  const oiRows = (oi.data?.result?.list ?? []).map((row) => ({ timestamp: timestamp(row.timestamp) ?? 0, value: finite(row.openInterest) ?? NaN, usdValue: null })).filter((row) => row.timestamp > 0 && Number.isFinite(row.value));
  const latestHistory = [...oiRows].sort((left, right) => right.timestamp - left.timestamp)[0] ?? null;
  const ratioRow = ratio.data?.result?.list?.[0];
  const buy = finite(ratioRow?.buyRatio);
  const sell = finite(ratioRow?.sellRatio);
  return {
    provider: "Bybit",
    symbol,
    funding: (funding.data?.result?.list ?? []).map((row) => ({ timestamp: timestamp(row.fundingRateTimestamp) ?? 0, ratePct: (finite(row.fundingRate) ?? NaN) * 100 })).filter((row) => row.timestamp > 0 && Number.isFinite(row.ratePct)),
    oi: oiRows,
    latestOi: finite(ticker?.openInterest) ?? latestHistory?.value ?? null,
    latestOiUsd: finite(ticker?.openInterestValue),
    latestOiTimestamp: latestHistory?.timestamp ?? null,
    longShortRatio: buy !== null && sell !== null && sell !== 0 ? buy / sell : null,
    longShortTimestamp: timestamp(ratioRow?.timestamp),
    diagnostics: [diagnostic("Bybit", endpoints.funding, funding), diagnostic("Bybit", endpoints.ticker, tickerResult), diagnostic("Bybit", endpoints.oi, oi), diagnostic("Bybit", endpoints.ratio, ratio)],
  };
}

async function fetchOkxAsset(instId: string, asset: DerivativesAssetSymbol): Promise<ProviderSnapshot> {
  const endpoints = {
    funding: `https://www.okx.com/api/v5/public/funding-rate-history?instId=${instId}&limit=30`,
    currentOi: `https://www.okx.com/api/v5/public/open-interest?instType=SWAP&instId=${instId}`,
    oiHourly: `https://www.okx.com/api/v5/rubik/stat/contracts/open-interest-history?instId=${instId}&period=1H`,
    oiDaily: `https://www.okx.com/api/v5/rubik/stat/contracts/open-interest-history?instId=${instId}&period=1D`,
    ratio: `https://www.okx.com/api/v5/rubik/stat/contracts/long-short-account-ratio?ccy=${asset}&period=1H`,
  };
  type OkxResponse<T> = { code?: string; msg?: string; data?: T[] };
  const [funding, currentOi, oiHourly, oiDaily, ratio] = await Promise.all([
    fetchJson<OkxResponse<{ fundingRate?: string; fundingTime?: string; realizedRate?: string }>>(endpoints.funding),
    fetchJson<OkxResponse<{ oi?: string; oiUsd?: string; ts?: string }>>(endpoints.currentOi),
    fetchJson<OkxResponse<string[]>>(endpoints.oiHourly),
    fetchJson<OkxResponse<string[]>>(endpoints.oiDaily),
    fetchJson<OkxResponse<string[]>>(endpoints.ratio),
  ]);
  const parseOi = (rows: string[][]) => rows.map((row) => ({ timestamp: timestamp(row[0]) ?? 0, value: finite(row[1]) ?? NaN, usdValue: finite(row[3]) })).filter((row) => row.timestamp > 0 && Number.isFinite(row.value));
  const oiRows = [...parseOi(oiHourly.data?.data ?? []), ...parseOi(oiDaily.data?.data ?? [])];
  const current = currentOi.data?.data?.[0];
  const ratioRow = ratio.data?.data?.[0];
  return {
    provider: "OKX",
    symbol: instId,
    funding: (funding.data?.data ?? []).map((row) => ({ timestamp: timestamp(row.fundingTime) ?? 0, ratePct: (finite(row.realizedRate ?? row.fundingRate) ?? NaN) * 100 })).filter((row) => row.timestamp > 0 && Number.isFinite(row.ratePct)),
    oi: oiRows,
    latestOi: finite(current?.oi),
    latestOiUsd: finite(current?.oiUsd),
    latestOiTimestamp: timestamp(current?.ts),
    longShortRatio: finite(ratioRow?.[1]),
    longShortTimestamp: timestamp(ratioRow?.[0]),
    diagnostics: [diagnostic("OKX", endpoints.funding, funding), diagnostic("OKX", endpoints.currentOi, currentOi), diagnostic("OKX", endpoints.oiHourly, oiHourly), diagnostic("OKX", endpoints.oiDaily, oiDaily), diagnostic("OKX", endpoints.ratio, ratio)],
  };
}

function providerComplete(snapshot: ProviderSnapshot) {
  return snapshot.funding.length > 0 && snapshot.latestOi !== null && snapshot.oi.length >= 2;
}

async function collectAsset(
  asset: DerivativesAssetSymbol,
  discoveries: Record<DerivativesProvider, Set<string>>,
  discoveryDiagnostics: Record<DerivativesProvider, DerivativesProviderDiagnostic>,
): Promise<DerivativesRawAssetSnapshot> {
  const standardSymbol = `${asset}USDT`;
  const okxSymbol = `${asset}-USDT-SWAP`;
  const providerSnapshots: ProviderSnapshot[] = [];
  const sourcesTried: DerivativesProvider[] = [];

  for (const provider of PROVIDERS) {
    const candidate = provider === "OKX" ? okxSymbol : standardSymbol;
    if (!discoveries[provider].has(candidate)) continue;
    sourcesTried.push(provider);
    const snapshot = provider === "Binance" ? await fetchBinanceAsset(candidate) : provider === "Bybit" ? await fetchBybitAsset(candidate) : await fetchOkxAsset(candidate, asset);
    providerSnapshots.push(snapshot);
    if (providerComplete(snapshot)) break;
  }

  const fundingSource = providerSnapshots.find((snapshot) => snapshot.funding.length > 0) ?? null;
  const oiSource = providerSnapshots.find((snapshot) => snapshot.latestOi !== null && snapshot.oi.length >= 2) ?? null;
  const ratioSource = providerSnapshots.find((snapshot) => snapshot.longShortRatio !== null) ?? null;
  const latestFunding = fundingSource ? [...fundingSource.funding].sort((left, right) => right.timestamp - left.timestamp)[0] ?? null : null;
  const latestOiPoint = oiSource ? [...oiSource.oi].sort((left, right) => right.timestamp - left.timestamp)[0] ?? null : null;
  const now = Date.now();
  const funding24hAvg = fundingSource ? averageFunding(fundingSource.funding, now - 24 * 60 * 60_000) : null;
  const funding7dAvg = fundingSource ? averageFunding(fundingSource.funding, now - 7 * 24 * 60 * 60_000) : null;
  const oiLatestValue = oiSource?.latestOi ?? latestOiPoint?.value ?? null;
  const oiLatestTimestamp = oiSource?.latestOiTimestamp ?? latestOiPoint?.timestamp ?? null;
  const oi24hBase = oiSource && oiLatestTimestamp ? nearestAtOrBefore(oiSource.oi, oiLatestTimestamp - 24 * 60 * 60_000) : null;
  const oi7dBase = oiSource && oiLatestTimestamp ? nearestAtOrBefore(oiSource.oi, oiLatestTimestamp - 7 * 24 * 60 * 60_000) : null;
  const oi24hChange = percentChange(oiLatestValue, oi24hBase?.value ?? null);
  const oi7dChange = percentChange(oiLatestValue, oi7dBase?.value ?? null);
  const sourcesSucceeded = [...new Set([fundingSource?.provider, oiSource?.provider, ratioSource?.provider].filter((value): value is DerivativesProvider => Boolean(value)))];
  const sourceUsed = sourcesSucceeded.length ? sourcesSucceeded.join(" + ") : null;
  const latestDataTimestamp = Math.max(latestFunding?.timestamp ?? 0, oiLatestTimestamp ?? 0, ratioSource?.longShortTimestamp ?? 0) || null;
  const diagnostics = [...Object.values(discoveryDiagnostics), ...providerSnapshots.flatMap((snapshot) => snapshot.diagnostics)];
  const missingFields = [
    latestFunding ? null : "latestFundingRate",
    funding24hAvg === null ? "fundingRate24hAvg" : null,
    funding7dAvg === null ? "fundingRate7dAvg" : null,
    oiLatestValue === null ? "latestOpenInterest" : null,
    oi24hChange === null ? "openInterest24hChangePct" : null,
    oi7dChange === null ? "openInterest7dChangePct" : null,
    ratioSource?.longShortRatio === null || ratioSource?.longShortRatio === undefined ? "longShortRatio" : null,
    "liquidationProxy",
  ].filter((value): value is string => Boolean(value));

  return {
    asset,
    symbol: fundingSource?.symbol ?? oiSource?.symbol ?? null,
    derivativesAvailable: latestFunding !== null || oiLatestValue !== null,
    sourceUsed,
    latestFundingRate: latestFunding?.ratePct ?? null,
    fundingRate24hAvg: funding24hAvg,
    fundingRate7dAvg: funding7dAvg,
    fundingRateDirection: latestFunding && funding24hAvg !== null ? trend(latestFunding.ratePct - funding24hAvg, 0.0005) : null,
    latestFundingTimestamp: iso(latestFunding?.timestamp ?? null),
    latestOpenInterest: oiLatestValue,
    latestOpenInterestUsdValue: oiSource?.latestOiUsd ?? latestOiPoint?.usdValue ?? null,
    openInterest24hChangePct: oi24hChange,
    openInterest7dChangePct: oi7dChange,
    openInterestTrend: trend(oi24hChange),
    latestOiTimestamp: iso(oiLatestTimestamp),
    longShortRatio: ratioSource?.longShortRatio ?? null,
    longShortTimestamp: iso(ratioSource?.longShortTimestamp ?? null),
    liquidationProxy: null,
    missingFields,
    fetchedAt: new Date().toISOString(),
    latestDataTimestamp: iso(latestDataTimestamp),
    sourcesTried,
    sourcesSucceeded,
    diagnostics,
  };
}

async function collect(): Promise<DerivativesLiteCollection> {
  const fetchedAt = new Date().toISOString();
  const [binance, bybit, okx] = await Promise.all([discoverBinance(), discoverBybit(), discoverOkx()]);
  const discoveries: Record<DerivativesProvider, Set<string>> = { Binance: binance.symbols, Bybit: bybit.symbols, OKX: okx.symbols };
  const discoveryDiagnostics: Record<DerivativesProvider, DerivativesProviderDiagnostic> = {
    Binance: binance.diagnostic,
    Bybit: bybit.diagnostic,
    OKX: okx.diagnostic,
  };
  const assets: DerivativesRawAssetSnapshot[] = [];
  for (const asset of ASSETS) assets.push(await collectAsset(asset.symbol, discoveries, discoveryDiagnostics));
  const diagnostics = [...Object.values(discoveryDiagnostics), ...assets.flatMap((asset) => asset.diagnostics.filter((row) => !row.endpoint.includes("exchangeInfo") && !row.endpoint.includes("instruments-info") && !row.endpoint.includes("public/instruments")))];
  const sourcesSucceeded = [...new Set(assets.flatMap((asset) => asset.sourcesSucceeded))];
  return {
    mode: "lite_public_exchange_api",
    assets,
    fetchedAt,
    sourcesTried: PROVIDERS,
    sourcesSucceeded,
    failedSymbols: assets.filter((asset) => !asset.derivativesAvailable).map((asset) => asset.asset),
    staleSymbols: assets.filter((asset) => asset.latestDataTimestamp && Date.now() - Date.parse(asset.latestDataTimestamp) > 15 * 60_000).map((asset) => asset.asset),
    rateLimitEvents: diagnostics.filter((row) => row.httpStatus === 429).length,
    parseErrors: diagnostics.filter((row) => row.error?.includes("parser")).length,
    diagnostics,
  };
}

export async function collectDerivativesLite(options?: { force?: boolean }) {
  if (!options?.force && collectionCache && collectionCache.expiresAt > Date.now()) return collectionCache.value;
  if (!options?.force && collectionPromise) return collectionPromise;
  collectionPromise = collect().then((value) => {
    collectionCache = { value, expiresAt: Date.now() + CACHE_MS };
    return value;
  }).finally(() => {
    collectionPromise = null;
  });
  return collectionPromise;
}

const SIGNAL_FIELDS: Record<string, keyof DerivativesRawAssetSnapshot> = {
  funding: "latestFundingRate",
  funding_24h_avg: "fundingRate24hAvg",
  funding_7d_avg: "fundingRate7dAvg",
  open_interest: "latestOpenInterest",
  open_interest_usd: "latestOpenInterestUsdValue",
  open_interest_24h: "openInterest24hChangePct",
  open_interest_7d: "openInterest7dChangePct",
  long_short_ratio: "longShortRatio",
};

function signalKey(prefix: string, asset: DerivativesAssetSymbol) {
  const suffix = asset.toLowerCase();
  if (prefix === "funding") return `funding_${suffix}`;
  if (prefix === "funding_24h_avg") return `funding_${suffix}_24h_avg`;
  if (prefix === "funding_7d_avg") return `funding_${suffix}_7d_avg`;
  if (prefix === "open_interest") return `open_interest_${suffix}`;
  if (prefix === "open_interest_usd") return `open_interest_${suffix}_usd`;
  if (prefix === "open_interest_24h") return `open_interest_${suffix}_24h`;
  if (prefix === "open_interest_7d") return `open_interest_${suffix}_7d`;
  return `long_short_ratio_${suffix}`;
}

export function derivativesSignalKeys() {
  return ASSETS.flatMap((asset) => Object.keys(SIGNAL_FIELDS).map((prefix) => signalKey(prefix, asset.symbol)));
}

export async function fetchDerivativesLiteSignal(key: string) {
  const match = key.match(/^(funding|open_interest|long_short_ratio)_([a-z0-9]+?)(?:_(24h_avg|7d_avg|usd|24h|7d))?$/);
  if (!match) return null;
  const [, family, rawAsset, suffix] = match;
  const prefix = family === "funding" ? (suffix ? `funding_${suffix}` : "funding") : family === "open_interest" ? (suffix ? `open_interest_${suffix}` : "open_interest") : "long_short_ratio";
  const asset = rawAsset.toUpperCase() as DerivativesAssetSymbol;
  if (!ASSETS.some((item) => item.symbol === asset)) return null;
  const collection = await collectDerivativesLite();
  const snapshot = collection.assets.find((item) => item.asset === asset);
  if (!snapshot) return null;
  const field = SIGNAL_FIELDS[prefix];
  const rawValue = snapshot[field];
  const value = typeof rawValue === "number" && Number.isFinite(rawValue) ? rawValue : null;
  const isFunding = prefix.startsWith("funding");
  const timestampValue = isFunding ? snapshot.latestFundingTimestamp : prefix === "long_short_ratio" ? snapshot.longShortTimestamp : snapshot.latestOiTimestamp;
  return {
    value,
    timestamp: timestampValue,
    source: snapshot.sourceUsed ? `${snapshot.sourceUsed} public derivatives ${snapshot.symbol ?? asset}` : `Public derivatives adapters ${asset}`,
    reliability: snapshot.sourceUsed === "Binance" ? 82 : snapshot.sourceUsed === "Bybit" ? 78 : snapshot.sourceUsed === "OKX" ? 76 : 64,
    error: value === null ? `Derivatives field ${field} unavailable. ${snapshot.missingFields.join(", ")}` : null,
    sampleSize: isFunding ? 21 : prefix.includes("7d") ? 7 : prefix.includes("24h") ? 24 : 1,
  };
}
