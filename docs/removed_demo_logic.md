# Removed Demo Logic

Date: 2026-05-25
Project: C.M.I.P, Crypto Macro Intelligence Platform

## Removed From Production Paths

The following demo-grade behaviors were removed or disconnected from production-facing paths:

- Hardcoded news feed consumption from `src/lib/demo-data.ts`.
- Simulated ingestion runs.
- Demo source health usage in dashboard operations panels.
- Fake alert generation from template calculations.
- Static alert review data in admin.
- RSS keyword sentiment scoring presented as market sentiment.
- Demo regime payloads in WordPress output.
- Fake grouped news feed from fixture data.
- Hardcoded geopolitical feed cards from fixture data.
- Pricing and API-readiness demo blocks from production dashboard data paths.
- Python regime scoring from arbitrary 0-100 placeholder vectors.
- Python correlation worker random-series demo output.

## Disabled Until Real Data Exists

The following modules now return empty, unavailable, or operational-only output instead of fabricated analysis:

- Sentiment dashboard data.
- Smart alerts.
- Latest news feed.
- Geopolitical risk feed.
- Asset-adjacent news lists.
- WordPress intelligence widgets.

## Demo Artifacts Removed

`src/lib/demo-data.ts` was removed after production imports were moved to `src/lib/production-data.ts`.

The duplicate legacy registry `src/server/ingestion/source-registry.ts` was removed after reusable source helper behavior was moved to `src/collectors/registry.ts`.

Current production search result:

- No direct `@/lib/demo-data` import remains in `src/`.
- No direct `@/server/ingestion/source-registry` import remains in `src/`.

## Legacy Code Requiring Later Retirement

The following files still exist and should be handled in later phases:

- `src/server/ai/pipeline.ts`
- `src/server/analytics/*`
- `services/python/analytics/*`

They are not removed in Phase 2 because the user explicitly required preserving the existing UI and avoiding a blind overwrite. Later phases should replace legacy analytics with production engines after the ingestion and storage layer is stable.

## Public Data Labels

Phase 2 avoids public "mock" intelligence labels in production paths. If a module lacks real data, it should render unavailable or insufficient-data states rather than fake confidence or fake directional claims.
