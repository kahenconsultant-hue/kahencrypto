import { calculateOverallPlatformHealthScore } from "@/server/admin/data-health-service";
import { getDynamicCorrelationReport, rollingCorrelation } from "@/server/analytics/correlation-engine";
import { generateSmartAlerts } from "@/server/alerts/smart-alert-engine";
import { fetchCurrentDataPoints } from "@/server/data/adapters";
import { buildAdapterBundleBreakdown } from "@/server/data/adapter-bundle-diagnostics";

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
    analyticsQualityScore: 25,
    operationalReliabilityScore: 100,
    coverageScore: 100,
    schedulerReliabilityScore: 100,
  });
  return {
    name: "Overall health analytics quality weighting",
    status: score <= 65 ? "passed" : "failed",
    score,
  };
}

export function runAdapterBundleDiagnostic() {
  const coreKeys = [
    "btc_trend_24h",
    "eth_trend_24h",
    "sol_trend_24h",
    "spot_volume_btc_24h",
    "spot_volume_eth_24h",
    "spot_volume_sol_24h",
    "funding_btc",
    "funding_eth",
    "funding_sol",
    "open_interest_btc_24h",
    "open_interest_eth_24h",
    "open_interest_sol_24h",
    "usdt_supply_7d",
    "usdc_supply_7d",
    "stablecoin_market_cap_7d",
    "stablecoin_market_cap_30d",
    "total_stablecoin_market_cap_usd",
    "btc_market_cap",
    "eth_market_cap",
    "sol_market_cap",
    "dxy_trend_24h",
    "us10y_trend_24h",
    "cpi_latest",
    "ppi_latest",
    "fed_funds_rate",
    "unemployment_rate",
    "news_sentiment_macro",
    "geopolitical_event_score",
  ];
  const syntheticCoreSignals = coreKeys.map((key) => ({
    key,
    value: 1,
    quality: "live" as const,
    source: "diagnostic synthetic core signal",
    timestamp: new Date().toISOString(),
    sampleSize: 30,
  }));
  const breakdown = buildAdapterBundleBreakdown(syntheticCoreSignals);
  return {
    name: "Adapter bundle optional-missing degradation",
    status: breakdown.status === "degraded" && !breakdown.blockingFailures.length ? "passed" : "failed",
    bundleStatus: breakdown.status,
    coreHealthy: `${breakdown.coreHealthy}/${breakdown.coreTotal}`,
    optionalHealthy: `${breakdown.optionalHealthy}/${breakdown.optionalTotal}`,
    nonBlockingMissingInputs: breakdown.nonBlockingMissingInputs,
  };
}

export function runCorrelationDiagnostics() {
  const missingFallback = rollingCorrelation([], []);
  const validCorrelation = rollingCorrelation([0.01, 0.02, -0.01, 0.03, 0.015], [0.011, 0.018, -0.012, 0.028, 0.017]);
  const report = getDynamicCorrelationReport();
  const enoughPairsConnected = report.validPairs >= 6 ? report.engineStatus === "connected" : true;
  return {
    name: "Correlation engine data handling",
    status: missingFallback === null && validCorrelation !== null && enoughPairsConnected ? "passed" : "failed",
    missingDataFallback: missingFallback,
    syntheticValidCorrelation: validCorrelation,
    validPairs: report.validPairs,
    engineStatus: report.engineStatus,
    engineScore: report.engineScore,
    insufficientRows: report.correlationTable.filter((row) => row.status !== "available").map((row) => row.pair),
  };
}

export function runAlertCorrelationIntegrationDiagnostic() {
  const alerts = generateSmartAlerts();
  const correlationRows = alerts.flatMap((alert) => (alert.dataUsed ?? []).filter((item) => item.key.startsWith("correlation:")));
  return {
    name: "Alert correlation confirmation availability",
    status: correlationRows.every((row) => row.status === "available" || row.status === "missing") ? "passed" : "failed",
    correlationIndicators: correlationRows.map((row) => ({
      label: row.label,
      status: row.status,
      value: row.value ?? null,
    })),
  };
}

export async function runDataConnectionDiagnostics() {
  const [fred, stablecoins] = await Promise.all([runFredDiagnostic(), runLiquidityStablecoinDiagnostic()]);
  return {
    generatedAt: new Date().toISOString(),
    checks: [
      fred,
      stablecoins,
      runAlertConfidenceDiagnostic(),
      runHealthScoreDiagnostic(),
      runAdapterBundleDiagnostic(),
      runCorrelationDiagnostics(),
      runAlertCorrelationIntegrationDiagnostic(),
    ],
  };
}
