import { productionSources } from "@/collectors/registry";
import type { AssetSymbol, NewsCategory } from "@/lib/types";
import type { EventClusterInput, FreshnessStatus, NormalizedEventInput, RawEventInput } from "@/types/ingestion";
import { stableHash } from "@/processors/deduplication";

const sourceById = new Map(productionSources.map((source) => [source.id, source]));

const stopWords = new Set([
  "the",
  "and",
  "for",
  "with",
  "that",
  "this",
  "from",
  "into",
  "over",
  "after",
  "before",
  "amid",
  "about",
  "says",
  "said",
  "will",
  "are",
  "was",
  "were",
  "has",
  "have",
  "its",
  "their",
  "they",
  "you",
  "your",
  "market",
  "markets",
  "crypto",
  "cryptocurrency",
  "update",
]);

const entityRules: Array<{ entity: string; patterns: RegExp[] }> = [
  { entity: "Federal Reserve", patterns: [/\bfederal reserve\b/i, /\bfed\b/i, /\bfomc\b/i, /\bpowell\b/i] },
  { entity: "US Treasury", patterns: [/\btreasury\b/i, /\btga\b/i, /\bsecretary\b/i] },
  { entity: "SEC", patterns: [/\bsec\b/i, /\bsecurities and exchange commission\b/i] },
  { entity: "ETF", patterns: [/\betf\b/i, /\bibit\b/i, /\bfbtc\b/i, /\bblackrock\b/i, /\bfidelity\b/i] },
  { entity: "Tether", patterns: [/\btether\b/i, /\busdt\b/i] },
  { entity: "Circle", patterns: [/\bcircle\b/i, /\busdc\b/i] },
  { entity: "Binance", patterns: [/\bbinance\b/i] },
  { entity: "Coinbase", patterns: [/\bcoinbase\b/i] },
  { entity: "Nasdaq", patterns: [/\bnasdaq\b/i, /\btech stocks?\b/i] },
  { entity: "Gold", patterns: [/\bgold\b/i, /\bxau\b/i] },
  { entity: "OPEC", patterns: [/\bopec\b/i, /\boil\b/i, /\benergy\b/i] },
  { entity: "NATO", patterns: [/\bnato\b/i] },
];

const assetRules: Array<{ asset: AssetSymbol; patterns: RegExp[] }> = [
  { asset: "BTC", patterns: [/\bbtc\b/i, /\bbitcoin\b/i] },
  { asset: "ETH", patterns: [/\beth\b/i, /\bethereum\b/i, /\bstaking\b/i, /\bl2\b/i, /\blayer 2\b/i] },
  { asset: "SOL", patterns: [/\bsol\b/i, /\bsolana\b/i, /\bjupiter\b/i, /\btensor\b/i] },
  { asset: "USDT", patterns: [/\busdt\b/i, /\btether\b/i, /\bstablecoin/i, /\bdepeg\b/i] },
  { asset: "DXY", patterns: [/\bdxy\b/i, /\bdollar index\b/i, /\bus dollar\b/i] },
  { asset: "Gold", patterns: [/\bgold\b/i, /\bxau\b/i, /\bsafe haven\b/i] },
  { asset: "Nasdaq", patterns: [/\bnasdaq\b/i, /\btech stocks?\b/i, /\brisk appetite\b/i] },
  { asset: "US10Y", patterns: [/\bus10y\b/i, /\b10-?year\b/i, /\byield/i, /\btreasury\b/i] },
  { asset: "Fed", patterns: [/\bfed\b/i, /\bfomc\b/i, /\bfederal reserve\b/i, /\bpowell\b/i] },
];

const eventTypeRules: Array<{ eventType: string; patterns: RegExp[] }> = [
  { eventType: "central_bank_policy", patterns: [/\bfed\b/i, /\bfomc\b/i, /\bfederal reserve\b/i, /\becb\b/i, /\brate decision\b/i, /\bmonetary policy\b/i] },
  { eventType: "treasury_yield_move", patterns: [/\btreasury yield\b/i, /\b10-?year\b/i, /\bus10y\b/i, /\byields?\b/i] },
  { eventType: "dxy_move", patterns: [/\bdxy\b/i, /\bdollar index\b/i, /\bus dollar\b/i] },
  { eventType: "inflation_data", patterns: [/\bcpi\b/i, /\bpce\b/i, /\binflation\b/i, /\bprices\b/i] },
  { eventType: "employment_data", patterns: [/\bpayrolls?\b/i, /\bnfp\b/i, /\bunemployment\b/i, /\bjobs report\b/i] },
  { eventType: "etf_flow", patterns: [/\betf\b/i, /\bibit\b/i, /\bfbtc\b/i, /\bnet inflow\b/i, /\bnet outflow\b/i] },
  { eventType: "stablecoin_liquidity", patterns: [/\bstablecoin/i, /\busdt\b/i, /\busdc\b/i, /\btether\b/i, /\bmint\b/i, /\bburn\b/i, /\bdepeg\b/i] },
  { eventType: "exchange_risk", patterns: [/\bexchange\b/i, /\bbinance\b/i, /\bcoinbase\b/i, /\breserves?\b/i, /\bwithdrawals?\b/i] },
  { eventType: "regulation", patterns: [/\bsec\b/i, /\blawsuit\b/i, /\bregulat/i, /\bcompliance\b/i, /\bsanctions?\b/i] },
  { eventType: "security_risk", patterns: [/\bhack\b/i, /\bexploit\b/i, /\bcyber\b/i, /\bsecurity\b/i] },
  { eventType: "liquidation_leverage", patterns: [/\bfunding\b/i, /\bleverage\b/i, /\bliquidation\b/i, /\bopen interest\b/i] },
  { eventType: "geopolitical_risk", patterns: [/\bnato\b/i, /\bopec\b/i, /\bwar\b/i, /\bgeopolitical\b/i, /\bsanctions?\b/i, /\boil\b/i] },
  { eventType: "institutional_adoption", patterns: [/\binstitutional\b/i, /\bblackrock\b/i, /\bfidelity\b/i, /\badoption\b/i] },
  { eventType: "crypto_market_structure", patterns: [/\bbitcoin\b/i, /\bethereum\b/i, /\bsolana\b/i, /\bcrypto\b/i, /\btoken\b/i] },
];

function textOf(event: RawEventInput) {
  return [event.title, event.content, event.sourceName, event.category].filter(Boolean).join(" ");
}

function tokenize(value: string) {
  return value
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2 && !stopWords.has(token))
    .slice(0, 80);
}

function unique<T>(values: T[]) {
  return Array.from(new Set(values));
}

function classifyEventType(event: RawEventInput) {
  const text = textOf(event);
  const matched = eventTypeRules.find((rule) => rule.patterns.some((pattern) => pattern.test(text)));
  if (matched) return matched.eventType;
  if (event.category === "central_banks") return "central_bank_policy";
  if (event.category === "geopolitics") return "geopolitical_risk";
  if (event.category === "stablecoins") return "stablecoin_liquidity";
  if (event.category === "derivatives") return "liquidation_leverage";
  if (event.category === "economic_data") return "macro_news";
  if (event.category === "crypto_media") return "crypto_market_structure";
  return "financial_market_news";
}

function extractEntities(event: RawEventInput) {
  const text = textOf(event);
  return unique(entityRules.filter((rule) => rule.patterns.some((pattern) => pattern.test(text))).map((rule) => rule.entity));
}

function extractAffectedAssets(event: RawEventInput) {
  const text = textOf(event);
  const assets = assetRules.filter((rule) => rule.patterns.some((pattern) => pattern.test(text))).map((rule) => rule.asset);
  if (!assets.length && event.category === "central_banks") return ["BTC", "ETH", "SOL", "DXY", "US10Y", "Fed"];
  if (!assets.length && event.category === "financial_media") return ["BTC", "ETH", "SOL", "Nasdaq"];
  if (!assets.length && event.category === "crypto_media") return ["BTC", "ETH", "SOL"];
  return unique(assets);
}

function freshnessStatus(timestamp: string): FreshnessStatus {
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return "unavailable";
  const ageMinutes = Math.max(0, (Date.now() - parsed) / 60_000);
  if (ageMinutes <= 15) return "live";
  if (ageMinutes <= 45) return "fresh";
  if (ageMinutes <= 90) return "delayed";
  if (ageMinutes <= 180) return "stale";
  return "stale_critical";
}

function reliabilityFor(event: RawEventInput) {
  const source = sourceById.get(event.sourceId);
  const name = event.sourceName.toLowerCase();
  if (name.includes("federal reserve")) return 97;
  if (name.includes("sec")) return 90;
  if (name.includes("cnbc")) return 85;
  if (name.includes("coindesk")) return 82;
  if (name.includes("cointelegraph")) return 72;
  if (source?.tier === 1) return 90;
  if (source?.tier === 2) return 80;
  return 65;
}

function confidenceFor(params: { reliability: number; eventType: string; entities: string[]; affectedAssets: string[]; freshness: FreshnessStatus }) {
  const freshnessWeight: Record<FreshnessStatus, number> = {
    live: 18,
    fresh: 16,
    delayed: 12,
    stale: 7,
    stale_critical: 3,
    unavailable: 0,
  };
  const entityBonus = Math.min(8, params.entities.length * 2);
  const assetBonus = Math.min(8, params.affectedAssets.length * 2);
  const typeBonus = params.eventType === "financial_market_news" ? 2 : 8;
  return Math.max(0, Math.min(100, Math.round(params.reliability * 0.58 + freshnessWeight[params.freshness] + entityBonus + assetBonus + typeBonus)));
}

function compactSummary(event: RawEventInput) {
  const sourceText = event.content || event.title;
  return sourceText.replace(/\s+/g, " ").trim().slice(0, 420);
}

export function normalizeRawEvent(event: RawEventInput): NormalizedEventInput {
  const eventType = classifyEventType(event);
  const entities = extractEntities(event);
  const affectedAssets = extractAffectedAssets(event);
  const freshness = freshnessStatus(event.timestamp);
  const sourceReliability = reliabilityFor(event);
  const confidence = confidenceFor({ reliability: sourceReliability, eventType, entities, affectedAssets, freshness });

  return {
    rawEventId: event.id,
    sourceId: event.sourceId,
    sourceName: event.sourceName,
    sourceType: event.sourceType,
    category: event.category,
    title: event.title,
    summary: compactSummary(event),
    url: event.url,
    language: event.language ?? "en",
    publishedAt: event.timestamp,
    eventTimestamp: event.timestamp,
    eventType,
    affectedAssets,
    entities,
    freshnessStatus: freshness,
    sourceReliability,
    quality: event.quality,
    confidence,
    processingStatus: "processed",
    normalizedPayload: {
      source: event.sourceName,
      sourceId: event.sourceId,
      sourceType: event.sourceType,
      url: event.url ?? null,
      published_at: event.timestamp,
      language: event.language ?? "en",
      dedup_hash: event.dedupHash,
      freshness_status: freshness,
      source_reliability: sourceReliability,
      deterministic_rules: {
        event_type: eventType,
        affected_assets: affectedAssets,
        entities,
      },
    },
  };
}

function canonicalUrl(value: string | undefined) {
  if (!value) return "";
  try {
    const url = new URL(value);
    url.hash = "";
    url.search = "";
    return `${url.hostname.replace(/^www\./, "")}${url.pathname.replace(/\/$/, "")}`.toLowerCase();
  } catch {
    return value.toLowerCase().split("?")[0].replace(/\/$/, "");
  }
}

function jaccard(left: string[], right: string[]) {
  if (!left.length || !right.length) return 0;
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  let intersection = 0;
  for (const token of leftSet) {
    if (rightSet.has(token)) intersection += 1;
  }
  return intersection / (leftSet.size + rightSet.size - intersection);
}

function hasAssetOverlap(left: string[], right: string[]) {
  if (!left.length || !right.length) return true;
  const rightSet = new Set(right);
  return left.some((asset) => rightSet.has(asset));
}

function withinHours(left: string, right: string, hours: number) {
  const a = Date.parse(left);
  const b = Date.parse(right);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  return Math.abs(a - b) <= hours * 60 * 60 * 1000;
}

function clusterTokens(event: NormalizedEventInput) {
  return tokenize(`${event.title} ${event.summary} ${event.entities.join(" ")} ${event.affectedAssets.join(" ")}`);
}

function clusterKeyFor(event: NormalizedEventInput, tokens: string[]) {
  const day = event.eventTimestamp.slice(0, 10);
  const seed = tokens.slice(0, 10).sort().join("-");
  return stableHash([event.eventType, day, event.affectedAssets.slice().sort().join(","), seed]);
}

export function clusterNormalizedEvents(events: NormalizedEventInput[]): EventClusterInput[] {
  const clusters: Array<EventClusterInput & { tokens: string[]; canonicalUrls: Set<string> }> = [];

  for (const event of events.sort((a, b) => Date.parse(a.eventTimestamp) - Date.parse(b.eventTimestamp))) {
    const tokens = clusterTokens(event);
    const eventUrl = canonicalUrl(event.url);
    let match = clusters.find((cluster) => {
      if (cluster.eventType !== event.eventType) return false;
      if (!withinHours(cluster.lastSeenAt, event.eventTimestamp, 72)) return false;
      if (!hasAssetOverlap(cluster.affectedAssets, event.affectedAssets)) return false;
      if (eventUrl && cluster.canonicalUrls.has(eventUrl)) return true;
      const similarity = jaccard(cluster.tokens, tokens);
      return similarity >= 0.72;
    });

    if (!match) {
      match = {
        clusterKey: clusterKeyFor(event, tokens),
        eventType: event.eventType,
        category: event.category,
        primaryTitle: event.title,
        affectedAssets: event.affectedAssets,
        entities: event.entities,
        firstSeenAt: event.eventTimestamp,
        lastSeenAt: event.eventTimestamp,
        eventCount: 0,
        sourceCount: 0,
        sourceReferences: [],
        similarityMethod: "single_event",
        confidence: event.confidence,
        tokens,
        canonicalUrls: new Set<string>(),
      };
      clusters.push(match);
    }

    if (eventUrl) match.canonicalUrls.add(eventUrl);
    match.firstSeenAt = Date.parse(event.eventTimestamp) < Date.parse(match.firstSeenAt) ? event.eventTimestamp : match.firstSeenAt;
    match.lastSeenAt = Date.parse(event.eventTimestamp) > Date.parse(match.lastSeenAt) ? event.eventTimestamp : match.lastSeenAt;
    match.affectedAssets = unique([...match.affectedAssets, ...event.affectedAssets]);
    match.entities = unique([...match.entities, ...event.entities]);
    match.sourceReferences.push({
      rawEventId: event.rawEventId,
      normalizedEventId: event.id,
      sourceId: event.sourceId,
      sourceName: event.sourceName,
      title: event.title,
      url: event.url,
      publishedAt: event.publishedAt,
    });
    match.eventCount = match.sourceReferences.length;
    match.sourceCount = new Set(match.sourceReferences.map((ref) => ref.sourceId)).size;
    match.similarityMethod = match.eventCount > 1 ? "deterministic_token_overlap" : "single_event";
    match.confidence = Math.round(match.sourceReferences.length > 1 ? Math.min(100, event.confidence + Math.min(12, match.sourceCount * 3)) : event.confidence);
    match.tokens = unique([...match.tokens, ...tokens]).slice(0, 120);
  }

  return clusters.map(({ tokens: _tokens, canonicalUrls: _canonicalUrls, ...cluster }) => cluster);
}

export function normalizeAndClusterRawEvents(rawEvents: RawEventInput[]) {
  const normalizedEvents = rawEvents.map(normalizeRawEvent);
  const eventClusters = clusterNormalizedEvents(normalizedEvents);
  const duplicatesDetected = eventClusters.reduce((total, cluster) => total + Math.max(0, cluster.eventCount - 1), 0);
  return { normalizedEvents, eventClusters, duplicatesDetected };
}

export function auditRawEventDedup(events: RawEventInput[]) {
  const hashCounts = new Map<string, number>();
  const titleCounts = new Map<string, number>();
  const urlCounts = new Map<string, number>();

  for (const event of events) {
    hashCounts.set(event.dedupHash, (hashCounts.get(event.dedupHash) ?? 0) + 1);
    titleCounts.set(event.title.trim().toLowerCase(), (titleCounts.get(event.title.trim().toLowerCase()) ?? 0) + 1);
    const url = canonicalUrl(event.url);
    if (url) urlCounts.set(url, (urlCounts.get(url) ?? 0) + 1);
  }

  return {
    total: events.length,
    uniqueDedupHashes: hashCounts.size,
    duplicateHashes: Array.from(hashCounts.values()).filter((count) => count > 1).reduce((total, count) => total + count - 1, 0),
    duplicateTitles: Array.from(titleCounts.values()).filter((count) => count > 1).reduce((total, count) => total + count - 1, 0),
    duplicateUrls: Array.from(urlCounts.values()).filter((count) => count > 1).reduce((total, count) => total + count - 1, 0),
  };
}
