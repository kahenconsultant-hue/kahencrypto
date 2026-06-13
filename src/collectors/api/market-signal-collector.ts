import type { Collector, CollectorOutput, RawMetricInput, SourceDefinition } from "@/types/ingestion";
import { fetchCurrentDataPoints } from "@/server/data/adapters";
import { buildAdapterBundleBreakdown } from "@/server/data/adapter-bundle-diagnostics";
import { getSignalSnapshot } from "@/server/analytics/market-signals";
import type { DataPoint } from "@/lib/types";

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
    rawPayload: { key: point.key, estimatedReason: point.estimatedReason, adapterSource: point.source },
  };
}

function isUsablePoint(point: DataPoint) {
  return typeof point.value === "number" && Number.isFinite(point.value) && point.quality !== "unavailable" && point.quality !== "estimated";
}

function sourceLevelStatus(source: SourceDefinition, points: DataPoint[]): Pick<CollectorOutput, "status" | "error"> {
  const requestedKeys = source.signalKeys ?? [];
  const usable = points.filter(isUsablePoint);
  const missing = points.filter((point) => !isUsablePoint(point));

  if (!requestedKeys.length) {
    return { status: "disabled", error: "No signal keys configured for this market signal source." };
  }

  if (!usable.length) {
    return {
      status: "failed",
      error: missing.map((point) => `${point.key}: ${point.error ?? "unavailable"}`).join(" | ") || "No requested source-level metrics were available.",
    };
  }

  if (missing.length) {
    return {
      status: "degraded",
      error: `Partial source fetch: ${usable.length}/${requestedKeys.length} metrics updated. Missing: ${missing.map((point) => point.key).join(", ")}`,
    };
  }

  return { status: "success", error: undefined };
}

export const marketSignalCollector: Collector = {
  sourceType: "api",
  async collect(source: SourceDefinition): Promise<CollectorOutput> {
    const started = Date.now();
    try {
      const points = await fetchCurrentDataPoints(source.signalKeys);
      const rawMetrics = points.map((point) => metricFromDataPoint(source, point));
      const isInternalBundle = source.id === "cmip-public-market-signal-adapters";
      const isStageLimitedBundle = isInternalBundle && Boolean(source.signalKeys?.length) && (source.signalKeys?.length ?? 0) < 24;
      const bundleSignals = isInternalBundle
        ? Array.from(new Map([...getSignalSnapshot().signals, ...points].map((signal) => [signal.key, signal])).values())
        : points;
      const breakdown = isInternalBundle && !isStageLimitedBundle ? buildAdapterBundleBreakdown(bundleSignals) : null;
      const sourceStatus = isInternalBundle && !isStageLimitedBundle ? null : sourceLevelStatus(source, points);
      const status = breakdown?.status ?? sourceStatus?.status ?? "failed";
      const diagnosticSummary = breakdown
        ? status === "success"
          ? undefined
          : status === "failed"
            ? `Blocking core adapter failure: ${breakdown.blockingFailures.join(", ")}`
            : `Core adapters ${breakdown.coreHealthy}/${breakdown.coreTotal}; optional enrichments missing: ${breakdown.nonBlockingMissingInputs.slice(0, 8).join(", ") || "none"}`
        : sourceStatus?.error;
      return {
        source,
        status,
        fetchedAt: new Date().toISOString(),
        latencyMs: Date.now() - started,
        rawEvents: [],
        rawMetrics: rawMetrics.map((metric) => ({
          ...metric,
          rawPayload: {
            ...(typeof metric.rawPayload === "object" && metric.rawPayload !== null ? metric.rawPayload : {}),
            sourceLevelStatus: status,
            ...(breakdown ? { adapterBundleStatus: breakdown.status } : {}),
          },
        })),
        error: diagnosticSummary,
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
