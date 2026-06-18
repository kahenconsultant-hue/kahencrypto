# C.M.I.P Public Market Brief Refactor

Date: 2026-06-18

## Summary

The public dashboard was refactored from an engineering-heavy intelligence dashboard into a compact Persian RTL Live-Lite Market Brief. Technical panels remain available in the new `/audit` route and existing admin views.

## Files Changed

- `src/app/page.tsx`
- `src/app/audit/page.tsx`
- `src/components/public/PublicMarketBrief.tsx`
- `src/components/layout/header.tsx`
- `src/components/layout/sidebar.tsx`
- `src/lib/assets/targetAssets.ts`
- `src/lib/intelligence/publicBriefBuilder.ts`
- `src/lib/intelligence/assetScoring.ts`
- `src/lib/intelligence/moduleGating.ts`
- `src/lib/intelligence/sourceRegistry.ts`
- `tests/public-market-brief.test.ts`
- `package.json`

## New Presentation Layers

- Public: default `/` renders a clean `PublicMarketBrief` contract.
- Audit: `/audit` keeps forecast validation, causal graph, correlations, data quality, operations, source diagnostics and long technical panels.

## Public Asset Universe

The public report now always renders:

USDT, BTC, TRX, ETH, TON, SOL, XRP, DOGE, BNB, ADA

Label used:

`فهرست پایش دارایی‌های پرکاربرد/پرمخاطب برای بازار ایران`

It does not claim direct Iranian exchange-volume proof.

## Modules Hidden From Public

- Full Forecast Validation Center
- Correlation matrix when sample thresholds are not public-ready
- Full causal graph
- Missing derivatives/leverage panels
- USDT network/issuer/freeze scores without direct data
- ETF issuer-level table
- Long news feed
- Full Data Health and raw diagnostics

## Public Scoring and Gating

Implemented deterministic helpers for:

- price momentum
- volume liquidity
- macro pressure
- stablecoin liquidity
- BTC/ETH ETF flow
- weighted asset impact
- public confidence caps
- public module rendering gates
- forecast public badge gating

Rules enforced:

- Missing values stay `null`, not zero.
- USDT never becomes bullish/bearish.
- ETF contribution applies only to BTC/ETH.
- Low coverage/confidence produces scenario/limited wording.
- Public modules with weak coverage/confidence are hidden or shown only as compact limited status.

## UI Changes

- Default page is now a clean Persian RTL Market Brief.
- Header no longer shows the hardcoded `۸+ هشدار فعال`.
- Header no longer shows `پایش لحظه‌ای`.
- Sidebar now exposes `Market Brief` and `Intelligence Lab`.
- Public page has fixed section order:
  - Header/status
  - Market verdict
  - 10 asset overview table
  - asset cards
  - main drivers
  - invalidation/watch next
  - compact data confidence
  - disclaimer

## Validation

- `npm run typecheck`: passed
- `npm run lint`: passed
- `npm run test`: passed, 51/51 tests
- `npm run build`: passed
- Local production smoke:
  - `/`: HTTP 200
  - `/audit`: HTTP 200
  - CSS stylesheet loaded
  - browser check confirmed all 10 assets appear
  - browser check confirmed large Forecast Center and raw Data Health are hidden from public page

## Known Limitations

- Current public brief uses the existing signal cache. Assets beyond BTC/ETH/SOL/USDT may display limited monitoring until the ingestion layer provides direct price/volume history for the full 10-asset universe.
- Audit route is secondary but not access-gated by this change. Existing admin routes still contain operational diagnostics.
- Existing asset detail pages are not refactored in this pass.

## Next Recommended Step

Expand existing CoinGecko ingestion/mapping for TRX, TON, XRP, DOGE, BNB and ADA so the public brief can raise those assets from limited monitoring to medium/lite direct coverage without fabricating data.
