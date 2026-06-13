import type { DataSourceStatus, NormalizedSignal } from "@/lib/types";
import type { SourceDefinition, SourceHealthSnapshot } from "@/types/ingestion";

export type FreshnessState = "fresh" | "recent" | "delayed" | "stale" | "obsolete" | "unavailable";
export type SignalFreshnessClassification =
  | "CORE_REQUIRED"
  | "CORE_DEGRADED"
  | "OPTIONAL_FREE"
  | "OPTIONAL_PREMIUM"
  | "DISABLED_UNAVAILABLE";

export interface FreshnessResolution {
  ageMinutes: number | null;
  expectedIntervalMinutes: number;
  state: FreshnessState;
  score: number;
  adjustedQuality: DataSourceStatus;
  stale: boolean;
  countsAgainstGlobalFreshness: boolean;
  classification?: SignalFreshnessClassification;
  warningFa: string | null;
}

const MINUTE = 1;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MIN_OPERATIONAL_TIMESTAMP_MS = Date.parse("2024-01-01T00:00:00.000Z");

export function isOperationalTimestamp(timestamp: string | null | undefined, now = new Date()): timestamp is string {
  if (!timestamp) return false;
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return false;
  if (parsed < MIN_OPERATIONAL_TIMESTAMP_MS) return false;
  if (parsed > now.getTime() + 10 * 60_000) return false;
  return true;
}

export function minutesSince(timestamp: string | null | undefined, now = new Date()) {
  if (!isOperationalTimestamp(timestamp, now)) return null;
  const parsed = Date.parse(timestamp as string);
  return Math.max(0, Math.round((now.getTime() - parsed) / 60_000));
}

function freshnessScoreFromStateInternal(state: FreshnessState) {
  if (state === "fresh") return 100;
  if (state === "recent") return 85;
  if (state === "delayed") return 60;
  if (state === "stale") return 28;
  if (state === "obsolete") return 5;
  return 0;
}

export function freshnessScoreFromState(state: FreshnessState) {
  return freshnessScoreFromStateInternal(state);
}

function qualityForState(quality: DataSourceStatus, state: FreshnessState): DataSourceStatus {
  if (quality === "unavailable" || quality === "estimated") return quality;
  if (state === "fresh" || state === "recent") return quality;
  if (state === "delayed" || state === "stale") return "delayed";
  return "unavailable";
}

export function freshnessStateFromAge(ageMinutes: number | null | undefined, expectedIntervalMinutes = 30): FreshnessState {
  if (ageMinutes === null || ageMinutes === undefined) return "obsolete";
  if (ageMinutes <= expectedIntervalMinutes * 2) return "fresh";
  if (ageMinutes <= expectedIntervalMinutes * 3) return "recent";
  if (ageMinutes <= expectedIntervalMinutes * 6) return "delayed";
  if (ageMinutes <= expectedIntervalMinutes * 12) return "stale";
  return "obsolete";
}

function etfFreshnessState(ageMinutes: number | null | undefined): FreshnessState {
  if (ageMinutes === null || ageMinutes === undefined) return "obsolete";
  if (ageMinutes <= 3 * DAY) return "fresh";
  if (ageMinutes <= 7 * DAY) return "delayed";
  return "stale";
}

function fredMetricExpectedIntervalMinutes(key: string) {
  if (/dgs|us10y|us2y|yield_curve|dxy/i.test(key)) return 3 * DAY;
  return 45 * DAY;
}

export function expectedIntervalMinutesForSignal(signal: Pick<NormalizedSignal, "key" | "group" | "source">) {
  if (/etf_flow/i.test(signal.key)) return DAY;
  if (signal.key === "nasdaq_trend_24h") return 4 * HOUR;
  if (/funding/i.test(signal.key)) return 4 * HOUR;
  if (signal.key === "exchange_reserves_btc_7d") return DAY;
  if (/liquidation/i.test(signal.key)) return DAY;
  if (/stablecoin|usdt_supply|usdc_supply/i.test(signal.key)) return DAY;
  if (/open_interest|futures|spot_volume/i.test(signal.key)) return 12 * HOUR;
  if (/news|sentiment|geopolitical/i.test(signal.key) || signal.group === "news" || signal.group === "sentiment" || signal.group === "geopolitical") return 7 * DAY;
  if (/cpi|ppi|fed_funds|unemployment|employment|dgs|us10y|us2y|yield_curve/i.test(signal.key) || /FRED/i.test(signal.source ?? "")) {
    return fredMetricExpectedIntervalMinutes(signal.key);
  }
  if (/btc_trend|eth_trend|sol_trend|dxy_trend|nasdaq_trend|gold_trend|vix_trend/i.test(signal.key)) return 30;
  return 30;
}

export function signalFreshnessClassification(signal: Pick<NormalizedSignal, "key" | "source"> & Partial<Pick<NormalizedSignal, "group">>): SignalFreshnessClassification {
  if (signal.key === "exchange_reserves_btc_7d" && /MacroMicro/i.test(signal.source ?? "")) {
    return "OPTIONAL_FREE";
  }
  if (signal.key === "exchange_inflows" || signal.key === "exchange_outflows" || signal.key === "exchange_reserves_btc_7d") {
    return "OPTIONAL_PREMIUM";
  }
  if (signal.key === "liquidation_btc_24h") return "OPTIONAL_FREE";
  if (signal.key === "btc_market_cap" || signal.key === "eth_market_cap" || signal.key === "sol_market_cap" || signal.key === "stablecoin_dominance") {
    return "OPTIONAL_FREE";
  }
  if (signal.key === "us2y_trend_24h" || signal.key === "yield_curve_10y2y") return "OPTIONAL_FREE";
  if (signal.key === "cpi_latest" || signal.key === "ppi_latest" || signal.key === "fed_funds_rate" || signal.key === "unemployment_rate") return "CORE_DEGRADED";
  if (signal.key === "funding_btc" || signal.key === "funding_eth" || signal.key === "funding_sol" || signal.key === "nasdaq_trend_24h") {
    return "CORE_DEGRADED";
  }
  if (
    signal.key === "open_interest_btc_24h" ||
    signal.key === "open_interest_eth_24h" ||
    signal.key === "open_interest_sol_24h" ||
    signal.key === "futures_volume_btc_24h" ||
    signal.key === "futures_volume_eth_24h" ||
    signal.key === "futures_volume_sol_24h"
  ) {
    return "CORE_DEGRADED";
  }
  if (/etf_flow/i.test(signal.key)) return "OPTIONAL_FREE";
  return "CORE_REQUIRED";
}

export function signalCountsAgainstGlobalFreshness(classification: SignalFreshnessClassification, state: FreshnessState) {
  if (classification === "CORE_REQUIRED") return true;
  if (classification === "CORE_DEGRADED") return state === "stale" || state === "obsolete";
  return false;
}

export function expectedIntervalMinutesForSource(source: SourceDefinition) {
  if (source.category === "etf" || source.parser === "farside_etf_flows") return DAY;
  if (source.id === "fred-api") return Math.max(DAY, Math.round(source.pollingIntervalSeconds / 60));
  if (source.parser === "rss") return Math.max(15, Math.round(source.pollingIntervalSeconds / 60));
  return Math.max(1, Math.round(source.pollingIntervalSeconds / 60));
}

export function resolveFreshness(params: {
  timestamp?: string | null;
  ageMinutes?: number | null;
  expectedIntervalMinutes: number;
  quality?: DataSourceStatus;
  special?: "etf" | null;
  missingState?: "obsolete" | "unavailable";
  countsAgainstGlobalFreshness?: boolean;
  classification?: SignalFreshnessClassification;
  warningLabelFa?: string;
  now?: Date;
}): FreshnessResolution {
  const ageMinutes = params.ageMinutes ?? minutesSince(params.timestamp, params.now);
  const quality = params.quality ?? "live";
  const state =
    ageMinutes === null && params.missingState === "unavailable"
      ? "unavailable"
      : params.special === "etf"
        ? etfFreshnessState(ageMinutes)
        : freshnessStateFromAge(ageMinutes, params.expectedIntervalMinutes);
  const adjustedQuality = qualityForState(quality, state);
  const stale = state === "stale" || state === "obsolete";
  const warningFa =
    state === "unavailable"
      ? `${params.warningLabelFa ?? "داده"} ناموجود است؛ اگر اختیاری یا premium باشد freshness کلی را خراب نمی‌کند.`
      : state === "obsolete"
      ? `${params.warningLabelFa ?? "داده"} ناموجود یا منقضی است.`
      : stale
        ? `${params.warningLabelFa ?? "داده"} از آستانه تازگی عبور کرده است؛ age=${ageMinutes ?? "نامشخص"} دقیقه.`
        : state === "delayed"
          ? `${params.warningLabelFa ?? "داده"} با تأخیر است؛ نباید confidence را تقویت کند.`
          : null;

  return {
    ageMinutes,
    expectedIntervalMinutes: params.expectedIntervalMinutes,
    state,
    score: freshnessScoreFromStateInternal(state),
    adjustedQuality,
    stale,
    countsAgainstGlobalFreshness: params.countsAgainstGlobalFreshness ?? true,
    classification: params.classification,
    warningFa,
  };
}

export function resolveSignalFreshness(signal: Pick<NormalizedSignal, "key" | "group" | "source" | "quality" | "timestamp">, now = new Date()) {
  const classification = signalFreshnessClassification(signal);
  const missingState =
    classification === "OPTIONAL_PREMIUM" || classification === "OPTIONAL_FREE" || classification === "DISABLED_UNAVAILABLE" || classification === "CORE_DEGRADED"
      ? "unavailable"
      : "obsolete";
  const expectedIntervalMinutes = expectedIntervalMinutesForSignal(signal);
  const resolution = resolveFreshness({
    timestamp: signal.timestamp,
    expectedIntervalMinutes,
    quality: signal.quality,
    special: /etf_flow/i.test(signal.key) ? "etf" : null,
    missingState,
    countsAgainstGlobalFreshness: true,
    classification,
    warningLabelFa: signal.key,
    now,
  });
  const state =
    signal.key === "nasdaq_trend_24h" && signal.quality === "delayed" && resolution.ageMinutes !== null && resolution.ageMinutes <= 3 * DAY
      ? "delayed"
      : resolution.state;
  return {
    ...resolution,
    state,
    score: freshnessScoreFromStateInternal(state),
    adjustedQuality: qualityForState(signal.quality, state),
    stale: state === "stale" || state === "obsolete",
    countsAgainstGlobalFreshness: signalCountsAgainstGlobalFreshness(classification, state),
    classification,
  };
}

export function resolveSourceFreshness(source: SourceDefinition, health?: SourceHealthSnapshot, now = new Date()) {
  const timestamp = health?.lastSuccessAt ?? (health?.status === "success" || health?.status === "degraded" ? health.updatedAt : null);
  return resolveFreshness({
    timestamp,
    expectedIntervalMinutes: expectedIntervalMinutesForSource(source),
    quality: health?.status === "failed" || health?.status === "api_key_missing" || health?.status === "disabled" ? "unavailable" : "live",
    special: source.category === "etf" || source.parser === "farside_etf_flows" ? "etf" : null,
    warningLabelFa: source.name,
    now,
  });
}

export function resolveGlobalFreshness(params: {
  lastSuccessfulRun?: string | null;
  lastSuccessfulSignal?: string | null;
  lastSuccessfulSource?: string | null;
  now?: Date;
}) {
  const now = params.now ?? new Date();
  const timestamps = [params.lastSuccessfulRun, params.lastSuccessfulSignal, params.lastSuccessfulSource]
    .filter((timestamp): timestamp is string => typeof timestamp === "string" && isOperationalTimestamp(timestamp, now))
    .sort((left, right) => Date.parse(right) - Date.parse(left));
  const latest = timestamps[0] ?? null;
  const primary = resolveFreshness({
    timestamp: latest,
    expectedIntervalMinutes: 30,
    quality: latest ? "live" : "unavailable",
    warningLabelFa: "بروزرسانی کلی پلتفرم",
    now,
  });
  return {
    latest,
    ...primary,
  };
}

export function dataQualityFromFreshness(quality: DataSourceStatus, timestamp: string | null | undefined, signal?: Pick<NormalizedSignal, "key" | "group" | "source">): DataSourceStatus {
  if (quality === "unavailable" || quality === "estimated") return quality;
  const resolution = signal
    ? resolveSignalFreshness({ ...signal, quality, timestamp: timestamp ?? null })
    : resolveFreshness({ timestamp, expectedIntervalMinutes: 30, quality });
  return resolution.adjustedQuality;
}
