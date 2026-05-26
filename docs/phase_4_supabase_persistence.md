# Phase 4: Supabase Production Persistence Activation

Date: 2026-05-25
Project: C.M.I.P, Crypto Macro Intelligence Platform

## Scope

Phase 4 activates production persistence foundations only. It does not add AI intelligence, regime detection, correlation scoring, or fake alerts.

## Required Supabase Migrations

Run all migrations:

```bash
supabase db push
```

Relevant migrations:

- `202605230001_initial_crypto_macro_schema.sql`
- `202605250001_ingestion_foundation.sql`
- `202605250002_ingestion_runs_dead_letters.sql`
- `202605250003_production_persistence_activation.sql`

The production persistence activation migration verifies or creates:

- `sources`
- `source_health`
- `raw_events`
- `raw_metrics`
- `ingestion_logs`
- `processing_errors`
- `dead_letters`
- `normalized_events`
- `smart_alerts`
- `reliability_snapshots`

## Environment

Use `.env.local.example` as the local production-like template:

```bash
cp .env.local.example .env.local
```

Required for Supabase writes:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
INGESTION_CRON_SECRET=...
```

Optional keys:

```bash
OPENAI_API_KEY=
COINGECKO_API_KEY=
TRADINGECONOMICS_API_KEY=
COINGLASS_API_KEY=
```

## Storage Behavior

When Supabase env exists and connection succeeds:

- source definitions write to `sources`
- raw RSS/API events write to `raw_events`
- adapter metrics write to `raw_metrics`
- health writes to `source_health`
- per-source logs write to `ingestion_logs`
- failed jobs write to `dead_letters`
- run summaries write to `ingestion_runs`
- reliability state writes to `reliability_snapshots`

`local_fallback` is used only when Supabase is not configured or a Supabase write fails.

## Env Validation

Use:

```text
GET /api/v1/environment
```

The report includes:

- Supabase configured / connected.
- service role available / missing.
- active storage mode.
- missing optional API keys.
- enabled collectors.
- last ingestion run.
- last storage write reports.
- failed write count.

## Admin Debug

Open:

```text
/admin/ingestion
```

The page shows:

- current storage mode
- last Supabase write status
- last ingestion run
- inserted raw_events count
- inserted raw_metrics count
- failed writes
- active, failed, stale and missing-key sources

## Verification Commands

```bash
npm run typecheck
npm run lint
npm run build
CMIP_BASE_URL=http://127.0.0.1:3004 npm run ingest:once
```

To confirm Supabase row counts after env and migrations are configured:

```bash
npm run verify:supabase
```
