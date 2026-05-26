# Deduplication Audit

Generated: 2026-05-25

## Current Raw Deduplication Logic

RSS raw event hashes are generated from:

```ts
stableHash([source.id, url, title, timestamp.slice(0, 10)])
```

The ingestion run then removes duplicate hashes inside the current batch and persists `raw_events` using `dedup_hash` as the Supabase upsert key.

## Why 130 Pulled Events Previously Produced Only +1 `raw_events` Row

The prior Phase 5 run had already persisted most RSS items. In the Phase 6 verification:

| Run | Pulled events | Inserted raw events | Updated raw events |
| --- | ---: | ---: | ---: |
| First Phase 6 run after migration | 130 | 1 | 129 |
| Final Phase 6 run | 130 | 0 | 130 |

This means the feed collectors were mostly returning the same known feed items. Supabase correctly upserted existing rows instead of creating duplicates.

## Within-Run Duplicate Check

Latest cached raw event sample:

| Metric | Count |
| --- | ---: |
| Cached latest events checked | 100 |
| Unique dedup hashes | 100 |
| Duplicate hashes | 0 |

The final run also reported `duplicatesDetected=0` after stricter clustering.

## Over-Dedup Risk Assessment

Raw event over-dedup risk is low.

Reason:

- The hash includes `source.id`, so different sources are not collapsed into one raw row.
- The hash includes URL and title, so distinct items from the same source are not merged unless they share the same source, URL, title, and publication date.
- The hash includes the publication date, reducing accidental collision across old and new reposted items.

Observed behavior:

- 130 pulled events were not collapsed inside the run.
- Existing cross-run items were updated through upsert.
- Only genuinely new RSS items increased the `raw_events` table count.

Remaining risk:

- If the same source republishes the same URL/title on the same date with materially changed content, it will update the existing raw row instead of creating a new raw row.
- This is acceptable for now because source provenance is preserved and raw payload is retained, but a future migration can add payload version history if editorial revisions matter.

## Under-Dedup Risk

Under-dedup risk is higher than over-dedup risk.

Reason:

- The raw layer intentionally does not deduplicate across sources.
- Similar stories from different outlets remain separate raw events.
- Similarity grouping is handled downstream by `event_clusters`.

This is the correct architecture: raw storage should preserve source-level provenance; clustering should group similar stories without destroying raw source records.
