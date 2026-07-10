# Evidence Model

Evidence is a normalized, auditable observation or interpretation derived from Task 002 input. Evidence is not a final decision.

## Domains

- `macro`
- `liquidity`
- `institutional_flow`
- `market_structure`
- `momentum`
- `derivatives`
- `options`
- `cross_asset`
- `breadth`
- `news_geopolitical`
- `historical_evidence`
- `previous_decision`
- `data_quality`

Task 002 sections map into these domains. For example, `stablecoins` contributes to liquidity, `etf` contributes to institutional flow, `decision_memory` contributes to previous decision, and `sources` plus `data_quality` contribute to data quality.

## Evidence Item Shape

Every evidence item must include:

- `evidence_id`
- `domain`
- `statement`
- `direction`
- `strength`
- `importance`
- `freshness`
- `reliability`
- `coverage`
- `independence_group`
- `conflict_level`
- `source_quality`
- `source_refs`
- `supports_hypotheses`
- `contradicts_hypotheses`
- `limitations`

## Enums

Direction:

- `supportive`
- `contradictory`
- `neutral`
- `mixed`
- `unknown`

Strength:

- `very_weak`
- `weak`
- `moderate`
- `strong`
- `very_strong`

Reliability:

- `low`
- `medium`
- `high`
- `verified`

Conflict level:

- `none`
- `low`
- `moderate`
- `high`
- `unresolved`

Rules:

- Importance describes decision relevance.
- Quality describes trustworthiness.
- A high-importance item with low quality must be visible but constrained.
- One evidence item may support one hypothesis and contradict another.
- Evidence must cite Task 002 source IDs or stored derived records.
