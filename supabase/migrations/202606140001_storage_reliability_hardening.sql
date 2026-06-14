do $$
declare
  item record;
begin
  for item in
    select conrelid::regclass as table_name, conname
    from pg_constraint
    where contype = 'c'
      and conrelid in ('public.ingestion_logs'::regclass, 'public.ingestion_runs'::regclass, 'public.reliability_snapshots'::regclass)
      and pg_get_constraintdef(oid) like '%storage_mode%'
  loop
    execute format('alter table %s drop constraint if exists %I', item.table_name, item.conname);
  end loop;
end $$;

alter table public.ingestion_logs
  add constraint ingestion_logs_storage_mode_check
  check (storage_mode in ('supabase', 'degraded_supabase_fallback', 'local_fallback', 'memory'));

alter table public.ingestion_runs
  add constraint ingestion_runs_storage_mode_check
  check (storage_mode in ('supabase', 'degraded_supabase_fallback', 'local_fallback', 'memory'));

alter table public.reliability_snapshots
  add constraint reliability_snapshots_storage_mode_check
  check (storage_mode in ('supabase', 'degraded_supabase_fallback', 'local_fallback', 'memory'));

create index if not exists raw_events_event_timestamp_idx
  on public.raw_events (event_timestamp desc);

create index if not exists raw_events_created_at_idx
  on public.raw_events (created_at desc);

create index if not exists raw_events_source_created_idx
  on public.raw_events (source_id_text, created_at desc);

create index if not exists raw_metrics_created_at_idx
  on public.raw_metrics (created_at desc);

create index if not exists raw_metrics_source_created_idx
  on public.raw_metrics (source_id_text, created_at desc);

create index if not exists raw_metrics_source_metric_time_idx
  on public.raw_metrics (source_id_text, metric, metric_timestamp desc);

create index if not exists normalized_events_source_time_idx
  on public.normalized_events (source_id_text, event_timestamp desc);

create index if not exists normalized_events_created_at_idx
  on public.normalized_events (created_at desc);

create index if not exists event_clusters_last_seen_idx
  on public.event_clusters (last_seen_at desc);

create index if not exists etf_daily_flows_asset_date_provider_idx
  on public.etf_daily_flows (asset, flow_date desc, provider);

create index if not exists forecast_snapshots_time_idx
  on public.forecast_snapshots (forecast_timestamp desc);

create index if not exists forecast_snapshots_run_idx
  on public.forecast_snapshots (run_id, forecast_timestamp desc);

create index if not exists forecast_snapshots_validation_time_idx
  on public.forecast_snapshots (validation_date desc, asset, prediction_horizon);

create index if not exists forecast_validations_validated_at_idx
  on public.forecast_validations (validated_at desc);

create index if not exists forecast_validations_validation_date_idx
  on public.forecast_validations (validation_date desc);

create index if not exists telemetry_logs_table_time_idx
  on public.telemetry_logs (table_name, observed_at desc);

create index if not exists telemetry_logs_source_time_idx
  on public.telemetry_logs (source_id_text, observed_at desc);

create table if not exists public.data_health_snapshots (
  id uuid primary key default gen_random_uuid(),
  run_id text,
  storage_mode text not null default 'supabase'
    check (storage_mode in ('supabase', 'degraded_supabase_fallback', 'local_fallback', 'memory')),
  source_reliability_score numeric,
  freshness_score numeric,
  coverage_score numeric,
  engine_reliability_score numeric,
  overall_platform_health_score numeric,
  storage_diagnostics jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists data_health_snapshots_observed_idx
  on public.data_health_snapshots (observed_at desc);

create index if not exists data_health_snapshots_run_idx
  on public.data_health_snapshots (run_id, observed_at desc);

alter table public.data_health_snapshots enable row level security;

drop policy if exists "admin read data health snapshots" on public.data_health_snapshots;
create policy "admin read data health snapshots"
  on public.data_health_snapshots
  for select
  using (public.is_admin());

drop policy if exists "service role manage data health snapshots" on public.data_health_snapshots;
create policy "service role manage data health snapshots"
  on public.data_health_snapshots
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
