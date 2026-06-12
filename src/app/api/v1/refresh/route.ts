import { apiJson } from "@/lib/api-response";
import { getFreshnessReportSync } from "@/health/freshness-engine";
import { buildForecastSnapshots } from "@/server/analytics/forecast_snapshot_engine";
import { validateDueForecasts } from "@/server/analytics/forecast_validation_engine";
import { REFRESH_INTERVAL_MINUTES } from "@/server/analytics/market-signals";
import { getSignalCacheStatusSync, refreshSignalCache } from "@/server/data/signal-cache";
import { runStagedScheduledIngestion } from "@/server/ingestion/scheduler";
import { persistForecastSnapshots, persistForecastValidations } from "@/storage/ingestion-store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

let activeCatchupIngestion: Promise<void> | null = null;

async function withRefreshTimeout<T>(promise: Promise<T>, timeoutMs = 25_000): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`refresh timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function scheduleCatchupIngestionIfNeeded() {
  if (process.env.CMIP_DISABLE_REFRESH_CATCHUP === "1") {
    return {
      scheduled: false,
      alreadyRunning: false,
      reason: "full staged refresh catch-up is disabled because CMIP_DISABLE_REFRESH_CATCHUP=1 is set.",
      freshness: getFreshnessReportSync(),
    };
  }

  const freshness = getFreshnessReportSync();
  const refreshAge = freshness.refreshAgeMinutes;
  const materiallyLate = refreshAge === null || refreshAge > REFRESH_INTERVAL_MINUTES * 2;
  const staleState = freshness.overallFreshnessState === "stale" || freshness.overallFreshnessState === "obsolete";

  if (!materiallyLate && !staleState) {
    return {
      scheduled: false,
      alreadyRunning: false,
      reason: "scheduler freshness is still within the catch-up guardrail.",
      freshness,
    };
  }

  if (activeCatchupIngestion) {
    return {
      scheduled: false,
      alreadyRunning: true,
      reason: "a dashboard-triggered catch-up ingestion is already running.",
      freshness,
    };
  }

  activeCatchupIngestion = new Promise<void>((resolve) => {
    setTimeout(() => {
      void runStagedScheduledIngestion("ui_refresh_catchup")
        .catch((error) => {
          console.error("[cmip-refresh] dashboard catch-up ingestion failed", error);
        })
        .finally(() => {
          activeCatchupIngestion = null;
          resolve();
        });
    }, 0);
  });

  return {
    scheduled: true,
    alreadyRunning: false,
    reason: "dashboard freshness was outside the expected update window; staged ingestion catch-up was scheduled in the background.",
    freshness,
  };
}

export async function GET() {
  const status = getSignalCacheStatusSync();

  if (status.exists && status.ageMinutes !== null && status.ageMinutes < REFRESH_INTERVAL_MINUTES) {
    const catchup = scheduleCatchupIngestionIfNeeded();
    return apiJson({
      refreshed: false,
      reason: "cache هنوز در بازه معتبر ۳۰ دقیقه‌ای است.",
      status,
      nextScheduledUpdateMinutes: Math.max(0, REFRESH_INTERVAL_MINUTES - status.ageMinutes),
      backgroundIngestionScheduled: catchup.scheduled,
      catchupAlreadyRunning: catchup.alreadyRunning,
      backgroundIngestionReason: catchup.reason,
      freshnessBeforeCatchup: {
        state: catchup.freshness.overallFreshnessState,
        ageMinutes: catchup.freshness.refreshAgeMinutes,
      },
    });
  }

  const refresh = await withRefreshTimeout(refreshSignalCache());
  const forecastRunId = `refresh:${refresh.generatedAt}`;
  const forecastValidations = validateDueForecasts(new Date(refresh.generatedAt));
  const forecastSnapshots = buildForecastSnapshots(forecastRunId, new Date(refresh.generatedAt));
  const [forecastValidationWrite, forecastSnapshotWrite] = await Promise.all([
    persistForecastValidations(forecastValidations),
    persistForecastSnapshots(forecastSnapshots),
  ]);
  const catchup = scheduleCatchupIngestionIfNeeded();

  return apiJson({
    refreshed: true,
    reason: "cache سیگنال‌ها stale بود یا وجود نداشت؛ adapterهای داده دوباره اجرا شدند.",
    refresh,
    forecastValidation: {
      snapshotsStored: forecastSnapshotWrite.persisted,
      validationsStored: forecastValidationWrite.persisted,
      storageMode: forecastSnapshotWrite.storageMode === "supabase" || forecastValidationWrite.storageMode === "supabase" ? "supabase" : "local_fallback",
      note: "Forecast snapshots are generated only from the current C.M.I.P analysis state; no historical forecast backfill is created.",
    },
    backgroundIngestionScheduled: catchup.scheduled,
    catchupAlreadyRunning: catchup.alreadyRunning,
    backgroundIngestionReason: catchup.reason,
    freshnessBeforeCatchup: {
      state: catchup.freshness.overallFreshnessState,
      ageMinutes: catchup.freshness.refreshAgeMinutes,
    },
    backgroundMode:
      "این مسیر cache سیگنال‌ها را تازه می‌کند. اگر freshness کلی از پنجره مجاز عقب افتاده باشد، ingestion کامل stage-isolated به صورت catch-up در پس‌زمینه اجرا می‌شود تا UI قفل نشود.",
  });
}
