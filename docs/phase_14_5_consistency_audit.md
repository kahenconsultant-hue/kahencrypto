# Phase 14.5 - Data Completeness & Consistency Audit

Generated: 2026-06-05

## Summary

This pass did not add new analytics, dashboards, assets, or external providers. It fixed existing data mapping and consistency defects:

- DefiLlama stablecoin metrics now map into signal cache and liquidity inputs.
- ETF provider rows are retained for both BTC and ETH instead of being overwritten by the last fetched asset.
- ETF snapshots expose 24h, 7d, and 30d provider breakdowns.
- News feed UI/API now use normalized events when raw events are empty, matching sentiment processing.
- Correlation confidence is capped for statistically weak relationships.
- Data Health stale source counts now exclude unavailable optional/premium sources from global freshness impact.

## Before / After

| Area | Before | After |
|---|---:|---:|
| stale source rows counted in Data Health failures | 1 | 0 |
| source count consistency | critical 0/4, active 0/17 while metrics were fresh | critical 3/4, active 12/17, stale 0 |
| stale signals after staged scheduler | not consistently isolated | 6, reported by scheduler and not hidden |
| production readiness | 69 after signal refresh only | 76 after staged scheduler |
| overall platform health | 72 after signal refresh only | 76 after staged scheduler |
| market reliability | 36 after signal refresh only | 83 after staged scheduler |

## Stablecoin Coverage

Available from DefiLlama after refresh:

- total_stablecoin_market_cap_usd: 315,066,600,642.84
- stablecoin_market_cap_7d_change: -1.1612%
- stablecoin_market_cap_30d_change: -1.7111%
- usdt_supply_7d_change: -0.8631%
- usdt_supply_30d_change: -1.1847%
- usdc_supply_7d_change: -1.0638%
- usdc_supply_30d_change: -3.5845%

Unavailable:

- stablecoin_dominance: unavailable in final staged run because CoinGecko global market cap was not available in that fetch. It remains unavailable, not estimated.

Result: stablecoin values are no longer missing because of mapping failure. Missing dominance is now a real upstream/input availability condition.

## ETF Coverage

Source behavior:

- Farside BTC/ETH remains Cloudflare-blocked with HTTP 403 challenge.
- The Block public JSON fallback succeeds.
- ETF stage duration: 2,128 ms.
- BTC parsed rows: 601.
- ETH parsed rows: 469.
- Latest BTC ETF date: 2026-06-04.
- Latest ETH ETF date: 2026-06-04.

Detected BTC providers:

- IBIT
- FBTC
- BITB
- ARKB
- BTCO
- EZBC
- BRRR
- HODL
- BTCW
- GBTC
- BTC
- MSBT

Detected ETH providers:

- ETHA
- FETH
- ETHW
- CETH
- ETHV
- QETH
- EZET
- ETHE
- ETH

ETF flow values:

- BTC 24h: 3,200,000 USD
- BTC 7d: -2,478,300,000 USD
- BTC 30d: -4,031,700,000 USD
- ETH 24h: 19,300,000 USD
- ETH 7d: -387,800,000 USD
- ETH 30d: -1,043,500,000 USD

Fix applied:

- ETF daily flow persistence now merges by `asset:date:provider` before writing latest local snapshot.
- This prevents ETH refresh from deleting BTC rows, and vice versa.
- UI/API snapshots expose provider breakdown for 24h, 7d, and 30d.

No ETF values were fabricated.

## Correlation Confidence

Hard caps added:

- abs(correlation) < 0.20 -> max confidence 60%.
- abs(correlation) < 0.10 -> max confidence 45%.
- insufficient sample -> confidence null.

Top pair audit after patch:

| Pair | 24h | 7d | 30d | 90d | Confidence | Status |
|---|---:|---:|---:|---:|---:|---|
| BTC / ETH | 0.95 | 0.72 | 0.84 | 0.90 | 94 | available |
| BTC / SOL | 0.92 | 0.85 | 0.86 | 0.87 | 93 | available |
| BTC / DXY | null | -0.54 | -0.31 | -0.19 | 94 | available |
| BTC / US10Y | null | -0.31 | -0.25 | 0.01 | 85 | available |
| BTC / Nasdaq | null | 0.36 | 0.48 | 0.51 | 94 | available |
| BTC / Gold | null | 0.53 | 0.37 | 0.11 | 93 | available |
| BTC / Stablecoin Market Cap | null | -0.10 | 0.01 | 0.15 | 60 | available |
| ETH / SOL | 0.90 | 0.89 | 0.87 | 0.86 | 92 | available |
| ETH / DXY | null | -0.59 | -0.38 | -0.25 | 93 | available |
| SOL / DXY | null | -0.40 | -0.45 | -0.19 | 92 | available |

The weak BTC / Stablecoin Market Cap relationship is now capped at 60 instead of receiving high-confidence treatment.

## News Feed

Before:

- Sentiment processed normalized events.
- Raw events were empty.
- News Feed categories rendered 0 items.

After:

- Raw events displayed: 0.
- Normalized events available: 100.
- Public feed displayed: 100.
- Category display:
  - crypto_media: 74
  - financial_media: 26

Fix applied:

- `/api/v1/news` and dashboard news panels now combine raw events and normalized events with deduplication.
- Category resolution uses existing event category first, then deterministic event type/text mapping.
- No sentiment or market conclusion is generated from this display fallback.

## Liquidity Confidence

Liquidity confidence now observes stablecoin-layer caps:

- Missing stablecoin layer: max 70%.
- Missing stablecoin + exchange flows: max 55%.
- Missing stablecoin + exchange flows + ETF: max 40%.

After refresh, stablecoin layer is available except dominance. Exchange flows remain unavailable and are not fabricated.

## Validation

Commands run:

- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed.
- `npx tsx ... refreshSignalCache()`: passed.
- `npx tsx ... runStagedScheduledIngestion("phase_14_5_audit")`: completed degraded, failedStage null.
- localhost smoke test: page 200, linked CSS 200, CSS length 32128.

Scheduler audit:

- runId: 2bf3ffd4-1ccb-4540-be1b-cb26cdf6b581
- status: degraded
- failedStage: null
- durationMs: 13,588
- ETF stage: degraded only because Farside is Cloudflare-blocked and The Block fallback is used.
- deadLetters: 0
- staleSignals: 6

## Remaining Blockers Before Phase 15

1. Production Readiness is 76, below required 85.
2. Scheduler status remains degraded.
3. Fusion stage remains degraded with 11 failed inputs and 1 degraded input.
4. 6 stale signals remain after staged scheduler.
5. Binance public REST is disconnected/obsolete in source health even though the internal adapter bundle has partial market data.
6. Stablecoin dominance is unavailable in final staged run because CoinGecko global market cap fetch did not return usable data.
7. Exchange inflows/outflows and exchange reserves remain unavailable without a real source; they are correctly not stale and not fabricated.
8. Farside ETF primary remains Cloudflare-blocked; The Block fallback is reliable, but ETF source status is properly degraded, not connected.

## Final Gate

Success criteria status:

- No stale/obsolete contradiction: passed for Data Health failure rows.
- Stablecoin metrics mapped correctly: passed except dominance when CoinGecko global cap unavailable.
- ETF providers visible: passed for BTC and ETH from The Block fallback.
- News Feed consistent: passed.
- Correlation confidence calibrated: passed for weak relationships.
- Liquidity confidence calibrated: passed.
- Production Readiness >= 85: failed, current score 76.
- No Runtime Error: passed after dev server restart and CSS smoke test.
- No fake data: passed.
- No placeholder values when data exists: passed for ETF provider details and News Feed.

SAFE_TO_START_PHASE_15 = false
