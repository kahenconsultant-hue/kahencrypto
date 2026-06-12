# Phase 14.7 — Final Analytics Calibration & Signal Quality Hardening

Generated: 2026-06-11

## Scope

No new dashboards, data sources, external providers, asset classes, or new indicators were added.

This pass only tightened analytical consistency, liquidity interpretation, correlation validity, sentiment/news quality filtering, geopolitical noise filtering, confidence calibration, and the ETF stage timeout behavior required for a reliable final gate.

## Changes Applied

### Liquidity Consistency

- `LiquidityHealthScore` is now the single displayed health score for the Liquidity Intelligence Stack.
- Liquidity classification bands were normalized:
  - `0-20`: Severe Liquidity Stress
  - `21-40`: Weak Liquidity
  - `41-60`: Neutral
  - `61-80`: Healthy
  - `81-100`: Expansion
- Liquidity Stack still keeps sub-engine contributions for diagnostics, but its final displayed score/class now derives from `LiquidityHealthScore`.
- Integrity validation now flags any mismatch between stack score/class and the main liquidity engine.

Final runtime:

- LiquidityHealthScore: `0/100`
- Classification: `فشار شدید نقدینگی`
- Liquidity consistency violations: `0`

### Correlation Validity

- Correlation minimum sample requirements were hardened:
  - `24h`: at least `12` hourly observations
  - `7d`: at least `30` aligned daily observations
  - `30d`: at least `90` aligned daily observations
  - `90d`: at least `180` aligned daily observations
- Daily correlation alignment now removes weekend buckets before calculation.
- Cross-market correlations remain daily only; hourly crypto data is not mixed with daily macro/FRED/Yahoo/Stooq-style data.
- Correlation confidence now uses:
  - `30%` sample quality
  - `25%` stability
  - `20%` persistence
  - `15%` freshness
  - `10%` regime consistency
- Weak relationships are capped:
  - `abs(corr) < 0.10`: max confidence `45%`
  - `abs(corr) < 0.20`: max confidence `60%`
  - `abs(corr) < 0.30`: max confidence `70%`
- Directional narrative requires an available signal and `abs(correlation) >= 0.30`.

Final runtime:

- Correlation coverage: `22%`
- Correlation engine confidence: `22%`
- Valid pairs: `7/10`
- Correlation confidence violations: `0`

### News and Geopolitical Noise Filtering

- Sentiment headlines now require quality gates:
  - market relevance >= `40`
  - impact score >= `45`
  - confidence >= `20`
  - source quality >= `45`
- Geopolitical headlines require stricter directness:
  - geopolitical relevance >= `70`
  - impact score >= `70`
- Administrative, appointment, ceremonial, committee, routine enforcement, generic statement, and personnel notices are rejected from geopolitical impact.
- The geopolitical RSS adapter no longer treats generic `Treasury`, `White House`, `oil`, or `security` mentions as geopolitical risk by themselves.
- Accepted geopolitical terms are constrained to real market-risk categories such as war, sanctions, energy disruption, military conflict, sovereign debt crisis, export controls, trade restrictions, diplomatic escalation, and capital controls.

Final runtime:

- Accepted sentiment/news items: `114`
- Positive: `2`
- Negative: `30`
- Neutral: `82`
- Neutral remains dominant.
- Directional sentiment confirmation:
  - positive high-impact independent sources: `2`
  - negative high-impact independent sources: `3`
- Geopolitical noise violations: `0`
- Sentiment noise violations: `0`

### Sentiment Calibration

- Sentiment shock is not allowed from a single source.
- If directional pressure is not confirmed by at least two independent high-impact sources, the final sentiment score is pulled back toward neutral.
- Existing category weights remain:
  - crypto-native: `40%`
  - macro: `20%`
  - institutional: `15%`
  - regulatory: `15%`
  - geopolitical: `10%`

Final runtime:

- Raw sentiment score: `-14`
- Final sentiment score: `-14`
- Directional confirmation existed, so the final score was not forcibly neutralized.

### ETF Stage Reliability

During validation, the staged scheduler initially produced:

- ETF stage: `failed`
- ETF duration: `20006 ms`
- Error: `Stage 4: ETF timed out after 20000ms`
- Scheduler status: `degraded`
- Operational reliability: `80`
- Market reliability: `89`

Root cause:

- The ETF stage was bounded at `20s`, but Farside plus The Block fallback could consume too much of that stage budget before persistence and stage finalization completed.

Fix:

- Farside fetch timeout reduced from `5000 ms` to `3000 ms`.
- The Block fetch timeout reduced from `8000 ms` to `6000 ms`.
- No ETF value is estimated or fabricated.
- Last-valid/cache behavior remains bounded and non-blocking.

Final scheduler run:

- Run ID: `2c4f9ac9-28bb-4e72-80dc-c465d831783f`
- Scheduler status: `success_with_limited_confidence`
- Failed stage: `null`
- Dead letters: `0`
- ETF stage status: `success_with_limited_confidence`
- ETF stage duration: `15978 ms`
- Fusion stage status: `success_with_limited_confidence`

## Final Runtime Scores

| Metric | Final |
|---|---:|
| Source Reliability | `100` |
| Freshness | `100` |
| Coverage | `69` |
| Analytics Quality | `84` |
| Operational Reliability | `89` |
| Market Reliability | `90` |
| Engine Reliability | `100` |
| Fusion Health | `85` |
| Confidence Consistency | `100` |
| Overall Platform Health | `83` |
| Production Readiness | `94` |

## Integrity Gate

| Gate | Result |
|---|---:|
| Liquidity Consistency Violations | `0` |
| Correlation Confidence Violations | `0` |
| Freshness Consistency Violations | `0` |
| Geopolitical Noise Violations | `0` |
| Sentiment Noise Violations | `0` |
| Operational Reliability >= 85 | `89` |
| Market Reliability >= 90 | `90` |
| Production Readiness >= 90 | `94` |

## Validation

- `npm run typecheck`: passed
- `npm run lint`: passed
- `npm run build`: passed
- `npx tsx --test tests/analytics-self-check.test.ts tests/analytics-institutional-reasoning.test.ts`: passed, `30/30`
- `npm run ingest:once`: passed with `success_with_limited_confidence`
- Public dashboard smoke test: `/` returned `200`
- CSS smoke test: linked `/_next/static/css/app/layout.css` returned `200`, `text/css`, length `32128`
- Data Health smoke test: `/admin/data-health` returned `200`

## Gate Decision

SAFE_TO_START_PHASE_15 = true

Reason:

- No contradiction remains in liquidity classification.
- Weak correlations are no longer allowed to carry inflated confidence.
- Low-value geopolitical/news items are excluded from sentiment impact.
- Sentiment is not allowed to become directional without independent confirmation.
- ETF stage no longer fails the scheduler and completes under the 20-second stage cap.
- Production Readiness is above the required threshold.
