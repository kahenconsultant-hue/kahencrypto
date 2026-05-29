import { apiJson, apiOptions } from "@/lib/api-response";
import { getDashboardModuleDataSourceStatus } from "@/server/dashboard/dashboard-service";
import { buildWordPressPayload } from "@/server/wordpress/adapter";

export function OPTIONS() {
  return apiOptions();
}

export async function GET() {
  return apiJson({
    dataSourceStatus: getDashboardModuleDataSourceStatus().widgetEmbed,
    ...buildWordPressPayload(),
  });
}
