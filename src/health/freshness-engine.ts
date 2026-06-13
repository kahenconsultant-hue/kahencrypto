import { productionSources } from "@/collectors/registry";
import type { DataSourceStatus, NormalizedSignal } from "@/lib/types";
import { getSignalSnapshot } from "@/server/analytics/market-signals";
import { getLatestIngestionRunSync, getLatestRawEventsSync, getLatestRawMetricsSync, getLatestSchedulerRunsSync, getLatestSourceHealthSync } from "@/storage/ingestion-store";
import type { IngestionRunSummary, RawEventInput, RawMetricInput, SourceDefinition, SourceHealthSnapshot } from "@/types/ingestion";
import {
  dataQualityFromFreshness as resolveDataQualityFromFreshness,
  expectedIntervalMinutesForSource,
  freshnessScoreFromState as resolverFreshnessScoreFromState,
  freshnessStateFromAge as resolverFreshnessStateFromAge,
  minutesSince,
  resolveGlobalFreshness,
  resolveSignalFreshness,
  resolveSourceFreshness,
  signalCountsAgainstGlobalFreshness,
  signalFreshnessClassification,
  type SignalFreshnessClassification,
  type FreshnessState,
} from "@/health/freshnessResolver";

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
  classification: SignalFreshnessClassification;
  countsAgainstGlobalFreshness: boolean;
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
  unavailable: "ناموجود",
};

export const operationalHealthLabelsFa: Record<OperationalHealthState, string> = {
  healthy: "سالم",
  degraded: "کاهش کیفیت",
  unstable: "ناپایدار",
  sparse: "پوشش کم",
  unreliable: "غیرقابل اتکا",
  unavailable: "ناموجود",
};

export { minutesSince, type FreshnessState };

export function freshnessStateFromAge(ageMinutes: number | null | undefined): FreshnessState {
  return resolverFreshnessStateFromAge(ageMinutes);
}

export function freshnessScoreFromState(state: FreshnessState) {
  return resolverFreshnessScoreFromState(state);
}

export function dataQualityFromFreshness(quality: DataSourceStatus, timestamp: string | null | undefined, signal?: Pick<NormalizedSignal, "key" | "group" | "source">): DataSourceStatus {
  return resolveDataQualityFromFreshness(quality, timestamp, signal);
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
  return resolveSourceFreshness(source, health).ageMinutes;
}

function isOptionalOnlyAdapterDegradation(source: SourceDefinition, health: SourceHealthSnapshot | undefined) {
  const match = (health?.lastError ?? "").match(/^Core adapters\s+(\d+)\/(\d+); optional enrichments missing:/i);
  return (
    source.id === "cmip-public-market-signal-adapters" &&
    health?.status === "degraded" &&
    Boolean(match && Number(match[1]) === Number(match[2]))
  );
}

function sourceHealthState(source: SourceDefinition, health: SourceHealthSnapshot | undefined, freshnessState: FreshnessState): OperationalHealthState {
  if (!source.enabled || health?.status === "disabled" || health?.status === "api_key_missing") return "unavailable";
  if (!health) return "sparse";
  if (health.status === "failed") return health.consecutiveFailures >= 2 ? "unstable" : "degraded";
  if (freshnessState === "unavailable") return "unavailable";
  if (freshnessState === "obsolete") return "unavailable";
  if (freshnessState === "stale") return "unstable";
  if (isOptionalOnlyAdapterDegradation(source, health)) return "healthy";
  if (health.status === "degraded" || freshnessState === "delayed") return "degraded";
  return "healthy";
}

function sourceWarning(source: SourceDefinition, health: SourceHealthSnapshot | undefined, freshnessMinutes: number | null, healthState: OperationalHealthState) {
  if (!source.enabled) return source.disabledReason ?? "این منبع فعلاً غیرفعال است.";
  if (!health) return "برای این منبع هنوز health snapshot ثبت نشده است.";
  if (health.status === "api_key_missing") return "کلید API این منبع تنظیم نشده و خروجی آن ناموجود است.";
  if (health.status === "failed") return health.lastError ?? "آخرین اجرای منبع ناموفق بوده است.";
  const expected = expectedIntervalMinutesForSource(source);
  const resolution = resolveSourceFreshness(source, health);
  if (resolution.state === "delayed" || resolution.state === "stale" || resolution.state === "obsolete") {
    return `آخرین دریافت موفق ${freshnessMinutes ?? "نامشخص"} دقیقه پیش بوده؛ آستانه منبع ${expected} دقیقه است و وضعیت freshness = ${resolution.state}.`;
  }
  if (isOptionalOnlyAdapterDegradation(source, health)) return "هسته داده سالم است؛ فقط enrichmentهای اختیاری/premium ناموجود هستند.";
  if (healthState === "degraded") return "منبع فعال است اما کیفیت یا تازگی آن کامل نیست.";
  return null;
}

function buildSourceRows(sourceHealth: SourceHealthSnapshot[]) {
  const healthById = new Map(sourceHealth.map((source) => [source.sourceId, source]));
  return productionSources.map((source): SourceFreshnessRow => {
    const health = healthById.get(source.id);
    const resolution = resolveSourceFreshness(source, health);
    const freshnessMinutes = sourceFreshnessAge(source, health);
    const freshnessState = resolution.state;
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
      expectedIntervalMinutes: resolution.expectedIntervalMinutes,
      lastSuccessAt: health?.lastSuccessAt ?? null,
      lastFailureAt: health?.lastFailureAt ?? null,
      warningFa: sourceWarning(source, health, freshnessMinutes, healthState),
    };
  });
}

function buildSignalRows(signals: NormalizedSignal[]) {
  return signals.map((signal): SignalFreshnessRow => {
    const resolution = resolveSignalFreshness(signal);
    const freshnessMinutes = resolution.ageMinutes;
    const freshnessState = resolution.state;
    const adjustedQuality = resolution.adjustedQuality;
    const classification = resolution.classification ?? signalFreshnessClassification(signal);
    const countsAgainstGlobalFreshness = signalCountsAgainstGlobalFreshness(classification, freshnessState);
    const warningFa =
      freshnessState === "unavailable"
        ? classification === "OPTIONAL_PREMIUM"
          ? "این ورودی premium/اختیاری پیکربندی نشده و در freshness کلی شمرده نمی‌شود؛ فقط confidence ماژول وابسته را کاهش می‌دهد."
          : "این ورودی در حال حاضر ناموجود است و نباید به عنوان داده stale تفسیر شود."
      : adjustedQuality === "unavailable" && signal.quality !== "unavailable"
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
      classification,
      countsAgainstGlobalFreshness,
      freshnessState,
      freshnessMinutes,
      timestamp: signal.timestamp,
      warningFa,
    };
  });
}

function sourceCountsAgainstGlobalFreshness(source: SourceFreshnessRow) {
  return source.enabled && source.tier === 1 && source.status !== "api_key_missing" && source.status !== "disabled";
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
  schedulerLastRunAt?: string | null;
}): FreshnessReport {
  const sourceRows = buildSourceRows(params.sourceHealth);
  const signalRows = buildSignalRows(params.signals);
  const enabledRows = sourceRows.filter((source) => source.enabled);
  const globalSourceRows = enabledRows.filter(sourceCountsAgainstGlobalFreshness);
  const globalSignalRows = signalRows.filter((signal) => signal.countsAgainstGlobalFreshness);
  const latestDataAt = latestTimestamp([
    ...params.rawEvents.map((event) => event.timestamp),
    ...params.rawMetrics.map((metric) => metric.timestamp),
    ...params.signals.map((signal) => signal.timestamp),
    ...params.sourceHealth.map((source) => source.lastSuccessAt),
  ]);
  const latestSignalAt = latestTimestamp(params.signals.map((signal) => signal.timestamp));
  const latestSourceAt = latestTimestamp(params.sourceHealth.map((source) => source.lastSuccessAt));
  const globalFreshness = resolveGlobalFreshness({
    lastSuccessfulRun: params.schedulerLastRunAt ?? params.lastRun?.finishedAt ?? null,
    lastSuccessfulSignal: latestSignalAt,
    lastSuccessfulSource: latestSourceAt,
  });
  const refreshAgeMinutes = globalFreshness.ageMinutes;
  const sourceFreshnessScore = globalSourceRows.length ? globalSourceRows.reduce((sum, row) => sum + freshnessScoreFromState(row.freshnessState), 0) / globalSourceRows.length : 0;
  const signalFreshnessScore = globalSignalRows.length ? globalSignalRows.reduce((sum, row) => sum + freshnessScoreFromState(row.freshnessState), 0) / globalSignalRows.length : 0;
  const overallFreshnessScore = Math.round(sourceFreshnessScore * 0.52 + signalFreshnessScore * 0.48);
  const staleSources = globalSourceRows.filter((source) => source.freshnessState === "stale").length;
  const obsoleteSources = globalSourceRows.filter((source) => source.freshnessState === "obsolete").length;
  const staleSignals = globalSignalRows.filter((signal) => signal.freshnessState === "stale").length;
  const obsoleteSignals = globalSignalRows.filter((signal) => signal.freshnessState === "obsolete").length;
  const overallFreshnessState = globalFreshness.state;
  const healthySources = globalSourceRows.filter((source) => source.healthState === "healthy").length;
  const degradedSources = globalSourceRows.filter((source) => source.healthState === "degraded").length;
  const unstableSources = globalSourceRows.filter((source) => source.healthState === "unstable").length;
  const sparseSources = globalSourceRows.filter((source) => source.healthState === "sparse").length;
  const unavailableSources = globalSourceRows.filter((source) => source.healthState === "unavailable" || source.healthState === "unreliable").length;
  const health = overallHealthState({
    enabledSources: globalSourceRows.length,
    healthySources,
    unstableSources,
    sparseSources,
    unavailableSources,
    obsoleteSources,
    score: overallFreshnessScore,
  });
  const warningsFa = [
    refreshAgeMinutes !== null && overallFreshnessState !== "fresh" ? `بروزرسانی از بازه مورد انتظار عقب افتاده است؛ آخرین بروزرسانی معتبر ${refreshAgeMinutes} دقیقه پیش ثبت شده.` : "",
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
    latestRefreshAt: globalFreshness.latest,
    refreshAgeMinutes,
    sourceFreshness: sourceRows,
    signalFreshness: signalRows,
    summary: {
      enabledSources: globalSourceRows.length,
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
  const latestSchedulerRun = getLatestSchedulerRunsSync(1)[0] ?? null;
  return buildFreshnessReportFromInputs({
    sourceHealth: getLatestSourceHealthSync(),
    rawMetrics: getLatestRawMetricsSync(300),
    rawEvents: getLatestRawEventsSync(300),
    signals: getSignalSnapshot().signals,
    lastRun: getLatestIngestionRunSync(),
    schedulerLastRunAt: latestSchedulerRun?.finishedAt ?? null,
  });
}
