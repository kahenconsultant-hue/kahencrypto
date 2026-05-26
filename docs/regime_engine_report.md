# C.M.I.P Market Regime Engine Report

Generated: 2026-05-25

## Existing engine retained

The existing regime engine already includes:

- multi-layer scoring
- risk-on confirmation gates
- contradiction penalties
- liquidity penalties
- leverage penalties
- data quality penalties
- regime nuance levels
- transition analysis

## Hardening added

- Removed the hardcoded previous regime assumption from runtime output.
- The engine no longer reports a fake regime change from `Neutral / Transition`.
- Confidence is now allowed to be weak but nonzero when enough groups exist and stale data caps apply.
- Regime output is constrained by reliability confidence caps.

## Current state

- regime: `Neutral / Transition`
- confidence: `34%`
- changed last 24h: `false`
- available groups: price, macro, volatility, stablecoins, liquidity, leverage, sentiment, geopolitical
- missing group: flows

## Interpretation

The engine has enough data to describe a transitional regime but not enough to produce a high-confidence macro regime call. Missing ETF and source-health issues prevent a stronger classification.

## Important behavior

Risk-On Expansion is not allowed unless liquidity, DXY, leverage and crypto confirmation align. This prevents Nasdaq from overpowering contradictory macro/liquidity conditions.
