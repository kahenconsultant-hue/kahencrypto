import { EtfFlowsPanel, LiquidityPanel, MacroSummaryPanel, OperationsPanel } from "@/components/dashboard/panels";

export const metadata = {
  title: "Liquidity Dashboard | C.M.I.P",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function LiquidityPage() {
  const showPublicOperationsPanel = process.env.CMIP_SHOW_PUBLIC_OPS === "true" && process.env.NODE_ENV !== "production";

  return (
    <div className="space-y-4">
      <LiquidityPanel />
      <MacroSummaryPanel />
      <EtfFlowsPanel />
      {showPublicOperationsPanel ? <OperationsPanel /> : null}
    </div>
  );
}
