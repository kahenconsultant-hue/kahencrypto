# Phase 15.2.5 — GitHub Actions Derivatives Egress Probe

Date: 2026-06-15

Status: **completed**

This phase was diagnostic only.

No Vercel production code, analytics logic, Supabase writes, Supabase secrets, scheduled jobs, environment variables, cron routes, or production application routes were changed.

## Files Added To `main`

- `.github/workflows/derivatives-egress-probe.yml`
- `scripts/diagnostics/derivatives-egress-probe.mjs`

The `main` commit was intentionally diagnostic-only:

```text
df36a269982ba8227523dfffd6401b779711320a
phase 15.2.5 add github actions derivatives egress probe [skip vercel]
```

The `[skip vercel]` marker was included to avoid triggering a Vercel deployment.

## Validation Before Push

Completed before the diagnostic workflow was pushed:

- `npm run typecheck`: passed
- `npm run lint`: passed
- `npm run build`: passed

## Production Protection Check

After pushing to `main`, Vercel deployments were checked.

No immediate new Vercel deployment from this diagnostic commit was observed. The latest visible Production deployments were older than the diagnostic workflow push, which is consistent with `[skip vercel]` preventing a deployment.

## GitHub Actions Run

- Workflow: `Derivatives Egress Probe`
- Run ID: `27550665681`
- Run URL: `https://github.com/kahenconsultant-hue/kahencrypto/actions/runs/27550665681`
- Branch: `main`
- Commit: `df36a269982ba8227523dfffd6401b779711320a`
- Trigger: `workflow_dispatch`
- Status: `completed`
- Conclusion: `success`
- Artifact: `github-actions-derivatives-egress-probe`

The workflow completed successfully. The exchange endpoint probes failed because GitHub-hosted runner egress is blocked by Binance and Bybit.

## Endpoint Results

| Provider | Endpoint | Symbol | HTTP | ms | JSON | Expected fields | Classification |
|---|---|---:|---:|---:|---:|---:|---|
| Binance | funding_rate | BTCUSDT | 451 | 318 | yes | no | geo_blocked |
| Binance | funding_rate | ETHUSDT | 451 | 74 | yes | no | geo_blocked |
| Binance | funding_rate | SOLUSDT | 451 | 9 | yes | no | geo_blocked |
| Binance | open_interest | BTCUSDT | 451 | 8 | yes | no | geo_blocked |
| Binance | open_interest | ETHUSDT | 451 | 9 | yes | no | geo_blocked |
| Binance | open_interest | SOLUSDT | 451 | 8 | yes | no | geo_blocked |
| Bybit | ticker | BTCUSDT | 403 | 155 | no | no | cloudflare_blocked |
| Bybit | ticker | ETHUSDT | 403 | 43 | no | no | cloudflare_blocked |
| Bybit | ticker | SOLUSDT | 403 | 9 | no | no | cloudflare_blocked |
| Bybit | funding_rate | BTCUSDT | 403 | 7 | no | no | cloudflare_blocked |
| Bybit | funding_rate | ETHUSDT | 403 | 8 | no | no | cloudflare_blocked |
| Bybit | funding_rate | SOLUSDT | 403 | 7 | no | no | cloudflare_blocked |
| Bybit | open_interest | BTCUSDT | 403 | 8 | no | no | cloudflare_blocked |
| Bybit | open_interest | ETHUSDT | 403 | 7 | no | no | cloudflare_blocked |
| Bybit | open_interest | SOLUSDT | 403 | 8 | no | no | cloudflare_blocked |

Summary:

- Total endpoints: `15`
- Success: `0`
- Failed: `15`
- `geo_blocked`: `6`
- `cloudflare_blocked`: `9`

## Response Evidence

Binance returned HTTP `451` for every funding and open-interest endpoint.

The response body stated that service is unavailable from a restricted location according to Binance eligibility terms.

Bybit returned HTTP `403` for every ticker, funding, and open-interest endpoint.

The response body stated that the Amazon CloudFront distribution is configured to block access from the runner country.

## Provider Viability

- Binance viable from GitHub Actions: **no**
- Bybit viable from GitHub Actions: **no**

GitHub Actions does not satisfy the minimum viable success criteria:

- Binance funding plus open interest for BTC/ETH/SOL: failed
- Bybit ticker funding/open-interest for BTC/ETH/SOL: failed
- Bybit funding plus open-interest endpoints for BTC/ETH/SOL: failed

## Final Recommendation

GitHub Actions should **not** be promoted to the derivatives worker.

Recommended next step:

1. Test Cloudflare Worker Cron as the next free egress option.
2. If Cloudflare is also blocked, use CoinGlass or an allowed-region non-Vercel worker/VPS fallback.

Do not mark derivatives as recovered from GitHub Actions.

Do not add Supabase writes or schedules for this GitHub Actions workflow.
