import { type NextRequest } from "next/server";
import { apiJson, apiOptions } from "@/lib/api-response";
import { getDashboardModuleDataSourceStatus } from "@/server/dashboard/dashboard-service";
import type { AlertLevel, AssetSymbol } from "@/lib/types";
import { filterAlerts } from "@/server/alerts/smart-alert-engine";

export function OPTIONS() {
  return apiOptions();
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const asset = searchParams.get("asset") as AssetSymbol | null;
  const minLevel = searchParams.get("minLevel") as AlertLevel | null;

  return apiJson({
    generatedAt: new Date().toISOString(),
    dataSourceStatus: getDashboardModuleDataSourceStatus().topAlerts,
    alerts: filterAlerts({
      asset: asset ?? undefined,
      minLevel: minLevel ?? undefined,
    }),
  });
}
