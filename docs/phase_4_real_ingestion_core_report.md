# Phase 4 Real Ingestion Core Report

Generated: 2026-05-30

## Scope

Phase 4 upgraded the real ingestion core without changing dashboard behavior or adding AI intelligence. The goal was to replace weak/demo ingestion assumptions with real public data collection, retry-safe source health, and honest degradation.

## Code changes

- Added `exchange_market` parser support for real public exchange REST ingestion.
- Added `binance-public-rest` and `bybit-public-rest` as independent source-health tracked collectors.
- Added `html_listing` parser support for official public listing pages when RSS is not available.
- Moved US Treasury from a broken RSS URL to the official public press-release listing fallback.
- Added The Block RSS to the core free crypto media collector set.
- Registered Reuters as disabled licensed feed instead of pretending a free realtime feed exists.
- Disabled CryptoSlate by default after live verification returned HTTP 403.
- Narrowed the public macro/liquidity adapter to free/direct/proxy inputs only; optional ETF and exchange reserve metrics no longer degrade the core source.
- Extended source metadata persistence with `signalKeys` so narrowed signal scopes are auditable.
- Hardened RSS parsing with Atom entry support.

## Active source model

Core free ingestion now runs with 13 enabled sources:

- `cmip-public-market-signal-adapters`
- `binance-public-rest`
- `bybit-public-rest`
- `fed-press-rss`
- `ecb-press-rss`
- `treasury-press-rss`
- `sec-press-rss`
- `coindesk-rss`
- `theblock-rss`
- `cointelegraph-rss`
- `cnbc-markets-rss`
- `decrypt-rss`
- `blockworks-rss`

Non-blocking disabled sources:

- `reuters-licensed-feed`
- `cryptoslate-rss`
- `fred-api`
- `trading-economics-api`
- `whale-alert-api`
- `coinglass-api`
- `glassnode-api`
- `cryptoquant-api`

## Latest verification

Manual run:

```bash
CMIP_BASE_URL=http://127.0.0.1:3004 npm run ingest:once
```

Result:

- `runId`: `0651efe6-8594-495e-8f9f-efb81053babb`
- `storageMode`: `supabase`
- `pulledEvents`: 259
- `pulledMetrics`: 40
- `successfulSources`: 13
- `degradedSources`: 0
- `failedSources`: 0
- `deadLetters`: 0

## Source verification details

| Source | Status | Output |
| --- | --- | ---: |
| C.M.I.P public macro and liquidity adapters | success | 10 metrics |
| Binance public REST | success | 15 metrics |
| Bybit public REST | success | 15 metrics |
| Federal Reserve RSS | success | 20 events |
| ECB RSS | success | 15 events |
| US Treasury public press releases | success | 16 events |
| SEC public press releases | success | 25 events |
| CoinDesk RSS | success | 25 events |
| The Block RSS | success | 19 events |
| Cointelegraph RSS | success | 30 events |
| CNBC Markets RSS | success | 30 events |
| Decrypt RSS | success | 39 events |
| Blockworks RSS | success | 40 events |

## Remaining boundaries

- This phase does not build new AI, regime, correlation, or alert logic.
- ETF flows, whale activity, Glassnode/CryptoQuant exchange reserves, and Reuters realtime remain unavailable unless configured through licensed/API-key sources.
- Treasury listing timestamps are fetch-time based because the current listing parser does not extract publication dates from the page. The raw payload marks this explicitly.
