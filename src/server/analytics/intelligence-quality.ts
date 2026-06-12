import type { NormalizedSignal } from "@/lib/types";
import { clampPercent } from "@/server/analytics/scoring-engine";

export type StrictLiquidityClass = "stress" | "weak" | "neutral" | "supportive" | "expansion";

const staleThresholdMinutes = 90;

export function signalAgeMinutes(signal: Pick<NormalizedSignal, "timestamp">) {
  if (!signal.timestamp) return null;
  const parsed = Date.parse(signal.timestamp);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.round((Date.now() - parsed) / 60_000));
}

export function isFreshUsableSignal(signal: NormalizedSignal | undefined, maxAgeMinutes = staleThresholdMinutes) {
  if (!signal || signal.value === null || signal.quality === "unavailable" || signal.quality === "estimated") return false;
  const age = signalAgeMinutes(signal);
  return age === null || age <= maxAgeMinutes;
}

export function liquidityHealthFromSigned(score: number | null) {
  if (score === null || !Number.isFinite(score)) return null;
  return clampPercent(50 + score / 2);
}

export function classifyLiquidityHealth(score: number | null): {
  class: StrictLiquidityClass;
  labelFa: string;
  condition: "Expanding" | "Contracting" | "Neutral" | "Stress" | "Unclear";
} {
  if (score === null) return { class: "neutral", labelFa: "نقدینگی نامشخص", condition: "Unclear" };
  if (score <= 20) return { class: "stress", labelFa: "فشار شدید نقدینگی", condition: "Stress" };
  if (score <= 40) return { class: "weak", labelFa: "نقدینگی ضعیف", condition: "Stress" };
  if (score <= 60) return { class: "neutral", labelFa: "نقدینگی خنثی", condition: "Neutral" };
  if (score <= 80) return { class: "supportive", labelFa: "نقدینگی سالم", condition: "Expanding" };
  return { class: "expansion", labelFa: "گسترش نقدینگی", condition: "Expanding" };
}

export function strictLiquidityNarrative(params: {
  score: number | null;
  labelFa: string;
  missingInputs: string[];
  staleCount: number;
}) {
  const scoreText = params.score === null ? "ناموجود" : `${params.score}/100`;
  const qualityText =
    params.missingInputs.length || params.staleCount
      ? ` این برداشت با محدودیت داده همراه است: ${params.missingInputs.slice(0, 4).join("، ") || "داده کهنه"}${params.staleCount ? ` و ${params.staleCount} سیگنال stale` : ""}.`
      : "";
  if (params.score !== null && params.score <= 20) {
    return `طبقه‌بندی سخت‌گیرانه نقدینگی: ${params.labelFa} با امتیاز ${scoreText}. این وضعیت نباید خنثی یا حمایتی تفسیر شود؛ تا وقتی رشد استیبل‌کوین، حجم اسپات، ETF Flow یا Exchange Flow تأیید ندهند، هر رشد قیمت شکننده‌تر خوانده می‌شود.${qualityText}`;
  }
  if (params.score !== null && params.score <= 40) {
    return `طبقه‌بندی سخت‌گیرانه نقدینگی: ${params.labelFa} با امتیاز ${scoreText}. نقدینگی هنوز برای روایت expansion کافی نیست و فقط در صورت بهبود هم‌زمان استیبل‌کوین، اسپات و فشار دلار/نرخ می‌تواند بهتر شود.${qualityText}`;
  }
  if (params.score !== null && params.score <= 60) {
    return `طبقه‌بندی سخت‌گیرانه نقدینگی: ${params.labelFa} با امتیاز ${scoreText}. موتور خروجی را حمایتی نمی‌خواند مگر اینکه امتیاز به بالای ۶۰ برسد و دست‌کم دو منبع مستقل آن را تأیید کنند.${qualityText}`;
  }
  if (params.score !== null && params.score <= 80) {
    return `طبقه‌بندی سخت‌گیرانه نقدینگی: ${params.labelFa} با امتیاز ${scoreText}. وضعیت سالم است، اما هنوز expansion پایدار نیست؛ برای گسترش نقدینگی باید امتیاز بالای ۸۰ بماند و اهرم بیش‌ازحد داغ نباشد.${qualityText}`;
  }
  return `طبقه‌بندی سخت‌گیرانه نقدینگی: ${params.labelFa} با امتیاز ${scoreText}. این خوانش فقط تا زمانی معتبر است که تازگی داده‌ها، رشد استیبل‌کوین و کیفیت اسپات حفظ شود.${qualityText}`;
}

export function calibrateConfidenceByCoverage(params: {
  rawConfidence: number;
  signals: NormalizedSignal[];
  requiredKeys?: string[];
  missingPenaltyKeys?: string[];
  maxAgeMinutesByKey?: Record<string, number>;
  proxyDerived?: boolean;
}) {
  const considered = params.requiredKeys?.length
    ? params.requiredKeys.map((key) => params.signals.find((signal) => signal.key === key)).filter((signal): signal is NormalizedSignal => Boolean(signal))
    : params.signals;
  const total = Math.max(1, considered.length);
  const isUsableForSignal = (signal: NormalizedSignal) => isFreshUsableSignal(signal, params.maxAgeMinutesByKey?.[signal.key] ?? staleThresholdMinutes);
  const freshAvailable = considered.filter((signal) => isUsableForSignal(signal));
  const stale = considered.filter((signal) => {
    const maxAge = params.maxAgeMinutesByKey?.[signal.key] ?? staleThresholdMinutes;
    return signal.value !== null && signal.quality !== "unavailable" && signalAgeMinutes(signal) !== null && (signalAgeMinutes(signal) ?? 0) > maxAge;
  });
  const missing = considered.filter((signal) => !isUsableForSignal(signal));
  const sourceDiversity = new Set(freshAvailable.map((signal) => `${signal.sourceType ?? "unknown"}:${signal.source}`)).size;
  const dataCoveragePercent = clampPercent((freshAvailable.length / total) * 100);
  let cap = sourceDiversity >= 2 ? Math.min(100, dataCoveragePercent + 10) : dataCoveragePercent;
  const reasons: string[] = [];

  if (params.proxyDerived) {
    cap = Math.min(cap, 72);
    reasons.push("خروجی proxy/derived است؛ confidence نمی‌تواند مثل داده مستقیم نهادی بالا برود.");
  }
  if (stale.length) {
    cap = Math.min(cap, Math.max(0, cap - stale.length * 6));
    reasons.push(`${stale.length} سیگنال stale در confidence اثر افزایشی ندارد.`);
  }

  const missingPenalty = (params.missingPenaltyKeys ?? []).filter((key) => missing.some((signal) => signal.key === key));
  if (missingPenalty.length) {
    cap = Math.min(cap, Math.max(35, cap - missingPenalty.length * 4));
    reasons.push(`ورودی‌های مهم ناموجود: ${missingPenalty.join("، ")}.`);
  }

  const score = clampPercent(Math.min(params.rawConfidence, cap));
  if (score < params.rawConfidence && !reasons.length) {
    reasons.push(`confidence با سقف پوشش داده (${dataCoveragePercent}٪) محدود شد.`);
  }

  return {
    score,
    dataCoveragePercent,
    cap: Math.round(cap),
    staleSignals: stale.map((signal) => signal.key),
    missingSignals: missing.map((signal) => signal.key),
    independentSourceCount: sourceDiversity,
    supportingSignals: freshAvailable.map((signal) => signal.key),
    reason: reasons.join(" "),
  };
}

export function enforceLiquidityNarrativeConsistency(params: {
  healthScore: number | null;
  labelFa: string;
  narrative: string;
  fallback: string;
}) {
  if (params.healthScore === null) return params.narrative;
  const optimistic = /حمایتی|گسترش|expansion|مثبت است|supportive|healthy/i.test(params.narrative);
  const weakOrStress = params.healthScore < 45;
  if (weakOrStress && optimistic) return params.fallback;
  const neutralOverStress = params.healthScore < 25 && /خنثی|neutral/i.test(params.narrative);
  if (neutralOverStress) return params.fallback;
  return params.narrative;
}
