import { AlertTriangle, Bot, CheckCircle2, Database, FileWarning, Settings2, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataSourceBadge } from "@/components/ui/data-source-badge";
import { Metric } from "@/components/ui/metric";
import { moduleDataSourceStatus } from "@/lib/data-source-status";
import { getIngestionPipelineStatus } from "@/server/ingestion/pipeline";

export function AdminConsole() {
  const ingestion = getIngestionPipelineStatus();
  const degradedSources = ingestion.sourceHealth.filter((source) => !source.ok);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-primary" aria-hidden />
              پنل کنترل ادمین
            </CardTitle>
            <CardDescription>مدیریت منابع، جمع‌آوری داده، لاگ‌های هوش مصنوعی، jobهای ناموفق، بازبینی هشدار، مدیریت تکراری‌ها، اصلاح رژیم و تست پرامپت.</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <DataSourceBadge status={moduleDataSourceStatus.adminConsole} />
            <Badge variant="warning">نیازمند RBAC</Badge>
            <Link className="rounded-sm border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground" href="/admin/ingestion">
              debug ingestion
            </Link>
            <Link className="rounded-sm border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground" href="/admin/ops">
              ops center
            </Link>
            <Link className="rounded-sm border px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground" href="/admin/data-health">
              data health
            </Link>
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <Metric label="دریافت‌شده" value={`${ingestion.pulled}`} tone="neutral" />
          <Metric label="در صف" value={`${ingestion.queued}`} tone="good" />
          <Metric label="پردازش‌شده" value={`${ingestion.processed}`} tone="good" />
          <Metric label="ناموفق" value={`${ingestion.failed}`} tone={ingestion.failed > 0 ? "warn" : "good"} />
          <Metric label="منبع ضعیف" value={`${degradedSources.length}`} tone={degradedSources.length > 0 ? "warn" : "good"} />
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-4 w-4 text-primary" aria-hidden />
                پایش سلامت منابع
              </CardTitle>
              <CardDescription>مانیتور latency، error rate و آخرین ingestion.</CardDescription>
            </div>
            <DataSourceBadge status={moduleDataSourceStatus.ingestionHealth} />
          </CardHeader>
          <CardContent className="space-y-2">
            {ingestion.sourceHealth.length ? ingestion.sourceHealth.slice(0, 18).map((source) => (
              <div key={source.source} className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-secondary/25 p-3 text-xs">
                <div>
                  <div className="font-bold">{source.source}</div>
                  <div className="text-muted-foreground">{source.message}</div>
                </div>
                <div className="flex items-center gap-2">
                  {source.ok ? <CheckCircle2 className="h-4 w-4 text-emerald-300" /> : <AlertTriangle className="h-4 w-4 text-amber-300" />}
                  <Badge variant={source.ok ? "success" : "warning"}>{source.ok ? "سالم" : "نیازمند بررسی"}</Badge>
                  <span>{source.latencyMs}ms</span>
                </div>
              </div>
            )) : <p className="rounded-md border bg-secondary/25 p-3 text-xs leading-6 text-muted-foreground">هنوز ingestion واقعی اجرا نشده است. مسیر cron باید raw event، raw metric و source health تولید کند.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-4 w-4 text-primary" aria-hidden />
                مسیر پردازش هوش مصنوعی
              </CardTitle>
              <CardDescription>ردیابی مرحله‌های پاک‌سازی، ترجمه، دسته‌بندی، تحلیل اثر، تشخیص رژیم بازار و تولید هشدار.</CardDescription>
            </div>
            <DataSourceBadge status={moduleDataSourceStatus.adminConsole} />
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="rounded-md border bg-secondary/25 p-3 text-xs leading-6 text-muted-foreground">
              لایه AI در فاز foundation عمداً غیرفعال است. بعد از پایدار شدن raw events، normalized events و source health، پردازش ترجمه و تفسیر فارسی به‌صورت job جداگانه اضافه می‌شود.
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <FileWarning className="h-4 w-4 text-amber-300" aria-hidden />
                صف بازبینی هشدار
              </CardTitle>
              <CardDescription>بازبینی هشدارهای مهم قبل از ارسال اعلان یا نمایش در پلن‌های حرفه‌ای.</CardDescription>
            </div>
            <DataSourceBadge status={moduleDataSourceStatus.topAlerts} />
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="rounded-md border bg-secondary/25 p-3 text-xs leading-6 text-muted-foreground">
              هشدارهای بازار در فاز foundation تولید نمی‌شوند. فقط بعد از اتصال event clusters، metric snapshots و قوانین چندعاملی، هشدار قابل بازبینی ساخته خواهد شد.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
                کنترل‌ها
              </CardTitle>
              <CardDescription>نمونه کنترل‌های مدیریتی برای production.</CardDescription>
            </div>
            <DataSourceBadge status={moduleDataSourceStatus.adminConsole} />
          </CardHeader>
          <CardContent className="space-y-3">
            {["اصلاح دستی رژیم", "تست پرامپت", "مدیریت تکراری‌ها", "تحلیل دستی", "اجرای دوباره job ناموفق", "بازبینی محدودیت نرخ API"].map((control) => (
              <div key={control} className="rounded-md border bg-secondary/25 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold">{control}</span>
                  <Badge variant="outline">ادمین</Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
