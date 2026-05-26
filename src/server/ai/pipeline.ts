import type { AssetImpact, MarketRegime, NewsCategory, ProcessedNewsItem } from "@/lib/types";
import type { RawItem } from "@/server/ingestion/pipeline";

export interface AiProcessingTrace {
  rawFingerprint: string;
  stages: Array<{
    name: "cleaning" | "translation" | "classification" | "impact_analysis" | "market_regime" | "alerting";
    status: "completed" | "skipped" | "failed";
    detailFa: string;
    latencyMs: number;
  }>;
}

export interface ProcessingPromptContext {
  targetAssets: string[];
  legalGuardrails: string[];
  outputLanguage: "fa";
  analysisStyle: "scenario_based" | "educational";
}

export const defaultPromptContext: ProcessingPromptContext = {
  targetAssets: ["BTC", "ETH", "SOL", "USDT", "DXY", "Gold", "Nasdaq", "US10Y"],
  legalGuardrails: [
    "No buy/sell signal",
    "No entry/exit point",
    "No leverage recommendation",
    "No guaranteed prediction",
    "Scenario-based educational analysis only",
  ],
  outputLanguage: "fa",
  analysisStyle: "scenario_based",
};

export function buildSystemPrompt(context: ProcessingPromptContext = defaultPromptContext) {
  return [
    "You are a Persian crypto macro intelligence analyst.",
    `Target assets: ${context.targetAssets.join(", ")}.`,
    `Guardrails: ${context.legalGuardrails.join("; ")}.`,
    "Return concise Persian analysis with scenarios, confidence, invalidation, and regime impact.",
  ].join("\n");
}

export function cleanRawItem(rawItem: RawItem): RawItem {
  return {
    ...rawItem,
    title: rawItem.title.trim().replace(/\s+/g, " "),
    content: rawItem.content.trim().replace(/\s+/g, " "),
  };
}

export function classifyCategory(rawItem: RawItem): NewsCategory {
  return rawItem.category;
}

export function generateProcessingTrace(item: ProcessedNewsItem): AiProcessingTrace {
  return {
    rawFingerprint: item.fingerprintHash,
    stages: [
      { name: "cleaning", status: "completed", detailFa: "حذف نویز متنی، normalization و کنترل fingerprint انجام شد.", latencyMs: 42 },
      { name: "translation", status: "completed", detailFa: "عنوان، خلاصه و نکات کلیدی فارسی تولید شد.", latencyMs: 380 },
      { name: "classification", status: "completed", detailFa: `دسته ${item.category} و tagهای ${item.tags.slice(0, 3).join(", ")} ثبت شد.`, latencyMs: 88 },
      { name: "impact_analysis", status: "completed", detailFa: "اثر کوتاه‌مدت، میان‌مدت و بلندمدت روی دارایی‌ها ساخته شد.", latencyMs: 510 },
      { name: "market_regime", status: "completed", detailFa: `regimeهای مرتبط: ${item.marketRegime.join(", ")}`, latencyMs: 95 },
      { name: "alerting", status: "completed", detailFa: `سطح هشدار ${item.alertLevel} تعیین شد.`, latencyMs: 34 },
    ],
  };
}

export function summarizeImpactForAsset(impacts: AssetImpact[], asset: string) {
  const assetImpacts = impacts.filter((impact) => impact.asset === asset);
  const averageConfidence = Math.round(
    assetImpacts.reduce((sum, impact) => sum + impact.confidence, 0) / Math.max(assetImpacts.length, 1),
  );
  const dominant = assetImpacts.find((impact) => impact.horizon === "short") ?? assetImpacts[0];

  return {
    asset,
    dominantDirection: dominant?.direction ?? "neutral",
    averageConfidence,
    invalidationFa: dominant?.invalidationFa ?? "برای این دارایی اثر مستقیمی ثبت نشده است.",
  };
}

export function regimeInstruction(regimes: MarketRegime[]) {
  return `تحلیل را با regimeهای ${regimes.join("، ")} مقایسه کن و فقط سناریوهای احتمالی ارائه بده.`;
}
