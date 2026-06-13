import { AssetDashboard } from "@/components/assets/asset-dashboard";
import { UsdtRiskPanel } from "@/components/dashboard/panels";
import { ensureDashboardSignalCacheFresh } from "@/server/dashboard/dashboard-service";
import { getUnifiedAssetIntelligence } from "@/server/intelligence/unified-intelligence-engine";

export const metadata = {
  title: "USDT Risk Center | C.M.I.P",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function UsdtRiskPage() {
  await ensureDashboardSignalCacheFresh();
  const asset = getUnifiedAssetIntelligence("usdt");

  return (
    <div className="space-y-4">
      <UsdtRiskPanel />
      {asset ? <AssetDashboard asset={asset} /> : null}
    </div>
  );
}
