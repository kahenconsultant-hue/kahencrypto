# Binance & Bybit Failure Root Cause Report

Generated: 2026-06-14T23:58Z  
Scope: audit only  
Code changes: none  
Production window reviewed: 2026-06-14T01:00:49.453Z to 2026-06-14T23:30:51.904Z

## Executive Summary

Binance and Bybit direct collectors failed in 48/48 evaluated production runs.

The exact HTTP response code for the production failures is not available because the current collector implementation converts every non-OK response, timeout, abort, network error, or JSON failure into `null` and then stores only a parser-level unavailable metric.

Observed production failure classification:

- Binance: `parser_failure`
- Bybit: `parser_failure`

Most likely underlying root cause:

- `unknown`, with high suspicion of Vercel production egress / geo / security filtering.

Why:

- The same endpoints, query parameters, headers, and parser expectations work from the local audit environment with HTTP 200.
- Production failures are fast, around 333-498 ms, so timeout is unlikely.
- Every Binance and Bybit endpoint family fails together in production.
- Production logs do not preserve response code, response body, or response headers.

No evidence was found for:

- `endpoint_removed`
- `endpoint_changed`
- `authentication_required`
- `rate_limited`
- local parser schema failure

However, because production response codes are not persisted, the true production HTTP-layer cause cannot be proven without adding response diagnostics in a later fix phase.

## Evidence Sources

Read-only sources used:

- `src/collectors/api/exchange-market-collector.ts`
- `src/collectors/registry.ts`
- `ingestion_logs`
- `raw_metrics`
- `source_health`
- `telemetry_logs`
- live read-only endpoint probes from the current local environment

No production write, deployment, scheduler change, or code modification was performed.

## Current Collector Behavior

The exchange collector uses:

```ts
async function fetchJson<T>(url: string): Promise<T | null> {
  const response = await fetch(url, ...);
  if (!response.ok) return null;
  return await response.json();
}
```

This means production loses these diagnostics:

- HTTP status code
- HTTP status text
- response headers
- raw error payload
- timeout vs non-OK vs blocked vs schema failure

Downstream parser then sees `null` and records messages such as:

- `Binance kline sample is unavailable or too small.`
- `Binance funding rate is unavailable.`
- `Bybit kline sample is unavailable or too small.`
- `Bybit funding_rate_pct is unavailable.`

These messages are parser symptoms, not confirmed HTTP root causes.

## Production Failure Frequency

### Binance

| Metric | Value |
| --- | ---: |
| Production log rows reviewed | 49 |
| Failed runs | 48 |
| Successful runs | 1 older/non-current row |
| Last failed occurrence | 2026-06-14T23:30:42.759Z |
| First failed occurrence in reviewed logs | 2026-06-14T01:00:52.343Z |
| Average logged latency | 426 ms |
| Current `source_health` | failed |
| Latest source error | Binance public REST did not return usable public market metrics. |

### Bybit

| Metric | Value |
| --- | ---: |
| Production log rows reviewed | 49 |
| Failed runs | 48 |
| Successful runs | 1 older/non-current row |
| Last failed occurrence | 2026-06-14T23:30:42.759Z |
| First failed occurrence in reviewed logs | 2026-06-14T01:00:52.343Z |
| Average logged latency | 425 ms |
| Current `source_health` | failed |
| Latest source error | Bybit public REST did not return usable public market metrics. |

## Binance Request Audit

Tracked symbols:

- BTCUSDT
- ETHUSDT
- SOLUSDT

Collector timeout:

- 8,000 ms

Request headers:

- `accept: application/json,text/plain,*/*`
- `user-agent: CMIP/1.0 real ingestion exchange collector`

### Binance Endpoint Matrix

| Purpose | Endpoint | Query params | Production stored result | Local live probe | Root cause classification |
| --- | --- | --- | --- | --- | --- |
| Spot klines | `https://api.binance.com/api/v3/klines` | `symbol={symbol}&interval=1h&limit=49` | null rows, parser failed | HTTP 200, 49 rows | production: `parser_failure`; HTTP root cause: `unknown` |
| Futures klines | `https://fapi.binance.com/fapi/v1/klines` | `symbol={symbol}&interval=1h&limit=49` | null rows, parser failed | HTTP 200, 49 rows | production: `parser_failure`; HTTP root cause: `unknown` |
| Funding | `https://fapi.binance.com/fapi/v1/premiumIndex` | `symbol={symbol}` | null or missing `lastFundingRate` | HTTP 200, `lastFundingRate` present | production: `parser_failure`; HTTP root cause: `unknown` |
| Open interest | `https://fapi.binance.com/futures/data/openInterestHist` | `symbol={symbol}&period=1h&limit=25` | null rows, parser failed | HTTP 200, 25 rows | production: `parser_failure`; HTTP root cause: `unknown` |

### Binance Production Raw Metric Counts

| Endpoint | Production unavailable rows |
| --- | ---: |
| `https://api.binance.com/api/v3/klines` | 63 |
| `https://fapi.binance.com/fapi/v1/klines` | 63 |
| `https://fapi.binance.com/fapi/v1/premiumIndex` | 63 |
| `https://fapi.binance.com/futures/data/openInterestHist` | 63 |

### Binance Most Common Stored Errors

| Stored parser/error message | Count |
| --- | ---: |
| Binance kline sample is unavailable or too small. | 126 |
| Binance funding rate is unavailable. | 63 |
| Binance open interest history is unavailable or too small. | 63 |

### Binance Local Live Probe

All 12 Binance local probes succeeded:

- 3/3 spot kline requests returned HTTP 200 and 49 rows.
- 3/3 futures kline requests returned HTTP 200 and 49 rows.
- 3/3 funding requests returned HTTP 200 and usable `lastFundingRate`.
- 3/3 open-interest requests returned HTTP 200 and 25 rows.

Observed local headers:

- Binance spot server: `nginx`
- Binance futures server: `Tengine`
- Binance weight headers present: `x-mbx-used-weight`, `x-mbx-used-weight-1m`
- No local `retry-after`
- No local 403/451/429

### Binance Root Cause Assessment

| Candidate | Assessment |
| --- | --- |
| `endpoint_removed` | Ruled out by local HTTP 200 on all endpoint families. |
| `endpoint_changed` | Ruled out for local parser; schema matches expected fields. |
| `authentication_required` | Ruled out locally; endpoints are public and return data. |
| `rate_limited` | Not supported by stored evidence; local probe showed no 429/418 and no retry-after. |
| `timeout` | Unlikely; production failures complete in about 426 ms average. |
| `schema_change` | Ruled out locally; parser succeeds against current schema. |
| `parser_failure` | Confirmed as stored production symptom. |
| `geo_blocked` / `cloudflare_blocked` | Plausible but unproven because production HTTP status/body/headers are not retained. |
| `unknown` | Final HTTP-layer classification until instrumentation exists. |

## Bybit Request Audit

Tracked symbols:

- BTCUSDT
- ETHUSDT
- SOLUSDT

Collector timeout:

- 8,000 ms

Request headers:

- `accept: application/json,text/plain,*/*`
- `user-agent: CMIP/1.0 real ingestion exchange collector`

### Bybit Endpoint Matrix

| Purpose | Endpoint | Query params | Production stored result | Local live probe | Root cause classification |
| --- | --- | --- | --- | --- | --- |
| Spot klines | `https://api.bybit.com/v5/market/kline` | `category=spot&symbol={symbol}&interval=60&limit=49` | null rows, parser failed | HTTP 200, `retCode=0`, 49 rows | production: `parser_failure`; HTTP root cause: `unknown` |
| Linear klines | `https://api.bybit.com/v5/market/kline` | `category=linear&symbol={symbol}&interval=60&limit=49` | null rows, parser failed | HTTP 200, `retCode=0`, 49 rows | production: `parser_failure`; HTTP root cause: `unknown` |
| Funding | `https://api.bybit.com/v5/market/tickers` | `category=linear&symbol={symbol}` | null or missing `fundingRate` | HTTP 200, `retCode=0`, `fundingRate` present | production: `parser_failure`; HTTP root cause: `unknown` |
| Open interest | `https://api.bybit.com/v5/market/open-interest` | `category=linear&symbol={symbol}&intervalTime=1h&limit=25` | null rows, parser failed | HTTP 200, `retCode=0`, 25 rows | production: `parser_failure`; HTTP root cause: `unknown` |

### Bybit Production Raw Metric Counts

| Endpoint | Production unavailable rows |
| --- | ---: |
| `https://api.bybit.com/v5/market/kline` | 124 |
| `https://api.bybit.com/v5/market/tickers` | 62 |
| `https://api.bybit.com/v5/market/open-interest` | 62 |

### Bybit Most Common Stored Errors

| Stored parser/error message | Count |
| --- | ---: |
| Bybit kline sample is unavailable or too small. | 124 |
| Bybit funding_rate_pct is unavailable. | 62 |
| Bybit open interest history is unavailable or too small. | 62 |

### Bybit Local Live Probe

All 12 Bybit local probes succeeded:

- 3/3 spot kline requests returned HTTP 200, `retCode=0`, and 49 rows.
- 3/3 linear kline requests returned HTTP 200, `retCode=0`, and 49 rows.
- 3/3 funding requests returned HTTP 200, `retCode=0`, and usable `fundingRate`.
- 3/3 open-interest requests returned HTTP 200, `retCode=0`, and 25 rows.

Observed local headers:

- Bybit server: `Openresty`
- No local `retry-after`
- No local 403/451/429

### Bybit Root Cause Assessment

| Candidate | Assessment |
| --- | --- |
| `endpoint_removed` | Ruled out by local HTTP 200 on all endpoint families. |
| `endpoint_changed` | Ruled out for local parser; schema matches expected fields. |
| `authentication_required` | Ruled out locally; endpoints are public and return data. |
| `rate_limited` | Not supported by stored evidence; local probe showed no 429 and no retry-after. |
| `timeout` | Unlikely; production failures complete in about 425 ms average. |
| `schema_change` | Ruled out locally; parser succeeds against current schema. |
| `parser_failure` | Confirmed as stored production symptom. |
| `geo_blocked` / `cloudflare_blocked` | Plausible but unproven because production HTTP status/body/headers are not retained. |
| `unknown` | Final HTTP-layer classification until instrumentation exists. |

## Fallback Masking Check

### Market prices and spot volume

Fallback data is masking the direct exchange failures for core price and spot volume.

Latest signal cache telemetry shows:

- `btc_price_usd`: CoinGecko Simple Price fallback
- `eth_price_usd`: CoinGecko Simple Price fallback
- `sol_price_usd`: CoinGecko Simple Price fallback
- `btc_volume_24h_usd`: CoinGecko Simple Price fallback
- `eth_volume_24h_usd`: CoinGecko Simple Price fallback
- `sol_volume_24h_usd`: CoinGecko Simple Price fallback

These values are real public data, not fabricated, but they are not live Binance or live Bybit data.

### Derivatives

Fallback is not masking derivatives failure.

Latest signal cache telemetry shows these are unavailable:

- `funding_btc`
- `funding_eth`
- `funding_sol`
- `open_interest_btc_24h`
- `open_interest_eth_24h`
- `open_interest_sol_24h`
- `futures_volume_btc_24h`
- `futures_volume_eth_24h`
- `futures_volume_sol_24h`

Therefore the Derivatives Engine currently depends on:

| Dependency | Current status |
| --- | --- |
| Live Binance data | Not available in production |
| Live Bybit data | Not available in production |
| Cached snapshots | Not providing usable derivatives values |
| Historical cache | Not providing usable derivatives values |
| Fallback source | CoinGecko fallback supports price/volume only, not funding/OI/futures volume |

## Root Cause Ranking

| Rank | Root cause | Classification | Severity | Confidence | Fix complexity | Estimated impact on Production Readiness |
| ---: | --- | --- | --- | --- | --- | --- |
| 1 | Production HTTP responses are not observable because collector discards non-OK/error details before persistence. | `unknown` masking as `parser_failure` | Critical | High | Low | +2 to +4 points by enabling accurate diagnosis, not by itself restoring data |
| 2 | Vercel production egress/region/security filtering likely causes Binance and Bybit fetches to return non-usable responses. | likely `geo_blocked` or `cloudflare_blocked`, unproven | Critical | Medium | Medium | +8 to +12 points if direct exchange data is restored |
| 3 | Both exchange direct collectors fail together, so internal fallback cannot restore derivatives. | `parser_failure` symptom | Critical | High | Medium | +6 to +10 points if funding/OI/futures volume become available |
| 4 | CoinGecko fallback hides price/volume failure, making market stage look operational while derivatives remain unavailable. | fallback masking | High | High | Low | Better confidence calibration, limited direct readiness gain |
| 5 | Production raw metrics do not retain response body samples for failed exchange calls. | observability gap | High | High | Low | Faster future diagnosis |

## Exact Current Production Failure Messages

Binance:

- `Binance public REST did not return usable public market metrics.`
- `Binance kline sample is unavailable or too small.`
- `Binance funding rate is unavailable.`
- `Binance open interest history is unavailable or too small.`

Bybit:

- `Bybit public REST did not return usable public market metrics.`
- `Bybit kline sample is unavailable or too small.`
- `Bybit funding_rate_pct is unavailable.`
- `Bybit open interest history is unavailable or too small.`

## Conclusion

The direct endpoint definitions and parser logic are valid in the local audit environment.

The production failures are real, repeated, and currently affect all direct Binance/Bybit market and derivatives metrics. But the current production instrumentation does not retain enough HTTP-layer evidence to prove whether the exact cause is 403/451 geo/security blocking, Cloudflare/security filtering, a transient Vercel egress issue, or another non-OK response.

Final audit classification:

- Observed persisted root cause: `parser_failure`
- Exact HTTP-layer root cause: `unknown`
- Most likely underlying cause: production egress/region/security filtering
- Fallback masking: yes for price/spot volume, no for derivatives

No fix was applied in this phase.

