# C.M.I.P Smart Alert Engine Report

Generated: 2026-05-25

## What changed

The alert engine was refactored from a foundation-only data-quality alert into a multi-factor alert engine.

Current alert types implemented:

- Data Quality Alert
- Dollar Pressure Alert
- Liquidity Alert
- Leverage Trap Alert
- Correlation Breakdown Alert
- Weak Rally Alert
- Regime Shift Alert

## Multi-factor rules

Alerts are generated only when multiple independent conditions are met.

Examples:

- macro pressure requires DXY, US10Y, Nasdaq and BTC conditions.
- liquidity pressure requires liquidity score, stablecoin/spot weakness and macro pressure.
- leverage trap requires funding, open interest, futures volume, spot volume and real spot liquidity.
- correlation breakdown requires a numeric correlation shift plus volatility confirmation.

## Current runtime output

Only one alert is active:

- `Data Quality Alert`

Reason:

- overall reliability is `0.64`
- status is `critical`
- US Treasury RSS, FRED API and CoinGlass API are missing or failed
- ETF/on-chain flow coverage is degraded

This is correct behavior. The engine did not fabricate market alerts from incomplete data.

## Persistence

`smart_alerts` table currently has `0` rows. Alerts are generated dynamically for the dashboard and API. Persisting approved alert snapshots should be a later worker step.
