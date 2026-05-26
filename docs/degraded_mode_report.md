# Degraded Mode Report

Generated: 2026-05-25

## Current Environment

| Check | Result |
| --- | --- |
| Supabase URL configured | yes |
| Supabase anon key configured | yes |
| Supabase service role configured | yes |
| Active storage mode | `supabase` |
| Development fallback | `CMIP_ALLOW_DEV_FALLBACK=false` |

Optional API keys currently missing:

- `OPENAI_API_KEY`
- `COINGECKO_API_KEY`
- `TRADINGECONOMICS_API_KEY`
- `COINGLASS_API_KEY`
- `FRED_API_KEY`
- `WHALE_ALERT_API_KEY`
- `GLASSNODE_API_KEY`
- `CRYPTOQUANT_API_KEY`

## Degraded Behavior Verified

| Condition | Verified behavior |
| --- | --- |
| Missing required API key | Collector returns `api_key_missing`, writes 0 events and 0 metrics |
| Failing RSS endpoint | Collector retries, then writes failed source health and dead letter |
| Partial market metrics | Collector returns `degraded`, writes available real metrics, marks unavailable metrics explicitly |
| Missing ETF flow feed | `value=null`, `quality=unavailable`, no fabricated ETF number |
| Missing exchange reserve feed | `value=null`, `quality=unavailable`, no fabricated reserve number |
| Supabase available | Runtime writes go to Supabase |
| Supabase write status | All latest write reports are `success` |

## Stale Source Handling

The ingestion foundation persists freshness metadata for every source:

- `freshness_minutes`
- `last_success_at`
- `last_failure_at`
- `consecutive_failures`
- `next_retry_at`
- `last_error`

In the latest verification run, successful sources were fresh and no successful source crossed a stale threshold. Failed and API-key-missing sources were not presented as live; they were marked failed or `api_key_missing` and persisted with retry metadata.

Gap to keep visible for the next phase: there is freshness metadata, but no separate persisted `stale` status yet. If the dashboard needs strict stale badges, add a health-layer classification that converts old `last_success_at` values into `stale` or `stale_critical`.

## No Fake Data Verification

No fake data was generated for failed or unavailable sources in the verification run.

Evidence:

- missing API-key collectors produced zero rows of raw data.
- unavailable ETF and exchange reserve metrics were stored with `value=null`.
- development fallback is disabled.
- `normalized_events` remains 0.
- `smart_alerts` remains 0.
- no AI/regime/correlation/alert generation was executed in this phase.

## Degraded Mode Conclusion

The current production persistence layer behaves correctly under degraded data conditions: it stores what is real, marks missing data as unavailable, writes source health and dead-letter records, and avoids simulated intelligence.
