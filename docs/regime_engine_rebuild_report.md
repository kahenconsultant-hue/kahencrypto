# Regime Engine Rebuild Report

## تغییر اصلی

Regime engine اکنون با free/proxy inputs کار می‌کند:

- BTC/ETH/SOL trend
- DXY/US10Y/Nasdaq/Gold trend
- macro pressure proxy
- liquidity proxy
- volatility proxy
- stablecoin liquidity signal
- recent macro/news events

## Regimeهای proxy

- `risk_on`
- `risk_off`
- `liquidity_expansion_proxy`
- `liquidity_contraction_proxy`
- `macro_pressure`
- `volatility_expansion`
- `leverage_stress_proxy`
- `neutral_mixed`
- `insufficient_core_data`

## قانون

اگر core data کافی باشد، regime با برچسب `proxy` تولید می‌شود. اگر داده premium وجود ندارد، confidence پایین‌تر می‌آید اما regime متوقف نمی‌شود.

