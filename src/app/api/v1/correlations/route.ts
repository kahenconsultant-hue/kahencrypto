import { apiJson, apiOptions } from "@/lib/api-response";
import {
  ensureDashboardSignalCacheFresh,
  getDashboardCorrelationReport,
  getDashboardModuleDataSourceStatus,
} from "@/server/dashboard/dashboard-service";

export function OPTIONS() {
  return apiOptions();
}

export async function GET() {
  await ensureDashboardSignalCacheFresh();
  return apiJson({
    dataSourceStatus: getDashboardModuleDataSourceStatus().correlations,
    ...getDashboardCorrelationReport(),
  });
}
