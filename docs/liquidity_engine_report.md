# C.M.I.P Liquidity Engine Report

Generated: 2026-05-25

## Existing engine retained

The existing liquidity engine was not rebuilt. It already decomposes liquidity into:

- macro liquidity
- crypto liquidity
- real spot liquidity
- leveraged liquidity
- liquidity sustainability
- leverage stress

## Hardening added

- Confidence calculation was adjusted so stale data caps confidence instead of collapsing all module confidence to zero.
- The engine now works with the reliability layer through downstream confidence caps.
- Missing ETF and on-chain data remain unavailable and are not replaced with fake numbers.

## Current state

- liquidity score: `-9`
- state: `neutral_mixed`
- confidence: `35%`
- confidence label: `weak`
- available groups: macro, stablecoins, liquidity, leverage
- missing groups: flows, onchain

## Interpretation

The engine has enough data to describe liquidity as weak/neutral, but not enough to produce a strong directional liquidity thesis. ETF flows and exchange reserve data are unavailable, so the module must remain conservative.

## Missing production data

- BTC ETF flow feed or Farside/issuer crawler
- ETH ETF flow feed
- exchange reserves via Glassnode or CryptoQuant
- more reliable derivatives source via CoinGlass
