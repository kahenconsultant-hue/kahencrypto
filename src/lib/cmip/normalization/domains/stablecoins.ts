import type { CmipRuntimeStablecoinSection } from "../../runtime-input";
import { normalizeNumericDataPoint } from "../data-point-normalizer";
import { cmipNormalizationIssue, type CmipNormalizationError, type CmipNormalizationWarning } from "../errors";
import { normalizationFail, normalizationOk, type CmipNormalizationResult } from "../result";
import type { CmipNormalizeDataPointOptions, CmipRawStablecoinPayload } from "../types";

const FIELDS = [
  "total_market_cap",
  "change_1d",
  "change_7d",
  "change_30d",
  "usdt_supply",
  "usdc_supply",
  "usdt_change_7d",
  "usdt_change_30d",
  "usdc_change_7d",
  "usdc_change_30d",
] as const;

export function normalizeStablecoinsDomain(raw: CmipRawStablecoinPayload | undefined, context: Pick<CmipNormalizeDataPointOptions, "dataCutoff" | "sourceMap">): CmipNormalizationResult<CmipRuntimeStablecoinSection> {
  const errors: CmipNormalizationError[] = [];
  const warnings: CmipNormalizationWarning[] = [];
  if (!raw) warnings.push(cmipNormalizationIssue({ code: "DOMAIN_PARTIAL", path: "$.domains.stablecoins", domain: "stablecoins", message: "Stablecoin domain missing.", severity: "warning" }));
  const normalize = (field: (typeof FIELDS)[number], targetUnit: "USD" | "PERCENT", derived = false) => {
    const result = normalizeNumericDataPoint(raw?.[field] ?? undefined, {
      path: `$.domains.stablecoins.${field}`,
      domain: "stablecoins",
      dataCutoff: context.dataCutoff,
      sourceMap: context.sourceMap,
      fieldType: "stablecoin_supply",
      targetUnit,
      percentage: targetUnit === "PERCENT",
      derived,
    });
    warnings.push(...result.warnings);
    if (!result.ok) {
      errors.push(...result.errors);
      return { value: null, unit: targetUnit === "USD" ? "USD" : "percent", observed_at: null, source_refs: [], quality: 0, freshness: { age_seconds: null, max_age_seconds: 86400, is_stale: false }, status: "missing" as const, calculation: null };
    }
    return result.data;
  };
  const nullable = (field: "exchange_reserves" | "chain_flows") => {
    if (raw?.[field] === null || raw?.[field] === undefined) return null;
    const result = normalizeNumericDataPoint(raw[field], { path: `$.domains.stablecoins.${field}`, domain: "stablecoins", dataCutoff: context.dataCutoff, sourceMap: context.sourceMap, fieldType: "stablecoin_supply", targetUnit: "USD", proxy: raw[field]?.status === "proxy" });
    warnings.push(...result.warnings);
    if (!result.ok) {
      errors.push(...result.errors);
      return null;
    }
    return result.data;
  };
  const section: CmipRuntimeStablecoinSection = {
    total_market_cap: normalize("total_market_cap", "USD"),
    change_1d: normalize("change_1d", "PERCENT", true),
    change_7d: normalize("change_7d", "PERCENT", true),
    change_30d: normalize("change_30d", "PERCENT", true),
    usdt_supply: normalize("usdt_supply", "USD"),
    usdc_supply: normalize("usdc_supply", "USD"),
    usdt_change_7d: normalize("usdt_change_7d", "PERCENT", true),
    usdt_change_30d: normalize("usdt_change_30d", "PERCENT", true),
    usdc_change_7d: normalize("usdc_change_7d", "PERCENT", true),
    usdc_change_30d: normalize("usdc_change_30d", "PERCENT", true),
    exchange_reserves: nullable("exchange_reserves"),
    chain_flows: nullable("chain_flows"),
  };
  return errors.length ? normalizationFail(errors, warnings) : normalizationOk(section, warnings);
}
