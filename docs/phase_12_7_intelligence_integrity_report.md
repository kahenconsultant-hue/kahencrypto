# Phase 12.7 - Intelligence Integrity & Consistency Engine

Scope: add a strict validation layer before Phase 13 so C.M.I.P prefers `Unknown` or downgraded output over confident but unsupported analysis.

## Implemented

Created `src/server/analytics/intelligence-integrity-engine.ts`.

The engine validates:

- Regime consistency
- Liquidity consistency
- Risk consistency
- Sentiment contamination
- Asset impact confidence
- Alert severity and confidence
- Correlation sample/significance integrity
- ETF narrative integrity
- Signal freshness thresholds

## Dashboard integration

Added Integrity Dashboard visibility in:

- Public dashboard: high-level integrity card without raw operational logs
- `/admin/data-health`: full integrity dashboard with violations, corrections, missing inputs, stale/freshness issues and rejected narratives
- `/api/v1/overview`: `integrity` payload

## Alert hardening

`generateSmartAlerts()` now passes alerts through `validateAndCorrectAlerts()`.

Rules enforced:

- High severity requires at least 3 real indicators, 2 independent sources, coverage > 60 and confidence > 60.
- Critical severity requires coverage > 75, confidence > 75, at least 4 indicators and at least 3 confirmations.
- Low-confidence alerts cannot remain high/systemic.
- Proxy-based alerts are capped at medium severity.
- Confidence cannot exceed data coverage unless source diversity confirms it.
- Expired alerts are filtered before validation output.

## Sentiment relevance v2

Strengthened filtering for operational/administrative news:

- Bank personnel changes
- Board appointments
- Committee meetings
- Internal notices
- Routine enforcement / legal notices

High-value market categories receive stronger relevance:

- FOMC
- Rate decisions
- CPI / PPI / NFP
- ETF approval / ETF flow
- Large exchange failures
- Stablecoin events
- Treasury liquidity / sanctions / geopolitical shocks

Events below relevance 40 remain excluded from sentiment scoring.

## Freshness enforcement

Freshness thresholds:

- Macro: 14 days
- News / sentiment / geopolitical: 7 days
- ETF flows: 3 days
- Funding / derivatives / volume: 24 hours
- Default fast market signals: 90 minutes

Stale signals are reported and cannot improve confidence or alert severity.

## ETF integrity

If ETF flow is unavailable:

- ETF status remains Missing
- No synthetic ETF value is generated
- No proxy ETF value is generated
- Narratives claiming institutional/ETF improvement are flagged by integrity validation

## Correlation integrity

The integrity layer flags:

- Directional correlation narratives without available samples
- Directional narratives when absolute correlation is below 0.20
- Correlation confidence that is too high for low observation depth

## Validation outputs

The integrity report returns:

- Consistency issues found
- Corrections applied
- Narratives rejected
- Signals downgraded
- Confidence adjustments
- Remaining integrity risks

## No-fabrication confirmation

No fake ETF flow, exchange flow, whale data, on-chain metric or institutional demand proxy was added.

Missing data remains Missing. Unsupported conclusions are downgraded, capped or flagged.
