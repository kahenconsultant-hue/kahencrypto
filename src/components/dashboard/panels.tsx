import Link from "next/link";
import {
  Activity,
  AlertOctagon,
  ArrowDownLeft,
  ArrowUpLeft,
  Braces,
  Database,
  Gauge,
  Layers3,
  RadioTower,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Waves,
} from "lucide-react";
import {
  categoryLabels,
  pricingPlans,
  usdtRiskCenter,
} from "@/lib/production-data";
import { formatCompactUsd, formatNumber, severityColor } from "@/lib/utils";
import { getDynamicCorrelationReport } from "@/server/analytics/correlation-engine";
import { getDerivedSignalReport } from "@/server/analytics/derived-signal-engine";
import { getAssetImpactProfiles } from "@/server/analytics/asset-impact-engine";
import { getLiquidityReport } from "@/server/analytics/liquidity-engine";
import { getMarketRegimeReport } from "@/server/analytics/market-regime-engine";
import { getSentimentReport } from "@/server/analytics/sentiment-engine";
import { generateSmartAlerts } from "@/server/alerts/smart-alert-engine";
import { getAiLayerStatus, getLatestEventExplanations } from "@/server/ai/event-explanation-layer";
import { getRefreshHealth, getSignalSnapshot, minutesSinceEngineUpdate, REFRESH_INTERVAL_MINUTES } from "@/server/analytics/market-signals";
import { getIntelligenceReliabilityReportSync } from "@/server/intelligence/reliability-engine";
import { productionSources, summarizeSources } from "@/collectors/registry";
import { getIngestionFoundationStatusSync } from "@/health/source-health";
import { getLatestRawEventsSync } from "@/storage/ingestion-store";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataSourceBadge } from "@/components/ui/data-source-badge";
import { Metric } from "@/components/ui/metric";
import { Progress } from "@/components/ui/progress";
import { dataSourceStatusLabels, moduleDataSourceStatus } from "@/lib/data-source-status";

function alertVariant(level: string): "danger" | "warning" | "default" | "muted" {
  if (level === "Critical") return "danger";
  if (level === "Important") return "warning";
  if (level === "Watch") return "default";
  return "muted";
}

function correlationCell(value: number | null) {
  if (value === null) return "bg-muted/40 text-muted-foreground";
  if (value >= 0.65) return "bg-emerald-500/45 text-emerald-50";
  if (value >= 0.45) return "bg-emerald-500/30 text-emerald-100";
  if (value <= -0.55) return "bg-red-500/45 text-red-50";
  if (value <= -0.35) return "bg-red-500/30 text-red-100";
  return "bg-muted/60 text-muted-foreground";
}

function matrixAssetLabel(asset: string) {
  const labels: Record<string, string> = {
    Nasdaq: "NDX",
    US10Y: "U10Y",
    "Stablecoin dominance": "Stbl",
  };

  return labels[asset] ?? asset;
}

function LastUpdated({ minutes = minutesSinceEngineUpdate() }: { minutes?: number }) {
  const health = getRefreshHealth();
  const effectiveMinutes = health.ageMinutes ?? minutes;
  return (
    <span className={health.failedRefresh ? "text-[11px] text-red-200" : "text-[11px] text-muted-foreground"}>
      آخرین بروزرسانی: {effectiveMinutes} دقیقه پیش · refresh هر {REFRESH_INTERVAL_MINUTES} دقیقه
      {health.warning ? ` · هشدار: ${health.warning}` : ""}
    </span>
  );
}

function reliabilityVariant(status: string): "success" | "warning" | "danger" {
  if (status === "healthy") return "success";
  if (status === "degraded") return "warning";
  return "danger";
}

const coverageLabels: Record<string, string> = {
  macro: "ماکرو",
  crypto: "کریپتو",
  liquidity: "نقدینگی",
  derivatives: "مشتقات",
  sentiment: "سنتیمنت",
  geopolitical: "ژئوپلیتیک",
};

function signedScoreColor(score: number) {
  if (score >= 30) return "text-emerald-300";
  if (score <= -30) return "text-red-300";
  return "text-amber-300";
}

function biasVariant(bias?: string): "success" | "warning" | "danger" | "muted" | "default" {
  if (bias === "bullish") return "success";
  if (bias === "bearish") return "danger";
  if (bias === "mixed") return "warning";
  if (bias === "neutral") return "muted";
  return "default";
}

function qualityVariant(status: string): "success" | "warning" | "danger" | "muted" {
  if (status === "live") return "success";
  if (status === "partial_live" || status === "delayed" || status === "estimated") return "warning";
  if (status === "unavailable") return "danger";
  return "muted";
}

const biasLabels: Record<string, string> = {
  bullish: "مثبت",
  bearish: "منفی",
  neutral: "خنثی",
  mixed: "دوگانه",
};

const timeframeLabels: Record<string, string> = {
  intraday: "درون‌روزی",
  "24h": "۲۴ ساعت",
  "3d": "۳ روز",
  "7d": "۷ روز",
};

const alertLevelLabels: Record<string, string> = {
  Critical: "بحرانی",
  Important: "مهم",
  Watch: "رصد",
  Info: "اطلاعی",
};

const conditionLabels: Record<string, string> = {
  Expanding: "در حال گسترش",
  Contracting: "در حال انقباض",
  Neutral: "خنثی",
  Stress: "زیر فشار",
  Unclear: "نامشخص",
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

const channelLabels: Record<string, string> = {
  liquidity: "نقدینگی",
  rates: "نرخ بهره",
  dollar: "شاخص دلار",
  risk_on_risk_off: "ریسک‌پذیری/ریسک‌گریزی",
  etf_flows: "جریان ETF",
  stablecoin_flows: "جریان استیبل‌کوین",
  onchain_activity: "آن‌چین",
  geopolitical_risk: "ژئوپلیتیک",
  regulatory_risk: "رگولاتوری",
  sentiment_news_shock: "شوک خبری/سنتیمنت",
  correlation_breakdown: "شکست همبستگی",
  leverage: "اهرم معاملاتی",
};

const correlationStateLabels: Record<string, string> = {
  strongly_correlated: "همبستگی قوی",
  weakening: "در حال تضعیف",
  decoupling: "واگرایی",
  inverse_correlation: "همبستگی معکوس",
  unstable: "ناپایدار",
};

const sentimentCategoryLabels: Record<string, string> = {
  macro: "کلان",
  "monetary policy": "سیاست پولی",
  regulation: "رگولاتوری",
  "ETF flows": "جریان ETF",
  "exchange risk": "ریسک صرافی",
  "stablecoin risk": "ریسک استیبل‌کوین",
  geopolitics: "ژئوپلیتیک",
  energy: "انرژی",
  "cyber/security": "امنیت سایبری",
  "institutional adoption": "پذیرش نهادی",
  "liquidation/leverage": "لیکوییدیشن/اهرم",
  "on-chain whale movement": "نهنگ و آن‌چین",
};

const moduleLabels: Record<string, string> = {
  marketRegime: "رژیم بازار",
  topAlerts: "هشدارهای برتر",
  macroSummary: "خلاصه کلان",
  btcIntelligence: "هوش BTC",
  ethIntelligence: "هوش ETH",
  solIntelligence: "هوش SOL",
  usdtRisk: "ریسک USDT",
  etfFlows: "جریان ETF",
  liquidity: "نقدینگی",
  correlations: "همبستگی",
  sentiment: "سنتیمنت",
  geopoliticalRisk: "ژئوپلیتیک",
  latestNews: "خوراک خبر",
  ingestionHealth: "سلامت جمع‌آوری",
  dataQuality: "کیفیت داده",
  derivedSignals: "سیگنال‌های مشتق‌شده",
  watchlistPlans: "واچ‌لیست و پلن‌ها",
  apiFirst: "API و وردپرس",
};

const outputSourceTypeLabels: Record<string, string> = {
  direct: "داده مستقیم",
  derived: "مشتق‌شده",
  proxy: "پروکسی",
  unavailable: "ناموجود",
};

function labelOrRaw(map: Record<string, string>, value?: string | null) {
  if (!value) return "ناموجود";
  return map[value] ?? value;
}

function formatSignedScore(score: number) {
  return `${score > 0 ? "+" : ""}${formatNumber(score, 0)}`;
}

function formatSignalPercent(value: number | null | undefined, digits = 2) {
  if (typeof value !== "number") return "ناموجود";
  return `${value > 0 ? "+" : ""}${formatNumber(value, digits)}٪`;
}

function formatNullableCorrelation(value: number | null | undefined, compact = false) {
  return typeof value === "number" ? value.toFixed(2) : compact ? "—" : "نمونه ناکافی";
}

export function ReliabilityStatusPanel() {
  const reliability = getIntelligenceReliabilityReportSync();
  const coverageRows = Object.entries(reliability.coverage);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <RadioTower className="h-4 w-4 text-primary" aria-hidden />
            قابلیت اتکای هوش بازار
          </CardTitle>
          <CardDescription>پوشش داده، سلامت منابع، تازگی سیگنال‌ها و سقف confidence برای هر لایه تحلیلی. اگر داده کافی نباشد، سیستم خروجی ساختگی تولید نمی‌کند.</CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={reliabilityVariant(reliability.overallStatus)}>
            Core {Math.round(reliability.coreReliability * 100)}%
          </Badge>
          <Badge variant="outline">
            Tier 1: {reliability.criticalSourcesOnline}/{reliability.criticalSourcesTotal}
          </Badge>
          <Badge variant={reliability.premiumCoverage >= 0.35 ? "success" : "warning"}>Premium {Math.round(reliability.premiumCoverage * 100)}%</Badge>
          <Badge variant="outline">{reliability.analysisMode}</Badge>
          <Badge variant={reliability.failedSources ? "warning" : "success"}>{reliability.failedSources} منبع ناموفق</Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {coverageRows.map(([dimension, row]) => (
            <div key={dimension} className="rounded-md border bg-secondary/25 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold">{coverageLabels[dimension] ?? dimension}</span>
                <Badge variant={reliabilityVariant(row.status)}>{Math.round(row.score * 100)}%</Badge>
              </div>
              <Progress value={Math.round(row.score * 100)} className="mt-3" />
              <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
                منابع {row.onlineSources}/{row.totalSources} · سیگنال {row.availableSignals}/{row.requiredSignals} · freshness {Math.round(row.freshness * 100)}%
              </p>
              {row.missingSignals.length ? (
                <p className="mt-1 text-[11px] leading-5 text-amber-200">ناموجود: {row.missingSignals.slice(0, 3).join("، ")}</p>
              ) : null}
            </div>
          ))}
        </div>
        <div className="space-y-3">
          <div className="rounded-md border bg-secondary/25 p-3">
            <div className="metric-label">ماژول‌های core فعال</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {reliability.availableCoreModules.length ? reliability.availableCoreModules.map((module) => (
                <Badge key={module} variant="success">{module}</Badge>
              )) : <Badge variant="danger">core ناموجود</Badge>}
            </div>
          </div>
          <div className="rounded-md border bg-secondary/25 p-3">
            <div className="metric-label">پوشش پریمیوم</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {reliability.disabledPremiumModules.length ? reliability.disabledPremiumModules.slice(0, 8).map((module) => (
                <Badge key={module} variant="warning">{module}</Badge>
              )) : <Badge variant="success">پوشش enrichment فعال</Badge>}
            </div>
          </div>
          <div className="rounded-md border bg-secondary/25 p-3">
            <div className="metric-label">ماژول‌های محدودشده</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {reliability.degradedModules.length ? reliability.degradedModules.slice(0, 10).map((module) => (
                <Badge key={module} variant="warning">{module}</Badge>
              )) : <Badge variant="success">ماژول محدودشده ندارد</Badge>}
            </div>
          </div>
          <div className="rounded-md border bg-secondary/25 p-3">
            <div className="metric-label">سقف confidence</div>
            <div className="mt-2 grid gap-2 md:grid-cols-3">
              {Object.entries(reliability.confidenceCaps).map(([name, cap]) => (
                <div key={name} className="rounded-sm border bg-card/45 p-2 text-xs">
                  <div className="text-muted-foreground">{name}</div>
                  <div className="mt-1 text-lg font-semibold number-tabular">{cap}%</div>
                </div>
              ))}
            </div>
          </div>
          {reliability.warningsFa.length ? (
            <div className="space-y-2">
              {reliability.warningsFa.slice(0, 4).map((warning) => (
                <p key={warning} className="rounded-sm border border-amber-400/25 bg-amber-400/10 p-2 text-[11px] leading-5 text-amber-100">
                  {warning}
                </p>
              ))}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

export function DerivedSignalsPanel() {
  const report = getDerivedSignalReport();
  const signalLabels: Record<string, string> = {
    macro_pressure_proxy: "فشار کلان",
    crypto_liquidity_proxy: "نقدینگی کریپتو",
    leverage_stress_proxy: "فشار اهرمی",
    institutional_risk_appetite_proxy: "اشتیاق ریسک نهادی",
    volatility_regime_proxy: "رژیم نوسان",
    stablecoin_liquidity_signal: "نقدینگی استیبل‌کوین",
  };

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" aria-hidden />
            سیگنال‌های مشتق‌شده از داده‌های رایگان
          </CardTitle>
          <CardDescription>این بخش خروجی مستقیم نهادی نیست؛ سیگنال‌ها از داده‌های رایگان، RSS، Binance، DefiLlama و proxyهای ماکرو ساخته می‌شوند و محدودیت‌ها شفاف نمایش داده می‌شود.</CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DataSourceBadge status={moduleDataSourceStatus.derivedSignals} />
          <Badge variant="outline">{report.signals.length} سیگنال</Badge>
          <Badge variant="warning">{outputSourceTypeLabels[report.regimeInput.sourceType]}</Badge>
          <LastUpdated />
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {report.signals.map((signal) => (
          <div key={signal.signalKey} className="rounded-md border bg-secondary/30 p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-sm font-black">{signalLabels[signal.signalKey] ?? signal.labelFa}</div>
                <div className="mt-1 text-[11px] text-muted-foreground">{signal.timeHorizon}</div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Badge variant={signal.sourceType === "proxy" || signal.sourceType === "derived" ? "warning" : signal.sourceType === "direct" ? "success" : "danger"}>
                  {outputSourceTypeLabels[signal.sourceType]}
                </Badge>
                <Badge variant="outline" className={typeof signal.score === "number" ? signedScoreColor(signal.score) : "text-muted-foreground"}>
                  {typeof signal.score === "number" ? formatSignedScore(signal.score) : "ناموجود"}
                </Badge>
              </div>
            </div>
            <p className="mt-3 text-xs leading-6 text-muted-foreground">{signal.explanationFa}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {signal.affectedAssets.slice(0, 5).map((asset) => (
                <Badge key={asset} variant="muted">{asset}</Badge>
              ))}
            </div>
            <div className="mt-3 rounded-sm border bg-card/55 p-2 text-[11px] leading-5 text-muted-foreground">
              اطمینان: {signal.confidence ?? "ناموجود"} · کیفیت: {dataSourceStatusLabels[signal.quality]} · ورودی‌ها: {signal.usedInputs.length}/{signal.usedInputs.length + signal.missingInputs.length}
            </div>
            {signal.missingInputs.length ? (
              <p className="mt-2 text-[11px] leading-5 text-amber-200">ناموجود: {signal.missingInputs.slice(0, 4).join("، ")}</p>
            ) : null}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function MarketRegimePanel() {
  const marketRegime = getMarketRegimeReport();
  const confidenceText = marketRegime.confidenceDetail?.available ? `${marketRegime.confidence}%` : "ناموجود";

  return (
    <Card className="overflow-hidden">
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <Gauge className="h-4 w-4 text-primary" aria-hidden />
            رژیم بازار
          </CardTitle>
          <CardDescription>تشخیص رژیم بازار بر اساس شاخص دلار، بازده اوراق ۱۰ ساله، جریان ETF، عرضه استیبل‌کوین، اهرم معاملاتی و فشار تیترهای خبری.</CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DataSourceBadge status={moduleDataSourceStatus.marketRegime} />
          <Badge variant="warning">{labelOrRaw(regimeLabels, marketRegime.regimeLabel ?? marketRegime.active)}</Badge>
          <LastUpdated />
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-4xl font-semibold text-primary number-tabular">{confidenceText}</div>
            <div className="max-w-3xl text-sm leading-7 text-muted-foreground">{marketRegime.interpretationFa}</div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <Metric label="Risk (ریسک)" value={`${marketRegime.riskScore}/100`} tone="warn" progress={marketRegime.riskScore} />
            <Metric label="Liquidity (نقدینگی)" value={`${marketRegime.liquidityScore}/100`} tone="neutral" progress={marketRegime.liquidityScore} />
            <Metric label="Leverage (اهرم معاملاتی)" value={`${marketRegime.leverageScore}/100`} tone="warn" progress={marketRegime.leverageScore} />
            <Metric label="Macro (کلان)" value={`${marketRegime.stressScore}/100`} tone="neutral" progress={marketRegime.stressScore} />
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-md border bg-secondary/25 p-3">
              <div className="metric-label">تغییر رژیم در ۲۴ ساعت</div>
              <div className="mt-2 text-sm font-black">{marketRegime.changedLast24h ? "تغییر رژیم ثبت شده" : "بدون تغییر قطعی"}</div>
              <p className="mt-2 text-xs leading-6 text-muted-foreground">
                رژیم قبلی: {labelOrRaw(regimeLabels, marketRegime.previousRegimeLabel ?? marketRegime.previousRegime)}
              </p>
            </div>
            <div className="rounded-md border bg-secondary/25 p-3">
              <div className="metric-label">احتمال تغییر رژیم</div>
              <div className="mt-2 text-sm font-semibold number-tabular">{marketRegime.transitionProbability}%</div>
              <p className="mt-2 text-xs leading-6 text-muted-foreground">{marketRegime.engine.transitionAnalysis?.explanation ?? "احتمال تغییر مسیر فقط وقتی بالا می‌رود که محرک‌های ماکرو و نقدینگی هم‌جهت شوند."}</p>
            </div>
            <div className="rounded-md border bg-secondary/25 p-3">
              <div className="metric-label">امتیاز خام / پس از جریمه</div>
              <p className="mt-2 text-xs leading-6 text-muted-foreground">
                خام {marketRegime.engine.rawRegimeScore ?? 0}، نهایی {marketRegime.engine.finalRegimeScore ?? 0}، nuance: {marketRegime.engine.regimeNuance ?? "conflicting"}
              </p>
            </div>
          </div>
        </div>
        <div className="rounded-md border bg-secondary/35 p-3">
          <div className="metric-label">سناریوی ابطال</div>
          <p className="mt-2 text-xs leading-7 text-muted-foreground">{marketRegime.invalidationFa}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {marketRegime.affectedAssets.map((asset) => (
              <Badge key={asset} variant="outline">
                {asset}
              </Badge>
            ))}
          </div>
          <div className="mt-3 space-y-2">
            {marketRegime.engine.penalties ? (
              <p className="text-[11px] leading-5 text-amber-200">
                جریمه‌ها: تضاد {marketRegime.engine.penalties.contradictionPenalty} · نقدینگی {marketRegime.engine.penalties.liquidityPenalty} · اهرم {marketRegime.engine.penalties.leveragePenalty} · کیفیت داده {marketRegime.engine.penalties.dataQualityPenalty}
              </p>
            ) : null}
            {marketRegime.engine.keyDrivers.slice(0, 3).map((driver) => (
              <p key={driver} className="text-[11px] leading-5 text-muted-foreground">
                {driver}
              </p>
            ))}
            {(marketRegime.invalidationSignals ?? []).map((signal) => (
              <p key={signal} className="text-[11px] leading-5 text-amber-200">
                ابطال: {signal}
              </p>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function TopAlertsPanel() {
  const alerts = generateSmartAlerts().sort((left, right) => right.importance - left.importance).slice(0, 15);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <AlertOctagon className="h-4 w-4 text-amber-300" aria-hidden />
            هشدارهای اصلی
          </CardTitle>
          <CardDescription>هشدارهای سناریومحور؛ هیچ‌کدام سیگنال خرید/فروش نیستند.</CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DataSourceBadge status={moduleDataSourceStatus.topAlerts} />
          <Badge variant="outline">{alerts.length} هشدار فعال</Badge>
          <LastUpdated />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {alerts.map((alert) => (
          <div key={alert.id} className={`rounded-md border p-3 ${severityColor(alert.level)}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-black">{alert.titleFa}</div>
              <div className="flex flex-wrap items-center gap-2">
                {alert.direction ? <Badge variant={biasVariant(alert.direction)}>{labelOrRaw(biasLabels, alert.direction)}</Badge> : null}
                {alert.timeframe ? <Badge variant="outline">{labelOrRaw(timeframeLabels, alert.timeframe)}</Badge> : null}
                <Badge variant="outline">اهمیت {alert.importance}</Badge>
                <Badge variant={alertVariant(alert.level)}>{labelOrRaw(alertLevelLabels, alert.level)}</Badge>
                {typeof alert.trapRisk === "number" ? <Badge variant="danger">Trap risk {alert.trapRisk}%</Badge> : null}
              </div>
            </div>
            <p className="mt-2 text-xs leading-6 opacity-90">{alert.reasoningFa}</p>
            <div className="mt-3 grid gap-2 xl:grid-cols-2">
              <div className="rounded-sm border border-white/10 bg-black/10 p-2">
                <div className="metric-label">چه چیزی تغییر کرده؟</div>
                <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{alert.triggerCondition ?? alert.whyItMattersFa}</p>
              </div>
              <div className="rounded-sm border border-white/10 bg-black/10 p-2">
                <div className="metric-label">زنجیره علت و اثر</div>
                <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{alert.causalChain ?? alert.whyItMattersFa}</p>
              </div>
              <div className="rounded-sm border border-white/10 bg-black/10 p-2">
                <div className="metric-label">شرط ابطال</div>
                <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{alert.invalidationCondition ?? alert.scenarioFa}</p>
              </div>
              <div className="rounded-sm border border-white/10 bg-black/10 p-2">
                <div className="metric-label">برداشت عملی معامله‌گر</div>
                <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{alert.suggestedTraderAction ?? alert.whyItMattersFa}</p>
              </div>
            </div>
            {alert.evidence?.length ? (
              <div className="mt-3 flex flex-wrap gap-2">
                {alert.evidence.slice(0, 3).map((item) => (
                  <Badge key={item} variant="outline" className="h-auto whitespace-normal py-1 leading-5">
                    {item}
                  </Badge>
                ))}
              </div>
            ) : null}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold">رمزارزهای تحت تأثیر:</span>
              {alert.affectedAssets.map((asset) => (
                <Badge key={asset} variant="outline">
                  {asset}
                </Badge>
              ))}
              <span className="text-[11px] text-muted-foreground">اطمینان {alert.confidence}%</span>
              {typeof alert.scenarioProbability === "number" ? <span className="text-[11px] text-muted-foreground">احتمال سناریو {alert.scenarioProbability}%</span> : null}
              {typeof alert.exhaustionProbability === "number" ? <span className="text-[11px] text-muted-foreground">احتمال فرسودگی {alert.exhaustionProbability}%</span> : null}
              <Badge variant="muted">{dataSourceStatusLabels[alert.dataQuality]}</Badge>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function MacroSummaryPanel() {
  const snapshot = getSignalSnapshot();
  const byKey = snapshot.byKey;

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" aria-hidden />
            خلاصه کلان بازار
          </CardTitle>
          <CardDescription>خلاصه کلان با تمرکز روی هزینه سرمایه، شاخص دلار، بازده اوراق و وضعیت نقدینگی جهانی.</CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DataSourceBadge status={moduleDataSourceStatus.macroSummary} />
          <LastUpdated />
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Metric label="DXY (شاخص دلار)" value={formatSignalPercent(byKey.dxy_trend_24h?.value)} tone={(byKey.dxy_trend_24h?.value ?? 0) > 0 ? "warn" : "good"} detail={byKey.dxy_trend_24h?.source ?? "منبع در دسترس نیست."} />
        <Metric label="US10Y (بازده اوراق)" value={formatSignalPercent(byKey.us10y_trend_24h?.value)} tone={(byKey.us10y_trend_24h?.value ?? 0) > 0 ? "warn" : "good"} detail={byKey.us10y_trend_24h?.source ?? "منبع در دسترس نیست."} />
        <Metric label="Gold (طلا)" value={formatSignalPercent(byKey.gold_trend_24h?.value)} tone={(byKey.gold_trend_24h?.value ?? 0) > 0 ? "neutral" : "warn"} detail={byKey.gold_trend_24h?.source ?? "منبع در دسترس نیست."} />
        <Metric label="Nasdaq (نزدک)" value={formatSignalPercent(byKey.nasdaq_trend_24h?.value)} tone={(byKey.nasdaq_trend_24h?.value ?? 0) > 0 ? "good" : "warn"} detail={byKey.nasdaq_trend_24h?.source ?? "منبع در دسترس نیست."} />
      </CardContent>
    </Card>
  );
}

export function AssetIntelligenceGrid() {
  const profiles = getAssetImpactProfiles();

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>نقشه اثر دارایی‌ها</CardTitle>
          <CardDescription>نقشه جهت‌دار دارایی‌ها برای افق یک هفته، بر اساس رژیم بازار، نقدینگی، همبستگی، سنتیمنت بازار و جریان سرمایه.</CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DataSourceBadge status={moduleDataSourceStatus.btcIntelligence} />
          <LastUpdated />
        </div>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {profiles.map((profile) => {
          const key = profile.asset.toLowerCase();
          return (
          <Link key={key} href={`/assets/${key}`} className="min-w-0 rounded-md border bg-secondary/35 p-3 transition-colors hover:border-primary/50">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-xl font-black">{profile.asset}</div>
                <div className="text-xs leading-5 text-muted-foreground">اثر جهت‌دار در افق یک هفته</div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <Badge variant={biasVariant(profile.directionalBias)}>{labelOrRaw(biasLabels, profile.directionalBias)}</Badge>
                <Badge variant="outline" className={profile.confidence.available ? signedScoreColor(profile.impactScore) : "text-muted-foreground"}>
                  {profile.confidence.available ? `اثر ${formatSignedScore(profile.impactScore)}` : "اثر ناموجود"}
                </Badge>
              </div>
            </div>
            <p className="mt-3 line-clamp-5 text-xs leading-6 text-muted-foreground">{profile.confidence.available ? profile.traderInterpretation : "داده کافی برای تحلیل معتبر وجود ندارد؛ نقشه اثر فقط پس از فعال بودن حداقل چهار گروه سیگنال مستقل نمایش داده می‌شود."}</p>
            <div className="mt-3 space-y-2">
              <div className="flex flex-wrap gap-1.5">
                {profile.transmissionChannels.slice(0, 3).map((channel) => (
                  <Badge key={channel} variant="muted">
                    {labelOrRaw(channelLabels, channel)}
                  </Badge>
                ))}
              </div>
              <div className="rounded-sm border bg-card/55 p-2 text-[11px] leading-5 text-muted-foreground">
                {profile.confidence.available ? `اطمینان ${profile.confidence.score}% · ${profile.confidence.availableGroups.length} گروه سیگنال` : profile.confidence.explanation}
              </div>
              <div className="text-[11px] leading-5 text-muted-foreground">ابطال: {profile.invalidationCondition}</div>
            </div>
          </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}

export function LiquidityPanel() {
  const liquidityEngine = getLiquidityReport();

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <Waves className="h-4 w-4 text-cyan-300" aria-hidden />
            داشبورد نقدینگی
          </CardTitle>
          <CardDescription>ترازنامه فدرال رزرو، ریورس‌ریپو، حساب خزانه آمریکا، شاخص دلار، بازده اوراق، عرضه استیبل‌کوین، جریان ETF و ذخایر صرافی‌ها.</CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DataSourceBadge status={moduleDataSourceStatus.liquidity} />
          <Badge variant="outline">{labelOrRaw(conditionLabels, liquidityEngine.condition)}</Badge>
          {liquidityEngine.v2State ? <Badge variant="warning">{liquidityEngine.v2State.replaceAll("_", " ")}</Badge> : null}
          <LastUpdated />
          <div className={`text-2xl font-semibold number-tabular ${signedScoreColor(liquidityEngine.liquidityScoreSigned)}`}>{formatSignedScore(liquidityEngine.liquidityScoreSigned)}</div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm leading-7 text-muted-foreground">{liquidityEngine.explanation}</p>
        <p className="mt-2 text-xs leading-6 text-muted-foreground">{liquidityEngine.historicalComparison}</p>
        <div className="mt-3 rounded-md border bg-secondary/25 p-3 text-xs leading-6 text-muted-foreground">
          {liquidityEngine.formula}
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          <Metric label="نقدینگی کلان" value={formatSignedScore(liquidityEngine.macroLiquidityScore)} tone={liquidityEngine.macroLiquidityScore >= 0 ? "good" : "bad"} />
          <Metric label="نقدینگی کریپتو" value={formatSignedScore(liquidityEngine.cryptoLiquidityScore)} tone={liquidityEngine.cryptoLiquidityScore >= 0 ? "good" : "bad"} />
          <Metric label="نقدینگی اسپات واقعی" value={formatSignedScore(liquidityEngine.realSpotLiquidityScore ?? 0)} tone={(liquidityEngine.realSpotLiquidityScore ?? 0) >= 0 ? "good" : "bad"} />
          <Metric label="نقدینگی اهرمی" value={`${liquidityEngine.leveragedLiquidityScore ?? 0}/100`} tone={(liquidityEngine.leveragedLiquidityScore ?? 0) >= 70 ? "warn" : "neutral"} progress={liquidityEngine.leveragedLiquidityScore ?? 0} />
          <Metric label="پایداری نقدینگی" value={`${liquidityEngine.liquiditySustainabilityScore ?? 0}/100`} tone={(liquidityEngine.liquiditySustainabilityScore ?? 0) >= 58 ? "good" : "warn"} progress={liquidityEngine.liquiditySustainabilityScore ?? 0} />
          <Metric label="جریان نهادی" value={`${liquidityEngine.institutionalFlow}/100`} tone={liquidityEngine.institutionalFlow >= 55 ? "good" : "warn"} progress={liquidityEngine.institutionalFlow} />
          <Metric label="رشد استیبل‌کوین" value={`${liquidityEngine.stablecoinExpansion}/100`} tone={liquidityEngine.stablecoinExpansion >= 55 ? "good" : "neutral"} progress={liquidityEngine.stablecoinExpansion} />
          <Metric label="حرارت سفته‌بازی" value={`${liquidityEngine.speculativeHeat}/100`} tone={liquidityEngine.speculativeHeat >= 70 ? "warn" : "neutral"} progress={liquidityEngine.speculativeHeat} />
          <Metric label="استیبل‌کوین (Stablecoin)" value={labelOrRaw(biasLabels, liquidityEngine.stablecoinTrend)} tone={liquidityEngine.stablecoinTrend === "bullish" ? "good" : "neutral"} progress={liquidityEngine.stablecoinExpansion} />
          <Metric label="جریان ETF" value={labelOrRaw(biasLabels, liquidityEngine.etfFlowStatus)} tone={liquidityEngine.etfFlowStatus === "bearish" ? "bad" : "good"} progress={liquidityEngine.institutionalFlow} />
          <Metric label="فشار اهرم معاملاتی" value={`${liquidityEngine.leverageStress}/100`} tone="warn" progress={liquidityEngine.leverageStress} />
        </div>
        {liquidityEngine.decomposition?.length ? (
          <div className="mt-4 grid gap-2 md:grid-cols-2">
            {liquidityEngine.decomposition.map((item) => (
              <div key={item} className="rounded-sm border bg-secondary/25 p-2 text-[11px] leading-5 text-muted-foreground">
                {item}
              </div>
            ))}
          </div>
        ) : null}
        {liquidityEngine.warnings?.length ? (
          <div className="mt-3 space-y-2">
            {liquidityEngine.warnings.map((warning) => (
              <p key={warning} className="rounded-sm border border-amber-400/25 bg-amber-400/10 p-2 text-[11px] leading-5 text-amber-100">
                {warning}
              </p>
            ))}
          </div>
        ) : null}
        <p className="mt-3 text-[11px] leading-5 text-muted-foreground">
          {liquidityEngine.confidenceDetail?.available ? `اطمینان ${liquidityEngine.confidenceDetail.score}% · ${liquidityEngine.confidenceDetail.formula}` : liquidityEngine.confidenceDetail?.explanation}
        </p>
      </CardContent>
    </Card>
  );
}

export function CorrelationMapPanel() {
  const report = getDynamicCorrelationReport();
  const matrixAssets = report.matrix.map((row) => row.asset);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>نقشه همبستگی</CardTitle>
          <CardDescription>همبستگی پویا در پنجره‌های ۷، ۳۰ و ۹۰ روزه، همراه با تشخیص واگرایی، همبستگی معکوس و تغییر روایت پوشش ریسک.</CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DataSourceBadge status={moduleDataSourceStatus.correlations} />
          <Badge variant="outline">موتور پویا</Badge>
          <LastUpdated />
        </div>
      </CardHeader>
      <CardContent className="grid min-w-0 gap-4 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {report.dataQuality === "unavailable" ? (
          <div className="rounded-md border bg-secondary/25 p-4 text-sm leading-7 text-muted-foreground 2xl:col-span-2">داده کافی برای تحلیل معتبر وجود ندارد. برای فعال شدن ماتریس، حداقل خوراک قیمت BTC، ETH، SOL و محرک‌های ماکرو باید در cache سی‌دقیقه‌ای ثبت شود.</div>
        ) : (
        <div className="w-full min-w-0 overflow-hidden rounded-md border" dir="ltr">
          <table className="w-full table-fixed border-separate border-spacing-0 text-left text-[9px] sm:text-xs">
            <thead className="bg-muted/50">
              <tr>
                <th className="w-[72px] bg-muted px-2 py-2 text-left sm:w-24">دارایی</th>
                {matrixAssets.map((asset) => (
                  <th key={asset} className="px-0.5 py-2 text-center">
                    {matrixAssetLabel(asset)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {report.matrix.map((row) => (
                <tr key={row.asset} className="border-t">
                  <td className="border-t bg-card px-2 py-2 font-bold leading-4">{matrixAssetLabel(row.asset)}</td>
                  {row.values.map((value, index) => (
                    <td key={`${row.asset}-${matrixAssets[index]}`} className="border-t px-0.5 py-1 text-center">
                      <span className={`mx-auto inline-flex h-6 w-full max-w-[31px] items-center justify-center rounded-sm number-tabular ${correlationCell(value)}`}>
                        {formatNullableCorrelation(value, true)}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        )}
        <div className="space-y-2">
          {report.pairs.map((pair) => (
            <div key={pair.id} className="rounded-md border bg-secondary/30 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="font-black">{pair.pair}</div>
                <Badge variant={pair.regimeState === "unstable" || pair.regimeState === "decoupling" || pair.regimeState === "inverse_correlation" ? "warning" : "muted"}>
                  {labelOrRaw(correlationStateLabels, pair.regimeState)}
                </Badge>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs md:grid-cols-5">
                <span>24H: {formatNullableCorrelation(pair.rolling24h)}</span>
                <span>7D: {formatNullableCorrelation(pair.rolling7d)}</span>
                <span>30D: {formatNullableCorrelation(pair.rolling30d)}</span>
                <span>90D: {formatNullableCorrelation(pair.rolling90d)}</span>
                <span>
                  {(pair.change7d ?? 0) > 0 ? <ArrowUpLeft className="inline h-3 w-3" /> : <ArrowDownLeft className="inline h-3 w-3" />} {formatNullableCorrelation(pair.change7d)}
                </span>
              </div>
              {pair.sampleWarning ? <p className="mt-2 text-[11px] leading-5 text-amber-200">نمونه ناکافی: {pair.sampleWarning}</p> : null}
              <p className="mt-2 text-xs leading-6 text-muted-foreground">{pair.interpretationFa}</p>
              {pair.regimeImpact ? <p className="mt-2 text-[11px] leading-5 text-muted-foreground">اثر رژیم بازار: {pair.regimeImpact}</p> : null}
            </div>
          ))}
          <div className="grid gap-2 md:grid-cols-3">
            <div className="rounded-md border bg-secondary/25 p-3">
              <div className="metric-label">همبستگی‌های تقویت‌شده</div>
              <div className="mt-2 space-y-1 text-[11px] leading-5 text-muted-foreground">
                {report.topStrengthening.map((signal) => (
                  <p key={signal.assetPair}>{signal.assetPair}: {formatNullableCorrelation(signal.correlationChange)}</p>
                ))}
              </div>
            </div>
            <div className="rounded-md border bg-secondary/25 p-3">
              <div className="metric-label">همبستگی‌های تضعیف‌شده</div>
              <div className="mt-2 space-y-1 text-[11px] leading-5 text-muted-foreground">
                {report.topWeakening.map((signal) => (
                  <p key={signal.assetPair}>{signal.assetPair}: {formatNullableCorrelation(signal.correlationChange)}</p>
                ))}
              </div>
            </div>
            <div className="rounded-md border bg-secondary/25 p-3">
              <div className="metric-label">هشدارهای شکست همبستگی</div>
              <div className="mt-2 space-y-1 text-[11px] leading-5 text-muted-foreground">
                {report.breakdownAlerts.length ? report.breakdownAlerts.slice(0, 3).map((alert) => <p key={alert.pair}>{alert.pair}: {alert.traderInterpretation}</p>) : <p>داده کافی برای تحلیل معتبر وجود ندارد</p>}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function EtfFlowsPanel() {
  const snapshot = getSignalSnapshot();
  const rows = [
    { issuer: "BTC ETF basket", signal: snapshot.byKey.btc_etf_flow_24h },
    { issuer: "ETH ETF basket", signal: snapshot.byKey.eth_etf_flow_24h },
  ];

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>جریان ETF</CardTitle>
          <CardDescription>جریان صندوق‌های قابل معامله (ETF) با وضعیت «با تأخیر» برای خوراک صادرکننده‌ها و خروجی آماده API.</CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DataSourceBadge status={moduleDataSourceStatus.etfFlows} />
          <LastUpdated />
        </div>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b">
              <th className="py-2 text-right">صادرکننده</th>
              <th className="py-2 text-right">Net Flow (جریان خالص)</th>
              <th className="py-2 text-right">روند</th>
              <th className="py-2 text-right">اطمینان</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.issuer} className="border-b last:border-0">
                <td className="py-3 font-bold">{row.issuer}</td>
                <td className={(row.signal?.value ?? 0) >= 0 ? "py-3 text-emerald-300" : "py-3 text-red-300"}>{typeof row.signal?.value === "number" ? formatCompactUsd(row.signal.value) : "ناموجود"}</td>
                <td className="py-3">{typeof row.signal?.value === "number" ? (row.signal.value >= 0 ? "ورود سرمایه" : "خروج سرمایه") : "داده کافی وجود ندارد"}</td>
                <td className="py-3">
                  <div className="flex items-center gap-2">
                    <Progress value={row.signal?.reliability ?? 0} className="w-24" />
                    <span className="number-tabular">{row.signal?.reliability ?? 0}%</span>
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">{row.signal?.source ?? "برای live شدن، env یا crawler ETF لازم است."}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

export function SentimentPanel() {
  const sentiment = getSentimentReport();

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>داشبورد سنتیمنت بازار</CardTitle>
          <CardDescription>سنتیمنت بازار بر اساس اعتبار منبع، تازگی خبر، واکنش قیمت، ارتباط با دارایی و میزان قیمت‌گذاری‌شدن خبر محاسبه می‌شود.</CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DataSourceBadge status={moduleDataSourceStatus.sentiment} />
          <Badge variant={sentiment.sentimentScore < -10 ? "danger" : sentiment.sentimentScore > 10 ? "success" : "warning"}>
            امتیاز {formatSignedScore(sentiment.sentimentScore)}
          </Badge>
          <LastUpdated />
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm leading-7 text-muted-foreground">{sentiment.whatChanged}</p>
        <p className="mt-2 text-xs leading-6 text-muted-foreground">{sentiment.divergence}</p>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          <Metric label="مثبت" value={`${sentiment.split.positive}`} tone="good" />
          <Metric label="منفی" value={`${sentiment.split.negative}`} tone="bad" />
          <Metric label="خنثی" value={`${sentiment.split.neutral}`} tone="neutral" />
          <Metric
            label="اطمینان"
            value={sentiment.confidence.available ? `${sentiment.confidence.score}%` : "ناموجود"}
            tone={sentiment.confidence.available ? "neutral" : "warn"}
          />
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {sentiment.byAsset.map((entry) => (
            <div key={entry.asset} className="rounded-md border bg-secondary/30 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold">{entry.asset}</span>
                <Badge variant={entry.direction === "bullish" ? "success" : entry.direction === "bearish" ? "danger" : entry.direction === "mixed" ? "warning" : "muted"}>
                  {labelOrRaw(biasLabels, entry.direction)}
                </Badge>
              </div>
              <div className={`mt-2 text-lg font-black number-tabular ${signedScoreColor(entry.score)}`}>{formatSignedScore(entry.score)}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-3 xl:grid-cols-[0.7fr_1.3fr]">
          <div className="rounded-md border bg-secondary/25 p-3">
            <div className="metric-label">سنتیمنت بر اساس دسته</div>
            <div className="mt-3 space-y-2">
              {sentiment.byCategory.map((category) => (
                <div key={category.category} className="flex items-center justify-between gap-2 text-xs">
                  <span>{labelOrRaw(sentimentCategoryLabels, category.category)}</span>
                  <span className={`font-bold number-tabular ${signedScoreColor(category.score)}`}>{formatSignedScore(category.score)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-md border bg-secondary/25 p-3">
            <div className="metric-label">تیترهای اثرگذار</div>
            <div className="mt-3 space-y-3">
              {sentiment.highImpactHeadlines.map((headline) => (
                <div key={headline.title} className="rounded-sm border bg-card/55 p-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold">{headline.source}</span>
                    <Badge variant={headline.expectedImpactDirection === "bullish" ? "success" : headline.expectedImpactDirection === "bearish" ? "danger" : "warning"}>
                      {labelOrRaw(biasLabels, headline.expectedImpactDirection)} · {labelOrRaw(timeframeLabels, headline.expectedImpactHorizon)}
                    </Badge>
                  </div>
                  <p className="mt-2 text-xs leading-6 text-muted-foreground">{headline.title}</p>
                  <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                    کانال انتقال: {labelOrRaw(channelLabels, headline.transmissionChannel)} · شدت {headline.severity} · تازگی {headline.novelty}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function UsdtRiskPanel() {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-amber-300" aria-hidden />
            وضعیت ریسک USDT
          </CardTitle>
          <CardDescription>تفسیر شبکه‌های TRON و ERC20، ریسک مسدودسازی، ریسک تحریم، نگه‌داری دارایی، سهم بازار، ضرب/سوزاندن و پریمیوم تتر در ایران.</CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DataSourceBadge status={moduleDataSourceStatus.usdtRisk} />
          <LastUpdated />
        </div>
      </CardHeader>
      <CardContent className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-1">
          {[usdtRiskCenter.tron, usdtRiskCenter.erc20].map((network) => (
            <div key={network.title} className="rounded-md border bg-secondary/30 p-3">
              <div className="font-black">{network.title}</div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div>
                  <div className="metric-label">مزیت‌ها</div>
                  <ul className="mt-2 space-y-1 text-xs leading-6 text-emerald-200">
                    {network.strengths.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <div>
                  <div className="metric-label">ریسک‌ها</div>
                  <ul className="mt-2 space-y-1 text-xs leading-6 text-amber-200">
                    {network.risks.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="space-y-2">
          {usdtRiskCenter.faqs.map((faq) => (
            <details key={faq.q} className="rounded-md border bg-secondary/25 p-3" open={faq.q.includes("امن")}>
              <summary className="cursor-pointer text-sm font-black">{faq.q}</summary>
              <p className="mt-2 text-xs leading-6 text-muted-foreground">{faq.a}</p>
            </details>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function GeopoliticalRiskPanel() {
  const items = getLatestRawEventsSync(40).filter((item) => item.category === "geopolitics").slice(0, 4);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>ریسک ژئوپلیتیک</CardTitle>
          <CardDescription>تحریم، انرژی، نقش پناهگاه امن، ریسک نگه‌داری دارایی و تنش‌های سیاسی مؤثر بر بازار کریپتو.</CardDescription>
        </div>
        <DataSourceBadge status={moduleDataSourceStatus.geopoliticalRisk} />
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2">
        {items.length ? items.map((item) => (
          <div key={item.dedupHash} className="rounded-md border bg-secondary/30 p-3">
            <div className="flex items-center justify-between gap-2">
              <Badge variant="warning">{item.sourceName}</Badge>
              <span className="text-[11px] text-muted-foreground">{new Date(item.timestamp).toLocaleString("fa-IR")}</span>
            </div>
            <h3 className="mt-3 text-sm font-black leading-6">{item.title}</h3>
            <p className="mt-2 text-xs leading-6 text-muted-foreground">{item.content || "این رویداد خام هنوز توسط پردازش AI/translation تحلیل نشده است."}</p>
          </div>
        )) : <p className="rounded-md border bg-secondary/25 p-3 text-xs leading-6 text-muted-foreground md:col-span-2">داده کافی برای تحلیل معتبر وجود ندارد. هنوز رویداد ژئوپلیتیک واقعی از ingestion foundation ثبت نشده است.</p>}
      </CardContent>
    </Card>
  );
}

export function LatestNewsFeedPanel() {
  const events = getLatestRawEventsSync(120);
  const groups = (Object.entries(categoryLabels) as Array<[keyof typeof categoryLabels, string]>).map(([category, labelFa]) => ({
    category,
    labelFa,
    items: events.filter((event) => event.category === category),
  }));

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>خوراک آخرین اخبار</CardTitle>
          <CardDescription>برای هر دسته حداقل ۸ آیتم منتخب با اولویت اهمیت، زمان، منبع، تحلیل و اثر دارایی‌ها.</CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DataSourceBadge status={moduleDataSourceStatus.latestNews} />
          <Link href="/api/v1/news?grouped=true" className="inline-flex items-center gap-2 text-xs font-bold text-primary">
            <Braces className="h-4 w-4" aria-hidden />
            خروجی JSON
          </Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {groups.map((group, index) => (
          <details key={group.category} className="rounded-md border bg-secondary/20 p-3" open={index < 2}>
            <summary className="cursor-pointer list-none">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Layers3 className="h-4 w-4 text-primary" aria-hidden />
                  <span className="font-black">{group.labelFa}</span>
                  <Badge variant="outline">{group.items.length} آیتم</Badge>
                </div>
                <span className="text-xs text-muted-foreground">دسته: {group.labelFa}</span>
              </div>
            </summary>
            <div className="mt-3 grid gap-2 xl:grid-cols-2">
              {group.items.length ? group.items.map((item) => {
                return (
                  <div key={item.dedupHash} className="rounded-md border bg-card/65 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="muted">{item.sourceName}</Badge>
                        <Badge variant="outline">{dataSourceStatusLabels[item.quality]}</Badge>
                      </div>
                      <span className="text-[11px] text-muted-foreground">
                        {new Date(item.timestamp).toLocaleString("fa-IR")}
                      </span>
                    </div>
                    <h3 className="mt-3 text-sm font-black leading-7">{item.title}</h3>
                    <p className="mt-2 text-xs leading-6 text-muted-foreground">{item.content || "این آیتم خام هنوز پردازش، ترجمه و تحلیل اثر نشده است."}</p>
                    <div className="mt-3 rounded-sm border bg-secondary/35 p-2 text-xs leading-6">
                      <span className="font-bold text-primary">وضعیت پردازش: </span>
                      raw event ثبت شده؛ تحلیل اثر در فازهای بعدی فعال می‌شود.
                    </div>
                  </div>
                );
              }) : <p className="rounded-md border bg-card/65 p-3 text-xs leading-6 text-muted-foreground xl:col-span-2">داده کافی برای تحلیل معتبر وجود ندارد.</p>}
            </div>
          </details>
        ))}
      </CardContent>
    </Card>
  );
}

export async function AiSummariesPanel() {
  const aiStatus = getAiLayerStatus();
  const explanations = await getLatestEventExplanations(8);

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" aria-hidden />
            ترجمه و توضیح رویدادها
          </CardTitle>
          <CardDescription>لایه AI فقط روی normalized_events واقعی کار می‌کند. اگر کلید OpenAI تنظیم نشده باشد، ترجمه ساخته نمی‌شود و وضعیت به‌صورت شفاف نمایش داده می‌شود.</CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={aiStatus.enabled ? "success" : "warning"}>{aiStatus.status}</Badge>
          <Badge variant="outline">{explanations.length} رویداد اخیر</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs leading-6 text-muted-foreground">{aiStatus.messageFa}</p>
        {explanations.length ? (
          <div className="grid gap-3 xl:grid-cols-2">
            {explanations.map((event) => (
              <div key={event.eventId} className="rounded-md border bg-secondary/25 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="muted">{event.source}</Badge>
                    <Badge variant={qualityVariant(event.quality)}>{dataSourceStatusLabels[event.quality]}</Badge>
                  </div>
                  <Badge variant={biasVariant(event.expectedDirection)}>{labelOrRaw(biasLabels, event.expectedDirection)}</Badge>
                </div>
                <h3 className="mt-3 text-sm font-black leading-7">{event.translationFa ?? event.title}</h3>
                <p className="mt-2 text-xs leading-6 text-muted-foreground">{event.summaryFa ?? event.actionableExplanationFa}</p>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  <div className="rounded-sm border bg-card/45 p-2 text-[11px] leading-5 text-muted-foreground">
                    <span className="font-bold text-primary">اثر ماکرو: </span>
                    {event.macroInterpretationFa}
                  </div>
                  <div className="rounded-sm border bg-card/45 p-2 text-[11px] leading-5 text-muted-foreground">
                    <span className="font-bold text-primary">اثر کریپتو: </span>
                    {event.cryptoInterpretationFa}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge variant="outline">{labelOrRaw(channelLabels, event.transmissionChannel)}</Badge>
                  {event.affectedAssets.slice(0, 6).map((asset) => (
                    <Badge key={asset} variant="outline">{asset}</Badge>
                  ))}
                </div>
                {event.uncertaintyNotesFa.length ? (
                  <p className="mt-2 text-[11px] leading-5 text-amber-100">{event.uncertaintyNotesFa[0]}</p>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-md border bg-secondary/25 p-3 text-xs leading-6 text-muted-foreground">normalized_event معتبری برای توضیح AI وجود ندارد.</p>
        )}
      </CardContent>
    </Card>
  );
}

export function OperationsPanel() {
  const sourceSummary = summarizeSources();
  const foundation = getIngestionFoundationStatusSync();
  const healthBySource = new Map(foundation.sourceHealth.map((source) => [source.sourceId, source]));

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-4 w-4 text-primary" aria-hidden />
            جمع‌آوری داده و سلامت منابع
          </CardTitle>
          <CardDescription>جمع‌آوری از RSS و API، لایه خزنده، حذف تکراری‌ها، صف پردازش، تلاش مجدد و پایش سلامت منابع.</CardDescription>
        </div>
        <DataSourceBadge status={moduleDataSourceStatus.ingestionHealth} />
      </CardHeader>
      <CardContent className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
        <div className="grid gap-2 md:grid-cols-2">
          {sourceSummary.map((row) => (
            <div key={row.category} className="rounded-md border bg-secondary/25 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold">{row.labelFa}</span>
                <Badge variant="outline">{row.count}</Badge>
              </div>
              <div className="mt-2 text-xs text-muted-foreground">خوراک RSS {row.rss} · API {row.api} · خزنده {row.crawler}</div>
            </div>
          ))}
        </div>
        <div className="space-y-2">
          {productionSources.slice(0, 12).map((source) => {
            const health = healthBySource.get(source.id);
            const status = health?.status === "success" ? "live" : health?.status === "degraded" ? "partial_live" : health ? "unavailable" : "delayed";
            return (
            <div key={source.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-secondary/25 p-3 text-xs">
              <div>
                <div className="font-bold">{source.name}</div>
                <div className="text-muted-foreground">{source.category}</div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={qualityVariant(status)}>{dataSourceStatusLabels[status]}</Badge>
                <span className="number-tabular">tier {source.tier}</span>
                <span>{health ? `${health.latencyMs}ms` : `هر ${Math.round(source.pollingIntervalSeconds / 60)} دقیقه`}</span>
              </div>
            </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

export function DataQualityPanel() {
  const snapshot = getSignalSnapshot();
  const failedSources = snapshot.signals.filter((signal) => signal.quality === "unavailable" || signal.error);
  const nextUpdate = Math.max(0, REFRESH_INTERVAL_MINUTES - minutesSinceEngineUpdate());

  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-4 w-4 text-primary" aria-hidden />
            کیفیت داده و وضعیت بروزرسانی
          </CardTitle>
          <CardDescription>کیفیت داده، منبع، علت ناموجود بودن، زمان آخرین به‌روزرسانی و هشدار کهنگی برای هر سیگنال خام.</CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="success">آخرین اجرای موفق: {new Date(snapshot.lastUpdatedAt).toLocaleString("fa-IR")}</Badge>
          <Badge variant="outline">آپدیت بعدی: {nextUpdate} دقیقه دیگر</Badge>
          {failedSources.length ? <Badge variant="danger">{failedSources.length} منبع ناموفق</Badge> : <Badge variant="success">منبع ناموفق ندارد</Badge>}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {Object.entries(moduleDataSourceStatus).filter(([module]) => module !== "watchlistPlans" && module !== "apiFirst").map(([module, status]) => (
            <div key={module} className="rounded-md border bg-secondary/25 p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold">{moduleLabels[module] ?? module}</span>
                <Badge variant={qualityVariant(status)}>{dataSourceStatusLabels[status]}</Badge>
              </div>
              <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
                {String(status) === "estimated"
                  ? "این ماژول فقط در صورت فعال بودن fallback توسعه از مقدار برآوردی استفاده می‌کند؛ در تولید، بدون provider معتبر مقدار «ناموجود» نمایش داده می‌شود."
                  : "وضعیت این ماژول از registry و adapterهای داده خوانده می‌شود."}
              </p>
            </div>
          ))}
        </div>
        <div className="overflow-x-auto rounded-md border">
          <table className="w-full min-w-[900px] text-xs">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-right">سیگنال</th>
                <th className="px-3 py-2 text-right">مقدار</th>
                <th className="px-3 py-2 text-right">منبع</th>
                <th className="px-3 py-2 text-right">کیفیت</th>
                <th className="px-3 py-2 text-right">اعتبار</th>
                <th className="px-3 py-2 text-right">آخرین بروزرسانی</th>
                <th className="px-3 py-2 text-right">علت / خطا</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.signals.map((signal) => (
                <tr key={signal.key} className="border-t">
                  <td className="px-3 py-2 font-bold">{signal.label}</td>
                  <td className="px-3 py-2 number-tabular">{signal.value === null ? "ناموجود" : formatNumber(signal.value, 2)}</td>
                  <td className="px-3 py-2">{signal.source}</td>
                  <td className="px-3 py-2">
                    <Badge variant={qualityVariant(signal.quality)}>{dataSourceStatusLabels[signal.quality]}</Badge>
                  </td>
                  <td className="px-3 py-2 number-tabular">{signal.reliability}/100</td>
                  <td className="px-3 py-2">{signal.timestamp ? new Date(signal.timestamp).toLocaleString("fa-IR") : "ناموجود"}</td>
                  <td className="px-3 py-2 text-muted-foreground">{signal.error ?? signal.estimatedReason ?? "داده مستقیم از adapter دریافت شده است."}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

export function WatchlistAndPlansPanel() {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" aria-hidden />
            شخصی‌سازی واچ‌لیست و پلن‌ها
          </CardTitle>
          <CardDescription>تنظیم دارایی‌ها، نوع هشدار، عمق تحلیل و حوزه تمرکز برای پلن‌های SaaS.</CardDescription>
        </div>
        <DataSourceBadge status={moduleDataSourceStatus.watchlistPlans} />
      </CardHeader>
      <CardContent className="grid gap-4 xl:grid-cols-[0.75fr_1.25fr]">
        <div className="rounded-md border bg-secondary/30 p-3">
          <div className="font-black">تنظیمات نمونه کاربر</div>
          <div className="mt-3 grid gap-2 text-xs">
            {["BTC", "ETH", "USDT", "Fed", "DXY", "US10Y"].map((item) => (
              <label key={item} className="flex items-center justify-between rounded-sm border bg-card/60 px-3 py-2">
                <span>{item}</span>
                <input type="checkbox" defaultChecked className="h-4 w-4 accent-primary" />
              </label>
            ))}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            {["حالت مبتدی/حرفه‌ای", "تمرکز ماکرو", "تمرکز آن‌چین", "تمرکز استیبل‌کوین"].map((item) => (
              <Badge key={item} variant="outline" className="justify-center">
                {item}
              </Badge>
            ))}
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {pricingPlans.map((plan) => (
            <div key={plan.name} className="rounded-md border bg-secondary/25 p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="text-lg font-black">{plan.name}</div>
                {plan.name === "PRO" ? <Badge>پرکاربرد</Badge> : null}
              </div>
              <ul className="mt-3 space-y-2 text-xs leading-6 text-muted-foreground">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex gap-2">
                    <TrendingUp className="mt-1 h-3 w-3 flex-none text-primary" aria-hidden />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function ApiFirstPanel() {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle className="flex items-center gap-2">
            <RadioTower className="h-4 w-4 text-primary" aria-hidden />
            API-first و آماده وردپرس
          </CardTitle>
          <CardDescription>تمام داده‌ها از API قابل دریافت‌اند و payload مخصوص WordPress/widget آماده است.</CardDescription>
        </div>
        <DataSourceBadge status={moduleDataSourceStatus.apiFirst} />
      </CardHeader>
      <CardContent className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {[
          ["/api/v1/overview", "payload کامل داشبورد"],
          ["/api/v1/news?grouped=true", "خبرها بر اساس دسته‌بندی"],
          ["/api/v1/assets/btc", "API هوش دارایی"],
          ["/api/v1/wordpress", "payload آماده وردپرس headless"],
        ].map(([href, label]) => (
          <Link key={href} href={href} className="rounded-md border bg-secondary/30 p-3 transition-colors hover:border-primary/50">
            <div className="font-mono text-xs text-primary" dir="ltr">
              {href}
            </div>
            <div className="mt-2 text-xs text-muted-foreground">{label}</div>
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
