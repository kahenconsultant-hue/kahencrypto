# Phase 2 Demo Logic Cleanup Report

Date: 2026-05-29

Scope: surgical cleanup only. No ingestion rewrite, no new collectors, no AI intelligence build, no Supabase schema changes.

## Removed

| Area | File | Removed behavior |
|---|---|---|
| Legacy static market snapshot | `src/server/analytics/market-signals.ts` | Removed `marketSignalSnapshot`, including fixed constants such as `fedRepricing`, `liquidationDensity`, `whaleExchangeInflow`, `fearGreed`, ETH/SOL activity placeholders and USDT risk placeholders. |
| Static source quality export | `src/server/analytics/market-signals.ts` | Removed module-load `sourceQualityLayer` export so consumers must use fresh `getSignalSnapshot().sourceQualityLayer`. |
| Fake AI processing trace | `src/server/ai/pipeline.ts` | Removed `generateProcessingTrace()` and `AiProcessingTrace`, which returned completed pipeline stages and fixed latencies without real jobs. |
| Unused hardcoded asset intelligence engine | `src/server/ai/asset-intelligence-engine.ts` | Deleted unused static engine containing hardcoded regimes, timestamps, confidence floors and long fixed narratives. |

## Guarded

| Area | File | Guard |
|---|---|---|
| Development fallback values | `src/server/data/adapters.ts` | `CMIP_ALLOW_DEV_FALLBACK=true` now refuses to produce estimated values in `NODE_ENV=production`. Production paths return `unavailable` instead. |
| Base score derivation | `src/server/analytics/market-signals.ts` | `deriveBaseScores()` now ignores unavailable/estimated components instead of converting every missing input to neutral zero before weighting. |
| Scenario probabilities | `src/server/analytics/scenario-engine.ts` | Scenario engine now refuses to probability-rank base/bullish/bearish scenarios unless at least four independent signal groups and critical macro/liquidity inputs are available. |

## Public UI Cleanup

| File | Change |
|---|---|
| `src/components/dashboard/panels.tsx` | Removed public-facing pipeline phrases such as `raw event`, `normalized_events`, `AI/translation`, and `فازهای بعدی` from dashboard cards. |
| `src/server/ai/event-explanation-layer.ts` | Replaced worker/debug wording with user-facing Persian explanations about unavailable smart translation. |
| `src/server/wordpress/adapter.ts` | Removed raw pipeline wording from WordPress payload summaries. |
| `src/server/analytics/sentiment-engine.ts` | Replaced `normalized_event` terminology in public explanations with “رویداد خبری معتبر”. |

## Dynamic Status Improvements

`src/server/dashboard/dashboard-service.ts` now exposes `getDashboardModuleDataSourceStatus()` so dashboard/API status badges are derived from available signals, raw events, ingestion health and stale refresh state instead of only static module labels.

Routes updated to use the dynamic status service:

- `src/app/api/v1/overview/route.ts`
- `src/app/api/v1/news/route.ts`
- `src/app/api/v1/alerts/route.ts`
- `src/app/api/v1/correlations/route.ts`
- `src/app/api/v1/market-regime/route.ts`
- `src/app/api/v1/assets/[symbol]/route.ts`
- `src/app/api/v1/wordpress/route.ts`

## Not Changed Intentionally

The first active-engine migration slice has started. See `docs/phase_2_active_engine_null_handling_report.md`.

The following areas still contain legacy `?? 0` compatibility behavior and should be migrated before Phase 2 closes:

- `src/server/analytics/derived-signal-engine.ts`
- `src/server/analytics/divergence-engine.ts`
- `src/server/alerts/smart-alert-engine.ts`
- `src/server/analytics/correlation-engine.ts`
- `src/server/analytics/scoring-engine.ts`
- required numeric output fields in active engine contracts that still need nullable/unavailable output support

Reason: these files are active intelligence paths. Replacing all null-to-zero behavior at once would change broad runtime behavior and risk breaking existing UI/API contracts. Phase 2 is migrating them in small verified slices.

## Current Rule After Cleanup

No removed path now fabricates:

- static asset narratives
- fixed asset confidence by horizon
- static regime by horizon
- fake AI stage completion
- fixed fake market constants
- estimated adapter values in production
