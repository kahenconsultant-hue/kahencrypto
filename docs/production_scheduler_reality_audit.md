# PHASE 14.6.1 — Production Scheduler Reality Audit

Audit date: 2026-06-12  
Scope: audit only. No code changes, no deployment, no scheduler configuration changes.

## Executive Answer

### 1. Is 30-minute ingestion currently happening in deployed production?

**NO.**

### 2. Why exactly?

- The project exists on Vercel as `kahencrypto`.
- Vercel reports **no deployments found** for the project.
- Production logs for the last 7 days return **No logs found**.
- The attempted production deployment was rejected by Vercel because the project is on the Hobby plan and `vercel.json` defines a 30-minute cron:

```json
{
  "crons": [
    {
      "path": "/api/cron/ingest",
      "schedule": "*/30 * * * *"
    }
  ]
}
```

Vercel deployment error:

```text
Hobby accounts are limited to daily cron jobs.
This cron expression (*/30 * * * *) would run more than once per day.
Upgrade to the Pro plan to unlock all Cron Jobs features on Vercel.
```

Therefore there is currently no deployed production runtime capable of executing the cron.

## Vercel Audit

### Project

- Project name: `kahencrypto`
- Owner: `kahenconsultant-hues-projects`
- Project ID: `prj_2xruJJedVbWlRRq2Ii45apq60wGW`
- Framework: Next.js
- Created: 2026-06-12

### Deployment History

Vercel CLI result:

```text
No deployments found under kahenconsultant-hues-projects.
```

### Production Logs

Vercel CLI result:

```text
No logs found for kahenconsultant-hues-projects/kahencrypto
```

### Vercel Cron Configuration

Configured schedule in repository:

```text
*/30 * * * *
```

Expected frequency:

```text
Every 30 minutes
```

Vercel Hobby limitation observed during deploy:

```text
Daily cron only
```

## Scheduler Execution Classification

The local scheduler history is stored in:

```text
.cache/cmip/ingestion/latest-scheduler-runs.json
```

The code path for dashboard scheduler metrics reads:

```ts
getLatestSchedulerRunsSync(48)
```

That function reads the local latest scheduler-run cache, not Vercel production execution history.

Important implementation detail:

```ts
persistSchedulerRun(...) returns "local_fallback"
```

So the scheduler dashboard and reliability calculations are currently based on local cached scheduler records.

## Last 7 Days Execution History

Window: last 7 days from audit time.

Expected 30-minute production runs:

```text
336
```

Actual production runs:

```text
0
```

Actual local/manual records found in local cache:

```text
10
```

| timestamp | environment | source | status | durationMs | classification |
|---|---:|---|---|---:|---|
| 2026-06-05T20:40:34.456Z | local | phase_14_5_audit | degraded | 13588 | LOCAL_MANUAL |
| 2026-06-05T23:10:45.517Z | local | manual_http | degraded | 558043 | LOCAL_MANUAL |
| 2026-06-06T07:28:37.162Z | local | cron_http | degraded | 112891 | LOCAL_MANUAL |
| 2026-06-06T07:31:40.898Z | local | manual_script | degraded | 21869 | LOCAL_MANUAL |
| 2026-06-06T07:33:56.284Z | local | manual_script | success_with_limited_confidence | 23639 | LOCAL_MANUAL |
| 2026-06-11T18:59:34.819Z | local | manual_http | degraded | 50088 | LOCAL_MANUAL |
| 2026-06-11T19:02:28.282Z | local | manual_http | success_with_limited_confidence | 40814 | LOCAL_MANUAL |
| 2026-06-12T00:11:28.091Z | local | manual_http | degraded | 75660 | LOCAL_MANUAL |
| 2026-06-12T09:44:29.856Z | local | manual_http | degraded | 75389 | LOCAL_MANUAL |
| 2026-06-12T10:01:54.659Z | local | cron_http | degraded | 125052 | LOCAL_MANUAL |

No `PRODUCTION_REAL` run was found.

## Run Count Audit

| metric | value |
|---|---:|
| expected production runs at 30-minute cadence | 336 |
| actual production runs | 0 |
| missed production runs | 336 |
| production success rate | 0% |
| production failed runs | 0 recorded |
| production missed runs | 336 |
| local/manual runs in local cache | 10 |

## Are Current Health Scores Based On Production?

### Production Readiness

Current readiness is not based on real production scheduler executions because no production deployment exists.

### Operational Reliability

Current operational reliability is derived from local cached scheduler runs via:

```ts
getLatestSchedulerRunsSync(48)
```

### Health / Freshness

Current health and freshness are derived from local cache and local/manual ingestion state, not from Vercel production runtime.

## Production-Only Readiness Today

If only real production runs are considered:

| dimension | production-only score |
|---|---:|
| Scheduler reliability | 0 |
| Production run freshness | 0 |
| Production fusion health | 0 |
| Production source reliability | not established |
| Production confidence consistency | not established |

Forced numeric production readiness:

```text
0/100
```

More precise operational wording:

```text
Production readiness is not established because production has never deployed or executed.
```

## Scheduler Reality Classification

| source | classification | notes |
|---|---|---|
| Vercel Cron | PRODUCTION_REAL expected, but not active | blocked by Hobby cron limitation and failed deploy |
| `/api/cron/ingest` local calls | LOCAL_MANUAL | `cron_http` in local cache does not imply Vercel Cron |
| `npm run ingest:scheduler` | LOCAL_SCHEDULER | local process only |
| `manual_http`, `manual_script`, `phase_*` triggers | LOCAL_MANUAL | useful diagnostics but not production evidence |
| `simulateSchedulerCycles` | SIMULATED | explicitly synthetic 72-hour scenario model |

## Important Operational Risk

The current cron route returns `202` for non-sync calls and schedules the ingestion with `setTimeout(...)` after the HTTP response.

This works for local/dev behavior, but serverless production environments may not reliably continue long background work after the response has ended.

For production-grade ingestion, the scheduler should either:

- call a synchronous bounded execution path, or
- enqueue durable work in a queue/worker system, or
- use a platform-supported background/cron execution model with reliable completion logs.

## Option Comparison

### A. External Scheduler + Vercel Hobby

Pros:

- Lower cost.
- Avoids Vercel Hobby cron frequency limitation.
- Can call the ingestion endpoint every 30 minutes.

Cons:

- Adds another operational dependency.
- Must securely pass `Authorization: Bearer <CRON_SECRET>`.
- Should call a completion-safe path, likely `/api/cron/ingest?sync=1`, not the current async 202 route.
- Local observed runs include durations above 60 seconds, and some above 120 seconds. This may exceed serverless limits depending on plan/runtime.
- More moving parts and weaker integrated observability than Vercel Cron.

Risk:

```text
Medium to high unless ingestion duration is further bounded or moved to a durable worker.
```

### B. Vercel Pro Cron

Pros:

- Native 30-minute cron support.
- Fewer external moving parts.
- Better integrated logs and deployment lifecycle.
- Lower operational risk than an external scheduler.

Cons:

- Higher cost.
- Still requires verifying that the cron route actually completes ingestion reliably in production, not just returns 202.

Risk:

```text
Lower operational risk, but route completion semantics still need production verification.
```

## Recommendation

Recommended option:

```text
B) Vercel Pro Cron
```

Reason:

C.M.I.P depends on frequent and reliable data refresh. The platform already has enough moving parts: Supabase, ingestion stages, ETF fallback, FRED, RSS, derived signals, validation snapshots and dashboard health. Adding an external scheduler on Hobby reduces cost, but increases operational ambiguity and splits observability.

If cost must stay minimal, option A is acceptable only if:

- the external scheduler calls a completion-safe endpoint,
- production function duration is verified,
- every execution writes a production scheduler record,
- missed-run alerting is added,
- Data Health separates production runs from local/manual runs.

## Final Answers

### 1. Is 30-minute ingestion currently happening in deployed production?

**NO.**

### 2. If NO, why exactly?

There is no successful Vercel production deployment, and Vercel rejected the configured 30-minute cron because the account is on the Hobby plan.

### 3. Are Production Readiness, Operational Reliability and Health scores calculated from real production runs or local/manual runs?

They are currently calculated from local/manual cached runs, not real production runs.

### 4. What would actual production readiness be today if only real production runs were considered?

```text
0/100
```

Operationally, production readiness is not established.

### 5. Which option is recommended?

```text
B) Vercel Pro Cron
```

Best reliability / lowest operational ambiguity.  
Option A is cheaper, but has higher operational risk unless the ingestion route is made completion-safe and production run history is persisted separately.

