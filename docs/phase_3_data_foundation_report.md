# Phase 3 Data Foundation Report

Date: 2026-05-29  
Scope: Master roadmap Phase 3, production-grade data foundation.

## Objective

Create the missing canonical storage contracts needed before advanced intelligence work:

- market snapshots
- intelligence outputs
- telemetry logs
- freshness and degradation metadata on existing raw/source tables

This phase does not add AI intelligence, fake alerts, simulated market data or new paid-source dependency.

## Implemented

| Area | File | Change |
|---|---|---|
| Supabase schema | `supabase/migrations/202605250008_data_foundation_contracts.sql` | Added `market_snapshots`, `intelligence_outputs`, `telemetry_logs`; added freshness/degradation metadata to `raw_events`, `raw_metrics`, `source_health`. |
| Migration runner | `scripts/apply-supabase-migrations.mjs` | Added migration `202605250008_data_foundation_contracts.sql` to the official migration list. |
| Supabase verifier | `scripts/verify-supabase-ingestion.mjs` | Added `market_snapshots`, `intelligence_outputs`, `telemetry_logs` to table verification. |
| Type contracts | `src/types/ingestion.ts` | Added `MarketSnapshotInput`, `IntelligenceOutputInput`, `TelemetryLogInput`. |
| Storage layer | `src/storage/ingestion-store.ts` | Added persistence and local fallback for market snapshots, intelligence outputs and telemetry logs. Existing raw event/metric/source health rows now include freshness/degradation metadata. |
| Ingestion pipeline | `src/api/ingestion.ts` | Each ingestion run now writes `market_snapshots` derived only from real `raw_metrics` and writes a telemetry record for the run. |
| Admin debug | `src/app/admin/ingestion/page.tsx` | Admin table counts now include `raw_metrics`, `market_snapshots`, `intelligence_outputs`, `telemetry_logs`. |

## Data Foundation Tables

| Table | Purpose | Public behavior |
|---|---|---|
| `market_snapshots` | Run-level grouped snapshots derived from real metrics only. | Public read enabled. |
| `intelligence_outputs` | Future canonical output store for engines and AI layers. | Public read enabled, but no fake rows are generated in this phase. |
| `telemetry_logs` | Operational events such as ingestion completion and write behavior. | Admin-only read. |

Existing foundation tables retained:

- `sources`
- `source_health`
- `raw_events`
- `raw_metrics`
- `ingestion_logs`
- `processing_errors`
- `dead_letters`
- `normalized_events`
- `event_clusters`
- `derived_signals`
- `liquidity_scores`
- `regime_inputs`
- `reliability_snapshots`
- `ingestion_runs`

## No Fake Data Rule

`market_snapshots` are produced only from `raw_metrics` where:

- `value !== null`
- `quality !== unavailable`
- `quality !== estimated`

If a run has no usable metrics, no market snapshot is generated. The system does not create placeholder prices, flows, ETF data, whale data or intelligence rows.

`intelligence_outputs` is intentionally empty after this phase because advanced intelligence persistence belongs to later phases.

## Verification

Commands run:

```bash
npm run typecheck
npm run supabase:migrate
npm run verify:supabase
CMIP_BASE_URL=http://127.0.0.1:3004 npm run ingest:once
npm run verify:supabase
```

Migration result:

```text
applied 202605250008_data_foundation_contracts.sql
```

Manual ingestion run:

```json
{
  "runId": "e90fec35-9d2a-4462-994c-30e7d54c4811",
  "storageMode": "supabase",
  "pulledEvents": 184,
  "pulledMetrics": 20,
  "rawEventsInserted": 28,
  "rawEventsUpdated": 156,
  "normalizedEventsCreated": 500,
  "eventClustersCreated": 469,
  "duplicatesDetected": 31,
  "failedSources": 2,
  "deadLetters": 2
}
```

Supabase verification after ingestion:

| Table | Count |
|---|---:|
| `sources` | 17 |
| `source_health` | 15 |
| `raw_events` | 697 |
| `raw_metrics` | 760 |
| `ingestion_logs` | 418 |
| `processing_errors` | 0 |
| `dead_letters` | 106 |
| `normalized_events` | 697 |
| `event_clusters` | 667 |
| `market_snapshots` | 10 |
| `intelligence_outputs` | 0 |
| `telemetry_logs` | 1 |
| `smart_alerts` | 0 |
| `derived_signals` | 168 |
| `liquidity_scores` | 28 |
| `regime_inputs` | 28 |
| `reliability_snapshots` | 38 |
| `ingestion_runs` | 38 |

## Phase 3 Status

`PHASE_3_DATA_FOUNDATION_COMPLETE = true`

Safe next phase: source management / queue-cache hardening, depending on which roadmap branch is followed next.

