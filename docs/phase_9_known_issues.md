# Phase 9 Known Issues

Generated: 2026-06-01

## Blocking Issues

None.

## Non-Blocking Issues

1. Alert lifecycle is calculated in memory.
   - `expiresAt` and dedupe are correct for current generated alerts.
   - Future improvement: persist alert lifecycle state in Supabase so resolved/expired alerts can be audited across process restarts.

2. Only two alerts are active in the current data snapshot.
   - This is acceptable because Phase 9 QA requires avoiding static/demo alerts.
   - More alerts will appear only when multi-factor trigger conditions align.

3. Premium-source limitations still cap liquidity confidence.
   - ETF flows and exchange inflows/outflows are still missing.
   - Current liquidity/stablecoin alert correctly caps confidence at 55%.

4. Geopolitical alert logic exists but is not active in the current snapshot.
   - It requires geopolitical score plus at least two defensive confirmations from Gold, DXY, VIX, or BTC.
   - Suppression is correct when confirmation is insufficient.

5. QA checks are currently command-based, not a committed test suite.
   - Future improvement: add formal tests for alert TTL, dedupe, expiry, and language guardrails.

## Phase 10 Readiness

The alert engine is safe enough for Phase 10 dashboard refocus because:

- Active alerts expose data used and missing inputs.
- Low confidence cannot escalate to High/Critical.
- Proxy and operational alerts are labeled.
- No expired alerts are emitted.
- No static/demo alert output was detected.
