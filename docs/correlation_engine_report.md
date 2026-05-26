# C.M.I.P Correlation Engine Report

Generated: 2026-05-25

## Existing engine retained

The correlation engine already calculates Pearson correlations on log returns and refuses to display values when sample size is insufficient.

Pairs tracked:

- BTC vs Nasdaq
- BTC vs DXY
- BTC vs Gold
- BTC vs US10Y
- ETH vs BTC
- SOL vs BTC
- ETH vs Nasdaq
- SOL vs Nasdaq
- BTC vs VIX
- BTC vs Stablecoin dominance
- BTC vs ETF flows

Windows:

- 24h
- 7d
- 30d
- 90d

## Hardening confirmed

- No fake `+1.00` or `-1.00` correlations are produced.
- Sample size gates remain active.
- Weak correlation narratives are explicitly softened.
- Breakdown alerts require numerical correlation shifts.

## Current limitation

Correlation remains dependent on available historical price series from the signal cache. Some macro series are delayed or stale, so confidence is capped by the reliability engine.

## Next step

Persist correlation snapshots after each scheduled run, then compare against previous stored windows instead of only cache-local history.
