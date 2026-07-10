# Audit Model

Every conclusion must be traceable to:

- source
- input field
- calculation
- evidence item
- historical record
- decision rule
- spec version

Audit objects must support:

- `audit_id`
- `conclusion_path`
- `source_refs`
- `input_paths`
- `calculation_refs`
- `evidence_refs`
- `rule_refs`
- `spec_version`
- `generated_at`

Rules:

- No unexplained conclusion.
- No hidden calculation.
- No hidden fallback.
- No uncited historical claim.
- No silent conflict resolution.
- No secret source substitution.
- Every score contribution must be traceable.

The audit trail must connect Task 002 source IDs and input paths to Task 001 output paths.
