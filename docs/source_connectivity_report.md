# Source Connectivity Report

Generated: 2026-05-25

Verification run: `fc703a78-aa6a-48cf-895e-8d9020d22f1e`

Storage mode: `supabase`

## Connectivity Summary

| Status | Count |
| --- | ---: |
| Success | 5 |
| Degraded | 1 |
| Failed | 1 |
| API key missing | 4 |
| Disabled/skipped | 0 |

## Source Results

| Source | Type | Tier | Status | Attempts | Events | Metrics | Error |
| --- | --- | ---: | --- | ---: | ---: | ---: | --- |
| C.M.I.P public market signal adapters | api | 1 | degraded | 1 | 0 | 20 | Partial unavailable metrics |
| Federal Reserve RSS | rss | 1 | success | 1 | 20 | 0 | none |
| US Treasury RSS | rss | 1 | failed | 3 | 0 | 0 | HTTP 404 |
| SEC public press releases | filings/rss | 2 | success | 1 | 25 | 0 | none |
| CoinDesk RSS | rss | 2 | success | 1 | 25 | 0 | none |
| Cointelegraph RSS | rss | 3 | success | 1 | 30 | 0 | none |
| CNBC Markets RSS | rss | 2 | success | 1 | 30 | 0 | none |
| FRED API | api | 1 | api_key_missing | 0 | 0 | 0 | `FRED_API_KEY` missing |
| Trading Economics API | api | 2 | api_key_missing | 0 | 0 | 0 | `TRADINGECONOMICS_API_KEY` missing |
| Whale Alert API | api | 2 | api_key_missing | 0 | 0 | 0 | `WHALE_ALERT_API_KEY` missing |
| CoinGlass API | api | 1 | api_key_missing | 0 | 0 | 0 | `COINGLASS_API_KEY` missing |

## Metric Quality

The public market signal adapters produced 20 metric rows:

| Quality | Count |
| --- | ---: |
| live | 7 |
| delayed | 10 |
| unavailable | 3 |

Unavailable metrics:

| Asset | Metric | Behavior |
| --- | --- | --- |
| BTC | `etf_net_flow_24h_usd` | stored as unavailable, no fake value |
| ETH | `etf_net_flow_24h_usd` | stored as unavailable, no fake value |
| BTC | `exchange_reserves_change_7d_pct` | stored as unavailable, no fake value |

## Connectivity Conclusion

Free/public sources are writing real data into Supabase. Paid/keyed sources are correctly disabled as `api_key_missing` and do not fabricate fallback values. The US Treasury RSS endpoint currently returns HTTP 404 after retry and is persisted as a failed source with a dead-letter entry.
