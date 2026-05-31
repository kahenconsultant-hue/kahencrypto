# Phase 7 — Confidence Engine Fix Report

## Scope

Phase 7 focused on removing mechanical confidence behavior from public intelligence outputs.

No ingestion, AI, regime, alert, or correlation feature expansion was added in this phase.

## Implemented

- Reworked confidence freshness handling in `src/server/analytics/scoring-engine.ts`.
- Reworked freshness penalties and caps in `src/server/analytics/adaptive-confidence-engine.ts`.
- Removed the universal stale-data collapse where many modules converged mechanically around `35%`.
- Added progressive confidence decay based on:
  - average age of usable signals
  - delayed signal ratio
  - stale signal ratio
  - oldest usable signal age
  - unavailable signal penalty
  - insufficient sample penalty
  - signal disagreement cap
- Updated asset impact confidence to use asset-specific signal baskets instead of the whole global snapshot.
- Added separate confidence input maps for:
  - BTC
  - ETH
  - SOL
  - USDT
  - DXY
  - Gold
  - Nasdaq
  - US10Y
- Added asset-specific required signal groups.
- Added asset-specific market confirmation logic.
- Added regime-transition penalty into asset-impact confidence.

## Why This Matters

Before this phase, the asset impact map used the same global signal snapshot for every asset.

That caused BTC, ETH, SOL, USDT, DXY, Gold, Nasdaq and US10Y to frequently show identical confidence values even when their actual signal coverage and freshness differed.

Now confidence is calculated from the signal coverage that matters for each asset.

## Confidence Diversity Check

Runtime check after the change:

| Asset | Confidence | Label | Available groups |
| --- | ---: | --- | ---: |
| BTC | 40 | limited | 8 |
| ETH | 48 | limited | 7 |
| SOL | 60 | moderate | 8 |
| USDT | 69 | moderate | 5 |
| DXY | 23 | weak | 5 |
| Gold | 28 | weak | 5 |
| Nasdaq | 32 | weak | 4 |
| US10Y | 28 | weak | 5 |

Unique confidence scores: `7`.

Confidence range: `23%` to `69%`.

## Rules Enforced

- Missing or estimated signals still do not create confidence.
- Stale data lowers confidence, but no longer forces every output into one static number.
- Asset confidence must reflect each asset's own signal basket.
- Low-confidence outputs remain visible as low-confidence, not upgraded artificially.
- Macro drivers such as DXY, Gold, Nasdaq and US10Y are assessed as market drivers, not crypto assets.

## Remaining Known Limits

- Some macro proxy inputs are delayed by market/session availability, so DXY, Gold, Nasdaq and US10Y confidence remains weak.
- ETF flow and exchange reserve inputs remain unavailable unless optional premium/direct sources are configured.
- This phase does not yet implement advanced probabilistic regime confidence. That belongs to later roadmap phases.

## Validation

Completed:

- `npx tsx` confidence diversity check passed.
- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run build` passed after stopping the dev server and rebuilding `.next` cleanly.
- Local smoke test for `/` returned `200 OK`.
- Local smoke test for `/api/v1/overview` returned `200 OK`.

Notes:

- First dev-server requests after the clean build took longer because Next.js recompiled the route tree.
