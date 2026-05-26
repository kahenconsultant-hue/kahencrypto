# Phase 2 Cleanup Report

Date: 2026-05-25
Project: C.M.I.P, Crypto Macro Intelligence Platform

## Scope

Phase 2 focused on cleanup and foundation only. The work intentionally did not build advanced AI intelligence, market regime detection, or trader-grade alerting. The objective was to stop production paths from depending on hidden demo intelligence and create a stable ingestion foundation that can support later engines.

## Completed Cleanup

- Production imports were moved away from `src/lib/demo-data.ts`.
- `src/lib/demo-data.ts` was removed after production imports were migrated.
- The legacy duplicate source registry under `src/server/ingestion/source-registry.ts` was removed after its reusable source mapping helpers were moved into `src/collectors/registry.ts`.
- A new `src/lib/production-data.ts` file now provides UI-safe empty structures instead of hardcoded market intelligence.
- The ingestion entrypoint in `src/server/ingestion/pipeline.ts` no longer simulates ingestion runs.
- Cron refresh and manual refresh routes now execute the production ingestion foundation.
- The smart alert engine no longer emits fabricated macro, flow, liquidity, whale, ETF, or correlation alerts.
- The sentiment engine no longer generates simulated sentiment scores from RSS keyword matching.
- WordPress payload generation no longer exposes demo regime and fake market analysis payloads.
- Admin console no longer reviews demo alerts or simulated ingestion runs.
- Dashboard news panels now read raw ingestion events where available and display an honest empty state when no raw data exists.
- Python analytics microservice no longer returns regime scores or confidence values from placeholder vectors.
- Python correlation worker no longer emits random example correlations or zero-valued correlations when sample size is insufficient.

## Production Foundation Added

- Source abstraction layer.
- Collector registry.
- RSS collector.
- Public market signal collector based on existing real adapters.
- Deduplication by stable hash.
- Retry-safe collector runner.
- Source health snapshots.
- Ingestion logs.
- Supabase-first persistence with local JSONL fallback.
- Source health API endpoint.
- Supabase migration for ingestion tables.

## Important Non-Goals

The following were deliberately not implemented in Phase 2:

- Advanced AI event interpretation.
- Market regime engine.
- Advanced liquidity scoring.
- Directional asset impact scoring.
- Trader-grade smart alerts.
- Websocket collectors.
- Redis-backed queues.
- Semantic deduplication.
- Production dashboard redesign.

## Current State

C.M.I.P now has a cleaner separation between:

- Reusable frontend display components.
- Production ingestion foundation.
- Legacy analytics prototypes.
- Python analytics endpoints preserved as unavailable/insufficient-data shells until real normalized inputs exist.

The UI remains functional, but where real data is not available the system returns empty or unavailable states instead of pretending to have intelligence.
