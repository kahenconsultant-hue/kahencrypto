# C.M.I.P Phase 1 Project Audit

Date: 2026-05-26  
Branch: `cmip-evolution`  
Baseline commit: `0bf091f baseline before CMIP evolution`

## Scope

Phase 1 is audit-only. No runtime logic, dashboard behavior, collector behavior, or database behavior is changed in this phase.

The goal is to map the current project before the next surgical changes:

- project tree
- dependency map
- ingestion map
- state/runtime data map
- API map
- component map
- current engines
- fake/demo logic still present
- duplicate logic
- hardcoded confidence or fallback behavior
- stale architecture risks

## Executive Summary

The project is no longer a simple demo dashboard. It already contains:

- Next.js 15 app router with Persian RTL dashboard
- Supabase persistence layer with local fallback
- production source registry
- RSS collector
- market signal collector
- ingestion scheduler and cron endpoint
- normalization and deterministic event clustering
- reliability, derived signal, liquidity, regime, correlation, sentiment, asset impact, scenario, and smart alert engines
- admin ingestion/debug page
- self-check tests for scoring, stale data, correlation sample size, unavailable ETF data, and regime consistency

The main risk is not absence of architecture. The main risk is mixed maturity:

- some modules are production-oriented and data-aware
- some helper paths still create neutral baseline scores when data is missing
- dashboard components import server engines directly instead of consuming a single dashboard API contract
- public dashboard still exposes operational panels that should eventually move to admin-only UI
- reliability states are useful but not yet the roadmap's full adaptive state model
- correlation and liquidity engines are better than demo-grade, but still rely on fixed formulas and limited statistical modeling

## Current Repository Shape

Important directories:

```text
src/app                 Next.js pages and API routes
src/components          UI, dashboard, admin, layout, shadcn-style primitives
src/collectors          source registry and collectors
src/processors          deduplication, normalization, event clustering
src/storage             Supabase/local ingestion persistence
src/queues              retry-safe ingestion queue runner
src/health              source health and environment reports
src/server              analytics, AI layer, alerts, data adapters, ingestion, reliability
src/lib                 types, data-source status, production data shell, utilities
supabase/migrations     production persistence schema
scripts                 local scheduler, migrations, verification, ingestion helpers
tests                   analytics and institutional reasoning tests
docs                    existing phase reports and architecture docs
```

## Current Engines

The active analytics and intelligence engines are under `src/server`:

| Engine | File | Current role |
| --- | --- | --- |
| Adaptive confidence | `src/server/analytics/adaptive-confidence-engine.ts` | Module confidence from data availability, reliability, alignment, freshness, proxy ratio, volatility/stress penalties |
| Quality/scoring | `src/server/analytics/quality-engine.ts`, `src/server/analytics/scoring-engine.ts` | Data quality, normalization, impact/confidence formulas |
| Market signals | `src/server/analytics/market-signals.ts` | Normalized signal snapshot from cached adapter data |
| Derived signals | `src/server/analytics/derived-signal-engine.ts` | Free-data/proxy signals, liquidity snapshots, regime input snapshots |
| Liquidity | `src/server/analytics/liquidity-engine.ts` | Macro/crypto liquidity, real spot vs leveraged liquidity, V2 liquidity state |
| Market regime | `src/server/analytics/market-regime-engine.ts` | Multi-factor regime scores, penalties, nuance, transition analysis |
| Correlation | `src/server/analytics/correlation-engine.ts` | Pearson rolling correlations on returns with sample-size guards |
| Asset impact | `src/server/analytics/asset-impact-engine.ts` | Per-asset bias, impact score, drivers, scenarios |
| Scenario | `src/server/analytics/scenario-engine.ts` | Base/bullish/bearish/invalidation scenarios |
| Divergence | `src/server/analytics/divergence-engine.ts` | Price-vs-signal divergence reports |
| Sentiment | `src/server/analytics/sentiment-engine.ts` | RSS/news-derived sentiment and category summaries |
| Smart alerts | `src/server/alerts/smart-alert-engine.ts` | Multi-factor direct/proxy/degradation alerts |
| AI event explanation | `src/server/ai/event-explanation-layer.ts`, `src/server/ai/pipeline.ts` | Persian event explanations and asset summaries |
| Reliability | `src/server/intelligence/reliability-engine.ts` | Core vs premium reliability, confidence caps, degraded modules |

## Ingestion And Persistence

The production ingestion path is:

```text
productionSources
  -> collector selection
  -> retry queue runner
  -> raw events / raw metrics
  -> Supabase upsert when configured
  -> local fallback only when Supabase is unavailable
  -> source health
  -> ingestion logs
  -> dead letters
  -> normalization
  -> event clustering
  -> derived signal persistence
  -> reliability snapshots
```

Key files:

- `src/collectors/registry.ts`
- `src/collectors/rss/rss-collector.ts`
- `src/collectors/api/market-signal-collector.ts`
- `src/server/ingestion/pipeline.ts`
- `src/api/ingestion.ts`
- `src/queues/ingestion-queue.ts`
- `src/storage/ingestion-store.ts`
- `src/processors/event-normalization.ts`
- `src/processors/deduplication.ts`

The current source registry already separates:

- `core_free`
- `free_delayed`
- `api_key_optional`
- optional premium modules

Missing optional/premium API keys no longer block the whole system. The system records disabled/missing-key state instead of fabricating values.

## API Surface

Active route handlers:

| Route | Purpose |
| --- | --- |
| `/api/cron/ingest` | protected/manual ingestion trigger; runs ingestion, signal refresh, derived processing |
| `/api/v1/refresh` | UI-triggered refresh path; refreshes signal cache and runs ingestion when stale |
| `/api/v1/overview` | combined dashboard payload |
| `/api/v1/assets/[symbol]` | asset intelligence payload |
| `/api/v1/alerts` | generated smart alerts |
| `/api/v1/correlations` | rolling correlation report |
| `/api/v1/market-regime` | current market regime |
| `/api/v1/news` | latest raw event feed |
| `/api/v1/source-health` | ingestion/source health |
| `/api/v1/reliability` | reliability report |
| `/api/v1/environment` | Supabase/env/startup report |
| `/api/v1/wordpress` | WordPress/headless payload |

## Frontend Architecture

Main dashboard:

- `src/app/page.tsx`
- `src/components/dashboard/panels.tsx`
- `src/components/layout/app-shell.tsx`
- `src/components/layout/header.tsx`
- `src/components/layout/sidebar.tsx`

Admin:

- `src/app/admin/page.tsx`
- `src/app/admin/ingestion/page.tsx`
- `src/components/admin/admin-console.tsx`

Asset pages:

- `src/app/assets/[symbol]/page.tsx`
- `src/components/assets/asset-dashboard.tsx`

The dashboard still calls several server engines directly inside server components. That works, but it couples UI rendering to compute paths and can duplicate work versus API routes.

## Current State Management

State is mostly server-side and request-time:

- cached market signals in `src/server/data/signal-cache.ts`
- ingestion cache/local fallback in `.cache/cmip/ingestion`
- Supabase tables for durable storage
- AppShell client timer calls `/api/v1/refresh` every 30 minutes and then `router.refresh()`
- no client global state library
- no websocket state bus in the browser yet

This is stable and simple, but the refresh path is split between:

- browser timer
- cron endpoint
- local scheduler script
- server component direct engine calls

That split is acceptable for now but should be consolidated before heavier modeling.

## What Is Real Versus Shell

Real/current:

- source registry
- RSS parsing
- market signal adapter path
- Supabase/local persistence writes
- source health
- ingestion logs
- dead letters
- deterministic normalization
- deterministic clustering
- derived signals
- reliability scoring
- correlation sample-size guards
- proxy-aware liquidity and regime outputs
- data-degradation alerts

Shell/limited:

- `src/lib/production-data.ts` contains empty/safe shell objects for asset intelligence, news groups, USDT risk, pricing plans, and source health.
- `src/lib/data-source-status.ts` contains static module status defaults.
- `/api/v1/overview` still includes empty/shell payload pieces from `production-data.ts`.
- public dashboard includes an operations panel that should ultimately move to admin-only UI.

Not found as active runtime fake market data:

- no random generated prices
- no fabricated ETF flows by default
- no fabricated whale movements
- no fake news items returned from `getNewsItems()`

Important caveat:

- `src/server/data/adapters.ts` has a development fallback guarded by `CMIP_ALLOW_DEV_FALLBACK=true`. By default it returns unavailable, not fake data. This should remain development-only and be visibly impossible in production.

## Key Technical Debt

1. `deriveBaseScores()` still uses neutral baselines when some inputs are missing.
   - File: `src/server/analytics/market-signals.ts`
   - Risk: missing values can become neutral score components and make a panel look more complete than it is.

2. Some fixed constants remain in legacy helpers.
   - Examples: `fedRepricing`, `liquidationDensity`, `whaleExchangeInflow`, `fearGreed`, ecosystem activity placeholders in `marketSignalSnapshot`.
   - Current usage appears limited, but this should be removed or clearly isolated in Phase 2.

3. Dashboard server components import engines directly.
   - File: `src/components/dashboard/panels.tsx`
   - Risk: duplicated computation and harder API-first architecture.

4. Public dashboard exposes operational details.
   - `OperationsPanel` is rendered on `src/app/page.tsx`.
   - Roadmap wants operational internals separated into `/admin/ops`.

5. Reliability status model is not yet the full adaptive state model.
   - Current high-level statuses: healthy/degraded/critical.
   - Roadmap target: healthy/degraded/unstable/sparse/unreliable.

6. Correlation engine is robust against tiny samples but still Pearson-first.
   - Missing: volatility-adjusted correlation, lead-lag, beta adjustment, structural break tests.

7. Liquidity/regime formulas use fixed weights.
   - Better than demo logic, but not yet adaptive to historical predictive power or volatility regime.

8. Admin and dashboard both rely on local sync readers for some panels.
   - This is practical for the current app, but a single API contract would make production scaling cleaner.

## Phase 1 Conclusion

The next safe phase should not be a rewrite. The platform already has enough foundation to evolve surgically.

Recommended next step:

1. keep production ingestion and Supabase persistence untouched
2. remove or isolate remaining neutral/static helper fallbacks
3. move public-only dashboard away from operational internals
4. make a single dashboard data contract before adding heavier probabilistic engines
5. only then improve adaptive reliability, liquidity, correlation, regime, and causality models

