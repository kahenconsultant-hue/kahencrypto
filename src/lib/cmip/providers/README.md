# CMIP Provider Router

This folder contains the provider-neutral execution boundary introduced in Task 005-B.

The router accepts a validated Task 004 model execution package, selects an approved provider (`openai` or `gemini`), executes exactly that provider unless an explicit fallback policy permits otherwise, and returns a provider-neutral preview result. Provider raw statuses remain trace metadata; the canonical CMIP status is always one of `success`, `failed`, `refused`, or `incomplete`.

Gemini is an adapter behind this router, not a second intelligence engine. OpenAI remains available and unchanged.

Full canonical report execution through this router is experimental. Non-fake full-report execution requires the server-side `CMIP_ENABLE_EXPERIMENTAL_FULL_REPORT_AI=true` gate and an explicit `full_report_experimental` task type. When the gate is false or missing, the router returns `CMIP_EXPERIMENTAL_FULL_REPORT_AI_DISABLED` before any provider or fallback call.

The reserved `explanation_only` task type names a future bounded explanatory-text layer. It is not implemented here and must not invoke the full-report adapters.
