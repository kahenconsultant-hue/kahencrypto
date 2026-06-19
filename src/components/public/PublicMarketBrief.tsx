import { BarChart3, CheckCircle2, ShieldAlert, Target } from "lucide-react";
import type { PublicAssetBrief, PublicDriver, PublicMarketBrief as PublicMarketBriefData } from "@/lib/intelligence/publicBriefBuilder";
import { HumanReportBlock } from "@/components/reporting/HumanReportBlock";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn, formatNumber } from "@/lib/utils";

function percent(value: number) {
  return `${formatNumber(value, 0)}٪`;
}

function scoreTone(score: number | null) {
  if (score === null) return "text-muted-foreground";
  if (score >= 25) return "text-emerald-300";
  if (score <= -25) return "text-red-300";
  return "text-amber-200";
}

function confidenceTone(value: number) {
  if (value >= 70) return "bg-emerald-500";
  if (value >= 45) return "bg-amber-500";
  return "bg-red-500";
}

function directionVariant(direction: PublicDriver["direction"]): "success" | "warning" | "danger" | "muted" {
  if (direction === "supportive") return "success";
  if (direction === "pressure") return "danger";
  if (direction === "mixed") return "warning";
  return "muted";
}

function MarketVerdict({ brief }: { brief: PublicMarketBriefData }) {
  return (
    <Card className="overflow-hidden border-primary/25 bg-card/90">
      <CardHeader className="items-start">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Target className="h-5 w-5 text-primary" aria-hidden />
            جمع‌بندی بازار
          </CardTitle>
          <CardDescription>{brief.marketVerdict.humanized.human_summary}</CardDescription>
        </div>
        <Badge variant={brief.globalConfidence >= 45 ? "success" : "warning"}>{brief.dataModeFa}</Badge>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-4">
        <div className="md:col-span-4">
          <HumanReportBlock {...brief.marketVerdict.humanized} />
        </div>
        {[
          ["فضای بازار", brief.marketVerdict.regimeFa],
          ["وضعیت نقدینگی", brief.marketVerdict.liquidityStateFa],
          ["سطح ریسک", brief.marketVerdict.riskLevelFa],
          ["فشار کلان", brief.marketVerdict.macroPressureFa],
        ].map(([label, value]) => (
          <div key={label} className="rounded-md border bg-background/45 p-3">
            <div className="text-[11px] font-bold text-muted-foreground">{label}</div>
            <div className="mt-2 text-sm font-black leading-6 text-foreground">{value}</div>
          </div>
        ))}
        <div className="md:col-span-4">
          <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
            <span>اطمینان کل</span>
            <span>{percent(brief.marketVerdict.globalConfidence)}</span>
          </div>
          <Progress value={brief.marketVerdict.globalConfidence} indicatorClassName={confidenceTone(brief.marketVerdict.globalConfidence)} />
        </div>
      </CardContent>
    </Card>
  );
}

function AssetOverviewTable({ assets }: { assets: PublicAssetBrief[] }) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>جدول فشرده ۱۰ دارایی</CardTitle>
          <CardDescription>تمام دارایی‌های فهرست پایش ایران نمایش داده می‌شوند؛ عوامل نامرتبط از گزارش عمومی حذف شده‌اند.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="px-3 py-2 text-right">دارایی</th>
              <th className="px-3 py-2 text-right">وضعیت / برداشت</th>
              <th className="px-3 py-2 text-right">امتیاز اثر</th>
              <th className="px-3 py-2 text-right">اطمینان</th>
              <th className="px-3 py-2 text-right">پوشش داده</th>
              <th className="px-3 py-2 text-right">محرک اصلی</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((asset) => (
              <tr key={asset.symbol} className="border-b last:border-b-0">
                <td className="px-3 py-3">
                  <div className="font-black text-foreground">{asset.symbol}</div>
                  <div className="text-xs text-muted-foreground">{asset.persianName}</div>
                </td>
                <td className="px-3 py-3">
                  <Badge variant={asset.confidence < 45 || asset.dataCoverage < 50 ? "warning" : "outline"}>{asset.biasFa}</Badge>
                </td>
                <td className={cn("px-3 py-3 font-black", scoreTone(asset.impactScore))}>{asset.impactScore === null ? "بدون عدد عمومی" : formatNumber(asset.impactScore, 0)}</td>
                <td className="px-3 py-3">
                  <div className="flex min-w-24 items-center gap-2">
                    <Progress value={asset.confidence} className="w-20" indicatorClassName={confidenceTone(asset.confidence)} />
                    <span className="text-xs">{percent(asset.confidence)}</span>
                  </div>
                </td>
                <td className="px-3 py-3 text-xs text-muted-foreground">{asset.coverageLabelFa}</td>
                <td className="max-w-72 px-3 py-3 text-xs leading-6 text-muted-foreground">{asset.mainDriverFa}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function AssetBriefCard({ asset }: { asset: PublicAssetBrief }) {
  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="items-start">
        <div>
          <CardTitle className="flex items-center gap-2">
            <span className="text-base">{asset.symbol}</span>
            <span className="text-xs text-muted-foreground">{asset.persianName}</span>
          </CardTitle>
          <CardDescription>{asset.statusFa}</CardDescription>
        </div>
        <Badge variant={asset.confidence < 45 ? "warning" : "outline"}>{asset.freshnessLabelFa}</Badge>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        <HumanReportBlock {...asset.humanized} compact />
      </CardContent>
    </Card>
  );
}

function MainDrivers({ drivers }: { drivers: PublicDriver[] }) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>محرک‌های غالب</CardTitle>
          <CardDescription>فقط محرک‌های قابل استفاده در گزارش عمومی نمایش داده می‌شوند. مسیرهای علی کامل و تشخیص‌های خام در بخش بررسی فنی هستند.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {drivers.slice(0, 5).map((driver) => (
          <div key={driver.titleFa} className="rounded-md border bg-background/45 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-black text-foreground">{driver.titleFa}</h3>
              <Badge variant={directionVariant(driver.direction)}>{driver.directionFa}</Badge>
            </div>
            <HumanReportBlock {...driver.humanized} compact />
            <div className="mt-3 flex flex-wrap gap-1">
              {driver.affectedAssets.slice(0, 8).map((asset) => (
                <span key={asset} className="rounded-sm border bg-muted/35 px-2 py-1 text-[10px] text-muted-foreground">
                  {asset}
                </span>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function InvalidationWatch({ brief }: { brief: PublicMarketBriefData }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-amber-300" aria-hidden />
            شروط بازنگری
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3 text-sm leading-7 text-muted-foreground">
            {brief.invalidation.conditionsFa.map((condition, index) => (
              <li key={condition}>
                <span className="font-black text-foreground">{formatNumber(index + 1, 0)}. </span>
                {condition}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-primary" aria-hidden />
            برای رصد بعدی
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3 text-sm leading-7 text-muted-foreground">
            {brief.invalidation.watchNextFa.map((item, index) => (
              <li key={item}>
                <span className="font-black text-foreground">{formatNumber(index + 1, 0)}. </span>
                {item}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}

function CompactDataConfidence({ brief }: { brief: PublicMarketBriefData }) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>اعتماد داده به‌صورت فشرده</CardTitle>
          <CardDescription>سلامت منابع، اعتبارسنجی، همبستگی و گزارش‌های خام در بخش بررسی فنی/Admin نگه داشته شده‌اند.</CardDescription>
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[680px] border-collapse text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="px-3 py-2 text-right">لایه</th>
              <th className="px-3 py-2 text-right">وضعیت عمومی</th>
              <th className="px-3 py-2 text-right">پوشش</th>
              <th className="px-3 py-2 text-right">نحوه نمایش عمومی</th>
            </tr>
          </thead>
          <tbody>
            {brief.compactDataConfidence.map((layer) => (
              <tr key={layer.layer} className="border-b last:border-b-0">
                <td className="px-3 py-3 font-bold text-foreground">{layer.layerFa}</td>
                <td className="px-3 py-3 text-muted-foreground">{layer.statusFa}</td>
                <td className="px-3 py-3">{layer.coverage === null ? "در حال جمع‌آوری" : percent(layer.coverage)}</td>
                <td className="px-3 py-3 text-xs leading-6 text-muted-foreground">{layer.publicActionFa}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

export function PublicMarketBrief({ brief }: { brief: PublicMarketBriefData }) {
  return (
    <div className="mx-auto max-w-7xl space-y-4" dir="rtl">
      <section className="rounded-lg border bg-card/70 p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge variant="success">C.M.I.P Market Brief</Badge>
              <Badge variant="outline">{brief.dataModeFa}</Badge>
              <Badge variant="warning">بدون سیگنال معامله</Badge>
            </div>
            <h1 className="text-2xl font-black text-foreground md:text-3xl">گزارش فشرده وضعیت بازار کریپتو</h1>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">
              {brief.targetUniverseLabelFa} · {brief.updateFrequencyLabel}
            </p>
          </div>
          <div className="grid min-w-72 grid-cols-2 gap-2 text-xs">
            <div className="rounded-md border bg-background/45 p-3">
              <div className="text-muted-foreground">تولید گزارش</div>
              <div className="mt-1 font-bold text-foreground">{new Date(brief.generatedAt).toLocaleString("fa-IR")}</div>
            </div>
            <div className="rounded-md border bg-background/45 p-3">
              <div className="text-muted-foreground">کیفیت گزارش</div>
              <div className="mt-1 space-y-1 font-bold text-foreground">
                <div>پوشش داده: {percent(brief.globalCoverage)}</div>
                <div>اطمینان تحلیلی: {percent(brief.marketVerdict.globalConfidence)}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <MarketVerdict brief={brief} />
      <AssetOverviewTable assets={brief.assets} />
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {brief.assets.map((asset) => (
          <AssetBriefCard key={asset.symbol} asset={asset} />
        ))}
      </section>
      <MainDrivers drivers={brief.mainDrivers} />
      <InvalidationWatch brief={brief} />
      <CompactDataConfidence brief={brief} />
      <footer className="rounded-md border bg-card/55 p-4 text-center text-xs leading-6 text-muted-foreground">
        <BarChart3 className="mx-auto mb-2 h-5 w-5 text-primary" aria-hidden />
        {brief.disclaimerFa}
      </footer>
    </div>
  );
}
