# Confidence Model

Confidence is trust in the current analytical conclusion. It is not market direction probability.

Confidence must consider:

- data_coverage
- freshness
- source_agreement
- source_quality
- evidence_independence
- historical_support
- conflict_burden
- missing_data
- identity_certainty
- method_transparency
- decision_stability

Required concepts:

- raw confidence
- penalties
- caps
- final confidence
- confidence explanation

Formula requirements:

- All confidence outputs remain 0 to 100 to stay compatible with Task 001.
- Missing critical data lowers confidence.
- Conflicting primary sources lower confidence.
- Historical support increases confidence only when structurally comparable.
- Agreement between correlated signals must not be double-counted.
- Confidence must include reasons for increase and decrease.
- High confidence with weak coverage is forbidden.
- Confidence caps must be explicit, auditable, and compatible with Task 001 `confidence.cap`.

This file defines constraints only. It does not implement a confidence formula.
