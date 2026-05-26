# Liquidity Engine Rebuild Report

## تغییر اصلی

Liquidity engine دیگر وابسته به ETF direct flow، exchange reserves یا Glassnode/CryptoQuant نیست. این داده‌ها اگر موجود باشند enrichment هستند؛ اگر نباشند، موتور از proxyهای رایگان استفاده می‌کند.

## ورودی‌های core

- stablecoin supply trend
- BTC spot volume trend
- BTC/ETH/SOL price trend
- DXY trend
- US10Y trend
- Nasdaq/Gold macro context

## خروجی‌ها

- `crypto_liquidity_proxy_score`
- `macro_liquidity_pressure_score`
- `stablecoin_pressure`
- `unavailablePremiumInputs`
- `sourceType: proxy`
- توضیح فارسی درباره محدودیت‌ها

## وضعیت فعلی

موتور liquidity وقتی proxy data قابل استفاده باشد `partial_live` نشان می‌دهد، نه `unavailable`. نبود ETF/exchange reserve فقط به‌عنوان premium input ناموجود گزارش می‌شود.

