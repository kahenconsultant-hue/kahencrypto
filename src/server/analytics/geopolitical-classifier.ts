import type { NormalizedEventInput, RawEventInput } from "@/types/ingestion";
import { clampPercent } from "@/server/analytics/scoring-engine";

export type GeopoliticalCategory =
  | "Military Conflict"
  | "War"
  | "Sanctions"
  | "Energy Supply Shock"
  | "Trade Restriction"
  | "Sovereign Crisis"
  | "Diplomatic Escalation"
  | "Critical Infrastructure Attack"
  | "Cyber Warfare"
  | "Terrorism"
  | "Strategic Resource Disruption";

export interface GeopoliticalClassification {
  accepted: boolean;
  category: GeopoliticalCategory | "Rejected";
  rejectionReason: string | null;
  relevanceScore: number;
  geopoliticalConfidence: number;
  keywordHits: string[];
}

const categoryRules: Array<{ category: GeopoliticalCategory; terms: string[]; severity: number }> = [
  { category: "Military Conflict", terms: ["military conflict", "missile strike", "airstrike", "troop", "invasion", "border clash"], severity: 88 },
  { category: "War", terms: ["war", "wartime", "armed conflict"], severity: 90 },
  { category: "Sanctions", terms: ["sanction", "sanctions", "asset freeze", "blocked property"], severity: 76 },
  { category: "Energy Supply Shock", terms: ["energy disruption", "oil disruption", "shipping disruption", "strait", "pipeline attack", "opec cut"], severity: 72 },
  { category: "Trade Restriction", terms: ["trade restriction", "tariff escalation", "export control", "export controls", "import ban"], severity: 68 },
  { category: "Sovereign Crisis", terms: ["sovereign debt crisis", "debt default", "capital controls", "currency crisis"], severity: 74 },
  { category: "Diplomatic Escalation", terms: ["diplomatic escalation", "expels diplomats", "embassy closure", "retaliatory measures"], severity: 66 },
  { category: "Critical Infrastructure Attack", terms: ["critical infrastructure attack", "power grid attack", "port attack", "telecom outage"], severity: 82 },
  { category: "Cyber Warfare", terms: ["cyber warfare", "state-backed hack", "state sponsored hack", "critical cyberattack"], severity: 72 },
  { category: "Terrorism", terms: ["terrorism", "terror attack", "terrorist attack"], severity: 82 },
  { category: "Strategic Resource Disruption", terms: ["strategic resource disruption", "rare earth restriction", "uranium supply", "grain corridor"], severity: 64 },
];

const automaticRejectTerms = [
  "remarks and statements",
  "remarks by",
  "statement by",
  "committee testimony",
  "general treasury notice",
  "routine press release",
  "administrative announcement",
  "generic regulatory update",
  "appointment",
  "appoints",
  "board appointment",
  "committee meeting",
  "ceremonial",
  "personnel",
  "calendar",
  "agenda",
  "webcast",
  "speech by",
];

function textOf(input: string | RawEventInput | NormalizedEventInput) {
  if (typeof input === "string") return input;
  return [input.title, "content" in input ? input.content : input.summary, input.sourceName, input.category, "eventType" in input ? input.eventType : ""]
    .filter(Boolean)
    .join(" ");
}

function sourceCredibilityFromText(text: string) {
  if (/\bfederal reserve|treasury|white house|nato|sec|ecb|opec\b/i.test(text)) return 82;
  if (/\bcnbc|coindesk|the block|cointelegraph|reuters|financial times\b/i.test(text)) return 74;
  return 58;
}

export function classifyGeopoliticalEvent(input: string | RawEventInput | NormalizedEventInput, relevanceOverride?: number): GeopoliticalClassification {
  const text = textOf(input);
  const normalized = text.toLowerCase();
  const matchedRules = categoryRules
    .map((rule) => ({
      ...rule,
      hits: rule.terms.filter((term) => normalized.includes(term)),
    }))
    .filter((rule) => rule.hits.length);
  const keywordHits = matchedRules.flatMap((rule) => rule.hits);
  const strongest = matchedRules.sort((left, right) => right.severity - left.severity)[0];
  const rejectHit = automaticRejectTerms.find((term) => normalized.includes(term));
  const hasCryptoChannel = /\bbitcoin|btc|ethereum|eth|solana|sol\b|usdt|usdc|stablecoin|crypto rails|exchange disruption|capital controls|sanctions?.*(crypto|stablecoin|exchange)\b/i.test(text);
  const baseRelevance = relevanceOverride ?? clampPercent((strongest?.severity ?? 0) + keywordHits.length * 4 + (hasCryptoChannel ? 14 : 0));
  const sourceCredibility = sourceCredibilityFromText(text);
  const crossSourceConfirmation = /\baccording to|confirmed by|joint statement|coalition|allies\b/i.test(text) ? 70 : 45;
  const marketReaction = /\boil|gold|dxy|dollar|yield|risk-off|vix|nasdaq|bitcoin|btc\b/i.test(text) ? 64 : 38;
  const geopoliticalConfidence = clampPercent((strongest?.severity ?? 0) * 0.38 + sourceCredibility * 0.24 + crossSourceConfirmation * 0.18 + marketReaction * 0.2);

  if (!strongest) {
    return {
      accepted: false,
      category: "Rejected",
      rejectionReason: "no_geopolitical_keyword",
      relevanceScore: Math.min(baseRelevance, 30),
      geopoliticalConfidence: 0,
      keywordHits: [],
    };
  }

  if (rejectHit && !(baseRelevance > 90 && keywordHits.length > 0)) {
    return {
      accepted: false,
      category: "Rejected",
      rejectionReason: `administrative_noise:${rejectHit}`,
      relevanceScore: Math.min(baseRelevance, 35),
      geopoliticalConfidence: Math.min(geopoliticalConfidence, 35),
      keywordHits,
    };
  }

  return {
    accepted: true,
    category: strongest.category,
    rejectionReason: null,
    relevanceScore: baseRelevance,
    geopoliticalConfidence,
    keywordHits,
  };
}
