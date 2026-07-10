import { validateCmipAssetUniverse } from "./validate-asset-universe";
import type { CmipChart, CmipReportEnvelope, CmipScenario, CmipValidationError } from "./types";

const PROBABILITY_SUM_TOLERANCE = 0.5;
const FORBIDDEN_CHART_PAYLOAD_PATTERNS: readonly RegExp[] = [
  /<\s*\/?\s*(script|style|svg|html|iframe|canvas|object|embed|link|meta|div|span)\b/i,
  /<\s*[A-Z][A-Za-z0-9]*(\s|>|\/)/,
  /\bjavascript\s*:/i,
  /\bdata\s*:\s*image\//i,
  /\bbase64\b/i,
  /\bfunction\s*\(/i,
  /=>/,
  /\b(import|export)\s+(default|const|let|var|function|\{|\*)/i,
];

export function validateCmipReportSemantics(envelope: CmipReportEnvelope): CmipValidationError[] {
  const report = envelope.cmip_report;
  const errors: CmipValidationError[] = [];

  errors.push(...validateCmipAssetUniverse(report.coins));
  errors.push(...validateAuditSources(report.audit.sources));
  errors.push(...validateDateOrder(report.meta.generated_at, report.meta.data_cutoff));

  const sourceRefs = new Set(report.audit.sources.map((source) => source.ref));
  report.reasons.forEach((reason, reasonIndex) => {
    errors.push(...validateSourceRefs(reason.source_refs, sourceRefs, `$.cmip_report.reasons[${reasonIndex}].source_refs`));

    const historical = reason.historical_evidence;
    const historicalPath = `$.cmip_report.reasons[${reasonIndex}].historical_evidence`;
    if (!historical.limitations.trim()) {
      errors.push({
        path: `${historicalPath}.limitations`,
        message: "Historical limitations must not be empty.",
        keyword: "cmipHistoricalLimitations",
      });
    }

    if (historical.status === "unavailable" && reason.evidence_verdict === "confirmed") {
      errors.push({
        path: `$.cmip_report.reasons[${reasonIndex}].evidence_verdict`,
        message: "A reason with unavailable historical evidence cannot use evidence_verdict=confirmed.",
        keyword: "cmipHistoricalUnavailableConfirmed",
      });
    }

    if (historical.status !== "unavailable") {
      if (historical.sample_size === null) {
        errors.push({
          path: `${historicalPath}.sample_size`,
          message: "Verified or partial historical evidence must include a non-null sample_size.",
          keyword: "cmipHistoricalSampleSizeRequired",
        });
      }
      if (historical.result === null) {
        errors.push({
          path: `${historicalPath}.result`,
          message: "Verified or partial historical evidence must include a result object.",
          keyword: "cmipHistoricalResultRequired",
        });
      }
    }

    if (historical.sample_size === null && historical.result?.success_rate !== null && historical.result?.success_rate !== undefined) {
      errors.push({
        path: `${historicalPath}.result.success_rate`,
        message: "Historical success_rate must be null when sample_size is null.",
        keyword: "cmipHistoricalStatWithoutSample",
      });
    }
  });

  report.charts.forEach((chart, chartIndex) => {
    const chartPath = `$.cmip_report.charts[${chartIndex}]`;
    errors.push(...validateSourceRefs(chart.source_refs, sourceRefs, `${chartPath}.source_refs`));
    errors.push(...validateChartPayload(chart, chartPath));
  });

  report.attribution.forEach((item, index) => {
    errors.push(...validateSourceRefs(item.source_refs, sourceRefs, `$.cmip_report.attribution[${index}].source_refs`));
  });

  report.triggers.forEach((trigger, index) => {
    errors.push(...validateSourceRefs(trigger.source_refs, sourceRefs, `$.cmip_report.triggers[${index}].source_refs`));
  });

  report.coins.forEach((coin, index) => {
    errors.push(...validateSourceRefs(coin.source_refs, sourceRefs, `$.cmip_report.coins[${index}].source_refs`));
  });

  report.engine_scores.forEach((engine, index) => {
    errors.push(...validateSourceRefs(engine.inputs.source_refs, sourceRefs, `$.cmip_report.engine_scores[${index}].inputs.source_refs`));
  });

  report.audit.calculations.forEach((calculation, index) => {
    errors.push(...validateSourceRefs(calculation.inputs.source_refs, sourceRefs, `$.cmip_report.audit.calculations[${index}].inputs.source_refs`));
  });

  errors.push(...validateScenarios(report.scenarios));
  errors.push(...validateUniqueChartIds(report.charts));

  return errors;
}

function validateAuditSources(sources: CmipReportEnvelope["cmip_report"]["audit"]["sources"]): CmipValidationError[] {
  const errors: CmipValidationError[] = [];
  const seen = new Map<string, number[]>();

  sources.forEach((source, index) => {
    const sourcePath = `$.cmip_report.audit.sources[${index}]`;
    const indexes = seen.get(source.ref) ?? [];
    indexes.push(index);
    seen.set(source.ref, indexes);

    if (!source.ref.trim()) {
      errors.push({
        path: `${sourcePath}.ref`,
        message: "Audit source ref must not be empty.",
        keyword: "cmipSourceRefEmpty",
      });
    }

    if (!isHttpUrl(source.url)) {
      errors.push({
        path: `${sourcePath}.url`,
        message: `Audit source URL is malformed or unsupported: ${source.url}.`,
        keyword: "cmipSourceUrl",
      });
    }

    if (!isValidDateTime(source.observed_at)) {
      errors.push({
        path: `${sourcePath}.observed_at`,
        message: "Audit source observed_at must be a valid timestamp.",
        keyword: "cmipSourceObservedAt",
      });
    }
  });

  for (const [ref, indexes] of seen) {
    if (indexes.length > 1) {
      errors.push({
        path: "$.cmip_report.audit.sources",
        message: `Duplicate audit source ref ${ref} at indexes ${indexes.join(", ")}.`,
        keyword: "cmipDuplicateSourceRef",
      });
    }
  }

  return errors;
}

function validateSourceRefs(values: readonly string[], sourceRefs: ReadonlySet<string>, path: string): CmipValidationError[] {
  const errors: CmipValidationError[] = [];
  values.forEach((value, index) => {
    if (!sourceRefs.has(value)) {
      errors.push({
        path: `${path}[${index}]`,
        message: `Source reference ${value} does not exist in audit.sources.`,
        keyword: "cmipSourceRefMissing",
      });
    }
  });
  return errors;
}

function validateScenarios(scenarios: readonly CmipScenario[]): CmipValidationError[] {
  const errors: CmipValidationError[] = [];

  scenarios.forEach((scenario, index) => {
    const path = `$.cmip_report.scenarios[${index}]`;
    if (scenario.probability === null && scenario.calibration_status !== "insufficient_data") {
      errors.push({
        path: `${path}.calibration_status`,
        message: "A scenario with probability=null must use calibration_status=insufficient_data.",
        keyword: "cmipScenarioNullProbabilityCalibration",
      });
    }

    if (scenario.probability !== null && scenario.calibration_status === "insufficient_data") {
      errors.push({
        path: `${path}.calibration_status`,
        message: "A scenario with a numeric probability cannot use calibration_status=insufficient_data.",
        keyword: "cmipScenarioNumericProbabilityCalibration",
      });
    }
  });

  for (const horizon of ["1D", "7D", "30D"] as const) {
    const horizonScenarios = scenarios.filter((scenario) => scenario.time_horizon === horizon);
    if (horizonScenarios.length < 3 || horizonScenarios.some((scenario) => scenario.probability === null)) {
      continue;
    }

    const probabilitySum = horizonScenarios.reduce((sum, scenario) => sum + (scenario.probability ?? 0), 0);
    if (Math.abs(probabilitySum - 100) > PROBABILITY_SUM_TOLERANCE) {
      errors.push({
        path: "$.cmip_report.scenarios",
        message: `Scenario probabilities for ${horizon} must sum to 100 +/- ${PROBABILITY_SUM_TOLERANCE}; received ${probabilitySum}.`,
        keyword: "cmipScenarioProbabilitySum",
      });
    }
  }

  return errors;
}

function validateUniqueChartIds(charts: readonly CmipChart[]): CmipValidationError[] {
  const errors: CmipValidationError[] = [];
  const seen = new Map<string, number[]>();

  charts.forEach((chart, index) => {
    const indexes = seen.get(chart.chart_id) ?? [];
    indexes.push(index);
    seen.set(chart.chart_id, indexes);
  });

  for (const [chartId, indexes] of seen) {
    if (indexes.length > 1) {
      errors.push({
        path: "$.cmip_report.charts",
        message: `Duplicate chart_id ${chartId} at indexes ${indexes.join(", ")}.`,
        keyword: "cmipDuplicateChartId",
      });
    }
  }

  return errors;
}

function validateChartPayload(chart: CmipChart, path: string): CmipValidationError[] {
  return collectForbiddenChartPayload(chart, path);
}

function collectForbiddenChartPayload(value: unknown, path: string): CmipValidationError[] {
  const errors: CmipValidationError[] = [];

  if (typeof value === "string") {
    if (FORBIDDEN_CHART_PAYLOAD_PATTERNS.some((pattern) => pattern.test(value))) {
      errors.push({
        path,
        message: "Chart contract rejects HTML, CSS, JavaScript, JSX, SVG, base64 images and executable payloads.",
        keyword: "cmipChartExecutablePayload",
      });
    }
    return errors;
  }

  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      errors.push(...collectForbiddenChartPayload(item, `${path}[${index}]`));
    });
    return errors;
  }

  if (isRecord(value)) {
    for (const [key, item] of Object.entries(value)) {
      errors.push(...collectForbiddenChartPayload(item, `${path}.${key}`));
    }
  }

  return errors;
}

function validateDateOrder(generatedAt: string, dataCutoff: string): CmipValidationError[] {
  const generatedTime = Date.parse(generatedAt);
  const cutoffTime = Date.parse(dataCutoff);
  if (!Number.isFinite(generatedTime) || !Number.isFinite(cutoffTime) || cutoffTime <= generatedTime) {
    return [];
  }

  return [
    {
      path: "$.cmip_report.meta.data_cutoff",
      message: "data_cutoff must be earlier than or equal to generated_at.",
      keyword: "cmipDataCutoffOrder",
    },
  ];
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function isValidDateTime(value: string): boolean {
  return Number.isFinite(Date.parse(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
