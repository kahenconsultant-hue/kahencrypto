# Active Collectors Report

Generated: 2026-05-25

## Enabled Collectors

| Source ID | Source | Type | Parser | Tier | Polling interval | Required env |
| --- | --- | --- | --- | ---: | ---: | --- |
| `cmip-public-market-signal-adapters` | C.M.I.P public market signal adapters | api | market_signals | 1 | 1800s | none |
| `fed-press-rss` | Federal Reserve RSS | rss | rss | 1 | 600s | none |
| `treasury-press-rss` | US Treasury RSS | rss | rss | 1 | 600s | none |
| `sec-press-rss` | SEC public press releases | filings | rss | 2 | 900s | none |
| `coindesk-rss` | CoinDesk RSS | rss | rss | 2 | 600s | none |
| `cointelegraph-rss` | Cointelegraph RSS | rss | rss | 3 | 600s | none |
| `cnbc-markets-rss` | CNBC Markets RSS | rss | rss | 2 | 600s | none |
| `fred-api` | FRED API | api | json | 1 | 1800s | `FRED_API_KEY` |
| `trading-economics-api` | Trading Economics API | api | json | 2 | 1800s | `TRADINGECONOMICS_API_KEY` |
| `whale-alert-api` | Whale Alert API | api | json | 2 | 900s | `WHALE_ALERT_API_KEY` |
| `coinglass-api` | CoinGlass API | api | json | 1 | 900s | `COINGLASS_API_KEY` |

## Active Real Data Writes

Latest run wrote/upserted:

| Output | Rows |
| --- | ---: |
| Source definitions | 11 |
| Raw RSS/API events | 130 |
| Raw metrics | 20 |
| Source health snapshots | 11 |
| Ingestion logs | 11 |
| Dead letters | 5 |
| Ingestion run summary | 1 |
| Reliability snapshot | 1 |

## Scheduler Status

The local scheduler entrypoint is:

```bash
CMIP_BASE_URL=http://127.0.0.1:3004 npm run ingest:once
```

For continuous local polling:

```bash
CMIP_BASE_URL=http://127.0.0.1:3004 npm run ingest:scheduler
```

The default local scheduler interval is 30 minutes through `CMIP_INGEST_INTERVAL_MINUTES` when not overridden.
