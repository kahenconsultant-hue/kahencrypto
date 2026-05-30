import type { Collector, CollectorOutput, RawEventInput, SourceDefinition } from "@/types/ingestion";
import { stableHash } from "@/processors/deduplication";

const requestTimeoutMs = 8_000;

function stripHtml(value: string) {
  return value.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function absoluteUrl(base: string, href: string) {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

function allowedListingHref(source: SourceDefinition, href: string) {
  if (source.id === "treasury-press-rss") return href.includes("/news/press-releases/");
  return href.startsWith("/") || href.startsWith("http");
}

function parseHtmlListings(html: string, source: SourceDefinition): RawEventInput[] {
  const now = new Date().toISOString();
  const seen = new Set<string>();
  const events: RawEventInput[] = [];

  for (const match of Array.from(html.matchAll(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi))) {
    const href = match[1];
    if (!allowedListingHref(source, href)) continue;
    const title = stripHtml(match[2]);
    if (title.length < 18 || /^(view|subscribe|read more|press releases)$/i.test(title)) continue;
    const url = absoluteUrl(source.endpoint ?? "", href);
    const key = `${title}:${url}`;
    if (seen.has(key)) continue;
    seen.add(key);

    events.push({
      sourceId: source.id,
      sourceName: source.name,
      sourceType: source.sourceType,
      category: source.category === "market_data" || source.category === "source_health" ? "financial_media" : source.category,
      title,
      content: title,
      url,
      language: "en",
      timestamp: now,
      rawPayload: {
        title,
        url,
        extractionMethod: "official_html_listing",
        timestampNote: "Official listing page did not expose a machine-readable publication date in the listing parser.",
      },
      dedupHash: stableHash([source.id, url, title]),
      quality: "delayed",
    });

    if (events.length >= 40) break;
  }

  return events;
}

async function fetchHtml(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: "text/html,application/xhtml+xml,text/plain,*/*",
        "user-agent": "CMIP/1.0 official public listing collector",
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

export const htmlListingCollector: Collector = {
  sourceType: "scraper",
  async collect(source: SourceDefinition): Promise<CollectorOutput> {
    const started = Date.now();
    if (!source.endpoint) {
      return {
        source,
        status: "failed",
        fetchedAt: new Date().toISOString(),
        latencyMs: 0,
        rawEvents: [],
        rawMetrics: [],
        error: "HTML listing source has no endpoint.",
      };
    }

    try {
      const html = await fetchHtml(source.endpoint, source.timeoutMs);
      const rawEvents = parseHtmlListings(html, source);
      return {
        source,
        status: rawEvents.length ? "success" : "degraded",
        fetchedAt: new Date().toISOString(),
        latencyMs: Date.now() - started,
        rawEvents,
        rawMetrics: [],
        error: rawEvents.length ? undefined : "HTML listing fetched successfully but no parseable items were found.",
      };
    } catch (error) {
      return {
        source,
        status: "failed",
        fetchedAt: new Date().toISOString(),
        latencyMs: Date.now() - started,
        rawEvents: [],
        rawMetrics: [],
        error: error instanceof Error ? error.message : "HTML listing collector failed.",
      };
    }
  },
};
