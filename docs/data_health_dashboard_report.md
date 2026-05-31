# C.M.I.P Data Health Dashboard Report

## Scope

Created a dedicated admin route at `/admin/data-health` for operational visibility into data sources, ingestion freshness, market coverage, macro/stablecoin metrics, engine health, alert quality, API logs, platform quality scores and debug payloads.

## Implemented

- Added `src/server/admin/data-health-service.ts` as a server-side aggregation layer.
- Added `src/app/admin/data-health/page.tsx` as the admin dashboard.
- Added an admin console link to `/admin/data-health`.
- The dashboard reads existing collectors, source health snapshots, raw events, raw metrics, ingestion logs, dead letters, storage write reports and current analytics engine outputs.
- No metric is fabricated. Missing fields are displayed as `Missing`, `ناموجود`, or source unavailable.
- Debug mode is query-based via `/admin/data-health?debug=1` and displays raw payloads, mapped fields, transformation steps and final engine inputs.

## Sections

1. Data Sources: status, update time, errors, latency, freshness and coverage for every configured source.
2. Market Data Coverage: BTC, ETH, SOL and USDT coverage for price, volume, market cap, OI, funding, ETF and stablecoin flow fields.
3. News Sources: 24h article count, fetch health and coverage for RSS/news/macro sources.
4. Macro Data: DXY, US10Y, Fed Funds Rate, CPI, PPI and employment data status.
5. Stablecoin Data: USDT, USDC, stablecoin dominance and exchange flow fields.
6. Engine Health: liquidity, correlation, regime and sentiment engine health.
7. Alert Quality Audit: alert inputs, indicator count, confidence and missing data flags.
8. API Logs: last 100 collector/API log entries.
9. Data Quality Score: source reliability, freshness, coverage, engine reliability and overall platform health.
10. Debug Mode: admin-only raw/mapped/pipeline/final-input visibility.

## Data Integrity Rules

- Missing premium inputs remain missing.
- Stale sources are shown as stale/degraded instead of live.
- Alerts generated from fewer than three indicators are explicitly flagged.
- Engine health is driven by input coverage and confidence availability.
- API logs surface failed calls, rate-limit-like errors and missing API key states through existing ingestion logs.

## Validation

- `npm run typecheck` passed.
- `npm run lint` passed.
- Build and smoke test are run after this report in the implementation workflow.
