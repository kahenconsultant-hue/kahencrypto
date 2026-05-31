export type EtfFlowAsset = "BTC" | "ETH";
export type EtfFlowHorizon = "24h" | "7d";

export interface EtfFlowSnapshot {
  asset: EtfFlowAsset;
  netFlow24h: number | null;
  netFlow7d: number | null;
  source: string;
  timestamp: string | null;
  status: "Available" | "Missing" | "Stale";
  freshness: "fresh" | "delayed" | "stale" | "unavailable";
  error?: string;
}

function envNumber(key: string) {
  const value = process.env[key];
  if (value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function getEtfFlows(asset: EtfFlowAsset, _horizon: EtfFlowHorizon = "24h"): Promise<EtfFlowSnapshot> {
  const prefix = asset === "BTC" ? "CMIP_BTC_ETF_FLOW" : "CMIP_ETH_ETF_FLOW";
  const netFlow24h = envNumber(`${prefix}_24H`);
  const netFlow7d = envNumber(`${prefix}_7D`);
  const timestamp = process.env[`${prefix}_UPDATED_AT`] ?? process.env[`${prefix}_24H_TIMESTAMP`] ?? null;
  const available = netFlow24h !== null || netFlow7d !== null;

  if (!available) {
    return {
      asset,
      netFlow24h: null,
      netFlow7d: null,
      source: `${asset} ETF flow adapter`,
      timestamp: null,
      status: "Missing",
      freshness: "unavailable",
      error: `${asset} ETF flow source is not configured; no fallback value is generated.`,
    };
  }

  const ageMinutes = timestamp ? Math.max(0, Math.round((Date.now() - Date.parse(timestamp)) / 60_000)) : 0;
  const freshness = timestamp && ageMinutes > 180 ? "stale" : timestamp && ageMinutes > 45 ? "delayed" : "fresh";

  return {
    asset,
    netFlow24h,
    netFlow7d,
    source: `Configured ${asset} ETF flow feed`,
    timestamp: timestamp ?? new Date().toISOString(),
    status: freshness === "stale" ? "Stale" : "Available",
    freshness,
  };
}
