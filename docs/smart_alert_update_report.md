# Smart Alert Update Report

## تغییر اصلی

Alert engine اکنون proxy-aware است و از یک headline منفرد هشدار جدی نمی‌سازد. هشدارها باید حداقل دو سیگنال هم‌راستا داشته باشند یا به‌عنوان data/premium notice ثبت شوند.

## Alertهای جدید

- `macro_pressure_proxy_alert`
- `liquidity_proxy_alert`
- `stablecoin_pressure_alert`
- `volatility_expansion_alert`
- `risk_off_transition_alert`
- `risk_on_recovery_alert`
- `data_degradation_alert`
- `premium_data_missing_notice`

## رفتار premium missing

نبود CoinGlass/Glassnode/ETF/Whale Alert یک notice می‌سازد، نه هشدار بازار جعلی.

