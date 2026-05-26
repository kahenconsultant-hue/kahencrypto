import { type NextRequest } from "next/server";
import { apiJson, apiOptions } from "@/lib/api-response";
import { categoryLabels } from "@/lib/production-data";
import { moduleDataSourceStatus } from "@/lib/data-source-status";
import type { NewsCategory } from "@/lib/types";
import { getLatestRawEventsSync } from "@/storage/ingestion-store";

const categories = new Set(Object.keys(categoryLabels));

export function OPTIONS() {
  return apiOptions();
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");
  const limit = Number(searchParams.get("limit") ?? "40");
  const grouped = searchParams.get("grouped") === "true";

  if (category && !categories.has(category)) {
    return apiJson({ error: "invalid_category", allowed: [...categories] }, { status: 400 });
  }

  if (grouped) {
    const events = getLatestRawEventsSync(120);
    return apiJson({
      generatedAt: new Date().toISOString(),
      dataSourceStatus: moduleDataSourceStatus.latestNews,
      categories: (Object.entries(categoryLabels) as Array<[NewsCategory, string]>).map(([key, labelFa]) => ({
        category: key,
        labelFa,
        items: events.filter((event) => event.category === key),
      })),
    });
  }

  const items = getLatestRawEventsSync(Math.max(1, Math.min(limit, 120))).filter((event) => (category ? event.category === category : true));
  return apiJson({
    generatedAt: new Date().toISOString(),
    dataSourceStatus: moduleDataSourceStatus.latestNews,
    count: items.length,
    items,
  });
}
