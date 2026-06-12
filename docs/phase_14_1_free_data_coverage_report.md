# Phase 14.1 - Free Data Coverage Expansion

## Scope

No paid APIs were added. No Glassnode, CryptoQuant, CoinGlass Pro, or fabricated exchange-flow data was introduced.

This phase expanded free-source coverage and proxy-safe handling for:

- CoinAnk public derivatives validation endpoints.
- MacroMicro BTC exchange balance proxy page.
- CoinGecko historical market data for BTC, ETH and SOL.
- DefiLlama historical stablecoin market-cap series.

## Source Integration Results

| Source | Use | Runtime result | Quality handling |
| --- | --- | --- | --- |
| CoinAnk | Funding/open-interest validation fallback and BTC liquidation confirmation | Public API currently rejects unauthenticated access with code `403` / `system error` | Marked unavailable. No liquidation value is fabricated. |
| MacroMicro | BTC exchange balance / reserve trend proxy | Page is Cloudflare-challenged in this runtime | Marked unavailable. No exchange-reserve proxy value is fabricated. |
| CoinGecko | BTC/ETH/SOL market-cap history and latest market-cap fallback | Integrated with `market_chart` history and `coins/markets` fallback | Direct public API data, quality delayed. |
| DefiLlama | Stablecoin market-cap 7d/30d/total history | Integrated 180 historical points after string timestamp parser fix | Direct public API data, quality delayed. |

## Before / After Coverage

Measured from `/api/v1/reliability`.

| Metric | Before | After |
| --- | ---: | ---: |
| Overall reliability | 0.70 | 0.80 |
| Core reliability | 0.71 | 0.82 |
| Premium coverage | 0.33 | 0.45 |
| Macro coverage | 0.74 | 0.87 |
| Crypto coverage | 0.77 | 0.89 |
| Liquidity coverage | 0.52 | 0.60 |
| Derivatives coverage | 0.65 | 0.73 |
| Sentiment coverage | 0.79 | 0.90 |
| Geopolitical coverage | 0.83 | 0.97 |

## Correlation Coverage

Before the DefiLlama historical parser fix, `BTC ↔ Stablecoin Market Cap` had no usable observations and the correlation report had 9 valid pairs out of 10 with 74% coverage.

After the fix:

- DefiLlama stablecoin market-cap history: 180 points.
- Valid correlation pairs: 10/10.
- Correlation coverage: 100%.
- `BTC ↔ Stablecoin Market Cap` is available with 7d/30d/90d samples.
- Narrative remains non-directional because correlation is statistically weak.

## Signal Quality

Final signal cache:

```json
{
  "total": 47,
  "live": 15,
  "delayed": 22,
  "proxy": 0,
  "unavailable": 4,
  "estimated": 0
}
```

`proxy` is now a first-class data quality label. No active proxy value was produced in this run because both CoinAnk and MacroMicro were blocked/unavailable.

## Fusion / Liquidity Result

Final overview:

- Liquidity score: `-20`
- Liquidity data quality: `partial_live`
- Liquidity data coverage: `83%`

The directional liquidity score did not become artificially more positive because CoinAnk and MacroMicro did not provide usable values. Coverage improved through real CoinGecko and DefiLlama history, while exchange inflows/outflows remain missing.

## Remaining Missing Inputs

Still unavailable by design:

- `liquidation_btc_24h`: CoinAnk rejected unauthenticated public access.
- `exchange_reserves_btc_7d`: MacroMicro page is Cloudflare-challenged.
- `exchange_inflows`: no configured reliable free source.
- `exchange_outflows`: no configured reliable free source.

These missing inputs do not generate fake values and should continue to reduce confidence where relevant.

## Validation

Passed:

- `npm run typecheck`
- `npm run lint`
- `npm run build`
- Direct `refreshSignalCache()` with `.env.local`
- `/api/v1/reliability` after refresh
- `/api/v1/correlations` after refresh
- `/api/v1/overview` after refresh
- `/admin/data-health` smoke test
- Browser smoke test on `http://127.0.0.1:3004`

## Conclusion

Phase 14.1 succeeded where free public data was actually available:

- CoinGecko historical market data is more resilient.
- DefiLlama stablecoin history now feeds correlation and liquidity context.
- Proxy quality is explicit and not presented as direct data.
- Missing/free-blocked sources remain unavailable, not fabricated.

The main remaining gap is not implementation structure; it is public-source accessibility for CoinAnk and MacroMicro.
