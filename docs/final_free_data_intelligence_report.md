# Final Free Data Intelligence Report

## Verification summary

The free-data-plus-proxies architecture is active and persisted to Supabase.

- TypeScript: passed
- ESLint: passed
- Production build: passed after stopping the dev server to avoid `.next` dev/build contention
- Manual ingestion: passed
- Supabase verification: passed
- Browser check: dashboard loaded at `http://localhost:3004/` and shows C.M.I.P, proxy signals, and reliability status

## Last ingestion run

- `runId`: `e104edad-6d59-405b-8d19-5c33c58fd860`
- `storageMode`: `supabase`
- `pulledEvents`: 185
- `pulledMetrics`: 20
- `rawEventsInserted`: 2
- `rawEventsUpdated`: 183
- `normalizedEventsCreated`: 204
- `eventClustersCreated`: 201
- `duplicatesDetected`: 3
- `failedSources`: 2
- `deadLetters`: 2

## Supabase row counts

- `sources`: 17
- `source_health`: 15
- `raw_events`: 204
- `raw_metrics`: 240
- `ingestion_logs`: 132
- `processing_errors`: 0
- `dead_letters`: 54
- `normalized_events`: 204
- `event_clusters`: 201
- `derived_signals`: 12
- `liquidity_scores`: 2
- `regime_inputs`: 2
- `reliability_snapshots`: 12
- `ingestion_runs`: 12

## Current intelligence state

- `coreReliability`: 0.68
- `premiumCoverage`: 0
- `analysisMode`: `free_data_plus_proxies`
- `overallStatus`: `healthy`
- Active free sources observed by reliability layer: 9
- Available core modules: macro pressure, asset price context, liquidity proxy, leverage proxy, RSS sentiment context, geopolitical context

## Generated derived signals

- `macro_pressure_proxy`: score 22, confidence 77, quality delayed, source type proxy
- `crypto_liquidity_proxy`: score -2, confidence 72, quality partial_live, source type proxy
- `leverage_stress_proxy`: score -8, confidence 65, quality partial_live, source type proxy
- `institutional_risk_appetite_proxy`: score 21, confidence 63, quality partial_live, source type proxy; missing BTC ETF flow
- `volatility_regime_proxy`: score -7, confidence 74, quality partial_live, source type proxy
- `stablecoin_liquidity_signal`: score -11, confidence 68, quality delayed, source type derived

## Liquidity and regime outputs

- Liquidity: score -7, source type proxy, quality partial_live, confidence 48
- Regime: Neutral / Transition, active macro uncertainty, source type proxy, quality partial_live, confidence 52

## Alerts

The system generated notices based on real reliability state, not fake market conditions:

- `data_degradation_alert`: core data warning for affected tracked assets
- `premium_data_missing_notice`: premium coverage missing notice for BTC, ETH, SOL and USDT modules

## Constraint status

No fake ETF flows, whale data, exchange reserves, institutional data, or fabricated confidence scores were introduced. Missing premium data is shown as missing premium coverage and does not block core proxy analysis.

