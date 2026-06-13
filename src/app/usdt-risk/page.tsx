import { AssetDashboard } from "@/components/assets/asset-dashboard";
import { UsdtRiskPanel } from "@/components/dashboard/panels";

export const metadata = {
  title: "USDT Risk Center | C.M.I.P",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function UsdtRiskPage() {
  return (
    <div className="space-y-4">
      <UsdtRiskPanel />
      <AssetDashboard assetKey="usdt" />
    </div>
  );
}
