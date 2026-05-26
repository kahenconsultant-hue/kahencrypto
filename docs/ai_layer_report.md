# C.M.I.P AI Translation & Explanation Layer Report

Generated: 2026-05-25

## What was added

- Added `src/server/ai/event-explanation-layer.ts`.
- Reads real `normalized_events`.
- Produces safe event explanation objects with:
  - event id
  - source
  - event type
  - affected assets
  - transmission channel
  - expected direction
  - Persian macro interpretation
  - Persian crypto interpretation
  - uncertainty notes

## Current production behavior

`OPENAI_API_KEY` is not configured in the local environment.

Because of that:

- AI translation is not executed.
- English titles are not falsely translated.
- `translationFa` and `summaryFa` remain `null` when the source text is English.
- The dashboard explicitly shows that AI summaries are unavailable.
- Deterministic Persian explanations are shown only as rule-based context, not as AI output.

## Safety behavior

The layer does not invent:

- market relationships
- ETF flows
- whale activity
- confidence scores
- translated titles
- institutional behavior

## Next step

When `OPENAI_API_KEY` is configured, a batch worker should process `normalized_events` into persistent `ai_summaries`. This was intentionally not wired into ingestion yet to avoid slow or repeated AI calls during dashboard rendering.
