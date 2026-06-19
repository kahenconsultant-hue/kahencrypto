import type { ReactNode } from "react";
import { Activity, AlertOctagon, BarChart3, CheckCircle2, GitBranch, Gauge, ShieldAlert, Target, Waves, Zap } from "lucide-react";
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

const reportCardClass =
  "rounded-[18px] border border-[#26334a] bg-[#131c2a]/90 shadow-[0_14px_30px_-22px_rgba(0,0,0,0.9)]";
const nestedPanelClass = "rounded-[14px] border border-[#26334a] bg-[#0f1724]/85 p-3";
const goldTextClass = "text-[#f5c842]";
const mutedTextClass = "text-[#9aa8bd]";

const assetIconMap: Record<string, { icon: string; tone: string }> = {
  USDT: { icon: "₮", tone: "border-emerald-400/45 bg-emerald-400/12 text-emerald-200" },
  BTC: { icon: "₿", tone: "border-amber-400/45 bg-amber-400/12 text-amber-200" },
  TRX: { icon: "T", tone: "border-red-400/45 bg-red-400/12 text-red-200" },
  ETH: { icon: "Ξ", tone: "border-sky-400/45 bg-sky-400/12 text-sky-200" },
  TON: { icon: "◈", tone: "border-cyan-400/45 bg-cyan-400/12 text-cyan-200" },
  SOL: { icon: "S", tone: "border-violet-400/45 bg-violet-400/12 text-violet-200" },
  XRP: { icon: "X", tone: "border-slate-300/45 bg-slate-300/12 text-slate-100" },
  DOGE: { icon: "Ð", tone: "border-yellow-400/45 bg-yellow-400/12 text-yellow-200" },
  BNB: { icon: "◆", tone: "border-orange-400/45 bg-orange-400/12 text-orange-200" },
  ADA: { icon: "A", tone: "border-blue-400/45 bg-blue-400/12 text-blue-200" },
};

function assetIcon(symbol: string) {
  const item = assetIconMap[symbol] ?? { icon: symbol.slice(0, 1), tone: "border-[#344560] bg-[#111a28] text-[#eef3fc]" };
  return (
    <span className={cn("inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-black", item.tone)}>
      {item.icon}
    </span>
  );
}

function SectionTitle({
  icon,
  title,
  subtitle,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mb-3 flex items-start gap-3 border-r-4 border-[#f5c842] pr-3">
      <div className="mt-1 text-[#f5c842]">{icon}</div>
      <div>
        <h2 className="text-base font-black text-[#eef3fc] md:text-lg">{title}</h2>
        {subtitle ? <p className={cn("mt-1 text-[12px] leading-6", mutedTextClass)}>{subtitle}</p> : null}
      </div>
    </div>
  );
}

function MetricTile({
  label,
  value,
  detail,
  tone = "neutral",
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: "good" | "warn" | "bad" | "neutral";
}) {
  const color =
    tone === "good"
      ? "text-emerald-300"
      : tone === "bad"
        ? "text-red-300"
        : tone === "warn"
          ? "text-[#f5c842]"
          : "text-[#eef3fc]";
  return (
    <div className={nestedPanelClass}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-[#8f9bb0]">{label}</div>
      <div className={cn("mt-2 text-xl font-black tabular-nums md:text-2xl", color)}>{value}</div>
      {detail ? <div className={cn("mt-1 text-[11px] leading-5", mutedTextClass)}>{detail}</div> : null}
    </div>
  );
}

function MarketVerdict({ brief }: { brief: PublicMarketBriefData }) {
  return (
    <Card className={cn("overflow-hidden", reportCardClass)}>
      <CardHeader className="items-start">
        <div>
          <CardTitle className="flex items-center gap-2 text-base text-[#eef3fc]">
            <Target className="h-5 w-5 text-[#f5c842]" aria-hidden />
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
          <div key={label} className={nestedPanelClass}>
            <div className="text-[11px] font-bold text-[#8f9bb0]">{label}</div>
            <div className="mt-2 text-sm font-black leading-6 text-[#eef3fc]">{value}</div>
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

function OperationalDashboard({ brief }: { brief: PublicMarketBriefData }) {
  const operation = brief.operationalDashboard;
  const liquidityScore = operation.liquidity.score;
  const riskScore = operation.regime.riskScore;
  return (
    <section className="grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
      <Card className={reportCardClass}>
        <CardHeader>
          <SectionTitle
            icon={<Gauge className="h-5 w-5" aria-hidden />}
            title="داشبورد سریع بازار"
            subtitle="نمای فشرده از رژیم بازار، نقدینگی، ریسک و اعتماد تحلیلی؛ جزئیات خام در بخش بررسی فنی باقی می‌ماند."
          />
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <MetricTile
            label="رژیم بازار"
            value={operation.regime.labelFa}
            detail={`احتمال تغییر: ${operation.regime.transitionProbability === null ? "در حال جمع‌آوری" : percent(operation.regime.transitionProbability)}`}
            tone="warn"
          />
          <MetricTile
            label="نقدینگی"
            value={liquidityScore === null ? "ناموجود" : `${formatNumber(liquidityScore, 0)}/100`}
            detail={operation.liquidity.labelFa}
            tone={liquidityScore === null ? "neutral" : liquidityScore <= 40 ? "bad" : liquidityScore <= 60 ? "warn" : "good"}
          />
          <MetricTile
            label="ریسک"
            value={riskScore === null ? "نامعلوم" : `${formatNumber(riskScore, 0)}/100`}
            detail={brief.marketVerdict.riskLevelFa}
            tone={riskScore === null ? "neutral" : riskScore >= 65 ? "bad" : riskScore >= 45 ? "warn" : "good"}
          />
          <MetricTile
            label="اعتماد تحلیل"
            value={percent(brief.globalConfidence)}
            detail={`پوشش داده: ${percent(brief.globalCoverage)}`}
            tone={brief.globalConfidence >= 70 ? "good" : brief.globalConfidence >= 45 ? "warn" : "bad"}
          />
        </CardContent>
      </Card>

      <Card className={reportCardClass}>
        <CardHeader>
          <SectionTitle
            icon={<Activity className="h-5 w-5" aria-hidden />}
            title="احتمال‌های رژیم"
            subtitle="احتمال‌ها قطعی نیستند؛ فقط وزن نسبی سناریوهای فعلی را نشان می‌دهند."
          />
        </CardHeader>
        <CardContent className="space-y-3">
          {operation.regime.probabilities.length ? (
            operation.regime.probabilities.map((item) => (
              <div key={item.labelFa} className="space-y-1.5">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="font-bold text-[#eef3fc]">{item.labelFa}</span>
                  <span className="tabular-nums text-[#f5c842]">{item.probability === null ? "ناموجود" : percent(item.probability)}</span>
                </div>
                <Progress value={item.probability ?? 0} className="h-2 bg-[#263044]" indicatorClassName="bg-[#f5c842]" />
              </div>
            ))
          ) : (
            <div className="text-sm text-[#aab6ca]">توزیع احتمالات رژیم هنوز برای نمایش عمومی کافی نیست.</div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function MainAlertsDashboard({ brief }: { brief: PublicMarketBriefData }) {
  const alerts = brief.operationalDashboard.mainAlerts;
  return (
    <Card className={reportCardClass}>
      <CardHeader>
        <SectionTitle
          icon={<AlertOctagon className="h-5 w-5" aria-hidden />}
          title="هشدارهای اصلی"
          subtitle="فقط هشدارهای فعال و قابل توضیح نمایش داده می‌شوند؛ این بخش توصیه معامله نیست."
        />
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {alerts.length ? (
          alerts.map((alert) => (
            <div key={alert.id} className={nestedPanelClass}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <Badge variant={alert.levelFa === "بحرانی" ? "danger" : alert.levelFa === "مهم" ? "warning" : "outline"}>{alert.levelFa}</Badge>
                <span className="text-[11px] tabular-nums text-[#8f9bb0]">{alert.confidence === null ? "اعتماد ناموجود" : percent(alert.confidence)}</span>
              </div>
              <div className="text-sm font-black leading-6 text-[#eef3fc]">{alert.titleFa}</div>
              <p className="mt-2 line-clamp-4 text-xs leading-6 text-[#aab6ca]">{alert.whyFa}</p>
              <div className="mt-3 flex flex-wrap gap-1">
                {alert.affectedAssets.map((asset) => (
                  <span key={`${alert.id}-${asset}`} className="rounded-md border border-[#33415c] px-2 py-1 text-[10px] text-[#cfd8ea]">
                    {asset}
                  </span>
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-[16px] border border-[#2f3d58] bg-[#101722]/75 p-4 text-sm text-[#aab6ca] md:col-span-2 xl:col-span-4">
            هشدار اصلی فعالی با کیفیت کافی برای نمایش عمومی وجود ندارد.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function LiquidityDashboard({ brief }: { brief: PublicMarketBriefData }) {
  const liquidity = brief.operationalDashboard.liquidity;
  return (
    <Card className={reportCardClass}>
      <CardHeader>
        <SectionTitle
          icon={<Waves className="h-5 w-5" aria-hidden />}
          title="داشبورد نقدینگی"
          subtitle="ترکیب استیبل‌کوین، ETF، مشتقات، تقویم کلان و سنتیمنت؛ هر لایه با پوشش و اعتماد خودش نمایش داده می‌شود."
        />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-[180px_1fr]">
          <div className={nestedPanelClass}>
            <div className="text-[11px] text-[#8f9bb0]">امتیاز نقدینگی</div>
            <div className={cn("mt-2 text-3xl font-black tabular-nums md:text-4xl", scoreTone(liquidity.score))}>
              {liquidity.score === null ? "ناموجود" : `${formatNumber(liquidity.score, 0)}`}
            </div>
            <div className="mt-1 text-xs text-[#aab6ca]">{liquidity.labelFa}</div>
          </div>
          <div className={nestedPanelClass}>
            <div className="text-sm font-bold text-[#eef3fc]">معنی وضعیت نقدینگی</div>
            <p className="mt-2 text-sm leading-7 text-[#cfd8ea]">{liquidity.explanationFa}</p>
            <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
              <Badge variant="outline">پوشش: {liquidity.coverage === null ? "در حال جمع‌آوری" : percent(liquidity.coverage)}</Badge>
              <Badge variant="outline">اعتماد: {liquidity.confidence === null ? "در حال جمع‌آوری" : percent(liquidity.confidence)}</Badge>
            </div>
          </div>
        </div>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
          {liquidity.engines.map((engine) => (
            <div key={engine.id} className={nestedPanelClass}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-black text-[#eef3fc]">{engine.labelFa}</span>
                <Badge variant={engine.statusFa === "فعال" ? "success" : engine.statusFa === "فعال با محدودیت" ? "warning" : "muted"}>
                  {engine.statusFa}
                </Badge>
              </div>
              <div className="mt-2 text-xl font-black tabular-nums text-[#f5c842]">{engine.score === null ? "ناموجود" : `${formatNumber(engine.score, 0)}/100`}</div>
              <div className="mt-2 space-y-1 text-[11px] leading-5 text-[#aab6ca]">
                <div>پوشش داده: {engine.coverage === null ? "ناموجود" : percent(engine.coverage)}</div>
                <div>اعتماد لایه: {engine.confidence === null ? "ناموجود" : percent(engine.confidence)}</div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ActiveEdgesDashboard({ brief }: { brief: PublicMarketBriefData }) {
  const edges = brief.operationalDashboard.activeEdges;
  return (
    <Card className={reportCardClass}>
      <CardHeader>
        <SectionTitle
          icon={<GitBranch className="h-5 w-5" aria-hidden />}
          title="مسیرهای فعال بازار"
          subtitle="ترجمه فارسی edgeهای فعال؛ هر رابطه احتمالی است و علت قطعی محسوب نمی‌شود."
        />
      </CardHeader>
      <CardContent className="space-y-3">
        {edges.length ? (
          edges.map((edge) => (
            <div key={edge.id} className={nestedPanelClass}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-black text-[#eef3fc]">
                  {edge.sourceFa} <span className={goldTextClass}>←</span> {edge.targetFa}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="outline">{edge.channelFa}</Badge>
                  <Badge variant={edge.relationshipFa.includes("فشار") ? "warning" : "success"}>{edge.relationshipFa}</Badge>
                  <Badge variant="muted">{edge.strengthFa}</Badge>
                </div>
              </div>
              <p className="mt-2 line-clamp-3 text-xs leading-6 text-[#aab6ca]">{edge.explanationFa}</p>
              <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                <span className="rounded-md bg-[#0b1018] px-2 py-1 text-[#cfd8ea]">احتمال: {edge.probability === null ? "ناموجود" : percent(edge.probability)}</span>
                <span className="rounded-md bg-[#0b1018] px-2 py-1 text-[#cfd8ea]">اعتماد: {edge.confidence === null ? "ناموجود" : percent(edge.confidence)}</span>
              </div>
            </div>
          ))
        ) : (
          <div className="text-sm text-[#aab6ca]">در این بروزرسانی مسیر فعالی با کیفیت کافی برای نمایش عمومی وجود ندارد.</div>
        )}
      </CardContent>
    </Card>
  );
}

function AnalysisEngineScores({ brief }: { brief: PublicMarketBriefData }) {
  const engines = brief.operationalDashboard.analysisEngines;
  return (
    <Card className={reportCardClass}>
      <CardHeader>
        <SectionTitle
          icon={<Zap className="h-5 w-5" aria-hidden />}
          title="امتیاز موتورهای تحلیل"
          subtitle="امتیازها کیفیت وضعیت فعلی موتور را نشان می‌دهند، نه قطعیت جهت قیمت."
        />
      </CardHeader>
      <CardContent className="grid gap-2 md:grid-cols-3 xl:grid-cols-6">
        {engines.map((engine) => (
          <div key={engine.id} className={nestedPanelClass}>
            <div className="min-h-10 text-xs font-black leading-5 text-[#eef3fc]">{engine.labelFa}</div>
            <div className={cn("mt-2 text-xl font-black tabular-nums", scoreTone(engine.score))}>{engine.score === null ? "ناموجود" : `${formatNumber(engine.score, 0)}`}</div>
            <div className="mt-2 text-[11px] leading-5 text-[#aab6ca]">
              <div>{engine.statusFa}</div>
              <div>پوشش: {engine.coverage === null ? "ناموجود" : percent(engine.coverage)}</div>
              <div>اعتماد: {engine.confidence === null ? "ناموجود" : percent(engine.confidence)}</div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function AssetOverviewTable({ assets }: { assets: PublicAssetBrief[] }) {
  const assetPairs = Array.from({ length: Math.ceil(assets.length / 2) }, (_, index) => assets.slice(index * 2, index * 2 + 2));
  return (
    <Card className={reportCardClass}>
      <CardHeader>
        <div>
          <CardTitle className="text-base text-[#eef3fc] md:text-lg">جدول فشرده ۱۰ دارایی</CardTitle>
          <CardDescription className={mutedTextClass}>تمام دارایی‌های فهرست پایش ایران نمایش داده می‌شوند؛ عوامل نامرتبط از گزارش عمومی حذف شده‌اند.</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {assetPairs.map((pair, pairIndex) => (
            <div key={`asset-pair-${pairIndex}`} className="rounded-[15px] border border-[#26334a] bg-[#0f1724]/85 p-2.5">
              <div className="grid grid-cols-2 gap-2">
                {pair.map((asset) => (
                  <div key={asset.symbol} className="min-w-0 rounded-[12px] border border-[#2b3850] bg-[#111a28]/80 p-2">
                    <div className="flex items-center gap-2">
                      {assetIcon(asset.symbol)}
                      <div className="min-w-0">
                        <div className="truncate text-sm font-black text-[#eef3fc]">{asset.symbol}</div>
                        <div className="truncate text-[11px] text-[#9aa8bd]">{asset.persianName}</div>
                      </div>
                    </div>
                    <Badge className="mt-2 max-w-full justify-center truncate text-[10px]" variant={asset.confidence < 45 || asset.dataCoverage < 50 ? "warning" : "outline"}>
                      {asset.biasFa}
                    </Badge>
                    <div className="mt-2 grid gap-1 text-[11px] leading-5">
                      <div className="flex items-center justify-between gap-2">
                        <span className={mutedTextClass}>اثر</span>
                        <span className={cn("font-black tabular-nums", scoreTone(asset.impactScore))}>{asset.impactScore === null ? "ناموجود" : formatNumber(asset.impactScore, 0)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className={mutedTextClass}>اعتماد</span>
                        <span className="font-bold tabular-nums text-[#eef3fc]">{percent(asset.confidence)}</span>
                      </div>
                      <Progress value={asset.confidence} className="h-1.5 bg-[#263044]" indicatorClassName={confidenceTone(asset.confidence)} />
                      <div className="truncate text-[10px] text-[#9aa8bd]" title={asset.coverageLabelFa}>
                        {asset.coverageLabelFa}
                      </div>
                      <div className="line-clamp-2 min-h-10 text-[10px] leading-5 text-[#aab6ca]">{asset.mainDriverFa}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function AssetBriefCard({ asset }: { asset: PublicAssetBrief }) {
  return (
    <Card className={cn("flex h-full flex-col", reportCardClass)}>
      <CardHeader className="items-start">
        <div className="flex items-start gap-3">
          {assetIcon(asset.symbol)}
          <div>
            <CardTitle className="flex items-center gap-2">
              <span className="text-base text-[#eef3fc]">{asset.symbol}</span>
              <span className="text-xs text-[#8f9bb0]">{asset.persianName}</span>
            </CardTitle>
            <CardDescription>{asset.statusFa}</CardDescription>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={asset.confidence < 45 ? "warning" : "outline"}>{asset.freshnessLabelFa}</Badge>
          <Badge variant="muted">{percent(asset.confidence)}</Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        <HumanReportBlock {...asset.humanized} compact />
      </CardContent>
    </Card>
  );
}

function MainDrivers({ drivers }: { drivers: PublicDriver[] }) {
  return (
    <Card className={reportCardClass}>
      <CardHeader>
        <SectionTitle
          icon={<Target className="h-5 w-5" aria-hidden />}
          title="محرک‌های غالب"
          subtitle="فقط محرک‌های قابل استفاده در گزارش عمومی نمایش داده می‌شوند. مسیرهای علی کامل و تشخیص‌های خام در بخش بررسی فنی هستند."
        />
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {drivers.slice(0, 5).map((driver) => (
          <div key={driver.titleFa} className={nestedPanelClass}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-black text-[#eef3fc]">{driver.titleFa}</h3>
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
      <Card className={reportCardClass}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-[#eef3fc]">
            <ShieldAlert className="h-4 w-4 text-[#f5c842]" aria-hidden />
            شروط بازنگری
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3 text-sm leading-7 text-muted-foreground">
            {brief.invalidation.conditionsFa.map((condition, index) => (
              <li key={condition}>
                <span className="font-black text-[#f5c842]">{formatNumber(index + 1, 0)}. </span>
                {condition}
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
      <Card className={reportCardClass}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-[#eef3fc]">
            <CheckCircle2 className="h-4 w-4 text-[#f5c842]" aria-hidden />
            برای رصد بعدی
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3 text-sm leading-7 text-muted-foreground">
            {brief.invalidation.watchNextFa.map((item, index) => (
              <li key={item}>
                <span className="font-black text-[#f5c842]">{formatNumber(index + 1, 0)}. </span>
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
    <Card className={reportCardClass}>
      <CardHeader>
        <SectionTitle
          icon={<CheckCircle2 className="h-5 w-5" aria-hidden />}
          title="اعتماد داده به‌صورت فشرده"
          subtitle="سلامت منابع، اعتبارسنجی، همبستگی و گزارش‌های خام در بخش بررسی فنی/Admin نگه داشته شده‌اند."
        />
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[680px] border-collapse text-sm">
          <thead className="text-xs text-[#8f9bb0]">
            <tr className="border-b border-[#2f3d58]">
              <th className="px-3 py-2 text-right">لایه</th>
              <th className="px-3 py-2 text-right">وضعیت عمومی</th>
              <th className="px-3 py-2 text-right">پوشش</th>
              <th className="px-3 py-2 text-right">نحوه نمایش عمومی</th>
            </tr>
          </thead>
          <tbody>
            {brief.compactDataConfidence.map((layer) => (
              <tr key={layer.layer} className="border-b border-[#2f3d58] last:border-b-0">
                <td className="px-3 py-3 font-bold text-[#eef3fc]">{layer.layerFa}</td>
                <td className="px-3 py-3 text-[#aab6ca]">{layer.statusFa}</td>
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
    <div
      className="mx-auto max-w-[1400px] space-y-5 rounded-[32px] border border-[#2a3448] bg-[radial-gradient(circle_at_20%_30%,#1a2332,#0f141e)] p-4 text-[#eef3fc] shadow-[0_30px_60px_-12px_rgba(0,0,0,0.8)] md:p-6"
      dir="rtl"
      style={{ fontFamily: "'Segoe UI', Roboto, system-ui, sans-serif" }}
    >
      <section className="rounded-[22px] border border-[#2f3d58] bg-[#111827]/65 p-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge variant="success">C.M.I.P Market Brief</Badge>
              <Badge variant="outline">{brief.dataModeFa}</Badge>
              <Badge variant="warning">بدون سیگنال معامله</Badge>
            </div>
            <h1 className="text-2xl font-black text-[#eef3fc] md:text-3xl">گزارش فشرده وضعیت بازار کریپتو</h1>
            <p className="mt-2 max-w-3xl text-sm leading-7 text-[#aab6ca]">
              {brief.targetUniverseLabelFa} · {brief.updateFrequencyLabel}
            </p>
          </div>
          <div className="grid min-w-72 grid-cols-2 gap-2 text-xs">
            <div className={nestedPanelClass}>
              <div className="text-[#8f9bb0]">تولید گزارش</div>
              <div className="mt-1 font-bold text-[#eef3fc]">{new Date(brief.generatedAt).toLocaleString("fa-IR")}</div>
            </div>
            <div className={nestedPanelClass}>
              <div className="text-[#8f9bb0]">کیفیت گزارش</div>
              <div className="mt-1 space-y-1 font-bold text-[#eef3fc]">
                <div>پوشش داده: {percent(brief.globalCoverage)}</div>
                <div>اطمینان تحلیلی: {percent(brief.marketVerdict.globalConfidence)}</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <MarketVerdict brief={brief} />
      <OperationalDashboard brief={brief} />
      <MainAlertsDashboard brief={brief} />
      <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <LiquidityDashboard brief={brief} />
        <ActiveEdgesDashboard brief={brief} />
      </section>
      <AnalysisEngineScores brief={brief} />
      <AssetOverviewTable assets={brief.assets} />
      <section className="grid gap-3 lg:grid-cols-2">
        {brief.assets.map((asset) => (
          <AssetBriefCard key={asset.symbol} asset={asset} />
        ))}
      </section>
      <MainDrivers drivers={brief.mainDrivers} />
      <InvalidationWatch brief={brief} />
      <CompactDataConfidence brief={brief} />
      <footer className="rounded-[18px] border border-[#2f3d58] bg-[#111827]/65 p-4 text-center text-xs leading-6 text-[#aab6ca]">
        <BarChart3 className="mx-auto mb-2 h-5 w-5 text-[#f5c842]" aria-hidden />
        {brief.disclaimerFa}
      </footer>
    </div>
  );
}
