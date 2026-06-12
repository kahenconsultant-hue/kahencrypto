import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { DataQuality } from "@/lib/types";
import type { ETFDailyFlowInput } from "@/types/ingestion";

export type EtfFlowAsset = "BTC" | "ETH";
export type EtfFlowFreshness = "fresh" | "delayed" | "stale" | "unavailable";

export const FARSIDE_BTC_ETF_URL = "https://farside.co.uk/bitcoin-etf-flow-all-data/";
export const FARSIDE_ETH_ETF_URL = "https://farside.co.uk/ethereum-etf-flow-all-data/";
export const THE_BLOCK_BTC_ETF_JSON_URL = "https://data.tbstat.com/dashboard/markets_structuredproducts_btcspotetfflows_daily_other.json";
export const THE_BLOCK_ETH_ETF_JSON_URL = "https://data.tbstat.com/dashboard/markets_structuredproducts_ethspotetfflows_daily_other.json";
export const FARSIDE_ETF_FETCH_TIMEOUT_MS = 3_000;
export const THE_BLOCK_ETF_FETCH_TIMEOUT_MS = 6_000;
export const ETF_STAGE_TIMEOUT_MS = 20_000;

export const BTC_ETF_PROVIDERS = ["IBIT", "FBTC", "BITB", "ARKB", "BTCO", "EZBC", "BRRR", "HODL", "BTCW", "GBTC", "BTC"] as const;
export const ETH_ETF_PROVIDERS = ["ETHA", "FETH", "ETHW", "CETH", "ETHV", "QETH", "EZET", "ETHE", "ETH"] as const;

const ETF_CACHE_DIR = process.env.CMIP_ETF_CACHE_PATH ?? join(process.cwd(), ".cache", "cmip", "etf");

export interface ParsedEtfDailyRow {
  asset: EtfFlowAsset;
  date: string;
  providerFlowsUsdMillion: Record<string, number | null>;
  totalUsdMillion: number | null;
  source: string;
  sourceUrl: string;
  fetchedAt: string;
  quality: DataQuality;
  rawPayload?: unknown;
}

export type EtfSourceFetchStatus = "success" | "cloudflare_blocked" | "timeout" | "failed" | "skipped";
export type EtfFetchProvider = "Farside" | "TheBlock" | "Cache" | "Missing";
export type EtfOverallSourceStatus = "Connected" | "Degraded" | "Stale" | "Failed";

export interface EtfFetchDiagnostics extends Record<string, unknown> {
  asset: EtfFlowAsset;
  provider: EtfFetchProvider;
  overallStatus: EtfOverallSourceStatus;
  usedFallbackSource: boolean;
  usedCache: boolean;
  farsideStatus: EtfSourceFetchStatus;
  theBlockStatus: EtfSourceFetchStatus;
  farsideHttpStatus?: number;
  theBlockHttpStatus?: number;
  farsideCfMitigated?: string | null;
  parsedRowsCount: number;
  latestDate: string | null;
  latestTotalFlowUsdMillion: number | null;
  freshness: EtfFlowFreshness;
  validationStatus: string | null;
  durationMs: number;
  errors: string[];
}

export interface EtfPublicFetchResult {
  rows: ParsedEtfDailyRow[];
  provider: EtfFetchProvider;
  primaryError?: string;
  fallbackError?: string;
  cacheError?: string;
  diagnostics: EtfFetchDiagnostics;
}

export interface EtfFlowAggregation {
  asset: EtfFlowAsset;
  latestDate: string | null;
  latestFlowUsdMillion: number | null;
  previousFlowUsdMillion: number | null;
  sevenDayFlowUsdMillion: number | null;
  thirtyDayFlowUsdMillion: number | null;
  latestProviderBreakdownUsdMillion: Record<string, number | null>;
  sevenDayProviderBreakdownUsdMillion: Record<string, number | null>;
  thirtyDayProviderBreakdownUsdMillion: Record<string, number | null>;
  rowsCount: number;
  source: string;
  sourceUrl: string;
  fetchedAt: string | null;
  freshness: EtfFlowFreshness;
  quality: DataQuality;
}

const monthIndex: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

function providersForAsset(asset: EtfFlowAsset) {
  return asset === "BTC" ? [...BTC_ETF_PROVIDERS] : [...ETH_ETF_PROVIDERS];
}

function orderedProviderKeys(asset: EtfFlowAsset, dynamicKeys: Iterable<string>) {
  const base = providersForAsset(asset);
  const seen = new Set<string>();
  const normalizedDynamic = Array.from(dynamicKeys)
    .map((key) => key.trim().toUpperCase())
    .filter((key) => key && key !== "DATE" && key !== "TOTAL");
  return [...base, ...normalizedDynamic].filter((key) => {
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function ensureEtfCacheDir() {
  mkdirSync(ETF_CACHE_DIR, { recursive: true });
}

function etfCachePath(asset: EtfFlowAsset, provider: "farside" | "theblock") {
  return join(ETF_CACHE_DIR, `${asset.toLowerCase()}-${provider}.json`);
}

function writeEtfSourceCache(params: {
  asset: EtfFlowAsset;
  provider: "farside" | "theblock";
  sourceUrl: string;
  fetchedAt: string;
  rawPayload: unknown;
  rows: ParsedEtfDailyRow[];
}) {
  try {
    ensureEtfCacheDir();
    writeFileSync(
      etfCachePath(params.asset, params.provider),
      JSON.stringify(
        {
          asset: params.asset,
          provider: params.provider,
          sourceUrl: params.sourceUrl,
          fetchedAt: params.fetchedAt,
          rows: params.rows,
          rawPayload: params.rawPayload,
        },
        null,
        2,
      ),
    );
  } catch {
    // Cache failures must not affect ingestion.
  }
}

function readCachedEtfRows(asset: EtfFlowAsset): ParsedEtfDailyRow[] {
  for (const provider of ["theblock", "farside"] as const) {
    try {
      const path = etfCachePath(asset, provider);
      if (!existsSync(path)) continue;
      const payload = JSON.parse(readFileSync(path, "utf8")) as { rows?: ParsedEtfDailyRow[] };
      const rows = (payload.rows ?? []).filter((row) => row.asset === asset && row.date);
      if (rows.length) return rows.sort((left, right) => right.date.localeCompare(left.date));
    } catch {
      continue;
    }
  }
  return [];
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#8211;|&ndash;/gi, "-")
    .replace(/&#8212;|&mdash;/gi, "-")
    .replace(/&#x([0-9a-f]+);/gi, (_match, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)));
}

function cleanCell(value: string) {
  return decodeHtmlEntities(value.replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeHeader(value: string) {
  return cleanCell(value).replace(/\s+/g, "").toUpperCase();
}

export function parseEtfFlowNumber(text: string): number | null {
  const cleaned = decodeHtmlEntities(text.replace(/<[^>]+>/g, " "))
    .replace(/,/g, "")
    .replace(/[−–—]/g, "-")
    .trim();
  if (!cleaned || cleaned === "-" || /^n\/?a$/i.test(cleaned) || /^null$/i.test(cleaned)) return null;
  const negative = /^\(.+\)$/.test(cleaned) || cleaned.startsWith("-");
  const normalized = cleaned.replace(/[()$£€mM\s]/g, "");
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  return negative ? -Math.abs(parsed) : parsed;
}

function isoDateFromDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function parseEtfDate(text: string): string | null {
  const cleaned = cleanCell(text).replace(/[,]/g, "").trim();
  if (!cleaned) return null;

  const iso = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return cleaned;

  const slash = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slash) {
    const month = Number(slash[1]);
    const day = Number(slash[2]);
    const year = slash[3].length === 2 ? 2000 + Number(slash[3]) : Number(slash[3]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return isoDateFromDate(new Date(Date.UTC(year, month - 1, day)));
  }

  const textual = cleaned.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{2,4})$/);
  if (textual) {
    const day = Number(textual[1]);
    const month = monthIndex[textual[2].toLowerCase()];
    const year = textual[3].length === 2 ? 2000 + Number(textual[3]) : Number(textual[3]);
    if (month !== undefined && day >= 1 && day <= 31) return isoDateFromDate(new Date(Date.UTC(year, month, day)));
  }

  const usTextual = cleaned.match(/^([A-Za-z]+)\s+(\d{1,2})\s+(\d{2,4})$/);
  if (usTextual) {
    const month = monthIndex[usTextual[1].toLowerCase()];
    const day = Number(usTextual[2]);
    const year = usTextual[3].length === 2 ? 2000 + Number(usTextual[3]) : Number(usTextual[3]);
    if (month !== undefined && day >= 1 && day <= 31) return isoDateFromDate(new Date(Date.UTC(year, month, day)));
  }

  return null;
}

function sumKnown(values: Array<number | null>) {
  const known = values.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (!known.length) return null;
  return known.reduce((sum, value) => sum + value, 0);
}

function providerTotalValidation(asset: EtfFlowAsset, providerFlowsUsdMillion: Record<string, number | null>, reportedTotal: number | null) {
  const allProviderSum = sumKnown(Object.values(providerFlowsUsdMillion));
  const legacyProviderSet = new Set<string>(providersForAsset(asset));
  const legacyProviderSum = sumKnown(Object.entries(providerFlowsUsdMillion).filter(([provider]) => legacyProviderSet.has(provider)).map(([, value]) => value));
  if (reportedTotal === null || allProviderSum === null) {
    return {
      status: "total_unavailable",
      allProviderSum,
      legacyProviderSum,
      reportedTotal,
      differenceUsdMillion: null,
      differencePct: null,
    };
  }
  const differenceUsdMillion = allProviderSum - reportedTotal;
  const denominator = Math.max(1, Math.abs(reportedTotal));
  const differencePct = Math.abs(differenceUsdMillion) / denominator;
  const legacyDifferencePct =
    legacyProviderSum === null ? null : Math.abs(legacyProviderSum - reportedTotal) / denominator;
  const status =
    differencePct <= 0.01
      ? legacyDifferencePct !== null && legacyDifferencePct > 0.01
        ? "valid_with_extended_providers"
        : "valid"
      : "invalid";
  return {
    status,
    allProviderSum,
    legacyProviderSum,
    reportedTotal,
    differenceUsdMillion,
    differencePct,
  };
}

function flowDateToTimestamp(date: string) {
  return `${date}T21:00:00.000Z`;
}

export function etfFlowQualityFromFreshness(freshness: EtfFlowFreshness): DataQuality {
  if (freshness === "fresh") return "partial_live";
  if (freshness === "delayed" || freshness === "stale") return "delayed";
  return "unavailable";
}

export function marketDaysSince(date: string, now = new Date()) {
  const parsed = Date.parse(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(parsed)) return null;
  const cursor = new Date(parsed);
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  let days = 0;
  cursor.setUTCDate(cursor.getUTCDate() + 1);
  while (cursor <= today) {
    const day = cursor.getUTCDay();
    if (day !== 0 && day !== 6) days += 1;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return Math.max(0, days);
}

export function freshnessFromLatestEtfDate(date: string | null, now = new Date()): EtfFlowFreshness {
  if (!date) return "unavailable";
  const marketDays = marketDaysSince(date, now);
  if (marketDays === null) return "unavailable";
  if (marketDays <= 3) return "fresh";
  if (marketDays <= 7) return "delayed";
  return "stale";
}

export function parseFarsideEtfHtml(params: {
  html: string;
  asset: EtfFlowAsset;
  sourceUrl: string;
  fetchedAt?: string;
}): ParsedEtfDailyRow[] {
  if (/cloudflare|just a moment|enable javascript|attention required/i.test(params.html)) return [];

  const fetchedAt = params.fetchedAt ?? new Date().toISOString();
  const rows = Array.from(params.html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)).map((match) => match[1]);
  const tableRows = rows
    .map((row) => Array.from(row.matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)).map((cell) => cell[1]))
    .filter((cells) => cells.length >= 3);
  const knownProviders = providersForAsset(params.asset);
  const header = tableRows.find((cells) => {
    const normalized = cells.map(normalizeHeader);
    return normalized.some((cell) => cell === "DATE") && normalized.some((cell) => cell === "TOTAL") && knownProviders.some((provider) => normalized.includes(provider));
  });
  if (!header) return [];

  const headerMap = new Map(header.map((cell, index) => [normalizeHeader(cell), index]));
  const dateIndex = headerMap.get("DATE") ?? 0;
  const totalIndex = headerMap.get("TOTAL") ?? -1;
  const dynamicProviders = orderedProviderKeys(
    params.asset,
    header
      .map(normalizeHeader)
      .filter((cell) => /^[A-Z0-9]{2,12}$/.test(cell) && cell !== "DATE" && cell !== "TOTAL"),
  );

  return tableRows
    .map<ParsedEtfDailyRow | null>((cells) => {
      const date = parseEtfDate(cells[dateIndex] ?? "");
      if (!date) return null;
      const providerFlowsUsdMillion: Record<string, number | null> = {};
      for (const provider of dynamicProviders) {
        const index = headerMap.get(provider);
        providerFlowsUsdMillion[provider] = index === undefined ? null : parseEtfFlowNumber(cells[index] ?? "");
      }
      const totalUsdMillion = totalIndex >= 0 ? parseEtfFlowNumber(cells[totalIndex] ?? "") : sumKnown(Object.values(providerFlowsUsdMillion));
      const validation = providerTotalValidation(params.asset, providerFlowsUsdMillion, totalUsdMillion);
      return {
        asset: params.asset,
        date,
        providerFlowsUsdMillion,
        totalUsdMillion,
        source: `Farside Investors ${params.asset} ETF flow table`,
        sourceUrl: params.sourceUrl,
        fetchedAt,
        quality: "partial_live" as DataQuality,
        rawPayload: { row: cells.map(cleanCell), header: header.map(cleanCell), validation },
      };
    })
    .filter((row): row is ParsedEtfDailyRow => row !== null)
    .sort((left, right) => right.date.localeCompare(left.date));
}

type TheBlockDashboardJson = {
  Series?: Record<string, { Data?: Array<{ Timestamp?: number; Result?: number | null }> }>;
};

export function parseTheBlockEtfJson(params: {
  json: TheBlockDashboardJson;
  asset: EtfFlowAsset;
  sourceUrl: string;
  fetchedAt?: string;
}): ParsedEtfDailyRow[] {
  const series = params.json.Series ?? {};
  const fetchedAt = params.fetchedAt ?? new Date().toISOString();
  const byDate = new Map<string, Record<string, number | null>>();
  const today = new Date();
  const tomorrowUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + 1);

  for (const [provider, payload] of Object.entries(series)) {
    const normalizedProvider = provider.toUpperCase();
    for (const point of payload.Data ?? []) {
      if (!point.Timestamp) continue;
      const timestampMs = point.Timestamp * 1000;
      if (timestampMs > tomorrowUtc) continue;
      const date = isoDateFromDate(new Date(timestampMs));
      const current = byDate.get(date) ?? {};
      current[normalizedProvider] = typeof point.Result === "number" && Number.isFinite(point.Result) ? point.Result / 1_000_000 : null;
      byDate.set(date, current);
    }
  }

  return Array.from(byDate.entries())
    .map(([date, sourceFlows]) => {
      const providers = orderedProviderKeys(params.asset, Object.keys(sourceFlows));
      const providerFlowsUsdMillion: Record<string, number | null> = {};
      for (const provider of providers) providerFlowsUsdMillion[provider] = sourceFlows[provider] ?? null;
      const totalUsdMillion = sumKnown(Object.values(sourceFlows));
      const validation = providerTotalValidation(params.asset, providerFlowsUsdMillion, totalUsdMillion);
      return {
        asset: params.asset,
        date,
        providerFlowsUsdMillion,
        totalUsdMillion,
        source: `The Block public ${params.asset} ETF data JSON`,
        sourceUrl: params.sourceUrl,
        fetchedAt,
        quality: "delayed" as DataQuality,
        rawPayload: { providerFlowsUsdMillion, validation },
      };
    })
    .filter((row) => row.totalUsdMillion !== null || Object.values(row.providerFlowsUsdMillion).some((value) => value !== null))
    .sort((left, right) => right.date.localeCompare(left.date));
}

export function aggregateEtfDailyRows(rows: ParsedEtfDailyRow[], asset: EtfFlowAsset): EtfFlowAggregation {
  const relevant = rows
    .filter((row) => row.asset === asset)
    .sort((left, right) => right.date.localeCompare(left.date));
  const latest = relevant[0] ?? null;
  const latestDate = latest?.date ?? null;
  const freshness = freshnessFromLatestEtfDate(latestDate);
  const quality = latest ? etfFlowQualityFromFreshness(freshness) : "unavailable";
  const providers = orderedProviderKeys(asset, relevant.flatMap((row) => Object.keys(row.providerFlowsUsdMillion)));
  const seven = relevant.slice(0, 7);
  const thirty = relevant.slice(0, 30);
  const provider7d: Record<string, number | null> = {};
  const provider30d: Record<string, number | null> = {};
  for (const provider of providers) {
    provider7d[provider] = sumKnown(seven.map((row) => row.providerFlowsUsdMillion[provider] ?? null));
    provider30d[provider] = sumKnown(thirty.map((row) => row.providerFlowsUsdMillion[provider] ?? null));
  }

  return {
    asset,
    latestDate,
    latestFlowUsdMillion: latest?.totalUsdMillion ?? null,
    previousFlowUsdMillion: relevant[1]?.totalUsdMillion ?? null,
    sevenDayFlowUsdMillion: sumKnown(seven.map((row) => row.totalUsdMillion)),
    thirtyDayFlowUsdMillion: sumKnown(thirty.map((row) => row.totalUsdMillion)),
    latestProviderBreakdownUsdMillion: latest?.providerFlowsUsdMillion ?? Object.fromEntries(providers.map((provider) => [provider, null])),
    sevenDayProviderBreakdownUsdMillion: provider7d,
    thirtyDayProviderBreakdownUsdMillion: provider30d,
    rowsCount: relevant.length,
    source: latest?.source ?? `${asset} ETF public source`,
    sourceUrl: latest?.sourceUrl ?? "",
    fetchedAt: latest?.fetchedAt ?? null,
    freshness,
    quality,
  };
}

export function etfDailyFlowRecordsFromRows(rows: ParsedEtfDailyRow[]): ETFDailyFlowInput[] {
  return rows.flatMap((row) => {
    const providerRows = Object.entries(row.providerFlowsUsdMillion).map(([provider, value]) => ({
      asset: row.asset,
      date: row.date,
      provider,
      netFlowUsdMillion: value,
      source: row.source,
      sourceUrl: row.sourceUrl,
      fetchedAt: row.fetchedAt,
      quality: row.quality,
      rawPayload: {
        sourceRow: row.rawPayload ?? null,
        totalUsdMillion: row.totalUsdMillion,
      },
    }));
    return [
      ...providerRows,
      {
        asset: row.asset,
        date: row.date,
        provider: "Total",
        netFlowUsdMillion: row.totalUsdMillion,
        source: row.source,
        sourceUrl: row.sourceUrl,
        fetchedAt: row.fetchedAt,
        quality: row.quality,
        rawPayload: row.rawPayload ?? {},
      },
    ];
  });
}

export function parsedRowsFromEtfDailyFlowRecords(records: ETFDailyFlowInput[]): ParsedEtfDailyRow[] {
  const grouped = new Map<string, ETFDailyFlowInput[]>();
  for (const record of records) {
    grouped.set(`${record.asset}:${record.date}`, [...(grouped.get(`${record.asset}:${record.date}`) ?? []), record]);
  }

  return Array.from(grouped.values())
    .map((items) => {
      const first = items[0];
      const providers = orderedProviderKeys(
        first.asset,
        items.filter((item) => item.provider !== "Total").map((item) => item.provider),
      );
      const providerFlowsUsdMillion: Record<string, number | null> = {};
      for (const provider of providers) {
        const record = items.find((item) => item.provider === provider);
        providerFlowsUsdMillion[provider] = record ? record.netFlowUsdMillion : null;
      }
      const total = items.find((item) => item.provider === "Total");
      const totalUsdMillion = total ? total.netFlowUsdMillion : sumKnown(Object.values(providerFlowsUsdMillion));
      return {
        asset: first.asset,
        date: first.date,
        providerFlowsUsdMillion,
        totalUsdMillion,
        source: first.source,
        sourceUrl: first.sourceUrl,
        fetchedAt: first.fetchedAt,
        quality: first.quality,
        rawPayload: {
          records: items.map((item) => ({ provider: item.provider, value: item.netFlowUsdMillion })),
          validation: providerTotalValidation(first.asset, providerFlowsUsdMillion, totalUsdMillion),
        },
      };
    })
    .sort((left, right) => right.date.localeCompare(left.date));
}

function millionToUsd(value: number | null) {
  return value === null ? null : Number((value * 1_000_000).toFixed(2));
}

export function buildEtfRawMetrics(params: {
  sourceId: string;
  sourceName: string;
  sourceType: "api" | "scraper";
  asset: EtfFlowAsset;
  aggregation: EtfFlowAggregation;
}) {
  const lower = params.asset.toLowerCase();
  const timestamp = params.aggregation.latestDate ? flowDateToTimestamp(params.aggregation.latestDate) : params.aggregation.fetchedAt;
  const base = {
    sourceId: params.sourceId,
    sourceName: params.aggregation.source || params.sourceName,
    sourceType: params.sourceType,
    asset: params.asset,
    group: "flows" as const,
    timestamp,
    quality: params.aggregation.quality,
    reliability: params.aggregation.source.includes("Farside") ? 88 : 82,
    sampleSize: params.aggregation.rowsCount,
    rawPayload: {
      latestDate: params.aggregation.latestDate,
      freshness: params.aggregation.freshness,
      sourceUrl: params.aggregation.sourceUrl,
      parsedRowsCount: params.aggregation.rowsCount,
      latestProviderBreakdownUsdMillion: params.aggregation.latestProviderBreakdownUsdMillion,
      sevenDayProviderBreakdownUsdMillion: params.aggregation.sevenDayProviderBreakdownUsdMillion,
      thirtyDayProviderBreakdownUsdMillion: params.aggregation.thirtyDayProviderBreakdownUsdMillion,
      units: "USD",
      rawUnits: "USD million",
    },
  };

  return [
    {
      ...base,
      metric: `${lower}_etf_flow_24h`,
      value: millionToUsd(params.aggregation.latestFlowUsdMillion),
      previousValue: millionToUsd(params.aggregation.previousFlowUsdMillion),
      changeAbs:
        params.aggregation.latestFlowUsdMillion !== null && params.aggregation.previousFlowUsdMillion !== null
          ? millionToUsd(params.aggregation.latestFlowUsdMillion - params.aggregation.previousFlowUsdMillion)
          : null,
      changePct: null,
      error: params.aggregation.latestFlowUsdMillion === null ? `${params.asset} ETF latest total flow is missing in source table.` : undefined,
    },
    {
      ...base,
      metric: `${lower}_etf_flow_7d`,
      value: millionToUsd(params.aggregation.sevenDayFlowUsdMillion),
      previousValue: null,
      changeAbs: null,
      changePct: null,
      error: params.aggregation.sevenDayFlowUsdMillion === null ? `${params.asset} ETF 7d total flow is missing in source table.` : undefined,
    },
    {
      ...base,
      metric: `${lower}_etf_flow_30d`,
      value: millionToUsd(params.aggregation.thirtyDayFlowUsdMillion),
      previousValue: null,
      changeAbs: null,
      changePct: null,
      error: params.aggregation.thirtyDayFlowUsdMillion === null ? `${params.asset} ETF 30d total flow is missing in source table.` : undefined,
    },
    {
      ...base,
      metric: `${lower}_etf_provider_breakdown`,
      value: millionToUsd(params.aggregation.latestFlowUsdMillion),
      previousValue: null,
      changeAbs: null,
      changePct: null,
      error: params.aggregation.rowsCount ? undefined : `${params.asset} ETF provider breakdown is missing.`,
    },
  ];
}

function isAbortError(error: unknown) {
  return error instanceof Error && (error.name === "AbortError" || /aborted|timeout|timed out/i.test(error.message));
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function buildEtfDiagnostics(params: {
  asset: EtfFlowAsset;
  provider: EtfFetchProvider;
  rows: ParsedEtfDailyRow[];
  durationMs: number;
  farsideStatus: EtfSourceFetchStatus;
  theBlockStatus: EtfSourceFetchStatus;
  farsideHttpStatus?: number;
  theBlockHttpStatus?: number;
  farsideCfMitigated?: string | null;
  usedCache?: boolean;
  errors?: string[];
}): EtfFetchDiagnostics {
  const aggregation = aggregateEtfDailyRows(params.rows, params.asset);
  const validationStatus =
    (aggregation.latestDate
      ? params.rows.find((row) => row.asset === params.asset && row.date === aggregation.latestDate)?.rawPayload as { validation?: { status?: string } } | undefined
      : undefined)?.validation?.status ?? null;
  const overallStatus: EtfOverallSourceStatus =
    params.provider === "Farside"
      ? "Connected"
      : params.provider === "TheBlock"
        ? "Degraded"
        : params.provider === "Cache"
          ? "Stale"
          : "Failed";
  return {
    asset: params.asset,
    provider: params.provider,
    overallStatus,
    usedFallbackSource: params.provider === "TheBlock",
    usedCache: Boolean(params.usedCache),
    farsideStatus: params.farsideStatus,
    theBlockStatus: params.theBlockStatus,
    farsideHttpStatus: params.farsideHttpStatus,
    theBlockHttpStatus: params.theBlockHttpStatus,
    farsideCfMitigated: params.farsideCfMitigated,
    parsedRowsCount: params.rows.length,
    latestDate: aggregation.latestDate,
    latestTotalFlowUsdMillion: aggregation.latestFlowUsdMillion,
    freshness: aggregation.freshness,
    validationStatus,
    durationMs: params.durationMs,
    errors: params.errors ?? [],
  };
}

export async function fetchEtfRowsFromPublicSources(asset: EtfFlowAsset, timeoutMs = ETF_STAGE_TIMEOUT_MS): Promise<EtfPublicFetchResult> {
  const started = Date.now();
  const fetchedAt = new Date().toISOString();
  const farsideUrl = asset === "BTC" ? FARSIDE_BTC_ETF_URL : FARSIDE_ETH_ETF_URL;
  const fallbackUrl = asset === "BTC" ? THE_BLOCK_BTC_ETF_JSON_URL : THE_BLOCK_ETH_ETF_JSON_URL;
  const farsideTimeout = Math.min(FARSIDE_ETF_FETCH_TIMEOUT_MS, timeoutMs);
  const theBlockTimeout = Math.min(THE_BLOCK_ETF_FETCH_TIMEOUT_MS, timeoutMs);
  let primaryError: string | undefined;
  let fallbackError: string | undefined;
  let farsideStatus: EtfSourceFetchStatus = "failed";
  let theBlockStatus: EtfSourceFetchStatus = "skipped";
  let farsideHttpStatus: number | undefined;
  let theBlockHttpStatus: number | undefined;
  let farsideCfMitigated: string | null | undefined;

  try {
    const response = await fetchWithTimeout(farsideUrl, {
      headers: {
        accept: "text/html,application/xhtml+xml",
        "user-agent": "CMIP/1.0 Farside ETF collector",
      },
    }, farsideTimeout);
    farsideHttpStatus = response.status;
    farsideCfMitigated = response.headers.get("cf-mitigated");
    if (response.status === 403 && /challenge/i.test(farsideCfMitigated ?? "")) {
      farsideStatus = "cloudflare_blocked";
      primaryError = `Farside HTTP 403 Cloudflare challenge; fallback activated without retry.`;
    } else if (response.ok) {
      const html = await response.text();
      const rows = parseFarsideEtfHtml({ html, asset, sourceUrl: farsideUrl, fetchedAt });
      if (rows.length) {
        farsideStatus = "success";
        writeEtfSourceCache({ asset, provider: "farside", sourceUrl: farsideUrl, fetchedAt, rawPayload: html, rows });
        return {
          rows,
          provider: "Farside",
          diagnostics: buildEtfDiagnostics({
            asset,
            provider: "Farside",
            rows,
            durationMs: Date.now() - started,
            farsideStatus,
            theBlockStatus,
            farsideHttpStatus,
            farsideCfMitigated,
          }),
        };
      }
      farsideStatus = "failed";
      primaryError = /cloudflare|just a moment|enable javascript|attention required/i.test(html)
        ? "Farside returned a Cloudflare/JavaScript challenge instead of the ETF table."
        : "Farside page did not contain a parseable ETF table.";
    } else {
      farsideStatus = "failed";
      primaryError = `Farside HTTP ${response.status}`;
    }
  } catch (error) {
    farsideStatus = isAbortError(error) ? "timeout" : "failed";
    primaryError = error instanceof Error ? `Farside fetch failed: ${error.message}` : "Farside fetch failed.";
  }

  const fallback = await fetchTheBlockFallback(asset, fallbackUrl, fetchedAt, theBlockTimeout);
  theBlockStatus = fallback.status;
  theBlockHttpStatus = fallback.httpStatus;
  fallbackError = fallback.fallbackError;
  if (fallback.rows.length) {
    return {
      rows: fallback.rows,
      provider: "TheBlock",
      primaryError,
      fallbackError,
      diagnostics: buildEtfDiagnostics({
        asset,
        provider: "TheBlock",
        rows: fallback.rows,
        durationMs: Date.now() - started,
        farsideStatus,
        theBlockStatus,
        farsideHttpStatus,
        theBlockHttpStatus,
        farsideCfMitigated,
        errors: [primaryError, fallbackError].filter((error): error is string => Boolean(error)),
      }),
    };
  }

  const cachedRows = readCachedEtfRows(asset);
  if (cachedRows.length) {
    return {
      rows: cachedRows,
      provider: "Cache",
      primaryError,
      fallbackError,
      cacheError: "Fresh ETF fetch failed; last valid ETF snapshot retained from local cache.",
      diagnostics: buildEtfDiagnostics({
        asset,
        provider: "Cache",
        rows: cachedRows,
        durationMs: Date.now() - started,
        farsideStatus,
        theBlockStatus,
        farsideHttpStatus,
        theBlockHttpStatus,
        farsideCfMitigated,
        usedCache: true,
        errors: [primaryError, fallbackError, "Fresh ETF fetch failed; last valid ETF snapshot retained from local cache."].filter((error): error is string => Boolean(error)),
      }),
    };
  }

  return {
    rows: [],
    provider: "Missing",
    primaryError,
    fallbackError,
    diagnostics: buildEtfDiagnostics({
      asset,
      provider: "Missing",
      rows: [],
      durationMs: Date.now() - started,
      farsideStatus,
      theBlockStatus,
      farsideHttpStatus,
      theBlockHttpStatus,
      farsideCfMitigated,
      errors: [primaryError, fallbackError].filter((error): error is string => Boolean(error)),
    }),
  };
}

async function fetchTheBlockFallback(asset: EtfFlowAsset, sourceUrl: string, fetchedAt: string, timeoutMs: number): Promise<{
  rows: ParsedEtfDailyRow[];
  status: EtfSourceFetchStatus;
  httpStatus?: number;
  fallbackError?: string;
}> {
  try {
    const response = await fetchWithTimeout(sourceUrl, {
      headers: {
        accept: "application/json,text/plain,*/*",
        "user-agent": "CMIP/1.0 ETF fallback collector",
      },
    }, timeoutMs);
    if (!response.ok) return { rows: [], status: "failed", httpStatus: response.status, fallbackError: `The Block ETF JSON HTTP ${response.status}` };
    const json = (await response.json()) as TheBlockDashboardJson;
    const rows = parseTheBlockEtfJson({ json, asset, sourceUrl, fetchedAt });
    if (!rows.length) return { rows: [], status: "failed", httpStatus: response.status, fallbackError: "The Block ETF JSON returned no parseable series." };
    writeEtfSourceCache({ asset, provider: "theblock", sourceUrl, fetchedAt, rawPayload: json, rows });
    return { rows, status: "success", httpStatus: response.status };
  } catch (error) {
    return {
      rows: [],
      status: isAbortError(error) ? "timeout" : "failed",
      fallbackError: error instanceof Error ? `The Block ETF fallback failed: ${error.message}` : "The Block ETF fallback failed.",
    };
  }
}
