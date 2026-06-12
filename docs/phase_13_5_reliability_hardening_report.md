# Phase 13.5 — Reliability Hardening & Consistency Fix

Generated: 2026-06-05

## Scope

No new indicators, sources, dashboards, or AI features were added. This pass only hardened freshness, health scoring, confidence caps, correlation coverage, scheduler visibility, and impossible-state validation.

## Changes Applied

1. Added a shared freshness resolver:
   - `src/health/freshnessResolver.ts`
   - Source freshness now uses expected polling interval by source.
   - ETF freshness uses daily market-data rules instead of 90-minute logic.
   - FRED/macro signals use release-cycle-aware freshness.
   - Funding becomes stale after the 24h threshold.

2. Unified freshness usage:
   - `src/health/freshness-engine.ts`
   - `src/health/source-health.ts`
   - `src/server/dashboard/dashboard-service.ts`
   - `src/server/intelligence/reliability-engine.ts`
   - `src/server/admin/data-health-service.ts`
   - `src/server/analytics/intelligence-integrity-engine.ts`

3. Removed fake current-time freshness fallback:
   - `getEngineLastUpdatedAt()` no longer returns `new Date()` when no real cache timestamp exists.
   - It now uses the latest real cached data timestamp or epoch fallback.

4. Scheduler-aware global freshness:
   - Public dashboard freshness now uses scheduler last successful run in the shared truth model.
   - This fixed the contradiction where public UI showed a fresh update while Data Health showed stale scheduler/source state.

5. Health count consistency:
   - Data Health now separates:
     - Critical Core Sources
     - All Active Sources
     - Optional/Premium Sources
     - Degraded Sources
     - Stale Sources
     - Disabled Sources
   - No impossible `critical healthy > active healthy` combinations are produced.

6. Correlation coverage and confidence caps:
   - Added `correlationCoverage`.
   - Coverage is calculated from valid pairs, historical depth, and alignment quality.
   - Pair and engine confidence cannot exceed correlation coverage.

7. Alert confidence consistency:
   - Alert confidence now uses the weakest component:
     - data coverage
     - source quality
     - freshness quality
     - signal quality
   - Confidence cannot exceed coverage.

8. Integrity validator hardening:
   - Added confidence-over-coverage checks for alerts and correlations.
   - Stale signals are logged and cannot strengthen confidence/severity.

## Runtime Validation Snapshot

Current runtime data is operationally stale. The platform now shows that truth instead of hiding it.

### Freshness

Before:
- Public dashboard could show `last update: 7-21 minutes ago`.
- Data Health showed old scheduler/source state.

After:
- Public dashboard shows `آخرین بروزرسانی: 4409 دقیقه پیش` with stale warning.
- Freshness state: `obsolete`
- Freshness health: `unreliable`
- Latest scheduler-backed refresh: `2026-06-01T22:33:45.115Z`
- Stale sources: `1`
- Obsolete sources: `12`
- Stale signals: `2`
- Obsolete signals: `3`

### Health

Before:
- Health counts could appear contradictory.

After:
- Critical Sources: `0/4`
- Active Sources: `0/15`
- Optional/Premium Sources: `0/11`
- Degraded Sources: `3`
- Stale Sources: `13`
- Disabled Sources: `8`

### Coverage

Current:
- Data Coverage: `81/100`
- Analytics Quality: `86/100`
- Engine Reliability: `100/100`
- Market Reliability: `37/100`

Interpretation:
- Analytics engines can compute from available cached inputs.
- Operational market reliability is low because scheduler/source freshness is stale.

### Correlation Coverage

Current:
- Valid pairs: `9/10`
- Correlation Coverage: `70%`
- Correlation Confidence: capped to `70%`
- Missing pair: `BTC ↔ Stablecoin Market Cap`

Before:
- Correlation confidence could remain high while many outputs were insufficient.

After:
- Correlation confidence cannot exceed correlation coverage.

### Scheduler Reliability

Current:
- Last run: `2026-06-01T22:33:45.115Z`
- Success rate: `35%`
- Operational Reliability: `51/100`
- Scheduler status: `degraded`
- Stale scheduler signals: `25`

### Confidence Violations

After:
- Confidence violations: `0`
- Alert sample: `stablecoin-pressure-proxy-alert`
  - Coverage: `56%`
  - Confidence: `56%`
  - Priority: `medium`

### Integrity State

After:
- Integrity status: `corrected`
- Consistency violations: `0`
- Confidence violations: `0`
- Freshness violations: `2`

The remaining freshness violations are actual stale signals, not contradictory state mapping.

## Current Scores

- Source Reliability: `0/100`
- Freshness Score: `19/100`
- Coverage Score: `81/100`
- Analytics Quality: `86/100`
- Operational Reliability: `51/100`
- Market Reliability: `37/100`
- Overall Platform Health: `75/100`
- Production Readiness: `68/100`

## Validation Commands

Passed:

```bash
npx tsx --test tests/analytics-self-check.test.ts
npm run typecheck
npm run lint
npm run build
```

Smoke tests:

- `/` returned HTTP 200.
- `/admin/data-health` returned HTTP 200.
- No runtime error detected.
- Public dashboard now shows stale scheduler-backed freshness instead of a fake recent update.

## Remaining Operational Risk

The logic is now consistent, but the current runtime state is still stale. Production readiness will not move toward 80-85 until scheduler ingestion runs reliably and refreshes source health.

Recommended next operational action before Phase 14:

1. Run a successful scheduler/ingestion cycle.
2. Confirm active sources are no longer obsolete.
3. Confirm `Market Reliability` rises above 60.
4. Confirm `Production Readiness` rises above 75.

## Phase 14 Gate

From a code-consistency standpoint:

- No freshness contradiction remains.
- No health count contradiction remains.
- No confidence-over-coverage contradiction remains.
- No correlation insufficient-data confidence inflation remains.

From a runtime-operations standpoint:

- `SAFE_TO_START_PHASE_14 = false`

Reason:

The current scheduler/source freshness is still stale, so Phase 14 should wait until at least one successful ingestion/scheduler cycle refreshes the platform state.
