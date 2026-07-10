import type { CmipRuntimeOptionsSection } from "../../runtime-input";
import { normalizeNumericDataPoint } from "../data-point-normalizer";
import { cmipNormalizationIssue, type CmipNormalizationError, type CmipNormalizationWarning } from "../errors";
import { normalizationFail, normalizationOk, type CmipNormalizationResult } from "../result";
import type { CmipNormalizeDataPointOptions, CmipRawDataPoint, CmipRawOptionsPayload, CmipRawOptionsTermPoint } from "../types";

const OPTION_FIELDS = ["btc_put_call_ratio", "eth_put_call_ratio", "btc_iv", "eth_iv", "btc_25d_skew", "eth_25d_skew", "max_pain", "gamma_risk"] as const;

export function normalizeOptionsDomain(raw: CmipRawOptionsPayload | undefined, context: Pick<CmipNormalizeDataPointOptions, "dataCutoff" | "sourceMap">): CmipNormalizationResult<CmipRuntimeOptionsSection> {
  const errors: CmipNormalizationError[] = [];
  const warnings: CmipNormalizationWarning[] = [];
  if (!raw) warnings.push(cmipNormalizationIssue({ code: "DOMAIN_PARTIAL", path: "$.domains.options", domain: "options", message: "Options domain missing; structural nulls emitted.", severity: "warning" }));
  const normalize = (field: (typeof OPTION_FIELDS)[number]) => {
    const rawField = raw?.[field];
    if (rawField === null || rawField === undefined || Array.isArray(rawField)) return null;
    const result = normalizeNumericDataPoint(rawField as CmipRawDataPoint, { path: `$.domains.options.${field}`, domain: "options", dataCutoff: context.dataCutoff, sourceMap: context.sourceMap, fieldType: "options", targetUnit: field.includes("ratio") ? "RATIO" : field === "max_pain" || field === "gamma_risk" ? "USD" : "PERCENT", percentage: !field.includes("ratio") && field !== "max_pain" && field !== "gamma_risk" });
    warnings.push(...result.warnings);
    if (!result.ok) {
      errors.push(...result.errors);
      return null;
    }
    return result.data;
  };
  const termRaw = raw?.term_structure;
  const term_structure = Array.isArray(termRaw)
    ? (termRaw as readonly CmipRawOptionsTermPoint[]).flatMap((term, index) => {
        const result = normalizeNumericDataPoint(term.implied_volatility, { path: `$.domains.options.term_structure[${index}].implied_volatility`, domain: "options", dataCutoff: context.dataCutoff, sourceMap: context.sourceMap, fieldType: "options", targetUnit: "PERCENT", percentage: true });
        warnings.push(...result.warnings);
        if (!result.ok) {
          errors.push(...result.errors);
          return [];
        }
        return [{
          asset: term.asset,
          tenor: term.tenor,
          implied_volatility: result.data,
          source_refs: [...(term.source_refs ?? term.sourceRefs ?? [])].sort(),
        }];
      })
    : [];

  const section: CmipRuntimeOptionsSection = {
    btc_put_call_ratio: normalize("btc_put_call_ratio"),
    eth_put_call_ratio: normalize("eth_put_call_ratio"),
    btc_iv: normalize("btc_iv"),
    eth_iv: normalize("eth_iv"),
    btc_25d_skew: normalize("btc_25d_skew"),
    eth_25d_skew: normalize("eth_25d_skew"),
    term_structure,
    max_pain: normalize("max_pain"),
    gamma_risk: normalize("gamma_risk"),
  };
  return errors.length ? normalizationFail(errors, warnings) : normalizationOk(section, warnings);
}
