# Failed Collectors Report

Generated: 2026-05-25

Verification run: `fc703a78-aa6a-48cf-895e-8d9020d22f1e`

## Failed or Unavailable Collectors

| Source | Status | Attempts | Dead letter | Root cause |
| --- | --- | ---: | --- | --- |
| US Treasury RSS | failed | 3 | yes | Endpoint returned HTTP 404 |
| FRED API | api_key_missing | 0 | yes | `FRED_API_KEY` missing |
| Trading Economics API | api_key_missing | 0 | yes | `TRADINGECONOMICS_API_KEY` missing |
| Whale Alert API | api_key_missing | 0 | yes | `WHALE_ALERT_API_KEY` missing |
| CoinGlass API | api_key_missing | 0 | yes | `COINGLASS_API_KEY` missing |

## Retry Handling Verification

The US Treasury RSS collector used the retry path:

- configured max attempts: 3
- observed attempts in latest ingestion log: 3
- final status: failed
- persisted dead-letter entry: yes
- next retry timestamp persisted: yes

API-key-missing collectors do not retry network calls:

- observed attempts: 0
- status: `api_key_missing`
- raw events: 0
- raw metrics: 0
- persisted dead-letter entries: yes

This behavior prevents unnecessary calls and avoids generating fake data when credentials are missing.

## Processing Errors

`processing_errors` row count remained 0. Collector failures were captured as source health, ingestion logs, and dead letters rather than unhandled processing exceptions.
