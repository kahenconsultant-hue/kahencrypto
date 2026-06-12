import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock,
  Database,
  Gauge,
  KeyRound,
  Layers3,
  ListChecks,
  ServerCrash,
  ShieldAlert,
  Workflow,
} from "lucide-react";
import Link from "next/link";
import { productionSources } from "@/collectors/registry";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getEnvironmentValidationReport } from "@/health/environment-report";
import { formatNumber, scoreColor } from "@/lib/utils";
import { getDataHealthDashboard, type AdminSourceStatus } from "@/server/admin/data-health-service";
import { getIngestionPipelineStatus } from "@/server/ingestion/pipeline";
import { getIntelligenceReliabilityReport } from "@/server/intelligence/reliability-engine";
import { getLatestIngestionLogs, getSupabaseTableCounts } from "@/storage/ingestion-store";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Ops | C.M.I.P",
};

function statusFa(status: AdminSourceStatus) {
  if (status === "connected") return "متصل";
  if (status === "degraded") return "کاهش کیفیت";
  return "قطع / ناموجود";
}

function statusVariant(status: AdminSourceStatus | "success" | "failed" | "degraded" | "api_key_missing" | "disabled") {
  if (status === "connected" || status === "success") return "success";
  if (status === "degraded" || status === "api_key_missing") return "warning";
  if (status === "disconnected" || status === "failed") return "danger";
  return "muted";
}

function timeFa(timestamp: string | null | undefined) {
  if (!timestamp) return "ناموجود";
  return new Intl.DateTimeFormat("fa-IR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

function agoFa(minutes: number | null | undefined) {
  if (minutes === null || minutes === undefined) return "ناموجود";
  if (minutes < 1) return "همین الان";
  if (minutes < 60) return `${formatNumber(minutes, 0)} دقیقه پیش`;
  return `${formatNumber(minutes / 60, 1)} ساعت پیش`;
}

function confidenceTone(label: string) {
  if (/strong|acceptable|قوی|قابل/.test(label)) return "success";
  if (/limited|متوسط|محدود/.test(label)) return "warning";
  return "danger";
}

function SectionTitle({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Activity;
  title: string;
  description: string;
}) {
  return (
    <CardHeader>
      <div>
        <CardTitle className="flex items-center gap-2 font-medium">
          <Icon className="h-4 w-4 text-primary" aria-hidden />
          {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </div>
    </CardHeader>
  );
}

export default async function AdminOpsPage() {
  const [dashboard, envReport, reliability, ingestionStatus, tableCounts, logs] = await Promise.all([
    getDataHealthDashboard(),
    getEnvironmentValidationReport(),
    getIntelligenceReliabilityReport(),
    getIngestionPipelineStatus(),
    getSupabaseTableCounts([
      "raw_events",
      "raw_metrics",
      "normalized_events",
      "event_clusters",
      "market_snapshots",
      "derived_signals",
      "liquidity_scores",
      "regime_inputs",
      "reliability_snapshots",
      "dead_letters",
      "ingestion_logs",
    ]),
    getLatestIngestionLogs(80),
  ]);

  const countByTable = new Map(tableCounts.map((row) => [row.table, row.count]));
  const enabledSources = productionSources.filter((source) => source.enabled);
  const sourceCounts = {
    connected: dashboard.dataSources.filter((source) => source.status === "connected").length,
    degraded: dashboard.dataSources.filter((source) => source.status === "degraded").length,
    disconnected: dashboard.dataSources.filter((source) => source.status === "disconnected").length,
  };
  const engineAnomalies = dashboard.engineHealth.filter(
    (engine) =>
      engine.status !== "connected" ||
      engine.inputCoveragePercent < 60 ||
      /weak|limited|ضعیف|محدود/i.test(engine.confidenceQuality),
  );
  const alertAnomalies = dashboard.alertAudit.filter(
    (alert) =>
      alert.flagged ||
      alert.confidence === null ||
      alert.confidence < 55 ||
      (alert.indicatorCount < 3 && /high|critical|systemic/i.test(alert.riskLevel)),
  );
  const latestRunLogs = dashboard.lastIngestionRun
    ? logs.filter((log) => log.runId === dashboard.lastIngestionRun?.runId)
    : logs.slice(0, 20);

  return (
    <div className="space-y-4 text-sm">
      <Card>
        <CardHeader className="items-start">
          <div>
            <CardTitle className="flex items-center gap-2 font-medium">
              <Workflow className="h-4 w-4 text-primary" aria-hidden />
              مرکز عملیات C.M.I.P
            </CardTitle>
            <CardDescription>
              نمای ادمین برای source health، ingestion stats، stale feeds، صف/retry، failures و confidence anomalies. این اطلاعات از داشبورد عمومی جدا شده‌اند.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={dashboard.scores.overallPlatformHealthScore >= 70 ? "success" : dashboard.scores.overallPlatformHealthScore >= 45 ? "warning" : "danger"}>
              سلامت کل {formatNumber(dashboard.scores.overallPlatformHealthScore, 0)}/100
            </Badge>
            <Badge variant={reliability.overallStatus === "healthy" ? "success" : reliability.overallStatus === "degraded" ? "warning" : "danger"}>
              reliability {reliability.overallStatus}
            </Badge>
            <Link className="rounded-sm border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground" href="/admin">
              admin
            </Link>
            <Link className="rounded-sm border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground" href="/admin/data-health">
              data health
            </Link>
            <Link className="rounded-sm border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground" href="/admin/ingestion">
              ingestion
            </Link>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-md border bg-secondary/25 p-3">
            <div className="text-[11px] text-muted-foreground">آخرین ingestion</div>
            <div className="mt-1 text-xs leading-6">{dashboard.lastIngestionRun ? timeFa(dashboard.lastIngestionRun.finishedAt) : "ناموجود"}</div>
          </div>
          <div className="rounded-md border bg-secondary/25 p-3">
            <div className="text-[11px] text-muted-foreground">منابع متصل</div>
            <div className="mt-1 text-xl font-medium">{sourceCounts.connected}/{dashboard.dataSources.length}</div>
          </div>
          <div className="rounded-md border bg-secondary/25 p-3">
            <div className="text-[11px] text-muted-foreground">موتورهای سالم</div>
            <div className="mt-1 text-xl font-medium">{dashboard.scores.enginesHealthy}/{dashboard.scores.totalEngines}</div>
          </div>
          <div className="rounded-md border bg-secondary/25 p-3">
            <div className="text-[11px] text-muted-foreground">storage mode</div>
            <Badge className="mt-2" variant={envReport.activeStorageMode === "supabase" ? "success" : "warning"}>{envReport.activeStorageMode}</Badge>
          </div>
          <div className="rounded-md border bg-secondary/25 p-3">
            <div className="text-[11px] text-muted-foreground">anomalies</div>
            <div className="mt-1 text-xl font-medium">{engineAnomalies.length + alertAnomalies.length}</div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <Card>
          <SectionTitle
            icon={Gauge}
            title="سلامت منابع"
            description="وضعیت عملیاتی همه sourceها، latency، تازگی و خطای آخر. داده ناموجود پنهان نمی‌شود."
          />
          <CardContent className="overflow-x-auto">
            <table className="w-full min-w-[940px] border-separate border-spacing-y-2 text-right text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="px-2 py-1 font-medium">Source</th>
                  <th className="px-2 py-1 font-medium">Status</th>
                  <th className="px-2 py-1 font-medium">Freshness</th>
                  <th className="px-2 py-1 font-medium">Latency</th>
                  <th className="px-2 py-1 font-medium">Coverage</th>
                  <th className="px-2 py-1 font-medium">Last Error</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.dataSources.map((source) => (
                  <tr key={source.sourceId} className="rounded-md bg-secondary/25 align-top">
                    <td className="rounded-r-md border-y border-r px-2 py-2">
                      <div className="font-medium">{source.sourceName}</div>
                      <div className="mt-1 text-[11px] text-muted-foreground">{source.sourceType} · tier {source.tier} · {source.accessModel}</div>
                    </td>
                    <td className="border-y px-2 py-2"><Badge variant={statusVariant(source.status)}>{statusFa(source.status)}</Badge></td>
                    <td className="border-y px-2 py-2">{agoFa(source.freshnessMinutes)}</td>
                    <td className="border-y px-2 py-2">{source.responseTimeMs === null ? "ناموجود" : `${source.responseTimeMs}ms`}</td>
                    <td className="border-y px-2 py-2">{formatNumber(source.coveragePercent, 0)}%</td>
                    <td className="rounded-l-md border-y border-l px-2 py-2 text-muted-foreground">{source.lastError ?? source.warningFa ?? "بدون خطا"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <SectionTitle
              icon={Layers3}
              title="Internal Adapter Bundle"
              description="نبود enrichment اختیاری نباید وضعیت bundle را Fail کند."
            />
            <CardContent className="space-y-3">
              <div className="grid gap-2 md:grid-cols-2">
                <div className="rounded-md border bg-secondary/25 p-3">
                  <div className="text-[11px] text-muted-foreground">Bundle status</div>
                  <Badge className="mt-2" variant={dashboard.adapterBundleBreakdown.status === "success" ? "success" : dashboard.adapterBundleBreakdown.status === "degraded" ? "warning" : "danger"}>
                    {dashboard.adapterBundleBreakdown.status}
                  </Badge>
                </div>
                <div className="rounded-md border bg-secondary/25 p-3">
                  <div className="text-[11px] text-muted-foreground">Core adapters</div>
                  <div className="mt-1 text-lg font-medium">{dashboard.adapterBundleBreakdown.coreHealthy}/{dashboard.adapterBundleBreakdown.coreTotal}</div>
                </div>
                <div className="rounded-md border bg-secondary/25 p-3">
                  <div className="text-[11px] text-muted-foreground">Optional adapters</div>
                  <div className="mt-1 text-lg font-medium">{dashboard.adapterBundleBreakdown.optionalHealthy}/{dashboard.adapterBundleBreakdown.optionalTotal}</div>
                </div>
                <div className="rounded-md border bg-secondary/25 p-3">
                  <div className="text-[11px] text-muted-foreground">Blocking failures</div>
                  <div className="mt-1 text-lg font-medium">{dashboard.adapterBundleBreakdown.blockingFailures.length}</div>
                </div>
              </div>
              <p className="rounded-md border bg-secondary/25 p-3 text-xs leading-6 text-muted-foreground">{dashboard.adapterBundleBreakdown.summaryFa}</p>
              {dashboard.adapterBundleBreakdown.nonBlockingMissingInputs.length ? (
                <div className="flex flex-wrap gap-2">
                  {dashboard.adapterBundleBreakdown.nonBlockingMissingInputs.slice(0, 14).map((input) => (
                    <Badge key={input} variant="outline">{input}</Badge>
                  ))}
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <SectionTitle
              icon={Activity}
              title="Queue و retry"
              description="وضعیت ساده صف محلی، dead-letter و retry. صف واقعی در فازهای بعدی می‌تواند Redis-backed شود."
            />
            <CardContent className="grid gap-2 md:grid-cols-2">
              <div className="rounded-md border bg-secondary/25 p-3">
                <div className="text-[11px] text-muted-foreground">queued</div>
                <div className="mt-1 text-xl font-medium">{ingestionStatus.queued}</div>
              </div>
              <div className="rounded-md border bg-secondary/25 p-3">
                <div className="text-[11px] text-muted-foreground">processed</div>
                <div className="mt-1 text-xl font-medium">{ingestionStatus.processed}</div>
              </div>
              <div className="rounded-md border bg-secondary/25 p-3">
                <div className="text-[11px] text-muted-foreground">failed sources</div>
                <div className="mt-1 text-xl font-medium">{ingestionStatus.failed}</div>
              </div>
              <div className="rounded-md border bg-secondary/25 p-3">
                <div className="text-[11px] text-muted-foreground">dead letters latest run</div>
                <div className="mt-1 text-xl font-medium">{dashboard.failures.deadLetters.length}</div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <SectionTitle
            icon={Database}
            title="آمار ingestion و persistence"
            description="آخرین run، table counts و وضعیت write در Supabase."
          />
          <CardContent className="space-y-3">
            <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-md border bg-secondary/25 p-3"><div className="text-[11px] text-muted-foreground">events</div><div className="mt-1 text-lg font-medium">{dashboard.lastIngestionRun?.pulledEvents ?? 0}</div></div>
              <div className="rounded-md border bg-secondary/25 p-3"><div className="text-[11px] text-muted-foreground">metrics</div><div className="mt-1 text-lg font-medium">{dashboard.lastIngestionRun?.pulledMetrics ?? 0}</div></div>
              <div className="rounded-md border bg-secondary/25 p-3"><div className="text-[11px] text-muted-foreground">normalized</div><div className="mt-1 text-lg font-medium">{dashboard.lastIngestionRun?.normalizedEventsCreated ?? 0}</div></div>
              <div className="rounded-md border bg-secondary/25 p-3"><div className="text-[11px] text-muted-foreground">clusters</div><div className="mt-1 text-lg font-medium">{dashboard.lastIngestionRun?.eventClustersCreated ?? 0}</div></div>
            </div>
            <div className="flex flex-wrap gap-2">
              {Array.from(countByTable.entries()).map(([table, count]) => (
                <Badge key={table} variant="outline">{table}: {count}</Badge>
              ))}
            </div>
            <div className="rounded-md border bg-secondary/25 p-3 text-xs leading-6 text-muted-foreground">
              Supabase: {envReport.supabaseConnected ? "متصل" : "قطع"} · service role: {envReport.serviceRoleAvailable ? "موجود" : "ناموجود"} · last write: {envReport.lastSupabaseWriteStatus}
            </div>
          </CardContent>
        </Card>

        <Card>
          <SectionTitle
            icon={ShieldAlert}
            title="ناهنجاری confidence"
            description="موتورها یا alertهایی که coverage، confidence یا indicator count کافی ندارند."
          />
          <CardContent className="space-y-3">
            <div className="space-y-2">
              {engineAnomalies.length ? engineAnomalies.map((engine) => (
                <div key={engine.engineName} className="rounded-md border bg-secondary/25 p-3 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{engine.engineName}</span>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={statusVariant(engine.status)}>{statusFa(engine.status)}</Badge>
                      <Badge variant={confidenceTone(engine.confidenceQuality)}>{engine.confidenceQuality}</Badge>
                      <Badge variant="outline">coverage {formatNumber(engine.inputCoveragePercent, 0)}%</Badge>
                    </div>
                  </div>
                  {engine.warningFa ? <div className="mt-2 text-muted-foreground">{engine.warningFa}</div> : null}
                </div>
              )) : <div className="rounded-md border bg-secondary/25 p-3 text-xs text-muted-foreground">ناهنجاری confidence در موتورهای اصلی دیده نشد.</div>}
            </div>
            <div className="space-y-2">
              {alertAnomalies.length ? alertAnomalies.slice(0, 8).map((alert) => (
                <div key={alert.alertId} className="rounded-md border bg-secondary/25 p-3 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{alert.alertName}</span>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant={alert.flagged ? "warning" : "outline"}>indicator {alert.indicatorCount}</Badge>
                      <Badge variant={alert.confidence !== null && alert.confidence >= 55 ? "success" : "warning"}>confidence {alert.confidence ?? "ناموجود"}</Badge>
                    </div>
                  </div>
                  {alert.missingInputs.length ? <div className="mt-2 text-amber-100">missing: {alert.missingInputs.join("، ")}</div> : null}
                </div>
              )) : <div className="rounded-md border bg-secondary/25 p-3 text-xs text-muted-foreground">alert با کیفیت مشکوک در خروجی فعلی دیده نشد.</div>}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Card>
          <SectionTitle
            icon={ServerCrash}
            title="Failures و stale feeds"
            description="این بخش برای ادمین است؛ خطاهای داخلی در dashboard عمومی نمایش داده نمی‌شوند."
          />
          <CardContent className="grid gap-3 md:grid-cols-2">
            <div className="rounded-md border bg-secondary/25 p-3 text-xs">
              <div className="mb-2 flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-300" /> Stale Sources</div>
              {dashboard.failures.staleSources.length ? dashboard.failures.staleSources.slice(0, 8).map((source) => (
                <div key={source.sourceId} className="border-t py-2">{source.sourceName} / {agoFa(source.freshnessMinutes)}</div>
              )) : <div className="text-muted-foreground">موردی ثبت نشده</div>}
            </div>
            <div className="rounded-md border bg-secondary/25 p-3 text-xs">
              <div className="mb-2 flex items-center gap-2"><KeyRound className="h-4 w-4 text-amber-300" /> Missing API Keys</div>
              {dashboard.failures.missingApiKeySources.length ? dashboard.failures.missingApiKeySources.slice(0, 8).map((source) => (
                <div key={source.sourceId} className="border-t py-2">{source.sourceName}: {source.warningFa}</div>
              )) : <div className="text-muted-foreground">موردی ثبت نشده</div>}
            </div>
            <div className="rounded-md border bg-secondary/25 p-3 text-xs">
              <div className="mb-2 flex items-center gap-2"><Database className="h-4 w-4 text-primary" /> Dead Letters آخرین اجرا</div>
              {dashboard.failures.deadLetters.length ? dashboard.failures.deadLetters.slice(0, 8).map((letter) => (
                <div key={`${letter.sourceId}-${letter.failedAt}`} className="border-t py-2">{letter.sourceName}: {letter.error}</div>
              )) : <div className="text-muted-foreground">موردی ثبت نشده</div>}
            </div>
            <div className="rounded-md border bg-secondary/25 p-3 text-xs">
              <div className="mb-2 flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /> Storage Write Failures</div>
              {dashboard.failures.storageWriteFailures.length ? dashboard.failures.storageWriteFailures.slice(0, 8).map((failure) => (
                <div key={`${failure.table}-${failure.attemptedAt}`} className="border-t py-2">{failure.table}: {failure.error ?? "ناموفق"}</div>
              )) : <div className="text-muted-foreground">موردی ثبت نشده</div>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <SectionTitle
            icon={ListChecks}
            title="آخرین API / collector logs"
            description="برای تشخیص rate limit، endpoint failure، latency و fallback."
          />
          <CardContent className="space-y-2">
            {dashboard.apiLogs.slice(0, 18).map((log, index) => (
              <div key={`${log.sourceName}-${log.timestamp}-${index}`} className="rounded-md border bg-secondary/25 p-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{log.sourceName}</span>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={statusVariant(log.status)}>{log.statusLabel}</Badge>
                    <Badge variant="outline">{log.latencyMs === null ? "latency ناموجود" : `${log.latencyMs}ms`}</Badge>
                  </div>
                </div>
                <div className="mt-1 text-muted-foreground" dir="ltr">{log.endpoint ?? "endpoint unavailable"}</div>
                {log.errorMessage ? <div className="mt-2 text-amber-100">{log.errorMessage}</div> : null}
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <SectionTitle
          icon={BarChart3}
          title="Reliability model"
          description="تفکیک core reliability و premium coverage؛ نبود منبع premium نباید کل سیستم را از کار بیندازد."
        />
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-md border bg-secondary/25 p-3">
            <div className="text-[11px] text-muted-foreground">Core Reliability</div>
            <div className={`mt-1 text-xl font-medium ${scoreColor(reliability.coreReliability * 100)}`}>{formatNumber(reliability.coreReliability * 100, 0)}%</div>
          </div>
          <div className="rounded-md border bg-secondary/25 p-3">
            <div className="text-[11px] text-muted-foreground">Premium Coverage</div>
            <div className={`mt-1 text-xl font-medium ${scoreColor(reliability.premiumCoverage * 100)}`}>{formatNumber(reliability.premiumCoverage * 100, 0)}%</div>
          </div>
          <div className="rounded-md border bg-secondary/25 p-3">
            <div className="text-[11px] text-muted-foreground">Tier 1 critical</div>
            <div className="mt-1 text-xl font-medium">{reliability.criticalSourcesOnline}/{reliability.criticalSourcesTotal}</div>
          </div>
          <div className="rounded-md border bg-secondary/25 p-3">
            <div className="text-[11px] text-muted-foreground">Enabled sources</div>
            <div className="mt-1 text-xl font-medium">{enabledSources.length}/{productionSources.length}</div>
          </div>
          <div className="rounded-md border bg-secondary/25 p-3 xl:col-span-4">
            <div className="text-[11px] text-muted-foreground">analysis mode</div>
            <div className="mt-2 text-xs leading-6">{reliability.analysisMode}</div>
            <div className="mt-3 flex flex-wrap gap-2">
              {reliability.degradedModules.map((module) => <Badge key={module} variant="warning">{module}</Badge>)}
              {reliability.disabledPremiumModules.map((module) => <Badge key={module} variant="muted">{module}</Badge>)}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
