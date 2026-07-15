# CMIP Gemini Provider

Task 005-B adds Gemini as a second provider adapter behind the CMIP provider router. Gemini does not replace OpenAI and does not change the intelligence architecture, model package contract, runtime input contract, or Task 001 output contract.

Status: experimental for full canonical CMIP report generation. The single-call Gemini path is retained for explicit admin testing, dry runs, compatibility tests, controlled research and future provider comparison. It is not the approved primary production report-generation path.

The live adapter uses the official `@google/genai` package and the Interactions API. Model IDs are read only from environment variables during server execution; no Gemini model is hardcoded as a hidden fallback. The request mapper preserves Task 004 trust boundaries by keeping system instructions in `system_instruction`, trusted developer context in explicit trusted sections, and runtime input as user data.

Gemini receives a compact transport schema, not the full Task 001 schema. The transport envelope contains `schema_version` and `cmip_report`; `cmip_report` is the inner value of the canonical Task 001 envelope. The application reconstructs `{ cmip_report: <transport.cmip_report> }` before canonical validation. The Gemini transport schema intentionally validates only the shallow envelope. The full Task 001 schema remains in trusted output-contract instructions and is enforced after provider response parsing with canonical AJV and semantic validation.

Google Search is disabled by default. It requires package policy, environment opt-in, model capability, execution-mode permission, and bounded tool use. Dry runs and tests use only fake providers and make no network calls.

Provider refusal is not CMIP abstention. A provider safety block maps to canonical provider status `refused`; a valid CMIP abstention remains a Task 001 report posture.

Live smoke is gated by:

```bash
GEMINI_API_KEY=...
CMIP_GEMINI_MODEL_PRIMARY=...
CMIP_ALLOW_LIVE_GEMINI_SMOKE=true
CMIP_ENABLE_EXPERIMENTAL_FULL_REPORT_AI=true
npm run cmip:gemini-live-smoke
```

The live smoke command prints only metadata, never prompt content, report body, or secrets.
# Gemini single-call compatibility path

This folder contains the original Gemini provider adapter and the compact canonical-root transport used for compatibility testing and small provider tasks. It is retained intentionally, but it is experimental for full CMIP Morning Brief generation because the AI Studio structured-output schema must remain shallow and cannot enforce the complete Task 001 report shape in one call.

Full Gemini Morning Brief generation experiments now use `src/lib/cmip/gemini-sectioned`, where Gemini generates bounded sections and the application assembles the final canonical report before running the unchanged Task 001 validator. This sectioned path is also experimental for production full-report generation.
