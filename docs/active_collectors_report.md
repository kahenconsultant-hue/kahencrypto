# Active Collectors Report

Generated: 2026-05-30

## Enabled collectors

| Source ID | Source | Type | Parser | Tier | Polling interval | Latest status | Latest rows |
| --- | --- | --- | --- | ---: | ---: | --- | ---: |
| `cmip-public-market-signal-adapters` | C.M.I.P public macro and liquidity adapters | api | market_signals | 1 | 1800s | success | 10 metrics |
| `binance-public-rest` | Binance public REST | api | exchange_market | 1 | 300s | success | 15 metrics |
| `bybit-public-rest` | Bybit public REST | api | exchange_market | 2 | 300s | success | 15 metrics |
| `fed-press-rss` | Federal Reserve RSS | rss | rss | 1 | 600s | success | 20 events |
| `ecb-press-rss` | ECB RSS | rss | rss | 2 | 600s | success | 15 events |
| `treasury-press-rss` | US Treasury public press releases | scraper | html_listing | 1 | 600s | success | 16 events |
| `sec-press-rss` | SEC public press releases | filings | rss | 2 | 900s | success | 25 events |
| `coindesk-rss` | CoinDesk RSS | rss | rss | 2 | 600s | success | 25 events |
| `theblock-rss` | The Block RSS | rss | rss | 2 | 600s | success | 19 events |
| `cointelegraph-rss` | Cointelegraph RSS | rss | rss | 3 | 600s | success | 30 events |
| `cnbc-markets-rss` | CNBC Markets RSS | rss | rss | 2 | 600s | success | 30 events |
| `decrypt-rss` | Decrypt RSS | rss | rss | 3 | 600s | success | 39 events |
| `blockworks-rss` | Blockworks RSS | rss | rss | 3 | 600s | success | 40 events |

## Disabled / non-blocking collectors

| Source ID | Reason |
| --- | --- |
| `reuters-licensed-feed` | Licensed Reuters feed is not scraped or required for core ingestion. |
| `cryptoslate-rss` | Latest public feed verification returned HTTP 403; registered but disabled to avoid noisy dead letters. |
| `fred-api` | Optional `FRED_API_KEY`; macro proxy data keeps core ingestion available. |
| `trading-economics-api` | Optional enrichment; not required for free ingestion core. |
| `whale-alert-api` | Optional enrichment; whale attribution remains unavailable without key. |
| `coinglass-api` | Optional enrichment; Binance/Bybit public data cover basic leverage proxies. |
| `glassnode-api` | Optional deep on-chain enrichment. |
| `cryptoquant-api` | Optional exchange reserve enrichment. |

## Latest real ingestion run

- `runId`: `0651efe6-8594-495e-8f9f-efb81053babb`
- `storageMode`: `supabase`
- `pulledEvents`: 259
- `pulledMetrics`: 40
- `successfulSources`: 13
- `degradedSources`: 0
- `failedSources`: 0
- `deadLetters`: 0

## Scheduler entrypoints

Run once:

```bash
CMIP_BASE_URL=http://127.0.0.1:3004 npm run ingest:once
```

Run continuously every 30 minutes by default:

```bash
CMIP_BASE_URL=http://127.0.0.1:3004 npm run ingest:scheduler
```
