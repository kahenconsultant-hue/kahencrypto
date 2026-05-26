# C.M.I.P Migration Plan

Audit date: 2026-05-25  
Goal: migrate from mixed demo/prototype to production-grade data-driven intelligence without blindly overwriting the project.

## Migration Principles

- Do not fabricate unavailable market data.
- Do not hide degraded intelligence state.
- Keep existing useful analytics functions where they are correct.
- Replace runtime demo dependencies incrementally with database-backed snapshots.
- Build ingestion/storage first, then dashboard integration.
- Keep the app working after every phase.

## Phase 0: Freeze Demo Logic

Objective: stop hidden demo data from leaking into production behavior.

Tasks:

1. Add an explicit `CMIP_DEMO_MODE` or development-only module guard.
2. Prevent `src/lib/demo-data.ts` imports from production API routes.
3. Replace production demo payload sections with `unavailable` placeholders until real data exists.
4. Add a lint/check script that fails if production route files import `demo-data`.

Acceptance:

- `/api/v1/news` returns unavailable/empty when no real events exist.
- `/api/v1/overview` does not include hardcoded news or source health.
- UI shows degraded state rather than demo narratives.

## Phase 1: Database V2 Foundation

Objective: add canonical event/metric/reliability storage.

Add migrations for:

- `source_health`
- `raw_events`
- `normalized_events`
- `event_clusters`
- `raw_metrics`
- `market_prices`
- `market_snapshots`
- `correlations`
- `liquidity_scores`
- `regime_snapshots`
- `smart_alerts`
- `translation_outputs`
- `user_alert_preferences`
- `processing_jobs`
- `processing_errors`
- `intelligence_reliability`
- `coverage_snapshots`

Acceptance:

- Tables include timestamps, source metadata, retry tracking, dedup hashes, confidence/freshness metadata.
- Repository functions can insert and query source health, raw metrics, and latest snapshots.

## Phase 2: Source Management System

Objective: make sources configurable and observable.

Tasks:

1. Move `sourceRegistry` from static TypeScript truth into database seed/config.
2. Add source fields: polling interval, retry policy, timeout, parser rules, priority, enabled, rate limit, degraded mode, required env keys.
3. Add source health updater.
4. Implement API key missing detection.

Acceptance:

- Missing keys mark source as `api_key_missing`.
- Disabled sources do not run.
- Failed sources produce processing errors and degraded module status.

## Phase 3: Queue And Cache Layer

Objective: replace filesystem-only cache with production storage.

Tasks:

1. Add Redis cache abstraction.
2. Add processing queue abstraction.
3. Add worker-safe locks for scheduled refresh.
4. Keep `.cache` as local dev fallback only.

Acceptance:

- Multiple app instances can read consistent latest snapshots.
- Failed jobs retry with exponential backoff.
- Dead-letter jobs are visible through source health/admin API.

## Phase 4: Free Collectors First

Objective: make the platform useful without paid APIs.

Implement:

- Binance websocket/REST for BTCUSDT, ETHUSDT, SOLUSDT.
- CoinGecko public API for market data fallback.
- DefiLlama stablecoins, TVL, DEX volume.
- Fed RSS.
- ECB RSS.
- US Treasury RSS.
- SEC public feeds.
- CoinDesk RSS.
- Cointelegraph RSS.
- CNBC RSS.

Acceptance:

- Raw payloads are stored.
- Parsed events/metrics have timestamps and source IDs.
- Source health shows latency, freshness, last error, and success rate.

## Phase 5: Normalization And Deduplication

Objective: convert raw source data into intelligence-ready schemas.

Tasks:

1. Normalize event types: central bank policy, inflation data, treasury yield move, dxy move, etf flow, stablecoin mint/burn, funding shift, liquidation cluster, geopolitical risk, regulation, security risk, market sentiment.
2. Deduplicate by URL hash, title similarity, entity matching, source overlap, timing overlap.
3. Cluster related events.

Acceptance:

- Duplicate news stories collapse into one event cluster.
- Metrics and events can be queried by asset, source, timestamp, and event type.

## Phase 6: Reliability And Coverage Engine

Objective: compute honest intelligence coverage.

Tasks:

1. Compute macro, crypto, liquidity, derivatives, sentiment, geopolitical coverage.
2. Compute critical source availability.
3. Mark modules degraded when critical sources fail.
4. Persist `coverage_snapshots` and `intelligence_reliability`.

Acceptance:

- Dashboard can show: "Intelligence quality degraded due to missing critical data sources."
- Confidence and alert aggressiveness reduce automatically when coverage is low.

## Phase 7: Engine Persistence

Objective: engines consume normalized data and write snapshots.

Tasks:

1. Correlation engine reads `market_prices` and writes `correlations`.
2. Liquidity engine reads macro/stablecoin/ETF/leverage metrics and writes `liquidity_scores`.
3. Regime engine reads correlation/liquidity/volatility/sentiment snapshots and writes `regime_snapshots`.
4. Sentiment engine reads normalized events and writes category/asset sentiment snapshots.
5. Alert engine writes `smart_alerts` with dedupe causal keys.

Acceptance:

- APIs can serve latest persisted snapshots without recomputing every dashboard render.
- Previous regime and alert transitions are real historical values.

## Phase 8: AI Processing Layer

Objective: Persian event interpretation without hallucinated data.

Tasks:

1. Add OpenAI-backed processing job for normalized events.
2. Generate translation, short summary, macro interpretation, crypto interpretation, affected assets, impact score, volatility score, liquidity score, confidence explanation.
3. Store prompt versions and outputs in `ai_summaries`, `translation_outputs`, `ai_logs`.
4. Reject missing market data inside prompts; pass unavailable status explicitly.

Acceptance:

- All Persian explanations are stored, traceable, and generated from event/metric context.
- AI never invents ETF/whale/liquidity values.

## Phase 9: API Redesign

Objective: make dashboard APIs source-of-truth.

Required APIs:

- `/api/dashboard/overview`
- `/api/events/latest`
- `/api/alerts`
- `/api/regime/current`
- `/api/liquidity/current`
- `/api/correlations`
- `/api/assets/:symbol/intelligence`
- `/api/source-health`
- `/api/reliability`

Acceptance:

- Current `/api/v1/*` routes either wrap new APIs or are deprecated with compatibility payloads.
- All APIs include data quality, last updated, missing sources, and degraded modules.

## Phase 10: UI Integration

Objective: dashboard reflects engine state, not demo state.

Tasks:

1. Remove runtime demo imports from panels/pages.
2. Read API/view-model snapshots.
3. Show unavailable states for missing modules.
4. Keep Persian copy fluent and avoid English-only explanations.
5. Hide plan/API marketing blocks until real account/widget functionality is backed.

Acceptance:

- No visible hardcoded news/pricing/API placeholder sections.
- Every card shows source quality, timestamp, confidence availability, and missing data.

## Phase 11: Security And Production Hardening

Tasks:

1. Require `CRON_SECRET` for scheduled routes.
2. Rate-limit public APIs.
3. Validate env with a central config module.
4. Add timeout/retry policies per source.
5. Protect service-role Supabase access in server-only repositories.
6. Add observability for latency, job failures, and source freshness.

Acceptance:

- Missing secrets fail closed or disable affected collectors.
- Provider failures do not crash dashboard rendering.

## Suggested Rollout

1. Local v2 schema and free-source collectors.
2. Staging deployment with real cron and Redis.
3. Dashboard switches to DB snapshots.
4. Production launch with degraded-mode transparency.
5. Paid/premium connectors added behind feature flags.

