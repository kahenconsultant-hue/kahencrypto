create table if not exists public.ingestion_runs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null unique,
  started_at timestamptz not null,
  finished_at timestamptz not null,
  storage_mode text not null check (storage_mode in ('supabase', 'local_fallback', 'memory')),
  pulled_events integer not null default 0,
  pulled_metrics integer not null default 0,
  persisted_events integer not null default 0,
  persisted_metrics integer not null default 0,
  successful_sources integer not null default 0,
  degraded_sources integer not null default 0,
  failed_sources integer not null default 0,
  skipped_sources integer not null default 0,
  dead_letters integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.ingestion_dead_letters (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null,
  source_id_text text not null,
  source_name text not null,
  status text not null check (status in ('failed', 'api_key_missing', 'degraded', 'disabled', 'success')),
  attempts integer not null default 0,
  error text not null,
  payload jsonb not null default '{}'::jsonb,
  failed_at timestamptz not null,
  next_retry_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists ingestion_runs_finished_idx on public.ingestion_runs (finished_at desc);
create index if not exists ingestion_dead_letters_run_idx on public.ingestion_dead_letters (run_id, failed_at desc);
create index if not exists ingestion_dead_letters_source_idx on public.ingestion_dead_letters (source_id_text, failed_at desc);
create index if not exists ingestion_dead_letters_unresolved_idx on public.ingestion_dead_letters (resolved_at, failed_at desc);

alter table public.ingestion_runs enable row level security;
alter table public.ingestion_dead_letters enable row level security;

drop policy if exists "public read ingestion runs" on public.ingestion_runs;
drop policy if exists "admin read ingestion dead letters" on public.ingestion_dead_letters;

create policy "public read ingestion runs" on public.ingestion_runs for select using (true);
create policy "admin read ingestion dead letters" on public.ingestion_dead_letters for select using (public.is_admin());
