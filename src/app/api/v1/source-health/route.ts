import { apiJson, apiOptions } from "@/lib/api-response";
import { getFreshnessReportSync } from "@/health/freshness-engine";
import { getIngestionFoundationStatus } from "@/health/source-health";
import { getIntelligenceReliabilityReport } from "@/server/intelligence/reliability-engine";
import { hydrateRuntimeStoreFromSupabase } from "@/storage/ingestion-store";

export function OPTIONS() {
  return apiOptions();
}

export async function GET() {
  await hydrateRuntimeStoreFromSupabase();
  const [foundation, reliability] = await Promise.all([getIngestionFoundationStatus(), getIntelligenceReliabilityReport()]);
  return apiJson({ ...foundation, freshnessReport: getFreshnessReportSync(), intelligenceReliability: reliability });
}
