import { type NextRequest } from "next/server";
import { apiJson, apiOptions } from "@/lib/api-response";
import { assetIntelligence, getNewsItems } from "@/lib/production-data";
import { assetStatusKey } from "@/lib/data-source-status";
import { generateAssetImpactProfile } from "@/server/analytics/asset-impact-engine";
import { generateSmartAlerts } from "@/server/alerts/smart-alert-engine";
import { summarizeImpactForAsset } from "@/server/ai/pipeline";
import { getDashboardModuleDataSourceStatus } from "@/server/dashboard/dashboard-service";

type Params = {
  params: Promise<{ symbol: string }>;
};

export function OPTIONS() {
  return apiOptions();
}

export async function GET(_request: NextRequest, { params }: Params) {
  const { symbol } = await params;
  const key = symbol.toLowerCase() as keyof typeof assetIntelligence;
  const asset = assetIntelligence[key];

  if (!asset) {
    return apiJson({ error: "asset_not_found", allowed: Object.keys(assetIntelligence) }, { status: 404 });
  }

  const relevantNews = getNewsItems()
    .filter((item) => item.impacts.some((impact) => impact.asset === asset.symbol))
    .slice(0, 20);

  return apiJson({
    generatedAt: new Date().toISOString(),
    dataSourceStatus: getDashboardModuleDataSourceStatus()[assetStatusKey(key)],
    asset,
    directionalImpact: generateAssetImpactProfile(asset.symbol),
    alerts: generateSmartAlerts().filter((alert) => alert.affectedAssets.includes(asset.symbol)).sort((left, right) => right.importance - left.importance),
    impactSummaries: relevantNews.slice(0, 8).map((item) => ({
      itemId: item.id,
      titleFa: item.titleFa,
      source: item.source,
      category: item.category,
      impact: summarizeImpactForAsset(item.impacts, asset.symbol),
    })),
    relevantNews,
  });
}
