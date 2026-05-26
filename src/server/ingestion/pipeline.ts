import { runIngestionFoundation } from "@/api/ingestion";
import { getIngestionFoundationStatusSync } from "@/health/source-health";
import type { IngestionRunSummary } from "@/types/ingestion";

export type { RawEventInput as RawItem } from "@/types/ingestion";

export interface IngestionResult {
  pulled: number;
  deduplicated: number;
  queued: number;
  processed: number;
  failed: number;
  sourceHealth: Array<{ source: string; ok: boolean; latencyMs: number; message: string }>;
}

export async function runProductionIngestion(): Promise<IngestionRunSummary> {
  return runIngestionFoundation();
}

export function getIngestionPipelineStatus(): IngestionResult {
  const status = getIngestionFoundationStatusSync();
  return {
    pulled: status.latestEvents.length + status.latestMetrics.length,
    deduplicated: 0,
    queued: 0,
    processed: status.latestEvents.length + status.latestMetrics.length,
    failed: status.failedSources,
    sourceHealth: status.sourceHealth.map((source) => ({
      source: source.sourceName,
      ok: source.status === "success" || source.status === "degraded",
      latencyMs: source.latencyMs,
      message: source.lastError ?? `status=${source.status}`,
    })),
  };
}
