import { EtfFlowsPanel, LiquidityPanel, MacroSummaryPanel, OperationsPanel } from "@/components/dashboard/panels";

export const metadata = {
  title: "Liquidity Dashboard | C.M.I.P",
};

export default function LiquidityPage() {
  return (
    <div className="space-y-4">
      <LiquidityPanel />
      <MacroSummaryPanel />
      <EtfFlowsPanel />
      <OperationsPanel />
    </div>
  );
}
