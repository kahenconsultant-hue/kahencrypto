import type { Collector, CollectorOutput, RawEventInput, SourceDefinition } from "@/types/ingestion";
import { stableHash } from "@/processors/deduplication";

function stripXml(value: string) {
  return value.replace(/<!\[CDATA\[|\]\]>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function firstMatch(block: string, tag: string) {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? stripXml(match[1]) : "";
}

function firstLink(block: string) {
  const plain = firstMatch(block, "link");
  if (plain) return plain;
  const href = block.match(/<link[^>]+href=["']([^"']+)["'][^>]*>/i);
  return href ? stripXml(href[1]) : "";
}

function firstTimestamp(block: string) {
  return firstMatch(block, "pubDate") || firstMatch(block, "published") || firstMatch(block, "updated") || firstMatch(block, "dc:date");
}

function normalizeTimestamp(value: string) {
  return value && !Number.isNaN(Date.parse(value)) ? new Date(value).toISOString() : new Date().toISOString();
}

function eventFromBlock(block: string, source: SourceDefinition, tagFormat: "rss" | "atom"): RawEventInput | null {
  const title = firstMatch(block, "title");
  const content = firstMatch(block, "description") || firstMatch(block, "summary") || firstMatch(block, "content");
  const url = firstLink(block) || firstMatch(block, "guid") || firstMatch(block, "id");
  const published = firstTimestamp(block);
  const timestamp = normalizeTimestamp(published);
  if (!title) return null;

  return {
    sourceId: source.id,
    sourceName: source.name,
    sourceType: source.sourceType,
    category: source.category === "market_data" || source.category === "source_health" ? "financial_media" : source.category,
    title,
    content,
    url,
    language: "en",
    timestamp,
    rawPayload: { title, content, url, published, tagFormat },
    dedupHash: stableHash([source.id, url, title, timestamp.slice(0, 10)]),
    quality: "delayed",
  };
}

function parseRssItems(xml: string, source: SourceDefinition): RawEventInput[] {
  const rawEvents: RawEventInput[] = [];

  for (const match of Array.from(xml.matchAll(/<item[\s\S]*?<\/item>/gi))) {
    const event = eventFromBlock(match[0], source, "rss");
    if (event) rawEvents.push(event);

    if (rawEvents.length >= 40) break;
  }

  if (!rawEvents.length) {
    for (const match of Array.from(xml.matchAll(/<entry[\s\S]*?<\/entry>/gi))) {
      const event = eventFromBlock(match[0], source, "atom");
      if (event) rawEvents.push(event);
      if (rawEvents.length >= 40) break;
    }
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
