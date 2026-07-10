import type { CmipRuntimeCalculationTrace, CmipRuntimeDataPoint, CmipRuntimeDataPointStatus } from "../runtime-input";
import { cmipNormalizationIssue, type CmipNormalizationError, type CmipNormalizationWarning } from "./errors";
import { calculateFreshness, freshnessForMissing } from "./freshness";
import { calculatePointQuality } from "./quality";
import { normalizationFail, normalizationOk, type CmipNormalizationResult } from "./result";
import { normalizeTimestamp } from "./timestamp-normalizer";
import type { CmipNormalizeDataPointOptions, CmipRawDataPoint } from "./types";
import { normalizeUnitValue } from "./units";

export type NormalizedNumericDataPoint = CmipRuntimeDataPoint<number>;
export type NormalizedCategoricalDataPoint = CmipRuntimeDataPoint<string>;

export function missingNumericDataPoint(unit: string | null, fieldType: CmipNormalizeDataPointOptions["fieldType"]): NormalizedNumericDataPoint {
  return { value: null, unit, observed_at: null, source_refs: [], quality: 0, freshness: freshnessForMissing(fieldType), status: "missing", calculation: null };
}

export function normalizeNumericDataPoint(raw: CmipRawDataPoint | null | undefined, options: CmipNormalizeDataPointOptions): CmipNormalizationResult<NormalizedNumericDataPoint> {
  if (raw?.status === "conflict") {
    if (raw.value !== null && raw.value !== undefined) {
      return normalizationFail([issue("SOURCE_CONFLICT", `${options.path}.value`, "Conflict data points must use value=null.", options)]);
    }
    const sourceRefs = normalizeSourceRefs(raw);
    return normalizationOk({
      value: null,
      unit: outputUnitFor(options.targetUnit),
      observed_at: null,
      source_refs: sourceRefs,
      quality: 0,
      freshness: freshnessForMissing(options.fieldType),
      status: "conflict",
      calculation: null,
    });
  }

  if (!raw || raw.status === "missing" || raw.value === null || raw.value === undefined) {
    if (raw?.status === "missing" && raw.value !== null && raw.value !== undefined) {
      return normalizationFail([issue("INVALID_NUMBER", `${options.path}.value`, "Missing data points must use value=null.", options)]);
    }
    const warnings = options.required || raw?.missingReason
      ? [issue("DOMAIN_PARTIAL", options.path, raw?.missingReason ?? "Required data point is missing.", options, "warning")]
      : [];
    return normalizationOk(missingNumericDataPoint(outputUnitFor(options.targetUnit), options.fieldType), warnings);
  }

  const sourceRefs = normalizeSourceRefs(raw);
  const sourceErrors = validateSourceRefs(sourceRefs, options, raw.status ?? "available");
  if (sourceErrors.length) return normalizationFail(sourceErrors);

  if (typeof raw.value === "string") {
    return normalizationFail([issue("INVALID_NUMBER", `${options.path}.value`, "Numeric strings are invalid at the normalization boundary.", options)]);
  }
  if (typeof raw.value !== "number") {
    return normalizationFail([issue("INVALID_NUMBER", `${options.path}.value`, "Value must be numeric.", options)]);
  }
  if (!Number.isFinite(raw.value)) {
    return normalizationFail([issue("NON_FINITE_NUMBER", `${options.path}.value`, "Value must be finite.", options)]);
  }
  if (!options.allowNegative && raw.value < 0) {
    return normalizationFail([issue("NEGATIVE_VALUE", `${options.path}.value`, "Negative values are not allowed for this field.", options)]);
  }

  const unit = normalizeUnitValue({ value: raw.value, unit: raw.unit, targetUnit: options.targetUnit, path: options.path, domain: options.domain, sourceRefs });
  if (!unit.ok) return unit;

  if (options.percentage && (unit.data.value < 0 || unit.data.value > 100)) {
    return normalizationFail([issue("INVALID_PERCENTAGE", `${options.path}.value`, "Percentages must use 0-100 percentage points.", options)]);
  }
  if (options.correlation && (unit.data.value < -1 || unit.data.value > 1)) {
    return normalizationFail([issue("INVALID_CORRELATION", `${options.path}.value`, "Correlation must be between -1 and 1.", options)]);
  }

  const observedAt = normalizeTimestamp(raw.observed_at ?? raw.observedAt, {
    path: `${options.path}.observed_at`,
    domain: options.domain,
    referenceTimestamp: options.dataCutoff,
    futureToleranceSeconds: 300,
  });
  if (!observedAt.ok) return observedAt;

  const freshness = calculateFreshness({
    observedAt: observedAt.data,
    dataCutoff: options.dataCutoff,
    fieldType: options.fieldType,
    path: options.path,
    domain: options.domain,
    sourceRefs,
  });
  if (!freshness.ok) return freshness;

  let calculation: CmipRuntimeCalculationTrace | null = raw.calculation ?? unit.data.calculation;
  if ((options.derived || unit.data.calculation !== null) && calculation === null) {
    return normalizationFail([issue("CALCULATION_TRACE_MISSING", `${options.path}.calculation`, "Derived values and unit conversions require calculation trace.", options)]);
  }
  if (options.proxy && !calculation?.method.trim() && !raw.proxyMethod?.trim()) {
    return normalizationFail([issue("PROXY_METHOD_MISSING", `${options.path}.calculation`, "Proxy values require an explicit proxy method.", options)]);
  }
  if (options.proxy && calculation === null && raw.proxyMethod) {
    calculation = { method: raw.proxyMethod, formula: raw.proxyMethod, inputs: sourceRefs, version: "CMIP-NORMALIZATION-POLICY-1.0" };
  }

  const status: CmipRuntimeDataPointStatus = freshness.data.is_stale ? "stale" : options.proxy ? "proxy" : (raw.status ?? "available");
  const quality = calculatePointQuality({
    status,
    sourceRefs,
    sourceMap: options.sourceMap,
    isStale: freshness.data.is_stale,
    hasValue: true,
    method: options.proxy ? "proxy" : options.derived || calculation !== null ? "derived" : "direct",
  });

  return normalizationOk(
    {
      value: unit.data.value,
      unit: unit.data.unit,
      observed_at: observedAt.data,
      source_refs: sourceRefs,
      quality,
      freshness: freshness.data,
      status,
      calculation,
    },
    [...unit.warnings, ...observedAt.warnings, ...freshness.warnings],
  );
}

export function normalizeCategoricalDataPoint(
  raw: CmipRawDataPoint | null | undefined,
  options: Omit<CmipNormalizeDataPointOptions, "targetUnit">,
): CmipNormalizationResult<NormalizedCategoricalDataPoint> {
  if (!raw || raw.value === null || raw.value === undefined || raw.status === "missing") {
    return normalizationOk({
      value: null,
      unit: null,
      observed_at: null,
      source_refs: [],
      quality: 0,
      freshness: freshnessForMissing(options.fieldType),
      status: "missing",
      calculation: null,
    });
  }
  if (typeof raw.value !== "string") {
    return normalizationFail([issue("INVALID_NUMBER", `${options.path}.value`, "Categorical value must be a string.", options)]);
  }
  const sourceRefs = normalizeSourceRefs(raw);
  const sourceErrors = validateSourceRefs(sourceRefs, options, raw.status ?? "available");
  if (sourceErrors.length) return normalizationFail(sourceErrors);
  const observedAt = normalizeTimestamp(raw.observed_at ?? raw.observedAt, {
    path: `${options.path}.observed_at`,
    domain: options.domain,
    referenceTimestamp: options.dataCutoff,
    futureToleranceSeconds: 300,
  });
  if (!observedAt.ok) return observedAt;
  const freshness = calculateFreshness({ observedAt: observedAt.data, dataCutoff: options.dataCutoff, fieldType: options.fieldType, path: options.path, domain: options.domain, sourceRefs });
  if (!freshness.ok) return freshness;
  const status: CmipRuntimeDataPointStatus = freshness.data.is_stale ? "stale" : (raw.status ?? "available");
  return normalizationOk(
    {
      value: raw.value,
      unit: raw.unit ?? null,
      observed_at: observedAt.data,
      source_refs: sourceRefs,
      quality: calculatePointQuality({ status, sourceRefs, sourceMap: options.sourceMap, isStale: freshness.data.is_stale, hasValue: true, method: "direct" }),
      freshness: freshness.data,
      status,
      calculation: raw.calculation ?? null,
    },
    [...observedAt.warnings, ...freshness.warnings],
  );
}

function normalizeSourceRefs(raw: CmipRawDataPoint): string[] {
  return [...(raw.source_refs ?? raw.sourceRefs ?? [])].map((sourceRef) => sourceRef.trim()).filter(Boolean).sort();
}

function validateSourceRefs(sourceRefs: readonly string[], options: Pick<CmipNormalizeDataPointOptions, "path" | "domain" | "sourceMap">, status: CmipRuntimeDataPointStatus): CmipNormalizationError[] {
  const errors: CmipNormalizationError[] = [];
  if ((status === "available" || status === "proxy" || status === "stale") && sourceRefs.length === 0) {
    errors.push(issue("MISSING_SOURCE", `${options.path}.source_refs`, `${status} data points require at least one source.`, options));
  }
  sourceRefs.forEach((sourceRef, index) => {
    const source = options.sourceMap.get(sourceRef);
    if (!source) {
      errors.push(issue("MISSING_SOURCE", `${options.path}.source_refs[${index}]`, `Source ${sourceRef} is not registered.`, options));
    } else if ((status === "available" || status === "proxy" || status === "stale") && source.status === "failed") {
      errors.push(issue("INVALID_SOURCE", `${options.path}.source_refs[${index}]`, `Failed source ${sourceRef} cannot verify an available value.`, options));
    } else if ((status === "available" || status === "proxy" || status === "stale") && source.status === "conflict") {
      errors.push(issue("SOURCE_CONFLICT", `${options.path}.source_refs[${index}]`, `Conflict source ${sourceRef} cannot verify an available value.`, options));
    }
  });
  return errors;
}

function issue(
  code: CmipNormalizationError["code"],
  path: string,
  message: string,
  options: Pick<CmipNormalizeDataPointOptions, "domain">,
  severity: "warning" | "error" = "error",
): CmipNormalizationError | CmipNormalizationWarning {
  return cmipNormalizationIssue({ code, path, message, domain: options.domain, severity });
}

function outputUnitFor(unit: CmipNormalizeDataPointOptions["targetUnit"]): string {
  if (unit === "USD" || unit === "USD_MILLION" || unit === "USD_BILLION") return "USD";
  if (unit === "PERCENT") return "percent";
  if (unit === "INDEX_POINTS") return "index_points";
  if (unit === "RATIO") return "ratio";
  if (unit === "COUNT") return "count";
  if (unit === "DAYS") return "days";
  if (unit === "SECONDS") return "seconds";
  if (unit === "BASIS_POINTS") return "basis_points";
  return "decimal";
}
