# Phase 6 — Freshness & Source Health Report

## Scope

Phase 6 focused on making freshness, source health, and degradation explicit and harder to misrepresent in the public dashboard and APIs.

No advanced AI, regime, correlation, or alert logic was added in this phase.

## Implemented

- Added `src/health/freshness-engine.ts`.
- Added freshness states:
  - `fresh`
  - `recent`
  - `delayed`
  - `stale`
  - `obsolete`
- Added operational health states:
  - `healthy`
  - `degraded`
  - `unstable`
  - `sparse`
  - `unreliable`
  - `unavailable`
- Added freshness-adjusted data quality conversion so stale data cannot keep a `live` label.
- Added source-level freshness rows based on `lastSuccessAt`, not merely the last attempted run.
- Added signal-level freshness rows based on each signal timestamp.
- Added freshness summary into the reliability report.
- Added freshness report to:
  - `/api/v1/source-health`
  - `/api/v1/overview`
- Updated dashboard module status resolution to downgrade live/partial-live modules when their underlying signal timestamps are stale.
- Updated the public reliability panel to show:
  - reliability state
  - overall freshness state
  - freshness score
  - stale/obsolete source count
  - stale/obsolete signal count
  - latest refresh age
- Updated the data quality table to show per-signal freshness and freshness-adjusted quality.

## Critical Fix

`healthFromCollectorOutput()` previously used the current failed run timestamp to calculate source freshness.

That could make a failed source look fresh.

Now:

- successful/degraded collector runs update freshness from the current fetched timestamp
- failed/api-key-missing runs preserve freshness from the previous `lastSuccessAt`
- if no previous successful run exists, freshness becomes unavailable/obsolete rather than fresh

## Rules Enforced

- Fresh data can be shown as `live` only when it is <= 15 minutes old.
- Data between 15 and 45 minutes becomes `partial_live` if it was originally live.
- Data older than 45 minutes is downgraded to delayed or unavailable depending on age.
- Data older than 180 minutes becomes unavailable for public module status purposes.
- Source health uses last successful ingestion, not last failed attempt.

## Data Integrity

No fake values were introduced.

This phase only changes freshness classification, health reporting, and public status display.

## Validation

Completed:

- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run build` passed after stopping the dev server and rebuilding `.next` cleanly.
- Local smoke test for `/` returned `200 OK`.
- Local smoke test for `/api/v1/source-health` returned `200 OK`.
- Local smoke test for `/api/v1/overview` returned `200 OK`.

Notes:

- After the clean build, the first dev-server request took longer because Next.js recompiled the route tree.
- The in-app browser navigation check timed out against localhost, but direct HTTP smoke tests confirmed the page and APIs were reachable.
