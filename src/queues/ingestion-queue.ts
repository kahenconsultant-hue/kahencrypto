import type { Collector, IngestionJobResult, SourceDefinition } from "@/types/ingestion";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runCollectorWithRetry(source: SourceDefinition, collector: Collector): Promise<IngestionJobResult> {
  const maxAttempts = Math.max(1, source.retryPolicy.maxAttempts);
  let attempt = 0;
  let lastResult: IngestionJobResult["output"] | null = null;

  while (attempt < maxAttempts) {
    attempt += 1;
    lastResult = await collector.collect(source);
    if (lastResult.status === "success" || lastResult.status === "degraded" || lastResult.status === "api_key_missing" || lastResult.status === "disabled") {
      return { output: lastResult, attempts: attempt };
    }
    if (attempt < maxAttempts) {
      const backoff = source.retryPolicy.backoffMs * source.retryPolicy.backoffMultiplier ** (attempt - 1);
      await sleep(backoff);
    }
  }

  return {
    output:
      lastResult ?? {
        source,
        status: "failed",
        fetchedAt: new Date().toISOString(),
        latencyMs: 0,
        rawEvents: [],
        rawMetrics: [],
        error: "Collector did not produce a result.",
      },
    attempts: attempt,
  };
}
