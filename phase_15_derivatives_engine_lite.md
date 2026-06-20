# C.M.I.P Derivatives Engine Lite

## Scope

- Mode: `lite_public_exchange_api`
- Assets: BTC, ETH, TRX, TON, SOL, XRP, DOGE, BNB, ADA
- USDT: not applicable
- Provider order: Binance USD-M Futures, Bybit V5 Linear, OKX USDT perpetual swaps
- No CoinGlass dependency, page scraping, synthetic values, or total-market liquidation claims

## Official endpoints

### Binance

- `/fapi/v1/exchangeInfo`
- `/fapi/v1/fundingRate`
- `/fapi/v1/openInterest`
- `/futures/data/openInterestHist`
- `/futures/data/globalLongShortAccountRatio`

### Bybit

- `/v5/market/instruments-info`
- `/v5/market/funding/history`
- `/v5/market/tickers`
- `/v5/market/open-interest`
- `/v5/market/account-ratio`

### OKX

- `/api/v5/public/instruments`
- `/api/v5/public/funding-rate-history`
- `/api/v5/public/open-interest`
- `/api/v5/rubik/stat/contracts/open-interest-history`
- `/api/v5/rubik/stat/contracts/long-short-account-ratio`

## Runtime behavior

Symbol availability is discovered before metric requests. A provider is skipped when discovery fails or a contract is absent. Funding and OI can fall back independently. Missing optional long/short or liquidation evidence does not fail the engine.

The collector stores numeric signal fields for latest funding, 24h/7d funding averages, latest OI, OI USD value, 24h/7d OI changes, and long/short ratio. The public layer derives leverage risk, bias, confidence, missing fields, source, and timestamp from the shared signal cache.

## Confidence controls

- Funding + OI, Binance: maximum 70
- Funding + OI, fallback provider: maximum 65
- Funding only or OI only: maximum 45
- Long/short confirmation: maximum 75
- Liquidation confirmation: maximum 80
- Lite hard cap: 80
- Data older than 15 minutes: maximum 45
- Fewer than three fresh major assets: market bias and market risk unavailable, market confidence maximum 40

## Live local verification

The direct collector discovered all nine eligible Binance perpetual contracts. Funding, current OI, 24h OI change, 7d OI change, and account ratio were available for every asset. No rate-limit event or hard asset failure occurred. Liquidation remained unavailable by design because a persistent public WebSocket consumer is not active.

One staged ingestion completed with:

- runId: `6b312d66-e589-4b62-91a4-0801f4e6088a`
- failedStage: `null`
- Fusion metrics: 115
- stale signals: 2
- derivatives collection: operational

The unrelated ETF stage reached its existing 20-second timeout; Fusion continued with limited confidence.

## Validation

- Typecheck: passed
- Lint: passed
- Tests: 75/75 passed
- Production build: passed
- SSR smoke test: HTTP 200; public derivatives section present
- Desktop layout: no page-level horizontal overflow
- Mobile layout: no page-level horizontal overflow; wide evidence table remains container-scoped
