# Derived Signal Engine Report

## هدف

`src/server/analytics/derived-signal-engine.ts` برای تولید تحلیل از داده‌های رایگان و ناقص ساخته شد. خروجی‌ها direct institutional data نیستند؛ با برچسب `proxy` یا `derived` ذخیره و نمایش داده می‌شوند.

## سیگنال‌های تولیدشده

- `macro_pressure_proxy`
- `crypto_liquidity_proxy`
- `leverage_stress_proxy`
- `institutional_risk_appetite_proxy`
- `volatility_regime_proxy`
- `stablecoin_liquidity_signal`

## Persistence

هر اجرای ingestion از `/api/cron/ingest` و `/api/v1/refresh` پس از دریافت داده، derived processing را اجرا می‌کند و خروجی‌ها را در جدول‌های زیر ذخیره می‌کند:

- `derived_signals`
- `liquidity_scores`
- `regime_inputs`

