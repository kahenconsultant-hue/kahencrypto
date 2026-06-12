# Phase 16 — Causality Layer Report

## Scope

Phase 16 adds a probabilistic causal market graph on top of the existing C.M.I.P signal stack.

No new data source was added. No missing value is inferred. No deterministic forecast is produced.

## Implemented

- Added `causal-market-graph.ts`.
- Added graph output to `/api/v1/overview` as `causalMarketGraph`.
- Added a public RTL dashboard panel: `نقشه علیت بازار`.
- Added module health routing through the existing data-source status system.
- Added a regression test to ensure unsupported paths do not receive fake probability or confidence.

## Causal Channels

The graph currently models:

- US10Y -> macro liquidity
- DXY -> macro liquidity
- macro liquidity -> crypto liquidity
- stablecoin supply -> crypto liquidity
- ETF flows -> institutional demand
- derivatives leverage -> market fragility
- Nasdaq -> risk appetite
- crypto liquidity -> BTC
- macro pressure -> BTC
- crypto liquidity -> ETH/SOL beta
- geopolitical risk -> market risk

## Integrity Rules

- Missing inputs remain missing.
- Unsupported correlation channels are suppressed.
- Edges without usable signals do not receive probability or confidence.
- Weak or unavailable correlation cannot create a directional causal narrative.
- The graph uses normalized signal direction. Positive means supportive for crypto risk; negative means pressure.

## Limitations

- This is an influence graph, not proof of causation.
- ETF, exchange-flow and derivatives gaps reduce confidence or suppress paths.
- The model is snapshot-based and should not be treated as a trade signal.

## Validation

Required checks:

- `npm run typecheck`
- `npm run lint`
- `npm run build`
- local dashboard smoke test
- `/api/v1/overview` contains `causalMarketGraph`

