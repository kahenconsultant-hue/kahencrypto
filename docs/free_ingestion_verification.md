# Free Ingestion Verification

## وضعیت آخرین اجرای واقعی

آخرین اجرای دستی ingestion با Supabase فعال انجام شد و داده‌ها در جدول‌های runtime ذخیره شدند.

- `runId`: `e104edad-6d59-405b-8d19-5c33c58fd860`
- `pulledEvents`: 185
- `pulledMetrics`: 20
- `rawEventsInserted`: 2
- `rawEventsUpdated`: 183
- `normalizedEventsCreated`: 204
- `eventClustersCreated`: 201
- `duplicatesDetected`: 3
- `failedSources`: 2
- `deadLetters`: 2

## ذخیره‌سازی

خروجی collectors در Supabase ذخیره شد:

- `raw_events`
- `raw_metrics`
- `source_health`
- `ingestion_logs`
- `normalized_events`
- `event_clusters`
- `derived_signals`
- `liquidity_scores`
- `regime_inputs`

## Supabase counts after verification

- `raw_events`: 204
- `raw_metrics`: 240
- `source_health`: 15
- `ingestion_logs`: 132
- `dead_letters`: 54
- `derived_signals`: 12
- `liquidity_scores`: 2
- `regime_inputs`: 2

## تفسیر

سیستم اکنون می‌تواند با منابع رایگان core داده کافی برای proxy analysis تولید کند. خطای منابع RSS یا API اختیاری در `source_health` و `dead_letters` ثبت می‌شود و باعث تولید داده جعلی نمی‌شود.

