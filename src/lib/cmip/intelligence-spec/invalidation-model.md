# Invalidation Model

Invalidation is a first-class object, not a prose afterthought.

Every major view must include:

- `invalidation_id`
- `related_hypothesis`
- `trigger_metric`
- `threshold`
- `direction`
- `required_duration`
- `confirmation_source`
- `expected_decision_change`
- `severity`

Rules:

- Thresholds must be measurable.
- Vague invalidations are forbidden.
- One isolated data spike may require confirmation.
- Invalidation must state whether it changes confidence, hypothesis, posture, scenario ranking, or a combination.
- Invalidation must cite source and input paths.

Example:

> If BTC ETF net flow turns negative for two consecutive trading days and breadth drops below the configured threshold, the bull-continuation hypothesis loses confirmation and posture may move from maintain risk to reduce risk.
