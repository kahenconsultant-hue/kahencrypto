# Phase 12 — Real Correlation Engine

## Scope

Phase 12 upgraded the existing correlation engine instead of replacing it. The engine still uses real historical return series and keeps missing/insufficient series as `null`.

## Added

- Rolling windows already present: `24h`, `7d`, `30d`, `90d`.
- Volatility-adjusted 30D correlation.
- 30D beta-adjusted relationship.
- Correlation stability score.
- Structural break detection across 7D/30D/90D.
- Lead-lag estimation using 1h intraday data when enough points exist, otherwise 1D daily data.
- Regime channel classification:
  - `risk_beta_channel`
  - `dollar_pressure_channel`
  - `rates_pressure_channel`
  - `hedge_macro_channel`
  - `stablecoin_liquidity_channel`
  - weak/no-directional variants
- `narrativeAllowed` guard: directional interpretation is blocked when the usable correlation magnitude is below `0.20`.
- `statisticalStrength` classification: `insufficient`, `weak`, `moderate`, `strong`.

## Alert Integration

Correlation indicators now increase alert confidence only when:

- the pair is available,
- the engine marks `narrativeAllowed = true`,
- the selected correlation magnitude is at least `0.20`.

Weak or unavailable correlations are passed as missing confirmation and do not increase confidence.

## UI / Admin Integration

- Public correlation cards now show:
  - narrative permission,
  - structural break state,
  - stability score,
  - beta,
  - regime channel,
  - lead-lag interpretation.
- Data Health correlation table now includes:
  - 90D correlation,
  - stability score,
  - lead-lag,
  - 90D observation count.

## Guardrails

- No fake correlations are generated.
- Missing series remain `null`.
- Insufficient samples remain `insufficient_data`.
- Correlation near zero never produces directional narrative.

