import type {
  CMIP_CONFLICT_LEVELS,
  CMIP_CONFLICT_TYPES,
  CMIP_DECISION_ERROR_CLASSIFICATIONS,
  CMIP_DECISION_EVALUATION_STATUSES,
  CMIP_EVIDENCE_DIRECTIONS,
  CMIP_EVIDENCE_DOMAINS,
  CMIP_EVIDENCE_RELIABILITIES,
  CMIP_EVIDENCE_STRENGTHS,
  CMIP_FAILURE_STATES,
  CMIP_HYPOTHESIS_IDS,
  CMIP_INTELLIGENCE_DECISION_POSTURES,
  CMIP_INTELLIGENCE_HISTORICAL_VERDICTS,
  CMIP_INTELLIGENCE_SCENARIO_HORIZONS,
  CMIP_INTELLIGENCE_SPEC_VERSION,
  CMIP_REASONING_STAGES,
} from "./constants";

export type CmipIntelligenceSpecVersion = typeof CMIP_INTELLIGENCE_SPEC_VERSION;
export type CmipEvidenceDomain = (typeof CMIP_EVIDENCE_DOMAINS)[number];
export type CmipEvidenceDirection = (typeof CMIP_EVIDENCE_DIRECTIONS)[number];
export type CmipEvidenceStrength = (typeof CMIP_EVIDENCE_STRENGTHS)[number];
export type CmipEvidenceReliability = (typeof CMIP_EVIDENCE_RELIABILITIES)[number];
export type CmipConflictLevel = (typeof CMIP_CONFLICT_LEVELS)[number];
export type CmipConflictType = (typeof CMIP_CONFLICT_TYPES)[number];
export type CmipHypothesisId = (typeof CMIP_HYPOTHESIS_IDS)[number];
export type CmipDecisionPosture = (typeof CMIP_INTELLIGENCE_DECISION_POSTURES)[number];
export type CmipHistoricalVerdict = (typeof CMIP_INTELLIGENCE_HISTORICAL_VERDICTS)[number];
export type CmipScenarioHorizon = (typeof CMIP_INTELLIGENCE_SCENARIO_HORIZONS)[number];
export type CmipDecisionEvaluationStatus = (typeof CMIP_DECISION_EVALUATION_STATUSES)[number];
export type CmipDecisionErrorClassification = (typeof CMIP_DECISION_ERROR_CLASSIFICATIONS)[number];
export type CmipFailureState = (typeof CMIP_FAILURE_STATES)[number];
export type CmipReasoningStage = (typeof CMIP_REASONING_STAGES)[number];
