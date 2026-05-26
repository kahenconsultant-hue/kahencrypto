import { apiJson } from "@/lib/api-response";
import { REFRESH_INTERVAL_MINUTES } from "@/server/analytics/market-signals";
import { runDerivedSignalProcessing } from "@/server/analytics/derived-signal-engine";
import { getSignalCacheStatusSync, refreshSignalCache } from "@/server/data/signal-cache";
import { runProductionIngestion } from "@/server/ingestion/pipeline";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const status = getSignalCacheStatusSync();

  if (status.exists && status.ageMinutes !== null && status.ageMinutes < REFRESH_INTERVAL_MINUTES) {
    return apiJson({
      refreshed: false,
      reason: "cache هنوز در بازه معتبر ۳۰ دقیقه‌ای است.",
      status,
      nextScheduledUpdateMinutes: Math.max(0, REFRESH_INTERVAL_MINUTES - status.ageMinutes),
    });
  }

  const [refresh, ingestion] = await Promise.all([refreshSignalCache(), runProductionIngestion()]);
  const derived = await runDerivedSignalProcessing(ingestion.runId);
  return apiJson({
    refreshed: true,
    reason: "cache سیگنال‌ها stale بود یا وجود نداشت؛ adapterهای داده دوباره اجرا شدند.",
    refresh,
    ingestion,
    derivedSignals: {
      generated: derived.derivedSignals.length,
      persisted: derived.persisted.derivedSignals,
      liquidityProxyScore: derived.liquidity.cryptoLiquidityProxyScore,
      regimeProxy: derived.regimeInput.regime,
    },
  });
}
