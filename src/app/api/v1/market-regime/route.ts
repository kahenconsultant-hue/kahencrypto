import { apiJson, apiOptions } from "@/lib/api-response";
import { moduleDataSourceStatus } from "@/lib/data-source-status";
import { getMarketRegimeReport } from "@/server/analytics/market-regime-engine";

export function OPTIONS() {
  return apiOptions();
}

export async function GET() {
  return apiJson({
    dataSourceStatus: moduleDataSourceStatus.marketRegime,
    ...getMarketRegimeReport(),
  });
}
