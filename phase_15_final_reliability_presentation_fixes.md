# C.M.I.P Final Reliability and Presentation Fixes

## Implemented

- FRED `DTWEXBGS` is normalized as `USD_BROAD`, publicly labeled `Broad USD Index` / `شاخص گسترده دلار آمریکا`, and explicitly marked as a proxy rather than classic DXY.
- True DXY providers retain the `DXY` label.
- Public macro evidence includes source type, source symbol, technical label, proxy status, freshness, data timestamp, and fetch timestamp.
- Derivatives coverage is component-based: Funding 35%, Open Interest 35%, Liquidations 20%, cross-exchange coverage 10%.
- Missing liquidation data caps derivatives coverage at 70% and confidence at 60% when exchange coverage is limited.
- Derivatives Audit records scope, exchanges used, available components, and applied coverage/confidence caps.
- Public derivatives language now states that the data is exchange-scoped and not a complete market view.
- Confidence cap reasons explicitly identify missing liquidation, exchange-level scope, broad USD proxy usage, stale macro data, and last-trading-day ETF data.
- Persian report containers use native RTL Unicode, isolated mixed numeric rows, shared Persian font fallbacks, and a font-ready marker for browser/PDF export.
- Public report generation is blocked when Persian text integrity validation detects replacement characters, presentation glyphs, or excessive fragmented letters.

## Runtime Sample Verification

- `شاخص گسترده دلار آمریکا` rendered for the active FRED `DTWEXBGS` source.
- Technical source rendered as `FRED DTWEXBGS — Nominal Broad U.S. Dollar Index`.
- No `DXY + FRED DTWEXBGS` source mislabel was present.
- Derivatives component coverage rendered as `70%`, not `100%`.
- Derivatives confidence rendered at or below `60%`.
- Missing liquidation and exchange-level proxy warnings rendered publicly.
- Persian replacement-character count: `0`.
- Desktop and 390px mobile layouts had no page-level horizontal overflow.

## Validation

- Typecheck: passed.
- Lint: passed.
- Tests: 81 passed.
- Production build: passed.

## Remaining Limitations

- No complete public liquidation stream is collected; this remains explicitly missing.
- Derivatives data remains an exchange-level proxy and does not represent the total derivatives market.
- `DTWEXBGS` remains useful only as a broad dollar-strength proxy; it is not DXY.
- The project has no dedicated server-side PDF endpoint. Browser/print export uses the validated HTML and exposes a font-ready marker so an exporter can wait for `document.fonts.ready`.

