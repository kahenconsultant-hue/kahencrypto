# C.M.I.P Fake vs Real Data Map

Audit date: 2026-05-25  
Goal: separate hardcoded/demo, env-configured, unavailable, delayed, and live/partial-live paths.

## Status Definitions

| Status | Meaning in current code |
|---|---|
| Live | Fetched from a public endpoint at refresh time and timestamped by source/runtime |
| Delayed | Fetched from a public delayed endpoint or daily/intraday source |
| Env-configured | Numeric value read from environment variable; valid only if deployment updates it reliably |
| Estimated | Development fallback only when `CMIP_ALLOW_DEV_FALLBACK=true` |
| Demo/hardcoded | Imported from `src/lib/demo-data.ts` or fixed narrative/config |
| Unavailable | No valid provider/value; should not produce score or confidence |

## Real or Semi-Real Connected Data

| Data area | Current source | File | Quality | Notes |
|---|---|---|---|---|
| BTC/ETH/SOL 24h price trend | Binance spot REST klines | `src/server/data/adapters.ts` | Live if reachable | REST polling, not websocket |
| BTC spot volume trend | Binance spot REST klines | `src/server/data/adapters.ts` | Live if reachable | BTC only |
| BTC futures volume trend | Binance futures REST klines | `src/server/data/adapters.ts` | Live if reachable | BTC only |
| BTC funding rate | Binance Futures premium index | `src/server/data/adapters.ts` | Live if reachable | BTC only |
| BTC open interest trend | Binance Futures openInterestHist | `src/server/data/adapters.ts` | Live if reachable | BTC only |
| Nasdaq/DXY/Gold/US10Y/VIX trends | Yahoo Finance chart endpoint | `src/server/data/adapters.ts` | Delayed | Not institutional-grade but traceable |
| Stablecoin market cap/USDT/USDC supply | DefiLlama stablecoin API | `src/server/data/adapters.ts` | Delayed | Good free source, no chain distribution yet |
| Macro/geopolitical title score | Fed/CNBC/CoinDesk/Cointelegraph/Treasury/White House/NATO RSS title basket | `src/server/data/adapters.ts` | Delayed heuristic | Real feeds, but not event-level intelligence |
| Correlations | Calculated from cached histories | `src/server/analytics/correlation-engine.ts` | Partial/delayed | Valid only when sample size passes |
| Liquidity/regime/asset impact | Calculated from normalized signal snapshot | `src/server/analytics/*` | Partial-live if source coverage adequate | Not fake when fallback disabled, but incomplete |

## Env-Configured Data

| Data area | Env vars | Current behavior | Risk |
|---|---|---|---|
| BTC ETF flow | `CMIP_BTC_ETF_FLOW_24H`, timestamp var | Used as delayed source if numeric | Manual/env data can become stale |
| ETH ETF flow | `CMIP_ETH_ETF_FLOW_24H`, timestamp var | Used as delayed source if numeric | No crawler/API yet |
| BTC exchange reserves | `CMIP_BTC_EXCHANGE_RESERVES_7D`, timestamp var | Used as premium/on-chain configured feed | No Glassnode/CryptoQuant implementation yet |

If these env vars are missing and `CMIP_ALLOW_DEV_FALLBACK=false`, the system marks the signals unavailable. If `CMIP_ALLOW_DEV_FALLBACK=true`, the current adapter can return estimated fallback values; this must remain disabled in production.

## Demo/Hardcoded Runtime Usage

| Runtime area | File | Demo source | Production impact |
|---|---|---|---|
| Dashboard latest news feed | `src/components/dashboard/panels.tsx` | `getNewsGroupedByCategory`, `getNewsItems` | Shows hardcoded news items |
| Dashboard USDT risk center | `src/components/dashboard/panels.tsx` | `usdtRiskCenter` | Risk content is not source-backed |
| Dashboard pricing/watchlist plans | `src/components/dashboard/panels.tsx` | `pricingPlans` | Product placeholder |
| API overview | `src/app/api/v1/overview/route.ts` | assets/news/sourceHealth/plans/USDT from demo-data | Mixed real/demo API payload |
| API news | `src/app/api/v1/news/route.ts` | demo news/categories | No real event ingestion |
| API asset details | `src/app/api/v1/assets/[symbol]/route.ts` | demo asset intelligence and demo relevant news | Asset endpoint is mixed |
| Asset pages | `src/app/assets/[symbol]/page.tsx` | `assetIntelligence` | Static base asset metadata/narrative |
| Asset dashboard component | `src/components/assets/asset-dashboard.tsx` | asset/news/category demo data | Mixed asset experience |
| Sentiment page | `src/app/sentiment/page.tsx` | `getNewsItems` | News source not real |
| Admin console | `src/components/admin/admin-console.tsx` | demo news and sourceHealth | Admin health not true |
| WordPress payload | `src/server/wordpress/adapter.ts` | `getNewsItems` | Headless output can include demo stories |
| Ingestion pipeline | `src/server/ingestion/pipeline.ts` | `getNewsItems`, fake source health | Not real ingestion |

## Placeholder or Unavailable Modules

| Module | Current reality |
|---|---|
| Whale tracking | No real adapter; registry mentions sources only |
| ETF crawler | Not implemented; env-configured values only |
| SEC filings ingestion | Not implemented |
| Trading Economics | Env placeholder only; no adapter |
| FRED | Env placeholder only; no adapter |
| CoinGecko | Not implemented despite free-source requirement |
| CoinGlass | Env placeholder only; no adapter; Binance futures used for limited BTC leverage |
| Glassnode/CryptoQuant/Santiment/CoinMetrics | Env placeholders only; no real connectors |
| Reuters/Bloomberg/FT/WSJ | Registry mentions premium/unavailable; no connector |
| Binance websocket | Not implemented |
| Supabase persistence | Migration exists, but runtime writes are not implemented |
| Redis queue/cache | Env placeholder only |

## Hidden Demo Logic That Must Be Removed Or Isolated

1. `src/lib/demo-data.ts` should not be imported by production routes/pages.
2. `simulateIngestionRun` should be removed from production path.
3. `fallbackValues` in `src/server/data/adapters.ts` should be development-only and impossible in production builds.
4. Static `moduleDataSourceStatus` should be replaced by source-health-derived status.
5. Static source registry statuses should not be displayed as operational truth.
6. Hardcoded `horizonLastUpdated`, `regimeByAssetHorizon`, and `confidenceByAssetHorizon` in `asset-intelligence-engine.ts` should be replaced by generated snapshots or removed if not actively used.

## Honest Production Data Rule

For production mode:

- Missing ETF flow must be `unavailable`, not zero or estimated.
- Missing whale/on-chain data must disable whale/on-chain modules.
- Missing FRED/Trading Economics must degrade macro coverage.
- Missing news ingestion must show no latest-news intelligence.
- Missing sample size must suppress correlations and confidence.
- Missing source timestamp must suppress freshness claims.

