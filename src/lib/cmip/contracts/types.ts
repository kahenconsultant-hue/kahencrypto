import type {
  CMIP_DECISION_POSTURES,
  CMIP_EVIDENCE_VERDICTS,
  CMIP_HISTORICAL_EVIDENCE_STATUSES,
  CMIP_IDENTITY_STATUSES,
  CMIP_SCENARIO_CALIBRATION_STATUSES,
  CMIP_SCENARIO_TIME_HORIZONS,
  CMIP_SUPPORTED_CHART_TYPES,
  CmipAssetSymbol,
} from "./constants";

export type CmipDecisionPosture = (typeof CMIP_DECISION_POSTURES)[number];
export type CmipEvidenceVerdict = (typeof CMIP_EVIDENCE_VERDICTS)[number];
export type CmipIdentityStatus = (typeof CMIP_IDENTITY_STATUSES)[number];
export type CmipHistoricalEvidenceStatus = (typeof CMIP_HISTORICAL_EVIDENCE_STATUSES)[number];
export type CmipScenarioCalibrationStatus = (typeof CMIP_SCENARIO_CALIBRATION_STATUSES)[number];
export type CmipChartType = (typeof CMIP_SUPPORTED_CHART_TYPES)[number];
export type CmipScenarioTimeHorizon = (typeof CMIP_SCENARIO_TIME_HORIZONS)[number];

export type CmipJsonPrimitive = string | number | boolean | null;
export type CmipJsonValue = CmipJsonPrimitive | CmipJsonValue[] | { readonly [key: string]: CmipJsonValue };

export interface CmipReportEnvelope {
  readonly cmip_report: CmipReport;
}

export interface CmipReport {
  readonly meta: CmipReportMeta;
  readonly decision: CmipDecision;
  readonly executive_summary: CmipExecutiveSummary;
  readonly engine_scores: readonly CmipEngineScore[];
  readonly reasons: readonly CmipReason[];
  readonly delta: CmipDelta;
  readonly attribution: readonly CmipAttributionItem[];
  readonly scenarios: readonly CmipScenario[];
  readonly triggers: readonly CmipTrigger[];
  readonly coins: readonly CmipCoinDecision[];
  readonly confidence: CmipConfidence;
  readonly decision_memory: CmipDecisionMemory;
  readonly charts: readonly CmipChart[];
  readonly audit: CmipAudit;
}

export interface CmipReportMeta {
  readonly spec_version: string;
  readonly generated_at: string;
  readonly data_cutoff: string;
  readonly timezone: string;
  readonly report_id: string;
  readonly model_version: string;
  readonly prompt_version: string;
  readonly schema_version: string;
  readonly scoring_version: string;
}

export interface CmipDecision {
  readonly posture: CmipDecisionPosture;
  readonly score: number;
  readonly confidence: number;
  readonly plain_language: string;
  readonly model_action: string;
  readonly drivers: {
    readonly positive: readonly string[];
    readonly negative: readonly string[];
  };
}

export interface CmipExecutiveSummary {
  readonly summary_30s: string;
  readonly watch_list: readonly string[];
  readonly view_change_conditions: readonly string[];
}

export interface CmipEngineScore {
  readonly engine_id: string;
  readonly score: number | null;
  readonly status: string;
  readonly weight: number;
  readonly contribution: number | null;
  readonly data_quality: number;
  readonly inputs: {
    readonly source_refs: readonly string[];
    readonly calc_refs: readonly string[];
  };
  readonly missing_reasons: readonly string[];
  readonly method_version: string;
}

export interface CmipReason {
  readonly reason_id: string;
  readonly title: string;
  readonly current_observation: string;
  readonly meaning: string;
  readonly why_it_matters: string;
  readonly historical_evidence: CmipHistoricalEvidence;
  readonly today_vs_history: string;
  readonly evidence_verdict: CmipEvidenceVerdict;
  readonly decision_impact: string;
  readonly invalidation: string;
  readonly source_refs: readonly string[];
}

export interface CmipHistoricalEvidence {
  readonly status: CmipHistoricalEvidenceStatus;
  readonly sample_definition: string;
  readonly sample_size: number | null;
  readonly period: {
    readonly start: string | null;
    readonly end: string | null;
  };
  readonly result: CmipHistoricalEvidenceResult | null;
  readonly limitations: string;
}

export interface CmipHistoricalEvidenceResult {
  readonly summary: string;
  readonly success_rate: number | null;
  readonly median_forward_return: number | null;
  readonly max_adverse_excursion: number | null;
  readonly max_favorable_excursion: number | null;
  readonly dispersion: number | null;
}

export interface CmipDelta {
  readonly previous_report_id: string | null;
  readonly status: "available" | "unavailable";
  readonly unavailable_reason: string | null;
  readonly changes: readonly CmipDeltaItem[];
}

export interface CmipDeltaItem {
  readonly section: string;
  readonly previous: CmipJsonValue;
  readonly current: CmipJsonValue;
  readonly change_summary: string;
  readonly impact: number | null;
}

export interface CmipAttributionItem {
  readonly driver_id: string;
  readonly title: string;
  readonly impact: number | null;
  readonly contribution: number | null;
  readonly source_refs: readonly string[];
}

export interface CmipScenario {
  readonly scenario: string;
  readonly probability: number | null;
  readonly time_horizon: CmipScenarioTimeHorizon;
  readonly conditions: readonly string[];
  readonly expected_effect: string;
  readonly calibration_status: CmipScenarioCalibrationStatus;
}

export interface CmipTrigger {
  readonly trigger_id: string;
  readonly threshold: string;
  readonly current_state: string;
  readonly effect: string;
  readonly new_posture: CmipDecisionPosture;
  readonly source_refs: readonly string[];
}

export interface CmipCoinDecision {
  readonly symbol: CmipAssetSymbol;
  readonly identity_status: CmipIdentityStatus;
  readonly price: number | null;
  readonly posture: CmipDecisionPosture;
  readonly score: number | null;
  readonly risk: string;
  readonly plain_language: string;
  readonly why: readonly string[];
  readonly historical_context: CmipHistoricalEvidenceStatus;
  readonly trigger: string;
  readonly confidence: number;
  readonly source_refs: readonly string[];
}

export interface CmipConfidence {
  readonly raw: number;
  readonly final: number;
  readonly cap: number | null;
  readonly components: readonly CmipConfidenceComponent[];
}

export interface CmipConfidenceComponent {
  readonly component: string;
  readonly value: number;
  readonly weight: number;
  readonly rationale: string;
}

export interface CmipDecisionMemory {
  readonly status: "available" | "unavailable";
  readonly previous_decisions: readonly {
    readonly report_id: string;
    readonly posture: CmipDecisionPosture;
    readonly score: number;
    readonly confidence: number;
    readonly outcome_status: string;
  }[];
  readonly weekly_evaluation_status: string;
}

export type CmipChartDataValue = string | number | boolean | null;

export interface CmipChartSeries {
  readonly key: string;
  readonly label: string;
  readonly unit: string;
  readonly format: string;
}

export interface CmipChart {
  readonly chart_id: string;
  readonly type: CmipChartType;
  readonly title: string;
  readonly description: string;
  readonly x_key: string;
  readonly series: readonly CmipChartSeries[];
  readonly data: readonly Readonly<Record<string, CmipChartDataValue>>[];
  readonly unit: string;
  readonly source_refs: readonly string[];
  readonly accessibility_summary: string;
}

export interface CmipAudit {
  readonly sources: readonly CmipSourceReference[];
  readonly calculations: readonly CmipCalculationTrace[];
  readonly missing_data: readonly string[];
  readonly conflicts: readonly string[];
  readonly warnings: readonly string[];
}

export interface CmipSourceReference {
  readonly ref: string;
  readonly name: string;
  readonly url: string;
  readonly observed_at: string;
  readonly fields: readonly string[];
}

export interface CmipCalculationTrace {
  readonly ref: string;
  readonly formula_version: string;
  readonly inputs: {
    readonly source_refs: readonly string[];
    readonly calc_refs: readonly string[];
  };
  readonly result: CmipJsonValue;
  readonly notes: string | null;
}

export interface CmipValidationError {
  readonly path: string;
  readonly message: string;
  readonly keyword?: string;
}

export type CmipValidationResult =
  | {
      readonly valid: true;
      readonly data: CmipReportEnvelope;
      readonly errors: [];
    }
  | {
      readonly valid: false;
      readonly data?: undefined;
      readonly errors: readonly CmipValidationError[];
    };
