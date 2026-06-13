# Unified Intelligence Audit

Generated: 2026-06-13

## Scope

This pass unified asset intelligence pages, the asset API, and the dashboard overview around one shared intelligence layer:

- `src/server/intelligence/unified-intelligence-engine.ts`

The new layer consumes existing production engines only:

- Fusion / Liquidity Intelligence Stack
- Liquidity Engine
- Market Regime Engine
- Macro/Risk Engine
- ETF signals from the shared signal cache
- Correlation Engine
- Sentiment Engine
- Smart Alert Engine
- Forecast Validation Center

No synthetic market data, ETF flow, exchange flow, correlation or confidence value was added.

## Dashboard vs Asset Consistency

Runtime check from the unified layer:

| Field | Value |
| --- | --- |
| Global coverage | 81% |
| Fusion active | true |
| Global mode | FULL_INTELLIGENCE |
| Dashboard liquidity state | فشار شدید نقدینگی |
| Dashboard regime | Crypto-Specific Stress |
| Unified assets | 8 |

Dashboard overview API now exposes:

- `unifiedIntelligence`
- `assets: unifiedIntelligence.assets`

Asset pages and `/api/v1/assets/:symbol` now read from the same unified output instead of the legacy `production-data.assetIntelligence` shell.

## Coverage Per Asset

| Asset | Bias | Confidence | Mode | Liquidity State | Missing Inputs |
| --- | --- | ---: | --- | --- | ---: |
| BTC | bearish | 73% | FULL_INTELLIGENCE | فشار شدید نقدینگی | 0 |
| ETH | bearish | 73% | FULL_INTELLIGENCE | فشار شدید نقدینگی | 0 |
| SOL | bearish | 74% | FULL_INTELLIGENCE | فشار شدید نقدینگی | 0 |
| USDT | bearish | 72% | FULL_INTELLIGENCE | فشار شدید نقدینگی | 1 |
| DXY | bullish | 73% | FULL_INTELLIGENCE | فشار شدید نقدینگی | 0 |
| Gold | neutral | 72% | FULL_INTELLIGENCE | فشار شدید نقدینگی | 0 |
| Nasdaq | bearish | 74% | FULL_INTELLIGENCE | فشار شدید نقدینگی | 0 |
| US10Y | neutral | 65% | FULL_INTELLIGENCE | فشار شدید نقدینگی | 3 |

## Bias Consistency

All asset pages derive bias from:

- asset-specific market/trend signals
- Fusion/liquidity state
- risk score
- sentiment score
- asset impact profile

This prevents asset pages from claiming no valid analysis while the dashboard has active Fusion, Regime and Liquidity outputs.

## Confidence Consistency

Confidence is capped by:

- global coverage
- asset signal coverage
- impact confidence
- forecast confidence
- partial/full mode cap

The previous mechanical low fallback from isolated asset shells is removed from the asset display path.

## Suppressed Outputs

Suppressed legacy no-data outputs: 0 at runtime after unified execution.

The old static `assetIntelligence` object remains only as legacy unused data in `production-data.ts`; active routes no longer consume it.

## UI Changes

- Removed the `پایش لحظه‌ای` button from the header.
- Header alert count now comes from `generateSmartAlerts()` and excludes suppressed alerts.
- Replaced user-facing `نیمه‌زنده` label with `بروز شده`.
- Replaced user-facing `رایگان` wording with `عمومی`.

## Asset Page Components Added

Every asset page now shows:

- Visual score gauges
- Shared Fusion/Regime/Liquidity/Macro/ETF/Correlation/News inherited states
- Driver cards
- Headwind cards
- Risk and invalidation cards
- Correlation cards
- Forecast validation widget
- Related smart alerts
- Source signal transparency

## Remaining Blockers

1. Some legacy dashboard panels still contain no-data text for their own module-specific empty states. They are not used by the unified asset page path.
2. Asset confidence is intentionally capped below global coverage when an asset has missing inputs or weaker forecast/impact confirmation.
3. US10Y still has more missing inputs than other assets, so confidence remains lower.

## Result

Asset pages no longer operate as isolated engines. They now inherit the shared intelligence context and fall back to partial intelligence rather than invalid no-data output when Fusion is active and global coverage is above 50%.
