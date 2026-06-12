import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bug,
  CheckCircle2,
  CircleSlash,
  Database,
  FileText,
  Gauge,
  Layers3,
  Newspaper,
  Server,
  ShieldAlert,
  Waves,
} from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber, scoreColor } from "@/lib/utils";
import {
  type AdminSourceStatus,
  type MetricAvailability,
  getDataHealthDashboard,
} from "@/server/admin/data-health-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata = {
  title: "Data Health | C.M.I.P",
};

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function statusLabel(status: AdminSourceStatus) {
  if (status === "connected") return "Connected";
  if (status === "degraded") return "Degraded";
  return "Disconnected";
}

function statusFa(status: AdminSourceStatus) {
  if (status === "connected") return "متصل";
  if (status === "degraded") return "کاهش کیفیت";
  return "قطع / ناموجود";
}

function statusVariant(status: AdminSourceStatus): "success" | "warning" | "danger" {
  if (status === "connected") return "success";
  if (status === "degraded") return "warning";
  return "danger";
}

function metricStatusFa(status: MetricAvailability) {
  if (status === "available") return "Available";
  if (status === "proxy") return "Proxy";
  if (status === "estimated") return "Estimated";
  return "Missing";
}

function metricStatusVariant(status: MetricAvailability): "success" | "warning" | "danger" {
  if (status === "available") return "success";
  if (status === "estimated" || status === "proxy") return "warning";
  return "danger";
}

function bundleStatusVariant(status: "success" | "degraded" | "failed"): "success" | "warning" | "danger" {
  if (status === "success") return "success";
  if (status === "degraded") return "warning";
  return "danger";
}

function bundleStatusLabel(status: "success" | "degraded" | "failed") {
  if (status === "success") return "Success";
  if (status === "degraded") return "Degraded";
  return "Fail";
}

function schedulerStatusVariant(status: "success" | "success_with_limited_confidence" | "degraded" | "failed" | "skipped"): "success" | "warning" | "danger" {
  if (status === "success") return "success";
  if (status === "success_with_limited_confidence" || status === "degraded" || status === "skipped") return "warning";
  return "danger";
}

function schedulerStatusLabel(status: "success" | "success_with_limited_confidence" | "degraded" | "failed" | "skipped") {
  if (status === "success") return "Success";
  if (status === "success_with_limited_confidence") return "Limited Success";
  if (status === "degraded") return "Degraded";
  if (status === "skipped") return "No run";
  return "Fail";
}

function detailText(value: unknown) {
  if (value === null || value === undefined || value === "") return "ناموجود";
  if (typeof value === "number") return Number.isFinite(value) ? formatNumber(value, 0) : "ناموجود";
  if (typeof value === "boolean") return value ? "بله" : "خیر";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

function apiLogVariant(status: string): "success" | "warning" | "danger" {
  if (status === "success") return "success";
  if (status === "degraded") return "warning";
  return "danger";
}

function integrityStatusVariant(status: "clean" | "corrected" | "violations"): "success" | "warning" | "danger" {
  if (status === "clean") return "success";
  if (status === "corrected") return "warning";
  return "danger";
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

function valueFa(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "ناموجود";
  return formatNumber(value, 2);
}

function SectionTitle({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Database;
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

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border bg-secondary/25 p-3 text-xs leading-6 text-muted-foreground">
      {children}
    </div>
  );
}

export default async function AdminDataHealthPage({ searchParams }: { searchParams?: SearchParams }) {
  const params = searchParams ? await searchParams : {};
  const debug = params.debug === "1";
  const dashboard = await getDataHealthDashboard();

  return (
    <div className="space-y-4 text-sm">
      <Card>
        <CardHeader className="items-start">
          <div>
            <CardTitle className="flex items-center gap-2 font-medium">
              <Gauge className="h-4 w-4 text-primary" aria-hidden />
              سلامت داده C.M.I.P
            </CardTitle>
            <CardDescription>
              نمای کامل منابع، APIها، ingestion، پوشش سیگنال‌ها، سلامت موتورها، کیفیت alertها و داده‌های stale یا missing.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={dashboard.scores.overallPlatformHealthScore >= 70 ? "success" : dashboard.scores.overallPlatformHealthScore >= 45 ? "warning" : "danger"}>
              Overall {formatNumber(dashboard.scores.overallPlatformHealthScore, 0)}/100
            </Badge>
            <Badge variant="outline">Generated {timeFa(dashboard.generatedAt)}</Badge>
            <Link className="rounded-sm border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground" href="/admin/ingestion">
              ingestion admin
            </Link>
            <Link className="rounded-sm border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground" href="/admin/ops">
              ops center
            </Link>
            <Link
              className="rounded-sm border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground"
              href={debug ? "/admin/data-health" : "/admin/data-health?debug=1"}
            >
              {debug ? "Hide Raw Data" : "Show Raw Data"}
            </Link>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
          <div className="rounded-md border bg-secondary/25 p-3">
            <div className="text-[11px] text-muted-foreground">Overall Health</div>
            <div className={`mt-1 text-xl font-medium ${scoreColor(dashboard.scores.overallPlatformHealthScore)}`}>
              {formatNumber(dashboard.scores.overallPlatformHealthScore, 0)}/100
            </div>
          </div>
          <div className="rounded-md border bg-secondary/25 p-3">
            <div className="text-[11px] text-muted-foreground">Data Coverage</div>
            <div className={`mt-1 text-xl font-medium ${scoreColor(dashboard.scores.dataCoveragePercent)}`}>
              {formatNumber(dashboard.scores.dataCoveragePercent, 0)}%
            </div>
          </div>
          <div className="rounded-md border bg-secondary/25 p-3">
            <div className="text-[11px] text-muted-foreground">Critical Core Sources</div>
            <div className="mt-1 text-xl font-medium">
              {dashboard.scores.criticalCoreConnectedSources}/{dashboard.scores.criticalCoreTotalSources}
            </div>
          </div>
          <div className="rounded-md border bg-secondary/25 p-3">
            <div className="text-[11px] text-muted-foreground">All Active Sources</div>
            <div className="mt-1 text-xl font-medium">
              {dashboard.scores.allActiveConnectedSources}/{dashboard.scores.allActiveTotalSources}
            </div>
          </div>
          <div className="rounded-md border bg-secondary/25 p-3">
            <div className="text-[11px] text-muted-foreground">Optional/Premium Active</div>
            <div className="mt-1 text-xl font-medium">
              {dashboard.scores.optionalPremiumActiveSources}/{dashboard.scores.optionalPremiumTotalSources}
            </div>
          </div>
          <div className="rounded-md border bg-secondary/25 p-3">
            <div className="text-[11px] text-muted-foreground">Degraded / Disabled</div>
            <div className="mt-1 text-xl font-medium">
              {dashboard.scores.degradedSources}/{dashboard.scores.disabledSources}
            </div>
          </div>
          <div className="rounded-md border bg-secondary/25 p-3">
            <div className="text-[11px] text-muted-foreground">Engines Healthy</div>
            <div className="mt-1 text-xl font-medium">
              {dashboard.scores.enginesHealthy}/{dashboard.scores.totalEngines}
            </div>
          </div>
          <div className="rounded-md border bg-secondary/25 p-3">
            <div className="text-[11px] text-muted-foreground">Operational Reliability</div>
            <div className={`mt-1 text-xl font-medium ${scoreColor(dashboard.scores.operationalReliabilityScore)}`}>
              {formatNumber(dashboard.scores.operationalReliabilityScore, 0)}/100
            </div>
          </div>
          <div className="rounded-md border bg-secondary/25 p-3">
            <div className="text-[11px] text-muted-foreground">Last Ingestion Run</div>
            <div className="mt-1 text-xs leading-6 text-foreground">
              {dashboard.lastIngestionRun ? timeFa(dashboard.lastIngestionRun.finishedAt) : "ناموجود"}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <SectionTitle
          icon={Activity}
          title="Scheduler Dashboard"
          description="وضعیت اجرای مرحله‌ای cron، زمان‌بندی بعدی، retry، stageهای ناموفق و شبیه‌سازی ۱۲ چرخه برای پایداری عملیاتی."
        />
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
            <div className="rounded-md border bg-secondary/25 p-3">
              <div className="text-[11px] text-muted-foreground">Scheduler Status</div>
              <div className="mt-2">
                <Badge variant={schedulerStatusVariant(dashboard.scheduler.status)}>{schedulerStatusLabel(dashboard.scheduler.status)}</Badge>
              </div>
            </div>
            <div className="rounded-md border bg-secondary/25 p-3">
              <div className="text-[11px] text-muted-foreground">Last Run</div>
              <div className="mt-1 text-xs leading-6">{timeFa(dashboard.scheduler.lastRun)}</div>
            </div>
            <div className="rounded-md border bg-secondary/25 p-3">
              <div className="text-[11px] text-muted-foreground">Next Run</div>
              <div className="mt-1 text-xs leading-6">{timeFa(dashboard.scheduler.nextRun)}</div>
            </div>
            <div className="rounded-md border bg-secondary/25 p-3">
              <div className="text-[11px] text-muted-foreground">Duration</div>
              <div className="mt-1 text-lg font-medium">{dashboard.scheduler.durationMs === null ? "ناموجود" : `${formatNumber(dashboard.scheduler.durationMs / 1000, 1)}s`}</div>
            </div>
            <div className="rounded-md border bg-secondary/25 p-3">
              <div className="text-[11px] text-muted-foreground">Success Rate</div>
              <div className={`mt-1 text-lg font-medium ${scoreColor(dashboard.scheduler.successRate)}`}>{formatNumber(dashboard.scheduler.successRate, 0)}%</div>
            </div>
            <div className="rounded-md border bg-secondary/25 p-3">
              <div className="text-[11px] text-muted-foreground">Retry / Stale</div>
              <div className="mt-1 text-xs leading-6">Retry {dashboard.scheduler.retryCount} / Stale {dashboard.scheduler.staleSignals}</div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-separate border-spacing-y-2 text-right text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="px-2 py-1 font-medium">Stage</th>
                  <th className="px-2 py-1 font-medium">Status</th>
                  <th className="px-2 py-1 font-medium">Duration</th>
                  <th className="px-2 py-1 font-medium">Failed Sources</th>
                  <th className="px-2 py-1 font-medium">Degraded Sources</th>
                  <th className="px-2 py-1 font-medium">Dead Letters</th>
                  <th className="px-2 py-1 font-medium">Retry</th>
                  <th className="px-2 py-1 font-medium">Error</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.scheduler.stages.length ? dashboard.scheduler.stages.map((stage) => (
                  <tr key={stage.stageId} className="bg-secondary/25 align-top">
                    <td className="rounded-r-md border-y border-r px-2 py-2">
                      <div className="font-medium">{stage.label}</div>
                      <div className="mt-1 text-[11px] text-muted-foreground">{stage.stageId}</div>
                    </td>
                    <td className="border-y px-2 py-2"><Badge variant={schedulerStatusVariant(stage.status)}>{schedulerStatusLabel(stage.status)}</Badge></td>
                    <td className="border-y px-2 py-2">{formatNumber(stage.durationMs / 1000, 1)}s</td>
                    <td className="border-y px-2 py-2">{stage.failedSources}</td>
                    <td className="border-y px-2 py-2">{stage.degradedSources}</td>
                    <td className="border-y px-2 py-2">{stage.deadLetters}</td>
                    <td className="border-y px-2 py-2">{stage.retryCount}</td>
                    <td className="rounded-l-md border-y border-l px-2 py-2 text-muted-foreground">
                      <div>{stage.error ?? "بدون خطا"}</div>
                      {stage.stageId === "etf" && stage.details ? (
                        <div className="mt-2 grid gap-1 rounded-md border bg-background/40 p-2 text-[11px] leading-5">
                          <div>ETF duration: {formatNumber(Number(stage.details.etfStageDurationMs ?? stage.durationMs) / 1000, 1)}s</div>
                          <div>Farside: {detailText(stage.details.farsideStatus)} / The Block: {detailText(stage.details.theBlockStatus)}</div>
                          <div>BTC rows: {detailText(stage.details.parsedBtcRows)} / ETH rows: {detailText(stage.details.parsedEthRows)}</div>
                          <div>BTC date: {detailText(stage.details.latestBtcEtfDate)} / ETH date: {detailText(stage.details.latestEthEtfDate)}</div>
                          <div>Fallback: {detailText(stage.details.usedFallbackSource)} / Freshness: {detailText(stage.details.etfFreshness)}</div>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                )) : (
                  <tr><td className="rounded-md border bg-secondary/25 p-3 text-muted-foreground" colSpan={8}>هنوز اجرای scheduler ثبت نشده است.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-md border bg-secondary/25 p-3 text-xs">Simulation cycles: {dashboard.scheduler.simulation.cycles}</div>
            <div className="rounded-md border bg-secondary/25 p-3 text-xs">Successful: {dashboard.scheduler.simulation.successfulCycles}</div>
            <div className="rounded-md border bg-secondary/25 p-3 text-xs">Failed: {dashboard.scheduler.simulation.failedCycles}</div>
            <div className="rounded-md border bg-secondary/25 p-3 text-xs">Missed updates: {dashboard.scheduler.simulation.missedUpdates}</div>
            <div className="rounded-md border bg-secondary/25 p-3 text-xs">Avg duration: {formatNumber(dashboard.scheduler.simulation.averageDurationMs / 1000, 1)}s</div>
          </div>
          <p className="text-xs leading-6 text-muted-foreground">{dashboard.scheduler.simulation.noteFa}</p>
        </CardContent>
      </Card>

      <Card>
        <SectionTitle
          icon={ShieldAlert}
          title="Integrity Dashboard"
          description="کنترل تناقض روایت، تورم confidence، stale signals، ورودی‌های missing و خروجی‌هایی که باید downgrade یا reject شوند."
        />
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={integrityStatusVariant(dashboard.integrity.status)}>
              {dashboard.integrity.status === "clean" ? "Clean" : dashboard.integrity.status === "corrected" ? "Corrected" : "Violations"}
            </Badge>
            <Badge variant="outline">Corrections {dashboard.integrity.correctionsApplied}</Badge>
            <Badge variant="outline">Narratives rejected {dashboard.integrity.narrativesRejected}</Badge>
            <Badge variant="outline">Signals downgraded {dashboard.integrity.signalsDowngraded}</Badge>
            <Badge variant="outline">Confidence adjustments {dashboard.integrity.confidenceAdjustments}</Badge>
          </div>
          <p className="text-xs leading-6 text-muted-foreground">{dashboard.integrity.summaryFa}</p>
          <div className="grid gap-3 lg:grid-cols-3">
            <div className="rounded-md border bg-secondary/25 p-3">
              <div className="text-xs font-medium">Consistency Violations</div>
              <div className="mt-2 space-y-2">
                {dashboard.integrity.consistencyViolations.length ? dashboard.integrity.consistencyViolations.slice(0, 5).map((item) => (
                  <p key={item.id} className="text-[11px] leading-5 text-muted-foreground">{item.titleFa}: {item.correctionFa}</p>
                )) : <p className="text-[11px] text-muted-foreground">تناقض بحرانی ثبت نشده است.</p>}
              </div>
            </div>
            <div className="rounded-md border bg-secondary/25 p-3">
              <div className="text-xs font-medium">Freshness / Confidence</div>
              <div className="mt-2 space-y-2">
                {[...dashboard.integrity.freshnessViolations, ...dashboard.integrity.confidenceViolations].slice(0, 5).map((item) => (
                  <p key={item.id} className="text-[11px] leading-5 text-muted-foreground">{item.titleFa}: {item.detailFa}</p>
                ))}
                {!dashboard.integrity.freshnessViolations.length && !dashboard.integrity.confidenceViolations.length ? <p className="text-[11px] text-muted-foreground">confidence/freshness violation فعالی ثبت نشده است.</p> : null}
              </div>
            </div>
            <div className="rounded-md border bg-secondary/25 p-3">
              <div className="text-xs font-medium">Rejected / Missing</div>
              <div className="mt-2 space-y-2">
                {dashboard.integrity.narrativeCorrections.slice(0, 4).map((item) => (
                  <p key={item.id} className="text-[11px] leading-5 text-muted-foreground">{item.titleFa}: {item.correctionFa}</p>
                ))}
                {dashboard.integrity.missingInputs.length ? (
                  <p className="text-[11px] leading-5 text-amber-200">Missing: {dashboard.integrity.missingInputs.slice(0, 8).join("، ")}</p>
                ) : null}
                {!dashboard.integrity.narrativeCorrections.length && !dashboard.integrity.missingInputs.length ? <p className="text-[11px] text-muted-foreground">ورودی missing یا روایت reject شده فعالی ثبت نشده است.</p> : null}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <SectionTitle
          icon={Server}
          title="۱. Data Sources"
          description="تمام منابع configured با وضعیت اتصال، آخرین دریافت موفق، خطا، latency، تازگی و coverage."
        />
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-separate border-spacing-y-2 text-right text-xs">
            <thead className="text-muted-foreground">
              <tr>
                <th className="px-2 py-1 font-medium">Source Name</th>
                <th className="px-2 py-1 font-medium">Status</th>
                <th className="px-2 py-1 font-medium">Last Successful Update</th>
                <th className="px-2 py-1 font-medium">Last Error</th>
                <th className="px-2 py-1 font-medium">Response Time</th>
                <th className="px-2 py-1 font-medium">Data Freshness</th>
                <th className="px-2 py-1 font-medium">Coverage</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.dataSources.map((source) => (
                <tr key={source.sourceId} className="rounded-md bg-secondary/25 align-top">
                  <td className="rounded-r-md border-y border-r px-2 py-2">
                    <div className="font-medium">{source.sourceName}</div>
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      {source.sourceType} / tier {source.tier} / {source.accessModel}
                    </div>
                  </td>
                  <td className="border-y px-2 py-2">
                    <Badge variant={statusVariant(source.status)}>{statusLabel(source.status)}</Badge>
                    <div className="mt-1 text-[11px] text-muted-foreground">{statusFa(source.status)}</div>
                  </td>
                  <td className="border-y px-2 py-2">{timeFa(source.lastSuccessfulUpdate)}</td>
                  <td className="max-w-[260px] border-y px-2 py-2 text-muted-foreground">
                    {source.lastError ?? source.warningFa ?? "بدون خطای ثبت‌شده"}
                  </td>
                  <td className="border-y px-2 py-2">{source.responseTimeMs === null ? "ناموجود" : `${formatNumber(source.responseTimeMs, 0)} ms`}</td>
                  <td className="border-y px-2 py-2">{agoFa(source.freshnessMinutes)}</td>
                  <td className="rounded-l-md border-y border-l px-2 py-2">
                    <span className={scoreColor(source.coveragePercent)}>{formatNumber(source.coveragePercent, 0)}%</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <SectionTitle
          icon={Layers3}
          title="Internal Adapter Bundle Breakdown"
          description="جزئیات adapterهای هسته‌ای و اختیاری؛ نبود enrichment اختیاری نباید bundle را Fail کند."
        />
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-md border bg-secondary/25 p-3">
              <div className="text-[11px] text-muted-foreground">Bundle Status</div>
              <div className="mt-2">
                <Badge variant={bundleStatusVariant(dashboard.adapterBundleBreakdown.status)}>
                  {bundleStatusLabel(dashboard.adapterBundleBreakdown.status)}
                </Badge>
              </div>
            </div>
            <div className="rounded-md border bg-secondary/25 p-3">
              <div className="text-[11px] text-muted-foreground">Core adapters</div>
              <div className="mt-1 text-lg font-medium">
                {dashboard.adapterBundleBreakdown.coreHealthy}/{dashboard.adapterBundleBreakdown.coreTotal} healthy
              </div>
            </div>
            <div className="rounded-md border bg-secondary/25 p-3">
              <div className="text-[11px] text-muted-foreground">Optional adapters</div>
              <div className="mt-1 text-lg font-medium">
                {dashboard.adapterBundleBreakdown.optionalHealthy}/{dashboard.adapterBundleBreakdown.optionalTotal} healthy
              </div>
            </div>
            <div className="rounded-md border bg-secondary/25 p-3">
              <div className="text-[11px] text-muted-foreground">Blocking failures</div>
              <div className="mt-1 text-xs leading-6 text-foreground">
                {dashboard.adapterBundleBreakdown.blockingFailures.length ? dashboard.adapterBundleBreakdown.blockingFailures.join("، ") : "۰"}
              </div>
            </div>
            <div className="rounded-md border bg-secondary/25 p-3">
              <div className="text-[11px] text-muted-foreground">Non-blocking missing</div>
              <div className="mt-1 text-xs leading-6 text-foreground">
                {dashboard.adapterBundleBreakdown.nonBlockingMissingInputs.length
                  ? dashboard.adapterBundleBreakdown.nonBlockingMissingInputs.slice(0, 4).join("، ")
                  : "۰"}
              </div>
            </div>
          </div>
          <div className="rounded-md border bg-secondary/25 p-3 text-xs leading-6 text-muted-foreground">
            {dashboard.adapterBundleBreakdown.summaryFa}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px] border-separate border-spacing-y-2 text-right text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="px-2 py-1 font-medium">Adapter</th>
                  <th className="px-2 py-1 font-medium">Source</th>
                  <th className="px-2 py-1 font-medium">Status</th>
                  <th className="px-2 py-1 font-medium">Required Inputs</th>
                  <th className="px-2 py-1 font-medium">Missing Inputs</th>
                  <th className="px-2 py-1 font-medium">Output Metrics</th>
                  <th className="px-2 py-1 font-medium">Freshness</th>
                  <th className="px-2 py-1 font-medium">Blocking</th>
                  <th className="px-2 py-1 font-medium">Error</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.adapterBundleBreakdown.rows.map((row) => (
                  <tr key={row.adapterName} className="bg-secondary/25 align-top">
                    <td className="rounded-r-md border-y border-r px-2 py-2">
                      <div className="font-medium">{row.adapterName}</div>
                      <div className="mt-1 text-[11px] text-muted-foreground">{row.class}</div>
                    </td>
                    <td className="max-w-[220px] border-y px-2 py-2 text-muted-foreground">{row.source}</td>
                    <td className="border-y px-2 py-2">
                      <Badge variant={bundleStatusVariant(row.status)}>{bundleStatusLabel(row.status)}</Badge>
                    </td>
                    <td className="max-w-[220px] border-y px-2 py-2">{row.requiredInputs.length ? row.requiredInputs.join(" | ") : "ناموجود / اختیاری"}</td>
                    <td className="max-w-[220px] border-y px-2 py-2 text-muted-foreground">{row.missingInputs.length ? row.missingInputs.join(" | ") : "موردی نیست"}</td>
                    <td className="max-w-[220px] border-y px-2 py-2 text-muted-foreground">{row.outputMetricsGenerated.length ? row.outputMetricsGenerated.join(" | ") : "۰"}</td>
                    <td className="border-y px-2 py-2">{agoFa(row.freshnessMinutes)}</td>
                    <td className="border-y px-2 py-2">{row.blocking ? "بله" : "خیر"}</td>
                    <td className="rounded-l-md border-y border-l px-2 py-2 text-muted-foreground">{row.errorMessage ?? "بدون خطا"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <SectionTitle
          icon={Waves}
          title="Liquidity Intelligence Health"
          description="وضعیت موتورهای Stablecoin، ETF، Derivatives، Macro Calendar و Sentiment در Fusion Engine."
        />
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {dashboard.liquidityIntelligenceHealth.map((engine) => (
            <div key={engine.engineId} className="rounded-md border bg-secondary/25 p-3 text-xs">
              <div className="mb-3 flex items-start justify-between gap-2">
                <div className="font-medium">{engine.engineName}</div>
                <Badge variant={statusVariant(engine.status)}>{statusLabel(engine.status)}</Badge>
              </div>
              <div className="space-y-2 leading-5">
                <div className="flex justify-between gap-2"><span>Score</span><span>{valueFa(engine.score)}</span></div>
                <div className="flex justify-between gap-2"><span>Coverage</span><span className={scoreColor(engine.coverage)}>{formatNumber(engine.coverage, 0)}%</span></div>
                <div className="flex justify-between gap-2"><span>Confidence</span><span>{formatNumber(engine.confidence, 0)}%</span></div>
                <div className="flex justify-between gap-2"><span>Contribution</span><span>{engine.contribution === null ? "ناموجود" : `${engine.contribution}/100`}</span></div>
                <div className="flex justify-between gap-2"><span>Weight</span><span>{formatNumber(engine.redistributedWeight * 100, 0)}%</span></div>
                <div className="flex justify-between gap-2"><span>Sources</span><span>{engine.sourceCount}</span></div>
                <div className="flex justify-between gap-2"><span>Last Update</span><span>{timeFa(engine.lastUpdate)}</span></div>
                {engine.missingInputs.length ? (
                  <div className="rounded-sm border bg-background/30 p-2 text-[11px] text-muted-foreground">
                    Missing: {engine.missingInputs.slice(0, 6).join("، ")}
                  </div>
                ) : null}
                <div className="rounded-sm border bg-background/30 p-2 text-[11px] text-muted-foreground">{engine.explanationFa}</div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <SectionTitle
          icon={BarChart3}
          title="۲. Market Data Coverage"
          description="پوشش هر دارایی برای قیمت، حجم، ارزش بازار، Open Interest، Funding Rate، ETF Flow و Stablecoin Flow."
        />
        <CardContent className="grid gap-3 xl:grid-cols-4">
          {dashboard.marketCoverage.map((asset) => (
            <div key={asset.asset} className="rounded-md border bg-secondary/25 p-3">
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="text-lg font-medium">{asset.asset}</div>
                <Badge variant={asset.coveragePercent >= 70 ? "success" : asset.coveragePercent >= 40 ? "warning" : "danger"}>
                  Coverage {formatNumber(asset.coveragePercent, 0)}%
                </Badge>
              </div>
              <div className="space-y-2">
                {asset.metrics.map((metric) => (
                  <div key={metric.key} className="flex items-start justify-between gap-2 rounded-sm border bg-background/30 p-2">
                    <div>
                      <div className="text-xs font-medium">{metric.labelFa}</div>
                      <div className="mt-1 text-[11px] text-muted-foreground">{metric.source ?? "source unavailable"} / {agoFa(metric.freshnessMinutes)}</div>
                    </div>
                    <Badge variant={metricStatusVariant(metric.status)}>{metricStatusFa(metric.status)}</Badge>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <SectionTitle
          icon={Newspaper}
          title="۳. News Sources"
          description="RSS، News API و macro feeds با تعداد مقاله ۲۴ ساعت اخیر، آخرین fetch موفق، آخرین failure و coverage."
        />
        <CardContent className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {dashboard.newsSources.map((source) => (
            <div key={source.sourceId} className="rounded-md border bg-secondary/25 p-3 text-xs">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium">{source.sourceName}</div>
                  <div className="mt-1 text-muted-foreground">{source.sourceType} / {source.category}</div>
                </div>
                <Badge variant={source.coverageScore >= 70 ? "success" : source.coverageScore >= 35 ? "warning" : "danger"}>
                  {formatNumber(source.coverageScore, 0)}%
                </Badge>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] leading-5">
                <div>Articles 24h: {source.articles24h}</div>
                <div>Last success: {timeFa(source.lastSuccessfulFetch)}</div>
                <div>Last failed: {timeFa(source.lastFailedFetch)}</div>
                <div className="text-muted-foreground">{source.lastError ?? "بدون خطا"}</div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <SectionTitle
            icon={Activity}
            title="۴. Macro Data"
            description="DXY، US10Y، نرخ Fed، CPI، PPI و employment؛ فقط داده موجود نمایش عدد دارد."
          />
          <CardContent className="space-y-2">
            {dashboard.macroData.map((metric) => (
              <div key={metric.metric} className="grid grid-cols-[1fr_auto] gap-3 rounded-md border bg-secondary/25 p-3 text-xs">
                <div>
                  <div className="font-medium">{metric.metric}</div>
                  <div className="mt-1 text-muted-foreground">
                    {metric.source ?? "source unavailable"} / {timeFa(metric.timestamp)} / {agoFa(metric.freshnessMinutes)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span>{valueFa(metric.latestValue)}</span>
                  <Badge variant={metricStatusVariant(metric.status)}>{metricStatusFa(metric.status)}</Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <SectionTitle
            icon={Database}
            title="FRED Series Breakdown"
            description="وضعیت هر سری FRED جدا از Internal Adapter Bundle محاسبه می‌شود؛ خطای bundle به FRED نسبت داده نمی‌شود."
          />
          <CardContent className="space-y-2">
            {dashboard.fredSeriesBreakdown.map((series) => (
              <div key={series.seriesId} className="rounded-md border bg-secondary/25 p-3 text-xs">
                <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">{series.seriesId}</div>
                    <div className="mt-1 text-muted-foreground">{series.label}</div>
                  </div>
                  <Badge variant={metricStatusVariant(series.status)}>{metricStatusFa(series.status)}</Badge>
                </div>
                <div className="grid gap-2 text-[11px] leading-5 md:grid-cols-2">
                  <div>Latest value: {valueFa(series.latestValue)}</div>
                  <div>Observation date: {series.observationDate ?? "ناموجود"}</div>
                  <div>Fetch timestamp: {timeFa(series.fetchTimestamp)}</div>
                  <div className="text-muted-foreground">{series.error ?? "بدون خطای سری"}</div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <SectionTitle
            icon={Waves}
            title="۵. Stablecoin Data"
            description="USDT، USDC، dominance و جریان‌های صرافی. داده ناموجود با Missing مشخص می‌شود."
          />
          <CardContent className="space-y-2">
            {dashboard.stablecoinData.map((metric) => (
              <div key={metric.metric} className="grid grid-cols-[1fr_auto] gap-3 rounded-md border bg-secondary/25 p-3 text-xs">
                <div>
                  <div className="font-medium">{metric.metric}</div>
                  <div className="mt-1 text-muted-foreground">
                    {metric.source ?? "source unavailable"} / {agoFa(metric.freshnessMinutes)}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span>{valueFa(metric.latestValue)}</span>
                  <Badge variant={metricStatusVariant(metric.status)}>{metricStatusFa(metric.status)}</Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <SectionTitle
          icon={Database}
          title="ETF Intelligence"
          description="وضعیت Farside به‌عنوان منبع اصلی ETF و fallback عمومی The Block؛ اگر Farside با Cloudflare مسدود شود، وضعیت Degraded نمایش داده می‌شود نه fake Connected."
        />
        <CardContent className="grid gap-3 md:grid-cols-2">
          {dashboard.etfIntelligence.map((row) => (
            <div key={row.asset} className="rounded-md border bg-secondary/25 p-3 text-xs">
              <div className="mb-3 flex items-start justify-between gap-2">
                <div>
                  <div className="text-lg font-medium">{row.asset} ETF</div>
                  <div className="mt-1 text-muted-foreground">{row.sourceName}</div>
                </div>
                <Badge variant={statusVariant(row.status)}>{statusLabel(row.status)}</Badge>
              </div>
              <div className="grid gap-2 text-[11px] leading-5 md:grid-cols-2">
                <div>Last fetch: {timeFa(row.lastSuccessfulFetch)}</div>
                <div>Parsed rows: {formatNumber(row.parsedRowsCount, 0)}</div>
                <div>Latest ETF date: {row.latestEtfDate ?? "ناموجود"}</div>
                <div>Freshness: {row.freshnessStatus}</div>
                <div>Latest total: {row.latestTotalFlowUsdMillion === null ? "ناموجود" : `$${formatNumber(row.latestTotalFlowUsdMillion, 1)}M`}</div>
                <div>Age: {agoFa(row.freshnessMinutes)}</div>
              </div>
              <div className="mt-3 rounded-sm border bg-background/30 p-2 text-[11px] text-muted-foreground">
                {row.sourceUrl ?? "source URL unavailable"}
              </div>
              {row.error ? <div className="mt-2 rounded-sm border border-amber-400/30 bg-amber-500/10 p-2 text-[11px] text-amber-100">{row.error}</div> : null}
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <SectionTitle
          icon={Layers3}
          title="۶. Engine Health"
          description="سلامت موتورهای Liquidity، Correlation، Regime و Sentiment با coverage ورودی، confidence و score."
        />
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {dashboard.engineHealth.map((engine) => (
            <div key={engine.engineName} className="rounded-md border bg-secondary/25 p-3 text-xs">
              <div className="mb-3 flex items-start justify-between gap-2">
                <div className="font-medium">{engine.engineName}</div>
                <Badge variant={statusVariant(engine.status)}>{statusLabel(engine.status)}</Badge>
              </div>
              <div className="space-y-2 leading-5">
                <div className="flex justify-between gap-2"><span>Last Run</span><span>{timeFa(engine.lastRun)}</span></div>
                <div className="flex justify-between gap-2"><span>Input Coverage</span><span className={scoreColor(engine.inputCoveragePercent)}>{formatNumber(engine.inputCoveragePercent, 0)}%</span></div>
                <div className="flex justify-between gap-2"><span>Confidence</span><span>{engine.confidenceQuality}</span></div>
                <div className="flex justify-between gap-2"><span>Engine Score</span><span>{valueFa(engine.engineScore)}</span></div>
                {engine.missingInputs.length ? (
                  <div className="rounded-sm border bg-background/30 p-2 text-[11px] text-muted-foreground">
                    Missing: {engine.missingInputs.slice(0, 6).join("، ")}
                  </div>
                ) : null}
                {engine.warningFa ? <div className="rounded-sm border border-amber-400/30 bg-amber-500/10 p-2 text-[11px] text-amber-100">{engine.warningFa}</div> : null}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <SectionTitle
          icon={BarChart3}
          title="Correlation Engine Detail"
          description="همبستگی‌ها از بازده لگاریتمی سری‌های تاریخی واقعی محاسبه می‌شوند؛ نمونه ناکافی به‌صورت null نمایش داده می‌شود، نه صفر."
        />
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[1040px] border-separate border-spacing-y-2 text-right text-xs">
            <thead className="text-muted-foreground">
              <tr>
                <th className="px-2 py-1 font-medium">Pair</th>
                <th className="px-2 py-1 font-medium">24h</th>
                <th className="px-2 py-1 font-medium">7d</th>
                <th className="px-2 py-1 font-medium">30d</th>
                <th className="px-2 py-1 font-medium">90d</th>
                <th className="px-2 py-1 font-medium">Stability</th>
                <th className="px-2 py-1 font-medium">Strength</th>
                <th className="px-2 py-1 font-medium">Lead/Lag</th>
                <th className="px-2 py-1 font-medium">Observations</th>
                <th className="px-2 py-1 font-medium">Source</th>
                <th className="px-2 py-1 font-medium">Status</th>
                <th className="px-2 py-1 font-medium">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {dashboard.correlationTable.map((row) => (
                <tr key={row.pair} className="bg-secondary/25 align-top">
                  <td className="rounded-r-md border-y border-r px-2 py-2 font-medium">{row.pair}</td>
                  <td className="border-y px-2 py-2">{valueFa(row.correlation24h)}</td>
                  <td className="border-y px-2 py-2">{valueFa(row.correlation7d)}</td>
                  <td className="border-y px-2 py-2">{valueFa(row.correlation30d)}</td>
                  <td className="border-y px-2 py-2">{valueFa(row.correlation90d)}</td>
                  <td className="border-y px-2 py-2">{row.stabilityScore === null ? "ناموجود" : `${formatNumber(row.stabilityScore, 0)}%`}</td>
                  <td className="border-y px-2 py-2">{row.statisticalStrength === "strong" ? "Strong" : row.statisticalStrength === "moderate" ? "Moderate" : row.statisticalStrength === "weak" ? "Weak" : "Insufficient"}</td>
                  <td className="border-y px-2 py-2">
                    {row.leadLag.leader === "insufficient" ? "نمونه ناکافی" : `${row.leadLag.leader} / ${row.leadLag.lag ?? "-"}`}
                  </td>
                  <td className="border-y px-2 py-2">
                    24h: {row.observations24h} / 7d: {row.observations7d} / 30d: {row.observations30d} / 90d: {row.observations90d}
                  </td>
                  <td className="max-w-[300px] border-y px-2 py-2 text-muted-foreground">{row.source}</td>
                  <td className="border-y px-2 py-2">
                    <Badge variant={row.status === "available" ? "success" : row.status === "insufficient_data" ? "warning" : "danger"}>
                      {row.status}
                    </Badge>
                  </td>
                  <td className="rounded-l-md border-y border-l px-2 py-2">
                    {row.confidence === null ? "ناموجود" : `${formatNumber(row.confidence, 0)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <SectionTitle
          icon={ShieldAlert}
          title="۷. Alert Quality Audit"
          description="برای هر alert منابع استفاده‌شده، تعداد indicator، confidence، ورودی‌های missing و ریسک هشدار بررسی می‌شود."
        />
        <CardContent className="space-y-2">
          {dashboard.alertAudit.length ? dashboard.alertAudit.map((alert) => (
            <div key={alert.alertId} className="rounded-md border bg-secondary/25 p-3 text-xs">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-medium">{alert.alertName}</div>
                  <div className="mt-1 text-muted-foreground">{alert.explanationFa}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant={alert.flagged ? "danger" : "success"}>{alert.indicatorCount} indicators</Badge>
                  <Badge variant="outline">confidence {alert.confidence === null ? "ناموجود" : `${formatNumber(alert.confidence, 0)}%`}</Badge>
                  <Badge variant="outline">coverage {alert.dataCoveragePercent === null ? "ناموجود" : `${formatNumber(alert.dataCoveragePercent, 0)}%`}</Badge>
                  <Badge variant={alert.alertQualityScore !== null && alert.alertQualityScore >= 65 ? "success" : alert.alertQualityScore !== null && alert.alertQualityScore >= 45 ? "warning" : "danger"}>
                    quality {alert.alertQualityScore === null ? "ناموجود" : `${formatNumber(alert.alertQualityScore, 0)}/100`}
                  </Badge>
                  <Badge variant="warning">{alert.riskLevel}</Badge>
                </div>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                <div className="rounded-sm border bg-background/30 p-2">
                  <div className="mb-1 text-[11px] text-muted-foreground">Data Sources Used</div>
                  <div className="leading-6">{alert.dataSourcesUsed.length ? alert.dataSourcesUsed.slice(0, 8).join(" | ") : "ناموجود"}</div>
                </div>
                <div className="rounded-sm border bg-background/30 p-2">
                  <div className="mb-1 text-[11px] text-muted-foreground">Missing Inputs</div>
                  <div className="leading-6">{alert.missingInputs.length ? alert.missingInputs.join(" | ") : "موردی ثبت نشده"}</div>
                </div>
                <div className="rounded-sm border bg-background/30 p-2">
                  <div className="mb-1 text-[11px] text-muted-foreground">Supporting Signals</div>
                  <div className="leading-6">{alert.supportingSignals.length ? alert.supportingSignals.join(" | ") : "ناموجود"}</div>
                </div>
                <div className="rounded-sm border bg-background/30 p-2">
                  <div className="mb-1 text-[11px] text-muted-foreground">Invalidation</div>
                  <div className="leading-6">{alert.invalidationCondition ?? "ثبت نشده"}</div>
                </div>
              </div>
            </div>
          )) : <EmptyState>هیچ alert فعالی ثبت نشده است. سیستم نباید برای پر کردن UI هشدار ساختگی تولید کند.</EmptyState>}
        </CardContent>
      </Card>

      <Card>
        <SectionTitle
          icon={FileText}
          title="۸. API Logs"
          description="آخرین ۱۰۰ درخواست/اجرای collector با source، endpoint، موفقیت یا failure، latency، timestamp و error."
        />
        <CardContent className="overflow-x-auto">
          {dashboard.apiLogs.length ? (
            <table className="w-full min-w-[920px] border-separate border-spacing-y-2 text-right text-xs">
              <thead className="text-muted-foreground">
                <tr>
                  <th className="px-2 py-1 font-medium">Source</th>
                  <th className="px-2 py-1 font-medium">Endpoint</th>
                  <th className="px-2 py-1 font-medium">Success/Fail</th>
                  <th className="px-2 py-1 font-medium">Latency</th>
                  <th className="px-2 py-1 font-medium">Timestamp</th>
                  <th className="px-2 py-1 font-medium">Error</th>
                </tr>
              </thead>
              <tbody>
                {dashboard.apiLogs.map((log, index) => (
                  <tr key={`${log.sourceName}-${log.timestamp}-${index}`} className="bg-secondary/25 align-top">
                    <td className="rounded-r-md border-y border-r px-2 py-2">{log.sourceName}</td>
                    <td className="max-w-[360px] border-y px-2 py-2 text-muted-foreground">{log.endpoint ?? "endpoint unavailable"}</td>
                    <td className="border-y px-2 py-2">
                      <Badge variant={apiLogVariant(log.status)}>{log.statusLabel}</Badge>
                    </td>
                    <td className="border-y px-2 py-2">{log.latencyMs === null ? "ناموجود" : `${formatNumber(log.latencyMs, 0)} ms`}</td>
                    <td className="border-y px-2 py-2">{timeFa(log.timestamp)}</td>
                    <td className="rounded-l-md border-y border-l px-2 py-2 text-muted-foreground">{log.errorMessage ?? "بدون خطا"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : <EmptyState>هیچ ingestion log ثبت نشده است. یک اجرای ingestion لازم است تا API logs پر شود.</EmptyState>}
        </CardContent>
      </Card>

      <Card>
        <SectionTitle
          icon={Gauge}
          title="۹. Data Quality Score"
          description="امتیاز کیفیت از reliability منابع، freshness، coverage و سلامت موتورهای تحلیلی ساخته می‌شود."
        />
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-7">
          {[
            ["Source Reliability", dashboard.scores.sourceReliabilityScore],
            ["Freshness", dashboard.scores.freshnessScore],
            ["Coverage", dashboard.scores.coverageScore],
            ["Analytics Quality", dashboard.scores.analyticsQualityScore],
            ["Operational Reliability", dashboard.scores.operationalReliabilityScore],
            ["Engine Reliability", dashboard.scores.engineReliabilityScore],
            ["Overall Platform Health", dashboard.scores.overallPlatformHealthScore],
            ["Production Readiness", dashboard.scores.productionReadinessScore],
          ].map(([label, score]) => (
            <div key={label as string} className="rounded-md border bg-secondary/25 p-3">
              <div className="text-[11px] text-muted-foreground">{label}</div>
              <div className={`mt-1 text-xl font-medium ${scoreColor(score as number)}`}>{formatNumber(score as number, 0)}/100</div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <SectionTitle
          icon={AlertTriangle}
          title="Failure & Stale Coverage"
          description="منابع failed، stale، missing API key، dead letter و write failure پنهان نمی‌شوند."
        />
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-md border bg-secondary/25 p-3 text-xs">
            <div className="mb-2 flex items-center gap-2"><CircleSlash className="h-4 w-4 text-red-300" /> Failed Sources</div>
            {dashboard.failures.failedSources.length ? dashboard.failures.failedSources.slice(0, 8).map((source) => (
              <div key={source.sourceId} className="border-t py-2">{source.sourceName}</div>
            )) : <div className="text-muted-foreground">موردی ثبت نشده</div>}
          </div>
          <div className="rounded-md border bg-secondary/25 p-3 text-xs">
            <div className="mb-2 flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-300" /> Stale Sources</div>
            {dashboard.failures.staleSources.length ? dashboard.failures.staleSources.slice(0, 8).map((source) => (
              <div key={source.sourceId} className="border-t py-2">{source.sourceName} / {agoFa(source.freshnessMinutes)}</div>
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
              <div key={`${failure.table}-${failure.attemptedAt}`} className="border-t py-2">{failure.table}: {failure.error ?? "failed"}</div>
            )) : <div className="text-muted-foreground">موردی ثبت نشده</div>}
          </div>
        </CardContent>
      </Card>

      <Card>
        <SectionTitle
          icon={Bug}
          title="۱۰. Debug Mode"
          description="این بخش فقط برای admin است؛ با toggle بالا raw API response، mapping، pipeline و final engine input نمایش داده می‌شود."
        />
        <CardContent>
          {debug ? (
            <div className="space-y-3">
              <div className="rounded-md border bg-background/40 p-3">
                <div className="mb-2 text-xs font-medium">Transformation Pipeline</div>
                <div className="flex flex-wrap gap-2 text-xs">
                  {dashboard.debug.transformationPipeline.map((step) => <Badge key={step} variant="outline">{step}</Badge>)}
                </div>
              </div>
              <pre dir="ltr" className="max-h-[520px] overflow-auto rounded-md border bg-black/35 p-4 text-left text-[11px] leading-5 text-slate-100">
                {JSON.stringify(dashboard.debug, null, 2)}
              </pre>
            </div>
          ) : (
            <EmptyState>
              Raw data پنهان است. برای بررسی payload خام، mapped fields و final engine input گزینه Show Raw Data را فعال کنید.
            </EmptyState>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
