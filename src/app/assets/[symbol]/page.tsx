import { notFound } from "next/navigation";
import { AssetDashboard } from "@/components/assets/asset-dashboard";
import { getUnifiedAssetIntelligence, getUnifiedAssetRegistry } from "@/server/intelligence/unified-intelligence-engine";
import { ensureDashboardSignalCacheFresh } from "@/server/dashboard/dashboard-service";

type PageProps = {
  params: Promise<{ symbol: string }>;
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata({ params }: PageProps) {
  const { symbol } = await params;
  const registry = getUnifiedAssetRegistry();
  const key = symbol.toLowerCase() as keyof typeof registry;
  const asset = registry[key];

  return {
    title: asset ? `${asset.symbol} Intelligence | C.M.I.P` : "Asset Intelligence | C.M.I.P",
  };
}

export default async function AssetPage({ params }: PageProps) {
  const { symbol } = await params;
  await ensureDashboardSignalCacheFresh();
  const asset = getUnifiedAssetIntelligence(symbol);

  if (!asset) {
    notFound();
  }

  return <AssetDashboard asset={asset} />;
}
