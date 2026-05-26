# C.M.I.P Production Readiness Report

Generated: 2026-05-25

## Verification completed

Commands completed successfully:

- `npm run typecheck`
- `npm run lint`
- `npm run ingest:once`
- `npm run verify:supabase`

Manual ingestion result:

- run id: `323e807d-2cc4-4dd1-9a19-39005a707f48`
- storage mode: `supabase`
- pulled events: `130`
- pulled metrics: `20`
- raw events inserted: `0`
- raw events updated: `130`
- normalized events created: `133`
- event clusters created: `132`
- duplicates detected: `1`
- failed sources: `5`
- dead letters: `5`

## Production readiness status

Current status: not fully production-ready for high-confidence market intelligence.

Reason:

- overall reliability is `0.64`
- status is `critical`
- several Tier 1 or important sources are missing or failed
- AI summaries are disabled because `OPENAI_API_KEY` is missing
- ETF flow and exchange reserve data are unavailable

## Ready components

- Supabase persistence
- ingestion scheduler endpoint
- source health tracking
- raw metric persistence
- normalized event generation
- event clustering
- reliability scoring
- correlation sample gates
- liquidity/regime confidence caps
- multi-factor alert structure
- degraded mode behavior

## Not ready yet

- persistent AI summaries
- persisted regime/liquidity/correlation snapshots
- ETF crawler
- FRED data collector
- CoinGlass/derivatives collector
- exchange reserve collector
- smart alert persistence workflow
- websocket long-running worker for production market ticks

## Next recommended phase

Persist engine snapshots after each cron run:

- liquidity snapshots
- regime snapshots
- correlation snapshots
- generated alert candidates
- AI summaries for normalized events

Then wire the dashboard to read stored engine outputs instead of recalculating every server render.
