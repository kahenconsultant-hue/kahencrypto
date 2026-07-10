import type { CmipRuntimeMarketSection } from "../../runtime-input";
import { cmipNormalizationIssue, type CmipNormalizationError, type CmipNormalizationWarning } from "../errors";
import { normalizeNumericDataPoint } from "../data-point-normalizer";
import { normalizationFail, normalizationOk, type CmipNormalizationResult } from "../result";
import type { CmipRawMarketPayload, CmipNormalizeDataPointOptions } from "../types";

export function normalizeMarketDomain(
  raw: CmipRawMarketPayload | undefined,
  context: Pick<CmipNormalizeDataPointOptions, "dataCutoff" | "sourceMap">,
): CmipNormalizationResult<CmipRuntimeMarketSection> {
  if (!raw) {
    return normalizationFail([
      cmipNormalizationIssue({
        code: "DOMAIN_FAILED",
        path: "$.domains.market",
        domain: "market",
        message: "Market domain is required for normalization.",
        severity: "critical",
      }),
    ]);
  }

  const errors: CmipNormalizationError[] = [];
  const warnings: CmipNormalizationWarning[] = [];
  const point = (field: keyof CmipRawMarketPayload, targetUnit: "USD" | "PERCENT" | "INDEX_POINTS", fieldType: "market_price" | "market_volume" | "breadth") => {
    const result = normalizeNumericDataPoint(raw[field] && "value" in raw[field] ? raw[field] : undefined, {
      path: `$.domains.market.${field}`,
      domain: "market",
      dataCutoff: context.dataCutoff,
      sourceMap: context.sourceMap,
      fieldType,
      targetUnit,
      percentage: targetUnit === "PERCENT" || field === "fear_greed_index",
    });
    warnings.push(...result.warnings);
    if (!result.ok) {
      errors.push(...result.errors);
      return undefined;
    }
    return result.data;
  };

  const total_crypto_market_cap = point("total_crypto_market_cap", "USD", "market_price");
  const total_crypto_volume_24h = point("total_crypto_volume_24h", "USD", "market_volume");
  const btc_dominance = point("btc_dominance", "PERCENT", "breadth");
  const eth_dominance = point("eth_dominance", "PERCENT", "breadth");
  const fear_greed_index = point("fear_greed_index", "INDEX_POINTS", "breadth");

  if (errors.length || !total_crypto_market_cap || !total_crypto_volume_24h || !btc_dominance || !eth_dominance || !fear_greed_index) {
    return normalizationFail(errors, warnings);
  }

  const regime = raw.market_regime_proxy;
  const sourceRefs = [...(regime?.source_refs ?? regime?.sourceRefs ?? [])].map((sourceRef) => sourceRef.trim()).filter(Boolean).sort();
  const market_regime_proxy: CmipRuntimeMarketSection["market_regime_proxy"] = {
    value: isMarketRegime(regime?.value) ? regime.value : "unavailable",
    status: regime?.status ?? "missing",
    method: regime?.method?.trim() || "not supplied",
    source_refs: sourceRefs,
  };

  return normalizationOk(
    {
      total_crypto_market_cap,
      total_crypto_volume_24h,
      btc_dominance,
      eth_dominance,
      fear_greed_index,
      market_regime_proxy,
    },
    warnings,
  );
}

function isMarketRegime(value: unknown): value is CmipRuntimeMarketSection["market_regime_proxy"]["value"] {
  return value === "risk_on" || value === "mild_risk_on" || value === "neutral" || value === "mild_risk_off" || value === "risk_off" || value === "unavailable";
}
