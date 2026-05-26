# Normalized Event Schema

Generated: 2026-05-25

## Table: `normalized_events`

Purpose: convert raw RSS/API events into clean deterministic records for later translation, AI interpretation, and intelligence engines.

| Field | Type | Purpose |
| --- | --- | --- |
| `id` | uuid | Primary key |
| `raw_event_id` | uuid | Reference to `raw_events.id` |
| `source_id_text` | text | Stable source ID from source registry |
| `source_name` | text | Human-readable source name |
| `source_type` | text | Source type such as rss, api, filings |
| `event_type` | text | Deterministic event type |
| `category` | text | Source/news category |
| `affected_assets` | text[] | Assets affected by deterministic keyword/entity rules |
| `title` | text | Original title |
| `summary` | text | Non-AI compact source summary |
| `url` | text | Source URL |
| `language` | text | Source language |
| `published_at` | timestamptz | Original publication timestamp |
| `event_timestamp` | timestamptz | Canonical event timestamp |
| `entities` | text[] | Extracted entities such as Fed, SEC, ETF, Tether |
| `freshness_status` | text | live, fresh, delayed, stale, stale_critical, unavailable |
| `source_reliability` | integer | Deterministic source reliability score |
| `normalized_payload` | jsonb | Full provenance and rule-output payload |
| `quality` | text | Data quality inherited from raw source |
| `confidence` | integer | Extraction confidence, not market-confidence |
| `processing_status` | text | processed, pending, failed, skipped |
| `created_at` | timestamptz | Insert time |
| `updated_at` | timestamptz | Last update time |

Unique key:

- `raw_event_id`

This guarantees one normalized row per raw event while allowing reprocessing/upsert when rules improve.

## Table: `event_clusters`

Purpose: group similar normalized events without destroying source provenance.

| Field | Type | Purpose |
| --- | --- | --- |
| `id` | uuid | Primary key |
| `cluster_key` | text | Stable deterministic cluster key |
| `event_type` | text | Cluster event type |
| `category` | text | Dominant source category |
| `primary_title` | text | Representative title |
| `affected_assets` | text[] | Union of affected assets |
| `entities` | text[] | Union of entities |
| `first_seen_at` | timestamptz | Earliest event timestamp |
| `last_seen_at` | timestamptz | Latest event timestamp |
| `event_count` | integer | Number of normalized events in cluster |
| `source_count` | integer | Number of unique sources in cluster |
| `source_references` | jsonb | Raw and normalized source references |
| `similarity_method` | text | Deterministic clustering method |
| `confidence` | integer | Extraction/grouping confidence |
| `created_at` | timestamptz | Insert time |
| `updated_at` | timestamptz | Last update time |

Unique key:

- `cluster_key`

## Event Types

Current deterministic event types:

- `central_bank_policy`
- `treasury_yield_move`
- `dxy_move`
- `inflation_data`
- `employment_data`
- `etf_flow`
- `stablecoin_liquidity`
- `exchange_risk`
- `regulation`
- `security_risk`
- `liquidation_leverage`
- `geopolitical_risk`
- `institutional_adoption`
- `crypto_market_structure`
- `macro_news`
- `financial_market_news`

## Important Boundary

The `confidence` field in this phase is extraction confidence. It is not trading confidence, impact confidence, or regime confidence. Market intelligence confidence belongs to later engine phases and must be calculated from real signal coverage.
