# Phase 13 - Liquidity Engine V2

## Scope

Phase 13 upgrades liquidity interpretation without adding new data sources or fabricating unavailable metrics.

The engine now separates liquidity into explicit analytical layers:

- Macro liquidity: DXY and US10Y pressure.
- Real spot liquidity: stablecoins, ETF flow, exchange reserves/flows and spot volume.
- Leveraged liquidity: funding, open interest and futures-vs-spot activity.
- Stablecoin liquidity: 7d/30d stablecoin expansion where available.
- ETF and exchange-flow confirmation: direct data only; missing remains missing.

## New Regime Output

`LiquidityEngineOutput` now includes:

- `liquidityRegimeV2`
- `liquidityRegimeLabelFa`
- `liquidityRegimeConfidence`
- `liquidityLayerScores`
- `liquidityBottlenecks`
- `liquidityConfirmations`
- `liquidityRegimeNarrativeFa`

Supported V2 regimes:

- `supportive`
- `tightening`
- `stressed`
- `fragmented`
- `insufficient_data`

## Integrity Rules

- Supportive liquidity requires multi-layer confirmation.
- Weak spot liquidity plus high leverage is classified as stressed.
- Missing ETF or exchange-flow data cannot become neutral-positive.
- Confidence is capped by data coverage.
- Missing critical flow channels produce bottlenecks, not fake zero values.

## Dashboard Integration

The Liquidity panel now shows a dedicated `رژیم نقدینگی V2` block with:

- regime label
- confidence
- Persian narrative
- confirmations
- bottlenecks

The existing visual identity is preserved.

## Tests Added

Added institutional reasoning tests for:

- multi-layer supportive liquidity
- stressed liquidity under weak spot and high leverage
- fragmented liquidity when ETF/exchange-flow channels are missing or conflicting

## No-Fabrication Confirmation

Phase 13 does not infer ETF flows from volume, does not infer exchange inflows/outflows from prices, and does not create synthetic on-chain values. Missing inputs remain explicitly missing and reduce confidence.
