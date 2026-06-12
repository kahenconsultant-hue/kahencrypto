import type { ConfidenceLabel, DataFreshnessStatus, DataPoint, DataQuality, NormalizedSignal, SignalGroup, SourceType } from "@/lib/types";

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function clampSigned(value: number) {
  return Math.max(-100, Math.min(100, Math.round(value)));
}

export const requiredSignalGroups: SignalGroup[] = [
  "price",
  "macro",
  "liquidity",
  "flows",
  "stablecoins",
  "onchain",
  "leverage",
  "volatility",
  "correlation",
  "news",
  "sentiment",
  "geopolitical",
];

export const minimumIndependentSignalGroups = 4;

export function minutesSince(timestamp: string | null | undefined, now = new Date()) {
  if (!timestamp) return 10_000;
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return 10_000;
  return Math.max(0, Math.round((now.getTime() - parsed) / 60_000));
}

export function freshnessStatus(ageMinutes: number | null | undefined): DataFreshnessStatus {
  if (ageMinutes === null || ageMinutes === undefined || ageMinutes > 180) return "invalid_stale_critical";
  if (ageMinutes <= 15) return "live";
  if (ageMinutes <= 45) return "fresh";
  if (ageMinutes <= 90) return "delayed";
  if (ageMinutes <= 180) return "stale";
  return "invalid_stale_critical";
}

export function freshnessScore(ageMinutes: number | null | undefined) {
  if (ageMinutes === null || ageMinutes === undefined) return 0;
  if (ageMinutes < 15) return 100;
  if (ageMinutes <= 45) return 80;
  if (ageMinutes <= 90) return 60;
  if (ageMinutes <= 180) return 35;
  return 10;
}

export function sourceReliabilityScore(sourceType: SourceType | undefined, source: string, reliability = 0) {
  const normalized = source.toLowerCase();
  if (normalized.includes("fred") || normalized.includes("federal reserve") || normalized.includes("treasury") || normalized.includes("cme") || normalized.includes("nasdaq") || normalized.includes("issuer")) return Math.max(reliability, 95);
  if (normalized.includes("reuters") || normalized.includes("bloomberg") || normalized.includes("financial times") || normalized.includes("wall street journal") || normalized.includes("cnbc")) return Math.max(reliability, 85);
  if (normalized.includes("binance") || normalized.includes("defillama") || normalized.includes("glassnode") || normalized.includes("cryptoquant") || normalized.includes("coinglass")) return Math.max(reliability, 80);
  if (normalized.includes("coinank") || normalized.includes("macromicro")) return Math.min(Math.max(reliability, 50), 64);
  if (sourceType === "RSS" || normalized.includes("rss")) return Math.max(reliability, 45);
  if (sourceType === "manual") return Math.min(reliability, 45);
  return reliability;
}

export function sampleSizeScore(sampleSize: number | null | undefined) {
  const size = sampleSize ?? 0;
  if (size >= 90) return 100;
  if (size >= 30) return 80;
  if (size >= 20) return 65;
  if (size >= 10) return 35;
  return 0;
}

export function availableGroups(signals: Array<Pick<NormalizedSignal | DataPoint, "group" | "value" | "quality">>) {
  return [
    ...new Set(
      signals
        .filter((signal) => signal.value !== null && signal.quality !== "unavailable" && signal.quality !== "estimated")
        .map((signal) => signal.group),
    ),
  ] as SignalGroup[];
}

export function calculateDataQualityScore(params: {
  signals: Array<Pick<NormalizedSignal | DataPoint, "value" | "quality" | "timestamp" | "source" | "sourceType" | "reliability" | "sampleSize" | "error">>;
  requiredSignals?: number;
  crossSourceConfirmation?: number;
}) {
  const requiredSignals = params.requiredSignals ?? params.signals.length;
  const availableSignals = params.signals.filter((signal) => signal.value !== null && signal.quality !== "unavailable" && signal.quality !== "estimated");
  const availabilityScore = requiredSignals > 0 ? Math.min(100, (availableSignals.length / requiredSignals) * 100) : 0;
  const freshness = availableSignals.length ? availableSignals.reduce((sum, signal) => sum + freshnessScore(minutesSince(signal.timestamp)), 0) / availableSignals.length : 0;
  const reliability = availableSignals.length ? availableSignals.reduce((sum, signal) => sum + sourceReliabilityScore(signal.sourceType, signal.source, signal.reliability), 0) / availableSignals.length : 0;
  const samples = availableSignals.length ? availableSignals.reduce((sum, signal) => sum + sampleSizeScore(signal.sampleSize), 0) / availableSignals.length : 0;
  const crossSourceConfirmation = params.crossSourceConfirmation ?? Math.min(100, availableGroups(params.signals as NormalizedSignal[]).length * 16);
  const delayPenalty = availableSignals.reduce((sum, signal) => sum + Math.max(0, minutesSince(signal.timestamp) - 45) * 0.08, 0);
  const proxyPenalty = availableSignals.filter((signal) => signal.quality === "proxy").length * 4;
  const errorPenalty = params.signals.filter((signal) => signal.error || signal.quality === "unavailable").length * 5;

  return clampPercent(availabilityScore * 0.3 + freshness * 0.25 + reliability * 0.2 + samples * 0.15 + crossSourceConfirmation * 0.1 - delayPenalty - proxyPenalty - errorPenalty);
}

export function dataQualityLabel(score: number): DataQuality {
  if (score >= 80) return "live";
  if (score >= 60) return "partial_live";
  if (score >= 40) return "delayed";
  return "unavailable";
}

export function confidenceLabel(score: number | null): ConfidenceLabel {
  if (score === null) return "unavailable";
  if (score <= 35) return "weak";
  if (score <= 55) return "limited";
  if (score <= 70) return "moderate";
  if (score <= 85) return "strong";
  return "very_strong";
}

function thresholdScore(value: number, ranges: Array<{ test: (value: number) => boolean; score: number }>) {
  return ranges.find((range) => range.test(value))?.score ?? 0;
}

export function normalizeSignalScore(signal: Pick<NormalizedSignal, "key" | "value" | "quality">) {
  if (signal.value === null || signal.quality === "unavailable" || signal.quality === "estimated") return null;
  const value = signal.value;

  if (signal.key === "dxy_trend_24h") {
    return thresholdScore(value, [
      { test: (v) => v <= -0.5, score: 80 },
      { test: (v) => v > -0.5 && v <= -0.15, score: 40 },
      { test: (v) => v >= 0.5, score: -80 },
      { test: (v) => v >= 0.15 && v < 0.5, score: -40 },
    ]);
  }

  if (signal.key === "us10y_trend_24h") {
    const bps = value * 100;
    return thresholdScore(bps, [
      { test: (v) => v <= -8, score: 80 },
      { test: (v) => v > -8 && v <= -3, score: 40 },
      { test: (v) => v >= 8, score: -80 },
      { test: (v) => v >= 3 && v < 8, score: -40 },
    ]);
  }

  if (signal.key === "nasdaq_trend_24h" || signal.key === "btc_trend_24h" || signal.key === "eth_trend_24h" || signal.key === "sol_trend_24h") {
    return thresholdScore(value, [
      { test: (v) => v >= 1.5, score: 80 },
      { test: (v) => v >= 0.5 && v < 1.5, score: 40 },
      { test: (v) => v <= -1.5, score: -80 },
      { test: (v) => v <= -0.5 && v > -1.5, score: -40 },
    ]);
  }

  if (signal.key.includes("etf_flow")) {
    return thresholdScore(value, [
      { test: (v) => v >= 150_000_000, score: 80 },
      { test: (v) => v >= 25_000_000 && v < 150_000_000, score: 40 },
      { test: (v) => v <= -150_000_000, score: -80 },
      { test: (v) => v <= -25_000_000 && v > -150_000_000, score: -40 },
    ]);
  }

  if (signal.key.includes("stablecoin") || signal.key.includes("usdt_supply") || signal.key.includes("usdc_supply")) {
    if (value >= 0.35) return 60;
    if (value <= -0.35) return -60;
    return 0;
  }

  if (signal.key === "funding_btc") {
    if (value > 0.06) return -80;
    if (value > 0.025) return -60;
    if (value > 0 && value <= 0.015) return 20;
    if (value < -0.02) return -30;
    return 0;
  }

  if (signal.key === "open_interest_btc_24h") {
    if (value >= 8) return -55;
    if (value >= 3) return -20;
    if (value <= -5) return 15;
    return 0;
  }

  if (signal.key === "exchange_reserves_btc_7d") {
    return clampSigned(-value * 28);
  }

  if (signal.key === "vix_trend_24h") {
    return clampSigned(-value * 6);
  }

  if (signal.key === "geopolitical_event_score") {
    return clampSigned(value > 55 ? -20 : 0);
  }

  if (signal.key === "news_sentiment_macro") {
    return clampSigned(value);
  }

  return clampSigned(value);
}

export function validationReason(signals: NormalizedSignal[], criticalKeys: string[] = []) {
  const groups = availableGroups(signals);
  const criticalMissing = criticalKeys.filter((key) => {
    const signal = signals.find((item) => item.key === key);
    return !signal || signal.value === null || signal.quality === "unavailable" || signal.quality === "estimated";
  });
  const staleSignals = signals.filter((signal) => minutesSince(signal.timestamp) > 180);

  if (groups.length < minimumIndependentSignalGroups) {
    return `داده کافی برای تحلیل معتبر وجود ندارد؛ فقط ${groups.length} گروه مستقل در دسترس است و حداقل ${minimumIndependentSignalGroups} گروه لازم است.`;
  }
  if (criticalMissing.length) {
    return `وابستگی حیاتی ناموجود است: ${criticalMissing.join("، ")}.`;
  }
  if (staleSignals.length === signals.length) {
    return "همه سیگنال‌های ورودی کهنه‌اند و نباید نتیجه جهت‌دار تولید شود.";
  }
  return null;
}
