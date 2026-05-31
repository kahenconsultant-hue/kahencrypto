import type { Collector, CollectorOutput, RawEventInput, SourceDefinition } from "@/types/ingestion";
import { stableHash } from "@/processors/deduplication";

type TradingEconomicsCalendarEvent = {
  CalendarId?: string | number;
  Country?: string;
  Category?: string;
  Event?: string;
  Date?: string;
  Reference?: string;
  Source?: string;
  Actual?: string | number | null;
  Previous?: string | number | null;
  Forecast?: string | number | null;
  TEForecast?: string | number | null;
  Importance?: number | string | null;
};

function endpointFailureMessage(status: number, body: string) {
  if (status === 401 || status === 403) return "Trading Economics API key is invalid or rejected.";
  if (status === 429) return "Trading Economics API rate limit reached.";
  if (status >= 500) return `Trading Economics endpoint failed with HTTP ${status}.`;
  return body.slice(0, 240) || `Trading Economics endpoint failed with HTTP ${status}.`;
}

async function fetchCalendar(source: SourceDefinition) {
  const key = process.env.TRADINGECONOMICS_API_KEY;
  if (!key) {
    return { events: [], status: "api_key_missing" as const, error: "Missing TRADINGECONOMICS_API_KEY." };
  }

  const url = new URL("https://api.tradingeconomics.com/calendar/country/united%20states");
  url.searchParams.set("c", key);
  url.searchParams.set("f", "json");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), source.timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: "application/json",
        "user-agent": "CMIP/1.0 macro calendar collector",
      },
    });
    const text = await response.text();
    if (!response.ok) {
      return { events: [], status: response.status === 429 ? ("degraded" as const) : ("failed" as const), error: endpointFailureMessage(response.status, text) };
    }
    const data = JSON.parse(text) as TradingEconomicsCalendarEvent[];
    return { events: Array.isArray(data) ? data : [], status: "success" as const, error: undefined };
  } catch (error) {
    return {
      events: [],
      status: "failed" as const,
      error: error instanceof Error ? error.message : "Trading Economics calendar fetch failed.",
    };
  } finally {
    clearTimeout(timeout);
  }
}

function rawEventFromCalendarEvent(source: SourceDefinition, item: TradingEconomicsCalendarEvent): RawEventInput | null {
  const title = item.Event || item.Category;
  if (!title) return null;
  const timestamp = item.Date && !Number.isNaN(Date.parse(item.Date)) ? new Date(item.Date).toISOString() : new Date().toISOString();
  const actual = item.Actual === null || item.Actual === undefined || item.Actual === "" ? "unavailable" : String(item.Actual);
  const forecast = item.Forecast ?? item.TEForecast;
  const content = [
    `Category: ${item.Category ?? "economic calendar"}`,
    `Actual: ${actual}`,
    `Forecast: ${forecast ?? "unavailable"}`,
    `Previous: ${item.Previous ?? "unavailable"}`,
    `Reference: ${item.Reference ?? "unavailable"}`,
  ].join("\n");

  return {
    sourceId: source.id,
    sourceName: source.name,
    sourceType: source.sourceType,
    category: "economic_data",
    title,
    content,
    language: "en",
    timestamp,
    rawPayload: item,
    dedupHash: stableHash([source.id, String(item.CalendarId ?? ""), title, timestamp.slice(0, 10)]),
    quality: "delayed",
  };
}

export const tradingEconomicsCollector: Collector = {
  sourceType: "api",
  async collect(source: SourceDefinition): Promise<CollectorOutput> {
    const started = Date.now();
    const result = await fetchCalendar(source);
    const rawEvents = result.events.map((item) => rawEventFromCalendarEvent(source, item)).filter((item): item is RawEventInput => Boolean(item));
    const status = result.status === "success" && !rawEvents.length ? "degraded" : result.status;
    return {
      source,
      status,
      fetchedAt: new Date().toISOString(),
      latencyMs: Date.now() - started,
      rawEvents,
      rawMetrics: [],
      error: result.error ?? (status === "degraded" ? "Trading Economics returned no usable calendar events." : undefined),
    };
  },
};
