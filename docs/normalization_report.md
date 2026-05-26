# Phase 6 Normalization Report

Generated: 2026-05-25

## Scope

This phase prepares clean event inputs for future AI intelligence. It does not build AI intelligence, alerts, regime detection, or correlation analysis.

## Implementation Summary

Added deterministic normalization in:

- `src/processors/event-normalization.ts`
- `src/storage/ingestion-store.ts`
- `src/api/ingestion.ts`

Added persistence support through:

- `supabase/migrations/202605250005_normalized_events_clusters.sql`
- `supabase/migrations/202605250006_normalized_events_conflict_key.sql`

Admin visibility added in:

- `src/app/admin/ingestion/page.tsx`

## Final Verification Run

Run ID: `790ea96e-e113-429c-9880-e6b2ecc4e0b0`

| Metric | Count |
| --- | ---: |
| Pulled events | 130 |
| Pulled metrics | 20 |
| Inserted `raw_events` | 0 |
| Updated `raw_events` | 130 |
| Created/upserted `normalized_events` | 132 |
| Created/upserted `event_clusters` | 132 |
| Duplicates detected in final cluster pass | 0 |
| Failed/API-key-missing sources | 5 |
| Dead letters | 5 |

Final Supabase counts:

| Table | Count |
| --- | ---: |
| `raw_events` | 132 |
| `normalized_events` | 132 |
| `event_clusters` | 132 |
| `processing_errors` | 0 |
| `smart_alerts` | 0 |

## Normalized Event Distribution

By event type:

| Event type | Count |
| --- | ---: |
| `exchange_risk` | 31 |
| `regulation` | 4 |
| `central_bank_policy` | 26 |
| `crypto_market_structure` | 31 |
| `financial_market_news` | 17 |
| `stablecoin_liquidity` | 3 |
| `etf_flow` | 2 |
| `inflation_data` | 11 |
| `treasury_yield_move` | 2 |
| `dxy_move` | 1 |
| `security_risk` | 1 |
| `geopolitical_risk` | 3 |

By freshness:

| Freshness | Count |
| --- | ---: |
| `live` | 1 |
| `fresh` | 1 |
| `delayed` | 1 |
| `stale` | 2 |
| `stale_critical` | 127 |

By source:

| Source | Count |
| --- | ---: |
| SEC public press releases | 25 |
| Federal Reserve RSS | 20 |
| CoinDesk RSS | 26 |
| Cointelegraph RSS | 30 |
| CNBC Markets RSS | 31 |

## Extracted Fields

Every normalized event stores:

- source ID and source name
- source type
- title
- URL
- published/event timestamp
- language
- deterministic event type
- entities
- affected assets
- freshness status
- source reliability
- source provenance payload

## No AI Used

Event type, affected asset, entity extraction, source reliability, freshness, and clustering are all deterministic. No OpenAI call or AI reasoning is used in this phase.

## Verification Outcome

Normalization is active and writing to Supabase. The admin ingestion page now shows `raw_events`, `normalized_events`, and `event_clusters` counts.
