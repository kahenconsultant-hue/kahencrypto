# C.M.I.P Phase 1 Debt Cleanup Report

Date: 2026-05-26  
Scope: surgical cleanup before Phase 2

## Runtime Changes Made

This cleanup intentionally avoided broad runtime changes. It added a dashboard adapter layer and hid operational panels from public pages by default.

Changed files:

- `src/server/dashboard/dashboard-service.ts`
- `src/components/dashboard/panels.tsx`
- `src/app/page.tsx`
- `src/app/liquidity/page.tsx`

## 1. Helpers That Still Convert Real Data Into Dry/Static Values

The following helpers were identified during the Phase 1 debt pass.

| File/function | Current behavior | Action now | Phase 2 target |
| --- | --- | --- | --- |
| `src/server/analytics/market-signals.ts` - `marketSignalSnapshot` | Contains legacy static values such as `fedRepricing`, `liquidationDensity`, `whaleExchangeInflow`, `fearGreed`, ETH/SOL activity proxies. `rg` did not find active imports outside the defining file. | Not removed in this cleanup to avoid deleting an exported compatibility surface before Phase 2. | Remove or quarantine behind a clearly named legacy/test-only module. |
| `src/server/analytics/market-signals.ts` - `deriveBaseScores()` | Uses `?? 0` in score formulas, which can convert missing inputs into neutral-looking score components. | Not changed now because liquidity and regime engines still depend on this helper for legacy score fields. | Replace with nullable score components and require explicit unavailable state where data is missing. |
| `src/server/analytics/asset-impact-engine.ts` - `buildAssetVector()` | Some asset-specific vectors use `?? 0` when a market signal is missing. Confidence gating prevents full certainty, but scores can still become neutral. | Not changed now because it would affect asset cards broadly. | Make vector fields nullable and prevent impact scoring when critical per-asset inputs are unavailable. |
| `src/server/analytics/scenario-engine.ts` - `assetTrend()` and scenario modifiers | Missing trend values fall back to `0`. | Not changed now because scenarios depend on current score shape. | Use unavailable-aware scenario output and show "insufficient data" when core trend is missing. |
| `src/lib/data-source-status.ts` - `moduleDataSourceStatus` | Static module status map can differ from live `source_health`. | Not changed now because many UI badges depend on this object. | Replace with dashboard service data derived from source health and reliability. |
| `src/lib/production-data.ts` - shell objects | Empty/safe shells for assets, news groups, USDT risk, pricing plans and source health. These do not fabricate market data, but some cards can feel static or sparse. | Not changed now because UI still imports shell content for non-market copy and layout. | Move static copy to content config and keep market data exclusively in live/proxy services. |
| `src/server/data/adapters.ts` - `CMIP_ALLOW_DEV_FALLBACK` | Development fallback can produce estimated values only if the env flag is explicitly set. Default is unavailable. | Left intact because it is opt-in and useful for local development. | Add production guard that refuses dev fallback when `NODE_ENV=production`. |
| `src/server/ai/asset-intelligence-engine.ts` - `calculateSourceMappingConfidence()` | Uses a hard floor/cap range via `Math.max(44, Math.min(92, ...))`. | Not changed now because it affects asset source-mapping confidence broadly. | Replace with adaptive confidence and allow unavailable/low confidence below the hard floor. |

## 2. Public Dashboard Direct Engine Imports

Before cleanup, `src/components/dashboard/panels.tsx` imported directly from:

- `@/server/analytics/*`
- `@/server/alerts/*`
- `@/server/ai/*`
- `@/server/intelligence/*`
- `@/collectors/*`
- `@/health/*`
- `@/storage/*`

This made public UI components tightly coupled to internal intelligence engines and operational storage.

Cleanup action:

- Added `src/server/dashboard/dashboard-service.ts`.
- `panels.tsx` now consumes dashboard service functions instead of importing engines directly.
- The service is server-only and currently acts as a small adapter seam, not a full rewrite.

Post-cleanup verification:

```text
rg "@/server/(analytics|alerts|ai|intelligence)|@/collectors|@/health|@/storage" src/components/dashboard/panels.tsx src/app/page.tsx src/app/liquidity/page.tsx
```

No matches remain in the public dashboard component/page files.

## 3. Operational Blocks In Public Dashboard

Operational/debug block found:

- `OperationsPanel` in `src/app/page.tsx`
- `OperationsPanel` in `src/app/liquidity/page.tsx`

Cleanup action:

- Both pages now hide `OperationsPanel` unless:

```text
CMIP_SHOW_PUBLIC_OPS=true
and
NODE_ENV !== "production"
```

This preserves the component for development and admin reuse, while preventing raw pipeline/source-health blocks from appearing in the public dashboard by default.

The admin ingestion route remains available:

- `/admin/ingestion`

## 4. What Was Intentionally Not Changed

The following were not changed in this cleanup because they alter analytics behavior and belong in Phase 2 or later:

- scoring formulas
- confidence formulas
- liquidity logic
- regime logic
- correlation logic
- ingestion scheduler
- Supabase persistence
- source registry
- normalization/clustering
- alert generation rules

## 5. Risk Assessment

Low risk changes:

- service adapter layer only centralizes imports
- public ops visibility is gated by env
- no database schema changes
- no collector changes
- no score formula changes
- no AI behavior changes

Remaining debt:

- several helper functions still need unavailable-aware migration
- public dashboard still renders some data-quality detail, but not raw operational pipeline summary
- service adapter is an intermediate seam; Phase 2 should evolve it into a normalized dashboard data contract

