# C.M.I.P Phase 1 Safe-To-Phase-2 Gate

Date: 2026-05-26  
Scope: readiness check after Phase 1 debt cleanup

## Cleanup Checklist

| Item | Status |
| --- | --- |
| Helpers that convert missing/real data into static values identified | complete |
| Safe replacements made | complete |
| Unsafe/helper migrations marked for Phase 2 | complete |
| Public dashboard direct intelligence-engine imports removed | complete |
| Small dashboard service adapter created | complete |
| Operational/debug panel hidden from public dashboard by default | complete |
| Supabase persistence untouched | complete |
| Ingestion pipeline untouched | complete |
| Advanced intelligence features not started | complete |

## Files Added Or Changed

Added:

- `src/server/dashboard/dashboard-service.ts`
- `docs/phase_1_debt_cleanup_report.md`
- `docs/phase_1_safe_to_phase_2.md`

Changed:

- `src/components/dashboard/panels.tsx`
- `src/app/page.tsx`
- `src/app/liquidity/page.tsx`

## Validation

| Check | Status |
| --- | --- |
| `npm run typecheck` | passed |
| `npm run lint` | passed |
| `npm run build` | passed |
| smoke test `http://localhost:3004` | passed |

Smoke test checks:

- `C.M.I.P` visible
- dashboard navigation visible
- reliability/regime content visible
- operational pipeline panel hidden from public dashboard by default

## Phase 2 Migration Queue

The following items should be handled in Phase 2, not hidden:

1. Replace `deriveBaseScores()` neutral fallback logic with unavailable-aware score components.
2. Remove or quarantine `marketSignalSnapshot`.
3. Replace static `moduleDataSourceStatus` with live module status derived from reliability/source health.
4. Make asset impact and scenario vectors nullable instead of `?? 0`.
5. Add a production guard for `CMIP_ALLOW_DEV_FALLBACK`.
6. Replace hard-floor source mapping confidence in `asset-intelligence-engine.ts`.
7. Evolve `dashboard-service.ts` from adapter seam into a canonical dashboard data contract.

## Gate

`SAFE_TO_START_PHASE_2 = true`
