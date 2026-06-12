# Phase 10 Dashboard Refocus Report

Generated: 2026-06-01

## Goal

Refocus the public C.M.I.P dashboard from a broad crypto dashboard into an intelligence workstation.

## Scope

This phase only changed dashboard ordering and a small amount of public copy. It did not change ingestion, storage, scoring engines, alert generation, or API contracts.

## New Public Dashboard Priority

1. Market Regime
2. Liquidity
3. Risk and confidence
4. Top alerts
5. One-week asset impact map
6. Macro summary and derived signals
7. Correlation
8. Sentiment and geopolitical context
9. USDT / ETF support modules
10. Latest events
11. AI summaries
12. Data quality

## Changes

- Moved `MarketRegimePanel` to the first position.
- Moved `LiquidityPanel` directly after regime.
- Grouped `BasicIntelligencePanel` with `ReliabilityStatusPanel` to make risk and confidence visible before alerts.
- Moved `TopAlertsPanel` above asset cards.
- Kept `AssetIntelligenceGrid` focused on the one-week asset impact map.
- Moved technical/supporting modules such as ETF flows, USDT risk, and data quality below core intelligence sections.
- Reworded the basic intelligence description to remove phase/debug wording from the public UI.

## Guardrails

- No new UI redesign was introduced.
- No visual-heavy price grid was promoted.
- No alert logic was changed in Phase 10.
- Admin/operations panel remains hidden unless explicitly enabled by `CMIP_SHOW_PUBLIC_OPS=true` outside production.

## Validation Target

Run:

- `npm run typecheck`
- `npm run lint`
- `npm run build`
- Smoke test `http://localhost:3004`

## Validation Result

- `npm run typecheck` — pass
- `npm run lint` — pass
- `npm run build` — pass
- Localhost smoke test — pass
  - HTTP status: `200`
  - `C.M.I.P`: present
  - `رژیم بازار`: present
  - `داشبورد نقدینگی`: present
  - `نمای پایه هوش بازار`: present
  - `هشدارهای اصلی`: present
  - Section order in rendered HTML: regime → liquidity → risk → alerts
  - Runtime error marker: absent
- Visual screenshot with wait confirmed first intelligence card is `رژیم بازار`.
