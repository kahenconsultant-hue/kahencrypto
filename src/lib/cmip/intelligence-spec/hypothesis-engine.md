# Hypothesis Engine

Hypotheses are competing explanations for market state. More than one may remain active. The engine must preserve the second-best hypothesis.

Rules:

- No hypothesis may be accepted without minimum evidence.
- Evidence from one independence group must not be counted multiple times.
- A hypothesis must be rejected when required conditions fail.
- A rejected hypothesis and its reason remain auditable.

| hypothesis_id | name | definition | required evidence domains | supporting conditions | contradicting conditions | minimum confirmation | rejection conditions | invalidation conditions | allowed horizons |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `bull_expansion` | Bull Expansion | Risk appetite broadens with fresh liquidity and breadth. | liquidity, breadth, momentum, institutional_flow | stablecoin growth, ETF inflow, breadth expansion | dollar strength, narrow leadership, leverage stress | 3 independent domains, no critical conflict | liquidity or breadth absent | breadth rollover, ETF reversal, liquidity contraction | 7D, 30D |
| `bull_continuation` | Bull Continuation | Existing uptrend remains supported. | momentum, market_structure, derivatives | trend intact, derivatives healthy, no distribution | high funding heat, weakening breadth | 3 independent domains | trend break plus weak breadth | trend threshold break | 1D, 7D, 30D |
| `recovery` | Recovery | A weak market starts stabilizing. | momentum, liquidity, breadth | improving breadth from depressed state | macro shock, failed retest | 2 domains plus improving data quality | recovery evidence reverses | retest fails or liquidity worsens | 7D, 30D |
| `neutral_transition` | Neutral Transition | Market lacks enough confirmation for directional posture. | data_quality, cross_asset, breadth | mixed domains, stable conflict burden | strong aligned expansion or stress | visible mixed evidence | one side gains independent confirmation | break from range with confirmation | 1D, 7D, 30D |
| `distribution` | Distribution | Price strength hides weakening participation or liquidity. | momentum, breadth, liquidity, derivatives | price up, breadth down, leverage rising | broad participation and healthy liquidity | 3 domains including contradiction | breadth confirms price | breadth recovers and leverage cools | 7D, 30D |
| `bear_continuation` | Bear Continuation | Existing downtrend persists. | momentum, liquidity, breadth | weak trend, weak liquidity, poor breadth | improving ETF/stablecoin flows | 3 independent bearish domains | trend improves with liquidity support | reclaimed trend and breadth | 7D, 30D |
| `bear_expansion` | Bear Expansion | Risk-off pressure broadens across domains. | macro, liquidity, breadth, derivatives | macro pressure, liquidity contraction, deleveraging | strong inflows and breadth recovery | 4 domains or critical source quality | data quality too weak to confirm | macro relief or liquidity recovery | 1D, 7D, 30D |
| `capitulation` | Capitulation | Forced selling and panic dominate. | derivatives, market_structure, news_geopolitical | liquidations, volatility, stress news | orderly selloff, resilient breadth | derivatives plus market stress | no forced selling evidence | liquidation wave ends and breadth stabilizes | 1D, 7D |
| `liquidity_stress` | Liquidity Stress | Funding or stablecoin conditions constrain risk. | liquidity, macro, stablecoin evidence | stablecoin contraction, high dollar pressure | expanding liquidity and lower stress | 2 direct liquidity domains | proxy-only evidence with low quality | liquidity expansion confirmed | 7D, 30D |
| `deleveraging` | Deleveraging | Leverage is being removed from the market. | derivatives, market_structure | falling open interest, liquidations, funding reset | rising leverage with stable price | derivatives evidence plus price context | OI unavailable or conflicted | OI stabilizes and funding normalizes | 1D, 7D |
