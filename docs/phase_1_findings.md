# C.M.I.P Phase 1 Findings

Date: 2026-05-26  
Mode: audit-only

## What Is Working

1. The project has a real ingestion foundation.
   - `productionSources` defines source type, tier, polling, timeout, retry, access model, degraded mode, and optional env keys.
   - RSS and market signal collectors use real external endpoints/adapters.
   - Supabase is preferred when configured.
   - Local fallback is used for connection failure or missing Supabase env.

2. The storage model is production-oriented.
   - raw events
   - raw metrics
   - source health
   - ingestion logs
   - processing errors/dead letters
   - normalized events
   - event clusters
   - derived signals
   - liquidity score snapshots
   - regime input snapshots
   - reliability snapshots

3. The system is already proxy-aware.
   - Derived signals are labeled as direct/derived/proxy/unavailable.
   - Premium data absence does not kill core intelligence.
   - Premium notices are separate from market alerts.

4. The current alert engine is not single-headline-only.
   - Alerts combine derived signals, market signals, reliability caps, liquidity, correlation, or regime outputs.
   - Degradation alerts and premium missing notices are explicit.

5. Correlation has basic guardrails.
   - Uses return series rather than raw prices.
   - Enforces minimum samples.
   - Avoids strong narrative when correlation is weak/unstable.

6. There is a useful admin ingestion panel.
   - Shows storage mode, last run, active sources, failed/stale sources, missing keys, table counts, reliability and write status.

## Demo/Fake Logic Audit

No active random market-data generator was found.

No active runtime path was found that fabricates:

- ETF flows by default
- whale transfers
- prices
- raw news
- real institutional data

Remaining risk areas:

| Area | File | Finding |
| --- | --- | --- |
| Development fallback | `src/server/data/adapters.ts` | `CMIP_ALLOW_DEV_FALLBACK=true` can enable estimated development values. Default is unavailable. Must never be enabled in production. |
| Empty production shell | `src/lib/production-data.ts` | Safe empty shells remain for asset intelligence, USDT risk, pricing plans, news groups. These are not fake data, but they can make UI feel unfinished. |
| Static data-source statuses | `src/lib/data-source-status.ts` | Public badges can rely on static defaults rather than live source health. |
| Neutral fallback scoring | `src/server/analytics/market-signals.ts` | Some scoring helpers use `value ?? 0`, which can turn missing data into neutral-looking inputs. |
| Legacy constants | `src/server/analytics/market-signals.ts` | `marketSignalSnapshot` contains fixed constants such as `fedRepricing`, `liquidationDensity`, `fearGreed`, ecosystem activity proxies. It appears mostly legacy/unused, but should be removed or isolated. |
| Hard floor/cap confidence in source mapping | `src/server/ai/asset-intelligence-engine.ts` | Source-mapping confidence has a floor/cap range rather than full adaptive logic. |

## Duplicate Or Split Logic

1. Dashboard and APIs both compute intelligence.
   - Dashboard panels import server engines directly.
   - API routes also expose engine outputs.
   - This duplicates compute paths and complicates API-first evolution.

2. Refresh paths are split.
   - Browser interval calls `/api/v1/refresh`.
   - Vercel/manual cron calls `/api/cron/ingest`.
   - Local scheduler script can run ingestion.
   - This is currently functional but should converge around one orchestration contract.

3. Source status exists in several layers.
   - `source_health` persistence
   - reliability engine
   - `moduleDataSourceStatus`
   - dashboard data quality panel
   - admin ingestion page
   - Phase 2/6 should make dynamic source health authoritative.

## Scalability Risks

1. Server component rendering can recompute heavy engines.
2. Direct sync local cache readers are convenient but not ideal for multi-instance production.
3. In-process retry queue is sufficient now, but not a durable job queue.
4. No rate-limited public dashboard aggregation cache is evident yet.
5. Correlation return-series memoization is process-local.
6. Browser refresh triggers ingestion/refresh and could be overused if traffic grows.

## Security And Ops Findings

Positive:

- Supabase service role is server-only.
- Cron endpoint can be protected by `INGESTION_CRON_SECRET`.
- Missing API keys are surfaced rather than replaced by fake values.
- Environment report does not expose secret values.

Risks:

- `/api/v1/environment` and source-health endpoints expose operational detail. They should be protected or admin-scoped before public deployment.
- Public dashboard currently includes operations content. Roadmap says this belongs in `/admin/ops`.
- Need verify production env never sets `CMIP_ALLOW_DEV_FALLBACK=true`.

## Performance Bottlenecks To Watch

1. `src/components/dashboard/panels.tsx` imports many server engines and can recompute all panels on each render.
2. `generateSmartAlerts()` pulls multiple reports internally, and several dashboard panels may call overlapping functions.
3. Correlation engine depends on historical arrays from signal cache; large histories will need bounds.
4. Ingestion normalization and clustering use deterministic in-memory operations over recent events; fine now, but needs bounded query windows.

## Recommended Phase 2 Targets

Phase 2 should be cleanup/foundation, not new intelligence.

Recommended order:

1. Make `CMIP_ALLOW_DEV_FALLBACK` impossible to accidentally use in production.
2. Remove or quarantine `marketSignalSnapshot` legacy constants if unused.
3. Stop neutral score creation from missing critical inputs in base helper paths.
4. Replace static module status where live source health exists.
5. Move public operations/debug panels toward admin-only UI.
6. Keep reusable UI components and existing Supabase persistence intact.

