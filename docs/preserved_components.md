# Preserved Components

Date: 2026-05-25
Project: C.M.I.P, Crypto Macro Intelligence Platform

## Frontend Preserved

The UI was not rebuilt. Reusable components were preserved:

- App shell.
- Sidebar.
- Header.
- Dashboard panels.
- Asset dashboard components.
- Admin console layout.
- Existing UI primitives.
- Data source badge component.
- RTL layout foundation.

The dashboard now receives safer production placeholders or raw ingestion data rather than demo intelligence fixtures.

## Existing Real Adapters Preserved

The existing market data adapter layer was preserved:

- `src/server/data/adapters.ts`
- `src/server/data/signal-cache.ts`

Phase 2 wraps these adapters through `src/collectors/api/market-signal-collector.ts` instead of replacing them.

## Supabase Integration Preserved

The existing Supabase client was preserved:

- `src/server/supabase/client.ts`

Phase 2 adds migration-backed ingestion persistence around it, with graceful local fallback when Supabase is unavailable.

## Environment Structure Preserved

Existing environment variables were not removed. Phase 2 only extended `.env.example` with ingestion-related keys:

- `CMIP_INGESTION_STORE_PATH`
- `TRADINGECONOMICS_API_KEY`
- `WHALE_ALERT_API_KEY`

Existing keys such as Supabase, OpenAI, FRED, CoinGlass, Glassnode, CryptoQuant, and Trading Economics aliases remain supported.

## WordPress Compatibility Preserved

The WordPress adapter remains available:

- `src/server/wordpress/adapter.ts`

Its payload now exposes foundation reliability and raw events instead of demo regime intelligence.

## Admin Console Preserved

The admin console remains usable, but demo alert review and simulated ingestion traces were removed. It now surfaces ingestion foundation status and source health.

