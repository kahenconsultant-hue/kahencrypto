alter table public.raw_events add column if not exists updated_at timestamptz not null default now();
alter table public.raw_events add column if not exists last_seen_at timestamptz;
alter table public.raw_events add column if not exists seen_count integer not null default 1;

alter table public.ingestion_runs add column if not exists raw_events_inserted integer not null default 0;
alter table public.ingestion_runs add column if not exists raw_events_updated integer not null default 0;
alter table public.ingestion_runs add column if not exists normalized_events_created integer not null default 0;
alter table public.ingestion_runs add column if not exists event_clusters_created integer not null default 0;
alter table public.ingestion_runs add column if not exists duplicates_detected integer not null default 0;

alter table public.normalized_events add column if not exists source_name text;
alter table public.normalized_events add column if not exists source_type text;
alter table public.normalized_events add column if not exists url text;
alter table public.normalized_events add column if not exists language text not null default 'en';
alter table public.normalized_events add column if not exists published_at timestamptz;
alter table public.normalized_events add column if not exists entities text[] not null default '{}';
alter table public.normalized_events add column if not exists freshness_status text not null default 'unavailable'
  check (freshness_status in ('live', 'fresh', 'delayed', 'stale', 'stale_critical', 'unavailable'));
alter table public.normalized_events add column if not exists source_reliability integer not null default 0
  check (source_reliability between 0 and 100);

create unique index if not exists normalized_events_raw_event_uidx on public.normalized_events (raw_event_id) where raw_event_id is not null;
create index if not exists normalized_events_assets_idx on public.normalized_events using gin (affected_assets);
create index if not exists normalized_events_entities_idx on public.normalized_events using gin (entities);

create table if not exists public.event_clusters (
  id uuid primary key default gen_random_uuid(),
  cluster_key text not null unique,
  event_type text not null,
  category text not null,
  primary_title text not null,
  affected_assets text[] not null default '{}',
  entities text[] not null default '{}',
  first_seen_at timestamptz not null,
  last_seen_at timestamptz not null,
  event_count integer not null default 1,
  source_count integer not null default 1,
  source_references jsonb not null default '[]'::jsonb,
  similarity_method text not null default 'deterministic_token_overlap',
  confidence integer not null default 0 check (confidence between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists event_clusters_type_time_idx on public.event_clusters (event_type, last_seen_at desc);
create index if not exists event_clusters_assets_idx on public.event_clusters using gin (affected_assets);
create index if not exists event_clusters_entities_idx on public.event_clusters using gin (entities);

alter table public.event_clusters enable row level security;
drop policy if exists "public read event clusters" on public.event_clusters;
create policy "public read event clusters" on public.event_clusters for select using (true);
