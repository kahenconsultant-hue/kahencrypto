import type { CmipRuntimeCalculationTrace } from "../runtime-input";
import { CMIP_NORMALIZATION_POLICY_VERSION } from "./constants";
import { cmipNormalizationIssue } from "./errors";
import { normalizationFail, normalizationOk, type CmipNormalizationResult } from "./result";

export const CMIP_CANONICAL_UNITS = [
  "USD",
  "USD_BILLION",
  "USD_MILLION",
  "PERCENT",
  "DECIMAL",
  "INDEX_POINTS",
  "BASIS_POINTS",
  "RATIO",
  "COUNT",
  "DAYS",
  "SECONDS",
] as const;

export type CmipCanonicalUnit = (typeof CMIP_CANONICAL_UNITS)[number];

export interface NormalizedUnitValue {
  readonly value: number;
  readonly unit: string;
  readonly calculation: CmipRuntimeCalculationTrace | null;
}

const UNIT_ALIASES: Readonly<Record<string, CmipCanonicalUnit>> = {
  USD: "USD",
  usd: "USD",
  dollar: "USD",
  USD_MILLION: "USD_MILLION",
  usd_million: "USD_MILLION",
  "usd million": "USD_MILLION",
  USD_BILLION: "USD_BILLION",
  usd_billion: "USD_BILLION",
  "usd billion": "USD_BILLION",
  PERCENT: "PERCENT",
  percent: "PERCENT",
  "%": "PERCENT",
  DECIMAL: "DECIMAL",
  decimal: "DECIMAL",
  INDEX_POINTS: "INDEX_POINTS",
  index_points: "INDEX_POINTS",
  BASIS_POINTS: "BASIS_POINTS",
  basis_points: "BASIS_POINTS",
  bps: "BASIS_POINTS",
  RATIO: "RATIO",
  ratio: "RATIO",
  COUNT: "COUNT",
  count: "COUNT",
  assets: "COUNT",
  DAYS: "DAYS",
  days: "DAYS",
  SECONDS: "SECONDS",
  seconds: "SECONDS",
};

const OUTPUT_UNIT: Readonly<Record<CmipCanonicalUnit, string>> = {
  USD: "USD",
  USD_BILLION: "USD",
  USD_MILLION: "USD",
  PERCENT: "percent",
  DECIMAL: "decimal",
  INDEX_POINTS: "index_points",
  BASIS_POINTS: "basis_points",
  RATIO: "ratio",
  COUNT: "count",
  DAYS: "days",
  SECONDS: "seconds",
};

export function normalizeUnitValue(params: {
  value: number;
  unit: string | null | undefined;
  targetUnit: CmipCanonicalUnit;
  path: string;
  domain: string;
  sourceRefs?: readonly string[];
}): CmipNormalizationResult<NormalizedUnitValue> {
  const rawUnit = params.unit?.trim();
  if (!rawUnit) {
    return normalizationFail([
      cmipNormalizationIssue({
        code: "UNSUPPORTED_UNIT",
        path: `${params.path}.unit`,
        domain: params.domain,
        sourceRefs: params.sourceRefs,
        message: "Unit is required.",
        severity: "error",
      }),
    ]);
  }

  if (["EUR", "GBP", "IRR"].includes(rawUnit.toUpperCase())) {
    return normalizationFail([
      cmipNormalizationIssue({
        code: "UNIT_MISMATCH",
        path: `${params.path}.unit`,
        domain: params.domain,
        sourceRefs: params.sourceRefs,
        message: "Currency conversion is forbidden without a traceable FX input.",
        severity: "error",
      }),
    ]);
  }

  const canonical = UNIT_ALIASES[rawUnit] ?? UNIT_ALIASES[rawUnit.toUpperCase()];
  if (!canonical) {
    return normalizationFail([
      cmipNormalizationIssue({
        code: "UNSUPPORTED_UNIT",
        path: `${params.path}.unit`,
        domain: params.domain,
        sourceRefs: params.sourceRefs,
        message: `Unsupported unit: ${rawUnit}.`,
        severity: "error",
      }),
    ]);
  }

  if (canonical === params.targetUnit) {
    return normalizationOk({ value: params.value, unit: OUTPUT_UNIT[params.targetUnit], calculation: null });
  }

  if (params.targetUnit === "USD" && (canonical === "USD_MILLION" || canonical === "USD_BILLION")) {
    const multiplier = canonical === "USD_MILLION" ? 1_000_000 : 1_000_000_000;
    return normalizationOk({
      value: params.value * multiplier,
      unit: "USD",
      calculation: {
        method: "deterministic_unit_conversion",
        formula: `${canonical} * ${multiplier} = USD`,
        inputs: [`${params.path}.value`, `${params.path}.unit`],
        version: CMIP_NORMALIZATION_POLICY_VERSION,
      },
    });
  }

  return normalizationFail([
    cmipNormalizationIssue({
      code: "UNIT_MISMATCH",
      path: `${params.path}.unit`,
      domain: params.domain,
      sourceRefs: params.sourceRefs,
      message: `Cannot normalize ${canonical} to ${params.targetUnit} without an explicit approved conversion.`,
      severity: "error",
    }),
  ]);
}
