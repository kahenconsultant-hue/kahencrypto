import { PublicMarketBrief } from "@/components/public/PublicMarketBrief";
import { buildPublicMarketBrief } from "@/lib/intelligence/publicBriefBuilder";
import { ensureDashboardSignalCacheFresh } from "@/server/dashboard/dashboard-service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DashboardPage() {
  await ensureDashboardSignalCacheFresh();
  const brief = buildPublicMarketBrief();

  return <PublicMarketBrief brief={brief} />;
}
