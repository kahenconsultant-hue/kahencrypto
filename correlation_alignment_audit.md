# Phase 14.8 — Correlation Alignment Audit

Generated: 2026-06-13

## Scope

Implemented a dedicated `correlation_alignment_engine.ts` for daily cross-market correlation alignment.

No new data source was added.
No synthetic correlation values were introduced.
Unavailable or mathematically invalid correlations remain `null`.

## What Changed

- Normalized persisted market snapshot series into UTC daily close buckets.
- Built aligned daily return datasets from persisted `market_snapshots`.
- Forward-filled macro series only across market-closed weekend days.
- Did not forward-fill across missing weekday observations.
- Recalculated daily correlations from aligned datasets.
- Added `available / required / coverage %` metadata per correlation window.
- Persisted aligned historical datasets as derived `market_snapshots` during the Fusion scheduler stage.
- Added ETH-Nasdaq and SOL-Nasdaq correlation pairs.
- Prevented `available` status when sample count exists but zero variance makes correlation mathematically invalid.

## Target Aligned Pairs

| Pair | Coverage Before | Coverage After | Legacy Usable Observations | Aligned Usable Observations | Latest Aligned Day | 30D Correlation | Confidence |
|---|---:|---:|---:|---:|---|---:|---:|
| BTC-DXY | 30% | 40% | 6 | 8 | 2026-06-13 | null | null |
| BTC-Gold | 30% | 40% | 6 | 8 | 2026-06-13 | null | null |
| BTC-Nasdaq | 30% | 40% | 6 | 8 | 2026-06-13 | null | null |
| BTC-US10Y | 20% | 30% | 4 | 6 | 2026-06-13 | null | null |
| ETH-DXY | 30% | 40% | 6 | 8 | 2026-06-13 | null | null |
| ETH-Nasdaq | 30% | 40% | 6 | 8 | 2026-06-13 | null | null |
| SOL-Nasdaq | 30% | 40% | 6 | 8 | 2026-06-13 | null | null |

## Current Correlation Engine Result

- Valid pairs: 9 / 12
- Overall correlation coverage: 13%
- Engine confidence: 13%
- Engine status: degraded because valid short-window pairs exist, but historical depth is still low.

## Window Coverage Examples

| Pair | 7D Samples | 7D Coverage | 30D Samples | 30D Coverage | 90D Samples | 90D Coverage |
|---|---:|---:|---:|---:|---:|---:|
| BTC-ETH | 7/5 | 100% | 8/20 | 40% | 8/60 | 13% |
| BTC-US10Y | 6/5 | 100% | 6/20 | 30% | 6/60 | 10% |
| BTC-Nasdaq | 7/5 | 100% | 8/20 | 40% | 8/60 | 13% |
| ETH-Nasdaq | 7/5 | 100% | 8/20 | 40% | 8/60 | 13% |
| SOL-Nasdaq | 7/5 | 100% | 8/20 | 40% | 8/60 | 13% |

## Interpretation

The timestamp alignment issue is reduced: cross-market pairs now have more usable daily observations because macro series are aligned to UTC day buckets and weekend market closures are handled explicitly.

The engine still cannot produce 30D or 90D directional conclusions because the persisted local historical depth currently contains about 6-8 aligned daily observations for these pairs. This is a data-history limitation, not an alignment failure.

## Guardrails

- Cross-market 24H correlations remain disabled because hourly crypto returns must not be mixed with daily macro data.
- Daily macro forward-fill is limited to weekend market closures.
- Weekday gaps are not filled.
- Correlation confidence is capped by available coverage and statistical strength.
- Weak or zero-variance relationships do not generate directional narratives.

## Remaining Work

Let the production scheduler accumulate more daily snapshots. Once 20+ aligned daily returns exist, 30D correlations can become valid. Once 60+ aligned daily returns exist, 90D correlations can become valid.

