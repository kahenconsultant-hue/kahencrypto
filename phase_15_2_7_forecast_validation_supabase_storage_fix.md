# Phase 15.2.7 — Forecast Validation Supabase Storage Fix

Status: implemented locally and verified against production Supabase.

## Objective

Forecast Validation Center stayed in `collecting` even though production had stored forecast snapshots for more than 24 hours.

Production Supabase audit before the fix showed:

- `forecast_snapshots`: 1104 rows
- due snapshots pending validation: 168
- `forecast_validations`: 0 rows
- `forecast_validations` inconclusive rows: 0
- storage mode: `supabase`

No fake forecasts or fake outcomes were created.

## Current Flow Audit

### Snapshot Write Path

Forecast snapshots are built during scheduler and refresh execution:

- `src/server/ingestion/scheduler.ts`
- `src/app/api/v1/refresh/route.ts`

They are persisted through:

- `persistForecastSnapshots(...)`
- Supabase table: `forecast_snapshots`
- uniqueness: `snapshot_id`

### Previous Due Snapshot Read Path

The validation engine previously read due snapshots only from runtime/local file state:

- `getForecastSnapshotsSync()`
- `.cache/cmip/ingestion/forecast-snapshots.json`

This was unsafe in serverless production because Supabase contained real snapshots, while the current runtime invocation did not necessarily have them hydrated locally.

### Validation Write Path

Forecast validations are persisted through:

- `persistForecastValidations(...)`
- Supabase table: `forecast_validations`
- uniqueness: `validation_id`

## Fix Implemented

### Supabase-backed due snapshot retrieval

Added bounded Supabase read helpers:

- `getLatestForecastSnapshots(...)`
- `getLatestForecastValidations(...)`
- `getDueForecastSnapshots(...)`
- `getForecastValidationSummary(...)`

Production validation now reads due snapshots from Supabase first, then falls back to local runtime cache only if Supabase is not configured or read fails.

### Async validation path

Added:

- `validateDueForecastsFromStorage(...)`

The scheduler and refresh route now use the storage-backed validator:

- `src/server/ingestion/scheduler.ts`
- `src/app/api/v1/refresh/route.ts`

The original sync validator remains for local fallback and compatibility.

### Runtime hydration for dashboard

`hydrateRuntimeStoreFromSupabase(...)` now hydrates bounded forecast data:

- latest forecast snapshots
- latest forecast validations

This means the public Forecast Validation Center can display Supabase-backed validations instead of staying in runtime-only `collecting` mode.

### Data Health diagnostics

Data Health now exposes:

- `forecast_snapshots_count`
- `due_snapshots_count`
- `forecast_validations_count`
- `inconclusive_validations_count`
- `last_forecast_validation_run`
- `validation_storage_mode`

## Idempotency

Validation ID format remains:

```text
validation:${snapshot_id}
```

`snapshot_id` already contains:

```text
forecast:${runId}:${asset}:${predictionHorizon}
```

The due snapshot query excludes already validated rows by:

- `validation_id`
- `snapshot_id`

Second validation execution confirmed no duplicate rows:

- before second run validations: 168
- generated validations: 0
- after second run validations: 168

## Inconclusive Storage

If actual outcome data is unavailable, the validation is stored as:

- `result = inconclusive`
- `quality = insufficient_data`
- `internalScore = null`
- `actualPrice = null`
- reason included in explanation:

```text
missing_actual_outcome
```

These rows are excluded from accuracy calculations.

## Manual Production-safe Validation

Command used local code with `.env.local` and production Supabase credentials. It did not modify forecast scoring logic.

### Before

```json
{
  "forecastSnapshotsCount": 1104,
  "dueSnapshotsCount": 168,
  "forecastValidationsCount": 0,
  "inconclusiveValidationsCount": 0,
  "lastForecastValidationRun": null,
  "validationStorageMode": "supabase"
}
```

### Manual Validation Run

```json
{
  "generatedValidations": 168,
  "generatedInconclusive": 168,
  "write": {
    "persisted": 168,
    "storageMode": "supabase"
  }
}
```

### After

```json
{
  "forecastSnapshotsCount": 1104,
  "dueSnapshotsCount": 0,
  "forecastValidationsCount": 168,
  "inconclusiveValidationsCount": 168,
  "lastForecastValidationRun": "2026-06-15T17:11:15.984+00:00",
  "validationStorageMode": "supabase"
}
```

### Idempotency Re-run

```json
{
  "generatedValidations": 0,
  "write": {
    "persisted": 0,
    "storageMode": "supabase"
  }
}
```

## Forecast Center Verification

After Supabase hydration:

```json
{
  "status": "active",
  "snapshotsStored": 1000,
  "forecastsValidated": 168,
  "inconclusiveForecasts": 168,
  "scoredForecasts": 0,
  "pendingValidationCount": 0,
  "overallAccuracy24h": null,
  "overallAccuracy7d": null
}
```

This is correct:

- The center no longer falsely stays in pure collecting mode.
- No fake accuracy is displayed.
- Current due snapshots were marked inconclusive because required real outcome points were not available in the history source.

## Data Health Verification

Data Health now reports:

```json
{
  "forecastValidation": {
    "forecastSnapshotsCount": 1104,
    "dueSnapshotsCount": 0,
    "forecastValidationsCount": 168,
    "inconclusiveValidationsCount": 168,
    "lastForecastValidationRun": "2026-06-15T17:11:15.984+00:00",
    "validationStorageMode": "supabase"
  }
}
```

## No Fake Data Confirmation

- No synthetic forecasts were generated.
- No invented historical predictions were backfilled.
- No fake market outcomes were generated.
- Inconclusive validations are stored only when actual outcome data is missing.
- Accuracy remains null until scored validations exist.

## Remaining Work

The next quality improvement should make the actual outcome history more complete for 24H and 7D validation. Until then, C.M.I.P can correctly store and disclose inconclusive validations instead of pretending to have accuracy.

## 2026-06-18 Follow-up Fix

The production dashboard still showed the Forecast Validation Center as effectively empty after one week. A second audit found two additional root causes:

1. Existing inconclusive rows were never retried after outcome history became available.
2. BTC/ETH/SOL snapshots were not being created because the snapshot engine only looked for in-memory trend history and did not fall back to persisted `price_usd` metrics.

### Code Changes

- `forecast_validation_engine.ts` now loads Supabase-backed outcome data in one batch:
  - direct crypto outcomes from `raw_metrics.price_usd`
  - macro/cross-market outcomes from persisted shared signal cache history
  - runtime history only as final fallback
- `getDueForecastSnapshots()` can include previous `inconclusive` rows with `missing_actual_outcome` for idempotent revalidation.
- `forecast_snapshot_engine.ts` now uses persisted direct reference metrics for BTC/ETH/SOL when in-memory history is unavailable.

### Production Repair Run

Revalidated due snapshots using real Supabase outcome data:

```json
{
  "attempted": 700,
  "storageMode": "supabase",
  "scoredForecasts": 34,
  "inconclusiveForecasts": 666,
  "overallAccuracy24h": 64.7
}
```

Generated a new real forecast snapshot cycle after hydrating Supabase:

```json
{
  "generated": 21,
  "assets": {
    "BTC": 3,
    "ETH": 3,
    "SOL": 3,
    "DXY": 3,
    "Gold": 3,
    "Nasdaq": 3,
    "US10Y": 3
  },
  "storageMode": "supabase"
}
```

### Forecast Center After Fix

```json
{
  "status": "active",
  "snapshotsStored": 1000,
  "forecastsValidated": 700,
  "scoredForecasts": 34,
  "inconclusiveForecasts": 666,
  "pendingValidationCount": 0,
  "overallAccuracy24h": 64.7,
  "overallAccuracy7d": null,
  "bestPerformingAsset": "Nasdaq",
  "worstPerformingAsset": "Gold",
  "bestEngine": "Liquidity Engine"
}
```

### Notes

- No fake outcomes were created.
- No synthetic historical forecasts were backfilled.
- BTC/ETH/SOL will first become eligible for 24H validation after the newly stored snapshots reach their validation date.
- 7D accuracy remains unavailable until real 7D validation windows mature.
