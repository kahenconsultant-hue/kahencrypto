# Event Cluster Report

Generated: 2026-05-25

## Scope

Event clustering groups similar normalized events while preserving every source reference. It does not create alerts or intelligence conclusions.

## Final Cluster Counts

| Metric | Count |
| --- | ---: |
| Normalized events processed | 132 |
| Event clusters stored | 132 |
| Duplicate/similar clusters | 0 |
| Duplicates detected | 0 |

## Cluster Method

Current clustering is deterministic:

- canonical URL matching
- event type matching
- 72-hour publication window
- affected-asset overlap
- token overlap using title, summary, entities, and assets

The token similarity threshold is intentionally strict: `0.72`.

## False Positive Fix

During verification, a looser threshold grouped two different Federal Reserve approval notices into one cluster because their titles were structurally similar. That would be unsafe for downstream AI inputs.

The threshold was tightened from `0.46` to `0.72`, and generated clusters were refreshed. The final verification run produced 132 clusters for 132 normalized events with no false duplicate cluster detected.

## Provenance Preservation

Each cluster stores `source_references` with:

- `rawEventId`
- `normalizedEventId` when available
- source ID
- source name
- title
- URL
- published timestamp

The cluster table does not delete or hide raw source records. It is a grouping layer only.

## Current Limitation

The current deterministic clusterer is intentionally conservative. It may miss softer semantic duplicates that have low token overlap. That is acceptable for the foundation phase because preserving provenance is more important than aggressive clustering.

Future AI-assisted semantic clustering can be added later, but only after deterministic provenance and raw event storage remain stable.
