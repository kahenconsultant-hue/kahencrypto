# Phase 14 - Regime Engine V2 Report

## Scope

Phase 14 upgraded the existing market regime engine without replacing ingestion, storage, dashboard state, liquidity, reliability or derived signal systems.

No new external data sources were added.
No fake regime data was introduced.
No deterministic buy/sell output was added.

## Implemented Changes

1. Added probabilistic regime states:
   - risk_on
   - risk_off
   - neutral
   - panic
   - squeeze
   - expansion
   - contraction
   - speculative_mania
   - deleveraging
   - unstable

2. Added candidate probability distribution for regime labels.

3. Added regime persistence model using the latest stored regime input snapshot when available.

4. Added regime instability scoring based on:
   - distance between top regime candidates
   - contradiction penalties
   - liquidity penalties
   - correlation penalties
   - leverage stress
   - missing inputs
   - macro/risk-appetite conflict

5. Added probabilistic transition context:
   - current regime
   - likely target regime
   - transition probability
   - instability score
   - transition drivers

6. Preserved the previous engine contract while extending it with optional fields:
   - probabilisticRegime
   - regimeProbabilities
   - regimePersistence
   - regimeInstability

7. Updated the existing market regime panel to display:
   - top regime probabilities
   - persistence label
   - instability label

## Integrity Rules Preserved

- Risk-On Expansion still requires multi-layer confirmation.
- Weak liquidity and rising DXY still penalize bullish regime classification.
- ETF absence reduces confidence and can affect regime instability.
- Missing data is not converted into synthetic confirmation.
- Probability is model-derived from existing real/proxy inputs and is not presented as certainty.

## Files Changed

- `src/lib/types.ts`
- `src/server/analytics/market-regime-engine.ts`
- `src/components/dashboard/panels.tsx`
- `tests/analytics-institutional-reasoning.test.ts`

## Validation

- `npm run typecheck` passed.
- `npx tsx --test tests/analytics-institutional-reasoning.test.ts` passed.

Full lint/build validation should still be run before Phase 15 if additional files are changed in the same worktree.
