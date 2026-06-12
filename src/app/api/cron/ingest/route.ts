import { type NextRequest } from "next/server";
import { apiJson } from "@/lib/api-response";
import { moduleDataSourceStatus } from "@/lib/data-source-status";
import { REFRESH_INTERVAL_MINUTES } from "@/server/analytics/market-signals";
import { runStagedScheduledIngestion } from "@/server/ingestion/scheduler";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 300;
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const secret = process.env.INGESTION_CRON_SECRET ?? process.env.CRON_SECRET;
  const provided = request.headers.get("authorization")?.replace("Bearer ", "");

  if (secret && provided !== secret) {
    return apiJson({ error: "unauthorized" }, { status: 401 });
  }

  const sync = request.nextUrl.searchParams.get("sync") === "1";

  if (!sync) {
    const acceptedAt = new Date().toISOString();
    const scheduleBackgroundRun = () => {
      setTimeout(() => {
        void runStagedScheduledIngestion("cron_http").catch((error) => {
          console.error("[cmip-cron] staged ingestion failed", error);
        });
      }, 0);
    };
    scheduleBackgroundRun();
    return apiJson(
      {
        generatedAt: acceptedAt,
        dataSourceStatus: moduleDataSourceStatus.ingestionHealth,
        mode: "staged_scheduled_ingestion",
        accepted: true,
        refreshEveryMinutes: REFRESH_INTERVAL_MINUTES,
        message: "Cron ingestion accepted. Stage-isolated execution continues in the scheduler background task.",
        rootCauseFix:
          "cron route no longer keeps the HTTP response open while ingestion, Supabase persistence and fusion stages run. Use ?sync=1 only for local diagnostics.",
      },
      { status: 202 },
    );
  }

  const schedulerRun = await runStagedScheduledIngestion("manual_http");

  return apiJson({
    generatedAt: new Date().toISOString(),
    dataSourceStatus: moduleDataSourceStatus.ingestionHealth,
    mode: "staged_scheduled_ingestion",
    refreshEveryMinutes: REFRESH_INTERVAL_MINUTES,
    rootCauseFix:
      "cron route is now stage-isolated and returns a compact scheduler summary instead of a large monolithic ingestion/cache/derived payload.",
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
