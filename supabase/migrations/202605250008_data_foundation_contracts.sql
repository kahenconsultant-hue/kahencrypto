alter table public.raw_events add column if not exists source_reliability integer not null default 0
  check (source_reliability between 0 and 100);
alter table public.raw_events add column if not exists freshness_status text not null default 'unavailable'
  check (freshness_status in ('live', 'fresh', 'delayed', 'stale', 'stale_critical', 'unavailable'));
alter table public.raw_events add column if not exists delay_minutes integer;
alter table public.raw_events add column if not exists retry_count integer not null default 0;

alter table public.raw_metrics add column if not exists freshness_status text not null default 'unavailable'
  check (freshness_status in ('live', 'fresh', 'delayed', 'stale', 'stale_critical', 'unavailable'));
alter table public.raw_metrics add column if not exists delay_minutes integer;
alter table public.raw_metrics add column if not exists confidence_base integer
  check (confidence_base is null or confidence_base between 0 and 100);

alter table public.source_health add column if not exists degradation_state text not null default 'healthy'
  check (degradation_state in ('healthy', 'degraded', 'unstable', 'sparse', 'unreliable'));
alter table public.source_health add column if not exists reliability_score integer not null default 0
  check (reliability_score between 0 and 100);

create table if not exists public.market_snapshots (
  id uuid primary key default gen_random_uuid(),
  run_id uuid,
  snapshot_key text not null,
  asset text,
  metric_set text not null,
  source_type text not null check (source_type in ('direct', 'derived', 'proxy', 'unavailable')),
  quality text not null default 'unavailable' check (quality in ('live', 'partial_live', 'delayed', 'estimated', 'unavailable')),
  freshness_status text not null default 'unavailable'
    check (freshness_status in ('live', 'fresh', 'delayed', 'stale', 'stale_critical', 'unavailable')),
  source_ids text[] not null default '{}',
  metric_count integer not null default 0,
  payload jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.intelligence_outputs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid,
  output_key text not null,
  module_name text not null,
  output_type text not null,
  asset text,
  timeframe text,
  source_type text not null check (source_type in ('direct', 'derived', 'proxy', 'unavailable')),
  status text not null check (status in ('available', 'degraded', 'unavailable', 'suppressed')),
  score numeric,
  confidence integer check (confidence is null or confidence between 0 and 100),
  confidence_label text,
  data_quality text not null default 'unavailable' check (data_quality in ('live', 'partial_live', 'delayed', 'estimated', 'unavailable')),
  used_signals text[] not null default '{}',
  missing_signals text[] not null default '{}',
  stale_signals text[] not null default '{}',
  narrative_fa text,
  calculations jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.telemetry_logs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid,
  scope text not null,
  event_type text not null,
  level text not null default 'info' check (level in ('debug', 'info', 'warning', 'error', 'critical')),
  message text not null,
  duration_ms integer,
  source_id_text text,
  table_name text,
  payload jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists raw_events_freshness_idx on public.raw_events (freshness_status, event_timestamp desc);
create index if not exists raw_metrics_freshness_idx on public.raw_metrics (freshness_status, metric_timestamp desc);
create index if not exists source_health_degradation_idx on public.source_health (degradation_state, updated_at desc);
create index if not exists market_snapshots_key_time_idx on public.market_snapshots (snapshot_key, observed_at desc);
create index if not exists market_snapshots_asset_time_idx on public.market_snapshots (asset, observed_at desc);
create index if not exists intelligence_outputs_key_time_idx on public.intelligence_outputs (output_key, generated_at desc);
create index if not exists intelligence_outputs_module_time_idx on public.intelligence_outputs (module_name, generated_at desc);
create index if not exists telemetry_logs_scope_time_idx on public.telemetry_logs (scope, observed_at desc);
create index if not exists telemetry_logs_run_idx on public.telemetry_logs (run_id, observed_at desc);

alter table public.market_snapshots enable row level security;
alter table public.intelligence_outputs enable row level security;
alter table public.telemetry_logs enable row level security;

drop policy if exists "public read market snapshots" on public.market_snapshots;
drop policy if exists "public read intelligence outputs" on public.intelligence_outputs;
drop policy if exists "admin read telemetry logs" on public.telemetry_logs;

create policy "public read market snapshots" on public.market_snapshots for select using (true);
create policy "public read intelligence outputs" on public.intelligence_outputs for select using (true);
create policy "admin read telemetry logs" on public.telemetry_logs for select using (public.is_admin());
