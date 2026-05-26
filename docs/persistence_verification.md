# Phase 5 Persistence Verification

Generated: 2026-05-25

## Scope

This report verifies production persistence only. No AI intelligence, alerts, regime engine, or correlation engine work was added in this phase.

## Migration Verification

Migration runner result:

| Migration | Status |
| --- | --- |
| `202605230001_initial_crypto_macro_schema.sql` | applied previously, skipped |
| `202605250001_ingestion_foundation.sql` | applied previously, skipped |
| `202605250002_ingestion_runs_dead_letters.sql` | applied previously, skipped |
| `202605250003_production_persistence_activation.sql` | applied previously, skipped |
| `202605250004_sources_source_key_constraint.sql` | applied previously, skipped |

All required persistence tables responded successfully through Supabase count checks.

## Verification Run

Run ID: `fc703a78-aa6a-48cf-895e-8d9020d22f1e`

| Field | Value |
| --- | ---: |
| Started | `2026-05-25T10:38:31.281Z` |
| Finished | `2026-05-25T10:38:36.731Z` |
| Storage mode | `supabase` |
| Pulled raw events | 130 |
| Pulled raw metrics | 20 |
| Persisted raw events reported by pipeline | 130 |
| Persisted raw metrics reported by pipeline | 20 |
| Successful sources | 5 |
| Degraded sources | 1 |
| Failed/API-key-missing sources | 5 |
| Dead letters | 5 |

## Supabase Row Counts

Counts before the run:

| Table | Count |
| --- | ---: |
| `sources` | 11 |
| `source_health` | 11 |
| `raw_events` | 130 |
| `raw_metrics` | 40 |
| `ingestion_logs` | 22 |
| `processing_errors` | 0 |
| `dead_letters` | 10 |
| `normalized_events` | 0 |
| `smart_alerts` | 0 |
| `reliability_snapshots` | 2 |
| `ingestion_runs` | 2 |

Counts after the run:

| Table | Count |
| --- | ---: |
| `sources` | 11 |
| `source_health` | 11 |
| `raw_events` | 131 |
| `raw_metrics` | 60 |
| `ingestion_logs` | 33 |
| `processing_errors` | 0 |
| `dead_letters` | 15 |
| `normalized_events` | 0 |
| `smart_alerts` | 0 |
| `reliability_snapshots` | 3 |
| `ingestion_runs` | 3 |

Net new rows inserted during this verification run:

| Table | Net new rows |
| --- | ---: |
| `raw_events` | 1 |
| `raw_metrics` | 20 |
| `source_health` | 0 |
| `ingestion_logs` | 11 |
| `processing_errors` | 0 |
| `dead_letters` | 5 |

Important note: `raw_events` uses `dedup_hash` upsert. The run processed and wrote/upserted 130 events, but only 1 was a net-new row because previously seen RSS items were deduplicated. `source_health` uses `source_id_text` upsert, so 11 source health records were updated with no net row-count increase.

## Write Report

The latest storage write report shows Supabase success for:

| Table | Rows written/upserted | Status |
| --- | ---: | --- |
| `sources` | 11 | success |
| `raw_events` | 130 | success |
| `raw_metrics` | 20 | success |
| `source_health` | 11 | success |
| `ingestion_logs` | 11 | success |
| `dead_letters` | 5 | success |
| `ingestion_runs` | 1 | success |
| `reliability_snapshots` | 1 | success |

## Result

Production persistence is active and verified for the current ingestion foundation. The pipeline writes runtime data to Supabase by default when Supabase env vars and service role are available. Local cache remains a fallback and audit trail, not the active production storage mode for this run.
