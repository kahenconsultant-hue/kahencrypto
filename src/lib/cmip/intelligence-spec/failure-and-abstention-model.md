# Failure And Abstention Model

Failure states:

- `insufficient_data`
- `critical_source_failure`
- `identity_conflict`
- `unresolved_primary_source_conflict`
- `schema_invalid`
- `historical_data_unavailable`
- `decision_memory_unavailable`
- `model_output_invalid`
- `low_confidence`

Published abstention reason codes exclude `schema_invalid`. Schema-invalid output is not a valid abstention report.

## Publication Distinction

- Valid abstention report: JSON is structurally and semantically valid, but directional posture is withheld because evidence is insufficient or conflicted.
- Invalid model output: JSON fails schema or semantic validation and must not be published.
- Generation failure: no valid output was produced; the previous valid report remains governed by system publication policy.

These states must not be conflated.

| Failure state | Generation continues | Publication blocked | Posture becomes abstain | Previous valid report visible | Admin warning | Confidence cap | Audit requirement |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `insufficient_data` | yes, limited | no unless critical | yes when material | yes | yes | low | missing fields |
| `critical_source_failure` | yes, limited | yes if critical domain | often | yes | yes | severe | failed source ids |
| `identity_conflict` | yes for unaffected assets | yes for affected asset scoring | yes if material | yes | yes | severe | conflicting identity refs |
| `unresolved_primary_source_conflict` | yes, limited | possible | yes if material | yes | yes | severe | both primary values |
| `schema_invalid` | no | yes | not published | yes | yes | none | validator errors |
| `historical_data_unavailable` | yes | no | no unless central claim depends on it | yes | optional | moderate | unavailable historical ids |
| `decision_memory_unavailable` | yes | no | no | yes | yes | moderate | memory status |
| `model_output_invalid` | no | yes | not published | yes | yes | none | output validation errors |
| `low_confidence` | yes | no unless below floor | yes when below floor | yes | yes | low | confidence components |

Abstention must be honest and useful: it should explain what is missing, what conflict remains, and what evidence would allow a future decision.

Abstention is not bearishness. It is a reversible publication state that ends when the required evidence to resume becomes available and passes validation.
