import { apiJson, apiOptions } from "@/lib/api-response";
import { moduleDataSourceStatus } from "@/lib/data-source-status";
import { buildWordPressPayload } from "@/server/wordpress/adapter";

export function OPTIONS() {
  return apiOptions();
}

export async function GET() {
  return apiJson({
    dataSourceStatus: moduleDataSourceStatus.widgetEmbed,
    ...buildWordPressPayload(),
  });
}
