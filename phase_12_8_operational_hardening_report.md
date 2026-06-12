# Phase 12.8 — Operational Hardening Report

Generated: 2026-06-01

## Scope

No analytics engines, indicators, narratives, alerts, or market-scoring logic were added.

This pass only hardened:

- `/api/cron/ingest`
- staged ingestion execution
- scheduler observability
- platform health scoring
- stale-data and slow-storage protection

## Cron Failure Root Cause

Direct ingestion worked because it executed the ingestion foundation from a local Node process.

The cron route failed because it executed all expensive work inside one HTTP request lifecycle:

1. ingestion collectors
2. Supabase reads/counts/upserts
3. signal cache refresh
4. derived signal persistence
5. a large JSON response containing full source health and logs

In local HTTP execution, this made the route vulnerable to header timeout and slow Supabase operations. Some Supabase read/count/write operations had no timeout guard, so a slow storage operation could hold the request open.

## Fixes Applied

### 1. Stage Isolation

Ingestion is now split into:

- Stage 1: Market Data
- Stage 2: Macro Data
- Stage 3: News
- Stage 4: ETF
- Stage 5: Fusion

Failure or degradation in one stage is recorded but does not stop the rest of the stages.

### 2. Cron Route Reliability

`/api/cron/ingest` now returns a compact `202 Accepted` response by default instead of holding the HTTP response open for the full ingestion run.

`?sync=1` remains available only for local diagnostics.

### 3. Supabase Timeout Protection

Supabase operations now have an operational timeout:

- upsert/write
- select/read
- count
- cleanup delete

If Supabase is slow or unreachable, the operation is recorded as `local_fallback` / failed write status instead of blocking ingestion indefinitely.

### 4. Scheduler Observability

Scheduler runs are recorded locally in:

- `.cache/cmip/ingestion/latest-scheduler-runs.json`
- `.cache/cmip/ingestion/scheduler-runs.jsonl`

The scheduler dashboard shows:

- last run
- next run
- duration
- success rate
- failed stage
- retry count
- stale signal count
- per-stage status
- 12-cycle reliability simulation

### 5. Health Score Rework

Platform health now uses:

```text
Overall Health =
0.50 * Analytics Quality
+ 0.30 * Operational Reliability
+ 0.20 * Data Coverage
```

Caps:

- scheduler reliability < 70 => health cannot exceed 75
- scheduler reliability < 50 => health cannot exceed 65
- core engine input coverage < 50 => health cannot exceed 60

## Verification Snapshot

Latest direct staged scheduler execution:

- status: degraded
- duration: 5.6s
- success rate: 40%
- failed stage: none
- stale signals: 25

Stage results:

- Market Data: degraded, 70 metrics
- Macro Data: success, 51 events
- News: success, 209 events
- ETF: degraded, 8 metrics
- Fusion: degraded, 46 signal inputs

Cron route check:

- `/api/cron/ingest` returned `202 Accepted`
- response time after cold route compile: 3.7s
- no 300s header timeout
- latest background scheduler run was recorded and exposed ETF as the failing stage

Current scheduler dashboard values:

- Overall Health: 65/100
- Operational Reliability: 39/100
- Production Readiness: 58/100
- Latest scheduler status: failed
- Failed stage: ETF
- Latest scheduler duration: 295.8s

## 72 Hour Simulation

The 72-hour reliability simulation is modeled as 12 scheduler cycles from the latest real scheduler run state.

Because this phase cannot wait 72 wall-clock hours inside one task, the simulation uses the latest stage health, stale signal count, retry count, and recorded scheduler status.

Current simulation result:

- cycles: 12
- successful cycles: 9
- degraded cycles: 0
- failed cycles: 3
- missed updates: 3
- stale signals: 25

## Remaining Blockers

1. ETF source remains degraded because Farside blocks automated fetches with Cloudflare and The Block is used as fallback.
2. Some premium/on-chain inputs remain unavailable by design; they must not increase confidence.
3. Next dev does not reliably continue background work after HTTP response in all cases; direct staged runner remains the reliable local execution path.
4. Operational reliability should be re-measured after a real deployed cron runs several cycles.
5. Fusion still reports stale/unavailable signals because unavailable premium inputs are intentionally not fabricated.
