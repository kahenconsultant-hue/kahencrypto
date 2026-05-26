# API Reference

All responses include CORS headers and are designed for headless clients, WordPress plugins and embeddable widgets.

## `GET /api/v1/overview`

Returns full dashboard payload: market regime, alerts, liquidity, correlations, assets, ETF flows, sentiment, USDT risk, news grouped by category, source health and pricing plans.

## `GET /api/v1/news`

Query params:

- `category`: one of `central_banks`, `economic_data`, `financial_media`, `crypto_media`, `onchain`, `derivatives`, `stablecoins`, `etf`, `sentiment`, `geopolitics`, `alternative_data`, `exchange_health`, `volatility_regime`
- `limit`: max 120
- `grouped=true`: returns every category with 8 selected items

## `GET /api/v1/assets/:symbol`

Supported symbols in the demo: `btc`, `eth`, `sol`, `usdt`.

Returns asset intelligence, alerts, impact summaries and relevant processed news.

## `GET /api/v1/alerts`

Query params:

- `asset=BTC`
- `minLevel=Important`

## `GET /api/v1/correlations`

Returns rolling pair report plus a correlation matrix.

## `GET /api/v1/market-regime`

Returns active regime, secondary regimes, score inputs and alert context.

## `GET /api/v1/wordpress`

Compact payload for WordPress/headless widgets.

## `GET /api/cron/ingest`

Runs production ingestion foundation. It fetches enabled real sources, persists `raw_events`, `raw_metrics`, `source_health`, `ingestion_logs`, `ingestion_runs`, and `ingestion_dead_letters`, then refreshes the signal cache.

Use `Authorization: Bearer $CRON_SECRET` when `CRON_SECRET` is configured. `POST /api/cron/ingest` is also supported for manual/internal callers.

## `GET /api/v1/source-health`

Returns latest source health, latest raw events, latest raw metrics, critical source coverage and storage mode.
