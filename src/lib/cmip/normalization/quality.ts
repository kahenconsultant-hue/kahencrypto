import type { CmipRuntimeDataQualitySummary, CmipRuntimeDataPointStatus, CmipRuntimeSource } from "../runtime-input";
import { CMIP_RUNTIME_DOMAINS } from "../runtime-input/constants";
import type { CmipNormalizationError, CmipNormalizationWarning } from "./errors";

export const CMIP_INPUT_QUALITY_WEIGHTS = {
  source_quality: 0.25,
  freshness_quality: 0.2,
  completeness_quality: 0.2,
  agreement_quality: 0.15,
  identity_quality: 0.1,
  method_quality: 0.1,
} as const;

export function calculatePointQuality(params: {
  status: CmipRuntimeDataPointStatus;
  sourceRefs: readonly string[];
  sourceMap: ReadonlyMap<string, CmipRuntimeSource>;
  isStale: boolean;
  hasValue: boolean;
  identityStatus?: "verified" | "conflict" | "unavailable";
  method: "direct" | "proxy" | "derived" | "missing";
}): number {
  const sourceQuality = average(params.sourceRefs.map((sourceRef) => sourceQualityScore(params.sourceMap.get(sourceRef))));
  const freshnessQuality = params.isStale ? 35 : params.status === "missing" ? 0 : 100;
  const completenessQuality = params.hasValue ? 100 : 20;
  const agreementQuality = params.status === "conflict" ? 0 : params.sourceRefs.some((sourceRef) => params.sourceMap.get(sourceRef)?.status === "conflict") ? 20 : 100;
  const identityQuality = params.identityStatus === "conflict" || params.identityStatus === "unavailable" ? 0 : 100;
  const methodQuality = params.method === "proxy" ? 55 : params.method === "derived" ? 70 : params.method === "missing" ? 0 : 100;
  const score =
    sourceQuality * CMIP_INPUT_QUALITY_WEIGHTS.source_quality +
    freshnessQuality * CMIP_INPUT_QUALITY_WEIGHTS.freshness_quality +
    completenessQuality * CMIP_INPUT_QUALITY_WEIGHTS.completeness_quality +
    agreementQuality * CMIP_INPUT_QUALITY_WEIGHTS.agreement_quality +
    identityQuality * CMIP_INPUT_QUALITY_WEIGHTS.identity_quality +
    methodQuality * CMIP_INPUT_QUALITY_WEIGHTS.method_quality;
  return clampScore(score);
}

export function sourceQualityScore(source: CmipRuntimeSource | undefined): number {
  if (!source) return 0;
  const statusBase = source.status === "ok" ? 100 : source.status === "partial" ? 65 : source.status === "stale" ? 55 : source.status === "conflict" ? 20 : 0;
  const tierPenalty = source.tier === "primary" ? 0 : source.tier === "secondary" ? 10 : source.tier === "fallback" ? 25 : 35;
  return clampScore(statusBase - tierPenalty);
}

export function assembleDataQuality(params: {
  sources: readonly CmipRuntimeSource[];
  warnings: readonly CmipNormalizationWarning[];
  errors: readonly CmipNormalizationError[];
  presentDomains: ReadonlySet<string>;
}): CmipRuntimeDataQualitySummary {
  const failedSources = params.sources.filter((source) => source.status === "failed").map((source) => source.source_id);
  const staleFields = params.warnings.filter((issue) => issue.code === "STALE_DATA").map((issue) => issue.path);
  const conflicts = [...params.warnings, ...params.errors]
    .filter((issue) => issue.code === "SOURCE_CONFLICT" || issue.code === "IDENTITY_CONFLICT" || issue.code === "TIMEFRAME_CONFLICT")
    .map((issue) => issue.path);
  const criticalMissingFields = [...params.warnings, ...params.errors]
    .filter((issue) => issue.code === "MISSING_SOURCE" || issue.code === "MISSING_ASSET" || issue.code === "DOMAIN_FAILED" || issue.code === "DOMAIN_PARTIAL")
    .map((issue) => issue.path);

  const qualityByDomainEntries = CMIP_RUNTIME_DOMAINS.map((domain) => {
    const domainErrors = params.errors.filter((issue) => issue.domain === domain);
    const domainWarnings = params.warnings.filter((issue) => issue.domain === domain);
    const present = params.presentDomains.has(domain);
    const score = domainErrors.length ? 0 : !present ? 35 : domainWarnings.length ? 70 : 90;
    return [domain, score] as const;
  });
  const quality_by_domain = Object.fromEntries(qualityByDomainEntries) as CmipRuntimeDataQualitySummary["quality_by_domain"];
  const domainScores = Object.values(quality_by_domain);
  const overallCoverage = average(domainScores);
  const freshnessScore = clampScore(100 - staleFields.length * 12);
  const sourceAgreement = clampScore(100 - conflicts.length * 20 - failedSources.length * 10);

  return {
    overall_coverage: overallCoverage,
    freshness_score: freshnessScore,
    source_agreement: sourceAgreement,
    critical_missing_fields: uniqueSorted(criticalMissingFields),
    stale_fields: uniqueSorted(staleFields),
    conflicts: uniqueSorted(conflicts),
    failed_sources: uniqueSorted(failedSources),
    quality_by_domain,
  };
}

function average(values: readonly number[]): number {
  if (!values.length) return 0;
  return clampScore(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Number(value.toFixed(2))));
}

function uniqueSorted(values: readonly string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort();
}
