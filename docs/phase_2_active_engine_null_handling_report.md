# Phase 2 Active Engine Null Handling Report

Date: 2026-05-29

Scope: second surgical Phase 2 cleanup slice. No new collectors, no AI intelligence, no persistence rewrite and no dashboard redesign.

## Objective

Remove the most visible active-engine paths where unavailable or estimated data was still being converted into neutral-looking zero values.

In C.M.I.P, `0` can be a real neutral market reading. It must not silently mean “data missing”.

## Changed

| Area | File | Change |
|---|---|---|
| Liquidity inputs | `src/server/analytics/liquidity-engine.ts` | `signalValue()` now rejects `unavailable` and `estimated` signals instead of passing their values into scoring. |
| Liquidity decomposition | `src/server/analytics/liquidity-engine.ts` | Real spot liquidity, leveraged liquidity and liquidity sustainability now remain undefined when inputs are missing, so UI can show `ناموجود`. |
| Liquidity state detection | `src/server/analytics/liquidity-engine.ts` | V2 liquidity state logic now requires available component scores before classifying squeeze, overheating, weak participation rally or healthy expansion. |
| Liquidity bias labels | `src/server/analytics/liquidity-engine.ts` | Missing stablecoin or ETF scores now produce `mixed` rather than fake neutral. |
| Regime inputs | `src/server/analytics/market-regime-engine.ts` | Regime input values now reject `unavailable` and `estimated` signals. Missing crypto momentum no longer becomes zero momentum. |
| Regime penalties | `src/server/analytics/market-regime-engine.ts` | Risk-on penalties now require real DXY/liquidity data; missing correlations no longer count as unstable correlations. |
| Asset impact inputs | `src/server/analytics/asset-impact-engine.ts` | Asset trend, macro drivers, flow drivers and volatility inputs now pass through a usable-signal gate. |
| Asset impact output | `src/server/analytics/asset-impact-engine.ts` | If confidence is unavailable, asset cards now show no score, no directional thesis, and explicit missing-data text. |
| Public metric tones | `src/components/dashboard/panels.tsx` | Macro, liquidity and ETF widgets no longer color missing values as bullish/bearish by falling back to zero. |

## Remaining Known Cleanup Debt

These files still contain scoped `?? 0` behavior and need separate review before Phase 2 closes:

- `src/server/analytics/derived-signal-engine.ts`
- `src/server/analytics/divergence-engine.ts`
- `src/server/alerts/smart-alert-engine.ts`
- `src/server/analytics/correlation-engine.ts`
- `src/server/analytics/scoring-engine.ts`
- some required numeric fields in `LiquidityEngineOutput` still carry compatibility zeros until the shared output type is migrated to nullable scores.

## Rule Enforced By This Slice

If a dashboard module has missing data, public UI should show:

`ناموجود` / `داده کافی برای تحلیل معتبر وجود ندارد`

instead of visually implying:

`0 = neutral signal`

