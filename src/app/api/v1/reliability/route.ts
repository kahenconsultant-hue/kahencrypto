import { apiJson, apiOptions } from "@/lib/api-response";
import { getIntelligenceReliabilityReport } from "@/server/intelligence/reliability-engine";

export function OPTIONS() {
  return apiOptions();
}

export async function GET() {
  return apiJson(await getIntelligenceReliabilityReport());
}
