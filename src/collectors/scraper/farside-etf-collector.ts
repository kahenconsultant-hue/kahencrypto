import type { Collector, CollectorOutput, SourceDefinition } from "@/types/ingestion";
import {
  aggregateEtfDailyRows,
  buildEtfRawMetrics,
  etfDailyFlowRecordsFromRows,
  fetchEtfRowsFromPublicSources,
  type EtfFlowAsset,
} from "@/server/data/farside-etf";

function assetFromSource(source: SourceDefinition): EtfFlowAsset {
  if (source.id.includes("eth") || source.assetRelevance.includes("ETH")) return "ETH";
  return "BTC";
}

const ETF_DAILY_FLOW_PERSISTENCE_WINDOW_DAYS = 120;

export const farsideEtfCollector: Collector = {
  sourceType: "scraper",
  async collect(source: SourceDefinition): Promise<CollectorOutput> {
    const started = Date.now();
    const fetchedAt = new Date().toISOString();
    const asset = assetFromSource(source);

    try {
      const result = await fetchEtfRowsFromPublicSources(asset, source.timeoutMs);
      const aggregation = aggregateEtfDailyRows(result.rows, asset);
      const persistedRows = result.rows.slice(0, ETF_DAILY_FLOW_PERSISTENCE_WINDOW_DAYS);
      const etfDailyFlows = etfDailyFlowRecordsFromRows(persistedRows);
      const rawMetrics = aggregation.rowsCount
        ? buildEtfRawMetrics({
            sourceId: source.id,
            sourceName: source.name,
            sourceType: source.sourceType === "api" ? "api" : "scraper",
            asset,
            aggregation,
          })
        : [];
      const status =
        result.provider === "Farside"
          ? "success"
          : (result.provider === "TheBlock" || result.provider === "Cache") && aggregation.latestFlowUsdMillion !== null
            ? "degraded"
            : "failed";
      const fallbackMessage =
        result.provider === "TheBlock"
          ? `Farside primary unavailable; real ETF rows were loaded from The Block public JSON fallback. ${result.primaryError ?? ""}`.trim()
          : result.provider === "Cache"
            ? `Fresh ETF sources unavailable; last valid ETF snapshot retained from cache. ${[result.primaryError, result.fallbackError].filter(Boolean).join(" | ")}`.trim()
          : undefined;
      const failureMessage =
        result.provider === "Missing"
          ? [result.primaryError, result.fallbackError].filter(Boolean).join(" | ") || `${asset} ETF source returned no parseable data.`
          : undefined;

      return {
        source,
        status,
        fetchedAt,
        latencyMs: Date.now() - started,
        rawEvents: [],
        rawMetrics,
        etfDailyFlows,
        diagnostics: result.diagnostics,
        error: fallbackMessage ?? failureMessage,
      };
    } catch (error) {
      return {
        source,
        status: "failed",
        fetchedAt,
        latencyMs: Date.now() - started,
        rawEvents: [],
        rawMetrics: [],
        etfDailyFlows: [],
        diagnostics: {
          asset,
          provider: "Missing",
          overallStatus: "Failed",
          durationMs: Date.now() - started,
        },
        error: error instanceof Error ? error.message : `${asset} ETF collector failed.`,
      };
    }
  },
};
