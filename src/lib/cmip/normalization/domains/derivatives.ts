import type { CmipRuntimeDerivativesSection } from "../../runtime-input";
import { normalizeNumericDataPoint } from "../data-point-normalizer";
import { cmipNormalizationIssue, type CmipNormalizationError, type CmipNormalizationWarning } from "../errors";
import { normalizationFail, normalizationOk, type CmipNormalizationResult } from "../result";
import type { CmipNormalizeDataPointOptions, CmipRawDataPoint, CmipRawDerivativesPayload } from "../types";

export function normalizeDerivativesDomain(raw: CmipRawDerivativesPayload | undefined, context: Pick<CmipNormalizeDataPointOptions, "dataCutoff" | "sourceMap">): CmipNormalizationResult<CmipRuntimeDerivativesSection> {
  const errors: CmipNormalizationError[] = [];
  const warnings: CmipNormalizationWarning[] = [];
  if (!raw) warnings.push(cmipNormalizationIssue({ code: "DOMAIN_PARTIAL", path: "$.domains.derivatives", domain: "derivatives", message: "Derivatives domain missing.", severity: "warning" }));
  const normalize = (field: keyof CmipRawDerivativesPayload, targetUnit: "USD" | "PERCENT" | "RATIO" = "USD", derived = false) => {
    const result = normalizeNumericDataPoint(asDataPoint(raw?.[field]), {
      path: `$.domains.derivatives.${String(field)}`,
      domain: "derivatives",
      dataCutoff: context.dataCutoff,
      sourceMap: context.sourceMap,
      fieldType: field === "btc_funding" || field === "eth_funding" ? "funding" : field.toString().includes("liquidations") ? "liquidations" : "open_interest",
      targetUnit,
      percentage: targetUnit === "PERCENT",
      derived,
    });
    warnings.push(...result.warnings);
    if (!result.ok) {
      errors.push(...result.errors);
      return { value: null, unit: targetUnit === "USD" ? "USD" : targetUnit === "PERCENT" ? "percent" : "ratio", observed_at: null, source_refs: [], quality: 0, freshness: { age_seconds: null, max_age_seconds: 3600, is_stale: false }, status: "missing" as const, calculation: null };
    }
    return result.data;
  };

  if (raw?.btc_open_interest?.unit && raw.eth_open_interest?.unit && raw.btc_open_interest.unit !== raw.eth_open_interest.unit) {
    errors.push(cmipNormalizationIssue({ code: "UNIT_MISMATCH", path: "$.domains.derivatives.open_interest", domain: "derivatives", message: "OI currencies must match before aggregation.", severity: "error" }));
  }

  const liquidations = raw?.liquidations_24h?.value;
  const long = raw?.long_liquidations_24h?.value;
  const short = raw?.short_liquidations_24h?.value;
  if (typeof liquidations === "number" && typeof long === "number" && typeof short === "number") {
    const tolerance = raw?.liquidation_tolerance_pct ?? 5;
    const mismatchPct = liquidations === 0 ? 0 : (Math.abs(liquidations - (long + short)) / liquidations) * 100;
    if (mismatchPct > tolerance) {
      warnings.push(cmipNormalizationIssue({ code: "SOURCE_CONFLICT", path: "$.domains.derivatives.liquidations_24h", domain: "derivatives", message: "Liquidation components do not reconcile with total inside tolerance.", severity: "warning" }));
    }
  }

  const funding_by_exchange = (raw?.funding_by_exchange ?? []).map((funding, index) => {
    const result = normalizeNumericDataPoint(funding.funding_rate, { path: `$.domains.derivatives.funding_by_exchange[${index}].funding_rate`, domain: "derivatives", dataCutoff: context.dataCutoff, sourceMap: context.sourceMap, fieldType: "funding", targetUnit: "PERCENT", percentage: true });
    warnings.push(...result.warnings);
    if (!result.ok) errors.push(...result.errors);
    return {
      exchange: funding.exchange,
      asset: funding.asset,
      funding_rate: result.ok ? result.data : { value: null, unit: "percent", observed_at: null, source_refs: [], quality: 0, freshness: { age_seconds: null, max_age_seconds: 3600, is_stale: false }, status: "missing" as const, calculation: null },
      interval: funding.interval,
      source_refs: [...(funding.source_refs ?? funding.sourceRefs ?? [])].sort(),
    };
  });

  const section: CmipRuntimeDerivativesSection = {
    market_open_interest: normalize("market_open_interest", "USD"),
    market_open_interest_change_24h: normalize("market_open_interest_change_24h", "PERCENT", true),
    btc_open_interest: normalize("btc_open_interest", "USD"),
    eth_open_interest: normalize("eth_open_interest", "USD"),
    btc_funding: normalize("btc_funding", "PERCENT"),
    eth_funding: normalize("eth_funding", "PERCENT"),
    funding_by_exchange,
    liquidations_24h: normalize("liquidations_24h", "USD"),
    long_liquidations_24h: normalize("long_liquidations_24h", "USD"),
    short_liquidations_24h: normalize("short_liquidations_24h", "USD"),
    futures_basis: normalize("futures_basis", "PERCENT"),
    long_short_ratio: normalize("long_short_ratio", "RATIO"),
  };
  return errors.length ? normalizationFail(errors, warnings) : normalizationOk(section, warnings);
}

function asDataPoint(value: unknown): CmipRawDataPoint | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as CmipRawDataPoint) : undefined;
}
