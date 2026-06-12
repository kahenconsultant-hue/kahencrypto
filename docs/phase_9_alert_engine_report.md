# Phase 9 Alert Engine Report

## Scope

Phase 9 upgraded the existing C.M.I.P Smart Alert Engine without replacing ingestion, persistence, derived signals, liquidity, regime, correlation, or dashboard architecture.

## Implemented

- Added alert lifecycle metadata:
  - `expiresAt`
  - `ttlMinutes`
  - `indicatorCount`
  - `severityReasonFa`
  - `isOperational`
- Added active-alert filtering so expired alerts are excluded before dashboard/API output.
- Strengthened deduplication using alert type, affected assets, and trigger condition instead of only narrative text.
- Added a geopolitical shock alert based on real available signals:
  - `geopolitical_event_score`
  - `gold_trend_24h`
  - `dxy_trend_24h`
  - `vix_trend_24h`
  - `btc_trend_24h`
  - optional BTC/Gold and BTC/DXY correlation confirmation
- Preserved existing quality rules:
  - fewer than 3 real indicators caps confidence and prevents High/Critical severity
  - proxy alerts cannot exceed Medium priority
  - liquidity alerts are capped when ETF and exchange flow inputs are missing
  - macro alerts are capped when required FRED inputs are missing
- Updated public dashboard alert cards to show:
  - number of real indicators used
  - alert validity window
  - operational alert badge
  - human-readable severity reason

## Alert Classes Covered

- Macro pressure
- Liquidity pressure
- Volatility expansion
- Leverage trap
- Geopolitical shock
- Regime shift
- Correlation breakdown
- Source/data degradation
- Premium data missing notice
- Weak rally / liquidity mismatch

## Guardrails

- No buy/sell, entry/exit, leverage, or profit language was added.
- Missing ETF, exchange flow, whale, Glassnode, CryptoQuant, or premium data is not fabricated.
- Correlation can only increase confidence when the correlation engine returns available data.
- Operational alerts explain data quality, not directional market certainty.

## Remaining Future Work

- Persist alert lifecycle state in Supabase so expiration and deduplication can survive process restarts.
- Add an admin alert audit trail for generated/suppressed alerts.
- Add unit tests around lifecycle expiry and geopolitical trigger logic.
