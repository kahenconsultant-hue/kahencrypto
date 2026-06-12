import { getDynamicCorrelationReport, type CorrelationWindow } from "@/server/analytics/correlation-engine";

const auditRequiredSamples: Record<CorrelationWindow, number> = {
  "24h": 12,
  "7d": 5,
  "30d": 20,
  "90d": 60,
};

const auditTargetPairs = new Set([
  "BTC ↔ ETH",
  "BTC ↔ SOL",
  "BTC ↔ DXY",
  "BTC ↔ Nasdaq",
  "BTC ↔ Gold",
  "BTC ↔ US10Y",
  "BTC ↔ Stablecoin Market Cap",
]);

function isCryptoOnlyPair(pair: string) {
  return pair === "BTC ↔ ETH" || pair === "BTC ↔ SOL" || pair === "ETH ↔ SOL";
}

function expectedWindows(pair: string): CorrelationWindow[] {
  return isCryptoOnlyPair(pair) ? ["24h", "7d", "30d", "90d"] : ["7d", "30d", "90d"];
}

export function runCorrelationHistoryAudit() {
  const report = getDynamicCorrelationReport();
  const auditedRows = report.correlationTable
    .filter((row) => auditTargetPairs.has(row.pair))
    .map((row) => {
      const windows = expectedWindows(row.pair).map((window) => {
        const actualSampleCount = row.observations[window] ?? 0;
        const requiredSampleCount = auditRequiredSamples[window];
        const coverageRatio = requiredSampleCount ? Math.min(1, actualSampleCount / requiredSampleCount) : 0;
        return {
          window,
          actualSampleCount,
          requiredSampleCount,
          coverageRatio,
          status: actualSampleCount >= requiredSampleCount ? "sufficient" as const : "insufficient" as const,
        };
      });
      const historyCoverageFactor = Math.round(Math.min(...windows.map((window) => window.coverageRatio)) * 100);
      const insufficientWindows = windows.filter((window) => window.status === "insufficient");
      const confidenceCapApplied = row.confidence !== null && row.confidence > historyCoverageFactor;

      return {
        pair: row.pair,
        windows,
        actualSampleCount: Math.min(...windows.map((window) => window.actualSampleCount)),
        requiredSampleCount: Math.max(...windows.map((window) => window.requiredSampleCount)),
        coverageRatio: Number((historyCoverageFactor / 100).toFixed(2)),
        historyCoverageFactor,
        confidence: row.confidence,
        confidenceCapApplied,
        narrativeAllowed: insufficientWindows.length ? false : row.narrativeAllowed,
        narrativeStatus: insufficientWindows.length ? "Insufficient Historical Coverage" : row.narrativeAllowed ? "Allowed" : "Disabled",
        insufficientWindows: insufficientWindows.map((window) => `${window.window}: ${window.actualSampleCount}/${window.requiredSampleCount}`),
      };
    });

  return {
    generatedAt: new Date().toISOString(),
    pairsAudited: auditedRows.length,
    insufficientHistoryPairs: auditedRows.filter((row) => row.insufficientWindows.length > 0).length,
    confidenceCapsApplied: auditedRows.filter((row) => row.confidenceCapApplied).length,
    rows: auditedRows,
  };
}
