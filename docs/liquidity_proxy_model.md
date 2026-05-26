# Liquidity Proxy Model

## Macro Liquidity Pressure

DXY و US10Y با وزن معکوس برای crypto risk assets استفاده می‌شوند. رشد دلار یا نرخ بهره فشار نقدینگی محسوب می‌شود.

## Crypto Liquidity Proxy

از stablecoin supply، volume و trend دارایی‌های اصلی ساخته می‌شود. اگر stablecoin expansion و spot volume هم‌زمان مثبت باشند، مدل حمایت نقدینگی را قوی‌تر می‌خواند.

## Premium Inputs

ETF flows، exchange reserves و deep on-chain در صورت نبود داده، صفر فرض نمی‌شوند. آن‌ها در `unavailablePremiumInputs` ثبت می‌شوند.

## Confidence

Confidence از availability، reliability، freshness و missing premium penalty ساخته می‌شود و نباید با impact score یکی گرفته شود.

