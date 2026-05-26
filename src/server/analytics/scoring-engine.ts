import type { ConfidenceResult, NormalizedSignal, SignalGroup, SignalScores } from "@/lib/types";
import { confidenceLabel, freshnessScore, minutesSince, requiredSignalGroups } from "@/server/analytics/quality-engine";

export const minimumIndependentGroups = 4;
export const allSignalGroups: SignalGroup[] = requiredSignalGroups;

export const impactWeights = {
  regime_score: 0.22,
  liquidity_score: 0.2,
  correlation_score: 0.16,
  sentiment_score: 0.14,
  flow_score: 0.14,
  volatility_score: 0.08,
  news_severity_score: 0.06,
} as const;

export const confidenceWeights = {
  data_availability: 0.26,
  source_reliability: 0.22,
  signal_agreement: 0.2,
  historical_consistency: 0.12,
  recency: 0.12,
  market_confirmation: 0.08,
} as const;

export function clampSigned(value: number) {
  return Math.max(-100, Math.min(100, Math.round(value)));
}

export function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function weightedSum(values: Record<string, number>, weights: Record<string, number>) {
  return Object.entries(weights).reduce((sum, [key, weight]) => sum + (values[key] ?? 0) * weight, 0);
}

export function availableSignalGroups(signals: Pick<NormalizedSignal, "group" | "value" | "quality">[]) {
  return [...new Set(signals.filter((signal) => signal.value !== null && signal.quality !== "unavailable" && signal.quality !== "estimated").map((signal) => signal.group))] as SignalGroup[];
}

export function missingSignalGroups(signals: Pick<NormalizedSignal, "group" | "value" | "quality">[]) {
  const available = availableSignalGroups(signals);
  return allSignalGroups.filter((group) => !available.includes(group));
}

export function calculateImpactScore(inputs: {
  regime_score: number;
  liquidity_score: number;
  correlation_score: number;
  sentiment_score: number;
  flow_score: number;
  volatility_score: number;
  news_severity_score: number;
}) {
  const score = weightedSum(inputs, impactWeights);
  return {
    score: clampSigned(score),
    formula:
      "امتیاز اثر = ۰٫۲۲×رژیم + ۰٫۲۰×نقدینگی + ۰٫۱۶×همبستگی + ۰٫۱۴×سنتیمنت + ۰٫۱۴×جریان سرمایه + ۰٫۰۸×نوسان + ۰٫۰۶×شدت خبر",
  };
}

export function calculateConfidenceScore(params: {
  signals: NormalizedSignal[];
  signalAgreement: number;
  historicalConsistency: number;
  marketConfirmation: number;
}): ConfidenceResult {
  const availableGroups = availableSignalGroups(params.signals);
  const missingGroups = missingSignalGroups(params.signals);

  if (availableGroups.length < minimumIndependentGroups) {
    return {
      available: false,
      score: null,
      label: "unavailable",
      formula:
        "امتیاز اطمینان ناموجود است: برای محاسبه معتبر، دست‌کم ۴ گروه مستقل از قیمت، ماکرو، نقدینگی، جریان سرمایه، استیبل‌کوین، اهرم، خبر یا ژئوپلیتیک لازم است.",
      availableGroups,
      missingGroups,
      explanation: "اطمینان ناموجود است؛ داده مستقل کافی برای محاسبه معتبر وجود ندارد.",
    };
  }

  const dataAvailability = (availableGroups.length / allSignalGroups.length) * 100;
  const availableSignals = params.signals.filter((signal) => signal.value !== null);
  const sourceReliability = availableSignals.reduce((sum, signal) => sum + signal.reliability, 0) / Math.max(1, availableSignals.length);
  const recency = availableSignals.reduce((sum, signal) => sum + freshnessScore(minutesSince(signal.timestamp)), 0) / Math.max(1, availableSignals.length);
  const raw = weightedSum(
    {
      data_availability: dataAvailability,
      source_reliability: sourceReliability,
      signal_agreement: params.signalAgreement,
      historical_consistency: params.historicalConsistency,
      recency,
      market_confirmation: params.marketConfirmation,
    },
    confidenceWeights,
  );
  const estimatedSignals = availableSignals.filter((signal) => signal.quality === "estimated").length;
  const unavailablePenalty = params.signals.filter((signal) => signal.quality === "unavailable").length * 6;
  const maxAge = Math.max(...availableSignals.map((signal) => minutesSince(signal.timestamp)), 0);
  const sampleInsufficient = availableSignals.some((signal) => typeof signal.sampleSize === "number" && signal.sampleSize > 0 && signal.sampleSize < 10);
  const alignmentConflict = params.signalAgreement < 48;

  if (estimatedSignals > 0) {
    return {
      available: false,
      score: null,
      label: "unavailable",
      formula:
        "امتیاز اطمینان ناموجود است: داده برآوردی در ورودی وجود دارد و طبق قانون NO DATA = NO SCORE، confidence ساختگی نمایش داده نمی‌شود.",
      availableGroups,
      missingGroups,
      explanation: "اطمینان ناموجود است؛ داده برآوردی در ورودی دیده شد.",
    };
  }

  let score = clampPercent(raw - unavailablePenalty);
  if (sampleInsufficient) score = Math.min(score, 45);
  if (alignmentConflict) score = Math.min(score, 60);
  if (maxAge > 90) score = Math.min(score, 55);
  if (maxAge > 180) score = Math.min(score, 35);

  return {
    available: true,
    score,
    label: confidenceLabel(score),
    formula:
      "امتیاز اطمینان = ۰٫۲۶×دسترسی داده + ۰٫۲۲×اعتبار منبع + ۰٫۲۰×هم‌راستایی سیگنال + ۰٫۱۲×سازگاری تاریخی + ۰٫۱۲×تازگی + ۰٫۰۸×تأیید بازار - جریمه کیفیت داده",
    availableGroups,
    missingGroups,
    explanation: `اطمینان از ${availableGroups.length}/${allSignalGroups.length} گروه سیگنال مستقل ساخته شده؛ داده ناموجود، کهنگی، تضاد سیگنال و نمونه ناکافی امتیاز را سقف‌گذاری می‌کند.`,
  };
}

export function signalAgreementScore(values: number[]) {
  if (!values.length) return 0;
  const positives = values.filter((value) => value > 8).length;
  const negatives = values.filter((value) => value < -8).length;
  const dominant = Math.max(positives, negatives);
  return clampPercent((dominant / values.length) * 100);
}

export function scoresToLegacyScores(params: {
  marketRisk: number;
  liquidity: number;
  macroStress: number;
  narrative: number;
  volatility: number;
}): SignalScores {
  return {
    marketRiskScore: clampPercent(params.marketRisk),
    liquidityScore: clampPercent(params.liquidity),
    macroStressScore: clampPercent(params.macroStress),
    narrativeStrength: clampPercent(params.narrative),
    volatilityRisk: clampPercent(params.volatility),
  };
}
