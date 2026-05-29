import { apiJson, apiOptions } from "@/lib/api-response";
import { getMarketRegimeReport } from "@/server/analytics/market-regime-engine";
import { getDashboardModuleDataSourceStatus } from "@/server/dashboard/dashboard-service";

export function OPTIONS() {
  return apiOptions();
}

export async function GET() {
  return apiJson({
    dataSourceStatus: getDashboardModuleDataSourceStatus().marketRegime,
    ...getMarketRegimeReport(),
  });
}
