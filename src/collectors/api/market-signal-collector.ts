import type { Collector, CollectorOutput, RawMetricInput, SourceDefinition } from "@/types/ingestion";
import { fetchCurrentDataPoints } from "@/server/data/adapters";

function metricFromDataPoint(source: SourceDefinition, point: Awaited<ReturnType<typeof fetchCurrentDataPoints>>[number]): RawMetricInput {
  return {
    sourceId: source.id,
    sourceName: point.source || source.name,
    sourceType: point.sourceType ?? source.sourceType,
    asset: point.asset,
    group: point.group,
    metric: point.metric ?? point.key,
    value: typeof point.value === "number" ? point.value : null,
    previousValue: typeof point.previousValue === "number" ? point.previousValue : null,
    changeAbs: point.changeAbs,
    changePct: point.changePct,
    timestamp: point.timestamp,
    quality: point.quality,
    reliability: point.reliability,
    sampleSize: point.sampleSize,
    error: point.error,
    rawPayload: { key: point.key, estimatedReason: point.estimatedReason },
  };
}

export const marketSignalCollector: Collector = {
  sourceType: "api",
  async collect(source: SourceDefinition): Promise<CollectorOutput> {
    const started = Date.now();
    try {
      const points = await fetchCurrentDataPoints();
      const rawMetrics = points.map((point) => metricFromDataPoint(source, point));
      const failed = rawMetrics.filter((metric) => metric.quality === "unavailable" || metric.error).length;
      const status = failed === rawMetrics.length ? "failed" : failed > 0 ? "degraded" : "success";
      return {
        source,
        status,
        fetchedAt: new Date().toISOString(),
        latencyMs: Date.now() - started,
        rawEvents: [],
        rawMetrics,
        error: status === "failed" ? "All market signal adapters failed or were unavailable." : undefined,
      };
    } catch (error) {
      return {
        source,
        status: "failed",
        fetchedAt: new Date().toISOString(),
        latencyMs: Date.now() - started,
        rawEvents: [],
        rawMetrics: [],
        error: error instanceof Error ? error.message : "Market signal collector failed.",
      };
    }
  },
};
