# Serverless Scheduler Safety Audit

Generated: 2026-06-12

## Scope

Audit whether `/api/cron/ingest` depends on post-response background execution, and refactor it if that pattern is unsafe for Vercel Serverless cron execution.

## Executive Finding

The cron route previously depended on unsafe post-response execution.

Before the fix, the default request path returned HTTP `202` immediately and then started ingestion through a raw `setTimeout(..., 0)` callback:

- Request returned before ingestion completed.
- Scheduler success could be recorded by the caller before the actual ingestion result was known.
- Ingestion errors were only logged asynchronously and were not reflected in the cron HTTP response.
- The route did not use a durable queue, Vercel `waitUntil`, Next.js `after`, or any other explicit platform lifecycle primitive.

This is not safe for critical production ingestion on Vercel Serverless. Serverless execution is request-scoped; post-response work can be interrupted, hidden from cron success/failure accounting, or lost during function teardown. A cron endpoint should either complete the work inside the request lifecycle or hand off to a durable external job system.

## Previous Behavior

File audited:

`src/app/api/cron/ingest/route.ts`

Previous default behavior:

```ts
const sync = request.nextUrl.searchParams.get("sync") === "1";

if (!sync) {
  const acceptedAt = new Date().toISOString();

  const scheduleBackgroundRun = () => {
    setTimeout(() => {
      void runStagedScheduledIngestion("cron_http").catch((error) => {
        console.error("[cmip-cron] staged ingestion failed", error);
      });
    }, 0);
  };

  scheduleBackgroundRun();

  return apiJson(
    {
      mode: "staged_scheduled_ingestion_accepted",
      accepted: true,
      acceptedAt,
    },
    { status: 202 },
  );
}
```

Risk:

- Vercel Cron would see the endpoint response as accepted even if ingestion failed later.
- Runtime shutdown could stop the `setTimeout` task.
- Operational reliability metrics could overstate production scheduler health.
- Failures could be visible only in logs, not in scheduler result state.

## Refactor Applied

The route now awaits staged ingestion before responding:

```ts
const sync = request.nextUrl.searchParams.get("sync") === "1";
const schedulerRun = await runStagedScheduledIngestion(sync ? "manual_http" : "cron_http");

return apiJson({
  mode: "staged_scheduled_ingestion_completed",
  completed: true,
  schedulerRun,
  result: {
    status: schedulerRun.status,
    stages: schedulerRun.stages.map(...),
    successRate: schedulerRun.successRate,
    failedStage: schedulerRun.failedStage,
    retryCount: schedulerRun.retryCount,
    staleSignals: schedulerRun.staleSignals,
    nextRunAt: schedulerRun.nextRunAt,
  },
});
```

Current behavior:

- No `setTimeout`.
- No HTTP `202` acceptance path.
- No post-response ingestion.
- Cron route completes ingestion inside the request lifecycle.
- The response carries the actual scheduler result.
- `?sync=1` still marks trigger source as `manual_http`; normal cron calls use `cron_http`.

## Serverless Safety Assessment

Current route is safer than the previous design because ingestion completion is now tied to the request result.

Remaining serverless constraint:

- The route can still fail if a full staged ingestion run exceeds the platform execution limit.
- This is acceptable for correctness because the failure is visible. It is not silently treated as a successful accepted job.
- If sustained runtimes exceed the deployment plan's limit, the production design should move ingestion into a durable worker or use a managed scheduler/queue outside Vercel request execution.

## What Did Not Change

- No new data source was added.
- No analytics logic was changed.
- No dashboard was added.
- No `vercel.json` schedule was changed.
- No deployment was performed.

## Recommended Production Path

Short term:

- Keep the cron route synchronous as implemented here.
- Monitor stage durations and hard failures.
- Keep ETF and optional stages bounded so the full request stays within serverless limits.

Medium term:

- If ingestion duration remains close to or above serverless limits, use an external scheduler plus a durable worker process.
- Do not return success before durable job acceptance is persisted.

## Validation

Completed after refactor:

- `npm run typecheck` passed.
- `npm run lint` passed.
- `npm run build` passed.

## Final Answer

1. Did `/api/cron/ingest` depend on post-response background execution?

   Yes. The default path returned HTTP `202` and launched `runStagedScheduledIngestion("cron_http")` inside `setTimeout` after the response.

2. Is that safe on Vercel Serverless for critical ingestion?

   No. Raw post-response background work is not a reliable production ingestion mechanism in a request-scoped serverless runtime.

3. Was it refactored?

   Yes. The endpoint now awaits staged ingestion and returns only after the scheduler run completes.
