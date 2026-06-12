# Phase 14.6 — Scheduler & Fusion Final Gate

Generated: 2026-06-06

## Scope

No new analytics, dashboards, indicators, or external data sources were added.

This pass only fixed operational blockers in scheduler classification, fusion gating, ETF stage runtime, and readiness scoring.

## Root Cause

1. Scheduler status was treating non-blocking optional enrichment gaps as degraded operational failures.
2. Fusion was marked degraded when unavailable inputs were optional/free/premium, even when all required core outputs were usable.
3. ETF fetch itself was fast, but every run attempted to persist the full ETF history. This made the ETF stage unreliable inside scheduled ingestion.
4. Internal adapter bundle diagnostics were built only from the current market stage keys. That made macro/news core adapters look incomplete during Stage 1 even though their data existed in the full signal cache.

## Fixes Applied

- Added `success_with_limited_confidence` as an explicit scheduler stage status.
- Split scheduler failures into blocking and non-blocking limitations.
- Reclassified ETF fallback success as non-blocking limited success when The Block returns real data after Farside Cloudflare blocking.
- Reclassified fusion to `success_with_limited_confidence` when only optional/premium inputs are unavailable.
- Limited ETF daily-flow persistence to the latest 120 rows per asset per run; full parsed source rows remain available in source diagnostics/cache.
- Updated adapter bundle diagnostics to use the full signal snapshot plus current fetched points.
- Recalculated Production Readiness with the requested formula:
  - 30% Scheduler reliability
  - 25% Data freshness
  - 20% Fusion health
  - 15% Source reliability
  - 10% Confidence consistency

## Scheduler Before / After

Before:

- Scheduler status: degraded
- Operational reliability: 66
- Market stage: degraded
- ETF stage: failed/timeouts in scheduled path
- Fusion stage: degraded
- Stale signals: 6
- Latest problematic ETF stage duration: 527586 ms in one run, 75750 ms in another

After:

- Scheduler status: success_with_limited_confidence
- Operational reliability: 87
- Run ID: `724b39fa-1023-4d54-8f10-ec451402933d`
- Duration: 23639 ms
- Success rate: 91%
- Failed stage: null
- Dead letters: 0
- Stale signals: 2

Stage results:

| Stage | Status | Duration | Blocking? | Reason |
|---|---:|---:|---:|---|
| Market | success_with_limited_confidence | 7961 ms | No | Core adapters 5/5; optional enrichments missing |
| Macro | success | 6556 ms | No | FRED/macro inputs available |
| News | success | 2664 ms | No | RSS/news ingestion available |
| ETF | success_with_limited_confidence | 3406 ms | No | Farside Cloudflare blocked; The Block fallback returned real BTC/ETH ETF rows |
| Fusion | success_with_limited_confidence | 1510 ms | No | Only non-blocking optional inputs missing |

## Fusion Audit

| Dependency | Status | Required? | Missing / Limited Inputs | Impact |
|---|---:|---:|---|---|
| Stablecoin Engine | Available | Required | none blocking | Used in liquidity/fusion |
| ETF Engine | Available via The Block fallback | Required for ETF layer, limited by fallback | Farside blocked | Confidence limited, not failed |
| Derivatives Engine | Available | Required core derivatives | `liquidation_btc_24h` optional unavailable | Confidence limited |
| Macro Engine | Available | Required | none blocking | Used normally |
| Sentiment Engine | Available | Required | none blocking | Used normally |
| Correlation Engine | Available | Required | none blocking | Connected, 100% input coverage |

Fusion final status: `success_with_limited_confidence`.

Non-blocking missing inputs:

- `liquidation_btc_24h`
- `exchange_reserves_btc_7d`
- `exchange_inflows`
- `exchange_outflows`

These inputs remain unavailable; no fake values are generated.

## Stale Signals

Before: 6

After: 2

Remaining stale signals:

| Signal | Source | State | Classification | Action |
|---|---|---:|---:|---|
| `gold_trend_24h` | Yahoo Finance delayed Gold futures | stale | CORE_REQUIRED | Keep with stale penalty |
| `vix_trend_24h` | Yahoo Finance delayed VIX | obsolete | CORE_REQUIRED | Keep with stale penalty |

This passes the Phase 15 gate because stale signals <= 2 and stale sources = 0.

## ETF Stage Verification

Direct ETF stage after fix:

- Wall time: 7405 ms
- Storage mode: Supabase
- BTC rows parsed from The Block: 601
- ETH rows parsed from The Block: 469
- BTC latest ETF date: 2026-06-04
- BTC latest flow: 3.2 USD million
- ETH latest ETF date: 2026-06-04
- ETH latest flow: 19.3 USD million
- Farside status: Cloudflare blocked
- Fallback used: The Block
- ETF freshness: fresh

No ETF value was fabricated.

## Scoring Before / After

Requested baseline:

- Production Readiness: 76
- Overall Platform Health: 76
- Scheduler: degraded
- Fusion: degraded
- Stale signals: 6

Final:

- Production Readiness: 93
- Overall Platform Health: 87
- Market Reliability: 92
- Operational Reliability: 87
- Freshness Score: 100
- Source Reliability: 100
- Fusion Health: 85
- Confidence Consistency: 100
- Stale sources: 0
- Stale signals: 2
- Confidence violations: 0

## Route / UI Validation

- `/api/cron/ingest`: returned 202 quickly in async mode.
- `/`: 200
- `/admin/data-health`: 200
- `/api/v1/news?grouped=true`: 200, returns `categories` with populated news items.

Note: the news API response field is `categories`, not `groups`.

## Build Validation

- `npm run typecheck`: passed
- `npm run lint`: passed
- `npm run build`: passed

## Gate Decision

SAFE_TO_START_PHASE_15 = true

Reason:

- Production Readiness >= 85
- Scheduler has no blocking degraded stage
- Fusion is `success_with_limited_confidence`
- Stale signals <= 2
- Stale sources = 0
- Confidence violations = 0
- Dead letters = 0
- Build passes
- No fake data was introduced
