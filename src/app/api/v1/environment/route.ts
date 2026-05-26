import { apiJson, apiOptions } from "@/lib/api-response";
import { getEnvironmentValidationReport } from "@/health/environment-report";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export function OPTIONS() {
  return apiOptions();
}

export async function GET() {
  return apiJson(await getEnvironmentValidationReport());
}
