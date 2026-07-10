# Decision Memory Model

Decision memory uses stored decisions, not language-model memory.

Every registered decision must contain:

- `decision_id`
- `created_at`
- `data_cutoff`
- `posture`
- `score`
- `confidence`
- `time_horizon`
- `main_hypothesis`
- `alternative_hypothesis`
- `invalidation_conditions`
- `reference_prices`
- `expected_regime`
- `evaluation_due_at`
- `evaluation_status`
- `actual_outcome`
- `error_classification`
- `lessons`

Evaluation statuses:

- `pending`
- `correct`
- `partially_correct`
- `incorrect`
- `invalidated`
- `not_evaluable`

Error classifications:

- `data_failure`
- `logic_failure`
- `timing_failure`
- `unexpected_event`
- `overconfidence`
- `underconfidence`
- `insufficient_evidence`
- `identity_error`
- `source_error`

Rules:

- Decisions cannot be rewritten after publication.
- Corrections create a new revision record.
- Weekly accuracy distinguishes posture accuracy, regime accuracy, scenario calibration, and trigger accuracy.
- Decision change requires evidence change, not language drift.
- Memory unavailability must be visible and may cap confidence.
