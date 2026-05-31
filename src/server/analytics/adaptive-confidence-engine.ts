import type { ConfidenceResult, NormalizedSignal, SignalGroup } from "@/lib/types";
import { confidenceLabel, freshnessScore, minutesSince } from "@/server/analytics/quality-engine";
import { clampPercent } from "@/server/analytics/scoring-engine";

function availableSignals(signals: NormalizedSignal[]) {
  return signals.filter((signal) => signal.value !== null && signal.quality !== "unavailable" && signal.quality !== "estimated");
}

function uniqueGroups(signals: NormalizedSignal[]) {
  return [...new Set(signals.map((signal) => signal.group))] as SignalGroup[];
}

function freshnessAdjustment(signals: NormalizedSignal[]) {
  const available = availableSignals(signals);
  if (!available.length) {
    return {
      penalty: 100,
      cap: 0,
      staleRatio: 1,
      oldestAge: 10_000,
    };
  }

  const ages = available.map((signal) => minutesSince(signal.timestamp));
  const delayedRatio = ages.filter((age) => age > 45).length / available.length;
  const staleRatio = ages.filter((age) => age > 180).length / available.length;
  const oldestAge = Math.max(...ages, 0);
  const averageAge = ages.reduce((sum, age) => sum + age, 0) / ages.length;
  const penalty = Math.min(28, Math.max(0, averageAge - 45) * 0.025) + staleRatio * 24 + delayedRatio * 8;
  let cap = 100;
  if (staleRatio >= 0.75) cap = 28;
  else if (staleRatio >= 0.5) cap = 42;
  else if (staleRatio >= 0.25) cap = 58;
  else if (oldestAge > 180) cap = 72;
  else if (oldestAge > 90) cap = 82;

  return {
    penalty,
    cap,
    staleRatio,
    oldestAge,
  };
}

export function calculateAdaptiveModuleConfidence(params: {
  moduleName: string;
  signals: NormalizedSignal[];
  requiredGroups: SignalGroup[];
  criticalKeys?: string[];
  signalAgreement: number;
  historicalConsistency: number;
  marketConfirmation: number;
  minimumGroups?: number;
  sampleQuality?: number;
}): ConfidenceResult {
  const available = availableSignals(params.signals);
  const availableGroups = uniqueGroups(available);
  const missingGroups = params.requiredGroups.filter((group) => !availableGroups.includes(group));
  const minimumGroups = params.minimumGroups ?? Math.min(4, params.requiredGroups.length);
  const criticalMissing = (params.criticalKeys ?? []).filter((key) => {
    const signal = params.signals.find((item) => item.key === key);
    return !signal || signal.value === null || signal.quality === "unavailable" || signal.quality === "estimated";
  });

  if (availableGroups.length < minimumGroups) {
    return {
      available: false,
      score: null,
      label: "unavailable",
      formula: `${params.moduleName}: اطمینان ناموجود است؛ حداقل ${minimumGroups} گروه مستقل لازم است، اما ${availableGroups.length} گروه معتبر در دسترس است.`,
      availableGroups,
      missingGroups,
      explanation: "اطمینان ناموجود است؛ داده مستقل کافی برای این لایه تحلیلی وجود ندارد.",
    };
  }

  const availabilityScore = clampPercent((availableGroups.length / Math.max(1, params.requiredGroups.length)) * 100);
  const sourceReliability = available.reduce((sum, signal) => sum + signal.reliability, 0) / Math.max(1, available.length);
  const recency = available.reduce((sum, signal) => sum + freshnessScore(minutesSince(signal.timestamp)), 0) / Math.max(1, available.length);
  const sampleQuality = params.sampleQuality ?? available.reduce((sum, signal) => sum + (signal.sampleSize && signal.sampleSize >= 30 ? 85 : signal.sampleSize && signal.sampleSize >= 10 ? 55 : 72), 0) / Math.max(1, available.length);
  const estimatedPenalty = params.signals.some((signal) => signal.quality === "estimated") ? 100 : 0;
  const unavailablePenalty = params.signals.filter((signal) => signal.quality === "unavailable").length * 2.5;
  const criticalPenalty = criticalMissing.length * 14;
  const freshness = freshnessAdjustment(params.signals);

  let score = clampPercent(
    availabilityScore * 0.24 +
      sourceReliability * 0.2 +
      params.signalAgreement * 0.2 +
      params.historicalConsistency * 0.12 +
      recency * 0.12 +
      params.marketConfirmation * 0.07 +
      sampleQuality * 0.05 -
      unavailablePenalty -
      freshness.penalty -
      criticalPenalty -
      estimatedPenalty,
  );

  if (criticalMissing.length) score = Math.min(score, 50);
  if (params.signalAgreement < 45) score = Math.min(score, 60);
  score = Math.min(score, freshness.cap);
  if (estimatedPenalty) {
    return {
      available: false,
      score: null,
      label: "unavailable",
      formula: `${params.moduleName}: داده برآوردی در ورودی وجود دارد؛ confidence نمایش داده نمی‌شود.`,
      availableGroups,
      missingGroups,
      explanation: "اطمینان ناموجود است؛ داده برآوردی وارد محاسبه شده است.",
    };
  }

  return {
    available: true,
    score,
    label: confidenceLabel(score),
    formula: `${params.moduleName}: confidence = ۰٫۲۴×دسترسی داده + ۰٫۲۰×اعتبار منبع + ۰٫۲۰×هم‌راستایی + ۰٫۱۲×سازگاری تاریخی + ۰٫۱۲×تازگی + ۰٫۰۷×تأیید بازار + ۰٫۰۵×کیفیت نمونه - جریمه‌های missing/stale.`,
    availableGroups,
    missingGroups,
    explanation: `اطمینان ${params.moduleName} مستقل محاسبه شد؛ ${Math.round(freshness.staleRatio * 100)}٪ از ورودی‌های معتبر stale هستند و قدیمی‌ترین ورودی ${freshness.oldestAge} دقیقه سن دارد.`,
  };
}

export function aggregateLayerConfidence(layers: Array<{ name: string; confidence: ConfidenceResult; weight: number }>) {
  const available = layers.filter((layer) => layer.confidence.available && layer.confidence.score !== null);
  if (!available.length) {
    return {
      score: null as number | null,
      dispersion: null as number | null,
      warningFa: "اطمینان کل ناموجود است؛ هیچ لایه تحلیلی confidence معتبر ندارد.",
    };
  }
  const totalWeight = available.reduce((sum, layer) => sum + layer.weight, 0);
  const score = clampPercent(available.reduce((sum, layer) => sum + (layer.confidence.score ?? 0) * layer.weight, 0) / Math.max(1, totalWeight));
  const scores = available.map((layer) => layer.confidence.score ?? 0);
  const dispersion = Math.round(Math.max(...scores) - Math.min(...scores));
  return {
    score,
    dispersion,
    warningFa: dispersion > 25 ? "نااطمینانی بالا بین لایه‌های تحلیلی دیده می‌شود؛ نتیجه نهایی باید با احتیاط و سناریومحور خوانده شود." : "پراکندگی confidence بین لایه‌ها در محدوده قابل قبول است.",
  };
}
