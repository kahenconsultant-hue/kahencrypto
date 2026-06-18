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

  return (
    <div className="space-y-4">
      <div className="rounded-md border bg-card/70 p-4">
        <h1 className="text-lg font-black">Intelligence Lab / Audit</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          این مسیر برای diagnostics، forecast validation، source health، correlation و trace محاسبات است. گزارش عمومی در صفحه اصلی خلاصه و کاربرمحور نگه داشته شده است.
        </p>
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
