# C.M.I.P

Crypto Macro Intelligence Platform

پلتفرم فارسی‌زبان برای تبدیل آشوب اطلاعاتی بازار کریپتو به تحلیل کلان قابل فهم. این محصول سیگنال خرید/فروش، نقطه ورود/خروج، پیشنهاد leverage یا وعده سود ارائه نمی‌دهد؛ خروجی‌ها آموزشی، احتمالی و سناریومحور هستند.

## امکانات اصلی

- داشبورد RTL فارسی با الهام از Bloomberg Terminal و داشبوردهای crypto intelligence
- API-first: همه داده‌های داشبورد از مسیرهای `/api/v1/*` قابل مصرف هستند
- فید خبری با ۱۳ دسته و حداقل ۸ آیتم منتخب برای هر دسته، همراه با اهمیت، زمان، تحلیل و اثر دارایی‌ها
- موتورهای معماری‌شده برای ingestion، AI processing، market regime، smart alerts و dynamic correlation
- صفحات اختصاصی `/assets/btc`، `/assets/eth`، `/assets/sol`، `/assets/usdt`
- مرکز ریسک USDT با مقایسه TRON/ERC20، freeze risk، sanctions risk، custody، premium و mint/burn
- Supabase migration شامل جدول‌های محصول، ایندکس‌ها، RLS و audit trail
- microservice پایتون برای correlation و regime analytics
- payload و widget آماده اتصال به WordPress/headless

## اجرای محلی

```bash
npm install
npm run dev
```

سپس باز کنید:

- App: `http://localhost:3000`
- API overview: `http://localhost:3000/api/v1/overview`
- Widget: `http://localhost:3000/embed/overview`

## ساختار پوشه

```text
src/app                 Next.js App Router pages and API routes
src/components          Layout, dashboard panels, asset pages, admin UI, shadcn-style primitives
src/lib                 Types, development fallback dataset, API response helpers, utilities
src/server              Ingestion, AI pipeline, analytics engines, alerts, Supabase, WordPress adapter
supabase/migrations     PostgreSQL schema, indexes, RLS policies
services/python         Analytics microservices for regime and correlation workers
public/embed-widget.js  Embeddable widget script for external sites
docs                    Architecture, API and deployment notes
```

## API مسیرهای اصلی

- `GET /api/v1/overview`
- `GET /api/v1/news?grouped=true`
- `GET /api/v1/news?category=etf&limit=8`
- `GET /api/v1/assets/btc`
- `GET /api/v1/alerts?minLevel=Important`
- `GET /api/v1/correlations`
- `GET /api/v1/market-regime`
- `GET /api/v1/wordpress`
- `GET /api/cron/ingest`

## نکته داده‌ها

در محیط توسعه، اگر API key خارجی موجود نباشد، سیستم از fallback ساختاریافته با برچسب کیفیت داده استفاده می‌کند. در production، نبود provider معتبر باید به‌صورت `unavailable` نمایش داده شود، نه عدد ساختگی. معماری providerها، migrationها و APIها برای جایگزینی با منابع زنده مثل FRED، Glassnode، CoinGlass، Farside، Tether/Circle و OpenAI آماده شده‌اند.

## Supabase

1. پروژه Supabase بسازید.
2. مقدارهای `.env.example` را در `.env.local` قرار دهید.
3. migration زیر را اجرا کنید:

```bash
supabase db push
```

فایل migration: `supabase/migrations/202605230001_initial_crypto_macro_schema.sql`

## محدودیت حقوقی

در تمام صفحات disclaimer وجود دارد. محصول برای آموزش و هوش بازار است و نباید به عنوان مشاوره سرمایه‌گذاری یا سیگنال معامله استفاده شود.
