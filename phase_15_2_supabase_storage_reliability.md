# Phase 15.2 — Supabase Storage Reliability & Query Timeout Hardening

Generated: 2026-06-14 20:00 Europe/Paris

## Summary

Supabase is now the explicit production primary storage path. Production no longer silently reports `local_fallback` when Supabase operations fail; failed production Supabase operations are reported as `degraded_supabase_fallback` and surfaced in Data Health.

The Data Health dashboard now includes a Storage Reliability section with read/write success rate, timeout count, fallback count, slow query count, average query duration, last storage failure and affected tables.

## Files Changed

- `src/storage/ingestion-store.ts`
- `src/server/admin/data-health-service.ts`
- `src/app/admin/data-health/page.tsx`
- `src/server/ingestion/scheduler.ts`
- `src/api/ingestion.ts`
- `src/app/api/v1/refresh/route.ts`
- `src/server/data/etf-flow-module.ts`
- `src/types/ingestion.ts`
- `scripts/apply-supabase-migrations.mjs`
- `scripts/audit-storage-reliability.mjs`
- `supabase/migrations/202606140001_storage_reliability_hardening.sql`

## Storage Policy

Production:

- Supabase is primary.
- Silent local fallback is disabled as a reporting behavior.
- If Supabase fails and runtime fallback is used, storage mode becomes `degraded_supabase_fallback`.
- Data Health shows the degradation clearly.

Development:

- Local fallback remains allowed for local testing.

## Query Hardening

Implemented:

- `raw_events` and `raw_metrics` admin reads capped to latest 100 rows.
- Raw payload-heavy tables select only operational columns unless raw data is explicitly needed.
- `etf_daily_flows` reads capped to recent 1,200 rows and queried by indexed asset/date/provider path.
- `forecast_snapshots` and `forecast_validations` reads capped to 5,000 rows.
- Data Health table counts use planned counts instead of exact full-table count scans.
- Storage operations record operation type, duration, slow query flag, fallback usage and query label.

## Indexes Applied

Migration applied: `202606140001_storage_reliability_hardening.sql`

Added/verified indexes:

- `raw_events(event_timestamp desc)`
- `raw_events(created_at desc)`
- `raw_events(source_id_text, created_at desc)`
- `raw_metrics(created_at desc)`
- `raw_metrics(source_id_text, created_at desc)`
- `raw_metrics(source_id_text, metric, metric_timestamp desc)`
- `normalized_events(source_id_text, event_timestamp desc)`
- `normalized_events(created_at desc)`
- `event_clusters(last_seen_at desc)`
- `etf_daily_flows(asset, flow_date desc, provider)`
- `forecast_snapshots(forecast_timestamp desc)`
- `forecast_snapshots(run_id, forecast_timestamp desc)`
- `forecast_snapshots(validation_date desc, asset, prediction_horizon)`
- `forecast_validations(validated_at desc)`
- `forecast_validations(validation_date desc)`
- `telemetry_logs(table_name, observed_at desc)`
- `telemetry_logs(source_id_text, observed_at desc)`
- `data_health_snapshots(observed_at desc)`
- `data_health_snapshots(run_id, observed_at desc)`

## Supabase Table Audit

Direct Supabase audit after production run:

| Table | Exists | Row Count | Count Duration | Index Status |
|---|---:|---:|---:|---|
| `raw_events` | yes | 1,960 | 579 ms | ok |
| `raw_metrics` | yes | 15,000 | 1,050 ms | ok |
| `normalized_events` | yes | 2,216 | 1,950 ms | ok |
| `telemetry_logs` | yes | 861 | 934 ms | ok |
| `ingestion_runs` | yes | 750 | 171 ms | ok |
| `etf_daily_flows` | yes | 12,618 | 518 ms | ok |
| `forecast_snapshots` | yes | 540 | 104 ms | ok |
| `forecast_validations` | yes | 0 | 86 ms | ok |
| `data_health_snapshots` | yes | 2 | 78 ms | ok |

Note: the project does not use a physical `signal_cache` table. Signal cache snapshots are persisted as `telemetry_logs` records with `scope = "signal_cache"` / `event_type = "signal_cache_refreshed"`.

## Timeout Source Found

Before hardening, Data Health could trigger slow full-table style counts/selects. The direct audit showed exact counts could be slow on:

- `raw_metrics`
- `normalized_events`
- historical `etf_daily_flows`

The application no longer uses these exact broad reads for dashboard/admin rendering.

## Forecast Storage Optimization

Implemented:

- Forecast dashboard/API reads are bounded to the required recent window.
- Forecast snapshots are indexed by timestamp, run ID and validation date.
- The validation center does not load all snapshots at once.

Current forecast rows:

- `forecast_snapshots`: 540
- `forecast_validations`: 0

`forecast_validations = 0` is expected until generated snapshots reach their validation horizon.

## ETF Storage Optimization

Implemented:

- ETF reads are capped to 1,200 rows.
- ETF lookup uses `asset + flow_date + provider` indexing.
- The ETF module no longer requests 20,000 rows.

Current ETF rows:

- `etf_daily_flows`: 12,618 total rows.

## Raw Events / Raw Metrics Optimization

Implemented:

- Admin/UI reads are capped to 100 rows.
- `raw_events` column selection avoids raw payload unless needed.
- `raw_metrics` column selection avoids full-table payload scans.
- Storage audit script remains explicit and operational; the UI path is bounded.

## Storage Diagnostics

Added to Data Health:

- Storage Mode
- Supabase Status
- Read Success
- Write Success
- Timeout / Fallback
- Slow Query / Average Query Duration
- Affected Tables
- Last Storage Failure

Data Health now also reads the latest `data_health_snapshots` row from Supabase when local serverless memory does not contain recent storage reports.

## Production Verification

Production deployment:

- `dpl_DSYk3NpuofVz61wkgpZnAiRP3d2x`
- `dpl_7u9cDEkm6KBv3xDuGSy49KTesjxB`
- Active alias: `https://kahencrypto.vercel.app`

Manual production cron run after deployment:

- runId: `91373a43-79c6-4d38-913a-13c8589a4aad`
- executionEnvironment: `production`
- trigger: `manual_http`
- duration: `12,050 ms`
- storageMode: `supabase`
- failedStage: `null`
- scheduler status: `success_with_limited_confidence`
- successRate: `91`
- staleSignals: `2`
- data_health_snapshots rows after run: `2`

Stage results:

| Stage | Status | Duration | Notes |
|---|---|---:|---|
| Market | `success_with_limited_confidence` | 3,271 ms | Binance/Bybit direct collectors degraded; adapter fallback produced market metrics |
| Macro | `success` | 8,486 ms | FRED/RSS macro path succeeded |
| News | `success` | 5,724 ms | RSS ingestion succeeded |
| ETF | `success_with_limited_confidence` | 4,566 ms | Farside blocked by Cloudflare, The Block fallback succeeded |
| Fusion | `success_with_limited_confidence` | 2,584 ms | No blocking missing inputs; optional/free/premium inputs still unavailable |

Production smoke tests:

- `/api/v1/overview`: HTTP 200, freshness `fresh`, health `healthy`, latestRefreshAt `2026-06-14T17:59:51.812Z`
- `/admin/data-health`: rendered successfully and contains `Storage Reliability`, `Storage Mode`, `Supabase Status`, `Fallback`

## Validation

Passed:

- `npm run typecheck`
- `npm run lint`
- `npm run build`
- `npm run supabase:migrate`
- Production manual cron ingestion
- Supabase table/index audit
- Production overview smoke test
- Production Data Health smoke test

## Required Pass Criteria

- No silent local fallback in production: passed.
- Supabase read/write diagnostics visible: passed.
- Forecast snapshots query limited and indexed: passed.
- ETF queries do not full-scan old rows: passed.
- Raw event/raw metric admin queries capped: passed.
- Production Data Health shows storage reliability accurately: passed.

## Remaining Non-Storage Limitations

These are not storage blockers:

- Binance and Bybit direct public collectors still report degraded in the scheduler, while fallback adapters continue to produce market metrics.
- Farside ETF remains Cloudflare-blocked, but The Block fallback returns real ETF data.
- Some derivatives/futures and exchange-flow inputs remain unavailable and correctly reduce confidence instead of creating fake data.
