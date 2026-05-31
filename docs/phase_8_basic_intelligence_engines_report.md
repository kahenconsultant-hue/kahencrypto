# Phase 8 — Basic Working Intelligence Engines Report

## Scope

Phase 8 implemented a deterministic intelligence layer on top of the existing ingestion, reliability, freshness, liquidity, regime, sentiment and asset-impact systems.

No fake market data, fake ETF flows, fake whale data, fake confidence scores, or trading signals were introduced.

## Implemented

- Added `src/server/analytics/risk-engine.ts`.
- Added `src/server/analytics/basic-intelligence-engine.ts`.
- Added dashboard-service adapters:
  - `getDashboardRiskReport()`
  - `getDashboardBasicIntelligence()`
- Added `/api/v1/overview` payload fields:
  - `basicIntelligence`
  - `risk`
- Added public dashboard panel:
  - `نمای پایه هوش بازار`

## Engine Coverage

### Regime Engine v1

Existing `market-regime-engine.ts` remains the source of regime intelligence.

It already outputs:

- current regime
- regime confidence
- transition probability
- dominant drivers
- invalidation signals
- confidence detail
- data quality

### Liquidity Engine v1

Existing `liquidity-engine.ts` remains the source of liquidity intelligence.

It already separates:

- macro liquidity
- crypto liquidity
- real spot liquidity
- leveraged liquidity
- liquidity sustainability
- leverage stress

### Risk Engine v1

New `risk-engine.ts` calculates:

- risk score
- risk level
- dominant pressure
- uncertainty level
- pressure breakdown
- asset-level risk map
- confidence based on real/proxy signal coverage

Pressure dimensions:

- macro
- liquidity
- leverage
- volatility
- sentiment
- data quality

### Basic Intelligence Engine v1

New `basic-intelligence-engine.ts` aggregates:

- regime
- liquidity state
- risk level
- dominant pressure
- uncertainty
- confidence dispersion
- asset map
- invalidation conditions
- monitoring list
- data warnings

## Runtime Verification Snapshot

Runtime output after implementation:

```json
{
  "risk": {
    "score": 23,
    "level": "low",
    "dominant": "liquidity",
    "uncertainty": "moderate",
    "confidence": 49,
    "status": "delayed"
  },
  "basic": {
    "status": "delayed",
    "regime": "Neutral / Transition",
    "liquidity": "neutral_mixed",
    "risk": "low",
    "confidence": 51,
    "assetRows": 8
  }
}
```

The output is intentionally conservative because some macro proxy inputs are delayed and premium data remains unavailable.

## Public UI

The new dashboard panel shows:

- base risk score
- dominant pressure
- regime
- global confidence
- invalidation conditions
- monitoring variables
- quick asset risk map
- data warnings

This is not a trading signal panel.

## Rules Enforced

- No unavailable metric is converted into a fake score.
- No trading signal, entry, exit, leverage, or profit claim is generated.
- Risk confidence is calculated from real/proxy signal coverage and freshness.
- Data quality risk is included explicitly instead of hidden.
- Missing premium data lowers confidence or creates warnings; it does not fabricate unavailable signals.

## Validation

Completed:

- `npm run typecheck` passed after adding the engines and dashboard integration.
- Runtime `npx tsx` engine check passed.
- `npm run lint` passed.
- `npm run build` passed after stopping the dev server and rebuilding `.next` cleanly.
- Local smoke test for `/` returned `200 OK`.
- Local smoke test for `/api/v1/overview` returned `200 OK`.

Notes:

- First dev-server requests after the clean build took longer because Next.js recompiled the route tree.
