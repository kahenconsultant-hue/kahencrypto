import {
  AiSummariesPanel,
  AssetIntelligenceGrid,
  BasicIntelligencePanel,
  CorrelationMapPanel,
  DataQualityPanel,
  DerivedSignalsPanel,
  EtfFlowsPanel,
  GeopoliticalRiskPanel,
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

export default async function DashboardPage() {
  const aiSummariesPanel = await AiSummariesPanel();
  const showPublicOperationsPanel = process.env.CMIP_SHOW_PUBLIC_OPS === "true" && process.env.NODE_ENV !== "production";

  return (
    <div className="space-y-4">
      <Reveal>
        <ReliabilityStatusPanel />
      </Reveal>
      <Reveal delay={0.01}>
        <BasicIntelligencePanel />
      </Reveal>
      <Reveal>
        <MarketRegimePanel />
      </Reveal>
      <Reveal delay={0.02}>
        <DerivedSignalsPanel />
      </Reveal>
      <div className="grid gap-4 2xl:grid-cols-[0.95fr_1.05fr]">
        <Reveal delay={0.03}>
          <TopAlertsPanel />
        </Reveal>
        <Reveal delay={0.06}>
          <MacroSummaryPanel />
        </Reveal>
      </div>
      <Reveal delay={0.09}>
        <AssetIntelligenceGrid />
      </Reveal>
      <div className="grid gap-4 2xl:grid-cols-[0.95fr_1.05fr]">
        <Reveal delay={0.12}>
          <UsdtRiskPanel />
        </Reveal>
        <Reveal delay={0.15}>
          <EtfFlowsPanel />
        </Reveal>
      </div>
      <Reveal delay={0.18}>
        <LiquidityPanel />
      </Reveal>
      <Reveal delay={0.21}>
        <CorrelationMapPanel />
      </Reveal>
      <div className="grid gap-4 2xl:grid-cols-[1fr_1fr]">
        <Reveal delay={0.24}>
          <SentimentPanel />
        </Reveal>
        <Reveal delay={0.27}>
          <GeopoliticalRiskPanel />
        </Reveal>
      </div>
      <Reveal delay={0.3}>
        <LatestNewsFeedPanel />
      </Reveal>
      <Reveal delay={0.315}>
        {aiSummariesPanel}
      </Reveal>
      <Reveal delay={0.33}>
        <DataQualityPanel />
      </Reveal>
      {showPublicOperationsPanel ? (
        <div className="grid gap-4">
          <OperationsPanel />
        </div>
      ) : null}
    </div>
  );
}
