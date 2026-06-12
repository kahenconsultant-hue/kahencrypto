# Phase 12.5 - Intelligence Quality Hardening

Scope: no new intelligence feature was added. This pass tightened existing engines so scores, confidence, narratives, freshness and alert severity remain consistent with available data.

## Top 20 inconsistencies fixed

1. Liquidity no longer uses a loose neutral fallback when the health score is below 45.
2. Liquidity now has strict health classes: stress, weak, neutral, supportive, expansion.
3. Liquidity condition follows strict classification, not only legacy signed score state.
4. Liquidity narratives are blocked from optimistic wording when health is stress or weak.
5. Liquidity confidence is capped by real input coverage.
6. Liquidity confidence receives explicit penalties for missing ETF flow, exchange flows, funding, OI and stale inputs.
7. Regime confidence is now coverage-capped instead of only reliability-capped.
8. Regime scoring receives stale-signal penalties so old data cannot strengthen classification.
9. Alerts no longer count stale indicators as real contributing indicators.
10. Alert confidence cannot exceed data coverage unless at least two independent source confirmations exist.
11. Alert severity is capped by evidence count, coverage, stale inputs and proxy/estimated inputs.
12. Alert quality score was added and displayed to separate weak evidence from stronger alerts.
13. Alert cards now expose data coverage, supporting signals, missing signals and confidence cap reason.
14. Data Health alert audit now displays coverage, supporting signals, invalidation and alert quality.
15. Sentiment scoring now filters low-relevance administrative Fed/Treasury/ECB notices below relevance 40.
16. Sentiment headlines now carry market relevance score and relevance label.
17. USDT risk panel no longer stays descriptive only; it reports risk, stability, freeze risk and unavailable network distribution honestly.
18. USDT network concentration is marked missing when direct TRON/ERC20 concentration is unavailable.
19. Correlation cards now display statistical strength, confidence per pair and minimum observation rules.
20. Correlation health table now exposes strength classification instead of only raw values.

## Confidence before/after

- Before: module confidence could remain higher than actual data coverage when optional or premium inputs were missing.
- After: liquidity, regime and alerts apply a coverage cap. Stale, missing ETF flow, missing exchange flow, missing whale/premium on-chain and proxy-derived inputs reduce confidence.
- Exception rule remains conservative: confidence can only exceed raw coverage when at least two unrelated sources confirm the signal.

## Narrative contradictions before/after

- Before: weak liquidity could still appear as neutral or mixed without strong warning language.
- After: strict liquidity narrative is prepended and enforced. If a stress/weak liquidity narrative contains optimistic expansion/supportive language, the fallback conservative narrative is used.

## Liquidity classification accuracy

Strict mapping now used:

- 0-25: Liquidity Stress
- 25-45: Weak Liquidity
- 45-60: Neutral Liquidity
- 60-75: Supportive Liquidity
- 75-100: Expansion Liquidity

The dashboard displays the health score on a 0-100 scale and labels the strict class directly.

## Sentiment relevance accuracy

Each normalized event now receives Market Relevance Score 0-100 based on:

- crypto relevance
- macro relevance
- historical market-impact category
- asset linkage
- novelty

Rules enforced:

- Below 40: ignored for sentiment score
- 40-70: low impact
- 70-85: important
- 85+: high impact

Administrative notices are capped at 30 unless they include explicit market-moving content such as CPI, rate decisions, sanctions, crypto, ETF or Treasury yield signals.

## Alert quality score

Alert quality now combines:

- data coverage
- confidence
- fresh indicator count
- independent source confirmation
- stale/estimated penalties

Stale and estimated signals cannot increase alert severity. Alerts with fewer than 3 real indicators cannot become high or critical. Proxy-only alerts remain capped at medium.

## Validation status

- Typecheck: passed during implementation.
- Lint/build/smoke: run after this report in the final validation step.
