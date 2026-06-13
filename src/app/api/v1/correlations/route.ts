import { apiJson, apiOptions } from "@/lib/api-response";
import { getDynamicCorrelationReport } from "@/server/analytics/correlation-engine";
import {
  ensureDashboardSignalCacheFresh,
  getDashboardModuleDataSourceStatus,
} from "@/server/dashboard/dashboard-service";
import { hydrateMarketSnapshotsFromSupabase } from "@/storage/ingestion-store";

export function OPTIONS() {
  return apiOptions();
}

export async function GET() {
  await ensureDashboardSignalCacheFresh();
  await hydrateMarketSnapshotsFromSupabase();
  return apiJson({
    dataSourceStatus: getDashboardModuleDataSourceStatus().correlations,
    ...getDynamicCorrelationReport(),
  });
}
