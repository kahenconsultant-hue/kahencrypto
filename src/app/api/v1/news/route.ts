import { type NextRequest } from "next/server";
import { apiJson, apiOptions } from "@/lib/api-response";
import { categoryLabels } from "@/lib/production-data";
import { toPublicNormalizedEvent, toPublicRawEvent } from "@/lib/persian-processing";
import { getDashboardModuleDataSourceStatus } from "@/server/dashboard/dashboard-service";
import type { NewsCategory } from "@/lib/types";
import { getLatestNormalizedEventsSync, getLatestRawEventsSync } from "@/storage/ingestion-store";

const categories = new Set(Object.keys(categoryLabels));

export function OPTIONS() {
  return apiOptions();
}

function latestPublicEvents(limit: number) {
  const rawEvents = getLatestRawEventsSync(limit).map(toPublicRawEvent);
  const normalizedEvents = getLatestNormalizedEventsSync(limit).map(toPublicNormalizedEvent);
  const seen = new Set<string>();

  return [...rawEvents, ...normalizedEvents]
    .filter((event) => {
      const key = event.url ?? event.dedupHash ?? `${event.sourceName}:${event.timestamp}:${event.title}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp))
    .slice(0, limit);
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");
  const limit = Number(searchParams.get("limit") ?? "40");
  const grouped = searchParams.get("grouped") === "true";
  const dataSourceStatus = getDashboardModuleDataSourceStatus();

  if (category && !categories.has(category)) {
    return apiJson({ error: "invalid_category", allowed: [...categories] }, { status: 400 });
  }

  if (grouped) {
    const events = latestPublicEvents(160);
    return apiJson({
      generatedAt: new Date().toISOString(),
      dataSourceStatus: dataSourceStatus.latestNews,
      categories: (Object.entries(categoryLabels) as Array<[NewsCategory, string]>).map(([key, labelFa]) => ({
        category: key,
        labelFa,
        items: events.filter((event) => event.category === key),
      })),
    });
  }

  const items = latestPublicEvents(Math.max(1, Math.min(limit, 160))).filter((event) => (category ? event.category === category : true));
  return apiJson({
    generatedAt: new Date().toISOString(),
    dataSourceStatus: dataSourceStatus.latestNews,
    count: items.length,
    items,
  });
}
