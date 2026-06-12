# Phase 14.7 — Alert Suppression, Geopolitical Noise, Correlation History Audit

Date: 2026-06-11

Scope:
- No new dashboards.
- No new data sources.
- No new indicators.
- No synthetic data.
- Only analytical consistency, alert quality, geopolitical filtering, correlation history control, and liquidity explainability were hardened.

## Summary

Phase 14.7 closes the remaining quality risks before Phase 15 by enforcing strict visibility rules:

- Low-quality alerts are suppressed before dashboard/API output.
- Administrative or generic policy notices are rejected from geopolitical classification.
- Correlation narratives are disabled when historical coverage is insufficient or relationship strength is weak.
- Correlation confidence is capped by history coverage.
- Liquidity output now exposes a contribution breakdown so users can see why the score moved.

## Alert Quality Audit

Smart alert output after suppression:

| Metric | Count |
|---|---:|
| Visible alerts | 1 |
| Suppressed alerts | 2 |
| Rejected alerts | 1 |

Suppressed examples:

| Alert | Reason | Confidence | Coverage | Quality | Label |
|---|---|---:|---:|---:|---|
| stablecoin-pressure-proxy-alert | coverage زیر ۲۵٪ است | 22 | 22 | 43 | LOW |
| premium-data-missing-notice | confidence زیر ۲۰٪ است؛ coverage زیر ۲۵٪ است؛ quality زیر ۲۵٪ است؛ کمتر از دو indicator واقعی دارد؛ Alert Quality Gate خروجی را REJECTED کرده است | 0 | 0 | 12 | REJECTED |

Rules enforced:

- Alerts with confidence below 20 are not visible.
- Alerts with coverage below 25 are not visible.
- Alerts with quality below 25 are not visible.
- Alerts with fewer than two real indicators are not visible.
- `REJECTED` quality alerts are suppressed.

Result:

- No low-quality alert remains visible.
- Operational/premium missing notices no longer masquerade as market alerts.
- Alert quality is now calculated from signal quality, data coverage, source reliability, and freshness.

## Geopolitical Noise Audit

The geopolitical classifier now accepts only events tied to:

- war
- sanctions
- energy disruption
- military conflict
- sovereign debt crisis
- export controls
- trade restrictions
- diplomatic escalation
- infrastructure/cyber conflict
- strategic resource disruption

Automatically rejected noise includes:

- appointments
- committee meetings
- routine statements
- administrative notices
- generic Treasury notices
- ceremonial announcements
- routine press releases

Current accepted high-impact geopolitical items:

| Title | Relevance | Impact |
|---|---:|---:|
| ریسک ژئوپلیتیک: Trump cancels Iran strikes scheduled for Thursday evening | 100 | 90 |
| ریسک ژئوپلیتیک: New CFTC Rules on Prediction Markets Would Ban Wagers on Ouster of US Enemies | 100 | 73 |

Result:

- Generic Treasury/administrative notices are no longer classified as geopolitical risk.
- Geopolitical events below the quality threshold do not affect sentiment, regime, or alerts.

## Correlation History Audit

Audited pairs:

| Pair | Narrative Status | History Coverage Factor | Confidence | Insufficient Windows |
|---|---|---:|---:|---|
| BTC ↔ ETH | Disabled | 100 | 73 | none |
| BTC ↔ SOL | Disabled | 100 | 75 | none |
| BTC ↔ DXY | Disabled | 100 | 70 | none |
| BTC ↔ US10Y | Disabled | 100 | 45 | none |
| BTC ↔ Nasdaq | Insufficient Historical Coverage | 0 | null | 7d: 0/5, 30d: 0/20, 90d: 0/60 |
| BTC ↔ Gold | Insufficient Historical Coverage | 0 | null | 7d: 0/5, 30d: 0/20, 90d: 0/60 |
| BTC ↔ Stablecoin Market Cap | Insufficient Historical Coverage | 0 | null | 7d: 0/5, 30d: 0/20, 90d: 0/60 |

Aggregate:

| Metric | Value |
|---|---:|
| Pairs audited | 7 |
| Insufficient-history pairs | 3 |
| Confidence cap violations | 0 |

Rules enforced:

- No directional narrative is generated when historical coverage is insufficient.
- No directional narrative is generated for weak relationships.
- Pair confidence cannot exceed historical coverage.
- Missing history produces `null`, not `0`.

Result:

- Correlation output no longer overclaims.
- Weak or insufficient correlations are shown as limited/insufficient instead of being interpreted directionally.

## Liquidity Contribution Breakdown

Current Liquidity Health Score: `0`

Contribution breakdown:

| Layer | Contribution | Source |
|---|---:|---|
| Macro | 1 | DXY + US10Y |
| Stablecoin | Missing | DefiLlama stablecoin trend |
| ETF | -12 | BTC/ETH ETF flow module |
| Spot | -4 | Spot volume trend |
| Derivatives | Missing | Funding, open interest and futures/spot volume pressure |
| Sentiment | Missing | Market-relevant sentiment unavailable |

Result:

- Liquidity score is now explainable by layer.
- Missing layers remain missing.
- No unavailable liquidity input is converted into a synthetic value.

## Validation

Commands run:

| Command | Result |
|---|---|
| `npx tsx --test tests/analytics-self-check.test.ts tests/analytics-institutional-reasoning.test.ts` | Passed, 34/34 |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed |
| `npm run build` | Passed |

Runtime/CSS smoke:

- `http://127.0.0.1:3004` returned HTTP 200.
- Main CSS asset returned HTTP 200.
- CSS content type was `text/css; charset=UTF-8`.
- CSS asset length was 21825 bytes.
- Playwright screenshot tooling timed out waiting for the dev-server load event, but direct HTTP checks confirm the app route and CSS bundle are served correctly.

## Success Criteria

| Criterion | Status |
|---|---|
| No visible alert confidence below 20 | Passed |
| No visible alert coverage below 25 | Passed |
| No visible alert quality below 25 | Passed |
| No generic Treasury notice treated as geopolitical risk | Passed |
| No correlation narrative from insufficient history | Passed |
| Correlation confidence capped by history coverage | Passed |
| Liquidity contribution breakdown available | Passed |
| No synthetic data introduced | Passed |
| Typecheck/lint/build pass | Passed |

## Remaining Risks

- BTC ↔ Nasdaq, BTC ↔ Gold, and BTC ↔ Stablecoin Market Cap need more aligned historical samples before directional correlation narratives can be enabled.
- Some liquidity layers remain unavailable because no reliable direct source is configured. They correctly reduce confidence instead of producing fake data.
- Dev-server visual screenshot automation timed out on load-event wait, but route/CSS HTTP checks passed.

## Gate Decision

SAFE_TO_START_PHASE_15 = true

