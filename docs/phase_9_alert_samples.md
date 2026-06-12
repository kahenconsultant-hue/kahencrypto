# Phase 9 Alert Samples

Generated: 2026-06-01

## Active Alert 1

### `stablecoin-pressure-proxy-alert`

- Type: `stablecoin_pressure_alert`
- Priority: `medium`
- Level: `Watch`
- Direction: `bearish`
- Timeframe: `7d`
- Confidence: `55`
- Indicator count: `4`
- TTL: `4320` minutes
- Operational: `false`

### Persian Title

فشار نقدینگی استیبل‌کوین در داده‌های رایگان دیده می‌شود

### Persian Reasoning

عرضه استیبل‌کوین‌ها حمایتی نیست و می‌تواند نشانه کاهش ظرفیت خرید نقدی باشد.

### Data Used

| Indicator | Status | Source |
| --- | --- | --- |
| `stablecoin_market_cap_7d` | available | DefiLlama stablecoin market cap chart |
| `usdt_supply_7d` | available | DefiLlama USDT circulating supply |
| `usdc_supply_7d` | available | DefiLlama USDC circulating supply |
| `btc_etf_flow_24h` | missing | BTC ETF flow adapter |
| `eth_etf_flow_24h` | missing | ETH ETF flow adapter |
| `exchange_inflows` | missing | Exchange flow adapter |
| `exchange_outflows` | missing | Exchange flow adapter |
| `correlation:BTC ↔ Stablecoin Market Cap` | missing | Binance spot public klines BTCUSDT + DefiLlama stablecoin market cap chart |
| `correlation:BTC ↔ DXY` | available | Binance spot public klines BTCUSDT + FRED DTWEXBGS |

### Severity Reason

شدت بر اساس ضعف عرضه استیبل‌کوین، وضعیت پروکسی نقدینگی و تأیید همبستگی BTC با DXY/Stablecoin تعیین شده است. اطمینان در محدوده متوسط است و حداقل چهار شاخص واقعی این سناریو را پشتیبانی می‌کنند. ETF Flow و Exchange Flow در دسترس نیستند؛ سیگنال نقدینگی با سقف اطمینان محدود می‌شود. سقف اطمینان: 55٪.

### Confidence Cap

ETF Flow و Exchange Flow در دسترس نیستند؛ سیگنال نقدینگی با سقف اطمینان محدود می‌شود. سقف اطمینان: 55٪.

## Active Alert 2

### `premium-data-missing-notice`

- Type: `premium_data_missing_notice`
- Priority: `low`
- Level: `Info`
- Direction: `mixed`
- Timeframe: `7d`
- Confidence: `50`
- Indicator count: `0`
- TTL: `180` minutes
- Operational: `true`

### Persian Title

پوشش داده‌های پریمیوم محدود است

### Persian Reasoning

نبود CoinGlass، Glassnode، CryptoQuant، Whale Alert یا ETF مستقیم دیگر کل تحلیل را متوقف نمی‌کند؛ فقط ماژول‌های enrichment و confidence آن‌ها محدود می‌شود.

### Severity Reason

شدت این هشدار عملیاتی است و بر اساس سلامت منبع، تازگی داده و پوشش ورودی‌ها تعیین شده؛ پیام آن درباره کیفیت تحلیل است، نه جهت بازار.

## Suppression Behavior

During this QA run, macro, leverage, volatility, geopolitical, correlation-breakdown, and regime-shift alerts were not emitted because their trigger conditions were not simultaneously satisfied by current real/proxy signals. This is expected behavior and avoids static alert noise.
