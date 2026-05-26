# Ingestion Foundation Status

Date: 2026-05-25
Project: C.M.I.P, Crypto Macro Intelligence Platform

## Implemented

### Source Abstraction

Each source now supports:

- ID and display name.
- Source type.
- Endpoint.
- Category.
- Tier.
- Enabled/disabled state.
- Polling interval.
- Timeout.
- Priority score.
- Parser type.
- Asset relevance.
- Required environment keys.
- Retry policy.
- Rate limit metadata.
- Degraded mode strategy.

### Collectors

Implemented collector types:

- RSS collector.
- Public market signal collector.

Registered sources currently include:

- Public market signal adapters.
- Federal Reserve RSS.
- US Treasury RSS.
- SEC RSS.
- CoinDesk RSS.
- Cointelegraph RSS.
- CNBC RSS.

### Retry Structure

Collectors run through `runCollectorWithRetry`, which supports:

- Max attempts.
- Backoff.
- Backoff multiplier.
- Terminal failure recording.

### Persistence

Implemented persistence targets:

- Supabase `raw_events`.
- Supabase `raw_metrics`.
- Supabase `source_health`.
- Supabase `ingestion_logs`.
- Local JSONL fallback.

### Source Health

The system records:

- Status.
- Tier.
- Latency.
- Freshness.
- Error rate.
- Consecutive failure count.
- Last success.
- Last failure.
- Last error.

### APIs

Implemented:

- `GET /api/v1/source-health`

Updated:

- `POST /api/cron/ingest`
- `POST /api/v1/refresh`
- `GET /api/v1/news`
- `GET /api/v1/overview`

## Refresh Behavior

Manual refresh and cron ingestion now run ingestion foundation. This fixes the previous architectural issue where the UI could claim scheduled refresh while source health and raw events were not actually being refreshed by the ingestion layer.

The app still needs an external scheduler in deployment to call `/api/cron/ingest` on the desired interval.

## What Is Honest Now

- If a source fails, source health records a failure.
- If a collector cannot parse data, it is degraded.
- If an API key is missing, the source is marked `api_key_missing`.
- If Supabase is unavailable, records are written to local fallback instead of being silently dropped.
- If no raw events exist, news panels show insufficient data rather than demo cards.

## Not Yet Implemented

- Redis queue backend.
- Background worker process.
- Binance websocket collector.
- FRED collector.
- DefiLlama collector.
- SEC filings parser beyond RSS/source registration.
- Farside ETF scraping.
- Semantic deduplication.
- AI translation and normalized event processing.
- Advanced market intelligence engines.
- Alert engine beyond data quality alerts.

## Verification

Commands run successfully:

```bash
npm run typecheck
npm run lint
npm run build
PYTHONPYCACHEPREFIX=/private/tmp/cmip-pycache python3 -m py_compile services/python/analytics/app.py services/python/analytics/correlation_worker.py services/python/analytics/regime_worker.py
```
