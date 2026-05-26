# Processing Model Update

## جریان جدید پردازش

1. free data ingestion
2. raw event/metric persistence
3. normalization and clustering
4. derived signal generation
5. reliability calculation
6. proxy-aware liquidity/regime analysis
7. multi-signal alert generation
8. dashboard/API rendering with source type and limitations

## قانون عدم جعل

هیچ خروجی نباید ETF flow، whale activity، exchange reserve، correlation یا confidence را جعل کند. اگر داده مستقیم نیست، خروجی با `proxy` یا `unavailable` مشخص می‌شود.

## اثر روی dashboard

Dashboard دیگر به‌خاطر نبود premium source خالی نمی‌شود. بخش‌هایی که با proxy کار می‌کنند، confidence پایین‌تر و توضیح محدودیت دارند.

