create table if not exists public.derived_signals (
  id uuid primary key default gen_random_uuid(),
  run_id uuid,
  signal_key text not null,
  label_fa text not null,
  source_type text not null check (source_type in ('direct', 'derived', 'proxy', 'unavailable')),
  score numeric,
  confidence integer check (confidence between 0 and 100),
  quality text not null default 'unavailable' check (quality in ('live', 'partial_live', 'delayed', 'estimated', 'unavailable')),
  affected_assets text[] not null default '{}',
  time_horizon text not null default '24h-7d',
  used_inputs text[] not null default '{}',
  missing_inputs text[] not null default '{}',
  explanation_fa text not null,
  formula text not null,
  payload jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.liquidity_scores (
  id uuid primary key default gen_random_uuid(),
  run_id uuid,
  score_key text not null,
  source_type text not null check (source_type in ('direct', 'derived', 'proxy', 'unavailable')),
  crypto_liquidity_proxy_score numeric,
  macro_liquidity_pressure_score numeric,
  stablecoin_pressure numeric,
  confidence integer check (confidence between 0 and 100),
  quality text not null default 'unavailable' check (quality in ('live', 'partial_live', 'delayed', 'estimated', 'unavailable')),
  unavailable_premium_inputs text[] not null default '{}',
  explanation_fa text not null,
  payload jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.regime_inputs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid,
  regime_key text not null,
  source_type text not null check (source_type in ('direct', 'derived', 'proxy', 'unavailable')),
  regime text not null,
  confidence integer check (confidence between 0 and 100),
  quality text not null default 'unavailable' check (quality in ('live', 'partial_live', 'delayed', 'estimated', 'unavailable')),
  used_inputs text[] not null default '{}',
  missing_inputs text[] not null default '{}',
  explanation_fa text not null,
  payload jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists derived_signals_key_time_idx on public.derived_signals (signal_key, generated_at desc);
create index if not exists liquidity_scores_key_time_idx on public.liquidity_scores (score_key, generated_at desc);
create index if not exists regime_inputs_key_time_idx on public.regime_inputs (regime_key, generated_at desc);

alter table public.derived_signals enable row level security;
alter table public.liquidity_scores enable row level security;
alter table public.regime_inputs enable row level security;

drop policy if exists "public read derived signals" on public.derived_signals;
drop policy if exists "public read liquidity scores" on public.liquidity_scores;
drop policy if exists "public read regime inputs" on public.regime_inputs;

create policy "public read derived signals" on public.derived_signals for select using (true);
create policy "public read liquidity scores" on public.liquidity_scores for select using (true);
create policy "public read regime inputs" on public.regime_inputs for select using (true);
