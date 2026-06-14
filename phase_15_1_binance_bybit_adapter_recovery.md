# Phase 15.1 — Binance / Bybit Market & Derivatives Adapter Recovery

Generated: 2026-06-14

## Scope

This phase restored free public market and derivatives inputs from Binance and Bybit without adding new providers and without generating fake values.

## Endpoint Audit

### Binance

| Metric family | Endpoint | Live audit status | Parser |
| --- | --- | ---: | --- |
| Spot price / spot volume / 24h trend | `https://api.binance.com/api/v3/klines?symbol={SYMBOL}&interval=1h&limit=49` | 200 | Binance kline array parser |
| Spot price / 24h quote volume level | `https://api.binance.com/api/v3/ticker/24hr?symbol={SYMBOL}` | 200 | 24h ticker parser |
| Funding | `https://fapi.binance.com/fapi/v1/premiumIndex?symbol={SYMBOL}` | 200 | `lastFundingRate` parser |
| Open interest trend | `https://fapi.binance.com/futures/data/openInterestHist?symbol={SYMBOL}&period=1h&limit=25` | 200 | `sumOpenInterestValue` trend parser |
| Futures volume trend | `https://fapi.binance.com/fapi/v1/klines?symbol={SYMBOL}&interval=1h&limit=49` | 200 | Futures kline quote-volume trend parser |

Sample parsed Binance metrics after fix:

- `btc_price_usd`: live, Binance spot ticker
- `btc_volume_24h_usd`: live, Binance quote volume
- `funding_btc`: live, Binance Futures funding
- `open_interest_btc_24h`: live, Binance Futures open interest trend
- `futures_volume_btc_24h`: live, Binance Futures volume trend

### Bybit

| Metric family | Endpoint | Live audit status | Parser |
| --- | --- | ---: | --- |
| Spot price / spot volume / 24h trend | `https://api.bybit.com/v5/market/kline?category=spot&symbol={SYMBOL}&interval=60&limit=49` | 200 | Bybit kline parser |
| Funding | `https://api.bybit.com/v5/market/tickers?category=linear&symbol={SYMBOL}` | 200 | `fundingRate` parser |
| Open interest trend | `https://api.bybit.com/v5/market/open-interest?category=linear&symbol={SYMBOL}&intervalTime=1h&limit=25` | 200 | `openInterest` trend parser |
| Futures volume trend | `https://api.bybit.com/v5/market/kline?category=linear&symbol={SYMBOL}&interval=60&limit=49` | 200 | Linear kline turnover trend parser |

Bybit collector bug fixed:

- Before: Bybit produced `open_interest_usd`, which was not consumed by derivatives engines.
- After: Bybit produces `open_interest_change_24h_pct`, matching the engine-required signal mapping.

## Fallback Hierarchy

Implemented hierarchy:

- Market price: Binance spot ticker -> Bybit spot ticker -> CoinGecko
- Market 24h volume: Binance spot quote volume -> Bybit spot turnover -> CoinGecko
- Funding: Binance Futures -> Bybit Linear -> unavailable
- Open interest: Binance Futures -> Bybit Linear -> unavailable
- Futures volume: Binance Futures -> Bybit Linear -> unavailable

No spot endpoint is used for derivatives metrics.

## Signal Mapping

Verified live signal-cache outputs:

| Signal | Status | Source |
| --- | --- | --- |
| `btc_price_usd` | live | Binance spot public 24h ticker |
| `eth_price_usd` | live | Binance spot public 24h ticker |
| `sol_price_usd` | live | Binance spot public 24h ticker |
| `btc_volume_24h_usd` | live | Binance spot quote volume |
| `eth_volume_24h_usd` | live | Binance spot quote volume |
| `sol_volume_24h_usd` | live | Binance spot quote volume |
| `funding_btc` | live | Binance Futures funding |
| `funding_eth` | live | Binance Futures funding |
| `funding_sol` | live | Binance Futures funding |
| `open_interest_btc_24h` | live | Binance Futures open interest trend |
| `open_interest_eth_24h` | live | Binance Futures open interest trend |
| `open_interest_sol_24h` | live | Binance Futures open interest trend |
| `futures_volume_btc_24h` | live | Binance Futures volume |
| `futures_volume_eth_24h` | live | Binance Futures volume |
| `futures_volume_sol_24h` | live | Binance Futures volume |

## Collector Diagnostics

Every exchange raw metric now includes:

- `provider`
- `endpoint`
- `symbol`
- `category` or `futures` when relevant
- `parserSuccess`
- `fallbackUsed`
- `fallbackFor`
- `primaryError`

If the primary provider fails and fallback succeeds, source health becomes degraded instead of failed.

## Verification

### Direct collector run

- `binance-public-rest`: success, 18/18 usable metrics
- `bybit-public-rest`: success, 18/18 usable metrics

### Direct signal-cache run

- BTC/ETH/SOL price and volume available.
- BTC/ETH/SOL funding available.
- BTC/ETH/SOL open interest available.
- BTC/ETH/SOL futures volume available.

### Staged scheduler run

- `runId`: `fa7052cf-9bb6-467e-a805-06284871f0dc`
- `storageMode`: `supabase`
- `failedStage`: `null`
- `market_data`: `success_with_limited_confidence`, 84 metrics
- `fusion`: `success_with_limited_confidence`, 55 metrics
- `deadLetters`: 0

The limited confidence status is from non-blocking optional/premium inputs, not from Binance/Bybit derivatives.

## Validation Commands

- `npm run typecheck`: passed
- `npm run lint`: passed
- `npm run build`: passed

## No Fake Data Confirmation

- No funding value is fabricated.
- No open interest value is fabricated.
- No derivatives volume is fabricated.
- Missing derivatives remain unavailable if Binance and Bybit both fail.

## Production Follow-up Fix

After the first production deployment, the live API showed a cache-retention edge case:

- `dataQuality.byKey` still contained real Binance Futures values.
- `liquidityIntelligence.derivatives` was `missing` because the derivatives engine used a strict 90-minute usability window.
- The signal-cache quality guard retained the previous snapshot wholesale when a newer partial refresh lost some core macro coverage, which could suppress newer usable non-core signals.

Fixes applied:

- Signal-cache retention now merges snapshots instead of replacing the candidate with the entire previous snapshot.
- New usable candidate signals are kept, while previous usable signals are retained only where the candidate is missing or unusable.
- The derivatives liquidity sub-engine now accepts last valid real funding/open-interest/futures-volume inputs for up to 24 hours with `delayed` freshness and a confidence cap.

Production verification after deployment `dpl_GTgyVgN9FsZ6CX965FSgSdKAsrmE`:

| Check | Result |
| --- | --- |
| `/api/v1/overview` status | 200 |
| Overall freshness | fresh |
| Overall health | healthy |
| Binance public REST | degraded, fallback active, fresh source evidence |
| Bybit public REST | degraded, fallback active, fresh source evidence |
| Derivatives Engine | connected |
| Derivatives coverage | 100% |
| Derivatives confidence | 65% |
| Derivatives freshness | delayed |
| Missing derivatives inputs | 0 |
| Forecast snapshots stored | 372 |

Production derivatives values consumed:

- `funding_btc`: `-0.0034`
- `funding_eth`: `-0.0005`
- `funding_sol`: `-0.01`
- `open_interest_btc_24h`: `3.7119`
- `open_interest_eth_24h`: `1.53`
- `open_interest_sol_24h`: `6.0506`
- `futures_volume_btc_24h`: `-33.2951`
- `spot_volume_btc_24h`: available
