# Proxy Limitations Report

## محدودیت اصلی

Proxy signals جایگزین داده مستقیم نهادی نیستند. آن‌ها از داده‌های رایگان مثل price، volume، stablecoin supply، RSS و macro proxies ساخته می‌شوند.

## محدودیت‌های مشخص

- ETF flow direct بدون منبع معتبر در خروجی اثر مستقیم نمی‌گیرد.
- Whale activity بدون Whale Alert یا داده on-chain معتبر unavailable می‌ماند.
- Exchange reserves بدون Glassnode/CryptoQuant fake نمی‌شود.
- Derivatives عمیق بدون CoinGlass فقط با volume/funding در دسترس یا proxy ساده تخمین محدود دارد.
- RSS sentiment فقط context خبری است، نه proof of positioning.

## قانون خروجی

هر خروجی باید یکی از این source typeها را داشته باشد: `direct`، `derived`، `proxy`، `unavailable`.

