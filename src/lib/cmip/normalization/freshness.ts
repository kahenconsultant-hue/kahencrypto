import type { CmipRuntimeFreshness } from "../runtime-input";
import { CMIP_NORMALIZATION_POLICY_VERSION } from "./constants";
import { cmipNormalizationIssue, type CmipNormalizationWarning } from "./errors";
import { normalizationFail, normalizationOk, type CmipNormalizationResult } from "./result";

export const CMIP_FRESHNESS_FIELD_TYPES = [
  "market_price",
  "market_volume",
  "etf_flow",
  "stablecoin_supply",
  "funding",
  "open_interest",
  "liquidations",
  "options",
  "macro_market",
  "macro_release",
  "breadth",
  "news",
  "historical_evidence",
  "decision_memory",
] as const;

export type CmipFreshnessFieldType = (typeof CMIP_FRESHNESS_FIELD_TYPES)[number];
export type CmipStaleBehavior = "mark_stale" | "reject" | "allow_with_warning";

export interface CmipFreshnessPolicy {
  readonly fieldType: CmipFreshnessFieldType;
  readonly maxAgeSeconds: number;
  readonly futureToleranceSeconds: number;
  readonly staleBehavior: CmipStaleBehavior;
  readonly version: typeof CMIP_NORMALIZATION_POLICY_VERSION;
}

export const CMIP_FRESHNESS_POLICIES: Readonly<Record<CmipFreshnessFieldType, CmipFreshnessPolicy>> = {
  market_price: { fieldType: "market_price", maxAgeSeconds: 3600, futureToleranceSeconds: 60, staleBehavior: "reject", version: CMIP_NORMALIZATION_POLICY_VERSION },
  market_volume: { fieldType: "market_volume", maxAgeSeconds: 3600, futureToleranceSeconds: 60, staleBehavior: "reject", version: CMIP_NORMALIZATION_POLICY_VERSION },
  etf_flow: { fieldType: "etf_flow", maxAgeSeconds: 172800, futureToleranceSeconds: 300, staleBehavior: "mark_stale", version: CMIP_NORMALIZATION_POLICY_VERSION },
  stablecoin_supply: { fieldType: "stablecoin_supply", maxAgeSeconds: 86400, futureToleranceSeconds: 300, staleBehavior: "mark_stale", version: CMIP_NORMALIZATION_POLICY_VERSION },
  funding: { fieldType: "funding", maxAgeSeconds: 3600, futureToleranceSeconds: 60, staleBehavior: "mark_stale", version: CMIP_NORMALIZATION_POLICY_VERSION },
  open_interest: { fieldType: "open_interest", maxAgeSeconds: 3600, futureToleranceSeconds: 60, staleBehavior: "mark_stale", version: CMIP_NORMALIZATION_POLICY_VERSION },
  liquidations: { fieldType: "liquidations", maxAgeSeconds: 3600, futureToleranceSeconds: 60, staleBehavior: "mark_stale", version: CMIP_NORMALIZATION_POLICY_VERSION },
  options: { fieldType: "options", maxAgeSeconds: 86400, futureToleranceSeconds: 300, staleBehavior: "mark_stale", version: CMIP_NORMALIZATION_POLICY_VERSION },
  macro_market: { fieldType: "macro_market", maxAgeSeconds: 86400, futureToleranceSeconds: 300, staleBehavior: "mark_stale", version: CMIP_NORMALIZATION_POLICY_VERSION },
  macro_release: { fieldType: "macro_release", maxAgeSeconds: 2678400, futureToleranceSeconds: 300, staleBehavior: "allow_with_warning", version: CMIP_NORMALIZATION_POLICY_VERSION },
  breadth: { fieldType: "breadth", maxAgeSeconds: 86400, futureToleranceSeconds: 300, staleBehavior: "mark_stale", version: CMIP_NORMALIZATION_POLICY_VERSION },
  news: { fieldType: "news", maxAgeSeconds: 604800, futureToleranceSeconds: 300, staleBehavior: "mark_stale", version: CMIP_NORMALIZATION_POLICY_VERSION },
  historical_evidence: { fieldType: "historical_evidence", maxAgeSeconds: 31536000, futureToleranceSeconds: 300, staleBehavior: "allow_with_warning", version: CMIP_NORMALIZATION_POLICY_VERSION },
  decision_memory: { fieldType: "decision_memory", maxAgeSeconds: 31536000, futureToleranceSeconds: 300, staleBehavior: "allow_with_warning", version: CMIP_NORMALIZATION_POLICY_VERSION },
};

export function freshnessForMissing(fieldType: CmipFreshnessFieldType): CmipRuntimeFreshness {
  const policy = CMIP_FRESHNESS_POLICIES[fieldType];
  return { age_seconds: null, max_age_seconds: policy.maxAgeSeconds, is_stale: false };
}

export function calculateFreshness(params: {
  observedAt: string;
  dataCutoff: string;
  fieldType: CmipFreshnessFieldType;
  path: string;
  domain: string;
  sourceRefs?: readonly string[];
}): CmipNormalizationResult<CmipRuntimeFreshness> {
  const policy = CMIP_FRESHNESS_POLICIES[params.fieldType];
  const observedTime = Date.parse(params.observedAt);
  const cutoffTime = Date.parse(params.dataCutoff);
  if (!Number.isFinite(observedTime) || !Number.isFinite(cutoffTime)) {
    return normalizationFail([
      cmipNormalizationIssue({
        code: "INVALID_TIMESTAMP",
        path: params.path,
        domain: params.domain,
        sourceRefs: params.sourceRefs,
        message: "Freshness requires valid observed_at and data_cutoff timestamps.",
        severity: "error",
      }),
    ]);
  }

  if (observedTime > cutoffTime + policy.futureToleranceSeconds * 1000) {
    return normalizationFail([
      cmipNormalizationIssue({
        code: "FUTURE_TIMESTAMP",
        path: params.path,
        domain: params.domain,
        sourceRefs: params.sourceRefs,
        message: "Observed timestamp is beyond the freshness future tolerance.",
        severity: "error",
      }),
    ]);
  }

  const ageSeconds = Math.max(0, Math.floor((cutoffTime - observedTime) / 1000));
  const freshness: CmipRuntimeFreshness = {
    age_seconds: ageSeconds,
    max_age_seconds: policy.maxAgeSeconds,
    is_stale: ageSeconds > policy.maxAgeSeconds,
  };

  if (!freshness.is_stale) return normalizationOk(freshness);

  const warning: CmipNormalizationWarning = cmipNormalizationIssue({
    code: "STALE_DATA",
    path: params.path,
    domain: params.domain,
    sourceRefs: params.sourceRefs,
    message: `${params.fieldType} data is stale under ${policy.version}.`,
    severity: "warning",
  });

  if (policy.staleBehavior === "reject") {
    return normalizationFail([{ ...warning, severity: "critical" }], []);
  }

  return normalizationOk(freshness, [warning]);
}
