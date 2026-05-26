# C.M.I.P Dashboard Integration Report

Generated: 2026-05-25

## Dashboard changes

Added:

- reliability status panel
- confidence cap visibility
- degraded module visibility
- AI event explanation panel
- `/api/v1/reliability`
- reliability payload in `/api/v1/overview`
- reliability payload in `/api/v1/source-health`
- admin reliability card

## UI behavior

- If asset impact confidence is unavailable, the dashboard shows `اثر ناموجود` instead of a numeric score.
- The AI panel shows `api_key_missing` instead of pretending translations exist.
- Data quality warnings remain visible.
- Existing ingestion, source health, normalized event and cluster panels were preserved.

## Important non-change

The existing ingestion, Supabase persistence, normalization and clustering pipeline was not rebuilt or overwritten.

## Admin page

`/admin/ingestion` now shows:

- storage mode
- latest ingestion run
- table counts
- normalized event count
- event cluster count
- reliability snapshot count
- current reliability score
- degraded module count
- alert confidence cap
