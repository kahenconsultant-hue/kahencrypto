import { notFound } from "next/navigation";
import { assetIntelligence } from "@/lib/production-data";
import { AssetDashboard } from "@/components/assets/asset-dashboard";

type PageProps = {
  params: Promise<{ symbol: string }>;
};

export function generateStaticParams() {
  return Object.keys(assetIntelligence).map((symbol) => ({ symbol }));
}

export async function generateMetadata({ params }: PageProps) {
  const { symbol } = await params;
  const key = symbol.toLowerCase() as keyof typeof assetIntelligence;
  const asset = assetIntelligence[key];

  return {
    title: asset ? `${asset.symbol} Intelligence | C.M.I.P` : "Asset Intelligence | C.M.I.P",
  };
}

export default async function AssetPage({ params }: PageProps) {
  const { symbol } = await params;
  const key = symbol.toLowerCase() as keyof typeof assetIntelligence;

  if (!assetIntelligence[key]) {
    notFound();
  }

  return <AssetDashboard assetKey={key} />;
}
