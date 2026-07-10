# CMIP OpenAI Execution Adapter

Task 005 connects the deterministic Task 004 model package to the OpenAI Responses API through a controlled server-side adapter. The adapter validates the package, verifies integrity hashes, maps the package to a strict JSON-schema Responses request, executes through a provider interface, parses the response, and revalidates the final CMIP report with the Task 001 validator.

This folder does not build prompts, collect data, persist reports, render UI, or calculate CMIP decisions. The prompt package remains owned by `src/lib/cmip/model-package`; the runtime input remains owned by `src/lib/cmip/runtime-input`.

The production provider uses the official `openai` Node SDK and `responses.create`. Tests and `npm run cmip:openai-dry-run` use `FakeCmipOpenAiProvider`, which makes no network call and does not require `OPENAI_API_KEY`.

Live execution is intentionally gated. `npm run cmip:openai-live-smoke` requires `OPENAI_API_KEY`, `CMIP_OPENAI_MODEL_PRIMARY`, and `CMIP_ALLOW_LIVE_OPENAI_SMOKE=true`; it should not be run as part of routine verification.

The adapter never stores model output locally, never reads secrets at module initialization, and never exposes raw provider responses. Any publishable result must pass the canonical Task 001 output validator.

