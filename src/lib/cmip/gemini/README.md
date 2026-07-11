# CMIP Gemini Provider

Task 005-B adds Gemini as a second provider adapter behind the CMIP provider router. Gemini does not replace OpenAI and does not change the intelligence architecture, model package contract, runtime input contract, or Task 001 output contract.

The live adapter uses the official `@google/genai` package and the Interactions API. Model IDs are read only from environment variables during server execution; no Gemini model is hardcoded as a hidden fallback. The request mapper preserves Task 004 trust boundaries by keeping system instructions in `system_instruction`, trusted developer context in explicit trusted sections, and runtime input as user data.

Google Search is disabled by default. It requires package policy, environment opt-in, model capability, execution-mode permission, and bounded tool use. Dry runs and tests use only fake providers and make no network calls.

Provider refusal is not CMIP abstention. A provider safety block maps to canonical provider status `refused`; a valid CMIP abstention remains a Task 001 report posture.

Live smoke is gated by:

```bash
GEMINI_API_KEY=...
CMIP_GEMINI_MODEL_PRIMARY=...
CMIP_ALLOW_LIVE_GEMINI_SMOKE=true
npm run cmip:gemini-live-smoke
```

The live smoke command prints only metadata, never prompt content, report body, or secrets.
