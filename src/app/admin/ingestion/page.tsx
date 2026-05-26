import Link from "next/link";
import { AlertTriangle, Clock, Database, KeyRound, RotateCcw, ServerCrash } from "lucide-react";
import { productionSources } from "@/collectors/registry";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getEnvironmentValidationReport } from "@/health/environment-report";
import { getIntelligenceReliabilityReport } from "@/server/intelligence/reliability-engine";
import {
  getIngestionStorePath,
  getLatestDeadLetters,
  getLatestIngestionLogs,
  getLatestIngestionRun,
  getLatestSourceHealth,
  getSupabaseTableCounts,
} from "@/storage/ingestion-store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Ingestion Debug | C.M.I.P",
};

function minutesSince(timestamp: string | null | undefined) {
  if (!timestamp) return null;
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.round((Date.now() - parsed) / 60_000));
}

function statusVariant(status: string): "success" | "warning" | "danger" | "muted" | "outline" {
  if (status === "success") return "success";
  if (status === "degraded" || status === "api_key_missing") return "warning";
  if (status === "failed") return "danger";
  if (status === "disabled") return "muted";
  return "outline";
}

function sourceStatusText(status: string) {
  const labels: Record<string, string> = {
    success: "موفق",
    degraded: "ناقص",
    failed: "ناموفق",
    api_key_missing: "کلید API موجود نیست",
    disabled: "غیرفعال",
  };
  return labels[status] ?? status;
}

export default async function AdminIngestionPage() {
  const [lastRun, sourceHealth, logs, deadLetters, envReport, tableCounts, reliability] = await Promise.all([
    getLatestIngestionRun(),
    getLatestSourceHealth(),
    getLatestIngestionLogs(120),
    getLatestDeadLetters(80),
    getEnvironmentValidationReport(),
    getSupabaseTableCounts(["raw_events", "normalized_events", "event_clusters", "derived_signals", "liquidity_scores", "regime_inputs", "reliability_snapshots"]),
    getIntelligenceReliabilityReport(),
  ]);

  const sourceById = new Map(productionSources.map((source) => [source.id, source]));
  const healthById = new Map(sourceHealth.map((source) => [source.sourceId, source]));
  const activeSources = productionSources.filter((source) => source.enabled);
  const failedSources = sourceHealth.filter((source) => source.status === "failed" || source.status === "api_key_missing");
  const missingApiKeySources = productionSources.filter((source) => (source.requiredEnvKeys ?? []).some((key) => !process.env[key]));
  const staleSources = sourceHealth.filter((source) => {
    const definition = sourceById.get(source.sourceId);
    const age = minutesSince(source.updatedAt);
    if (age === null || !definition) return false;
    return age > Math.max(45, Math.ceil((definition.pollingIntervalSeconds / 60) * 2));
  });
  const latestRunLogs = lastRun ? logs.filter((log) => log.runId === lastRun.runId) : logs.slice(0, 20);
  const countByTable = new Map(tableCounts.map((row) => [row.table, row]));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">C.M.I.P ingestion debug</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-normal">پایش اجرای جمع‌آوری داده</h1>
          <p className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">
            این صفحه فقط وضعیت فنی ingestion را نشان می‌دهد. اگر منبعی در دسترس نباشد یا کلید API تنظیم نشده باشد، داده ساخته نمی‌شود و همان وضعیت در health و dead-letter ثبت می‌شود.
          </p>
        </div>
        <Link className="rounded-sm border px-3 py-2 text-xs text-muted-foreground hover:text-foreground" href="/admin">
          بازگشت به ادمین
        </Link>
      </div>

      <div className="grid gap-4 xl:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Database className="h-4 w-4 text-primary" aria-hidden />
              حالت ذخیره‌سازی
            </CardTitle>
            <CardDescription>وضعیت اتصال production persistence.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Badge variant={envReport.activeStorageMode === "supabase" ? "success" : "warning"}>{envReport.activeStorageMode}</Badge>
            <div className="text-xs text-muted-foreground">Supabase: {envReport.supabaseConnected ? "متصل" : "متصل نیست"}</div>
            <div className="text-xs text-muted-foreground">Service role: {envReport.serviceRoleAvailable ? "موجود" : "تنظیم نشده"}</div>
            {envReport.connectionError ? <div className="text-xs text-amber-200">{envReport.connectionError}</div> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <RotateCcw className="h-4 w-4 text-primary" aria-hidden />
              آخرین اجرا
            </CardTitle>
            <CardDescription>آخرین run ذخیره‌شده در Supabase یا local fallback.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {lastRun ? (
              <>
                <div className="number-tabular text-xs text-muted-foreground">{lastRun.runId}</div>
                <div>شروع: {new Date(lastRun.startedAt).toLocaleString("fa-IR")}</div>
                <div>پایان: {new Date(lastRun.finishedAt).toLocaleString("fa-IR")}</div>
                <div className="flex flex-wrap gap-2 pt-2">
                  <Badge variant="outline">رویداد {lastRun.pulledEvents}</Badge>
                  <Badge variant="outline">متریک {lastRun.pulledMetrics}</Badge>
                  <Badge variant="outline">raw insert {lastRun.rawEventsInserted ?? 0}</Badge>
                  <Badge variant="outline">raw update {lastRun.rawEventsUpdated ?? 0}</Badge>
                  <Badge variant="outline">normalized {lastRun.normalizedEventsCreated ?? 0}</Badge>
                  <Badge variant="outline">clusters {lastRun.eventClustersCreated ?? 0}</Badge>
                  <Badge variant={lastRun.failedSources ? "warning" : "success"}>ناموفق {lastRun.failedSources}</Badge>
                  <Badge variant={lastRun.deadLetters ? "warning" : "success"}>dead-letter {lastRun.deadLetters}</Badge>
                </div>
              </>
            ) : (
              <p className="text-xs leading-6 text-muted-foreground">هنوز اجرای ذخیره‌شده‌ای پیدا نشد. ابتدا `/api/cron/ingest` را اجرا کنید.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Database className="h-4 w-4 text-primary" aria-hidden />
              منابع فعال
            </CardTitle>
            <CardDescription>منابع enabled در registry تولیدی.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-3xl font-semibold number-tabular">{activeSources.length}</div>
            <div className="text-xs text-muted-foreground">کل منابع ثبت‌شده: {productionSources.length}</div>
            <div className="text-xs text-muted-foreground">مسیر fallback: {getIngestionStorePath()}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ServerCrash className="h-4 w-4 text-red-300" aria-hidden />
              منابع مشکل‌دار
            </CardTitle>
            <CardDescription>failed یا api_key_missing.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-3xl font-semibold number-tabular">{failedSources.length}</div>
            <div className="text-xs text-muted-foreground">stale: {staleSources.length}</div>
            <div className="text-xs text-muted-foreground">dead-letter ثبت‌شده: {deadLetters.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <KeyRound className="h-4 w-4 text-amber-300" aria-hidden />
              کلیدهای API
            </CardTitle>
            <CardDescription>منابعی که env لازم دارند.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-3xl font-semibold number-tabular">{missingApiKeySources.length}</div>
            <div className="text-xs text-muted-foreground">نبود کلید باعث تولید عدد جایگزین نمی‌شود.</div>
            <div className="text-xs text-muted-foreground">optional missing: {envReport.missingOptionalApiKeys.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Database className="h-4 w-4 text-primary" aria-hidden />
              نرمال‌سازی رویدادها
            </CardTitle>
            <CardDescription>خروجی آماده برای پردازش AI در فاز بعدی.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">raw_events {countByTable.get("raw_events")?.count ?? "?"}</Badge>
              <Badge variant="outline">normalized_events {countByTable.get("normalized_events")?.count ?? "?"}</Badge>
              <Badge variant="outline">event_clusters {countByTable.get("event_clusters")?.count ?? "?"}</Badge>
              <Badge variant="outline">derived_signals {countByTable.get("derived_signals")?.count ?? "?"}</Badge>
              <Badge variant="outline">liquidity_scores {countByTable.get("liquidity_scores")?.count ?? "?"}</Badge>
              <Badge variant="outline">regime_inputs {countByTable.get("regime_inputs")?.count ?? "?"}</Badge>
              <Badge variant="outline">reliability {countByTable.get("reliability_snapshots")?.count ?? "?"}</Badge>
            </div>
            <div className="text-xs text-muted-foreground">کلاسترها فقط provenance و شباهت deterministic را نگه می‌دارند؛ AI هنوز فعال نشده است.</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-amber-300" aria-hidden />
              قابلیت اتکای هوش
            </CardTitle>
            <CardDescription>پوشش فعلی لایه‌های intelligence.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <Badge variant={reliability.overallStatus === "healthy" ? "success" : reliability.overallStatus === "degraded" ? "warning" : "danger"}>
              Core {Math.round(reliability.coreReliability * 100)}٪ · Premium {Math.round(reliability.premiumCoverage * 100)}٪
            </Badge>
            <div className="text-xs text-muted-foreground">analysis mode: {reliability.analysisMode}</div>
            <div className="text-xs text-muted-foreground">Tier 1: {reliability.criticalSourcesOnline}/{reliability.criticalSourcesTotal}</div>
            <div className="text-xs text-muted-foreground">core modules: {reliability.availableCoreModules.length}</div>
            <div className="text-xs text-muted-foreground">degraded modules: {reliability.degradedModules.length}</div>
            <div className="text-xs text-muted-foreground">alert confidence cap: {reliability.confidenceCaps.alerts}%</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="h-4 w-4 text-primary" aria-hidden />
            وضعیت آخرین write به Supabase
          </CardTitle>
          <CardDescription>اگر Supabase env یا migration مشکل داشته باشد، خطا اینجا دیده می‌شود.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-md border bg-secondary/25 p-3 text-xs">
            <div className="text-muted-foreground">آخرین وضعیت</div>
            <Badge className="mt-2" variant={envReport.lastSupabaseWriteStatus === "success" ? "success" : envReport.lastSupabaseWriteStatus === "failed" ? "danger" : "warning"}>
              {envReport.lastSupabaseWriteStatus}
            </Badge>
          </div>
          <div className="rounded-md border bg-secondary/25 p-3 text-xs">
            <div className="text-muted-foreground">failed writes</div>
            <div className="mt-2 text-2xl font-semibold number-tabular">{envReport.failedWrites}</div>
          </div>
          {envReport.storageWriteReports.slice(0, 6).map((report) => (
            <div key={`${report.table}-${report.attemptedAt}`} className="rounded-md border bg-secondary/25 p-3 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span>{report.table}</span>
                <Badge variant={report.status === "success" ? "success" : report.status === "failed" ? "danger" : "muted"}>{report.status}</Badge>
              </div>
              <div className="mt-2 text-muted-foreground">rows: {report.rows} · {report.storageMode}</div>
              {report.error ? <div className="mt-2 text-red-200">{report.error}</div> : null}
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-4 w-4 text-primary" aria-hidden />
              سلامت منابع
            </CardTitle>
            <CardDescription>آخرین وضعیت ثبت‌شده برای هر source.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {activeSources.map((source) => {
              const health = healthById.get(source.id);
              const age = minutesSince(health?.updatedAt);
              const requiredMissing = (source.requiredEnvKeys ?? []).filter((key) => !process.env[key]);
              return (
                <div key={source.id} className="rounded-md border bg-secondary/25 p-3 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div>{source.name}</div>
                      <div className="mt-1 text-muted-foreground">{source.category} · tier {source.tier}</div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={statusVariant(health?.status ?? "disabled")}>{sourceStatusText(health?.status ?? "not_run")}</Badge>
                      <Badge variant="outline">{source.sourceType}</Badge>
                      <span className="text-muted-foreground">{age === null ? "بدون اجرا" : `${age} دقیقه پیش`}</span>
                    </div>
                  </div>
                  {requiredMissing.length ? <div className="mt-2 text-amber-200">کلیدهای تنظیم‌نشده: {requiredMissing.join(", ")}</div> : null}
                  {health?.lastError ? <div className="mt-2 text-red-200">{health.lastError}</div> : null}
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-amber-300" aria-hidden />
              لاگ‌ها و dead-letter
            </CardTitle>
            <CardDescription>آخرین خطاها و jobهایی که باید بعداً دوباره اجرا شوند.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">لاگ‌های آخرین اجرا</div>
              {latestRunLogs.length ? latestRunLogs.slice(0, 18).map((log) => (
                <div key={`${log.runId}-${log.sourceId}-${log.createdAt}`} className="rounded-md border bg-secondary/25 p-3 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>{log.sourceName}</span>
                    <Badge variant={statusVariant(log.status)}>{sourceStatusText(log.status)}</Badge>
                  </div>
                  <div className="mt-2 text-muted-foreground">{log.message}</div>
                </div>
              )) : <p className="rounded-md border bg-secondary/25 p-3 text-xs text-muted-foreground">لاگی برای نمایش وجود ندارد.</p>}
            </div>

            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">Dead-letter</div>
              {deadLetters.length ? deadLetters.slice(0, 12).map((entry) => (
                <div key={`${entry.runId}-${entry.sourceId}-${entry.failedAt}`} className="rounded-md border border-amber-500/25 bg-amber-500/10 p-3 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>{entry.sourceName}</span>
                    <Badge variant={statusVariant(entry.status)}>{sourceStatusText(entry.status)}</Badge>
                  </div>
                  <div className="mt-2 text-amber-100">{entry.error}</div>
                  {entry.nextRetryAt ? <div className="mt-1 text-muted-foreground">retry بعدی: {new Date(entry.nextRetryAt).toLocaleString("fa-IR")}</div> : null}
                </div>
              )) : <p className="rounded-md border bg-secondary/25 p-3 text-xs text-muted-foreground">dead-letter فعالی ثبت نشده است.</p>}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
