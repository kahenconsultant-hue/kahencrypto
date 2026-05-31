import { calculateOverallPlatformHealthScore } from "@/server/admin/data-health-service";
import { generateSmartAlerts } from "@/server/alerts/smart-alert-engine";
import { fetchCurrentDataPoints } from "@/server/data/adapters";

export async function runFredDiagnostic() {
  if (!process.env.FRED_API_KEY) {
    return {
      name: "FRED CPIAUCSL",
      status: "skipped",
      message: "FRED_API_KEY is not configured.",
    };
  }
  const [cpi] = await fetchCurrentDataPoints(["cpi_latest"]);
  return {
    name: "FRED CPIAUCSL",
    status: cpi.value !== null && cpi.quality !== "unavailable" ? "passed" : "failed",
    latestValue: cpi.value,
    source: cpi.source,
    timestamp: cpi.timestamp,
    error: cpi.error ?? null,
  };
}

export async function runLiquidityStablecoinDiagnostic() {
  const points = await fetchCurrentDataPoints(["stablecoin_market_cap_7d", "stablecoin_market_cap_30d", "total_stablecoin_market_cap_usd", "stablecoin_dominance"]);
  const available = points.filter((point) => point.value !== null && point.quality !== "unavailable");
  return {
    name: "DefiLlama stablecoin liquidity inputs",
    status: available.length >= 3 ? "passed" : available.length ? "partial" : "failed",
    availableSignals: available.map((point) => point.key),
    missingSignals: points.filter((point) => point.value === null || point.quality === "unavailable").map((point) => ({ key: point.key, error: point.error ?? null })),
  };
}

export function runAlertConfidenceDiagnostic() {
  const liquidityAlerts = generateSmartAlerts().filter((alert) => alert.type === "Liquidity Alert" || alert.type === "liquidity_proxy_alert" || alert.type === "stablecoin_pressure_alert");
  const cappedCorrectly = liquidityAlerts.every((alert) => {
    const missingKeys = new Set((alert.dataUsed ?? []).filter((item) => item.status === "missing").map((item) => item.key));
    const etfMissing = missingKeys.has("btc_etf_flow_24h") || missingKeys.has("eth_etf_flow_24h");
    const exchangeMissing = missingKeys.has("exchange_inflows") || missingKeys.has("exchange_outflows");
    return !(etfMissing && exchangeMissing) || alert.confidence <= 55;
  });
  return {
    name: "Liquidity alert confidence caps",
    status: cappedCorrectly ? "passed" : "failed",
    checkedAlerts: liquidityAlerts.map((alert) => ({
      id: alert.id,
      confidence: alert.confidence,
      priority: alert.priority,
      confidenceCapReason: alert.confidenceCapReason ?? null,
    })),
  };
}

export function runHealthScoreDiagnostic() {
  const score = calculateOverallPlatformHealthScore({
    sourceReliabilityScore: 100,
    freshnessScore: 100,
    coverageScore: 100,
    engineReliabilityScore: 25,
  });
  return {
    name: "Overall health engine reliability cap",
    status: score <= 65 ? "passed" : "failed",
    score,
  };
}

export async function runDataConnectionDiagnostics() {
  const [fred, stablecoins] = await Promise.all([runFredDiagnostic(), runLiquidityStablecoinDiagnostic()]);
  return {
    generatedAt: new Date().toISOString(),
    checks: [fred, stablecoins, runAlertConfidenceDiagnostic(), runHealthScoreDiagnostic()],
  };
}
