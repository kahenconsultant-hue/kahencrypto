# External Scheduler Setup Report

Generated: 2026-06-12

## Objective

Deploy C.M.I.P on Vercel Hobby while moving 30-minute ingestion scheduling to a free external scheduler path using cron-job.org.

## Scope

- Keep `/api/cron/ingest` synchronous inside the request lifecycle.
- Disable Vercel Cron configuration that violates Hobby plan limits.
- Deploy production successfully.
- Provide the production cron URL and required authorization header format.
- Make Data Health distinguish local/manual runs, external cron production runs, and failed production runs.
- Do not mark production ready until at least 24 hours of external scheduler runs are observed.

## Changes Applied

### Vercel Cron Disabled

`vercel.json` no longer declares the `*/30 * * * *` Vercel Cron schedule.

Reason:

- Vercel Hobby does not support the requested 30-minute cron cadence in this project deployment path.
- External scheduling is now expected to call the production cron endpoint.

### Cron Route Safety

`/api/cron/ingest` remains synchronous:

- It does not return `202`.
- It does not use post-response `setTimeout`.
- It awaits `runStagedScheduledIngestion(...)` before responding.
- A failed stage is visible in the HTTP response.

### Scheduler Classification

Scheduler runs now carry explicit metadata:

- `trigger`
- `schedulerSource`
- `executionEnvironment`
- `storageMode`
- `schedulerStorageMode`
- `ingestionStorageMode`

External cron-job.org calls are identified when the request includes:

```http
X-CMIP-Scheduler-Source: cron-job.org
```

The scheduler trigger remains:

```text
cron_http
```

This preserves the existing trigger contract while allowing Data Health to classify the run as an external production cron execution.

### Data Health Visibility

The Data Health Scheduler Dashboard now shows:

- latest trigger
- scheduler source
- execution environment
- scheduler storage mode
- external production run count
- local/manual run count
- failed production run count

Scheduler dashboard data now prefers Supabase `telemetry_logs` when available, so production runs are visible even when Vercel serverless instances do not share local filesystem cache.

## Production Cron URL

Production deploy completed successfully.

Production deployment:

```text
id: dpl_32K6BPTzpapJ5Y4HuywFkXgEH6SF
target: production
status: READY
deploymentUrl: https://kahencrypto-ce37nyplc-kahenconsultant-hues-projects.vercel.app
productionAlias: https://kahencrypto.vercel.app
```

Use this cron URL in cron-job.org:

```text
https://kahencrypto.vercel.app/api/cron/ingest
```

## Required Authorization Header

Preferred format for clients that can send `Authorization`:

```http
Authorization: Bearer <INGESTION_CRON_SECRET>
X-CMIP-Scheduler-Source: cron-job.org
```

cron-job.org strips or does not persist custom secret headers in job details. For cron-job.org, use its built-in Basic Auth fields:

```text
Basic Auth username: cmip-cron
Basic Auth password: <INGESTION_CRON_SECRET>
```

Keep the non-secret source header:

```http
X-CMIP-Scheduler-Source: cron-job.org
```

Do not put the secret in the URL query string.

## cron-job.org Recommended Configuration

- URL: `https://kahencrypto.vercel.app/api/cron/ingest`
- Method: `GET`
- Schedule: every 30 minutes
- Timeout: at least 300 seconds if available
- Headers:
  - `X-CMIP-Scheduler-Source: cron-job.org`
- Auth:
  - Basic Auth enabled
  - username `cmip-cron`
  - password `<INGESTION_CRON_SECRET>`
- Expected success HTTP status: `200`

## cron-job.org Job Creation

Created via cron-job.org REST API on 2026-06-12.

```text
jobId: 7801183
title: C.M.I.P Production Ingestion
schedule: minutes [0, 30], every hour/day/month/weekday
timezone: Europe/Paris
enabled: true
requestTimeout: 300 seconds
```

Configured request headers:

```http
X-CMIP-Scheduler-Source: cron-job.org
```

Configured auth:

```text
Basic Auth username: cmip-cron
Basic Auth password: <redacted INGESTION_CRON_SECRET>
```

The cron-job.org API initially returned `{"jobId":7801183}`. The first scheduled requests reached Vercel at 22:22 and 22:30 CEST but returned `401` because cron-job.org did not persist/send the `Authorization` header. A follow-up attempt to use `X-CMIP-Cron-Secret` also showed that cron-job.org did not persist the secret custom header. The endpoint was then hardened to also accept Basic Auth with username `cmip-cron` and password equal to `INGESTION_CRON_SECRET`.

## First External Cron Execution Verification

Initial external execution observations:

| Time Europe/Paris | Source | Vercel Status | cron-job.org Result | Finding |
| --- | --- | ---: | ---: | --- |
| 2026-06-12 22:30 | cron-job.org | 401 | 401 Unauthorized | `Authorization` header was not sent/persisted by cron-job.org. |
| 2026-06-12 23:00 | cron-job.org | 401 | 401 Unauthorized | Basic Auth was configured with the cron-job.org API token, not the real C.M.I.P ingestion secret. |
| 2026-06-12 23:30 | cron-job.org | 200 | timeout after ~30s | Auth reached the app, but full sequential ingestion exceeded cron-job.org's practical timeout window. |

Corrective action:

- cron-job.org now uses Basic Auth username `cmip-cron` and the real `INGESTION_CRON_SECRET`.
- `/api/cron/ingest` still completes ingestion inside the request lifecycle.
- For `schedulerSource=external_cron_job_org`, ingestion stages 1-4 now run in parallel and fusion runs afterward. This keeps the endpoint synchronous while reducing wall-clock runtime for cron-job.org.
- For `schedulerSource=external_cron_job_org`, collector retry budget is capped to one attempt per scheduled run. This avoids spending cron-job.org's 30-second practical response window on repeated retries; unavailable sources are persisted as failed/degraded and retried on the next scheduled cycle.

Production-style manual verification after retry-budget hardening:

```text
HTTP status: 200
duration observed by client: ~15.5 seconds
runId: ffa990a0-976c-4675-b1cb-59949ce827df
trigger: cron_http
schedulerSource: external_cron_job_org
executionEnvironment: production
storage: supabase
failedStage: market_data
retryCount: 0
route durationMs: 12557
```

Stage result:

```text
market_data: failed, 10.1s, no retries, 66 metrics persisted
macro_data: success, 9.8s
news: success, 7.6s
etf: success_with_limited_confidence, 8.1s, The Block fallback, Farside Cloudflare blocked
fusion: degraded, 1.4s
```

The production endpoint now completes inside cron-job.org's practical 30-second window when invoked with the same Basic Auth and `X-CMIP-Scheduler-Source: cron-job.org` header. A real scheduled cron-job.org execution after this deployment is still required for production scheduler trust.

cron-job.org execution history before the latest retry-budget deployment:

| jobLogId | Result |
| ---: | --- |
| 1 | 401 Unauthorized |
| 2 | 401 Unauthorized |
| 3 | Timeout after ~30s |
| 4 | Timeout after ~30s |

Required checks after first successful real external execution:

- HTTP status: `200`
- cron-job.org duration: `19630ms`
- app runId: `2ea09374-7b2a-4090-98ce-8c1e2a2f120b`
- app durationMs: `15215`
- trigger = `cron_http`
- schedulerSource = `external_cron_job_org`
- executionEnvironment = `production`
- storage = `supabase`
- failedStage = `market_data`
- stale signals: `14`

Real cron-job.org execution after retry-budget deployment:

| Planned UTC | Actual UTC | cron-job.org HTTP | cron-job.org duration | App status | App failed stage | Finding |
| --- | --- | ---: | ---: | --- | --- | --- |
| 2026-06-12 22:30:00 | 2026-06-12 22:30:45 | 200 | 19.63s | failed | market_data | External scheduler path works and completes under 30s; market data sources fail inside Vercel runtime. |

Latest app-side scheduler stage summary:

| Stage | Status | Duration | Failed Sources | Dead Letters |
| --- | --- | ---: | ---: | ---: |
| market_data | failed | 12.94s | 3 | 3 |
| macro_data | success | 13.06s | 0 | 0 |
| news | success | 8.64s | 0 | 0 |
| etf | success_with_limited_confidence | 8.96s | 0 | 0 |
| fusion | degraded | 1.33s | 14 | 0 |

Market data root cause:

```text
binance-public-rest: failed in Vercel production runtime
bybit-public-rest: failed in Vercel production runtime
cmip-public-market-signal-adapters: failed because Binance market adapter and Bybit derivatives adapter are treated as blocking core adapters
```

This is not an external scheduler failure. It is a production data-source availability/classification issue. No fake market data was generated.

## Production Readiness Gate

Production readiness remains blocked until at least 24 hours of external scheduler executions are observed.

Current status:

```text
PRODUCTION_READY_FOR_SCHEDULER_TRUST = false
```

Reason:

- External scheduler path has one successful real cron-job.org execution after the latest deployment, but has not yet accumulated 24 hours of production run history.
- App-side scheduler status is still `failed` because `market_data` is failed in the Vercel production runtime.

## Production Deployment Checks

Completed:

- Vercel production deploy succeeded.
- `https://kahencrypto.vercel.app` returned HTTP `200`.
- `https://kahencrypto.vercel.app/admin/data-health` returned HTTP `200`.
- `https://kahencrypto.vercel.app/api/v1/environment` returned Supabase configured and connected.
- Unauthenticated `https://kahencrypto.vercel.app/api/cron/ingest` returned HTTP `401`.

Production environment API reported:

```json
{
  "supabaseConfigured": true,
  "supabaseConnected": true,
  "serviceRoleAvailable": true,
  "activeStorageMode": "supabase",
  "lastIngestionRun": {
    "storageMode": "supabase",
    "failedSources": 0,
    "deadLetters": 2
  }
}
```

DNS note:

- During verification, one `curl` request to `/api/v1/news?grouped=true` hit a transient local DNS resolution error.
- The production alias resolved immediately afterward and root/data-health checks succeeded.

## Local Validation

Completed before deployment:

- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run build` passed.

## Deployment Verification

Completed:

- production deploy
- production root endpoint verification
- production Data Health endpoint verification
- production cron unauthorized guard verification
- first real cron-job.org execution after retry-budget hardening: HTTP `200`, `19.63s`

Still pending:

- 24 hours of external production scheduler observations
- production market data blocker resolution for Binance/Bybit or reclassification to limited-confidence fallback when real CoinGecko/Yahoo data is available
