# Data Source Audit

Date: 2026-05-23

Scope: current local demo running at `http://localhost:3004`.

## Executive Summary

The current demo is a polished UI/API prototype, not a live-data product. All user-facing dashboard data, asset intelligence, alerts, news, sentiment, liquidity, ETF flows, USDT risk, source health and correlation outputs are derived from static/demo generators in `src/lib/demo-data.ts` and deterministic helper functions in `src/server/*`.

No API route currently reads live data from Supabase, OpenAI, Redis, provider APIs, exchange APIs, social APIs or the Python analytics service. The routes are API-first and structurally ready, but their payloads are mock-backed.

## Status Legend

- `mock`: hardcoded or generated from local demo fixtures only.
- `partial`: production structure exists, but the module is not connected end-to-end to live sources.
- `live`: reads live external or database-backed data in the current runtime.

Current product-wide status: `mock`.

## 1. Widgets Using Hardcoded / Mock Data

| Widget / Area | Component / Route | Current Data Source | Status | Notes |
|---|---|---:|---|---|
| Market Regime | `MarketRegimePanel` | `marketRegime` from `src/lib/demo-data.ts` | mock | `market-regime-engine.ts` scores a hardcoded vector. |
| Top Alerts | `TopAlertsPanel` | `smartAlerts` from `src/lib/demo-data.ts` | mock | No alert persistence, review workflow or realtime dispatch. |
| Macro Summary | `MacroSummaryPanel` | `liquiditySnapshot` from `src/lib/demo-data.ts` | mock | DXY, US10Y, RRP, TGA are static values. |
| BTC/ETH/SOL/USDT Intelligence | `AssetIntelligenceGrid`, `AssetDashboard` | `assetIntelligence` from `src/lib/demo-data.ts` | mock | No live price, on-chain, derivatives or ETF joins. |
| Liquidity Dashboard | `LiquidityPanel` | `liquiditySnapshot` from `src/lib/demo-data.ts` | mock | Fed balance sheet, RRP, TGA, stablecoin and ETF values are fixtures. |
| Correlation Map | `CorrelationMapPanel` | `correlationPairs` fixture + generated matrix | mock | Dynamic algorithm exists, but uses fixture inputs, not market time series. |
| ETF Flows | `EtfFlowsPanel` | `etfFlowRows` from `src/lib/demo-data.ts` | mock | Farside/issuer ingestion not implemented. |
| Sentiment Dashboard | `SentimentPanel` | `sentimentSnapshot` from `src/lib/demo-data.ts` | mock | X/Reddit/YouTube/Google Trends not connected. |
| USDT Risk Status | `UsdtRiskPanel` | `usdtRiskCenter` from `src/lib/demo-data.ts` | mock | No Tether/Circle/TRON/Ethereum/Iran premium feeds. |
| Geopolitical Risk | `GeopoliticalRiskPanel` | `getNewsItems("geopolitics")` from local generator | mock | No White House/Treasury/NATO/OPEC ingestion. |
| Latest News Feed | `LatestNewsFeedPanel` | `getNewsGroupedByCategory()` local generator | mock | Provides 8 items per category, but all generated. |
| Ingestion & Source Health | `OperationsPanel`, `AdminConsole` | `sourceHealth` + `simulateIngestionRun()` | mock | Simulates source health and jobs only. |
| Watchlist & Plans | `WatchlistAndPlansPanel` | local arrays and static controls | mock | No auth/user persistence. |
| Embeddable Widget | `/embed/overview`, `public/embed-widget.js` | `/api/v1/wordpress`, which is mock-backed | mock | Widget mechanism works, payload is not live. |

## 2. APIs Actually Connected

| API | Current Behavior | Connected To Live Source? | Status |
|---|---|---:|---|
| `GET /api/v1/overview` | Returns full dashboard payload from local demo data. | No | mock |
| `GET /api/v1/news` | Returns local generated news, optional category/grouping. | No | mock |
| `GET /api/v1/assets/:symbol` | Returns local asset intelligence + generated news impact summaries. | No | mock |
| `GET /api/v1/alerts` | Filters local `smartAlerts`. | No | mock |
| `GET /api/v1/correlations` | Returns fixture correlations and generated matrix. | No | mock |
| `GET /api/v1/market-regime` | Scores hardcoded input vector and returns fixture context. | No | mock |
| `GET /api/v1/wordpress` | Returns compact widget payload from local demo data. | No | mock |
| `GET /api/cron/ingest` | Runs `simulateIngestionRun()` against demo source registry. | No | mock |

Existing but not actively connected:

- `src/server/supabase/client.ts` can create a Supabase client if env vars exist, but no API route uses it.
- `services/python/analytics/*` contains analytics workers, but Next.js routes do not call the FastAPI service.
- Supabase migration exists, but the local runtime is not reading or writing those tables.

## 3. Modules That Are Only UI Placeholders

| Module | Placeholder Surface | Missing Production Behavior |
|---|---|---|
| Authentication / RBAC | Sidebar/header/admin labels only | Supabase Auth session, roles, protected admin routes, plan gating. |
| Admin source management | `AdminConsole` cards/buttons | CRUD for sources, job retry, alert approval, prompt testing, duplicate review. |
| Watchlist personalization | Checkbox UI only | Persisted watchlists, alert preferences, analysis depth, realtime subscriptions. |
| Smart alert delivery | Alert cards only | Rule engine, persistence, review state, notifications, email/Telegram/web push. |
| Ingestion queue | Simulated run | Durable queue, retry policy, dead letter queue, provider adapters, scheduler. |
| AI processing | Prompt helpers and traces | OpenAI calls, prompt versioning, token logging, moderation/guardrails, persisted outputs. |
| Source health monitoring | Static health rows | Real latency checks, provider error rates, alerting on source degradation. |
| WordPress plugin | JSON payload + JS widget | Installable WP plugin, signed requests, shortcode/block settings, cache policy. |
| Subscription plans | Static plan cards | Billing provider, entitlement checks, usage limits, API keys. |
| Realtime | Header badge only | Supabase Realtime channels and client subscriptions. |

## 4. Environment Variables Missing

No `.env.local` file is present in the workspace, so all runtime variables from `.env.example` are currently missing unless provided by the shell or hosting platform.

Required for platform infrastructure:

| Variable | Needed For | Current Use |
|---|---|---|
| `NEXT_PUBLIC_APP_URL` | canonical app URL and widget generation | example only |
| `NEXT_PUBLIC_DEMO_MODE` | explicit demo/live mode switch | example only |
| `CRON_SECRET` | protect `/api/cron/ingest` | checked only if set |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase client | not connected by routes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | browser/server Supabase access | not connected by routes |
| `SUPABASE_SERVICE_ROLE_KEY` | server writes, ingestion, admin jobs | not connected by routes |
| `REDIS_URL` | queue/cache/rate limits | not used yet |
| `OPENAI_API_KEY` | translation, classification, impact analysis | not used yet |
| `AI_MODEL` | model selection | example only |
| `AI_PROMPT_VERSION` | prompt/audit logs | example only |
| `WORDPRESS_SHARED_SECRET` | signed WP/plugin access | not used yet |
| `EMBED_ALLOWED_ORIGINS` | widget CORS/origin control | not enforced yet |

Provider variables currently listed:

- `FRED_API_KEY`
- `TRADING_ECONOMICS_KEY`
- `GLASSNODE_API_KEY`
- `NANSEN_API_KEY`
- `CRYPTOQUANT_API_KEY`
- `COINMETRICS_API_KEY`
- `SANTIMENT_API_KEY`
- `COINGLASS_API_KEY`
- `X_BEARER_TOKEN`
- `YOUTUBE_API_KEY`

Additional provider variables needed for real coverage:

- `BLS_API_KEY`
- `BEA_API_KEY`
- `ALPHAVANTAGE_API_KEY` or another market data key for DXY/Gold/Nasdaq/US10Y
- `BINANCE_API_KEY` and `BINANCE_API_SECRET` if private or higher-limit futures endpoints are needed
- `DERIBIT_CLIENT_ID` and `DERIBIT_CLIENT_SECRET` for authenticated derivatives data
- `FARSIDE_SOURCE_URL` or licensed ETF flow source config
- `TETHER_TRANSPARENCY_SOURCE_URL`
- `CIRCLE_TRANSPARENCY_SOURCE_URL`
- `DEFILLAMA_API_BASE_URL`
- `TRONSCAN_API_KEY`
- `ETHERSCAN_API_KEY`
- `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET`, `REDDIT_USER_AGENT`
- `GOOGLE_TRENDS_PROVIDER_KEY` if using a managed trends provider
- `NEWS_API_KEYS` or per-provider credentials for Reuters/Bloomberg/FT/WSJ if licensed feeds are used
- `RATE_LIMIT_SECRET` or equivalent if implementing signed internal job calls
- `PYTHON_ANALYTICS_URL` for the FastAPI analytics service

## 5. Requirements To Make Core Modules Real

### BTC

Needed:

- Spot price/volume from market data provider or exchange aggregation.
- ETF flows from Farside/issuer feeds.
- On-chain metrics from Glassnode/Coin Metrics/CryptoQuant/Nansen.
- Derivatives metrics from CoinGlass/Deribit/CME/Binance Futures.
- Macro inputs: DXY, US10Y, Nasdaq, Gold, Fed calendar.
- Persisted `raw_items`, `processed_items`, `asset_impacts`, `onchain_snapshots`, `derivatives_snapshots`, `etf_flow_snapshots`.
- AI pipeline using OpenAI for Persian translation, scenario analysis, confidence and invalidation.

### ETH

Needed:

- ETH spot/volume and ETH/BTC relative strength.
- Ethereum on-chain activity, fees, staking, L2 activity and exchange reserves.
- ETH derivatives, options skew and open interest.
- Tech beta / Nasdaq correlation series.
- Regulatory/staking headline ingestion.
- Asset-specific AI impact rules and historical validation.

### SOL

Needed:

- SOL spot/volume and liquidity depth.
- Solana chain activity, active users, fees, app usage, ecosystem data.
- SOL derivatives funding/OI and liquidation maps.
- Retail sentiment and narrative cluster tracking.
- Unlock/ecosystem event calendar.
- Risk model for crowded retail/leverage behavior.

### USDT Risk

Needed:

- Tether transparency supply and reserves data.
- USDT supply by network, especially TRON and Ethereum.
- TronScan and Etherscan transfer/mint/burn monitoring.
- Freeze/sanction event detection from issuer/blockchain events.
- Exchange reserve and stablecoin inflow/outflow data.
- Iran premium feed from local market sources, if legally and operationally available.
- Custody/exchange risk scoring model.
- Clear legal copy and non-advisory UX guardrails.

### Sentiment

Needed:

- X/Twitter API or licensed social firehose.
- Reddit API ingestion.
- YouTube API ingestion.
- Google Trends or managed alternative data provider.
- Narrative clustering pipeline, spam/bot filtering and language detection.
- Separate retail vs professional sentiment scoring.
- Persian content monitoring with moderation and source reliability weights.

### Liquidity

Needed:

- Fed balance sheet, RRP, TGA from FRED/Treasury.
- DXY, US10Y, Nasdaq, Gold market data.
- Stablecoin supply and exchange reserves.
- ETF flow snapshots.
- Liquidity scoring model with versioned weights.
- Historical snapshots for trend analysis and backtesting.

### Correlation

Needed:

- Historical time series for BTC, ETH, SOL, DXY, Gold, Nasdaq, US10Y, liquidity proxies and ETF flows.
- Scheduled worker computing rolling 7D/30D/90D correlations.
- Regime shift, decoupling and breakdown thresholds calibrated on history.
- Persisted `correlation_snapshots`.
- Optional Python analytics service wired via `PYTHON_ANALYTICS_URL`.
- AI interpretation generation with guardrails.

### Alerts

Needed:

- Durable rule engine over live snapshots and processed news.
- Alert persistence in `alerts`.
- Review workflow in admin for Important/Critical alerts.
- User watchlist matching and plan-based limits.
- Realtime delivery via Supabase Realtime.
- Rate limiting, dedupe, suppression windows and audit trail.
- Notification channels such as email, Telegram, web push or in-app only.

## 6. Data Source Status Badges To Add

Add visible status badges to every major module header:

| Module | Badge |
|---|---|
| Market Regime | mock |
| Top Alerts | mock |
| Macro Summary | mock |
| BTC Intelligence | mock |
| ETH Intelligence | mock |
| SOL Intelligence | mock |
| USDT Risk | mock |
| ETF Flows | mock |
| Liquidity Dashboard | mock |
| Correlation Map | mock |
| Sentiment Dashboard | mock |
| Geopolitical Risk | mock |
| Latest News Feed | mock |
| Ingestion / Source Health | partial |
| Admin Console | partial |
| API-first / WordPress | partial |
| Widget Embed | partial |
| Watchlist / Plans | mock |

Rationale:

- `mock`: displayed values are fixtures or local generators.
- `partial`: structural code exists for production integration, but live data is not connected.
- `live`: no module qualifies as live in the current runtime.

## Recommended Implementation Order

1. Add status badges now so users can visually distinguish demo fixtures from real integrations.
2. Introduce a typed `DataSourceStatus` registry shared by UI and API responses.
3. Add `dataSourceStatus` to `/api/v1/overview`, `/api/v1/assets/:symbol`, `/api/v1/correlations`, `/api/v1/market-regime`, `/api/v1/news` and `/api/v1/wordpress`.
4. Replace `src/lib/demo-data.ts` access in API routes with repository interfaces.
5. Implement Supabase-backed repositories for processed items, snapshots and alerts.
6. Implement provider adapters incrementally, starting with low-friction public sources: FRED, DefiLlama, Deribit public endpoints, Binance public endpoints and issuer/public transparency pages.
7. Wire OpenAI processing with prompt logs and guardrails.
8. Wire Python analytics service for correlation/regime jobs.
