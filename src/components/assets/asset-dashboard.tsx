import Link from "next/link";
import { AlertTriangle, BarChart3, Brain, DatabaseZap, Gauge, LineChart, ShieldAlert, Target, Waves } from "lucide-react";
import type { SmartAlert } from "@/lib/types";
import type { UnifiedAssetIntelligence, UnifiedDriverCard, UnifiedScoreCard } from "@/server/intelligence/unified-intelligence-engine";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Metric } from "@/components/ui/metric";
import { Progress } from "@/components/ui/progress";
import { dataSourceStatusLabels } from "@/lib/data-source-status";
import { formatNumber } from "@/lib/utils";

const partialState = "هوش جزئی فعال است؛ برخی ورودی‌ها هنوز ناموجودند، اما خروجی از Fusion و موتورهای مشترک خوانده می‌شود.";

function badgeForBias(bias: UnifiedAssetIntelligence["bias"]): "success" | "warning" | "danger" | "muted" {
  if (bias === "bullish") return "success";
  if (bias === "bearish") return "danger";
  return "warning";
}

function biasLabel(bias: UnifiedAssetIntelligence["bias"]) {
  if (bias === "bullish") return "مثبت";
  if (bias === "bearish") return "منفی";
  return "خنثی";
}

function modeVariant(mode: UnifiedAssetIntelligence["mode"]): "success" | "warning" | "danger" | "muted" {
  if (mode === "FULL_INTELLIGENCE") return "success";
  if (mode === "PARTIAL_INTELLIGENCE") return "warning";
  return "danger";
}

function scoreTone(tone: UnifiedScoreCard["tone"]): "good" | "warn" | "bad" | "neutral" {
  if (tone === "good") return "good";
  if (tone === "warn") return "warn";
  if (tone === "bad") return "bad";
  return "neutral";
}

function driverVariant(tone: UnifiedDriverCard["tone"]): "success" | "warning" | "danger" | "muted" {
  if (tone === "positive") return "success";
  if (tone === "negative") return "danger";
  if (tone === "warning") return "warning";
  return "muted";
}

function driverBorder(tone: UnifiedDriverCard["tone"]) {
  if (tone === "positive") return "border-emerald-400/30 bg-emerald-400/5";
  if (tone === "negative") return "border-red-400/30 bg-red-400/5";
  if (tone === "warning") return "border-amber-400/30 bg-amber-400/5";
  return "border-border bg-secondary/25";
}

function alertVariant(alert: SmartAlert): "danger" | "warning" | "default" | "muted" {
  if (alert.level === "Critical") return "danger";
  if (alert.level === "Important") return "warning";
  if (alert.level === "Watch") return "default";
  return "muted";
}

function alertLevelLabel(level: SmartAlert["level"]) {
  if (level === "Critical") return "بحرانی";
  if (level === "Important") return "مهم";
  if (level === "Watch") return "رصد";
  return "اطلاعی";
}

function formatPercent(value: number | null | undefined) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "ناموجود";
  return `${formatNumber(value, 0)}%`;
}

function ScoreGauge({ card }: { card: UnifiedScoreCard }) {
  return (
    <Metric
      label={card.label}
      value={card.value === null ? "ناموجود" : `${formatNumber(card.value, 0)}/100`}
      detail={card.detail}
      tone={scoreTone(card.tone)}
      progress={card.value ?? undefined}
    />
  );
}

function DriverCard({ driver }: { driver: UnifiedDriverCard }) {
  return (
    <div className={`rounded-md border p-3 ${driverBorder(driver.tone)}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-black leading-6">{driver.title}</h3>
        <Badge variant={driverVariant(driver.tone)}>{driver.source}</Badge>
      </div>
      <p className="mt-2 text-xs leading-6 text-muted-foreground">{driver.body}</p>
    </div>
  );
}

function InheritedStateCards({ asset }: { asset: UnifiedAssetIntelligence }) {
  const rows = [
    { label: "Fusion Score", value: asset.inherited.fusionScore === null ? "ناموجود" : `${formatNumber(asset.inherited.fusionScore, 0)}/100` },
    { label: "Regime", value: asset.inherited.regime },
    { label: "Liquidity", value: asset.inherited.liquidityState },
    { label: "Macro", value: asset.inherited.macroState },
    { label: "ETF", value: asset.inherited.etfState },
    { label: "Correlation", value: asset.inherited.correlationState },
    { label: "News", value: asset.inherited.newsState },
  ];

  return (
    <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
      {rows.map((row) => (
        <div key={row.label} className="rounded-md border bg-secondary/25 p-3">
          <div className="metric-label">{row.label}</div>
          <p className="mt-2 text-xs leading-6 text-muted-foreground">{row.value || partialState}</p>
        </div>
      ))}
    </div>
  );
}

function CorrelationCards({ asset }: { asset: UnifiedAssetIntelligence }) {
  if (!asset.correlationCards.length) {
    return (
      <p className="rounded-md border bg-secondary/25 p-3 text-xs leading-6 text-muted-foreground">
        برای این دارایی همبستگی مستقیم کافی در پنجره‌های فعلی وجود ندارد؛ نتیجه جهت‌دار از همبستگی تولید نشده است.
      </p>
    );
  }

  return (
    <div className="grid gap-3 xl:grid-cols-2">
      {asset.correlationCards.map((card) => (
        <div key={card.pair} className="rounded-md border bg-secondary/25 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-black">{card.pair}</h3>
            <Badge variant={card.status === "available" ? "success" : "warning"}>{card.status}</Badge>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
            <div>
              <div className="metric-label">24H</div>
              <div className="mt-1 font-black">{card.correlation24h === null ? "ناموجود" : card.correlation24h.toFixed(2)}</div>
            </div>
            <div>
              <div className="metric-label">7D</div>
              <div className="mt-1 font-black">{card.correlation7d === null ? "ناموجود" : card.correlation7d.toFixed(2)}</div>
            </div>
            <div>
              <div className="metric-label">30D</div>
              <div className="mt-1 font-black">{card.correlation30d === null ? "ناموجود" : card.correlation30d.toFixed(2)}</div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
            <Badge variant="outline">پوشش {formatPercent(card.coveragePercent)}</Badge>
            <Badge variant="outline">اطمینان {formatPercent(card.confidence)}</Badge>
            <Badge variant="outline">نمونه 7D: {card.observations["7d"]}/{card.requiredSamples["7d"]}</Badge>
          </div>
        </div>
      ))}
    </div>
  );
}

function ForecastValidationWidget({ asset }: { asset: UnifiedAssetIntelligence }) {
  const validation = asset.forecastValidation;
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" aria-hidden />
            اعتبارسنجی پیش‌بینی
          </CardTitle>
          <CardDescription>این بخش فقط از forecastهای واقعی ثبت‌شده توسط C.M.I.P استفاده می‌کند.</CardDescription>
        </div>
        <Badge variant={validation.forecastCount ? "success" : "warning"}>{validation.labelFa}</Badge>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-4">
        <Metric label="Accuracy 24H" value={formatPercent(validation.accuracy24h)} tone="neutral" progress={validation.accuracy24h ?? undefined} />
        <Metric label="Accuracy 7D" value={formatPercent(validation.accuracy7d)} tone="neutral" progress={validation.accuracy7d ?? undefined} />
        <Metric label="Forecast Count" value={String(validation.forecastCount)} tone="neutral" />
        <Metric label="Current Confidence" value={formatPercent(validation.currentConfidence)} tone="neutral" progress={validation.currentConfidence ?? undefined} />
      </CardContent>
    </Card>
  );
}

export function AssetDashboard({ asset }: { asset: UnifiedAssetIntelligence }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2 text-xl">
              <BarChart3 className="h-5 w-5 text-primary" aria-hidden />
              هوش {asset.symbol} / {asset.titleFa}
            </CardTitle>
            <CardDescription>{asset.roleFa}</CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={modeVariant(asset.mode)}>{asset.modeLabelFa}</Badge>
            <Badge variant={badgeForBias(asset.bias)}>سوگیری {biasLabel(asset.bias)}</Badge>
            <Badge variant="outline">اطمینان {asset.confidence}%</Badge>
            <Badge variant="outline">پوشش کل {asset.globalCoverage}%</Badge>
            <Link href={`/api/v1/assets/${asset.key}`} className="text-xs font-bold text-primary">
              خروجی API
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-8 text-muted-foreground">{asset.scenarioSummary || partialState}</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {asset.scoreCards.map((card) => (
              <ScoreGauge key={card.label} card={card} />
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-4 w-4 text-primary" aria-hidden />
              خروجی مشترک هوش بازار
            </CardTitle>
            <CardDescription>این داده‌ها از همان Fusion، Regime، Liquidity، Macro، ETF، Correlation و News مشترک داشبورد خوانده می‌شوند.</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <InheritedStateCards asset={asset} />
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <Waves className="h-4 w-4 text-emerald-300" aria-hidden />
                محرک‌های اصلی
              </CardTitle>
              <CardDescription>محرک‌های مثبت یا حمایتی برای سناریوی فعلی.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {asset.mainDrivers.map((driver) => (
              <DriverCard key={`${driver.title}-${driver.body}`} driver={driver} />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-300" aria-hidden />
                موانع و فشارها
              </CardTitle>
              <CardDescription>محرک‌هایی که پایداری سناریو یا confidence را محدود می‌کنند.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {asset.headwinds.map((driver) => (
              <DriverCard key={`${driver.title}-${driver.body}`} driver={driver} />
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-amber-300" aria-hidden />
                ریسک و شروط ابطال
              </CardTitle>
              <CardDescription>شرایطی که سناریوی فعلی را ضعیف یا نامعتبر می‌کند.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {asset.riskCards.map((driver) => (
              <DriverCard key={`${driver.title}-${driver.body}`} driver={driver} />
            ))}
            <div className="rounded-md border bg-secondary/25 p-3">
              <div className="metric-label">Invalidation Conditions</div>
              <ul className="mt-2 space-y-2 text-xs leading-6 text-muted-foreground">
                {asset.invalidationConditions.map((condition) => (
                  <li key={condition} className="flex gap-2">
                    <span className="mt-2 h-1.5 w-1.5 flex-none rounded-full bg-amber-300" />
                    <span>{condition}</span>
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <LineChart className="h-4 w-4 text-primary" aria-hidden />
                همبستگی‌های مرتبط
              </CardTitle>
              <CardDescription>فقط همبستگی‌هایی نمایش داده می‌شوند که از لایه correlation مشترک آمده‌اند.</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <CorrelationCards asset={asset} />
          </CardContent>
        </Card>
      </div>

      <ForecastValidationWidget asset={asset} />

      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <Gauge className="h-4 w-4 text-primary" aria-hidden />
                هشدارهای مرتبط
              </CardTitle>
              <CardDescription>همان هشدارهای بازار که در Dashboard مصرف می‌شوند، با فیلتر دارایی.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {asset.alerts.length ? (
              asset.alerts.map((alert) => (
                <div key={alert.id} className="rounded-md border bg-secondary/30 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-black leading-6">{alert.titleFa}</span>
                    <Badge variant={alertVariant(alert)}>{alertLevelLabel(alert.level)}</Badge>
                  </div>
                  <p className="mt-2 text-xs leading-6 text-muted-foreground">{alert.reasoningFa}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-muted-foreground">
                    <Badge variant="outline">اطمینان {alert.confidence}%</Badge>
                    <Badge variant="outline">coverage {alert.dataCoveragePercent ?? "ناموجود"}%</Badge>
                    <Badge variant="outline">{alert.indicatorCount} شاخص</Badge>
                  </div>
                </div>
              ))
            ) : (
              <p className="rounded-md border bg-secondary/25 p-3 text-xs leading-6 text-muted-foreground">برای این دارایی هشدار فعال مستقیمی وجود ندارد.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <DatabaseZap className="h-4 w-4 text-primary" aria-hidden />
                شفافیت منابع
              </CardTitle>
              <CardDescription>منابع registry و سیگنال‌های واقعی که در همین خروجی دارایی مصرف شده‌اند.</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-2 md:grid-cols-2">
              {asset.sourceSignals.slice(0, 8).map((signal) => (
                <div key={signal.key} className="rounded-md border bg-secondary/25 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-black">{signal.label}</span>
                    <Badge variant={signal.quality === "live" ? "success" : signal.quality === "unavailable" ? "danger" : "warning"}>
                      {dataSourceStatusLabels[signal.quality]}
                    </Badge>
                  </div>
                  <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
                    منبع: {signal.source} · مقدار: {signal.value === null ? "ناموجود" : formatNumber(signal.value, 2)}
                  </p>
                </div>
              ))}
            </div>
            {asset.suppressedOutputs.length ? (
              <div className="rounded-md border border-amber-400/30 bg-amber-400/5 p-3">
                <div className="metric-label">خروجی‌های سرکوب‌شده برای جلوگیری از تناقض</div>
                <p className="mt-2 text-xs leading-6 text-muted-foreground">{asset.suppressedOutputs.join("، ")}</p>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
