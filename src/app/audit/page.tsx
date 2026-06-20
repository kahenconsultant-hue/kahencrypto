import { Suspense, type ReactNode } from "react";
import {
  AiSummariesPanel,
  AssetIntelligenceGrid,
  BasicIntelligencePanel,
  CausalMarketGraphPanel,
  CorrelationMapPanel,
  DataQualityPanel,
  DerivedSignalsPanel,
  EtfFlowsPanel,
  ForecastValidationCenterPanel,
  GeopoliticalRiskPanel,
  IntegrityPanel,
  LatestNewsFeedPanel,
  LiquidityPanel,
  MacroSummaryPanel,
  MarketRegimePanel,
  OperationsPanel,
  ReliabilityStatusPanel,
  SentimentPanel,
  TopAlertsPanel,
  UsdtRiskPanel,
} from "@/components/dashboard/panels";
import { Reveal } from "@/components/motion/reveal";
import { buildPublicMarketBrief } from "@/lib/intelligence/publicBriefBuilder";
import { formatNumber } from "@/lib/utils";
import { ensureDashboardSignalCacheFresh } from "@/server/dashboard/dashboard-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

async function DeferredPanel({ children }: { children: ReactNode }) {
  await new Promise((resolve) => setTimeout(resolve, 0));
  return <>{children}</>;
}

function PanelFallback({ label }: { label: string }) {
  return (
    <div className="rounded-md border bg-card/65 p-4 text-sm text-muted-foreground">
      در حال آماده‌سازی {label}...
    </div>
  );
}

function DeferredSection({ children, label }: { children: ReactNode; label: string }) {
  return (
    <Suspense fallback={<PanelFallback label={label} />}>
      <DeferredPanel>{children}</DeferredPanel>
    </Suspense>
  );
}

export default async function IntelligenceAuditPage() {
  await ensureDashboardSignalCacheFresh();
  const brief = await buildPublicMarketBrief();

  return (
    <div className="space-y-4">
      <div className="rounded-md border bg-card/70 p-4">
        <h1 className="text-lg font-black">Intelligence Lab / Audit</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          این مسیر برای diagnostics، forecast validation، source health، correlation و trace محاسبات است. گزارش عمومی در صفحه اصلی خلاصه و کاربرمحور نگه داشته شده است.
        </p>
      </div>
      <div className="rounded-md border bg-card/70 p-4" dir="rtl">
        <h2 className="text-base font-black">ممیزی سقف اعتماد گزارش عمومی</h2>
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-4">
          <div className="rounded-md border p-3">اعتماد خام: {formatNumber(brief.audit.rawConfidence, 0)}٪</div>
          <div className="rounded-md border p-3">سقف اعتماد: {formatNumber(brief.audit.confidenceCap, 0)}٪</div>
          <div className="rounded-md border p-3">اعتماد نهایی: {formatNumber(brief.audit.finalConfidence, 0)}٪</div>
          <div className="rounded-md border p-3">پوشش وزنی: {formatNumber(brief.audit.weightedCoverage, 0)}٪</div>
        </div>
        <div className="mt-3 rounded-md border p-3 text-xs leading-6 text-muted-foreground">
          دلایل سقف: {brief.confidenceGuard.capReasonsFa.length ? brief.confidenceGuard.capReasonsFa.join("؛ ") : "محدودیت فعالی ثبت نشده است."}
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[760px] text-xs">
            <thead>
              <tr className="border-b text-right text-muted-foreground">
                <th className="p-2">موتور</th>
                <th className="p-2">وضعیت</th>
                <th className="p-2">منبع</th>
                <th className="p-2">تازگی</th>
                <th className="p-2">فیلدهای عددی</th>
              </tr>
            </thead>
            <tbody>
              {brief.audit.sources.map((source) => (
                <tr key={source.category} className="border-b last:border-b-0">
                  <td className="p-2 font-bold">{source.category}</td>
                  <td className="p-2">{brief.audit.engines[source.category].status}</td>
                  <td className="p-2">{source.sourceName ?? "ناموجود"}</td>
                  <td className="p-2">{source.freshnessStatus}</td>
                  <td className="p-2">{source.numericFieldsAvailable.join("، ") || "هیچ"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="rounded-md border bg-card/70 p-4" dir="rtl">
        <h2 className="text-base font-black">ممیزی موتور مشتقات Lite</h2>
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-4">
          <div className="rounded-md border p-3">حالت: lite_public_exchange_api</div>
          <div className="rounded-md border p-3">دارایی موجود: {formatNumber(brief.derivativesLite.availableAssetsCount, 0)}</div>
          <div className="rounded-md border p-3">ریسک اهرم: {brief.derivativesLite.marketLeverageRiskScore === null ? "ناموجود" : formatNumber(brief.derivativesLite.marketLeverageRiskScore, 0)}</div>
          <div className="rounded-md border p-3">اعتماد: {formatNumber(brief.derivativesLite.confidence, 0)}٪</div>
        </div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[980px] text-xs">
            <thead>
              <tr className="border-b text-right text-muted-foreground">
                <th className="p-2">دارایی</th><th className="p-2">منبع</th><th className="p-2">Funding</th><th className="p-2">OI 24h</th><th className="p-2">OI 7d</th><th className="p-2">ریسک</th><th className="p-2">اعتماد</th><th className="p-2">فیلدهای غایب</th>
              </tr>
            </thead>
            <tbody>
              {brief.derivativesLite.assets.map((asset) => (
                <tr key={asset.asset} className="border-b last:border-b-0">
                  <td className="p-2 font-bold">{asset.asset}</td>
                  <td className="p-2">{asset.sourceUsed ?? "ناموجود"}</td>
                  <td className="p-2">{asset.latestFundingRate ?? "ناموجود"}</td>
                  <td className="p-2">{asset.openInterest24hChangePct ?? "ناموجود"}</td>
                  <td className="p-2">{asset.openInterest7dChangePct ?? "ناموجود"}</td>
                  <td className="p-2">{asset.leverageRiskScore ?? "ناموجود"}</td>
                  <td className="p-2">{asset.derivativesConfidence}٪</td>
                  <td className="p-2">{asset.missingFields.join("، ") || "هیچ"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <Reveal>
        <MarketRegimePanel />
      </Reveal>
      <Reveal delay={0.02}>
        <DeferredSection label="هشدارهای هوشمند">
          <TopAlertsPanel />
        </DeferredSection>
      </Reveal>
      <Reveal delay={0.04}>
        <DeferredSection label="مرکز اعتبارسنجی forecast">
          <ForecastValidationCenterPanel />
        </DeferredSection>
      </Reveal>
      <Reveal delay={0.06}>
        <DeferredSection label="نقشه علیت بازار">
          <CausalMarketGraphPanel />
        </DeferredSection>
      </Reveal>
      <Reveal delay={0.08}>
        <LiquidityPanel />
      </Reveal>
      <div className="grid gap-4 2xl:grid-cols-[1.12fr_0.88fr]">
        <Reveal delay={0.1}>
          <DeferredSection label="نمای پایه هوش بازار">
            <BasicIntelligencePanel />
          </DeferredSection>
        </Reveal>
        <Reveal delay={0.12}>
          <ReliabilityStatusPanel />
        </Reveal>
      </div>
      <Reveal delay={0.14}>
        <DeferredSection label="کنترل یکپارچگی هوش">
          <IntegrityPanel />
        </DeferredSection>
      </Reveal>
      <Reveal delay={0.16}>
        <DeferredSection label="نقشه اثر دارایی‌ها">
          <AssetIntelligenceGrid />
        </DeferredSection>
      </Reveal>
      <div className="grid gap-4 2xl:grid-cols-[0.9fr_1.1fr]">
        <Reveal delay={0.12}>
          <MacroSummaryPanel />
        </Reveal>
        <Reveal delay={0.15}>
          <DeferredSection label="سیگنال‌های مشتق‌شده">
            <DerivedSignalsPanel />
          </DeferredSection>
        </Reveal>
      </div>
      <Reveal delay={0.18}>
        <DeferredSection label="نقشه همبستگی">
          <CorrelationMapPanel />
        </DeferredSection>
      </Reveal>
      <div className="grid gap-4 2xl:grid-cols-[1fr_1fr]">
        <Reveal delay={0.21}>
          <DeferredSection label="سنتیمنت بازار">
            <SentimentPanel />
          </DeferredSection>
        </Reveal>
        <Reveal delay={0.24}>
          <DeferredSection label="ریسک ژئوپلیتیک">
            <GeopoliticalRiskPanel />
          </DeferredSection>
        </Reveal>
      </div>
      <div className="grid gap-4 2xl:grid-cols-[0.95fr_1.05fr]">
        <Reveal delay={0.27}>
          <DeferredSection label="مرکز ریسک USDT">
            <UsdtRiskPanel />
          </DeferredSection>
        </Reveal>
        <Reveal delay={0.3}>
          <DeferredSection label="جریان ETF">
            <EtfFlowsPanel />
          </DeferredSection>
        </Reveal>
      </div>
      <Reveal delay={0.33}>
        <DeferredSection label="خوراک خبر">
          <LatestNewsFeedPanel />
        </DeferredSection>
      </Reveal>
      <Reveal delay={0.36}>
        <Suspense fallback={<PanelFallback label="ترجمه و توضیح رویدادها" />}>
          <AiSummariesPanel />
        </Suspense>
      </Reveal>
      <div className="grid gap-4">
        <OperationsPanel />
        <DataQualityPanel />
      </div>
    </div>
  );
}
