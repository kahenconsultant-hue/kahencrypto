# Derived Signal Formulas

## Macro Pressure Proxy

`macro_pressure_proxy = 0.32×DXY score + 0.32×US10Y score + 0.24×Nasdaq score + 0.12×Gold hedge adjustment`

تعبیر: DXY و US10Y بالا برای crypto risk assets فشار منفی است، Nasdaq مثبت به نفع risk appetite است، Gold فقط در وضعیت hedge/geopolitical وزن محدود دارد.

## Crypto Liquidity Proxy

`crypto_liquidity_proxy = 0.34×stablecoin supply + 0.22×spot volume + 0.18×BTC trend + 0.13×ETH trend + 0.13×SOL trend`

تعبیر: این مدل نقدینگی کامل نهادی نیست؛ فقط نشان می‌دهد داده‌های رایگان بازار و stablecoin تا چه حد از حرکت کوتاه‌مدت حمایت می‌کنند.

## Leverage Stress Proxy

ورودی‌ها: funding در صورت وجود، open interest در صورت وجود، futures volume، spot volume و شتاب قیمت. نبود funding/OI confidence را کاهش می‌دهد.

## Institutional Risk Appetite Proxy

ورودی‌ها: BTC trend، Nasdaq trend، DXY trend، Gold trend، stablecoin trend و ETF flow اگر موجود باشد. نبود ETF باعث توقف تحلیل نمی‌شود، فقط confidence را کم می‌کند.

## Volatility Regime Proxy

ورودی‌ها: دامنه حرکت BTC/ETH/SOL، volume spike و VIX اگر موجود باشد.

## Stablecoin Liquidity Signal

`stablecoin_liquidity_signal = 0.50×total stablecoin supply + 0.32×USDT supply + 0.18×USDC supply`

