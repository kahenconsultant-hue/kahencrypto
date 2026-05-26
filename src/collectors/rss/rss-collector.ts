import type { Collector, CollectorOutput, RawEventInput, SourceDefinition } from "@/types/ingestion";
import { stableHash } from "@/processors/deduplication";

function stripXml(value: string) {
  return value.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function firstMatch(block: string, tag: string) {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? stripXml(match[1]) : "";
}

function parseRssItems(xml: string, source: SourceDefinition): RawEventInput[] {
  const rawEvents: RawEventInput[] = [];

  for (const match of Array.from(xml.matchAll(/<item[\s\S]*?<\/item>/gi))) {
    const block = match[0];
    const title = firstMatch(block, "title");
    const content = firstMatch(block, "description");
    const url = firstMatch(block, "link") || firstMatch(block, "guid");
    const published = firstMatch(block, "pubDate");
    const timestamp = published && !Number.isNaN(Date.parse(published)) ? new Date(published).toISOString() : new Date().toISOString();
    if (!title) continue;

    rawEvents.push({
      sourceId: source.id,
      sourceName: source.name,
      sourceType: source.sourceType,
      category: source.category === "market_data" || source.category === "source_health" ? "financial_media" : source.category,
      title,
      content,
      url,
      language: "en",
      timestamp,
      rawPayload: { title, content, url, published },
      dedupHash: stableHash([source.id, url, title, timestamp.slice(0, 10)]),
      quality: "delayed",
    });

    if (rawEvents.length >= 40) break;
  }

  return rawEvents;
}

async function fetchText(url: string, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        accept: "application/rss+xml,application/xml,text/xml,text/plain,*/*",
        "user-agent": "CMIP/1.0 ingestion foundation",
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

export const rssCollector: Collector = {
  sourceType: "rss",
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
        error: "RSS source has no endpoint.",
      };
    }

    try {
      const xml = await fetchText(source.endpoint, source.timeoutMs);
      const rawEvents = parseRssItems(xml, source);
      return {
        source,
        status: rawEvents.length ? "success" : "degraded",
        fetchedAt: new Date().toISOString(),
        latencyMs: Date.now() - started,
        rawEvents,
        rawMetrics: [],
        error: rawEvents.length ? undefined : "RSS fetched successfully but no parseable items were found.",
      };
    } catch (error) {
      return {
        source,
        status: "failed",
        fetchedAt: new Date().toISOString(),
        latencyMs: Date.now() - started,
        rawEvents: [],
        rawMetrics: [],
        error: error instanceof Error ? error.message : "RSS collector failed.",
      };
    }
  },
};
