import { type NextRequest } from "next/server";
import { apiJson, apiOptions } from "@/lib/api-response";
import { ensureDashboardSignalCacheFresh, getDashboardModuleDataSourceStatus } from "@/server/dashboard/dashboard-service";
import { assetStatusKey } from "@/lib/data-source-status";
import { getUnifiedAssetIntelligence, getUnifiedAssetKeys } from "@/server/intelligence/unified-intelligence-engine";

type Params = {
  params: Promise<{ symbol: string }>;
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function OPTIONS() {
  return apiOptions();
}

export async function GET(_request: NextRequest, { params }: Params) {
  const { symbol } = await params;
  await ensureDashboardSignalCacheFresh();
  const key = symbol.toLowerCase();
  const asset = getUnifiedAssetIntelligence(key);

  if (!asset) {
    return apiJson({ error: "asset_not_found", allowed: getUnifiedAssetKeys() }, { status: 404 });
  }

  return apiJson(
    {
      generatedAt: new Date().toISOString(),
      dataSourceStatus: getDashboardModuleDataSourceStatus()[assetStatusKey(asset.key)],
      asset,
      directionalImpact: asset.impactProfile,
      alerts: asset.alerts,
      inheritedStates: asset.inherited,
      consistency: {
        bias: asset.bias,
        confidence: asset.confidence,
        liquidity: asset.inherited.liquidityState,
        macroState: asset.inherited.macroState,
        mode: asset.mode,
        suppressedOutputs: asset.suppressedOutputs,
      },
    },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
