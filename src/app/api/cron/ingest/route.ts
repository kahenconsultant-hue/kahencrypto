import { type NextRequest } from "next/server";
import { apiJson } from "@/lib/api-response";
import { moduleDataSourceStatus } from "@/lib/data-source-status";
import { REFRESH_INTERVAL_MINUTES } from "@/server/analytics/market-signals";
import { runDerivedSignalProcessing } from "@/server/analytics/derived-signal-engine";
import { refreshSignalCache } from "@/server/data/signal-cache";
import { runProductionIngestion } from "@/server/ingestion/pipeline";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(request: NextRequest) {
  const secret = process.env.INGESTION_CRON_SECRET ?? process.env.CRON_SECRET;
  const provided = request.headers.get("authorization")?.replace("Bearer ", "");

  if (secret && provided !== secret) {
    return apiJson({ error: "unauthorized" }, { status: 401 });
  }

  const [ingestion, refresh] = await Promise.all([runProductionIngestion(), refreshSignalCache()]);
  const derived = await runDerivedSignalProcessing(ingestion.runId);

  return apiJson({
    generatedAt: new Date().toISOString(),
    dataSourceStatus: moduleDataSourceStatus.ingestionHealth,
    mode: "scheduled_ingestion_foundation",
    refreshEveryMinutes: REFRESH_INTERVAL_MINUTES,
    ingestion,
    cacheLayer: {
      provider: "C.M.I.P signal cache",
      ttlSeconds: REFRESH_INTERVAL_MINUTES * 60,
      strategy: "adapterهای واقعی ابتدا snapshot می‌سازند؛ موتورهای کمی فقط از همین snapshot محاسبه می‌کنند.",
      refresh,
    },
    derivedSignals: {
      generated: derived.derivedSignals.length,
      persisted: derived.persisted.derivedSignals,
      liquidityProxyScore: derived.liquidity.cryptoLiquidityProxyScore,
      regimeProxy: derived.regimeInput.regime,
    },
    sourceRefreshJobs: [
      "binance_spot_and_futures_public",
      "yahoo_finance_macro_delayed",
      "defillama_stablecoins",
      "official_rss_macro_and_geopolitics",
      "configured_etf_flow_feed",
      "configured_onchain_reserves_feed",
    ],
    result: {
      pulledEvents: ingestion.pulledEvents,
      pulledMetrics: ingestion.pulledMetrics,
      persistedEvents: ingestion.persistedEvents,
      persistedMetrics: ingestion.persistedMetrics,
      pulledSignals: refresh.counts.total,
      derivedSignals: derived.derivedSignals.length,
      liquidityProxyGenerated: derived.liquidity.cryptoLiquidityProxyScore !== null,
      regimeProxyGenerated: derived.regimeInput.regime !== "insufficient_core_data",
      liveSignals: refresh.counts.live,
      delayedSignals: refresh.counts.delayed,
      unavailableSignals: refresh.counts.unavailable,
      estimatedSignals: refresh.counts.estimated,
      failed: ingestion.failedSources + refresh.failedSources.length,
      deadLetters: ingestion.deadLetters,
      sourceHealth: ingestion.sourceHealth,
    },
    nextSteps: [
      "ذخیره raw event و raw metric در Supabase یا local fallback",
      "ثبت source health و ingestion log برای هر منبع",
      "نمایش ناموجود برای منابعی که اتصال معتبر ندارند",
      "جلوگیری از تولید تحلیل، هشدار یا امتیاز ساختگی در نبود داده",
    ],
  });
}

export async function POST(request: NextRequest) {
  return GET(request);
}
