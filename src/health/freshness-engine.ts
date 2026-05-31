import { productionSources } from "@/collectors/registry";
import type { DataSourceStatus, NormalizedSignal } from "@/lib/types";
import { getSignalSnapshot } from "@/server/analytics/market-signals";
import { getLatestIngestionRunSync, getLatestRawEventsSync, getLatestRawMetricsSync, getLatestSourceHealthSync } from "@/storage/ingestion-store";
import type { IngestionRunSummary, RawEventInput, RawMetricInput, SourceDefinition, SourceHealthSnapshot } from "@/types/ingestion";

export type FreshnessState = "fresh" | "recent" | "delayed" | "stale" | "obsolete";
export type OperationalHealthState = "healthy" | "degraded" | "unstable" | "sparse" | "unreliable" | "unavailable";

export interface SourceFreshnessRow {
  sourceId: string;
  sourceName: string;
  tier: 1 | 2 | 3;
  enabled: boolean;
  status: SourceHealthSnapshot["status"] | "not_run";
  freshnessState: FreshnessState;
  healthState: OperationalHealthState;
  freshnessMinutes: number | null;
  expectedIntervalMinutes: number;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  warningFa: string | null;
}

export interface SignalFreshnessRow {
  key: string;
  label: string;
  source: string;
  quality: DataSourceStatus;
  adjustedQuality: DataSourceStatus;
  freshnessState: FreshnessState;
  freshnessMinutes: number | null;
  timestamp: string | null;
  warningFa: string | null;
}

export interface FreshnessReport {
  generatedAt: string;
  overallFreshnessState: FreshnessState;
  overallHealthState: OperationalHealthState;
  latestDataAt: string | null;
  latestRefreshAt: string | null;
  refreshAgeMinutes: number | null;
  sourceFreshness: SourceFreshnessRow[];
  signalFreshness: SignalFreshnessRow[];
  summary: {
    enabledSources: number;
    healthySources: number;
    degradedSources: number;
    unstableSources: number;
    sparseSources: number;
    unavailableSources: number;
    staleSources: number;
    obsoleteSources: number;
    staleSignals: number;
    obsoleteSignals: number;
    overallFreshnessScore: number;
    warningsFa: string[];
  };
}

export const freshnessStateLabelsFa: Record<FreshnessState, string> = {
  fresh: "تازه",
  recent: "اخیر",
  delayed: "با تأخیر",
  stale: "کهنه",
  obsolete: "منقضی",
};

export const operationalHealthLabelsFa: Record<OperationalHealthState, string> = {
  healthy: "سالم",
  degraded: "کاهش کیفیت",
  unstable: "ناپایدار",
  sparse: "پوشش کم",
  unreliable: "غیرقابل اتکا",
  unavailable: "ناموجود",
};

export function minutesSince(timestamp: string | null | undefined, now = new Date()) {
  if (!timestamp) return null;
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.round((now.getTime() - parsed) / 60_000));
}

export function freshnessStateFromAge(ageMinutes: number | null | undefined): FreshnessState {
  if (ageMinutes === null || ageMinutes === undefined) return "obsolete";
  if (ageMinutes <= 15) return "fresh";
  if (ageMinutes <= 45) return "recent";
  if (ageMinutes <= 90) return "delayed";
  if (ageMinutes <= 180) return "stale";
  return "obsolete";
}

export function freshnessScoreFromState(state: FreshnessState) {
  if (state === "fresh") return 100;
  if (state === "recent") return 80;
  if (state === "delayed") return 60;
  if (state === "stale") return 35;
  return 5;
}

export function dataQualityFromFreshness(quality: DataSourceStatus, timestamp: string | null | undefined): DataSourceStatus {
  if (quality === "unavailable" || quality === "estimated") return quality;
  const state = freshnessStateFromAge(minutesSince(timestamp));
  if (state === "fresh") return quality;
  if (state === "recent") return quality === "live" ? "partial_live" : quality;
  if (state === "delayed" || state === "stale") return "delayed";
  return "unavailable";
}

function latestTimestamp(values: Array<string | null | undefined>) {
  const latest = values
    .map((value) => (value ? Date.parse(value) : NaN))
    .filter(Number.isFinite)
    .sort((left, right) => right - left)[0];
  return latest ? new Date(latest).toISOString() : null;
}

function sourceFreshnessAge(source: SourceDefinition, health?: SourceHealthSnapshot) {
  if (!source.enabled) return null;
  if (!health) return null;
  if (health.lastSuccessAt) return minutesSince(health.lastSuccessAt);
  if (health.status === "success" || health.status === "degraded") return minutesSince(health.updatedAt);
  return null;
}

function sourceHealthState(source: SourceDefinition, health: SourceHealthSnapshot | undefined, freshnessState: FreshnessState): OperationalHealthState {
  if (!source.enabled || health?.status === "disabled" || health?.status === "api_key_missing") return "unavailable";
  if (!health) return "sparse";
  if (health.status === "failed") return health.consecutiveFailures >= 2 ? "unstable" : "degraded";
  if (freshnessState === "obsolete") return "unavailable";
  if (freshnessState === "stale") return "unstable";
  if (health.status === "degraded" || freshnessState === "delayed") return "degraded";
  return "healthy";
}

function sourceWarning(source: SourceDefinition, health: SourceHealthSnapshot | undefined, freshnessMinutes: number | null, healthState: OperationalHealthState) {
  if (!source.enabled) return source.disabledReason ?? "این منبع فعلاً غیرفعال است.";
  if (!health) return "برای این منبع هنوز health snapshot ثبت نشده است.";
  if (health.status === "api_key_missing") return "کلید API این منبع تنظیم نشده و خروجی آن ناموجود است.";
  if (health.status === "failed") return health.lastError ?? "آخرین اجرای منبع ناموفق بوده است.";
  const expected = Math.max(45, Math.round(source.pollingIntervalSeconds / 60) * 2);
  if (freshnessMinutes !== null && freshnessMinutes > expected) {
    return `آخرین دریافت موفق ${freshnessMinutes} دقیقه پیش بوده و از بازه مورد انتظار ${expected} دقیقه عبور کرده است.`;
  }
  if (healthState === "degraded") return "منبع فعال است اما کیفیت یا تازگی آن کامل نیست.";
  return null;
}

function buildSourceRows(sourceHealth: SourceHealthSnapshot[]) {
  const healthById = new Map(sourceHealth.map((source) => [source.sourceId, source]));
  return productionSources.map((source): SourceFreshnessRow => {
    const health = healthById.get(source.id);
    const freshnessMinutes = sourceFreshnessAge(source, health);
    const freshnessState = freshnessStateFromAge(freshnessMinutes);
    const healthState = sourceHealthState(source, health, freshnessState);

    return {
      sourceId: source.id,
      sourceName: source.name,
      tier: source.tier,
      enabled: source.enabled,
      status: health?.status ?? "not_run",
      freshnessState,
      healthState,
      freshnessMinutes,
      expectedIntervalMinutes: Math.round(source.pollingIntervalSeconds / 60),
      lastSuccessAt: health?.lastSuccessAt ?? null,
      lastFailureAt: health?.lastFailureAt ?? null,
      warningFa: sourceWarning(source, health, freshnessMinutes, healthState),
    };
  });
}

function buildSignalRows(signals: NormalizedSignal[]) {
  return signals.map((signal): SignalFreshnessRow => {
    const freshnessMinutes = minutesSince(signal.timestamp);
    const freshnessState = freshnessStateFromAge(freshnessMinutes);
    const adjustedQuality = dataQualityFromFreshness(signal.quality, signal.timestamp);
    const warningFa =
      adjustedQuality === "unavailable" && signal.quality !== "unavailable"
        ? "این سیگنال به دلیل کهنگی داده ناموجود شده است."
        : freshnessState === "stale" || freshnessState === "obsolete"
          ? `آخرین بروزرسانی سیگنال ${freshnessMinutes ?? "نامشخص"} دقیقه پیش بوده است.`
          : null;

    return {
      key: signal.key,
      label: signal.label,
      source: signal.source,
      quality: signal.quality,
      adjustedQuality,
      freshnessState,
      freshnessMinutes,
      timestamp: signal.timestamp,
      warningFa,
    };
  });
}

function overallHealthState(params: {
  enabledSources: number;
  healthySources: number;
  unstableSources: number;
  sparseSources: number;
  unavailableSources: number;
  obsoleteSources: number;
  score: number;
}) {
  if (!params.enabledSources) return "unavailable" as const;
  const unavailableRatio = params.unavailableSources / params.enabledSources;
  const sparseRatio = params.sparseSources / params.enabledSources;
  if (params.score < 25 || unavailableRatio > 0.45) return "unreliable" as const;
  if (params.sparseSources > 0 && sparseRatio > 0.25) return "sparse" as const;
  if (params.unstableSources > 0 || params.obsoleteSources > 0) return "unstable" as const;
  if (params.score < 70 || params.healthySources / params.enabledSources < 0.72) return "degraded" as const;
  return "healthy" as const;
}

export function buildFreshnessReportFromInputs(params: {
  sourceHealth: SourceHealthSnapshot[];
  rawMetrics: RawMetricInput[];
  rawEvents: RawEventInput[];
  signals: NormalizedSignal[];
  lastRun: IngestionRunSummary | null;
}): FreshnessReport {
  const sourceRows = buildSourceRows(params.sourceHealth);
  const signalRows = buildSignalRows(params.signals);
  const enabledRows = sourceRows.filter((source) => source.enabled);
  const latestDataAt = latestTimestamp([
    ...params.rawEvents.map((event) => event.timestamp),
    ...params.rawMetrics.map((metric) => metric.timestamp),
    ...params.signals.map((signal) => signal.timestamp),
    ...params.sourceHealth.map((source) => source.lastSuccessAt),
  ]);
  const refreshAgeMinutes = minutesSince(params.lastRun?.finishedAt ?? latestDataAt);
  const sourceFreshnessScore = enabledRows.length ? enabledRows.reduce((sum, row) => sum + freshnessScoreFromState(row.freshnessState), 0) / enabledRows.length : 0;
  const signalFreshnessScore = signalRows.length ? signalRows.reduce((sum, row) => sum + freshnessScoreFromState(row.freshnessState), 0) / signalRows.length : 0;
  const overallFreshnessScore = Math.round(sourceFreshnessScore * 0.52 + signalFreshnessScore * 0.48);
  const staleSources = enabledRows.filter((source) => source.freshnessState === "stale").length;
  const obsoleteSources = enabledRows.filter((source) => source.freshnessState === "obsolete").length;
  const staleSignals = signalRows.filter((signal) => signal.freshnessState === "stale").length;
  const obsoleteSignals = signalRows.filter((signal) => signal.freshnessState === "obsolete").length;
  const overallFreshnessState = freshnessStateFromAge(refreshAgeMinutes ?? minutesSince(latestDataAt));
  const healthySources = enabledRows.filter((source) => source.healthState === "healthy").length;
  const degradedSources = enabledRows.filter((source) => source.healthState === "degraded").length;
  const unstableSources = enabledRows.filter((source) => source.healthState === "unstable").length;
  const sparseSources = enabledRows.filter((source) => source.healthState === "sparse").length;
  const unavailableSources = enabledRows.filter((source) => source.healthState === "unavailable" || source.healthState === "unreliable").length;
  const health = overallHealthState({
    enabledSources: enabledRows.length,
    healthySources,
    unstableSources,
    sparseSources,
    unavailableSources,
    obsoleteSources,
    score: overallFreshnessScore,
  });
  const warningsFa = [
    refreshAgeMinutes !== null && refreshAgeMinutes > 35 ? `بروزرسانی از بازه ۳۰ دقیقه‌ای عقب افتاده است؛ آخرین اجرای موفق ${refreshAgeMinutes} دقیقه پیش ثبت شده.` : "",
    staleSources || obsoleteSources ? `${staleSources + obsoleteSources} منبع فعال کهنه یا منقضی شده‌اند و نباید به شکل زنده نمایش داده شوند.` : "",
    staleSignals || obsoleteSignals ? `${staleSignals + obsoleteSignals} سیگنال خام stale/obsolete است؛ خروجی‌های وابسته باید confidence پایین‌تری نشان دهند.` : "",
    health === "sparse" ? "پوشش سلامت منابع کم است؛ احتمالاً برخی collectors هنوز اجرا نشده‌اند." : "",
    health === "unreliable" ? "کیفیت freshness برای نتیجه‌گیری جهت‌دار قابل اتکا نیست." : "",
  ].filter(Boolean);

  return {
    generatedAt: new Date().toISOString(),
    overallFreshnessState,
    overallHealthState: health,
    latestDataAt,
    latestRefreshAt: params.lastRun?.finishedAt ?? null,
    refreshAgeMinutes,
    sourceFreshness: sourceRows,
    signalFreshness: signalRows,
    summary: {
      enabledSources: enabledRows.length,
      healthySources,
      degradedSources,
      unstableSources,
      sparseSources,
      unavailableSources,
      staleSources,
      obsoleteSources,
      staleSignals,
      obsoleteSignals,
      overallFreshnessScore,
      warningsFa,
    },
  };
}

export function getFreshnessReportSync(): FreshnessReport {
  return buildFreshnessReportFromInputs({
    sourceHealth: getLatestSourceHealthSync(),
    rawMetrics: getLatestRawMetricsSync(300),
    rawEvents: getLatestRawEventsSync(300),
    signals: getSignalSnapshot().signals,
    lastRun: getLatestIngestionRunSync(),
  });
}
