import type { AssetSymbol, ConfidenceResult, DirectionalBias, IntelligenceTimeframe, TransmissionChannel } from "@/lib/types";
import { getEngineLastUpdatedAt, getSignalSnapshot } from "@/server/analytics/market-signals";
import { confidenceLabel, minutesSince } from "@/server/analytics/quality-engine";
import { clampPercent, clampSigned } from "@/server/analytics/scoring-engine";
import { getIntelligenceReliabilityReportSync } from "@/server/intelligence/reliability-engine";
import { getLatestNormalizedEventsSync } from "@/storage/ingestion-store";
import type { NormalizedEventInput } from "@/types/ingestion";

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
  weightedScore: number;
}

const trackedAssets: AssetSymbol[] = ["BTC", "ETH", "SOL", "USDT", "DXY", "Gold", "Nasdaq", "US10Y"];

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

function polarityFromEvent(event: NormalizedEventInput) {
  const text = `${event.title} ${event.summary}`.toLowerCase();
  const negative = ["hawkish", "higher", "inflation", "lawsuit", "sanction", "outflow", "hack", "exploit", "depeg", "selloff", "liquidation", "war", "attack"].filter((term) => text.includes(term)).length;
  const positive = ["dovish", "rate cut", "inflow", "approval", "adoption", "record", "easing", "growth", "accumulation", "rally"].filter((term) => text.includes(term)).length;
  const raw = (positive - negative) * 28;
  if (event.eventType === "central_bank_policy" && /hawkish|higher|inflation/i.test(text)) return -55;
  if (event.eventType === "etf_flow" && /outflow/i.test(text)) return -60;
  if (event.eventType === "etf_flow" && /inflow/i.test(text)) return 55;
  if (event.eventType === "geopolitical_risk") return -35;
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

function headlineSignal(event: NormalizedEventInput, allEvents: NormalizedEventInput[]): StructuredHeadlineSignal {
  const polarity = polarityFromEvent(event);
  const novelty = noveltyScore(event, allEvents);
  const severity = severityScore(event, polarity);
  const marketReaction = marketReactionForEvent(event);
  const recency = recencyScore(event);
  const sourceCredibility = event.sourceReliability;
  const assetRelevance = Math.min(100, event.affectedAssets.length ? 55 + event.affectedAssets.length * 9 : 25);
  const weightedScore = clampSigned(
    Math.sign(polarity || 1) *
      (sourceCredibility * 0.25 + novelty * 0.2 + assetRelevance * 0.2 + severity * 0.15 + marketReaction * 0.1 + recency * 0.1),
  );
  const category = eventCategoryMap[event.eventType] ?? "macro";
  const confidence = clampPercent(sourceCredibility * 0.34 + novelty * 0.18 + severity * 0.18 + recency * 0.18 + marketReaction * 0.12);

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
    weightedScore,
  };
}

function sentimentConfidence(headlines: StructuredHeadlineSignal[]): ConfidenceResult {
  const reliability = getIntelligenceReliabilityReportSync();
  if (headlines.length < 5 || reliability.sentimentCoverage < 0.35) {
    return {
      available: false,
      score: null,
      label: "unavailable",
      formula: "Sentiment confidence unavailable: حداقل ۵ normalized_event و پوشش خبری کافی لازم است.",
      availableGroups: headlines.length ? ["news"] : [],
      missingGroups: ["sentiment"],
      explanation: "اطمینان سنتیمنت ناموجود است؛ تعداد رویدادهای نرمال‌شده یا پوشش منابع خبری کافی نیست.",
    };
  }
  const averageConfidence = headlines.reduce((sum, item) => sum + item.confidence, 0) / headlines.length;
  const score = clampPercent(Math.min(reliability.confidenceCaps.sentiment, averageConfidence));
  return {
    available: true,
    score,
    label: confidenceLabel(score),
    formula: "Sentiment confidence = میانگین اعتبار منبع، تازگی، novelty، شدت خبر و تأیید واکنش بازار؛ سپس با سقف reliability محدود می‌شود.",
    availableGroups: ["news", "sentiment"],
    missingGroups: [],
    explanation: "سنتیمنت از normalized_events واقعی ساخته شده و با reliability engine سقف‌گذاری شده است.",
  };
}

export function getSentimentReport() {
  const events = getLatestNormalizedEventsSync(80);
  const highImpactHeadlines = events.map((event) => headlineSignal(event, events)).sort((left, right) => Math.abs(right.weightedScore) - Math.abs(left.weightedScore));
  const sentimentScore = highImpactHeadlines.length ? clampSigned(highImpactHeadlines.reduce((sum, item) => sum + item.weightedScore, 0) / highImpactHeadlines.length) : 0;
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
  const positive = highImpactHeadlines.filter((item) => item.weightedScore > 12).length;
  const negative = highImpactHeadlines.filter((item) => item.weightedScore < -12).length;
  const neutral = Math.max(0, highImpactHeadlines.length - positive - negative);
  const pricedIn = highImpactHeadlines.filter((item) => item.pricedIn);

  return {
    generatedAt: new Date().toISOString(),
    lastUpdatedAt: getEngineLastUpdatedAt(),
    sentimentScore,
    confidence,
    byAsset,
    byCategory,
    split: { positive, negative, neutral },
    highImpactHeadlines: highImpactHeadlines.slice(0, 8),
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
      ? `${events.length} normalized_event واقعی برای سنتیمنت بررسی شد؛ خروجی از source reliability، تازگی، novelty، شدت خبر و واکنش قیمت ساخته شده است.`
      : "normalized_event معتبری برای تحلیل سنتیمنت وجود ندارد؛ سیستم امتیاز جهت‌دار تولید نمی‌کند.",
  };
}
