# Source Restructure Report

## تغییر راهبرد

معماری منبع داده از مدل «وابسته به APIهای پریمیوم» به مدل «هسته رایگان + غنی‌سازی اختیاری» تغییر کرد. در این مدل، منابع رایگان و عمومی مسئول ساخت تحلیل پایه هستند و منابع پولی فقط کیفیت/عمق برخی ماژول‌ها را افزایش می‌دهند.

## طبقه‌بندی جدید

- `core_free`: منبع رایگان و فعال برای تحلیل پایه، مثل C.M.I.P public market signal adapters، Binance/CoinGecko/DefiLlama proxy، Fed RSS، CoinDesk، Cointelegraph، Decrypt، CryptoSlate و Blockworks.
- `free_delayed`: منبع رایگان اما کندتر یا وابسته به RSS/صفحات عمومی، مثل Treasury RSS، SEC و CNBC RSS.
- `api_key_optional`: منبع مفید اما غیرالزامی، مثل FRED، Trading Economics، CoinGlass، Glassnode، CryptoQuant و Whale Alert.
- `premium_disabled`: منبع enterprise یا غیرقابل اتکا بدون قرارداد، مثل Bloomberg realtime، Reuters realtime، Nansen، Kaiko و institutional options flow.
- `scraping_fallback`: فقط برای مواردی که API/RSS رسمی وجود ندارد و باید جداگانه با health/rate-limit کنترل شود.

## نتیجه معماری

نبود APIهای اختیاری دیگر باعث خاموش شدن کل platform نمی‌شود. ماژول‌های core با داده مستقیم/derived/proxy کار می‌کنند، confidence را پایین می‌آورند و missing premium coverage را شفاف نمایش می‌دهند.

