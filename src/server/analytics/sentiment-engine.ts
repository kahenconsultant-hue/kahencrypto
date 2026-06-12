import type { AssetSymbol, ConfidenceResult, DirectionalBias, IntelligenceTimeframe, TransmissionChannel } from "@/lib/types";
import { getEngineLastUpdatedAt, getSignalSnapshot } from "@/server/analytics/market-signals";
import { confidenceLabel, minutesSince } from "@/server/analytics/quality-engine";
import { clampPercent, clampSigned } from "@/server/analytics/scoring-engine";
import { getIntelligenceReliabilityReportSync } from "@/server/intelligence/reliability-engine";
import { normalizeRawEvent } from "@/processors/event-normalization";
import { getLatestNormalizedEventsSync, getLatestRawEventsSync } from "@/storage/ingestion-store";
import type { NormalizedEventInput, RawEventInput } from "@/types/ingestion";
import { classifyGeopoliticalEvent } from "@/server/analytics/geopolitical-classifier";

export type SentimentCategory =
  | "macro"
  | "monetary policy"
  | "regulation"
  | "ETF flows"
  | "exchange risk"
  | "stablecoin risk"
  | "geopolitics"
  | "energy"
  | "cyber/security"
  | "institutional adoption"
  | "liquidation/leverage"
  | "on-chain whale movement";

export interface StructuredHeadlineSignal {
  id: string;
  source: string;
  title: string;
  timestamp: string;
  affectedAssets: AssetSymbol[];
  sentimentPolarity: number;
  confidence: number;
  category: SentimentCategory;
  transmissionChannel: TransmissionChannel;
  expectedImpactDirection: DirectionalBias;
  expectedImpactHorizon: IntelligenceTimeframe;
  severity: number;
  novelty: number;
  pricedIn: boolean;
  sourceCredibility: number;
  marketReactionConfirmation: number;
  marketRelevanceScore: number;
  eventRelevanceScore: number;
  impactScore: number;
  relevanceLabel: "ignored" | "low_impact" | "important" | "high_impact";
  weightedScore: number;
}

type SentimentBucket = "crypto_native" | "macro" | "institutional" | "regulatory" | "geopolitical";

const trackedAssets: AssetSymbol[] = ["BTC", "ETH", "SOL", "USDT", "DXY", "Gold", "Nasdaq", "US10Y"];
const relevanceThreshold = 40;
const impactThreshold = 45;
const minimumConfidenceThreshold = 20;
const minimumSourceQualityThreshold = 45;
const sentimentBucketWeights: Record<SentimentBucket, number> = {
  crypto_native: 0.4,
  macro: 0.2,
  institutional: 0.15,
  regulatory: 0.15,
  geopolitical: 0.1,
};

const eventCategoryMap: Record<string, SentimentCategory> = {
  central_bank_policy: "monetary policy",
  treasury_yield_move: "macro",
  dxy_move: "macro",
  inflation_data: "macro",
  employment_data: "macro",
  etf_flow: "ETF flows",
  stablecoin_liquidity: "stablecoin risk",
  exchange_risk: "exchange risk",
  regulation: "regulation",
  security_risk: "cyber/security",
  liquidation_leverage: "liquidation/leverage",
  geopolitical_risk: "geopolitics",
  institutional_adoption: "institutional adoption",
  crypto_market_structure: "macro",
};

const channelByCategory: Record<SentimentCategory, TransmissionChannel> = {
  macro: "risk_on_risk_off",
  "monetary policy": "rates",
  regulation: "regulatory_risk",
  "ETF flows": "etf_flows",
  "exchange risk": "onchain_activity",
  "stablecoin risk": "stablecoin_flows",
  geopolitics: "geopolitical_risk",
  energy: "geopolitical_risk",
  "cyber/security": "sentiment_news_shock",
  "institutional adoption": "etf_flows",
  "liquidation/leverage": "leverage",
  "on-chain whale movement": "onchain_activity",
};

function payloadText(event: NormalizedEventInput, key: string) {
  const value = event.normalizedPayload?.[key];
  return typeof value === "string" ? value : "";
}

function eventText(event: NormalizedEventInput) {
  return [
    event.title,
    event.summary,
    payloadText(event, "original_title"),
    payloadText(event, "original_summary"),
    event.entities.join(" "),
    event.affectedAssets.join(" "),
    event.sourceName,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function loadSentimentEvents(limit = 160): { events: NormalizedEventInput[]; source: "normalized_events" | "raw_events_fallback"; rawEventsAvailable: number } {
  const normalized = getLatestNormalizedEventsSync(limit);
  const rawEvents = getLatestRawEventsSync(limit);
  if (normalized.length) return { events: normalized, source: "normalized_events", rawEventsAvailable: rawEvents.length };

  return {
    events: rawEvents.map((event: RawEventInput) => normalizeRawEvent(event)),
    source: "raw_events_fallback",
    rawEventsAvailable: rawEvents.length,
  };
}

function polarityFromEvent(event: NormalizedEventInput) {
  const text = eventText(event);
  const negative = ["hawkish", "higher", "hot inflation", "sticky inflation", "lawsuit", "sanction", "outflow", "hack", "exploit", "depeg", "selloff", "liquidation", "war", "attack", "rate hike", "tariff", "default"].filter((term) => text.includes(term)).length;
  const positive = ["dovish", "rate cut", "inflow", "etf approval", "spot etf approval", "crypto adoption", "institutional adoption", "record inflow", "easing", "stablecoin growth", "accumulation", "rally", "risk appetite"].filter((term) => text.includes(term)).length;
  const raw = (positive - negative) * 28;
  if (event.eventType === "central_bank_policy" && /hawkish|higher|inflation/i.test(text)) return -55;
  if (event.eventType === "etf_flow" && /outflow/i.test(text)) return -60;
  if (event.eventType === "etf_flow" && /inflow/i.test(text)) return 55;
  if (event.eventType === "geopolitical_risk") return geopoliticalEventGate(event).allowed ? -35 : 0;
  return clampSigned(raw);
}

function directionFromScore(score: number): DirectionalBias {
  if (score >= 18) return "bullish";
  if (score <= -18) return "bearish";
  if (Math.abs(score) <= 7) return "neutral";
  return "mixed";
}

function noveltyScore(event: NormalizedEventInput, allEvents: NormalizedEventInput[]) {
  const similar = allEvents.filter((item) => item.eventType === event.eventType && item.sourceName === event.sourceName).length;
  return clampPercent(90 - Math.max(0, similar - 1) * 12);
}

function recencyScore(event: NormalizedEventInput) {
  const age = minutesSince(event.eventTimestamp);
  if (age <= 45) return 100;
  if (age <= 180) return 75;
  if (age <= 1440) return 45;
  if (age <= 4320) return 20;
  return 5;
}

function severityScore(event: NormalizedEventInput, polarity: number) {
  const typeWeight = ["central_bank_policy", "inflation_data", "etf_flow", "stablecoin_liquidity", "regulation", "geopolitical_risk", "liquidation_leverage"].includes(event.eventType) ? 68 : 42;
  return clampPercent(typeWeight + Math.abs(polarity) * 0.28 + event.affectedAssets.length * 3);
}

function administrativeNotice(event: NormalizedEventInput) {
  const text = eventText(event);
  const lowValueOperationalTerms = [
    "approval of application",
    "approval of related applications",
    "removing outdated entries",
    "modernization effort",
    "rescinds policy",
    "denials of settlements",
    "settlements in enforcement actions",
    "enforcement results for fiscal year",
    "termination of enforcement actions",
    "former employee",
    "resolution plan feedback",
    "does not object to the conversion",
    "payment account",
  ];
  if (lowValueOperationalTerms.some((term) => text.includes(term))) return true;
  const administrativeTerms = [
    "calendar",
    "schedule",
    "minutes",
    "agenda",
    "appointment",
    "appoints",
    "application by",
    "applications by",
    "approval of application",
    "approval of related applications",
    "named to",
    "board appointment",
    "personnel change",
    "staff announcement",
    "committee meeting",
    "committee meetings",
    "internal policy",
    "routine enforcement",
    "enforcement action with former employee",
    "former employee",
    "resolution plan feedback",
    "bank holding company",
    "bank mhc",
    "settlement notice",
    "rescinds policy",
    "settlements in enforcement actions",
    "non-market legal",
    "removing outdated entries",
    "modernization effort",
    "operating status",
    "holiday",
    "webcast",
    "remarks by",
    "speech by",
    "press availability",
    "technical notice",
    "سررسید",
    "برنامه",
    "تقویم",
  ];
  return administrativeTerms.some((term) => text.includes(term)) && !/(cpi|ppi|inflation|rate decision|fed funds|treasury yield|sanction|crypto|bitcoin|ethereum|stablecoin|etf|war|attack)/i.test(text);
}

function geopoliticalEventGate(event: NormalizedEventInput) {
  const text = eventText(event);
  const classification = classifyGeopoliticalEvent(event);
  const allowed = classification.accepted;
  const rejected = !classification.accepted || administrativeNotice(event);
  const directCryptoChannel = /(bitcoin|btc|ethereum|eth|solana|sol|crypto|stablecoin|tether|usdt|exchange|capital controls|sanctions?.*(crypto|stablecoin|exchange|rails)|crypto rails)/i.test(text);
  return {
    allowed,
    directCryptoChannel,
    rejected,
    geopoliticalConfidence: classification.geopoliticalConfidence,
    relevanceScore: classification.relevanceScore,
    rejectionReason: classification.rejectionReason,
  };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function includesMarketTerm(text: string, term: string) {
  if (/\s/.test(term)) return text.includes(term);
  return new RegExp(`(^|[^a-z0-9])${escapeRegExp(term)}([^a-z0-9]|$)`, "i").test(text);
}

function marketRelevanceScore(params: {
  event: NormalizedEventInput;
  category: SentimentCategory;
  novelty: number;
  severity: number;
}) {
  const text = eventText(params.event);
  const sourceText =
    [payloadText(params.event, "original_title"), payloadText(params.event, "original_summary")]
      .filter(Boolean)
      .join(" ")
      .toLowerCase() || `${params.event.title} ${params.event.summary}`.toLowerCase();
  const cryptoTerms = ["bitcoin", "btc", "ethereum", "eth", "solana", "sol", "crypto", "stablecoin", "tether", "usdt", "coinbase", "binance", "etf", "defi"];
  const macroTerms = ["fed", "fomc", "inflation", "cpi", "ppi", "nfp", "payroll", "employment", "unemployment", "treasury", "yield", "dollar", "dxy", "rates", "rate decision", "fed funds", "ecb"];
  const highValueTerms = ["fomc", "rate decision", "cpi", "ppi", "nfp", "nonfarm", "etf approval", "etf flow", "exchange failure", "bankruptcy", "depeg", "stablecoin", "sanction", "treasury liquidity", "war", "attack"];
  const broadMarketStressTerms = ["asia markets", "european stocks", "stock futures", "stocks to open lower", "stocks fall", "stocks slide", "risk-off", "risk appetite", "oil jumps", "oil inventories", "middle east", "iran", "russia", "drone", "missile", "safe haven"];
  const hasCryptoTerm = cryptoTerms.some((term) => includesMarketTerm(sourceText, term));
  const hasMacroTerm = macroTerms.some((term) => includesMarketTerm(sourceText, term));
  const hasHighValueTerm = highValueTerms.some((term) => includesMarketTerm(sourceText, term));
  const hasBroadMarketStress = broadMarketStressTerms.some((term) => includesMarketTerm(sourceText, term));
  const geopoliticalGate = geopoliticalEventGate(params.event);
  const hasDirectCryptoChannel = hasCryptoTerm || geopoliticalGate.directCryptoChannel || /(exchange disruption|exchange failure|stablecoin risk|capital controls|sanctions?.*(crypto|stablecoin|exchange|rails)|crypto rails)/i.test(sourceText);
  const isGenericCompanyStory =
    params.event.eventType === "financial_market_news" &&
    !hasCryptoTerm &&
    !hasMacroTerm &&
    !hasHighValueTerm &&
    !hasBroadMarketStress;
  const cryptoRelevance = hasCryptoTerm || params.event.affectedAssets.some((asset) => ["BTC", "ETH", "SOL", "USDT"].includes(asset)) ? 28 : 0;
  const macroRelevance = hasMacroTerm || ["macro", "monetary policy", "geopolitics", "regulation"].includes(params.category) ? 24 : 0;
  const historicalImpact = ["monetary policy", "macro", "ETF flows", "stablecoin risk", "regulation", "geopolitics", "liquidation/leverage", "exchange risk"].includes(params.category) ? 24 : 8;
  const assetLinkage = Math.min(18, params.event.affectedAssets.length * 5 + (params.event.affectedAssets.some((asset) => trackedAssets.includes(asset as AssetSymbol)) ? 6 : 0));
  const noveltyImpact = params.novelty * 0.16;
  const highValueBoost = highValueTerms.some((term) => includesMarketTerm(sourceText, term)) ? 12 : 0;
  const score = clampPercent(cryptoRelevance + macroRelevance + historicalImpact + assetLinkage + noveltyImpact + params.severity * 0.1 + highValueBoost);
  let cappedScore = score;
  if (!hasCryptoTerm && hasMacroTerm) cappedScore = Math.min(cappedScore, 80);
  if (params.category === "geopolitics" && !geopoliticalGate.allowed) cappedScore = Math.min(cappedScore, 30);
  if (params.category === "geopolitics" && geopoliticalGate.allowed && !hasDirectCryptoChannel) cappedScore = Math.min(cappedScore, 60);
  if (isGenericCompanyStory) cappedScore = Math.min(35, cappedScore);
  if (administrativeNotice(params.event)) cappedScore = Math.min(35, cappedScore);
  return cappedScore;
}

function relevanceLabel(score: number): StructuredHeadlineSignal["relevanceLabel"] {
  if (score < 40) return "ignored";
  if (score < 70) return "low_impact";
  if (score < 85) return "important";
  return "high_impact";
}

function newsAgeMinutes(headline: Pick<StructuredHeadlineSignal, "timestamp">) {
  return minutesSince(headline.timestamp);
}

function passesSentimentQualityGate(headline: StructuredHeadlineSignal) {
  if (headline.marketRelevanceScore < relevanceThreshold) return false;
  if (headline.impactScore < impactThreshold) return false;
  if (headline.confidence < minimumConfidenceThreshold) return false;
  if (headline.sourceCredibility < minimumSourceQualityThreshold) return false;
  if (headline.category === "geopolitics" && (headline.marketRelevanceScore < 70 || headline.impactScore < 70)) return false;
  return true;
}

function marketReactionForEvent(event: NormalizedEventInput) {
  const snapshot = getSignalSnapshot();
  const scores = event.affectedAssets
    .map((asset) => {
      const key =
        asset === "BTC"
          ? "btc_trend_24h"
          : asset === "ETH"
            ? "eth_trend_24h"
            : asset === "SOL"
              ? "sol_trend_24h"
              : asset === "DXY"
                ? "dxy_trend_24h"
                : asset === "Gold"
                  ? "gold_trend_24h"
                  : asset === "Nasdaq"
                    ? "nasdaq_trend_24h"
                    : asset === "US10Y"
                      ? "us10y_trend_24h"
                      : null;
      const signal = key ? snapshot.byKey[key] : null;
      if (!signal || signal.value === null || signal.quality === "unavailable" || signal.quality === "estimated") return null;
      return Math.min(100, Math.abs(signal.value) * 18);
    })
    .filter((value): value is number => value !== null);
  if (!scores.length) return 0;
  return clampPercent(scores.reduce((sum, score) => sum + score, 0) / scores.length);
}

function impactScore(params: {
  sourceCredibility: number;
  marketRelevance: number;
  assetRelevance: number;
  recency: number;
}) {
  return clampPercent(
    params.sourceCredibility * 0.28 +
      params.marketRelevance * 0.34 +
      params.assetRelevance * 0.22 +
      params.recency * 0.16,
  );
}

function headlineSignal(event: NormalizedEventInput, allEvents: NormalizedEventInput[]): StructuredHeadlineSignal {
  const polarity = polarityFromEvent(event);
  const novelty = noveltyScore(event, allEvents);
  const severity = severityScore(event, polarity);
  const marketReaction = marketReactionForEvent(event);
  const recency = recencyScore(event);
  const sourceCredibility = event.sourceReliability;
  const assetRelevance = Math.min(100, event.affectedAssets.length ? 55 + event.affectedAssets.length * 9 : 25);
  const category = eventCategoryMap[event.eventType] ?? "macro";
  const relevance = marketRelevanceScore({ event, category, novelty, severity });
  const headlineImpact = impactScore({ sourceCredibility, marketRelevance: relevance, assetRelevance, recency });
  const weightedMagnitude = sourceCredibility * 0.18 + novelty * 0.12 + assetRelevance * 0.14 + severity * 0.12 + marketReaction * 0.1 + recency * 0.08 + relevance * 0.16 + headlineImpact * 0.1;
  const weightedScore = polarity === 0 ? 0 : clampSigned(Math.sign(polarity) * weightedMagnitude);
  const confidence = clampPercent(sourceCredibility * 0.27 + novelty * 0.14 + severity * 0.16 + recency * 0.16 + marketReaction * 0.11 + relevance * 0.16);

  return {
    id: event.id ?? event.rawEventId ?? event.title,
    source: event.sourceName,
    title: event.title,
    timestamp: event.eventTimestamp,
    affectedAssets: event.affectedAssets.filter((asset): asset is AssetSymbol => trackedAssets.includes(asset as AssetSymbol)),
    sentimentPolarity: polarity,
    confidence,
    category,
    transmissionChannel: channelByCategory[category],
    expectedImpactDirection: directionFromScore(weightedScore),
    expectedImpactHorizon: recency >= 75 ? "24h" : "7d",
    severity,
    novelty,
    pricedIn: marketReaction < 18 && Math.abs(polarity) > 35,
    sourceCredibility,
    marketReactionConfirmation: marketReaction,
    marketRelevanceScore: relevance,
    eventRelevanceScore: relevance,
    impactScore: headlineImpact,
    relevanceLabel: relevanceLabel(relevance),
    weightedScore,
  };
}

function sentimentConfidence(headlines: StructuredHeadlineSignal[]): ConfidenceResult {
  const reliability = getIntelligenceReliabilityReportSync();
  if (!headlines.length) {
    return {
      available: false,
      score: null,
      label: "unavailable",
      formula: "Sentiment confidence unavailable: هیچ خبر market-relevant پذیرفته‌شده‌ای وجود ندارد.",
      availableGroups: [],
      missingGroups: ["sentiment"],
      explanation: "سنتیمنت فقط وقتی ساخته می‌شود که حداقل یک خبر پذیرفته‌شده با relevance کافی وجود داشته باشد.",
    };
  }
  const averageConfidence = headlines.reduce((sum, item) => sum + item.confidence, 0) / headlines.length;
  const sourceDiversity = new Set(headlines.map((item) => item.source)).size;
  const depthScore = clampPercent(Math.min(100, headlines.length * 12));
  const diversityScore = clampPercent(Math.min(100, sourceDiversity * 35));
  const baseScore = clampPercent(averageConfidence * 0.72 + depthScore * 0.16 + diversityScore * 0.12);
  const reliabilityCap = reliability.confidenceCaps.sentiment;
  const sparseCap = headlines.length < 5 ? 45 : 100;
  const diversityCap = sourceDiversity < 2 ? 55 : 100;
  const coverageCap = reliability.sentimentCoverage < 0.35 ? 60 : 100;
  const last24hCount = headlines.filter((headline) => (newsAgeMinutes(headline) ?? Infinity) <= 1440).length;
  const last72hCount = headlines.filter((headline) => (newsAgeMinutes(headline) ?? Infinity) <= 4320).length;
  const freshnessCap = last24hCount > 0 ? 100 : last72hCount > 0 ? 70 : 55;
  const score = clampPercent(Math.min(reliabilityCap, sparseCap, diversityCap, coverageCap, freshnessCap, baseScore));
  return {
    available: true,
    score,
    label: confidenceLabel(score),
    formula: "Sentiment confidence = اعتبار منبع، تازگی، novelty، شدت خبر، عمق نمونه و تنوع منبع؛ سپس با سقف reliability و sparse coverage محدود می‌شود.",
    availableGroups: ["news", "sentiment"],
    missingGroups: headlines.length < 5 ? ["news"] : [],
    explanation: headlines.length < 5
      ? "سنتیمنت از خبرهای واقعی پذیرفته‌شده ساخته شده، اما به‌دلیل عمق نمونه پایین سقف اطمینان دارد."
      : "سنتیمنت از رویدادهای خبری واقعی ساخته شده و با مدل اعتبارسنجی منابع سقف‌گذاری شده است.",
  };
}

function sourceQualityAudit(scoredHeadlines: StructuredHeadlineSignal[]) {
  const grouped = new Map<string, StructuredHeadlineSignal[]>();
  for (const headline of scoredHeadlines) {
    grouped.set(headline.source, [...(grouped.get(headline.source) ?? []), headline]);
  }

  return Array.from(grouped.entries())
    .map(([source, rows]) => {
      const accepted = rows.filter(passesSentimentQualityGate);
      const rejected = rows.length - accepted.length;
      const rejectionReasons = Array.from(
        new Set(
          rows
            .filter((item) => item.marketRelevanceScore < relevanceThreshold)
            .map((item) => {
              if (item.sourceCredibility < minimumSourceQualityThreshold) return "source_quality_below_threshold";
              if (item.confidence < minimumConfidenceThreshold) return "confidence_below_threshold";
              if (item.impactScore < impactThreshold) return "impact_below_threshold";
              if (item.category === "geopolitics" && (item.marketRelevanceScore < 70 || item.impactScore < 70)) return "geopolitical_directness_below_threshold";
              if (!item.affectedAssets.length) return "asset_mapping_missing";
              return "market_relevance_below_threshold";
            }),
        ),
      );
      return {
        source,
        articlesCollected: rows.length,
        accepted: accepted.length,
        rejected,
        coverageScore: clampPercent((accepted.length / Math.max(1, rows.length)) * 100),
        averageRelevance: Math.round(rows.reduce((sum, item) => sum + item.marketRelevanceScore, 0) / Math.max(1, rows.length)),
        rejectionReasons,
      };
    })
    .sort((left, right) => right.articlesCollected - left.articlesCollected);
}

function sentimentBucketForCategory(category: SentimentCategory): SentimentBucket {
  if (category === "macro" || category === "monetary policy") return "macro";
  if (category === "institutional adoption") return "institutional";
  if (category === "regulation") return "regulatory";
  if (category === "geopolitics" || category === "energy") return "geopolitical";
  return "crypto_native";
}

function sentimentBucketLabelFa(bucket: SentimentBucket) {
  const labels: Record<SentimentBucket, string> = {
    crypto_native: "سنتیمنت بومی کریپتو",
    macro: "سنتیمنت کلان",
    institutional: "سنتیمنت نهادی",
    regulatory: "سنتیمنت رگولاتوری",
    geopolitical: "سنتیمنت ژئوپلیتیک",
  };
  return labels[bucket];
}

function directionalConfirmation(headlines: StructuredHeadlineSignal[]) {
  const positiveSources = new Set(
    headlines
      .filter((headline) => headline.impactScore >= 70 && headline.weightedScore > 12)
      .map((headline) => headline.source),
  );
  const negativeSources = new Set(
    headlines
      .filter((headline) => headline.impactScore >= 70 && headline.weightedScore < -12)
      .map((headline) => headline.source),
  );
  return {
    positiveSources: positiveSources.size,
    negativeSources: negativeSources.size,
    positiveConfirmed: positiveSources.size >= 2,
    negativeConfirmed: negativeSources.size >= 2,
  };
}

export function calculateWeightedMarketSentiment(headlines: StructuredHeadlineSignal[]) {
  const buckets = (Object.keys(sentimentBucketWeights) as SentimentBucket[]).map((bucket) => {
    const related = headlines.filter((headline) => sentimentBucketForCategory(headline.category) === bucket);
    const averageScore = related.length
      ? clampSigned(related.reduce((sum, item) => sum + item.weightedScore, 0) / related.length)
      : 0;
    return {
      bucket,
      labelFa: sentimentBucketLabelFa(bucket),
      score: averageScore,
      count: related.length,
      configuredWeight: sentimentBucketWeights[bucket],
      weightedContribution: clampSigned(averageScore * sentimentBucketWeights[bucket]),
    };
  });
  const rawSentimentScore = clampSigned(buckets.reduce((sum, bucket) => sum + bucket.weightedContribution, 0));
  const confirmation = directionalConfirmation(headlines);
  const sentimentScore =
    rawSentimentScore > 10 && !confirmation.positiveConfirmed
      ? Math.min(8, rawSentimentScore)
      : rawSentimentScore < -10 && !confirmation.negativeConfirmed
        ? Math.max(-8, rawSentimentScore)
        : rawSentimentScore;
  const totalAccepted = Math.max(1, headlines.length);
  const dominant = buckets
    .map((bucket) => ({ bucket: bucket.bucket, labelFa: bucket.labelFa, share: bucket.count / totalAccepted }))
    .sort((left, right) => right.share - left.share)[0];
  return {
    sentimentScore,
    rawSentimentScore,
    directionalConfirmation: confirmation,
    buckets,
    concentration:
      dominant && dominant.share >= 0.7
        ? {
            bucket: dominant.bucket,
            labelFa: dominant.labelFa,
            sharePercent: clampPercent(dominant.share * 100),
            disclosureFa: `سنتیمنت فعلی از نظر دسته‌بندی متمرکز است: ${dominant.labelFa} حدود ${Math.round(dominant.share * 100)}٪ خبرهای پذیرفته‌شده را تشکیل می‌دهد؛ confidence باید محافظه‌کارانه خوانده شود.`,
          }
        : null,
  };
}

function buildAudit(params: {
  events: NormalizedEventInput[];
  scoredHeadlines: StructuredHeadlineSignal[];
  highImpactHeadlines: StructuredHeadlineSignal[];
  ignoredHeadlines: StructuredHeadlineSignal[];
  staleExcludedHeadlines: StructuredHeadlineSignal[];
  loadedFrom: "normalized_events" | "raw_events_fallback";
  rawEventsAvailable: number;
}) {
  const last24h = params.scoredHeadlines.filter((headline) => minutesSince(headline.timestamp) !== null && (minutesSince(headline.timestamp) ?? Infinity) <= 1440);
  const mapped = params.scoredHeadlines.filter((headline) => headline.affectedAssets.length);
  const sourceQuality = sourceQualityAudit(params.scoredHeadlines);
  const unmapped = params.scoredHeadlines.filter((headline) => !headline.affectedAssets.length);
  const accepted = params.highImpactHeadlines;
  const displayed = accepted.slice(0, 8);
  const examples = {
    positive: accepted.filter((item) => item.weightedScore > 12).slice(0, 3),
    negative: accepted.filter((item) => item.weightedScore < -12).slice(0, 3),
    neutral: accepted.filter((item) => Math.abs(item.weightedScore) <= 12).slice(0, 3),
  };

  return {
    loadedFrom: params.loadedFrom,
    thresholds: {
      minimumRelevance: relevanceThreshold,
      minimumImpact: impactThreshold,
      minimumConfidence: minimumConfidenceThreshold,
      minimumSourceQuality: minimumSourceQualityThreshold,
    },
    counts: {
      rawEventsAvailable: params.rawEventsAvailable,
      ingested: params.events.length,
      normalized: params.events.length,
      last24h: last24h.length,
      assetMapped: mapped.length,
      unmapped: unmapped.length,
      sentimentScored: accepted.length,
      displayed: displayed.length,
      discardedByRelevance: params.ignoredHeadlines.length,
      discardedAsStale: params.staleExcludedHeadlines.length,
    },
    sample: params.scoredHeadlines.slice(0, 20).map((headline) => ({
      source: headline.source,
      title: headline.title,
      ingestionStatus: params.loadedFrom === "normalized_events" ? "normalized_event_loaded" : "raw_event_loaded_from_cache",
      normalizationStatus: params.loadedFrom === "normalized_events" ? "processed" : "runtime_normalized_from_raw_cache",
      relevanceScore: headline.marketRelevanceScore,
      impactScore: headline.impactScore,
      affectedAssets: headline.affectedAssets,
      mappingConfidence: headline.affectedAssets.length ? clampPercent(55 + headline.affectedAssets.length * 10) : 0,
      sentimentClassification: headline.weightedScore > 12 ? "positive" : headline.weightedScore < -12 ? "negative" : "neutral",
      confidence: headline.confidence,
      finalDecision:
        headline.marketRelevanceScore < relevanceThreshold
          ? "excluded_relevance_below_threshold"
          : headline.impactScore < impactThreshold
            ? "excluded_impact_below_threshold"
            : headline.confidence < minimumConfidenceThreshold
              ? "excluded_confidence_below_threshold"
              : headline.sourceCredibility < minimumSourceQualityThreshold
                ? "excluded_source_quality_below_threshold"
                : headline.category === "geopolitics" && (headline.marketRelevanceScore < 70 || headline.impactScore < 70)
                  ? "excluded_geopolitical_directness_below_threshold"
                : "included",
    })),
    assetMapping: trackedAssets.map((asset) => {
      const related = params.scoredHeadlines.filter((headline) => headline.affectedAssets.includes(asset));
      return {
        asset,
        mappedItems: related.length,
        mappingConfidence: related.length ? clampPercent(Math.min(100, 45 + related.length * 8)) : 0,
      };
    }),
    topUnmappedCauses: unmapped.length ? ["asset_mapping_missing", "generic_macro_or_administrative_headline"] : [],
    sentimentExamples: {
      positive: examples.positive.map((item) => ({ title: item.title, source: item.source, rawSentiment: item.sentimentPolarity, confidence: item.confidence, finalSentiment: item.weightedScore })),
      negative: examples.negative.map((item) => ({ title: item.title, source: item.source, rawSentiment: item.sentimentPolarity, confidence: item.confidence, finalSentiment: item.weightedScore })),
      neutral: examples.neutral.map((item) => ({ title: item.title, source: item.source, rawSentiment: item.sentimentPolarity, confidence: item.confidence, finalSentiment: item.weightedScore })),
    },
    sourceQuality,
    contributingArticles: displayed.map((item) => ({
      title: item.title,
      source: item.source,
      sentimentWeight: item.weightedScore,
      confidence: item.confidence,
      relevanceScore: item.marketRelevanceScore,
      impactScore: item.impactScore,
      affectedAssets: item.affectedAssets,
    })),
  };
}

export function getSentimentReport() {
  const loaded = loadSentimentEvents(160);
  const events = loaded.events;
  const scoredHeadlines = events.map((event) => headlineSignal(event, events));
  const ignoredHeadlines = scoredHeadlines.filter((item) => !passesSentimentQualityGate(item));
  const staleExcludedHeadlines = scoredHeadlines.filter((item) => passesSentimentQualityGate(item) && (newsAgeMinutes(item) ?? Infinity) > 7 * 24 * 60);
  const highImpactHeadlines = scoredHeadlines
    .filter(passesSentimentQualityGate)
    .filter((item) => (newsAgeMinutes(item) ?? Infinity) <= 7 * 24 * 60)
    .sort((left, right) => Math.abs(right.weightedScore) - Math.abs(left.weightedScore));
  const weightedSentiment = calculateWeightedMarketSentiment(highImpactHeadlines);
  const sentimentScore = highImpactHeadlines.length ? weightedSentiment.sentimentScore : 0;
  const confidence = sentimentConfidence(highImpactHeadlines);
  const byAsset = trackedAssets.map((asset) => {
    const related = highImpactHeadlines.filter((headline) => headline.affectedAssets.includes(asset));
    const score = related.length ? clampSigned(related.reduce((sum, item) => sum + item.weightedScore, 0) / related.length) : 0;
    return { asset, score, direction: related.length ? directionFromScore(score) : "neutral" as DirectionalBias, headlines: related.slice(0, 3) };
  });
  const categories = Array.from(new Set(highImpactHeadlines.map((item) => item.category)));
  const byCategory = categories.map((category) => {
    const related = highImpactHeadlines.filter((item) => item.category === category);
    return { category, score: clampSigned(related.reduce((sum, item) => sum + item.weightedScore, 0) / Math.max(1, related.length)) };
  });
  const positive = weightedSentiment.directionalConfirmation.positiveConfirmed ? highImpactHeadlines.filter((item) => item.weightedScore > 12).length : 0;
  const negative = weightedSentiment.directionalConfirmation.negativeConfirmed ? highImpactHeadlines.filter((item) => item.weightedScore < -12).length : 0;
  const neutral = Math.max(0, highImpactHeadlines.length - positive - negative);
  const pricedIn = highImpactHeadlines.filter((item) => item.pricedIn);
  const audit = buildAudit({ events, scoredHeadlines, highImpactHeadlines, ignoredHeadlines, staleExcludedHeadlines, loadedFrom: loaded.source, rawEventsAvailable: loaded.rawEventsAvailable });

  return {
    generatedAt: new Date().toISOString(),
    lastUpdatedAt: getEngineLastUpdatedAt(),
    sentimentScore,
    rawSentimentScore: weightedSentiment.rawSentimentScore,
    directionalConfirmation: weightedSentiment.directionalConfirmation,
    confidence,
    byAsset,
    byCategory,
    bySentimentCategory: weightedSentiment.buckets,
    categoryConcentration: weightedSentiment.concentration,
    split: { positive, negative, neutral },
    highImpactHeadlines: highImpactHeadlines.slice(0, 8),
    ignoredHeadlinesCount: ignoredHeadlines.length,
    acceptedHeadlinesCount: highImpactHeadlines.length,
    relevanceThreshold,
    contaminationBlocked: ignoredHeadlines.length,
    audit,
    pricedInAnalysis: pricedIn.length
      ? `${pricedIn.length} رویداد اثرگذار واکنش قیمت کافی نگرفته‌اند؛ ممکن است خبر تا حدی قیمت‌گذاری شده یا بازار آن را جذب کرده باشد.`
      : "نشانه قوی از priced-in بودن خبرهای مهم در داده فعلی دیده نمی‌شود.",
    marketAbsorption: highImpactHeadlines.some((item) => Math.abs(item.sentimentPolarity) > 35 && item.marketReactionConfirmation < 18)
      ? "برخی خبرهای شدید با واکنش قیمت کم همراه بوده‌اند؛ بازار بخشی از شوک خبری را جذب کرده است."
      : "واکنش قیمت با شدت خبرها تضاد آشکار ندارد.",
    newsShockPersistence: highImpactHeadlines.some((item) => item.severity > 75 && recencyScore({ eventTimestamp: item.timestamp } as NormalizedEventInput) > 70)
      ? "شوک خبری تازه و با شدت بالا وجود دارد؛ اثر آن باید در ۲۴ ساعت آینده با قیمت و نوسان تأیید شود."
      : "شوک خبری تازه با شدت بالا در ورودی فعلی غالب نیست.",
    narrativeCrowding: positive > 0 && negative > 0 ? "روایت خبری دوطرفه است و جهت واحدی از headlineها استخراج نمی‌شود." : "ازدحام روایی شدید در داده فعلی دیده نمی‌شود.",
    emotionalOverheating: positive + negative > 12 ? "حجم خبرهای جهت‌دار بالاست؛ ریسک واکنش احساسی بازار افزایش می‌یابد." : "هیجان خبری در محدوده قابل کنترل است.",
    divergence: highImpactHeadlines.some((item) => item.pricedIn)
      ? "واگرایی خبر و قیمت دیده می‌شود؛ هر تیتر باید با واکنش بازار و نقدینگی تأیید شود."
      : "واگرایی مهم بین خبر و واکنش بازار در داده فعلی تأیید نشده است.",
    whatChanged: events.length
      ? `${events.length} رویداد خبری واقعی بررسی شد؛ ${highImpactHeadlines.length} مورد زیر ۷ روز وارد سنتیمنت شد، ${ignoredHeadlines.length} مورد با relevance زیر ${relevanceThreshold} و ${staleExcludedHeadlines.length} مورد stale حذف شد.`
      : "رویداد خبری معتبر کافی برای تحلیل سنتیمنت وجود ندارد؛ سیستم امتیاز جهت‌دار تولید نمی‌کند.",
  };
}
