# Phase 12.6 - Liquidity Intelligence Stack

Scope: build a unified liquidity intelligence stack before Phase 13 without fabricating missing market data.

## Implemented architecture

Created `Liquidity Intelligence Stack` with five independently measurable engines:

- Stablecoin Engine
- ETF Intelligence Engine
- Derivatives Engine
- Macro Calendar Engine
- Sentiment Liquidity Engine
- Liquidity Fusion Engine

The stack is implemented in `src/server/analytics/liquidity-intelligence-stack.ts`.

## Stablecoin Engine

Inputs:

- `usdt_supply_7d`
- `usdc_supply_7d`
- `total_stablecoin_market_cap_usd`
- `stablecoin_market_cap_7d`
- `stablecoin_market_cap_30d`
- `stablecoin_dominance`

Output:

- Stablecoin Growth Score 0-100
- Classification: Contraction, Weak, Neutral, Expansion, Strong Expansion
- Coverage, confidence, freshness, missing inputs, source count and last update

No stablecoin dominance is estimated if the real source is unavailable.

## ETF Intelligence Engine

Inputs:

- `btc_etf_flow_24h`
- `eth_etf_flow_24h`

Source upgrade:

- Added Farside Investors fetch attempt in `src/server/data/etf-flow-module.ts`.
- BTC URL: `https://farside.co.uk/us-bitcoin-etf-flow-all-data/`
- ETH URL: `https://farside.co.uk/ethereum-etf-flow-all-data/`
- Existing env-based configured ETF feed remains supported.

Rules:

- No ETF flow is estimated from price, volume, market cap or Yahoo volume.
- If Farside/configured feed is unavailable or unparsable, ETF Engine status is `Missing`.
- Missing ETF data contributes no synthetic score and reduces fusion confidence.

## Derivatives Engine

Inputs:

- BTC/ETH/SOL funding rates
- BTC/ETH/SOL open interest
- BTC futures volume
- BTC spot volume

Outputs:

- Derivatives Risk Score
- Derivatives Liquidity Score
- Leverage Pressure Score
- Classification: Healthy, Elevated, Speculative, Extreme

If derivatives data is unavailable, the engine is Missing. No exchange-level precision is invented.

## Sentiment Liquidity Engine

Inputs:

- Existing relevance-filtered sentiment engine
- Market relevance scores from Phase 12.5

Rules:

- Administrative central-bank/news notices below relevance threshold are excluded.
- Sentiment liquidity is only produced when enough relevant headlines exist.

## Macro Calendar Engine

Inputs:

- FRED CPI, PPI, Fed Funds, unemployment
- DXY, US10Y, VIX
- TradingEconomics remains optional

Outputs:

- Macro Event Risk Score
- Liquidity Shock Probability
- Upcoming Event Risk stays Missing when calendar source is not available

No upcoming macro calendar event is fabricated.

## Liquidity Fusion Engine

Default weights:

- Stablecoin Engine: 40%
- ETF Engine: 20%
- Derivatives Engine: 15%
- Macro Calendar Engine: 15%
- Sentiment Engine: 10%

If an engine is Missing, weights are redistributed proportionally across available score-eligible engines.

Guardrail:

- Sentiment is supplementary and cannot produce a final liquidity score by itself.
- If no structural liquidity layer is available (`stablecoin`, `ETF`, `derivatives`, or `macro_calendar`), the final fusion score is `null` and the UI explains that structural liquidity data is insufficient.

Final classification:

- 0-25: Liquidity Stress
- 25-45: Weak Liquidity
- 45-60: Neutral Liquidity
- 60-75: Supportive Liquidity
- 75-100: Expansion Liquidity

Narratives are generated through the strict liquidity narrative validator. A low score cannot render as neutral/supportive.

## Dashboard integration

Liquidity Dashboard now shows a top-level Liquidity Intelligence Stack panel:

- Stablecoin Score
- ETF Score
- Derivatives Score
- Macro Event Score
- Sentiment Score
- Final Liquidity Score
- Confidence
- confirming engines
- unavailable engines
- each engine status, coverage, confidence and classification

The legacy liquidity decomposition remains below it for continuity.

## Data Health integration

`/admin/data-health` now includes `Liquidity Intelligence Health` with:

- Status
- Coverage
- Confidence
- Freshness
- Missing Inputs
- Source Count
- Last Update
- Fusion contribution
- Redistributed weight

## Alert integration

Liquidity-related alerts now reference Fusion Engine context:

- confirmed engines
- weak/disagreeing engines
- unavailable engines
- fusion score
- fusion narrative

Alert confidence remains capped by coverage and unavailable critical inputs.

## New collectors / scrapers / APIs

New source support:

- Farside Investors ETF flow pages via server-side HTML fetch in ETF flow module.

No new paid API dependency was added.

## Before / after

Before:

- Liquidity dashboard mixed stablecoin, macro, ETF and derivatives signals inside one summary.
- Missing ETF/derivatives inputs were visible, but their engine-level impact was not separately measurable.

After:

- Each liquidity component is independently scored, classified and visible.
- Missing engines do not contribute fabricated values.
- Fusion score is based only on engines with real usable inputs.

## Remaining missing premium inputs

- Exchange inflows
- Exchange outflows
- Whale tracking
- Glassnode/CryptoQuant exchange reserves
- Deep on-chain metrics
- Full TradingEconomics calendar unless API key is configured

## No-fabrication confirmation

- No fake ETF flow was added.
- No fake whale data was added.
- No fake exchange inflow/outflow was added.
- No fake on-chain metrics were added.
- Unavailable data remains explicitly Missing and does not enter the fusion score.
