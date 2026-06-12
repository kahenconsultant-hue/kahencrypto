# Phase 11 — Admin Ops Panel

## Scope

Phase 11 separated operational internals from the public dashboard and added a dedicated admin operations surface at `/admin/ops`.

## Added

- `/admin/ops` server-rendered admin page.
- Source health table with status, freshness, latency, coverage and last error.
- Internal Adapter Bundle section with core/optional health, blocking failures and non-blocking missing enrichment inputs.
- Ingestion and persistence stats using existing Supabase-backed ingestion summaries and table counts.
- Queue/retry status using current ingestion pipeline counters and latest-run dead letters.
- Failure panel for stale feeds, missing API keys, latest-run dead letters and storage write failures.
- Confidence anomaly panel for engines and alerts with weak coverage, low confidence or low indicator counts.
- API/collector log view for recent endpoint status, latency, fallback and error messages.
- Reliability model summary separating core reliability from premium coverage.

## Public Dashboard Change

The raw `DataQualityPanel` is no longer rendered in the public dashboard by default. It is available only when:

```text
CMIP_SHOW_PUBLIC_OPS=true
NODE_ENV !== production
```

This keeps raw pipeline details, source errors and internal failure diagnostics out of the public user experience.

## Reused Systems

- Existing `getDataHealthDashboard()`
- Existing ingestion summaries and table counts
- Existing source health and API logs
- Existing reliability engine
- Existing adapter bundle diagnostics

## Not Changed

- No ingestion architecture rewrite.
- No collector changes.
- No AI/regime/alert feature expansion.
- No fake operational data introduced.

