# Reasoning Pipeline

Official stage order:

```text
Runtime Input Validation
  -> Data Quality Assessment
  -> Evidence Extraction
  -> Evidence Classification
  -> Evidence Reliability Assessment
  -> Evidence Independence Assessment
  -> Conflict Detection
  -> Hypothesis Generation
  -> Historical Evidence Comparison
  -> Analogy Evaluation
  -> Alternative Scenario Generation
  -> Invalidation Analysis
  -> Decision Synthesis
  -> Confidence Attribution
  -> Decision Memory Comparison
  -> Explanation Generation
  -> Audit Trace
  -> Output Contract
```

| Stage | Input | Output | Permitted transformations | Prohibited transformations | Failure condition | Audit requirement |
| --- | --- | --- | --- | --- | --- | --- |
| runtime_input_validation | Task 002 envelope | valid input or schema failure | JSON Schema and semantic validation | repairing or dropping fields | invalid schema or semantic rule | validator version and error paths |
| data_quality_assessment | valid input, source registry | coverage, freshness, conflict summary | summarize quality by domain | hiding missing critical domains | critical data unavailable | input paths and source refs |
| evidence_extraction | normalized fields | evidence items | convert fields to explicit observations | inventing evidence | required domain cannot be read | evidence id per observation |
| evidence_classification | evidence items | direction and domain labels | classify support, contradiction, neutral, mixed | assigning direction without basis | ambiguous material evidence | classification rule ref |
| evidence_reliability_assessment | evidence items, sources | reliability and quality | evaluate freshness, tier, method, identity | treating low quality as high importance | unresolved identity for key asset | quality dimensions |
| evidence_independence_assessment | evidence graph | independence groups | group correlated signals | double-counting same mechanism | insufficient independent domains | group id and rationale |
| conflict_detection | evidence and sources | conflict objects | identify source, timeframe, domain, identity conflicts | averaging conflicts silently | material unresolved primary conflict | both sides and affected paths |
| hypothesis_generation | classified evidence | active and rejected hypotheses | test canonical hypothesis conditions | creating ad hoc hypotheses | no hypothesis meets minimum evidence | support and rejection evidence refs |
| historical_evidence_comparison | active hypotheses, stored evidence | historical verdicts | compare event definitions and regimes | predicting repetition | sample missing for statistical claim | historical record ids |
| analogy_evaluation | active hypotheses, analogue records | descriptive analogies | compare features and differences | turning analogy into forecast | analogue data unavailable | analogue id and limitations |
| alternative_scenario_generation | hypotheses and triggers | 1D, 7D, 30D scenarios | form trigger-based alternatives | certainty wording | uncalibrated probability presented as probability | calibration status |
| invalidation_analysis | hypotheses and scenarios | invalidation objects | define measurable thresholds | vague invalidations | no measurable invalidation for major view | trigger metric and source |
| decision_synthesis | evidence, conflicts, history, quality | posture and rationale | synthesize multi-domain view | posture from one score alone | insufficient confirmation | driver evidence refs |
| confidence_attribution | decision and quality | raw, cap, penalties, final confidence | explain trust in conclusion | equating confidence with probability | weak coverage with high confidence | confidence components |
| decision_memory_comparison | current decision, stored decisions | change and evaluation notes | compare to immutable prior decisions | rewriting past decisions | prior memory unavailable | decision ids |
| explanation_generation | decision package | simple Persian explanation | translate audited reasoning into user language | adding new claims in prose | explanation cannot cite evidence | conclusion paths |
| audit_trace | all prior artifacts | audit records | link source, input, calc, evidence, rule, spec | hidden fallback or uncited claim | missing audit link | complete audit object |
| output_contract | audited explanation | Task 001 envelope | serialize approved fields | changing schema shape | output validation failure | output schema version |
