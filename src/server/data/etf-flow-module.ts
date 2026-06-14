import {
  aggregateEtfDailyRows,
  etfDailyFlowRecordsFromRows,
  fetchEtfRowsFromPublicSources,
  freshnessFromLatestEtfDate,
  parsedRowsFromEtfDailyFlowRecords,
  type EtfFlowAsset,
  type EtfFlowFreshness,
} from "@/server/data/farside-etf";
import { getLatestEtfDailyFlows, getLatestEtfDailyFlowsSync, persistEtfDailyFlows } from "@/storage/ingestion-store";

export type { EtfFlowAsset };
export type EtfFlowHorizon = "24h" | "7d" | "30d";

export interface EtfFlowSnapshot {
  asset: EtfFlowAsset;
  netFlow24h: number | null;
  netFlow7d: number | null;
  netFlow30d: number | null;
  providerBreakdown: Record<string, number | null>;
  providerBreakdown7d: Record<string, number | null>;
  providerBreakdown30d: Record<string, number | null>;
  source: string;
  sourceUrl?: string;
  timestamp: string | null;
  latestDate?: string | null;
  parsedRowsCount?: number;
  status: "Available" | "Missing" | "Stale";
  freshness: EtfFlowFreshness;
  error?: string;
}

function envNumber(key: string) {
  const value = process.env[key];
  if (value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function millionToUsd(value: number | null) {
  return value === null ? null : Number((value * 1_000_000).toFixed(2));
}

function snapshotFromAggregation(asset: EtfFlowAsset, aggregation: ReturnType<typeof aggregateEtfDailyRows>): EtfFlowSnapshot {
  return {
    asset,
    netFlow24h: millionToUsd(aggregation.latestFlowUsdMillion),
    netFlow7d: millionToUsd(aggregation.sevenDayFlowUsdMillion),
    netFlow30d: millionToUsd(aggregation.thirtyDayFlowUsdMillion),
    providerBreakdown: aggregation.latestProviderBreakdownUsdMillion,
    providerBreakdown7d: aggregation.sevenDayProviderBreakdownUsdMillion,
    providerBreakdown30d: aggregation.thirtyDayProviderBreakdownUsdMillion,
    source: aggregation.source,
    sourceUrl: aggregation.sourceUrl,
    timestamp: aggregation.latestDate ? `${aggregation.latestDate}T21:00:00.000Z` : aggregation.fetchedAt,
    latestDate: aggregation.latestDate,
    parsedRowsCount: aggregation.rowsCount,
    status: aggregation.latestFlowUsdMillion === null ? "Missing" : aggregation.freshness === "stale" ? "Stale" : "Available",
    freshness: aggregation.freshness,
    error: aggregation.latestFlowUsdMillion === null ? `${asset} ETF flow source returned no valid Total row.` : undefined,
  };
}

function snapshotFromRecords(asset: EtfFlowAsset, records = getLatestEtfDailyFlowsSync(20_000)) {
  const rows = parsedRowsFromEtfDailyFlowRecords(records.filter((record) => record.asset === asset));
  if (!rows.length) return null;
  return snapshotFromAggregation(asset, aggregateEtfDailyRows(rows, asset));
}

function snapshotFromEnv(asset: EtfFlowAsset): EtfFlowSnapshot | null {
  const prefix = asset === "BTC" ? "CMIP_BTC_ETF_FLOW" : "CMIP_ETH_ETF_FLOW";
  const netFlow24h = envNumber(`${prefix}_24H`);
  const netFlow7d = envNumber(`${prefix}_7D`);
  const netFlow30d = envNumber(`${prefix}_30D`);
  const timestamp = process.env[`${prefix}_UPDATED_AT`] ?? process.env[`${prefix}_24H_TIMESTAMP`] ?? null;
  const available = netFlow24h !== null || netFlow7d !== null || netFlow30d !== null;
  if (!available) return null;

  const latestDate = timestamp ? new Date(timestamp).toISOString().slice(0, 10) : null;
  const freshness = freshnessFromLatestEtfDate(latestDate);
  return {
    asset,
    netFlow24h,
    netFlow7d,
    netFlow30d,
    providerBreakdown: {},
    providerBreakdown7d: {},
    providerBreakdown30d: {},
    source: `Configured ${asset} ETF flow feed`,
    timestamp: timestamp ?? new Date().toISOString(),
    latestDate,
    parsedRowsCount: 0,
    status: freshness === "stale" ? "Stale" : "Available",
    freshness,
  };
}

export function getEtfFlowSnapshotSync(asset: EtfFlowAsset): EtfFlowSnapshot {
  const stored = snapshotFromRecords(asset);
  if (stored) return stored;
  const configured = snapshotFromEnv(asset);
  if (configured) return configured;
  return {
    asset,
    netFlow24h: null,
    netFlow7d: null,
    netFlow30d: null,
    providerBreakdown: {},
    providerBreakdown7d: {},
    providerBreakdown30d: {},
    source: `${asset} ETF flow adapter`,
    timestamp: null,
    latestDate: null,
    parsedRowsCount: 0,
    status: "Missing",
    freshness: "unavailable",
    error: `${asset} ETF flow source is unavailable; no fallback value is generated.`,
  };
}

export async function getEtfFlows(asset: EtfFlowAsset, _horizon: EtfFlowHorizon = "24h"): Promise<EtfFlowSnapshot> {
  const records = await getLatestEtfDailyFlows(1_200);
  const stored = snapshotFromRecords(asset, records);
  if (stored) return stored;

  const configured = snapshotFromEnv(asset);
  if (configured) return configured;

  const publicRows = await fetchEtfRowsFromPublicSources(asset);
  if (publicRows.rows.length) {
    const aggregation = aggregateEtfDailyRows(publicRows.rows, asset);
    await persistEtfDailyFlows(etfDailyFlowRecordsFromRows(publicRows.rows));
    const snapshot = snapshotFromAggregation(asset, aggregation);
    return {
      ...snapshot,
      error: publicRows.primaryError ? `Farside primary note: ${publicRows.primaryError}` : snapshot.error,
    };
  }

  return {
    asset,
    netFlow24h: null,
    netFlow7d: null,
    netFlow30d: null,
    providerBreakdown: {},
    providerBreakdown7d: {},
    providerBreakdown30d: {},
    source: `${asset} ETF public source adapter`,
    timestamp: null,
    latestDate: null,
    parsedRowsCount: 0,
    status: "Missing",
    freshness: "unavailable",
    error: [publicRows.primaryError, publicRows.fallbackError].filter(Boolean).join(" | ") || `${asset} ETF flow source is unavailable; no fallback value is generated.`,
  };
}
