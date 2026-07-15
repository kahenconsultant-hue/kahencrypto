# CMIP Gemini Sectioned Generation

This folder implements the approved Task 005-C Gemini-only sectioned structured-generation pipeline plus the Task 005-D section-context slicing optimization.

Status: experimental for full canonical CMIP report generation. This path is retained for explicit admin testing, dry runs, compatibility tests, controlled research and future provider comparison. It must not be selected silently by production report generation.

Gemini AI Studio cannot safely receive the full Task 001 schema as one provider `response_format` schema. The full canonical schema remains unchanged and is still the final authority, but Gemini now generates bounded sections with small schemas. The application assembles the final `{ "cmip_report": ... }` envelope deterministically and then runs `validateCmipReport(...)`.

## Section Order

1. `meta_decision` produces `meta`, `decision`, `executive_summary`.
2. `engines_reasons` produces `engine_scores`, `reasons`.
3. `delta_attribution` produces `delta`, `attribution`.
4. `scenarios_triggers` produces `scenarios`, `triggers`.
5. `coins` produces the exact canonical ten-asset `coins` array.
6. `confidence_memory` produces `confidence`, `decision_memory`.
7. `charts_audit` produces `charts`, `audit`.

The first implementation executes sequentially. A failed required section stops execution and returns no partial canonical report.

## Thinking Policy 1.1

Gemini 3.5 Flash uses dynamic thinking by default. The provider default is not acceptable for CMIP section generation because thought tokens count against `generation_config.max_output_tokens` and provider usage. Raising `max_output_tokens` alone can increase thinking consumption rather than resolve truncation, so CMIP explicitly sets `generation_config.thinking_level` for every section.

Approved section levels are only `minimal` and `low`:

- `low` for `engines_reasons` and `scenarios_triggers`
- `minimal` for `meta_decision`, `delta_attribution`, `coins`, `confidence_memory`, and `charts_audit`

`medium` and `high` are not approved for the Morning Brief sectioned pipeline. Thought content, thought summaries, signatures, and hidden reasoning are never stored or exposed; only safe usage counts and policy metadata are recorded.

## Generation Budget 1.3

Section budgets are reasoning-aware generation caps. `generation_config.max_output_tokens` is treated as the combined provider generation budget, not as visible JSON-only output. Each section budget includes:

- expected visible output tokens from the canonical fixture
- reserved reasoning tokens
- reserved serialization tokens
- total required generation tokens
- a section-specific maximum generation cap

Serialization reserve is deterministic and versioned as `max(256, expectedVisibleOutputTokens * 0.25)`, rounded up. Reasoning reserves are explicit constants and are paired with the API-level thinking policy above. A provider/model maximum blocks execution only when that maximum is explicitly known and the configured section budget exceeds it; unknown provider limits are reported as unknown rather than guessed.

Task 005-D intentionally keeps the 1.2 generation caps unchanged under budget version 1.3. The optimization is reduced input context plus lower approved thinking levels, not larger output caps.

## Section Context 1.0

Gemini sections no longer receive the complete Task 004 package, complete Task 001 JSON Schema, complete Task 2.5 intelligence context, complete source registry, or unrelated runtime domains. Each request receives a deterministic `CMIP-GEMINI-SECTION-CONTEXT-1.0` object containing:

- execution metadata and horizons
- section-specific required inputs
- deterministic dependency summaries from already validated prior sections
- section-relevant data-quality paths
- source records referenced by the included inputs
- concise universal and section-specific rules
- explicit omissions and reduction trace metadata

The application builds these summaries directly. No model is asked to summarize, translate, repair, infer, or fill missing context. Unresolved referenced sources fail before provider execution. Critical conflicts, required inputs, data-quality limitations and relevant source refs are not reduced away.

Initial section input targets are:

- `meta_decision`: 12,000 estimated tokens
- `engines_reasons`: 16,000
- `delta_attribution`: 10,000
- `scenarios_triggers`: 14,000
- `coins`: 14,000
- `confidence_memory`: 10,000
- `charts_audit`: 16,000

If approved deterministic reductions cannot keep a section under its target, execution fails with `GEMINI_SECTION_CONTEXT_BUDGET_EXCEEDED` before any provider request.

## Contract Boundaries

- OpenAI remains unchanged.
- The previous single-call Gemini adapter remains available for compatibility and small provider tests, but full Morning Brief generation uses this sectioned path.
- Section schemas are transport constraints only.
- Task 001 validation remains the final report validator.
- The assembler never calls a model, invents values, removes unknown fields, or repairs prose.
- OpenAI single-call behavior remains unchanged and continues to use the canonical output contract path.
- Production canonical reports must be assembled by deterministic application code. AI may later produce only bounded explanatory text over locked values after a separate approved contract.

## Guided Provider-Safe Schema Projection

The strict local section schemas remain the application-side validation contracts. Gemini provider schemas may be projected when a section schema contains AI Studio compatibility risks such as nested object arrays, annotation-heavy constraints, empty subschemas, or deeply nested local-only validation. Projection version `CMIP-GEMINI-SECTION-PROVIDER-PROJECTION-1.1` currently applies to `engines_reasons`: Gemini receives the required top-level `engine_scores` and `reasons` arrays, required item property names derived from the strict local schema, simple field types, the small `evidence_verdict` enum, `source_refs` string arrays, and the minimal `historical_evidence` required-key shape.

Projection v1.1 intentionally leaves repeated `maxLength`, numeric bounds, nullable type arrays, nested `additionalProperties`, empty subschemas, and complex combinators to strict local AJV and final Task 001 validation. This keeps the provider schema guided but avoids reintroducing the previously incompatible strict nested constraints.

Provider-schema success is never sufficient for section success. Every section response is parsed, validated against the strict local section schema, assembled deterministically, and validated again through the full canonical Task 001 contract.

## Live Smoke Gate

`npm run cmip:gemini-sectioned-live-smoke` is separately gated by:

- `GEMINI_API_KEY`
- `CMIP_GEMINI_MODEL_PRIMARY`
- `CMIP_ALLOW_LIVE_GEMINI_SECTIONED_SMOKE=true`
- `CMIP_ENABLE_EXPERIMENTAL_FULL_REPORT_AI=true`

It does not use the single-call `CMIP_ALLOW_LIVE_GEMINI_SMOKE` gate. Google Search, OpenAI fallback, persistence, publication and repair are disabled for the sectioned smoke script.

## References

- Official Gemini thinking documentation: https://ai.google.dev/gemini-api/docs/thinking
- Official Gemini Interactions documentation: https://ai.google.dev/gemini-api/docs/interactions-overview
