# Premium Dependency Reduction Report

## مشکل قبلی

در مدل قبلی، نبود CoinGlass، Glassnode، CryptoQuant، Whale Alert یا ETF feed می‌توانست liquidity، derivatives، alert و regime را به حالت `unavailable` ببرد. این رفتار برای یک محصول مبتنی بر منابع رایگان عملی نبود.

## اصلاح انجام‌شده

- منابع پولی/اختیاری از هسته reliability جدا شدند.
- `coreReliability` جدا از `premiumCoverage` محاسبه می‌شود.
- موتورهای liquidity و regime از free/proxy signals استفاده می‌کنند.
- premium missing به‌جای خاموش کردن تحلیل، به‌عنوان limitation و notice نمایش داده می‌شود.
- source config برای منابع اختیاری فقط وقتی کلید env موجود باشد enabled می‌شود.

## محدودیت باقی‌مانده

ماژول‌های deep on-chain، exchange reserves، ETF direct flow و deep derivatives بدون API پولی direct نیستند. خروجی آن‌ها باید `unavailable` یا `premium disabled` بماند، نه fake.

