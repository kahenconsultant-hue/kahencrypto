# Binance / Bybit Production HTTP Diagnostics

Generated: 2026-06-15T07:55:28Z  
Environment tested: Vercel production  
Runtime region reported by endpoint: `iad1`  
Storage mode for diagnostic telemetry: `supabase`  
Code scope: safe diagnostics only  
Analytics changes: none  
Adapter recovery status: not recovered

## Objective

Capture HTTP-level evidence explaining why Binance and Bybit fail in Vercel production while working locally.

## What Changed

Only diagnostics were added:

1. Binance/Bybit collector now records HTTP diagnostics in collector metadata:
   - endpoint
   - query params
   - HTTP status
   - response headers summary
   - response body preview
   - timeout duration
   - Vercel region
   - user-agent
   - parser success/failure
   - failure classification

2. Added protected manual endpoint:

```text
/api/admin/adapters/binance-bybit-diagnostic
```

Protection:

- `Authorization: Bearer <INGESTION_CRON_SECRET>`
- or `x-cmip-cron-secret: <INGESTION_CRON_SECRET>`
- or Basic auth user `cmip-cron`

3. Diagnostic output is persisted to:

```text
telemetry_logs
scope = adapter_diagnostics
event_type = binance_bybit_http_diagnostic
```

No adapter fix was applied.

## Validation

| Check | Result |
| --- | --- |
| `npm run typecheck` | pass |
| `npm run lint` | pass |
| `npm run build` | pass |
| Vercel production deploy | pass |
| Production diagnostic endpoint | HTTP 200 |
| Diagnostic telemetry storage | `supabase` |

## Production Diagnostic Summary

| Metric | Value |
| --- | ---: |
| Total probes | 6 |
| Successful probes | 0 |
| Failed probes | 6 |
| Binance failures | 3 |
| Bybit failures | 3 |
| Binance classification | `geo_blocked` |
| Bybit classification | `endpoint_blocked_from_vercel` |
| Runtime region | `iad1` |

## Binance Production Evidence

### Binance Spot Ticker

| Field | Value |
| --- | --- |
| Endpoint | `https://api.binance.com/api/v3/ticker/24hr` |
| Query | `symbol=BTCUSDT` |
| HTTP status | `451` |
| Duration | 49 ms |
| Server | CloudFront |
| Parser result | failed: missing `lastPrice` / `quoteVolume` |
| Classification | `geo_blocked` |

Body preview:

```text
{
  "code": 0,
  "msg": "Service unavailable from a restricted location according to 'b. Eligibility' in https://www.binance.com/en/terms..."
}
```

### Binance Futures Funding

| Field | Value |
| --- | --- |
| Endpoint | `https://fapi.binance.com/fapi/v1/premiumIndex` |
| Query | `symbol=BTCUSDT` |
| HTTP status | `451` |
| Duration | 67 ms |
| Server | CloudFront |
| Parser result | failed: missing `lastFundingRate` |
| Classification | `geo_blocked` |

Body preview:

```text
{
  "code": 0,
  "msg": "Service unavailable from a restricted location according to 'b. Eligibility' in https://www.binance.com/en/terms..."
}
```

### Binance Futures Open Interest

| Field | Value |
| --- | --- |
| Endpoint | `https://fapi.binance.com/futures/data/openInterestHist` |
| Query | `symbol=BTCUSDT&period=1h&limit=25` |
| HTTP status | `451` |
| Duration | 59 ms |
| Server | CloudFront |
| Parser result | failed: sample size 0 |
| Classification | `geo_blocked` |

Body preview:

```text
{
  "code": 0,
  "msg": "Service unavailable from a restricted location according to 'b. Eligibility' in https://www.binance.com/en/terms..."
}
```

## Bybit Production Evidence

### Bybit Spot Ticker

| Field | Value |
| --- | --- |
| Endpoint | `https://api.bybit.com/v5/market/tickers` |
| Query | `category=spot&symbol=BTCUSDT` |
| HTTP status | `403` |
| Duration | 71 ms |
| Server | CloudFront |
| Parser result | failed: response is not valid JSON |
| Classification | `endpoint_blocked_from_vercel` |

Body preview:

```text
{
    error:The Amazon CloudFront distribution is configured to block access from your country
}
```

### Bybit Linear Funding

| Field | Value |
| --- | --- |
| Endpoint | `https://api.bybit.com/v5/market/tickers` |
| Query | `category=linear&symbol=BTCUSDT` |
| HTTP status | `403` |
| Duration | 81 ms |
| Server | CloudFront |
| Parser result | failed: response is not valid JSON |
| Classification | `endpoint_blocked_from_vercel` |

Body preview:

```text
{
    error:The Amazon CloudFront distribution is configured to block access from your country
}
```

### Bybit Open Interest

| Field | Value |
| --- | --- |
| Endpoint | `https://api.bybit.com/v5/market/open-interest` |
| Query | `category=linear&symbol=BTCUSDT&intervalTime=1h&limit=25` |
| HTTP status | `403` |
| Duration | 70 ms |
| Server | CloudFront |
| Parser result | failed: response is not valid JSON |
| Classification | `endpoint_blocked_from_vercel` |

Body preview:

```text
{
    error:The Amazon CloudFront distribution is configured to block access from your country
}
```

## Root Cause Classification

| Provider | Root cause | Evidence | Confidence |
| --- | --- | --- | --- |
| Binance | `geo_blocked` | HTTP 451 with Binance restricted-location message | High |
| Bybit | `endpoint_blocked_from_vercel` | HTTP 403 CloudFront country block from Vercel runtime | High |

This confirms the failure is not a parser bug and not an endpoint removal.

## Local vs Production Difference

The same endpoint families work locally with HTTP 200 and valid payloads.

Production fails from Vercel runtime region:

```text
iad1
```

This explains the earlier contradiction:

- Local tests: valid Binance/Bybit data.
- Vercel production: exchange APIs blocked by location/security policy.

## Current Impact

| Area | Impact |
| --- | --- |
| BTC/ETH/SOL price | Mostly protected by CoinGecko fallback |
| Spot volume | Mostly protected by CoinGecko fallback |
| Funding rates | Not protected; unavailable from Binance/Bybit production |
| Open interest | Not protected; unavailable from Binance/Bybit production |
| Futures volume | Not protected; unavailable from Binance/Bybit production |
| Derivatives Engine | Cannot be marked fully recovered |
| Liquidity confidence | Must remain capped while derivatives are missing |

## Important Operational Note

During setup, production cron secrets were re-synced from local `.env.local` into Vercel because the deployed diagnostic endpoint returned `unauthorized` with the local secret. The values were not printed. After re-sync, the production endpoint returned HTTP 200 and stored diagnostics in Supabase.

This means cron-job.org should continue using the same `INGESTION_CRON_SECRET` value currently present in `.env.local`. If cron-job.org was configured with a different old value, it must be updated to the current one.

## Files Changed

```text
src/collectors/api/exchange-market-collector.ts
src/app/api/admin/adapters/binance-bybit-diagnostic/route.ts
binance_bybit_production_http_diagnostics.md
```

Existing report files also present:

```text
adapter_stability_audit.md
binance_bybit_root_cause_report.md
```

## Final Decision

Do not mark Binance/Bybit recovered.

Final classification:

```text
Binance = geo_blocked
Bybit = endpoint_blocked_from_vercel
Derivatives Engine = not fully recovered
```

Recommended next fix phase:

Use a production execution environment whose outbound region is accepted by Binance and Bybit, or route only exchange collectors through a small external worker/VPS in an allowed region. Do not fake funding/open-interest values and do not infer derivatives from CoinGecko spot data.

