# Phase 3: Real Persistence & Scheduler Activation

Date: 2026-05-25
Project: C.M.I.P, Crypto Macro Intelligence Platform

## What Changed

Phase 3 makes ingestion durable and schedulable. It does not add AI intelligence, simulated alerts, or fabricated market data.

Implemented:

- Runtime raw metrics from real adapters are persisted through `raw_metrics`.
- Runtime RSS/API raw events are persisted through `raw_events`.
- Source health is persisted through `source_health`.
- Per-source ingestion logs are persisted through `ingestion_logs`.
- Per-run summaries are persisted through `ingestion_runs`.
- Failed jobs and missing API key jobs are persisted through `ingestion_dead_letters`.
- `/api/cron/ingest` supports `GET` for Vercel Cron and `POST` for manual/internal callers.
- Local scheduler scripts were added.
- `/admin/ingestion` shows ingestion debug state.

## Supabase Tables

Required migrations:

- `supabase/migrations/202605250001_ingestion_foundation.sql`
- `supabase/migrations/202605250002_ingestion_runs_dead_letters.sql`

Run:

```bash
supabase db push
```

Required for Supabase writes:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

If `SUPABASE_SERVICE_ROLE_KEY` is missing, writes may fall back to local JSONL storage because anon keys cannot bypass RLS insert restrictions.

## Local Scheduler

Start the Next.js app first:

```bash
npm run dev -- -p 3004
```

Run one ingestion manually:

```bash
CMIP_BASE_URL=http://127.0.0.1:3004 npm run ingest:once
```

Run the local scheduler every 30 minutes:

```bash
CMIP_BASE_URL=http://127.0.0.1:3004 npm run ingest:scheduler
```

Optional settings:

```bash
CMIP_INGEST_INTERVAL_MINUTES=30
INGESTION_CRON_SECRET=replace-with-random-secret
```

When `INGESTION_CRON_SECRET` or `CRON_SECRET` is set, the scheduler sends:

```text
Authorization: Bearer $CRON_SECRET
```

## Production Scheduler

`vercel.json` contains:

```json
{
  "crons": [
    {
      "path": "/api/cron/ingest",
      "schedule": "*/30 * * * *"
    }
  ]
}
```

In Vercel, set:

```bash
CRON_SECRET=replace-with-random-secret
NEXT_PUBLIC_SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Vercel Cron will call `GET /api/cron/ingest` every 30 minutes.

## Admin Debug Page

Open:

```text
/admin/ingestion
```

It shows:

- Last ingestion run.
- Active sources.
- Failed sources.
- Stale sources.
- Missing API keys.
- Latest ingestion logs.
- Dead-letter entries.
- Local fallback path.

## Dead-Letter Rules

The ingestion foundation writes dead-letter entries when:

- A collector fails after retries.
- A source is enabled but required API keys are missing.

Dead-letter entries include:

- run ID.
- source ID and name.
- status.
- attempts.
- error.
- parser and endpoint metadata.
- failed timestamp.
- next retry timestamp when available.

## No Fake Data Rule

Phase 3 preserves the rule:

- No API key means `api_key_missing`, not fake values.
- Failed source means `failed`, not fabricated metrics.
- Missing data means empty/unavailable output.
- Refreshing the scheduler persists real collector output only.
