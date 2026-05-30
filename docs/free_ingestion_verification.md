# Free Ingestion Verification

Generated: 2026-05-30

## Verification summary

فاز ۴ ingestion واقعی با منابع آزاد اجرا شد و خروجی‌ها در Supabase ذخیره شدند. این اجرا هیچ داده جعلی، alert ساختگی یا تحلیل AI تولید نکرد.

- `runId`: `0651efe6-8594-495e-8f9f-efb81053babb`
- `storageMode`: `supabase`
- `pulledEvents`: 259
- `pulledMetrics`: 40
- `rawEventsInserted`: 259
- `rawEventsUpdated`: 0
- `normalizedEventsCreated`: 500
- `eventClustersCreated`: 467
- `duplicatesDetected`: 33
- `failedSources`: 0
- `deadLetters`: 0

## Supabase write status

| Table | Rows written | Status |
| --- | ---: | --- |
| `sources` | 21 | success |
| `raw_events` | 259 | success |
| `raw_metrics` | 40 | success |
| `market_snapshots` | 10 | success |
| `normalized_events` | 500 | success |
| `event_clusters` | 467 | success |
| `source_health` | 13 | success |
| `ingestion_logs` | 13 | success |
| `dead_letters` | 0 | skipped |
| `ingestion_runs` | 1 | success |
| `telemetry_logs` | 1 | success |
| `reliability_snapshots` | 1 | success |
| `derived_signals` | 6 | success |
| `liquidity_scores` | 1 | success |
| `regime_inputs` | 1 | success |

## Real free sources verified

- Binance public REST: BTC/ETH/SOL spot trend, spot volume, futures volume, funding, open interest proxy.
- Bybit public REST: BTC/ETH/SOL spot trend, spot volume, futures volume, funding, open interest value.
- Fed RSS, ECB RSS, SEC RSS, CoinDesk RSS, The Block RSS, Cointelegraph RSS, CNBC RSS, Decrypt RSS, Blockworks RSS.
- US Treasury public press releases: official HTML listing fallback because the previous RSS URL returned HTTP 404.

## Degraded-mode result

- Reuters licensed feed remains disabled; C.M.I.P does not scrape paywalled Reuters content.
- CryptoSlate RSS is registered but disabled after latest verification returned HTTP 403.
- Optional premium/API-key sources remain disabled and do not block core ingestion.
- Missing premium feeds did not create fake ETF flows, whale activity, exchange reserves, or confidence scores.
