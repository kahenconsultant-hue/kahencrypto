# Reliability Model Update

## مدل جدید

Reliability به دو بخش جدا تقسیم شد:

- `coreReliability`: سلامت تحلیل پایه بر اساس free market data، stablecoin data، macro proxy، RSS و freshness.
- `premiumCoverage`: پوشش منابع غنی‌ساز مثل CoinGlass، Glassnode، CryptoQuant، Whale Alert، ETF direct feeds و داده نهادی.

## رفتار جدید

اگر premium coverage پایین باشد، ماژول‌های premium غیرفعال یا محدود می‌شوند، اما core intelligence خاموش نمی‌شود. خروجی dashboard حالت `analysisMode` را نشان می‌دهد:

- `direct_core_data`
- `free_data_plus_proxies`
- `degraded_core_data`
- `insufficient_core_data`

## نتیجه

سیستم اکنون می‌تواند با free-data-plus-proxies کار کند و در عین حال محدودیت‌ها را صریح نشان دهد.

