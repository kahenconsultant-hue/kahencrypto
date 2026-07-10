# CMIP Model Package

Task 004 builds the deterministic prompt package that a future Task 005 can submit to a model execution provider. It does not call OpenAI, perform web search, read secrets, stream responses, retry network calls, collect data, persist output, or render reports.

## Layers

The package keeps three layers separate:

- System instructions: stable CMIP identity and hard rules.
- Static intelligence specification: coded, versioned summary of Task 2.5 reasoning rules.
- Dynamic runtime context: validated Task 002 runtime input, execution metadata, previous report summary when allowed, data quality, historical evidence and decision memory.

Runtime data is wrapped inside `<CMIP_RUNTIME_CONTEXT>` and is treated as untrusted data, not instructions.

## Contracts

The Task 001 output schema is imported directly from `src/lib/cmip/contracts/output-schema.json`; there is no second hand-copied output schema. Runtime input is validated again with the Task 002 validator even if the caller claims it is valid.

Model names are not hardcoded. The package uses model profiles such as `cmip_primary_reasoning`; real provider model mapping belongs to Task 005 environment configuration.

## Determinism

Canonical package serialization sorts object keys, preserves array order, keeps nulls, rejects non-finite values and rejects non-JSON values. The semantic package hash excludes volatile build timestamps. The instance package hash includes instance metadata.

## Security

Secret redaction is deterministic and applies to runtime context and source metadata before hashing. Prompt-injection detection is intentionally narrow and pattern based. It records suspicious text with paths and source references but does not remove news meaning.

## Token Budget

Token estimates use a deterministic UTF-8 character heuristic. Reductions are applied in approved order: source metadata detail, previous report/chart exclusions, news limits by importance, historical evidence limits, then fund breakdown detail. Data quality, conflicts, missing critical fields, decision memory summary, output schema, system rules and abstention rules are not removed.

## Task 005

Task 005 should consume this package, map model profiles to provider models, and execute the Responses API request. It must not rebuild or reinterpret these prompt layers.
