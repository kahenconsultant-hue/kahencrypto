import type { ReactNode } from "react";
import { Activity, AlertOctagon, BarChart3, CheckCircle2, GitBranch, Gauge, ShieldAlert, Target, Waves, Zap } from "lucide-react";
import type { PublicAssetBrief, PublicDriver, PublicMarketBrief as PublicMarketBriefData } from "@/lib/intelligence/publicBriefBuilder";
import { derivativesBiasFa } from "@/lib/intelligence/derivativesLite";
import { HumanReportBlock } from "@/components/reporting/HumanReportBlock";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn, formatCompactUsd, formatNumber, formatScore } from "@/lib/utils";

function percent(value: number) {
  return `${formatNumber(value, 0)}٪`;
}

function signedPercent(value: number | null, digits = 2) {
  if (value === null) return "ناموجود";
  return `${value > 0 ? "+" : ""}${formatNumber(value, digits)}٪`;
}

function signedNumber(value: number | null, unit: string, digits = 2) {
  if (value === null) return "ناموجود";
  return `${value > 0 ? "+" : ""}${formatNumber(value, digits)} ${unit}`;
}

function priceLabel(value: number | null) {
  if (value === null) return "ناموجود";
  if (value >= 1) return `$${formatNumber(value, value >= 100 ? 0 : 2)}`;
  return `$${formatNumber(value, 4)}`;
}

function sourceTimestamp(value: string | null) {
  if (!value) return "زمان ناموجود";
  return new Date(value).toLocaleString("fa-IR", { dateStyle: "short", timeStyle: "short" });
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

function assetIcon(symbol: string, size: "sm" | "md" = "md") {
  const item = assetIconMap[symbol] ?? { icon: symbol.slice(0, 1), tone: "border-[#344560] bg-[#111a28] text-[#eef3fc]" };
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full border font-black",
        size === "sm" ? "h-4 w-4 text-[8px]" : "h-8 w-8 text-sm",
        item.tone,
      )}
    >
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
            <span>اعتماد نهایی پس از اعمال سقف داده</span>
            <span>{percent(brief.marketVerdict.globalConfidence)}</span>
          </div>
          <Progress value={brief.marketVerdict.globalConfidence} indicatorClassName={confidenceTone(brief.marketVerdict.globalConfidence)} />
          <div className="mt-3 rounded-[12px] border border-[#33415c] bg-[#0d1522] px-3 py-2 text-[11px] leading-6 text-[#aab6ca]">
            <span className="font-bold text-[#eef3fc]">دلیل سقف اعتماد: </span>
            {brief.confidenceGuard.capReasonsFa.length ? brief.confidenceGuard.capReasonsFa.join("؛ ") : "محدودیت بحرانی فعالی ثبت نشده است."}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function EvidenceSource({ name, url, timestamp, freshness }: { name: string | null; url: string | null; timestamp: string | null; freshness: string }) {
  return (
    <div className="mt-3 border-t border-[#26334a] pt-2 text-[10px] leading-5 text-[#8f9bb0]">
      <span>منبع: </span>
      {url && name ? (
        <a href={url} target="_blank" rel="noreferrer" className="font-bold text-cyan-200 underline decoration-cyan-300/30 underline-offset-2">
          {name}
        </a>
      ) : (
        <span>{name ?? "ناموجود"}</span>
      )}
      <span> · {sourceTimestamp(timestamp)} · {freshness}</span>
    </div>
  );
}

function DataEvidenceStrip({ brief }: { brief: PublicMarketBriefData }) {
  const stablecoin = brief.dataEvidence.stablecoin;
  const etfRows = [brief.dataEvidence.etf.btc, brief.dataEvidence.etf.eth];
  const macroRows = brief.dataEvidence.macro.filter((row) => row.id === "DXY" || row.id === "US10Y");
  return (
    <Card className={reportCardClass}>
      <CardHeader>
        <SectionTitle
          icon={<BarChart3 className="h-5 w-5" aria-hidden />}
          title="داده‌های عددی کلیدی"
          subtitle="هر برداشت جهت‌دار فقط وقتی فعال است که عدد، منبع و زمان داده در همین بخش قابل مشاهده باشد."
        />
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <div className={nestedPanelClass}>
          <div className="text-sm font-black text-[#eef3fc]">نقدینگی استیبل‌کوین</div>
          <div className="mt-3 space-y-1 text-[11px] leading-5 text-[#cfd8ea]">
            <div>ارزش کل: {stablecoin.totalStablecoinMarketCapUsd === null ? "ناموجود" : formatCompactUsd(stablecoin.totalStablecoinMarketCapUsd)}</div>
            <div>تغییر ۷روزه: {signedPercent(stablecoin.totalStablecoinChange7dPct)}</div>
            <div>تغییر ۳۰روزه: {signedPercent(stablecoin.totalStablecoinChange30dPct)}</div>
            <div>ارزش بازار USDT: {stablecoin.usdtMarketCapUsd === null ? "ناموجود" : formatCompactUsd(stablecoin.usdtMarketCapUsd)}</div>
          </div>
          <Badge className="mt-3 whitespace-normal text-right leading-5" variant={stablecoin.interpretation === "unavailable" ? "warning" : "outline"}>
            {stablecoin.interpretationFa}
          </Badge>
          <EvidenceSource name={stablecoin.sourceName} url={stablecoin.sourceUrl} timestamp={stablecoin.latestDataTimestamp} freshness={stablecoin.freshnessLabelFa} />
        </div>

        {etfRows.map((row) => (
          <div key={row.asset} className={nestedPanelClass}>
            <div className="text-sm font-black text-[#eef3fc]">ETF {row.asset}</div>
            <div className="mt-3 space-y-1 text-[11px] leading-5 text-[#cfd8ea]">
              <div>روزانه: {row.dailyNetFlowUsd === null ? "ناموجود" : formatCompactUsd(row.dailyNetFlowUsd)}</div>
              <div>مجموع ۷روزه: {row.sevenDayNetFlowUsd === null ? "ناموجود" : formatCompactUsd(row.sevenDayNetFlowUsd)}</div>
              <div>مجموع ۳۰روزه: {row.thirtyDayNetFlowUsd === null ? "ناموجود" : formatCompactUsd(row.thirtyDayNetFlowUsd)}</div>
              <div>تاریخ داده: {row.latestDate ?? "ناموجود"}</div>
            </div>
            <Badge className="mt-3" variant={row.interpretation === "unavailable" ? "warning" : row.interpretation === "pressure" ? "danger" : "outline"}>
              {row.interpretationFa}
            </Badge>
            <EvidenceSource name={row.sourceName} url={row.sourceUrl} timestamp={row.latestDataTimestamp} freshness={row.freshnessLabelFa} />
          </div>
        ))}

        {macroRows.map((row) => (
          <div key={row.id} className={nestedPanelClass}>
            <div className="text-sm font-black text-[#eef3fc]">{row.id}</div>
            <div className="mt-3 space-y-1 text-[11px] leading-5 text-[#cfd8ea]">
              <div>آخرین مقدار: {row.latest === null ? "ناموجود" : formatNumber(row.latest, 2)}</div>
              <div>تغییر یک‌روزه: {row.changeUnit === "basis_point" ? signedNumber(row.change1d, "واحد پایه", 1) : signedPercent(row.change1d)}</div>
              <div>تغییر ۷روزه: {row.changeUnit === "basis_point" ? signedNumber(row.change7d, "واحد پایه", 1) : signedPercent(row.change7d)}</div>
            </div>
            <EvidenceSource name={row.sourceName} url={row.sourceUrl} timestamp={row.latestDataTimestamp} freshness={row.freshnessLabelFa} />
          </div>
        ))}
      </CardContent>
      {brief.confidenceGuard.missingCriticalData.length ? (
        <div className="mx-4 mb-4 rounded-[12px] border border-amber-400/30 bg-amber-400/8 px-3 py-2 text-xs leading-6 text-amber-100 md:mx-6">
          این گزارش با محدودیت‌های «{brief.confidenceGuard.capReasonsFa.join("؛ ")}» و سقف اعتماد {percent(brief.confidenceGuard.confidenceCap)} منتشر شده است.
        </div>
      ) : null}
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
            value={liquidityScore === null ? "ناموجود" : formatScore(liquidityScore)}
            detail={operation.liquidity.labelFa}
            tone={liquidityScore === null ? "neutral" : liquidityScore <= 40 ? "bad" : liquidityScore <= 60 ? "warn" : "good"}
          />
          <MetricTile
            label="ریسک"
            value={riskScore === null ? "نامعلوم" : formatScore(riskScore)}
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
                  <span key={`${alert.id}-${asset}`} className="inline-flex items-center gap-1.5 rounded-md border border-[#33415c] px-2 py-1 text-[10px] text-[#cfd8ea]">
                    {assetIcon(asset, "sm")}
                    <span>{asset}</span>
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
    <Card className={cn(reportCardClass, "self-start")}>
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
        <div className="grid gap-3 sm:grid-cols-2 min-[900px]:grid-cols-5">
          {liquidity.engines.map((engine) => (
            <div key={engine.id} className={cn(nestedPanelClass, "min-h-[172px]")}>
              <div className="space-y-2">
                <span className="block min-h-10 text-sm font-black leading-6 text-[#eef3fc]">{engine.labelFa}</span>
                <Badge className="max-w-full whitespace-normal px-2 py-1 text-center text-[10px] leading-4" variant={engine.statusFa === "فعال" ? "success" : engine.statusFa === "فعال با محدودیت" ? "warning" : "muted"}>
                  {engine.statusFa}
                </Badge>
              </div>
              <div className="mt-3 text-2xl font-black tabular-nums text-[#f5c842]">{engine.score === null ? "ناموجود" : formatScore(engine.score)}</div>
              <div className="mt-3 space-y-2 border-t border-[#26334a] pt-3 text-[11px] leading-5 text-[#aab6ca]">
                <div className="flex items-center justify-between gap-2">
                  <span>پوشش داده</span>
                  <span className="font-bold tabular-nums text-[#cfd8ea]">{engine.coverage === null ? "ناموجود" : percent(engine.coverage)}</span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span>اعتماد لایه</span>
                  <span className="font-bold tabular-nums text-[#cfd8ea]">{engine.confidence === null ? "ناموجود" : percent(engine.confidence)}</span>
                </div>
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
    <Card className={cn(reportCardClass, "self-start")}>
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
      <CardContent className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
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

function DerivativesLiteEvidence({ brief }: { brief: PublicMarketBriefData }) {
  const summary = brief.derivativesLite;
  const visibleAssets = summary.assets.filter((asset) => asset.derivativesAvailable);
  const riskLabel =
    summary.marketLeverageRiskScore === null
      ? "داده کافی برای جمع‌بندی بازار موجود نیست"
      : summary.marketLeverageRiskScore >= 70
        ? "اهرم بازار بالاست و شکنندگی حرکت افزایش یافته است"
        : summary.marketLeverageRiskScore >= 45
          ? "اهرم بازار در سطح متوسط قرار دارد"
          : "اهرم بازار فعلاً محدود یا در حال تخلیه است";
  return (
    <Card className={reportCardClass}>
      <CardHeader>
        <SectionTitle
          icon={<Activity className="h-5 w-5" aria-hidden />}
          title="مشتقات و اهرم"
          subtitle="داده عمومی صرافی‌ها؛ پوشش Lite و صرافی‌محور است و به‌عنوان کل بازار مشتقات تفسیر نمی‌شود."
        />
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className={nestedPanelClass}>
            <div className="text-[11px] text-[#8f9bb0]">دارایی‌های دارای داده</div>
            <div className="mt-2 text-2xl font-black text-[#eef3fc]">{formatNumber(summary.availableAssetsCount, 0)} / {formatNumber(summary.assets.length, 0)}</div>
          </div>
          <div className={nestedPanelClass}>
            <div className="text-[11px] text-[#8f9bb0]">ریسک اهرم بازار</div>
            <div className={cn("mt-2 text-2xl font-black", scoreTone(summary.marketLeverageRiskScore))}>{summary.marketLeverageRiskScore === null ? "ناموجود" : formatScore(summary.marketLeverageRiskScore)}</div>
          </div>
          <div className={nestedPanelClass}>
            <div className="text-[11px] text-[#8f9bb0]">برداشت کلی</div>
            <div className="mt-2 text-sm font-black leading-6 text-[#eef3fc]">{riskLabel}</div>
            <div className="mt-1 text-[10px] text-[#8f9bb0]">اعتماد: {percent(summary.confidence)}</div>
          </div>
        </div>

        <div className="overflow-x-auto rounded-[14px] border border-[#2b3850]">
          <table className="w-full min-w-[1040px] border-collapse text-xs">
            <thead className="bg-[#0d1521] text-[#8f9bb0]">
              <tr className="border-b border-[#2b3850]">
                <th className="px-3 py-3 text-right">دارایی</th>
                <th className="px-3 py-3 text-right">Funding</th>
                <th className="px-3 py-3 text-right">OI ۲۴ساعته</th>
                <th className="px-3 py-3 text-right">OI ۷روزه</th>
                <th className="px-3 py-3 text-right">ریسک اهرم</th>
                <th className="px-3 py-3 text-right">وضعیت مشتقات</th>
                <th className="px-3 py-3 text-right">اعتماد</th>
                <th className="px-3 py-3 text-right">منبع / زمان</th>
              </tr>
            </thead>
            <tbody>
              {summary.assets.map((asset) => (
                <tr key={asset.asset} className="border-b border-[#26334a] last:border-b-0">
                  <td className="px-3 py-3">
                    <span className="inline-flex items-center gap-2 font-black text-[#eef3fc]">{assetIcon(asset.asset, "sm")} {asset.asset}</span>
                  </td>
                  <td className="px-3 py-3 tabular-nums text-[#cfd8ea]">{asset.latestFundingRate === null ? "ناموجود" : `${formatNumber(asset.latestFundingRate, 4)}٪`}</td>
                  <td className="px-3 py-3 tabular-nums text-[#cfd8ea]">{signedPercent(asset.openInterest24hChangePct)}</td>
                  <td className="px-3 py-3 tabular-nums text-[#cfd8ea]">{signedPercent(asset.openInterest7dChangePct)}</td>
                  <td className="px-3 py-3 tabular-nums text-[#cfd8ea]">{asset.leverageRiskScore === null ? "ناموجود" : formatScore(asset.leverageRiskScore)}</td>
                  <td className="px-3 py-3 text-[#cfd8ea]">{asset.derivativesAvailable ? derivativesBiasFa(asset.directionalDerivativesBias) : "ناموجود"}</td>
                  <td className="px-3 py-3 tabular-nums text-[#cfd8ea]">{percent(asset.derivativesConfidence)}</td>
                  <td className="px-3 py-3 text-[10px] leading-5 text-[#8f9bb0]">{asset.sourceUsed ?? "منبع موفقی نبود"}<br />{sourceTimestamp(asset.latestDataTimestamp)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="text-xs leading-6 text-[#aab6ca]">
          {summary.missingAssets.length ? `دارایی‌های فاقد داده معتبر مشتقات: ${summary.missingAssets.join("، ")}` : "Funding و Open Interest برای همه دارایی‌های واجد شرایط موجود است."}
          {!visibleAssets.length ? " گزارش عمومی بدون ادعای اهرمی ادامه پیدا می‌کند." : " داده لیکوییدیشن نمایش داده نمی‌شود، چون جریان عمومی پیوسته در این runtime فعال نیست."}
        </div>
      </CardContent>
    </Card>
  );
}

function AssetOverviewTable({ assets }: { assets: PublicAssetBrief[] }) {
  return (
    <Card className={reportCardClass}>
      <CardHeader>
        <div>
          <CardTitle className="text-base text-[#eef3fc] md:text-lg">جدول فشرده ۱۰ دارایی</CardTitle>
          <CardDescription className={mutedTextClass}>حرکت قیمت ۲۴ساعته از برداشت رژیمی ۷/۳۰روزه جداست؛ رنگ امروز به‌تنهایی وضعیت میان‌مدت را تعیین نمی‌کند.</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {assets.map((asset) => (
            <div key={asset.symbol} className="min-w-0 rounded-[15px] border border-[#2b3850] bg-[#0f1724]/90 p-3 shadow-[0_10px_24px_-22px_rgba(0,0,0,0.9)]">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  {assetIcon(asset.symbol)}
                  <div className="min-w-0">
                    <div className="whitespace-nowrap text-sm font-black text-[#eef3fc]">{asset.symbol}</div>
                    <div className="truncate text-[11px] text-[#9aa8bd]">{asset.persianName}</div>
                  </div>
                </div>
                <div className="shrink-0 text-left">
                  <div className="text-[9px] text-[#8f9bb0]">امتیاز رژیم ۷/۳۰</div>
                  <span className={cn("text-sm font-black tabular-nums", scoreTone(asset.impactScore))}>{asset.impactScore === null ? "—" : formatNumber(asset.impactScore, 0)}</span>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-1.5 text-[10px]">
                <div className="rounded-[8px] border border-[#26334a] bg-[#111a28]/80 p-2">
                  <div className="text-[#8f9bb0]">آخرین قیمت</div>
                  <div className="mt-1 font-black tabular-nums text-[#eef3fc]">{priceLabel(asset.priceAction24h.latestPriceUsd)}</div>
                </div>
                <div className="rounded-[8px] border border-[#26334a] bg-[#111a28]/80 p-2">
                  <div className="text-[#8f9bb0]">تغییر ۲۴ساعته</div>
                  <div className={cn("mt-1 font-black tabular-nums", asset.priceAction24h.status === "positive" ? "text-emerald-300" : asset.priceAction24h.status === "negative" ? "text-red-300" : "text-amber-200")}>
                    {signedPercent(asset.priceAction24h.changePct)}
                  </div>
                </div>
                <div className="rounded-[8px] border border-[#26334a] bg-[#111a28]/80 p-2">
                  <div className="text-[#8f9bb0]">تغییر ۷روزه</div>
                  <div className="mt-1 font-black tabular-nums text-[#eef3fc]">{signedPercent(asset.regimeView.change7dPct)}</div>
                </div>
                <div className="rounded-[8px] border border-[#26334a] bg-[#111a28]/80 p-2">
                  <div className="text-[#8f9bb0]">تغییر ۳۰روزه</div>
                  <div className="mt-1 font-black tabular-nums text-[#eef3fc]">{signedPercent(asset.regimeView.change30dPct)}</div>
                </div>
              </div>

              <div className="mt-2 grid grid-cols-2 gap-1.5">
                <Badge className="justify-center whitespace-normal px-2 py-1 text-[9px] leading-4" variant={asset.priceAction24h.status === "positive" ? "success" : asset.priceAction24h.status === "negative" ? "danger" : "outline"}>
                  ۲۴ساعته: {asset.priceAction24h.statusFa}
                </Badge>
                <Badge className="justify-center whitespace-normal px-2 py-1 text-[9px] leading-4" variant={asset.confidence < 45 || asset.dataCoverage < 50 ? "warning" : "outline"}>
                  رژیم: {asset.biasFa}
                </Badge>
              </div>

              <div className="mt-3 space-y-2 text-[11px] leading-5">
                <div className="flex items-center justify-between gap-2">
                  <span className={mutedTextClass}>اعتماد تحلیل</span>
                  <span className="font-bold tabular-nums text-[#eef3fc]">{percent(asset.confidence)}</span>
                </div>
                <Progress value={asset.confidence} className="h-1.5 bg-[#263044]" indicatorClassName={confidenceTone(asset.confidence)} />
                <div className="flex items-start justify-between gap-2">
                  <span className={mutedTextClass}>پوشش</span>
                  <span className="max-w-[112px] text-left leading-5 text-[#cfd8ea]">{asset.coverageLabelFa}</span>
                </div>
                <div className="rounded-[10px] border border-[#26334a] bg-[#111a28]/80 p-2">
                  <div className="mb-1 text-[10px] font-bold text-[#8f9bb0]">محرک عددی اصلی</div>
                  <div className="text-[10px] leading-5 text-[#aab6ca]">{asset.mainNumericDriverFa}</div>
                </div>
                {asset.derivatives?.derivativesAvailable ? (
                  <div className="grid grid-cols-3 gap-1 rounded-[10px] border border-[#26334a] bg-[#111a28]/80 p-2 text-center text-[9px] leading-4">
                    <div><span className="block text-[#8f9bb0]">Funding</span><b className="text-[#eef3fc]">{asset.derivatives.latestFundingRate === null ? "—" : `${formatNumber(asset.derivatives.latestFundingRate, 3)}٪`}</b></div>
                    <div><span className="block text-[#8f9bb0]">OI ۲۴h</span><b className="text-[#eef3fc]">{signedPercent(asset.derivatives.openInterest24hChangePct)}</b></div>
                    <div><span className="block text-[#8f9bb0]">ریسک</span><b className="text-[#eef3fc]">{asset.derivatives.leverageRiskScore === null ? "—" : formatNumber(asset.derivatives.leverageRiskScore, 0)}</b></div>
                  </div>
                ) : null}
                {asset.missingDataFlags.length ? <div className="line-clamp-2 text-[9px] leading-4 text-amber-200">داده‌های غایب: {asset.missingDataFlags.join("، ")}</div> : null}
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
        <div className="grid gap-2 sm:grid-cols-2">
          <div className={nestedPanelClass}>
            <div className="text-xs font-black text-[#eef3fc]">قیمت و حرکت ۲۴ ساعته</div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] leading-5 text-[#aab6ca]">
              <div>قیمت: <span className="font-bold text-[#eef3fc]">{priceLabel(asset.priceAction24h.latestPriceUsd)}</span></div>
              <div>تغییر: <span className="font-bold text-[#eef3fc]">{signedPercent(asset.priceAction24h.changePct)}</span></div>
              <div>حجم: <span className="font-bold text-[#eef3fc]">{asset.priceAction24h.volume24hUsd === null ? "ناموجود" : formatCompactUsd(asset.priceAction24h.volume24hUsd)}</span></div>
              <div>وضعیت: <span className="font-bold text-[#eef3fc]">{asset.priceAction24h.statusFa}</span></div>
            </div>
            <div className="mt-2 text-[9px] leading-4 text-[#78869d]">{asset.priceAction24h.sourceName} · {sourceTimestamp(asset.priceAction24h.timestamp)}</div>
          </div>
          <div className={nestedPanelClass}>
            <div className="text-xs font-black text-[#eef3fc]">برداشت رژیمی ۷/۳۰ روزه</div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] leading-5 text-[#aab6ca]">
              <div>۷روزه: <span className="font-bold text-[#eef3fc]">{signedPercent(asset.regimeView.change7dPct)}</span></div>
              <div>۳۰روزه: <span className="font-bold text-[#eef3fc]">{signedPercent(asset.regimeView.change30dPct)}</span></div>
              <div>امتیاز رژیم: <span className="font-bold text-[#eef3fc]">{asset.regimeView.score === null ? "ناموجود" : formatScore(asset.regimeView.score)}</span></div>
              <div>اعتماد نهایی: <span className="font-bold text-[#eef3fc]">{percent(asset.regimeView.confidence)}</span></div>
            </div>
            {asset.regimeView.explanationFa ? <div className="mt-2 rounded-[8px] border border-amber-400/20 bg-amber-400/5 p-2 text-[10px] leading-5 text-amber-100">{asset.regimeView.explanationFa}</div> : null}
          </div>
        </div>
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
                <span key={asset} className="inline-flex items-center gap-1.5 rounded-sm border bg-muted/35 px-2 py-1 text-[10px] text-muted-foreground">
                  {assetIcon(asset, "sm")}
                  <span>{asset}</span>
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
      <DataEvidenceStrip brief={brief} />
      <OperationalDashboard brief={brief} />
      <MainAlertsDashboard brief={brief} />
      <section className="grid items-start gap-4">
        <LiquidityDashboard brief={brief} />
        <ActiveEdgesDashboard brief={brief} />
      </section>
      <AnalysisEngineScores brief={brief} />
      <DerivativesLiteEvidence brief={brief} />
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
