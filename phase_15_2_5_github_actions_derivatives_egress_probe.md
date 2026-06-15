# Phase 15.2.5 — GitHub Actions Derivatives Egress Probe

Date: 2026-06-15

Status: **workflow pushed to `cmip-evolution`, blocked before GitHub Actions execution**

This phase is diagnostic only. No Vercel production code, analytics logic, Supabase writes, Supabase secrets, or scheduled jobs were added.

## Files Created

- Workflow: `.github/workflows/derivatives-egress-probe.yml`
- Diagnostic script: `scripts/diagnostics/derivatives-egress-probe.mjs`

## Local Commit

- Commit: `4f2703f`
- Commit message: `phase 15.2.5 add github actions derivatives egress probe`

## Validation

Completed before commit:

- `npm run typecheck`: passed
- `npm run lint`: passed
- `npm run build`: passed

## Push Status

Initial push failed because the previous GitHub credential did not have permission to create or update workflow files.

GitHub rejected the push with:

```text
refusing to allow a Personal Access Token to create or update workflow `.github/workflows/derivatives-egress-probe.yml` without `workflow` scope
```

This is a GitHub token permission issue, not a repository, code, build, or workflow syntax issue.

After a GitHub token with workflow permission was provided, the push succeeded:

```text
cmip-evolution -> cmip-evolution
```

## GitHub CLI Status

`gh` is not installed or not available in the current shell environment, so the workflow could not be triggered through GitHub CLI from this machine.

GitHub REST API dispatch was attempted for branch `cmip-evolution`:

```text
POST /repos/kahenconsultant-hue/kahencrypto/actions/workflows/derivatives-egress-probe.yml/dispatches
{"ref":"cmip-evolution"}
```

GitHub returned:

```text
404 Not Found
```

Reason: GitHub `workflow_dispatch` workflows must be discoverable from the repository default branch. The repository default branch is `main`, while the diagnostic workflow currently exists on `cmip-evolution`.

## GitHub Actions Run

- Run ID: unavailable
- Run status: not started
- Logs: unavailable
- Artifacts: unavailable

No GitHub Actions execution result exists yet. No endpoint viability conclusion has been made from GitHub-hosted runners.

## Endpoint Result Table

Not available yet because the workflow has not run on GitHub-hosted infrastructure.

The diagnostic script is ready to test:

| Provider | Metrics |
|---|---|
| Binance | BTC/ETH/SOL funding rate and open interest |
| Bybit | BTC/ETH/SOL ticker, funding history, and open interest |

## Provider Viability

Current status:

- Binance viable from GitHub Actions: unknown
- Bybit viable from GitHub Actions: unknown

Reason: GitHub Actions run has not executed.

## Manual/Access Steps Required

To continue, choose one of these:

1. Put the workflow on the repository default branch `main`, then run workflow dispatch.

   Risk: if Vercel is linked to GitHub `main`, a commit to `main` may trigger a Vercel deployment. This should not be done without explicit approval because this phase says not to change Vercel production.

2. Change the repository default branch to `cmip-evolution`, then dispatch the workflow.

   Risk: repository-level setting change, not recommended just for a probe.

3. Manually copy/add `.github/workflows/derivatives-egress-probe.yml` to `main` from GitHub UI, then run it.

   Same Vercel/deployment risk as option 1.

After the workflow file is available on GitHub default branch:

1. Open GitHub repository: `kahenconsultant-hue/kahencrypto`
2. Go to **Actions**
3. Select **Derivatives Egress Probe**
4. Choose branch `cmip-evolution`
5. Click **Run workflow**
6. Download the artifact named `github-actions-derivatives-egress-probe`

Expected artifacts:

- `github_actions_derivatives_probe_result.json`
- `github_actions_derivatives_probe_report.md`

## Pass / Fail Criteria

GitHub Actions is viable if either condition passes:

- Binance funding rate and open interest work for BTC, ETH, and SOL
- Bybit ticker returns funding/open-interest for BTC, ETH, and SOL, or Bybit funding plus open-interest endpoints work for BTC, ETH, and SOL

GitHub Actions fails if:

- Binance returns `451` restricted location
- Bybit returns `403` country blocked
- both providers timeout or block all derivatives endpoints

## Final Recommendation

No final worker recommendation can be made until the workflow runs on GitHub-hosted infrastructure.

Immediate next step:

**Get explicit approval before pushing a workflow-only commit to `main`, or confirm that Vercel is not auto-deploying from `main`.**

If GitHub Actions is blocked too, the next diagnostic target should be Cloudflare Worker Cron.
