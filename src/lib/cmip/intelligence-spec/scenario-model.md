# Scenario Model

Scenario horizons:

- `1D`
- `7D`
- `30D`

Every scenario must include:

- `scenario_id`
- `name`
- `time_horizon`
- `conditions`
- `supporting_evidence`
- `contradicting_evidence`
- `probability`
- `calibration_status`
- `expected_market_effect`
- `affected_assets`
- `invalidation`

Rules:

- Probabilities require calibration status.
- Prototype probabilities must be labeled.
- Scenario probabilities sum to 100 only when mutually exclusive and collectively exhaustive.
- Otherwise they must be called likelihood scores, not probabilities.
- Scenarios must be trigger-based.
- Scenario wording must avoid certainty.
- Scenario evidence must cite evidence IDs and source refs through audit.
