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
id: dpl_DjgxbAP7627fduqj1aE5GuW3S1Dt
target: production
status: READY
deploymentUrl: https://kahencrypto-dni68l88j-kahenconsultant-hues-projects.vercel.app
productionAlias: https://kahencrypto.vercel.app
```

Use this cron URL in cron-job.org:

```text
https://kahencrypto.vercel.app/api/cron/ingest
```

## Required Authorization Header

cron-job.org must send:

```http
Authorization: Bearer <INGESTION_CRON_SECRET>
X-CMIP-Scheduler-Source: cron-job.org
```

Do not put the secret in the URL query string.

## cron-job.org Recommended Configuration

- URL: `https://kahencrypto.vercel.app/api/cron/ingest`
- Method: `GET`
- Schedule: every 30 minutes
- Timeout: at least 300 seconds if available
- Headers:
  - `Authorization: Bearer <INGESTION_CRON_SECRET>`
  - `X-CMIP-Scheduler-Source: cron-job.org`
- Expected success HTTP status: `200`

## First External Cron Execution Verification

Pending. This cannot be honestly marked complete until cron-job.org executes the deployed production endpoint.

Required checks after first external execution:

- HTTP status
- duration
- runId
- trigger = `cron_http`
- schedulerSource = `external_cron_job_org`
- executionEnvironment = `production`
- storage = `supabase`
- failedStage = `null`, or documented reason
- stale sources
- stale signals

## Production Readiness Gate

Production readiness remains blocked until at least 24 hours of external scheduler executions are observed.

Current status:

```text
PRODUCTION_READY_FOR_SCHEDULER_TRUST = false
```

Reason:

- External scheduler path has not yet accumulated 24 hours of production run history.

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

Still pending:

- first real cron-job.org execution
- 24 hours of external production scheduler observations
