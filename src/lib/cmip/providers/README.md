# CMIP Provider Router

This folder contains the provider-neutral execution boundary introduced in Task 005-B.

The router accepts a validated Task 004 model execution package, selects an approved provider (`openai` or `gemini`), executes exactly that provider unless an explicit fallback policy permits otherwise, and returns a provider-neutral preview result. Provider raw statuses remain trace metadata; the canonical CMIP status is always one of `success`, `failed`, `refused`, or `incomplete`.

Gemini is an adapter behind this router, not a second intelligence engine. OpenAI remains available and unchanged.
