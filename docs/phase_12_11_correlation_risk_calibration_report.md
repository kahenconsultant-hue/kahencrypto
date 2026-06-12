# Phase 12.11 — Correlation & Risk Calibration

Date: 2026-06-04

## Scope

No new data sources, dashboards, or analytics engines were added. This pass only recalibrated existing correlation, risk, ETF freshness, Data Health counting, sentiment weighting, and integrity validation behavior.

## Files changed

- `src/server/analytics/correlation-engine.ts`
- `src/server/analytics/risk-engine.ts`
- `src/server/analytics/sentiment-engine.ts`
- `src/server/analytics/intelligence-integrity-engine.ts`
- `src/server/data/farside-etf.ts`
- `src/server/admin/data-health-service.ts`
- `src/app/admin/data-health/page.tsx`
- `src/lib/types.ts`
- `tests/analytics-self-check.test.ts`

## Tests added

- ETF freshness consistency uses the shared market-day resolver.
- Risk floor: liquidity below 25 plus ETF below 30 plus stablecoin below 40 forces risk score to at least 50.
- Cross-market correlation 24h window cannot mix hourly crypto with daily macro data.
- Source health counts are separated into critical core, all active, optional/premium, degraded, and disabled.
- Pure geopolitical news is capped by the 10% sentiment bucket and cannot dominate crypto sentiment alone.
- Missing exchange inflows/outflows remain unavailable and are not fabricated.

## Correlation alignment before / after

Before:
- The correlation engine could select intraday frequency for every 24h pair.
- Cross-market pairs such as BTC/DXY and BTC/US10Y risked mixing hourly crypto returns with daily macro/proxy series.

After:
- 24h correlation is enabled only for crypto-only pairs: BTC/ETH, BTC/SOL, ETH/SOL.
- Cross-market pairs use daily-aligned windows only for 7d, 30d, and 90d.
- Each correlation row now carries internal window metadata:
  - window
  - frequency
  - observations used
  - missing observations
  - minimum observations
  - last aligned timestamp
  - source pair
  - status

Current Correlation Engine:
- Status: connected
- Input coverage: 90%
- Engine score: 44.9

## Risk score before / after

Before:
- Risk could remain too low when liquidity was stressed because the composite score was allowed to average pressure away.

After:
- Risk floors are enforced:
  - Liquidity < 25 => risk >= 40
  - Liquidity < 25 and ETF < 30 => risk >= 45
  - Liquidity < 25 and ETF < 30 and stablecoin < 40 => risk >= 50
- Missing exchange flows now raise uncertainty and are explicitly described as unavailable, not used to reduce risk.

Observed overview after calibration:
- Risk score: 45

## ETF freshness before / after

Before:
- ETF freshness could differ by module because generic minute-based stale logic was still reachable.
- The shared resolver treated exactly 3 US market days as delayed because fresh was `< 3`.

After:
- Shared ETF resolver is authoritative.
- Fresh: latest ETF date within 3 US market days.
- Delayed: 3-7 US market days.
- Stale: older than 7 US market days.
- Integrity and alerts now use the same resolver instead of generic 90-minute freshness logic.

## Data Health counts before / after

Before:
- Top-level Data Health only showed connected/total sources, which could conflict with critical-source counts elsewhere.

After:
- Counts are separated:
  - Critical Core Sources
  - All Active Sources
  - Optional/Premium Active
  - Degraded Sources
  - Disabled Sources

Current counts:
- Critical Core Sources: 2/4
- All Active Sources: 11/15
- Optional/Premium Active: 3/11
- Degraded Sources: 4
- Disabled Sources: 8

## Sentiment category weights before / after

Before:
- Final market sentiment was an average of accepted headlines. Geopolitical news could overpower crypto-native news when it dominated the accepted sample.

After:
- Final sentiment is bucket weighted:
  - Crypto-native: 40%
  - Macro: 20%
  - Institutional: 15%
  - Regulatory: 15%
  - Geopolitical: 10%
- Geopolitical items without direct crypto, stablecoin, exchange, sanctions, capital-control, or crypto-rail linkage are capped at relevance 60.
- Administrative Fed/Treasury notices are capped at 35 unless directly tied to rates, liquidity, sanctions, stablecoins, or crypto regulation.
- Category concentration is disclosed when one bucket dominates the accepted sample.

Observed overview after calibration:
- Sentiment score: -23

## Integrity violations fixed

- Liquidity stress cannot coexist with low risk without a validator violation.
- Risk score floor violations are detected.
- ETF freshness consistency uses one resolver.
- Weak/insufficient correlation cannot generate directional narrative.
- Sentiment category concentration is disclosed.
- Low-quality alerts remain downgraded by existing alert integrity rules.

## Final scores

- Platform Health: 61/100
- Production Readiness: 58/100
- Analytics Quality: 63/100
- Operational Reliability: 51/100
- Data Coverage: 73/100

These scores are intentionally conservative. Operational reliability and critical-source coverage still cap production readiness.

## Validation

Passed:
- `npm run typecheck`
- `npx tsx --test tests/analytics-self-check.test.ts`
- `npm run lint`
- `npm run build`
- Local smoke test for `/`, `/api/v1/overview`, and `/admin/data-health`

Smoke test result:
- `/`: HTTP 200, C.M.I.P present, no runtime error.
- `/api/v1/overview`: HTTP 200, risk/sentiment/correlation fields available.
- `/admin/data-health`: HTTP 200, Data Health content present, no runtime error.
