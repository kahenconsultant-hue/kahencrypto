import { apiJson, apiOptions } from "@/lib/api-response";
import { moduleDataSourceStatus } from "@/lib/data-source-status";
import { getDynamicCorrelationReport } from "@/server/analytics/correlation-engine";

export function OPTIONS() {
  return apiOptions();
}

export async function GET() {
  return apiJson({
    dataSourceStatus: moduleDataSourceStatus.correlations,
    ...getDynamicCorrelationReport(),
  });
}
