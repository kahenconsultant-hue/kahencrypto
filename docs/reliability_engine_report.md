# C.M.I.P Reliability Engine Report

Generated: 2026-05-25

## What was added

- Added `src/server/intelligence/reliability-engine.ts`.
- Computes dynamic coverage for:
  - macro
  - crypto
  - liquidity
  - derivatives
  - sentiment
  - geopolitical
- Produces an overall `intelligenceReliability` score.
- Produces confidence caps for alerts, regime, liquidity, correlations and sentiment.
- Exposes `/api/v1/reliability`.
- Added dashboard reliability panel and admin debug visibility.

## Current live verification

Latest manual ingestion run:

- run id: `323e807d-2cc4-4dd1-9a19-39005a707f48`
- storage mode: `supabase`
- pulled events: `130`
- pulled metrics: `20`
- raw event inserts: `0`
- raw event updates: `130`
- normalized events created: `133`
- event clusters created: `132`
- duplicates detected: `1`
- failed sources: `5`
- dead letters: `5`

Supabase counts after verification:

- sources: `11`
- source_health: `11`
- raw_events: `133`
- raw_metrics: `160`
- ingestion_logs: `88`
- processing_errors: `0`
- dead_letters: `40`
- normalized_events: `133`
- event_clusters: `132`
- reliability_snapshots: `8`
- smart_alerts: `0`

## Current reliability snapshot

- overall reliability: `0.64`
- status: `critical`
- macro coverage: `0.60`
- crypto coverage: `0.82`
- liquidity coverage: `0.43`
- derivatives coverage: `0.54`
- sentiment coverage: `0.86`
- geopolitical coverage: `0.73`

Critical missing or failed sources:

- US Treasury RSS
- FRED API
- CoinGlass API

Degraded modules:

- Macro dashboard
- market regime
- liquidity engine
- ETF flow analysis
- USDT risk
- derivatives stress analysis
- leverage alerts
- AI summaries

## Confidence caps

- global: `64%`
- alerts: `60%`
- regime: `60%`
- liquidity: `50%`
- correlations: `64%`
- sentiment: `64%`

These caps are intentionally conservative. Missing Tier 1 sources lower confidence and prevent aggressive alert generation.

## Design rule

If coverage is low, the engine does not fabricate analysis. It marks modules degraded and caps downstream confidence.
