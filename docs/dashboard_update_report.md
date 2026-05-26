# Dashboard Update Report

## بخش‌های اضافه‌شده

- Core Intelligence Status در پنل reliability
- Premium Coverage Status در پنل reliability
- Derived Signals panel
- source type labels: direct / derived / proxy / unavailable
- liquidity و regime با missing premium inputs
- smart alerts با proxy/premium notice

## اصل نمایش

Dashboard نباید به‌خاطر نبود APIهای پولی خالی شود. اگر داده core کافی باشد، خروجی proxy با confidence و limitation نمایش داده می‌شود.

## مسیرهای API

- `/api/v1/overview` اکنون `derivedSignals` را هم برمی‌گرداند.
- `/api/cron/ingest` بعد از ingestion، derived processing را اجرا می‌کند.
- `/api/v1/refresh` همین رفتار را برای refresh دستی دارد.

