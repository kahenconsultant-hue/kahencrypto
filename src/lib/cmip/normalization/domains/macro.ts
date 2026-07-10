import type { CmipRuntimeMacroSection } from "../../runtime-input";
import { normalizeCategoricalDataPoint, normalizeNumericDataPoint } from "../data-point-normalizer";
import { cmipNormalizationIssue, type CmipNormalizationError, type CmipNormalizationWarning } from "../errors";
import { normalizationFail, normalizationOk, type CmipNormalizationResult } from "../result";
import type { CmipNormalizeDataPointOptions, CmipRawMacroPayload } from "../types";

export function normalizeMacroDomain(raw: CmipRawMacroPayload | undefined, context: Pick<CmipNormalizeDataPointOptions, "dataCutoff" | "sourceMap">): CmipNormalizationResult<CmipRuntimeMacroSection> {
  const errors: CmipNormalizationError[] = [];
  const warnings: CmipNormalizationWarning[] = [];
  if (!raw) warnings.push(cmipNormalizationIssue({ code: "DOMAIN_PARTIAL", path: "$.domains.macro", domain: "macro", message: "Macro domain missing.", severity: "warning" }));
  const num = (field: keyof CmipRawMacroPayload, targetUnit: "USD" | "PERCENT" | "INDEX_POINTS", fieldType: "macro_market" | "macro_release" = "macro_market", derived = false, proxy = false) => {
    const result = normalizeNumericDataPoint(raw?.[field], { path: `$.domains.macro.${String(field)}`, domain: "macro", dataCutoff: context.dataCutoff, sourceMap: context.sourceMap, fieldType, targetUnit, percentage: targetUnit === "PERCENT", derived, proxy });
    warnings.push(...result.warnings);
    if (!result.ok) {
      errors.push(...result.errors);
      return { value: null, unit: targetUnit === "USD" ? "USD" : targetUnit === "PERCENT" ? "percent" : "index_points", observed_at: null, source_refs: [], quality: 0, freshness: { age_seconds: null, max_age_seconds: fieldType === "macro_release" ? 2678400 : 86400, is_stale: false }, status: "missing" as const, calculation: null };
    }
    return result.data;
  };
  const fedExpectation = normalizeCategoricalDataPoint(raw?.fed_expectation, { path: "$.domains.macro.fed_expectation", domain: "macro", dataCutoff: context.dataCutoff, sourceMap: context.sourceMap, fieldType: "macro_release" });
  warnings.push(...fedExpectation.warnings);
  if (!fedExpectation.ok) errors.push(...fedExpectation.errors);

  const section: CmipRuntimeMacroSection = {
    dxy: num("dxy", "INDEX_POINTS"),
    us_2y: num("us_2y", "PERCENT"),
    us_10y: num("us_10y", "PERCENT"),
    real_yield_10y: num("real_yield_10y", "PERCENT"),
    yield_curve_2s10s: num("yield_curve_2s10s", "PERCENT", "macro_market", true),
    nasdaq: num("nasdaq", "INDEX_POINTS"),
    sp500: num("sp500", "INDEX_POINTS"),
    vix: num("vix", "INDEX_POINTS"),
    gold: num("gold", "USD"),
    oil: num("oil", "USD"),
    fed_policy_rate: num("fed_policy_rate", "PERCENT", "macro_release"),
    fed_expectation: fedExpectation.ok ? fedExpectation.data : { value: null, unit: null, observed_at: null, source_refs: [], quality: 0, freshness: { age_seconds: null, max_age_seconds: 2678400, is_stale: false }, status: "missing", calculation: null },
    us_m2: num("us_m2", "USD", "macro_release"),
    global_liquidity_proxy: num("global_liquidity_proxy", "INDEX_POINTS", "macro_release", true, true),
  };
  return errors.length ? normalizationFail(errors, warnings) : normalizationOk(section, warnings);
}
