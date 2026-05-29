import { apiJson, apiOptions } from "@/lib/api-response";
import { getDynamicCorrelationReport } from "@/server/analytics/correlation-engine";
import { getDashboardModuleDataSourceStatus } from "@/server/dashboard/dashboard-service";

export function OPTIONS() {
  return apiOptions();
}

export async function GET() {
  return apiJson({
    dataSourceStatus: getDashboardModuleDataSourceStatus().correlations,
    ...getDynamicCorrelationReport(),
  });
}
