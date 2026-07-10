import {
  CMIP_ABSTENTION_REASON_CODES,
  CMIP_DECISION_POSTURES,
  CMIP_EVIDENCE_VERDICTS,
  CMIP_PREVIOUS_VALID_REPORT_POLICIES,
  CMIP_REQUIRED_ASSET_SYMBOLS,
  CMIP_SCENARIO_TIME_HORIZONS,
} from "../contracts/constants";
import { CMIP_RUNTIME_DOMAINS, CMIP_RUNTIME_HORIZONS } from "../runtime-input/constants";

export const CMIP_INTELLIGENCE_SPEC_VERSION = "CMIP-INTELLIGENCE-SPEC-1.0";

export const CMIP_INTELLIGENCE_REQUIRED_ASSET_SYMBOLS = CMIP_REQUIRED_ASSET_SYMBOLS;
export const CMIP_INTELLIGENCE_OUTPUT_POSTURES = CMIP_DECISION_POSTURES;
export const CMIP_INTELLIGENCE_DECISION_POSTURES = CMIP_DECISION_POSTURES;
export const CMIP_INTELLIGENCE_HISTORICAL_VERDICTS = CMIP_EVIDENCE_VERDICTS;
export const CMIP_INTELLIGENCE_SCENARIO_HORIZONS = CMIP_SCENARIO_TIME_HORIZONS;
export const CMIP_INTELLIGENCE_RUNTIME_HORIZONS = CMIP_RUNTIME_HORIZONS;
export const CMIP_INTELLIGENCE_RUNTIME_DOMAINS = CMIP_RUNTIME_DOMAINS;
export const CMIP_INTELLIGENCE_ABSTENTION_REASON_CODES = CMIP_ABSTENTION_REASON_CODES;
export const CMIP_INTELLIGENCE_PREVIOUS_VALID_REPORT_POLICIES = CMIP_PREVIOUS_VALID_REPORT_POLICIES;

export const CMIP_EVIDENCE_DOMAINS = [
  "macro",
  "liquidity",
  "institutional_flow",
  "market_structure",
  "momentum",
  "derivatives",
  "options",
  "cross_asset",
  "breadth",
  "news_geopolitical",
  "historical_evidence",
  "previous_decision",
  "data_quality",
] as const;

export const CMIP_EVIDENCE_DIRECTIONS = ["supportive", "contradictory", "neutral", "mixed", "unknown"] as const;
export const CMIP_EVIDENCE_STRENGTHS = ["very_weak", "weak", "moderate", "strong", "very_strong"] as const;
export const CMIP_EVIDENCE_RELIABILITIES = ["low", "medium", "high", "verified"] as const;
export const CMIP_CONFLICT_LEVELS = ["none", "low", "moderate", "high", "unresolved"] as const;

export const CMIP_CONFLICT_TYPES = [
  "source_conflict",
  "timeframe_conflict",
  "domain_conflict",
  "identity_conflict",
  "calculation_conflict",
  "historical_conflict",
  "decision_memory_conflict",
] as const;

export const CMIP_HYPOTHESIS_IDS = [
  "bull_expansion",
  "bull_continuation",
  "recovery",
  "neutral_transition",
  "distribution",
  "bear_continuation",
  "bear_expansion",
  "capitulation",
  "liquidity_stress",
  "deleveraging",
] as const;

export const CMIP_DECISION_EVALUATION_STATUSES = [
  "pending",
  "correct",
  "partially_correct",
  "incorrect",
  "invalidated",
  "not_evaluable",
] as const;

export const CMIP_DECISION_ERROR_CLASSIFICATIONS = [
  "data_failure",
  "logic_failure",
  "timing_failure",
  "unexpected_event",
  "overconfidence",
  "underconfidence",
  "insufficient_evidence",
  "identity_error",
  "source_error",
] as const;

export const CMIP_FAILURE_STATES = [
  "insufficient_data",
  "critical_source_failure",
  "identity_conflict",
  "unresolved_primary_source_conflict",
  "schema_invalid",
  "historical_data_unavailable",
  "decision_memory_unavailable",
  "model_output_invalid",
  "low_confidence",
] as const;

export const CMIP_REASONING_STAGES = [
  "runtime_input_validation",
  "data_quality_assessment",
  "evidence_extraction",
  "evidence_classification",
  "evidence_reliability_assessment",
  "evidence_independence_assessment",
  "conflict_detection",
  "hypothesis_generation",
  "historical_evidence_comparison",
  "analogy_evaluation",
  "alternative_scenario_generation",
  "invalidation_analysis",
  "decision_synthesis",
  "confidence_attribution",
  "decision_memory_comparison",
  "explanation_generation",
  "audit_trace",
  "output_contract",
] as const;
