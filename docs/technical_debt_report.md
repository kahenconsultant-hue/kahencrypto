# C.M.I.P Technical Debt Report

Audit date: 2026-05-25  
Scope: Existing codebase only. No runtime code modified.

## Highest-Risk Debt

| Severity | Debt | Evidence | Impact | Remediation |
|---|---|---|---|---|
| Critical | Runtime still imports demo fixtures | `src/lib/demo-data.ts` is imported by dashboard panels, asset pages, API news/assets/overview, WordPress adapter, admin console, and ingestion pipeline | Users can see hardcoded news, source health, plans, and asset narratives mixed with engine output | Move demo data behind explicit dev-only stories; production routes must read DB/API snapshots |
| Critical | Ingestion pipeline is simulated | `src/server/ingestion/pipeline.ts` calls `getNewsItems`, `simulateIngestionRun`, and fake source latency/failure | No raw events, no real queue, no dedupe, no source health truth | Replace with collector interfaces and persisted jobs/events |
| Critical | Cache is filesystem-only | `src/server/data/signal-cache.ts` writes `.cache/cmip/latest-signals.json` | Not safe across serverless instances; stale state can be inconsistent | Use Redis for hot cache and Supabase/Postgres for durable snapshots |
| Critical | No production collector layer | Only adapters exist under `src/server/data/adapters.ts`; no `/collectors` or worker modules | Public APIs can be polled, but source lifecycle is not managed | Create RSS/API/websocket/scraper collector framework |
| High | Supabase schema is unused at runtime | `createSupabaseServerClient` exists, but engines/routes inspected do not persist snapshots | Database does not support intelligence history or reliability | Add repositories and write paths for raw events, metrics, regimes, alerts |
| High | Source status is static | `moduleDataSourceStatus` and `sourceRegistry` contain declared statuses | UI can claim partial/live even when a source failed | Compute module status from latest source health and coverage snapshots |
| High | Cron naming is misleading | `/api/cron/ingest` refreshes signal cache only | Users expect ingestion, but raw/news/event data is not ingested | Split `/api/cron/refresh-signals`, `/api/cron/rss`, `/api/cron/liquidity`, etc. |
| High | Refresh endpoint is unauthenticated | `/api/v1/refresh` can run cache refresh when stale | Potential abuse and provider rate-limit pressure | Require auth/admin/cron token or strict rate limiting |
| High | No queue/dead-letter/retry system | `REDIS_URL` exists but is not used | Source failures are not retried or observable | Add BullMQ/Redis or Supabase job queue with retries and dead-letter table |
| High | No websocket ingestion | No websocket collectors exist | "Realtime Monitoring" is not true real-time market data | Add Binance websocket collector and snapshot aggregation |

## Analytics Debt

| Severity | Debt | Evidence | Impact | Remediation |
|---|---|---|---|---|
| High | Engine inputs are too narrow | Adapter registry has about 20 signal keys | Regime/liquidity/alerts cannot represent full macro picture | Expand normalized metric catalog and persist raw metrics |
| High | ETF flows are env-configured | `CMIP_BTC_ETF_FLOW_24H`, `CMIP_ETH_ETF_FLOW_24H` | ETF analysis unavailable unless manually supplied; can become stale | Build Farside/issuer scraper or paid feed connector |
| High | Exchange reserves are env-configured | `CMIP_BTC_EXCHANGE_RESERVES_7D` | On-chain reserve analysis is not live | Add Glassnode/CryptoQuant/CoinMetrics connectors |
| Medium | Sentiment engine is title-basket heuristic | RSS titles become two aggregate signals | No event-level sentiment, novelty, priced-in, entity extraction | Store news items and run structured event processing |
| Medium | Previous regime is fixed | `previousRegimeLabel` is hardcoded to `Neutral / Transition` | Regime transition is not actually historical | Persist regime snapshots and compute transitions from prior state |
| Medium | Alerts are request-time only | `generateSmartAlerts()` returns current generated array | No audit trail, dedupe across runs, suppression, review, or notification | Persist `smart_alerts`, alert causal keys, and lifecycle |
| Medium | Some probabilities are formulaic but uncalibrated | Scenario probabilities are constructed from current scores only | Useful prototype, not backtested probability model | Add calibration/backtest data and mark as scenario weights until validated |
| Medium | AI layer is scaffolding | `buildSystemPrompt`, `generateProcessingTrace`, no OpenAI call | Translation/interpretation pipeline is not real | Add AI job processor with stored prompts, outputs, audit logs |

## Frontend Debt

| Severity | Debt | Evidence | Impact | Remediation |
|---|---|---|---|---|
| High | Server components call engines directly | `panels.tsx` imports engine functions | UI rendering and analytics execution are coupled | Dashboard should consume API/view-model snapshots |
| High | Demo news feed still visible | `LatestNewsFeedPanel` uses `getNewsGroupedByCategory` | Public UI can show fabricated/curated demo items | Replace with persisted normalized events and unavailable state |
| Medium | Watchlist/plans/API sections are demo-like | `WatchlistAndPlansPanel`, `ApiFirstPanel` exist but are not wired | Product looks like SaaS brochure rather than intelligence terminal | Hide until backed by DB/auth/routes or move to admin/product area |
| Medium | Static module badges | `moduleDataSourceStatus` constant | Incorrect source quality can be shown | Derive badges from reliability engine |

## Database Debt

| Severity | Debt | Evidence | Impact | Remediation |
|---|---|---|---|---|
| High | Requested production tables missing | No `raw_events`, `normalized_events`, `raw_metrics`, `market_prices`, `source_health`, etc. | Cannot store the requested intelligence lifecycle | Add v2 migration with event/metric/reliability tables |
| Medium | Existing table names are product-v1 specific | `raw_items`, `processed_items`, `market_regimes` | Harder to represent metrics/events uniformly | Introduce normalized canonical tables and migrate views |
| Medium | RLS policies exist but ingestion service policies unclear | Admin-only raw writes | Workers need service-role repository access with audit | Use server-only repositories and service role by module |

## Environment And Provider Debt

| Severity | Debt | Evidence | Impact | Remediation |
|---|---|---|---|---|
| Medium | Env naming mismatch | `.env.example` has `TRADING_ECONOMICS_KEY`; requested name is `TRADINGECONOMICS_API_KEY` | Deployment mistakes | Standardize env names and validate with zod |
| Medium | Missing requested key | `.env.example` lacks `WHALE_ALERT_API_KEY` | Whale connector cannot be configured | Add env var and connector disabled state |
| Medium | No env validation | No central `config` module | Missing keys fail late inside adapters | Add `src/config/env.ts` with safe parsing and degraded-mode flags |

## Test Debt

Current tests cover useful pure analytics behavior:

- correlation sample checks,
- confidence thresholds,
- stale data caps,
- no score for estimated/ETF unavailable,
- regime penalty logic,
- liquidity V2 state detection.

Missing tests:

- API contract tests for unavailable vs partial/live payloads.
- Ingestion collector tests.
- Source health persistence tests.
- Cache staleness and refresh auth tests.
- Alert deduplication across persisted runs.
- Supabase repository tests.
- End-to-end dashboard data-source tests.

## Recommended Cleanup Order

1. Freeze `src/lib/demo-data.ts` behind explicit development-only imports.
2. Replace API news/assets/overview demo payloads with unavailable or DB-backed snapshots.
3. Create source health and raw metrics persistence.
4. Replace filesystem cache with Redis plus Postgres snapshots.
5. Build collectors and workers incrementally, starting with free sources.
6. Make static data badges dynamic from reliability snapshots.
7. Persist regimes, correlations, liquidity scores, sentiment events, and alerts.

