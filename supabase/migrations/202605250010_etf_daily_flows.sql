create table if not exists public.etf_daily_flows (
  id uuid primary key default gen_random_uuid(),
  asset text not null check (asset in ('BTC', 'ETH')),
  flow_date date not null,
  provider text not null,
  net_flow_usd_million numeric,
  source text not null,
  source_url text not null,
  fetched_at timestamptz not null,
  quality text not null check (quality in ('live', 'partial_live', 'delayed', 'estimated', 'unavailable')),
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(asset, flow_date, provider, source)
);

create index if not exists idx_etf_daily_flows_asset_date on public.etf_daily_flows(asset, flow_date desc);
create index if not exists idx_etf_daily_flows_provider on public.etf_daily_flows(provider);
create index if not exists idx_etf_daily_flows_fetched_at on public.etf_daily_flows(fetched_at desc);

alter table public.etf_daily_flows enable row level security;

drop policy if exists "public read etf daily flows" on public.etf_daily_flows;
create policy "public read etf daily flows"
  on public.etf_daily_flows
  for select
  using (true);

drop policy if exists "service role manage etf daily flows" on public.etf_daily_flows;
create policy "service role manage etf daily flows"
  on public.etf_daily_flows
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
