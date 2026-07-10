import type { CmipRuntimeEtfAssetFlow, CmipRuntimeEtfSection } from "../../runtime-input";
import { normalizeNumericDataPoint } from "../data-point-normalizer";
import { cmipNormalizationIssue, type CmipNormalizationError, type CmipNormalizationWarning } from "../errors";
import { normalizationFail, normalizationOk, type CmipNormalizationResult } from "../result";
import type { CmipNormalizeDataPointOptions, CmipRawDataPoint, CmipRawEtfAssetPayload, CmipRawEtfPayload } from "../types";

export function normalizeEtfDomain(raw: CmipRawEtfPayload | undefined, context: Pick<CmipNormalizeDataPointOptions, "dataCutoff" | "sourceMap">): CmipNormalizationResult<CmipRuntimeEtfSection> {
  const errors: CmipNormalizationError[] = [];
  const warnings: CmipNormalizationWarning[] = [];
  if (!raw) {
    warnings.push(cmipNormalizationIssue({ code: "DOMAIN_PARTIAL", path: "$.domains.etf", domain: "etf", message: "ETF domain missing; normalized as unavailable.", severity: "warning" }));
  }
  const btc = normalizeEtfAsset("btc", raw?.btc, context, errors, warnings);
  const eth = normalizeEtfAsset("eth", raw?.eth, context, errors, warnings);
  return errors.length ? normalizationFail(errors, warnings) : normalizationOk({ btc, eth }, warnings);
}

function normalizeEtfAsset(asset: "btc" | "eth", raw: CmipRawEtfAssetPayload | undefined, context: Pick<CmipNormalizeDataPointOptions, "dataCutoff" | "sourceMap">, errors: CmipNormalizationError[], warnings: CmipNormalizationWarning[]): CmipRuntimeEtfAssetFlow {
  const path = `$.domains.etf.${asset}`;
  for (const weekend of raw?.zero_flow_weekend_dates ?? []) {
    if (isWeekendDate(weekend)) {
      errors.push(cmipNormalizationIssue({ code: "TIMEFRAME_CONFLICT", path: `${path}.zero_flow_weekend_dates`, domain: "etf", message: "ETF rolling windows must not include weekends as zero-flow trading days.", severity: "error" }));
    }
  }
  const normalize = (field: keyof CmipRawEtfAssetPayload, derived = false, targetUnit: "USD" | "DAYS" = "USD") => {
    const result = normalizeNumericDataPoint(asDataPoint(raw?.[field]), {
      path: `${path}.${String(field)}`,
      domain: "etf",
      dataCutoff: context.dataCutoff,
      sourceMap: context.sourceMap,
      fieldType: "etf_flow",
      targetUnit,
      derived,
    });
    warnings.push(...result.warnings);
    if (!result.ok) {
      errors.push(...result.errors);
      return { value: null, unit: targetUnit === "USD" ? "USD" : "days", observed_at: null, source_refs: [], quality: 0, freshness: { age_seconds: null, max_age_seconds: 172800, is_stale: false }, status: "missing" as const, calculation: null };
    }
    return result.data;
  };
  const fundIds = new Set<string>();
  const fund_breakdown = (raw?.fund_breakdown ?? []).map((fund, index) => {
    if (fundIds.has(fund.fund_id)) {
      errors.push(cmipNormalizationIssue({ code: "SOURCE_CONFLICT", path: `${path}.fund_breakdown[${index}].fund_id`, domain: "etf", message: `Duplicate ETF fund ${fund.fund_id}.`, severity: "error" }));
    }
    fundIds.add(fund.fund_id);
    const source_refs = [...(fund.source_refs ?? fund.sourceRefs ?? [])].sort();
    const dailyNetFlow = normalizeFundPoint(fund.daily_net_flow, `${path}.fund_breakdown[${index}].daily_net_flow`, context, errors, warnings);
    const aum = normalizeFundPoint(fund.aum, `${path}.fund_breakdown[${index}].aum`, context, errors, warnings);
    return {
      fund_id: fund.fund_id,
      ticker: fund.ticker,
      issuer: fund.issuer,
      daily_net_flow: dailyNetFlow,
      aum,
      source_refs,
    };
  });
  return {
    daily_net_flow: normalize("daily_net_flow"),
    flow_7d: normalize("flow_7d", true),
    flow_30d: normalize("flow_30d", true),
    flow_acceleration: normalize("flow_acceleration", true),
    positive_streak_days: normalize("positive_streak_days", false, "DAYS"),
    negative_streak_days: normalize("negative_streak_days", false, "DAYS"),
    latest_trading_date: raw?.latest_trading_date ?? null,
    fund_breakdown,
    source_refs: [...(raw?.source_refs ?? raw?.sourceRefs ?? [])].sort(),
  };
}

function normalizeFundPoint(
  raw: CmipRawEtfAssetPayload["daily_net_flow"],
  path: string,
  context: Pick<CmipNormalizeDataPointOptions, "dataCutoff" | "sourceMap">,
  errors: CmipNormalizationError[],
  warnings: CmipNormalizationWarning[],
) {
  const result = normalizeNumericDataPoint(raw, {
    path,
    domain: "etf",
    dataCutoff: context.dataCutoff,
    sourceMap: context.sourceMap,
    fieldType: "etf_flow",
    targetUnit: "USD",
  });
  warnings.push(...result.warnings);
  if (!result.ok) {
    errors.push(...result.errors);
    return { value: null, unit: "USD", observed_at: null, source_refs: [], quality: 0, freshness: { age_seconds: null, max_age_seconds: 172800, is_stale: false }, status: "missing" as const, calculation: null };
  }
  return result.data;
}

function isWeekendDate(date: string): boolean {
  const parsed = new Date(`${date}T00:00:00.000Z`);
  const day = parsed.getUTCDay();
  return day === 0 || day === 6;
}

function asDataPoint(value: unknown): CmipRawDataPoint | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as CmipRawDataPoint) : undefined;
}
