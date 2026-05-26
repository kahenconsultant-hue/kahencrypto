create table if not exists public.source_health (
  id uuid primary key default gen_random_uuid(),
  source_id_text text not null unique,
  source_name text not null,
  status text not null check (status in ('success', 'degraded', 'failed', 'api_key_missing', 'disabled')),
  tier integer not null check (tier between 1 and 3),
  latency_ms integer not null default 0,
  freshness_minutes integer,
  error_rate numeric not null default 0,
  consecutive_failures integer not null default 0,
  last_success_at timestamptz,
  last_failure_at timestamptz,
  last_error text,
  next_retry_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists public.raw_events (
  id uuid primary key default gen_random_uuid(),
  source_id_text text not null,
  source_name text not null,
  source_type text not null,
  category text not null,
  title text not null,
  content text,
  url text,
  language text not null default 'en',
  event_timestamp timestamptz not null,
  raw_payload jsonb not null default '{}'::jsonb,
  dedup_hash text not null unique,
  quality text not null check (quality in ('live', 'partial_live', 'delayed', 'estimated', 'unavailable')),
  created_at timestamptz not null default now()
);

create table if not exists public.raw_metrics (
  id uuid primary key default gen_random_uuid(),
  source_id_text text not null,
  source_name text not null,
  source_type text not null,
  asset text,
  signal_group text not null,
  metric text not null,
  value numeric,
  previous_value numeric,
  change_abs numeric,
  change_pct numeric,
  metric_timestamp timestamptz,
  quality text not null check (quality in ('live', 'partial_live', 'delayed', 'estimated', 'unavailable')),
  reliability integer not null default 0 check (reliability between 0 and 100),
  sample_size integer not null default 0,
  error text,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.ingestion_logs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null,
  source_id_text text not null,
  source_name text not null,
  status text not null check (status in ('success', 'degraded', 'failed', 'api_key_missing', 'disabled')),
  message text not null,
  attempts integer not null default 0,
  latency_ms integer not null default 0,
  raw_events integer not null default 0,
  raw_metrics integer not null default 0,
  storage_mode text not null check (storage_mode in ('supabase', 'local_fallback', 'memory')),
  error text,
  created_at timestamptz not null default now()
);

create index if not exists source_health_status_idx on public.source_health (status, updated_at desc);
create index if not exists raw_events_source_time_idx on public.raw_events (source_id_text, event_timestamp desc);
create index if not exists raw_events_category_time_idx on public.raw_events (category, event_timestamp desc);
create index if not exists raw_metrics_metric_time_idx on public.raw_metrics (metric, metric_timestamp desc);
create index if not exists raw_metrics_asset_time_idx on public.raw_metrics (asset, metric_timestamp desc);
create index if not exists ingestion_logs_run_idx on public.ingestion_logs (run_id, created_at desc);

alter table public.source_health enable row level security;
alter table public.raw_events enable row level security;
alter table public.raw_metrics enable row level security;
alter table public.ingestion_logs enable row level security;

drop policy if exists "public read source health" on public.source_health;
drop policy if exists "public read raw events" on public.raw_events;
drop policy if exists "public read raw metrics" on public.raw_metrics;
drop policy if exists "admin read ingestion logs" on public.ingestion_logs;

create policy "public read source health" on public.source_health for select using (true);
create policy "public read raw events" on public.raw_events for select using (true);
create policy "public read raw metrics" on public.raw_metrics for select using (true);
create policy "admin read ingestion logs" on public.ingestion_logs for select using (public.is_admin());
