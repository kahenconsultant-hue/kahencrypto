import type { CmipRuntimeCorrelation, CmipRuntimeCrossAssetSection } from "../../runtime-input";
import { cmipNormalizationIssue, type CmipNormalizationError, type CmipNormalizationWarning } from "../errors";
import { normalizationFail, normalizationOk, type CmipNormalizationResult } from "../result";
import { normalizeTimestamp } from "../timestamp-normalizer";
import type { CmipNormalizeDataPointOptions, CmipRawCorrelationRecord, CmipRawCrossAssetPayload } from "../types";

const FIELDS = ["btc_nasdaq_correlation", "btc_dxy_correlation", "btc_gold_correlation", "btc_us10y_correlation", "btc_eth_correlation"] as const;

export function normalizeCrossAssetDomain(raw: CmipRawCrossAssetPayload | undefined, context: Pick<CmipNormalizeDataPointOptions, "dataCutoff">): CmipNormalizationResult<CmipRuntimeCrossAssetSection> {
  const errors: CmipNormalizationError[] = [];
  const warnings: CmipNormalizationWarning[] = [];
  const normalize = (field: (typeof FIELDS)[number]) => (raw?.[field] ?? []).map((record, index) => normalizeCorrelation(record, `$.domains.cross_asset.${field}[${index}]`, context.dataCutoff, errors, warnings)).filter((item): item is CmipRuntimeCorrelation => item !== null);
  const section: CmipRuntimeCrossAssetSection = {
    btc_nasdaq_correlation: normalize("btc_nasdaq_correlation"),
    btc_dxy_correlation: normalize("btc_dxy_correlation"),
    btc_gold_correlation: normalize("btc_gold_correlation"),
    btc_us10y_correlation: normalize("btc_us10y_correlation"),
    btc_eth_correlation: normalize("btc_eth_correlation"),
  };
  return errors.length ? normalizationFail(errors, warnings) : normalizationOk(section, warnings);
}

function normalizeCorrelation(record: CmipRawCorrelationRecord, path: string, dataCutoff: string, errors: CmipNormalizationError[], warnings: CmipNormalizationWarning[]): CmipRuntimeCorrelation | null {
  if (typeof record.value !== "number" || !Number.isFinite(record.value)) {
    errors.push(cmipNormalizationIssue({ code: "INVALID_NUMBER", path: `${path}.value`, domain: "cross_asset", message: "Correlation value must be numeric.", severity: "error" }));
    return null;
  }
  if (record.value < -1 || record.value > 1) {
    errors.push(cmipNormalizationIssue({ code: "INVALID_CORRELATION", path: `${path}.value`, domain: "cross_asset", message: "Correlation must be between -1 and 1.", severity: "error" }));
    return null;
  }
  if (typeof record.sample_count !== "number" || !Number.isInteger(record.sample_count) || record.sample_count <= 0) {
    errors.push(cmipNormalizationIssue({ code: "INVALID_NUMBER", path: `${path}.sample_count`, domain: "cross_asset", message: "Correlation sample_count must be a positive integer.", severity: "error" }));
    return null;
  }
  const observed = normalizeTimestamp(record.observed_at ?? record.observedAt, { path: `${path}.observed_at`, domain: "cross_asset", referenceTimestamp: dataCutoff, futureToleranceSeconds: 300 });
  warnings.push(...observed.warnings);
  if (!observed.ok) {
    errors.push(...observed.errors);
    return null;
  }
  return {
    window: record.window,
    value: record.value,
    sample_count: record.sample_count ?? null,
    method: record.method,
    observed_at: observed.data,
    source_refs: [...(record.source_refs ?? record.sourceRefs ?? [])].sort(),
    calculation: record.calculation ?? null,
  };
}
