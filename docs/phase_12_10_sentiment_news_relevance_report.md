# Phase 12.10 — Sentiment & News Relevance Hardening

## Summary

Market Sentiment was returning `score = 0`, `positive = 0`, `negative = 0`, `neutral = 0` because the sentiment engine had no usable normalized event input. RSS ingestion was working and `raw_events` existed, but `normalized_events` was empty or the local normalized cache had been overwritten by empty stage runs.

This pass restores sentiment from accepted news only. It does not infer sentiment from price, does not fabricate news, and does not create a new analytics engine.

## Root Cause

1. `getSentimentReport()` only read `getLatestNormalizedEventsSync()`.
2. `latest-normalized-events.json` could be overwritten with `[]` by staged ingestion runs that had no event output.
3. Supabase reads for `raw_events` / `normalized_events` can time out, and normalization did not fallback to local raw event cache.
4. Polarity was calculated from Persian-normalized title/summary only, so original English market words were lost.
5. Neutral polarity used `Math.sign(polarity || 1)`, which could turn neutral news into positive weighted output.
6. Generic CNBC company stories were accepted because fallback asset mapping inserted BTC/ETH/SOL into the normalized text, and simple `includes()` matched short symbols like `ETH` inside unrelated words.

## Fixes Applied

- Normalized event cache is no longer overwritten by empty batches.
- Normalization input falls back to local raw event cache when Supabase select returns no rows or times out.
- Sentiment can runtime-normalize raw events only when normalized events are unavailable.
- Relevance and polarity use original title/summary from `normalizedPayload` where available.
- Term matching now uses word boundaries for short symbols such as `BTC`, `ETH`, and `SOL`.
- Generic company-specific financial stories are capped below relevance threshold unless they contain macro, crypto, broad market stress, or high-value event terms.
- Administrative Fed/Treasury/SEC notices are capped below relevance threshold.
- Confidence is available when accepted news exists, but capped by freshness, source diversity, sample depth, and reliability.
- If no accepted news exists, sentiment remains unavailable instead of producing a directional score.
- `news_sentiment_macro` and geopolitical adapter paths now return `unavailable` when real RSS score is missing, not development fallback values.

## Current Thresholds

- Minimum relevance: `40`
- Minimum confidence diagnostic threshold: `20`
- Minimum source quality threshold: `45`
- Freshness confidence cap:
  - with accepted news in last 24h: no freshness cap
  - with accepted news in last 72h only: max `70`
  - with accepted news older than 72h but under 7 days: max `55`
  - older than 7 days: excluded as stale

## Latest Validation Snapshot

From `/api/v1/overview` on `localhost:3004`:

- Sentiment score: `-13`
- Positive: `7`
- Negative: `32`
- Neutral: `90`
- Confidence: `55`, label `limited`
- Loaded from: `normalized_events`
- Normalized items reviewed: `160`
- Accepted for sentiment: `129`
- Rejected by relevance: `31`
- Rejected as stale: `0`
- Last 24h accepted news: `0`

The confidence is intentionally capped because the accepted news cache has no last-24h items.

## Source Quality Audit

| Source | Collected | Accepted | Rejected | Notes |
| --- | ---: | ---: | ---: | --- |
| CNBC Markets RSS | 46 | 19 | 27 | Generic company/equity stories now rejected unless macro/market-stress linked. |
| Cointelegraph RSS | 40 | 39 | 1 | Mostly crypto-relevant. |
| CoinDesk RSS | 36 | 36 | 0 | Crypto-relevant. |
| Decrypt RSS | 21 | 21 | 0 | Crypto-relevant. |
| The Block RSS | 12 | 11 | 1 | Crypto-relevant. |
| ECB RSS | 4 | 3 | 1 | Macro policy context. |
| Federal Reserve RSS | 1 | 0 | 1 | Administrative/unmapped item rejected. |

## Sample Pipeline Trace

Representative items from the 20-item audit sample:

| Source | Decision | Relevance | Sentiment | Reason |
| --- | --- | ---: | --- | --- |
| CNBC Markets RSS — Oil jumps after Iran escalation | included | 100 | neutral | Broad macro/geopolitical market stress. |
| CoinDesk RSS — BTC drops below $73k after Iran/liquidations | included | 92 | negative | BTC + liquidation context. |
| Cointelegraph RSS — BTC funding spike / ETF outflows | included | 79 | negative | BTC + leverage/ETF context. |
| CNBC Markets RSS — LG Energy shares surge | excluded | 35 | neutral | Company-specific equity story, no macro/crypto link. |
| CNBC Markets RSS — Ferrari EV launch | excluded | 35 | neutral | Company-specific equity story, no macro/crypto link. |
| CNBC Markets RSS — Nio shares jump | excluded | 35 | positive | Company-specific equity story, no macro/crypto link. |
| CNBC Markets RSS — Fed Kashkari inflation comments | included | 72 | negative | Fed/inflation macro relevance. |
| ECB RSS — Lagarde independence remarks | included | 100 | neutral | Monetary-policy source, no directional overclaim. |

Full 20-row trace is exposed at `sentiment.audit.sample` in `/api/v1/overview`.

## Asset Mapping

Latest audit counts:

- BTC: mapped in `133` items
- ETH: mapped in `108` items
- SOL: mapped in `102` items
- USDT: mapped in `8` items
- DXY: mapped in `4` items
- Gold: mapped in `2` items
- Nasdaq: mapped in `47` items
- US10Y: mapped in `9` items

Generic fallback mappings no longer automatically make a story sentiment-eligible.

## Validation

- `npm run typecheck`: passed
- `npm run lint`: passed
- `npm run build`: passed
- `GET /`: `200`, C.M.I.P present, no runtime error
- `GET /api/v1/overview`: `200`, sentiment recovered with accepted/rejected explainability

## Remaining Blockers

1. Current cached news has no last-24h accepted items, so sentiment confidence is capped at `55`.
2. Supabase writes for `normalized_events` can still timeout; local fallback protects dashboard output but production DB latency should be monitored.
3. CNBC broad financial feed still needs ongoing audit because it mixes macro-relevant headlines with low-value company stories.
