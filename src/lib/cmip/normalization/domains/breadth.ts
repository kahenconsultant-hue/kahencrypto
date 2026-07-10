import type { CmipRuntimeBreadthSection } from "../../runtime-input";
import { CMIP_RUNTIME_REQUIRED_ASSET_SYMBOLS, type CmipRuntimeAssetSymbol } from "../../runtime-input/constants";
import { normalizeNumericDataPoint } from "../data-point-normalizer";
import { cmipNormalizationIssue, type CmipNormalizationError, type CmipNormalizationWarning } from "../errors";
import { normalizationFail, normalizationOk, type CmipNormalizationResult } from "../result";
import type { CmipNormalizeDataPointOptions, CmipRawBreadthPayload, CmipRawDataPoint } from "../types";

export function normalizeBreadthDomain(raw: CmipRawBreadthPayload | undefined, context: Pick<CmipNormalizeDataPointOptions, "dataCutoff" | "sourceMap">): CmipNormalizationResult<CmipRuntimeBreadthSection> {
  const errors: CmipNormalizationError[] = [];
  const warnings: CmipNormalizationWarning[] = [];
  const normalize = (field: keyof CmipRawBreadthPayload, percentage = false) => {
    const result = normalizeNumericDataPoint(asDataPoint(raw?.[field]), { path: `$.domains.breadth.${String(field)}`, domain: "breadth", dataCutoff: context.dataCutoff, sourceMap: context.sourceMap, fieldType: "breadth", targetUnit: percentage ? "PERCENT" : "COUNT", percentage, derived: true });
    warnings.push(...result.warnings);
    if (!result.ok) {
      errors.push(...result.errors);
      return { value: null, unit: percentage ? "percent" : "count", observed_at: null, source_refs: [], quality: 0, freshness: { age_seconds: null, max_age_seconds: 86400, is_stale: false }, status: "missing" as const, calculation: null };
    }
    if (!percentage && typeof result.data.value === "number" && result.data.value > CMIP_RUNTIME_REQUIRED_ASSET_SYMBOLS.length) {
      errors.push(cmipNormalizationIssue({ code: "INVALID_PERCENTAGE", path: `$.domains.breadth.${String(field)}.value`, domain: "breadth", message: "Breadth count cannot exceed the approved universe size.", severity: "error" }));
    }
    return result.data;
  };
  const selected = new Map((raw?.selected_asset_breadth ?? []).map((item) => [item.symbol.toUpperCase(), item]));
  const selected_asset_breadth = CMIP_RUNTIME_REQUIRED_ASSET_SYMBOLS.map((symbol) => {
    const item = selected.get(symbol);
    return {
      symbol,
      above_ma_7d: item?.above_ma_7d ?? null,
      above_ma_30d: item?.above_ma_30d ?? null,
      return_24h_positive: item?.return_24h_positive ?? null,
      return_7d_positive: item?.return_7d_positive ?? null,
      source_refs: [...(item?.source_refs ?? item?.sourceRefs ?? [])].sort(),
    };
  });
  const section: CmipRuntimeBreadthSection = {
    assets_above_ma_7d: normalize("assets_above_ma_7d"),
    assets_above_ma_30d: normalize("assets_above_ma_30d"),
    positive_assets_24h: normalize("positive_assets_24h"),
    positive_assets_7d: normalize("positive_assets_7d"),
    altcoin_season_index: normalize("altcoin_season_index", true),
    btc_leadership: normalize("btc_leadership", true),
    eth_participation: normalize("eth_participation", true),
    selected_asset_breadth: selected_asset_breadth as CmipRuntimeBreadthSection["selected_asset_breadth"],
  };
  return errors.length ? normalizationFail(errors, warnings) : normalizationOk(section, warnings);
}

function asDataPoint(value: unknown): CmipRawDataPoint | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as CmipRawDataPoint) : undefined;
}
