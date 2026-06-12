# Phase 9 Alert Quality Audit

Generated: 2026-06-01

## Result

`SAFE_TO_START_PHASE_10 = true`

Phase 9 alert quality passed the required QA checks after small guardrail corrections to TTL, severity explanation, and alert wording.

## Checks

| Check | Status | Evidence |
| --- | --- | --- |
| Alerts generated from real intelligence outputs | Pass | Active market alert uses DefiLlama stablecoin metrics and correlation engine status. Operational notice uses reliability/premium coverage state. |
| `indicatorCount` reflects contributing signals | Pass | Assertion matched `indicatorCount` against `dataUsed` items with `available` or `stale` status. No mismatches. |
| `severityReasonFa` is specific | Pass | Severity explanation now includes alert-type context such as stablecoin pressure, liquidity, macro, geopolitical, leverage, regime, and correlation. |
| `expiresAt` is realistic by alert type | Pass | Volatility/leverage TTL is short; macro TTL is longer than intraday volatility; geopolitical TTL is longer; operational notices use defined short TTLs. |
| Expired alerts removed from dashboard/API source | Pass | `dedupeAlerts` filters alerts where `expiresAt <= now`; QA injected an expired duplicate and it was removed. |
| Dedupe prevents repeated alerts with same cause | Pass | QA injected two duplicate live alerts and one expired duplicate; only the higher-importance live duplicate survived. |
| Operational alerts visually separated | Pass | `isOperational` field is returned and dashboard displays an `عملیاتی` badge. |
| Low-confidence alerts cannot become high-risk/systemic | Pass | QA found no alert with `confidence < 68` and `priority` high/critical. Existing quality rules cap low-input/proxy alerts. |
| No buy/sell/trading recommendation language in alert output | Pass | Alert text was scanned for buy/sell/entry/exit and Persian trading-signal phrases. No hits in alert output. |
| Persian text readability | Pass | Active alert text is concise, source-aware, and states missing inputs and confidence caps clearly. |

## QA Assertion Output

- Active alerts: 2
- Indicator mismatches: 0
- Banned trading-language hits: 0
- Low-confidence high-priority alerts: 0
- Expired visible alerts: 0
- Dedupe test result: one surviving duplicate, highest importance only

## Guardrail Corrections Applied

- Macro/geopolitical TTLs are now longer than microstructure/volatility TTLs.
- Volatility and leverage-trap alerts now have short TTLs.
- `severityReasonFa` now includes alert-type-specific reasoning instead of only generic confidence text.
- Alert-specific text no longer says “سیگنال معامله” or “سیگنال ورود/خروج”; it uses “توصیه اجرایی ارائه نمی‌کند” instead.

## Validation Commands

- `npm run typecheck` — pass
- `npm run lint` — pass
- `npm run build` — pass
- `curl -L http://127.0.0.1:3004/api/v1/alerts` — pass, returned active alerts with `indicatorCount`, `expiresAt`, `severityReasonFa`, and `isOperational`
- Localhost smoke test — pass:
  - HTTP status: `200`
  - `C.M.I.P`: present
  - `هشدارهای اصلی`: present
  - `شاخص واقعی`: present
  - `دلیل شدت هشدار`: present
  - Runtime error marker: absent
