import { type NextRequest } from "next/server";
import { apiJson } from "@/lib/api-response";
import { moduleDataSourceStatus } from "@/lib/data-source-status";
import { REFRESH_INTERVAL_MINUTES } from "@/server/analytics/market-signals";
import { runStagedScheduledIngestion } from "@/server/ingestion/scheduler";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;
export const runtime = "nodejs";

function executionEnvironment() {
  if (process.env.VERCEL_ENV) return process.env.VERCEL_ENV;
  if (process.env.VERCEL) return "vercel";
  return process.env.NODE_ENV ?? "local";
}

function schedulerSourceForRequest(request: NextRequest, sync: boolean) {
  if (sync) return "manual_http" as const;
  const sourceHeader = request.headers.get("x-cmip-scheduler-source")?.toLowerCase() ?? "";
  const userAgent = request.headers.get("user-agent")?.toLowerCase() ?? "";
  const querySource = request.nextUrl.searchParams.get("scheduler")?.toLowerCase() ?? "";
  if (sourceHeader.includes("cron-job.org") || userAgent.includes("cron-job.org") || querySource === "cron-job-org") {
    return "external_cron_job_org" as const;
  }
  return "unknown_http" as const;
}

export async function GET(request: NextRequest) {
  const secret = process.env.INGESTION_CRON_SECRET ?? process.env.CRON_SECRET;
  const provided = request.headers.get("authorization")?.replace("Bearer ", "");

  if (secret && provided !== secret) {
    return apiJson({ error: "unauthorized" }, { status: 401 });
  }

  const sync = request.nextUrl.searchParams.get("sync") === "1";
  const schedulerSource = schedulerSourceForRequest(request, sync);
  const schedulerRun = await runStagedScheduledIngestion(sync ? "manual_http" : "cron_http", {
    schedulerSource,
    executionEnvironment: executionEnvironment(),
  });

  return apiJson({
    generatedAt: new Date().toISOString(),
    dataSourceStatus: moduleDataSourceStatus.ingestionHealth,
    mode: "staged_scheduled_ingestion_completed",
    completed: true,
    refreshEveryMinutes: REFRESH_INTERVAL_MINUTES,
    trigger: schedulerRun.trigger,
    schedulerSource,
    executionEnvironment: schedulerRun.executionEnvironment,
    storageMode: schedulerRun.storageMode ?? "local_fallback",
    rootCauseFix:
      "cron route now completes staged ingestion inside the request lifecycle. It no longer returns HTTP 202 before ingestion finishes and no longer depends on post-response setTimeout background execution.",
    schedulerRun,
    result: {
      status: schedulerRun.status,
      stages: schedulerRun.stages.map((stage) => ({
        stageId: stage.stageId,
        status: stage.status,
        durationMs: stage.durationMs,
        pulledEvents: stage.pulledEvents,
        pulledMetrics: stage.pulledMetrics,
        failedSources: stage.failedSources,
        degradedSources: stage.degradedSources,
        deadLetters: stage.deadLetters,
        error: stage.error ?? null,
      })),
      successRate: schedulerRun.successRate,
      failedStage: schedulerRun.failedStage,
      retryCount: schedulerRun.retryCount,
      staleSignals: schedulerRun.staleSignals,
      nextRunAt: schedulerRun.nextRunAt,
    },
  });
}

export async function POST(request: NextRequest) {
  return GET(request);
}
