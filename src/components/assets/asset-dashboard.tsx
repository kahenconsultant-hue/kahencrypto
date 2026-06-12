import Link from "next/link";
import { AlertTriangle, BarChart3, Brain, DatabaseZap, Gauge, ListChecks, RadioTower, Waves } from "lucide-react";
import { assetIntelligence, categoryLabels, getNewsItems } from "@/lib/production-data";
import type { AssetIntelligence, HorizonIntelligence, SourceSignal } from "@/lib/types";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataSourceBadge } from "@/components/ui/data-source-badge";
import { Metric } from "@/components/ui/metric";
import { Progress } from "@/components/ui/progress";
import { Tabs } from "@/components/ui/tabs";
import { assetStatusKey, dataSourceStatusLabels, moduleDataSourceStatus } from "@/lib/data-source-status";
import { formatNumber } from "@/lib/utils";
import { generateAssetImpactProfile } from "@/server/analytics/asset-impact-engine";
import { generateSmartAlerts } from "@/server/alerts/smart-alert-engine";
import { summarizeImpactForAsset } from "@/server/ai/pipeline";

const emptyState = "داده کافی برای تحلیل معتبر وجود ندارد";

function toneVariant(tone: AssetIntelligence["metrics"][number]["tone"]): "success" | "warning" | "danger" | "muted" {
  if (tone === "good") return "success";
  if (tone === "warn") return "warning";
  if (tone === "bad") return "danger";
  return "muted";
}

function statusVariant(status: SourceSignal["status"]): "success" | "warning" | "danger" | "muted" {
  if (status === "live") return "success";
  if (status === "partial_live" || status === "delayed" || status === "proxy") return "warning";
  if (status === "unavailable") return "danger";
  return "muted";
}

function biasVariant(bias: string): "success" | "warning" | "danger" | "muted" {
  if (bias === "bullish") return "success";
  if (bias === "bearish") return "danger";
  if (bias === "mixed") return "warning";
  return "muted";
}

const biasLabels: Record<string, string> = {
  bullish: "مثبت",
  bearish: "منفی",
  neutral: "خنثی",
  mixed: "دوگانه",
  pressure: "فشارزا",
  supportive: "حمایتی",
};

const toneLabels: Record<string, string> = {
  good: "مطلوب",
  warn: "نیازمند رصد",
  bad: "ریسکی",
  neutral: "خنثی",
};

const alertLevelLabels: Record<string, string> = {
  Critical: "بحرانی",
  Important: "مهم",
  Watch: "رصد",
  Info: "اطلاعی",
};

const regimeLabels: Record<string, string> = {
  "Risk-On Expansion": "گسترش ریسک‌پذیری",
  "Weak Risk-On": "ریسک‌پذیری ضعیف",
  "Fragile Risk-On": "ریسک‌پذیری شکننده",
  "Liquidity-Constrained Risk-On": "ریسک‌پذیری محدودشده با نقدینگی",
  "Risk-Off Defensive": "حالت دفاعی بازار",
  "Liquidity Squeeze": "فشار نقدینگی",
  "Dollar Strength Pressure": "فشار ناشی از تقویت دلار",
  "Rates Shock": "شوک نرخ بهره",
  "Crypto-Specific Bullish": "حمایت اختصاصی بازار کریپتو",
  "Crypto-Specific Stress": "تنش اختصاصی بازار کریپتو",
  "Geopolitical Shock": "شوک ژئوپلیتیک",
  "Neutral / Transition": "خنثی / در حال گذار",
  "High Volatility Unclear Regime": "نوسان بالا و رژیم نامشخص",
  "Macro Uncertainty": "ابهام کلان",
  "ETF Accumulation": "انباشت از مسیر ETF",
  "Liquidity Expansion": "گسترش نقدینگی",
  "Leverage Overheating": "داغ شدن اهرم معاملاتی",
  "Stablecoin Stress": "تنش استیبل‌کوین",
  "Stablecoin Expansion": "گسترش استیبل‌کوین",
  "Geopolitical Stress": "فشار ژئوپلیتیک",
  "Risk-Off": "ریسک‌گریزی",
  "Risk-On": "ریسک‌پذیری",
  "Liquidity Contraction": "انقباض نقدینگی",
  Panic: "فاز هراس",
  Euphoria: "فاز سرخوشی",
};

function labelOrRaw(map: Record<string, string>, value?: string | null) {
  if (!value) return "ناموجود";
  return map[value] ?? value;
}

function PersianList({ items, icon = "dot" }: { items?: string[]; icon?: "dot" | "warn" | "check" }) {
  if (!items?.length) {
    return <p className="rounded-md border bg-secondary/25 p-3 text-xs leading-6 text-muted-foreground">{emptyState}</p>;
  }

  return (
    <ul className="space-y-2 text-xs leading-6 text-muted-foreground">
      {items.map((item) => (
        <li key={item} className="flex gap-2">
          {icon === "warn" ? <AlertTriangle className="mt-1 h-3.5 w-3.5 flex-none text-amber-300" aria-hidden /> : null}
          {icon === "check" ? <ListChecks className="mt-1 h-3.5 w-3.5 flex-none text-primary" aria-hidden /> : null}
          {icon === "dot" ? <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-primary/70" /> : null}
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function SourceTransparency({ sources }: { sources: SourceSignal[] }) {
  if (!sources.length) {
    return <p className="rounded-md border bg-secondary/25 p-3 text-xs leading-6 text-muted-foreground">{emptyState}</p>;
  }

  return (
    <div className="grid gap-2 xl:grid-cols-2">
      {sources.map((source) => (
        <div key={`${source.sourceId}-${source.lastUpdatedAt}`} className="rounded-md border bg-card/70 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-xs font-black">{source.sourceName}</div>
              <div className="mt-1 text-[11px] leading-5 text-muted-foreground">{source.category}</div>
            </div>
            <Badge variant={statusVariant(source.status)}>{dataSourceStatusLabels[source.status]}</Badge>
          </div>
          <p className="mt-2 line-clamp-3 text-[11px] leading-5 text-muted-foreground">{source.signalFa}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <Badge variant="outline">اطمینان {source.confidence}%</Badge>
            <Badge variant="outline">اعتبار {source.reliabilityScore}/100</Badge>
            <Badge variant="outline">کیفیت داده {source.dataQuality ? dataSourceStatusLabels[source.dataQuality] : dataSourceStatusLabels[source.status]}</Badge>
            <span>آخرین بروزرسانی: {new Date(source.lastUpdatedAt).toLocaleString("fa-IR")}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function SignalBlock({ title, value }: { title: string; value?: string }) {
  return (
    <div className="rounded-md border bg-secondary/25 p-3">
      <div className="metric-label">{title}</div>
      <p className="mt-2 text-xs leading-6 text-muted-foreground">{value || emptyState}</p>
    </div>
  );
}

function HorizonPanel({ intelligence }: { intelligence: HorizonIntelligence }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-primary" aria-hidden />
              ساختار پیش‌بینی سناریومحور
            </CardTitle>
            <CardDescription>
              {intelligence.horizonLabelFa} · رژیم بازار: {labelOrRaw(regimeLabels, intelligence.regime)}
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">اطمینان {intelligence.confidence}%</Badge>
            <Badge variant={statusVariant(intelligence.dataQuality)}>{dataSourceStatusLabels[intelligence.dataQuality]}</Badge>
            <Badge variant="muted">آخرین بروزرسانی: {new Date(intelligence.lastUpdatedAt).toLocaleString("fa-IR")}</Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          <SignalBlock title="وضعیت فعلی بازار" value={intelligence.forecast.currentMarketStatus} />
          <div className="grid gap-3 xl:grid-cols-2">
            <SignalBlock title="سناریوی محتمل کوتاه‌مدت" value={intelligence.forecast.shortTermScenario} />
            <SignalBlock title="سناریوی محتمل میان‌مدت" value={intelligence.forecast.mediumTermScenario} />
          </div>
          <SignalBlock title="سطح اطمینان تحلیل" value={intelligence.forecast.analysisConfidenceText} />
          <div className="grid gap-3 md:grid-cols-5">
            <Metric label="Risk (ریسک)" value={`${intelligence.quantitativeScores.marketRiskScore}/100`} tone="warn" progress={intelligence.quantitativeScores.marketRiskScore} />
            <Metric label="Liquidity (نقدینگی)" value={`${intelligence.quantitativeScores.liquidityScore}/100`} tone="neutral" progress={intelligence.quantitativeScores.liquidityScore} />
            <Metric label="Macro (کلان)" value={`${intelligence.quantitativeScores.macroStressScore}/100`} tone="warn" progress={intelligence.quantitativeScores.macroStressScore} />
            <Metric label="Narrative (روایت)" value={`${intelligence.quantitativeScores.narrativeStrength}/100`} tone="neutral" progress={intelligence.quantitativeScores.narrativeStrength} />
            <Metric label="Volatility (نوسان)" value={`${intelligence.quantitativeScores.volatilityRisk}/100`} tone="warn" progress={intelligence.quantitativeScores.volatilityRisk} />
          </div>
          <Progress value={intelligence.confidence} className="mt-4" />
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>محرک‌های مثبت</CardTitle>
          </CardHeader>
          <CardContent>
            <PersianList items={intelligence.bullishFactors} icon="check" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>محرک‌های منفی</CardTitle>
          </CardHeader>
          <CardContent>
            <PersianList items={intelligence.bearishFactors} icon="warn" />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <SignalBlock title="اثر نقدینگی" value={intelligence.liquiditySignal} />
        <SignalBlock title="حساسیت ماکرو" value={intelligence.macroSignal} />
        <SignalBlock title="آن‌چین / جریان سرمایه" value={intelligence.flowSignal} />
        <SignalBlock title="سنتیمنت / روایت" value={intelligence.sentimentSignal} />
        <SignalBlock title="همبستگی" value={intelligence.correlationSignal} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
        <Card>
          <CardHeader>
            <CardTitle>ریسک‌های اصلی</CardTitle>
          </CardHeader>
          <CardContent>
            <PersianList items={intelligence.forecast.mainRisks} icon="warn" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>داده‌هایی که باید رصد شوند</CardTitle>
          </CardHeader>
          <CardContent>
            <PersianList items={intelligence.forecast.monitoringData} icon="dot" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2">
              <RadioTower className="h-4 w-4 text-primary" aria-hidden />
              منابع استفاده‌شده و شفافیت داده
            </CardTitle>
            <CardDescription>هر منبع با وضعیت داده، زمان آخرین به‌روزرسانی، اعتبار و سطح اطمینان نمایش داده می‌شود.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <SourceTransparency sources={intelligence.usedSources} />
        </CardContent>
      </Card>
    </div>
  );
}

export function AssetDashboard({ assetKey }: { assetKey: keyof typeof assetIntelligence }) {
  const asset = assetIntelligence[assetKey];
  const directionalImpact = generateAssetImpactProfile(asset.symbol);
  const statusKey = assetStatusKey(assetKey);
  const alerts = generateSmartAlerts().filter((alert) => alert.affectedAssets.includes(asset.symbol));
  const news = getNewsItems()
    .filter((item) => item.impacts.some((impact) => impact.asset === asset.symbol))
    .slice(0, 8);
  const tabs = asset.horizons
    ? [
        { value: "short", label: "کوتاه‌مدت: ۷ روز آینده", content: <HorizonPanel intelligence={asset.horizons.short} /> },
        { value: "medium", label: "میان‌مدت: ۱ ماه آینده", content: <HorizonPanel intelligence={asset.horizons.medium} /> },
        { value: "long", label: "بلندمدت: ۶ ماه آینده", content: <HorizonPanel intelligence={asset.horizons.long} /> },
      ]
    : [];

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2 text-xl">
              <BarChart3 className="h-5 w-5 text-primary" aria-hidden />
              هوش {asset.symbol} / {asset.titleFa}
            </CardTitle>
            <CardDescription>{asset.roleFa ?? "تحلیل چندافقی و سناریومحور برای این دارایی."}</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <DataSourceBadge status={moduleDataSourceStatus[statusKey]} />
            <Badge variant={biasVariant(directionalImpact.directionalBias)}>{labelOrRaw(biasLabels, directionalImpact.directionalBias)}</Badge>
            <Badge variant="outline">اثر {directionalImpact.impactScore > 0 ? "+" : ""}{formatNumber(directionalImpact.impactScore, 0)}</Badge>
            <Link href={`/api/v1/assets/${assetKey}`} className="text-xs font-bold text-primary">
              خروجی API
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-8 text-muted-foreground">{asset.aiInterpretation || emptyState}</p>
          <div className="mt-4 rounded-md border bg-secondary/25 p-3">
            <div className="metric-label">هوش جهت‌دار از موتور امتیازدهی</div>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">{directionalImpact.traderInterpretation}</p>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <SignalBlock title="محرک‌های اصلی" value={directionalImpact.mainDrivers.slice(0, 3).join(" | ")} />
              <SignalBlock title="محرک‌های مخالف" value={directionalImpact.opposingDrivers.slice(0, 3).join(" | ")} />
              <SignalBlock title="شرط ابطال" value={directionalImpact.invalidationCondition} />
            </div>
            <p className="mt-3 text-[11px] leading-5 text-muted-foreground">
              {directionalImpact.scoreFormula} · {directionalImpact.confidence.available ? `اطمینان ${directionalImpact.confidence.score}٪` : directionalImpact.confidence.explanation}
            </p>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <Metric label="Macro (کلان)" value={`${asset.macroPressure}/100`} tone={asset.macroPressure >= 70 ? "warn" : "neutral"} progress={asset.macroPressure} />
            <Metric label="Liquidity (نقدینگی)" value={`${asset.liquidityScore}/100`} tone={asset.liquidityScore >= 60 ? "good" : "neutral"} progress={asset.liquidityScore} />
            <Metric label="Sentiment (سنتیمنت)" value={`${asset.sentimentScore}/100`} tone={asset.sentimentScore >= 70 ? "warn" : "neutral"} progress={asset.sentimentScore} />
          </div>
        </CardContent>
      </Card>

      {tabs.length ? <Tabs items={tabs} defaultValue="short" /> : <p className="rounded-md border bg-card p-4 text-sm text-muted-foreground">{emptyState}</p>}

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <Gauge className="h-4 w-4 text-primary" aria-hidden />
                ساختار بازار و حساسیت به رژیم
              </CardTitle>
              <CardDescription>نقش این دارایی در نقشه کلان کریپتو.</CardDescription>
            </div>
            <DataSourceBadge status={moduleDataSourceStatus[statusKey]} />
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm leading-7 text-muted-foreground">{asset.marketStructure || emptyState}</p>
            <div className="grid gap-2 md:grid-cols-2">
              {asset.metrics.length ? (
                asset.metrics.map((metric) => (
                  <div key={metric.label} className="min-w-0 rounded-md border bg-secondary/30 p-3">
                    <div className="metric-label">{metric.label}</div>
                    <div className="mt-2 flex min-w-0 items-center justify-between gap-2">
                      <span className="min-w-0 break-words font-black">{metric.value}</span>
                      <Badge variant={toneVariant(metric.tone)}>{labelOrRaw(toneLabels, metric.tone)}</Badge>
                    </div>
                  </div>
                ))
              ) : (
                <p className="rounded-md border bg-secondary/25 p-3 text-xs text-muted-foreground md:col-span-2">{emptyState}</p>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <Waves className="h-4 w-4 text-cyan-300" aria-hidden />
                جریان سرمایه و داده‌های اختصاصی
              </CardTitle>
              <CardDescription>ETF، نهنگ، نقدینگی، آن‌چین یا محرک معادل برای دارایی‌های ماکرو.</CardDescription>
            </div>
            <DataSourceBadge status={moduleDataSourceStatus[statusKey]} />
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <SignalBlock title="نهنگ / جریان سرمایه" value={asset.whaleFlow} />
            <SignalBlock title="ETF / جریان نهادی" value={asset.etfFlow} />
            <div className="md:col-span-2">
              <SignalBlock title="آن‌چین / شاخص‌های محرک" value={asset.onchainSummary} />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle>نقشه منابع</CardTitle>
              <CardDescription>منابعی که برای تحلیل این دارایی در registry ثبت شده‌اند.</CardDescription>
            </div>
            <DataSourceBadge status={moduleDataSourceStatus[statusKey]} />
          </CardHeader>
          <CardContent className="grid gap-2 xl:grid-cols-2">
            {asset.sourceMapping?.length ? (
              asset.sourceMapping.map((source) => (
                <div key={source.id} className="rounded-md border bg-secondary/25 p-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-xs font-black">{source.name}</div>
                      <div className="mt-1 text-[11px] leading-5 text-muted-foreground">{source.category}</div>
                    </div>
                    <Badge variant={statusVariant(source.currentStatus)}>{dataSourceStatusLabels[source.currentStatus]}</Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                    <Badge variant="outline">{source.sourceType}</Badge>
                    <Badge variant="outline">اعتبار {source.reliabilityScore}/100</Badge>
                    <Badge variant="outline">{source.updateFrequency}</Badge>
                  </div>
                  <p className="mt-2 line-clamp-2 text-[11px] leading-5 text-muted-foreground">{source.notes}</p>
                </div>
              ))
            ) : (
              <p className="rounded-md border bg-secondary/25 p-3 text-xs text-muted-foreground xl:col-span-2">{emptyState}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle>هشدارهای هوشمند</CardTitle>
              <CardDescription>هشدارهای مرتبط با {asset.symbol}.</CardDescription>
            </div>
            <DataSourceBadge status={moduleDataSourceStatus.topAlerts} />
          </CardHeader>
          <CardContent className="space-y-2">
            {alerts.length ? (
              alerts.map((alert) => (
                <div key={alert.id} className="rounded-md border bg-secondary/30 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-black leading-6">{alert.titleFa}</span>
                    <Badge variant={alert.level === "Critical" ? "danger" : alert.level === "Important" ? "warning" : "default"}>{labelOrRaw(alertLevelLabels, alert.level)}</Badge>
                  </div>
                  <p className="mt-2 text-xs leading-6 text-muted-foreground">{alert.scenarioFa}</p>
                  <p className="mt-2 text-[11px] leading-5 text-muted-foreground">{alert.whyItMattersFa}</p>
                  <Progress value={alert.confidence} className="mt-3" />
                </div>
              ))
            ) : (
              <p className="rounded-md border bg-secondary/25 p-3 text-xs text-muted-foreground">{emptyState}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2">
              <DatabaseZap className="h-4 w-4 text-primary" aria-hidden />
              تحلیل‌های پردازش‌شده مرتبط
            </CardTitle>
            <CardDescription>خبرها و پردازش‌های مرتبط با {asset.symbol}.</CardDescription>
          </div>
          <DataSourceBadge status={moduleDataSourceStatus.latestNews} />
        </CardHeader>
        <CardContent className="grid gap-3 xl:grid-cols-2">
          {news.length ? (
            news.map((item) => {
              const impact = summarizeImpactForAsset(item.impacts, asset.symbol);
              return (
                <div key={item.id} className="min-w-0 rounded-md border bg-secondary/25 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <Badge variant="muted">{item.source}</Badge>
                      <Badge variant="outline">{categoryLabels[item.category]}</Badge>
                    </div>
                    <span className="text-[11px] text-muted-foreground">{new Date(item.timestamp).toLocaleString("fa-IR")}</span>
                  </div>
                  <h3 className="mt-3 text-sm font-black leading-7">{item.titleFa}</h3>
                  <p className="mt-2 text-xs leading-6 text-muted-foreground">{impact.invalidationFa}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge variant={impact.dominantDirection === "pressure" ? "warning" : impact.dominantDirection === "supportive" ? "success" : "muted"}>
                      {labelOrRaw(biasLabels, impact.dominantDirection)}
                    </Badge>
                    <Badge variant="outline">اطمینان {formatNumber(impact.averageConfidence, 0)}٪</Badge>
                  </div>
                </div>
              );
            })
          ) : (
            <p className="rounded-md border bg-secondary/25 p-3 text-sm text-muted-foreground xl:col-span-2">{emptyState}</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
