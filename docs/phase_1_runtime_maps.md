# C.M.I.P Phase 1 Runtime Maps

Date: 2026-05-26  
Mode: audit-only

## Project Tree Map

```text
.
├── docs/
├── scripts/
├── services/
│   └── python/
├── src/
│   ├── app/
│   │   ├── admin/
│   │   ├── api/
│   │   ├── assets/
│   │   └── embed/
│   ├── api/
│   ├── collectors/
│   ├── components/
│   ├── config/
│   ├── health/
│   ├── lib/
│   ├── processors/
│   ├── queues/
│   ├── server/
│   │   ├── ai/
│   │   ├── alerts/
│   │   ├── analytics/
│   │   ├── data/
│   │   ├── ingestion/
│   │   ├── intelligence/
│   │   ├── supabase/
│   │   └── wordpress/
│   ├── storage/
│   ├── styles/
│   └── types/
├── supabase/
│   └── migrations/
└── tests/
```

## Dependency Map

```text
Dashboard server components
  -> analytics engines
  -> signal cache
  -> data adapters
  -> storage local/Supabase readers

API routes
  -> analytics engines
  -> ingestion pipeline
  -> storage local/Supabase readers
  -> reliability engine

Ingestion pipeline
  -> production source registry
  -> collector runner / retry queue
  -> RSS collector
  -> market signal collector
  -> storage layer
  -> normalization
  -> clustering
  -> reliability snapshots

Market signal collector
  -> server/data/adapters
  -> Binance/CoinGecko/DefiLlama/Yahoo/Stooq-style public paths where available
  -> unavailable values when source/API is not available

Analytics engines
  -> getSignalSnapshot()
  -> derived signal snapshots
  -> reliability caps
  -> typed engine outputs
```

## Ingestion Map

```text
/api/cron/ingest
  -> runProductionIngestion()
  -> refreshSignalCache()
  -> runDerivedSignalProcessing()

/api/v1/refresh
  -> refreshSignalCache()
  -> runProductionIngestion() when stale
  -> runDerivedSignalProcessing()

scripts/local-ingestion-scheduler.mjs
  -> repeat/manual ingestion execution

runIngestionFoundation()
  -> persist source definitions
  -> run enabled collectors with retry
  -> dedupe raw events by dedup_hash
  -> persist raw_events
  -> persist raw_metrics
  -> persist source_health
  -> persist ingestion_logs
  -> persist dead_letters
  -> normalize recent raw_events
  -> cluster normalized_events
  -> persist reliability_snapshot
```

## State Management Map

```text
Browser
  -> AppShell interval every 30 minutes
  -> fetch /api/v1/refresh
  -> router.refresh()

Server request render
  -> direct engine calls in dashboard panels
  -> sync cache/local readers where used

Durable state
  -> Supabase tables when configured
  -> local fallback JSONL under .cache/cmip/ingestion when Supabase unavailable

Runtime cache
  -> src/server/data/signal-cache.ts
  -> memoized signal snapshot and return series in market-signals.ts
```

## API Map

| API | Reads/writes | Notes |
| --- | --- | --- |
| `/api/cron/ingest` | writes raw/normalized/health/logs/derived/reliability | protected by ingestion secret when configured |
| `/api/v1/refresh` | writes signal cache/ingestion/derived when stale | called by AppShell timer |
| `/api/v1/overview` | reads engines and shell production data | large combined payload; should become canonical dashboard contract later |
| `/api/v1/assets/[symbol]` | reads asset shell, asset impact, alerts, news summaries | asset data shell is safe but static |
| `/api/v1/alerts` | reads smart alert engine | generated from direct/proxy/reliability inputs |
| `/api/v1/correlations` | reads correlation engine | has sample-size guards |
| `/api/v1/market-regime` | reads regime engine | proxy-aware |
| `/api/v1/news` | reads latest raw events | grouped by deterministic category labels |
| `/api/v1/source-health` | reads ingestion and reliability | operational endpoint |
| `/api/v1/reliability` | reads reliability engine | core vs premium coverage |
| `/api/v1/environment` | reads env/Supabase status | operational endpoint |
| `/api/v1/wordpress` | reads WordPress payload builder | headless-compatible |

## Component Map

```text
src/app/page.tsx
  -> ReliabilityStatusPanel
  -> MarketRegimePanel
  -> DerivedSignalsPanel
  -> TopAlerts
  -> MacroSummaryPanel
  -> AssetIntelligenceGrid
  -> UsdtRiskPanel
  -> EtfFlowsPanel
  -> LiquidityDashboard
  -> CorrelationMap
  -> SentimentDashboard
  -> GeopoliticalRiskPanel
  -> LatestNewsFeed
  -> AiSummariesPanel
  -> DataQualityPanel
  -> OperationsPanel

src/app/assets/[symbol]/page.tsx
  -> AssetDashboard
  -> asset-specific intelligence, alerts, scenario and source mapping

src/app/admin/page.tsx
  -> AdminConsole

src/app/admin/ingestion/page.tsx
  -> ingestion run, storage mode, Supabase write status, source health, reliability, dead letters

src/components/layout/app-shell.tsx
  -> Sidebar
  -> Header
  -> Disclaimer
  -> automatic 30 minute refresh call
```

## Source Registry Map

Core/free enabled sources currently include:

- C.M.I.P public market signal adapters
- Federal Reserve RSS
- ECB RSS
- US Treasury RSS
- SEC public press releases
- CoinDesk RSS
- Cointelegraph RSS
- CNBC Markets RSS
- Decrypt RSS
- CryptoSlate RSS
- Blockworks RSS

Optional API-key sources include:

- FRED API
- Trading Economics API
- Whale Alert API
- CoinGlass API
- Glassnode API
- CryptoQuant API

Optional sources are disabled unless their env keys exist. Missing optional sources should not block core free/proxy intelligence.

## Test Map

Current tests:

- `tests/analytics-self-check.test.ts`
- `tests/analytics-scoring.test.ts`
- `tests/analytics-institutional-reasoning.test.ts`

Coverage currently includes:

- insufficient correlation samples
- BTC/DXY sign narrative guard
- unavailable ETF data not scored
- stale data confidence caps
- liquidity quality drops with missing inputs
- independent signal group threshold
- estimated data makes confidence unavailable
- DXY normalization direction
- risk-on multi-layer confirmation
- regime penalties
- liquidity V2 speculative overheating
- weak correlation classification

