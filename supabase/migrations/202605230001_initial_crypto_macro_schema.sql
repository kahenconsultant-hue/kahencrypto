create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null default 'user' check (role in ('user', 'analyst', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  user_id uuid primary key references public.users(id) on delete cascade,
  display_name text,
  locale text not null default 'fa-IR',
  mode text not null default 'pro' check (mode in ('beginner', 'pro')),
  macro_focus boolean not null default true,
  onchain_focus boolean not null default true,
  stablecoin_focus boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  plan text not null check (plan in ('FREE', 'BASIC', 'PRO', 'EXPERT')),
  status text not null default 'active' check (status in ('trialing', 'active', 'past_due', 'canceled')),
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.source_categories (
  id text primary key,
  label_fa text not null,
  description_fa text,
  priority integer not null default 50
);

create table if not exists public.sources (
  id uuid primary key default gen_random_uuid(),
  category_id text not null references public.source_categories(id),
  name text not null,
  source_type text not null check (source_type in ('rss', 'api', 'crawler')),
  endpoint text not null,
  auth_required boolean not null default false,
  priority integer not null default 50,
  enabled boolean not null default true,
  health_status text not null default 'unknown' check (health_status in ('healthy', 'degraded', 'down', 'unknown')),
  last_ingested_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (name, endpoint)
);

create table if not exists public.raw_items (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.sources(id) on delete set null,
  source text not null,
  title text not null,
  content text,
  category text not null,
  timestamp timestamptz not null,
  language text not null,
  url text not null,
  fingerprint_hash text not null unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.processed_items (
  id uuid primary key default gen_random_uuid(),
  raw_item_id uuid references public.raw_items(id) on delete cascade,
  source text not null,
  category text not null,
  title_fa text not null,
  summary_fa text not null,
  key_points_fa jsonb not null default '[]'::jsonb,
  importance integer not null check (importance between 0 and 100),
  alert_level text not null check (alert_level in ('Info', 'Watch', 'Important', 'Critical')),
  tags text[] not null default '{}',
  market_regimes text[] not null default '{}',
  analysis_fa text not null,
  published_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists public.translations (
  id uuid primary key default gen_random_uuid(),
  raw_item_id uuid not null references public.raw_items(id) on delete cascade,
  language_from text not null,
  language_to text not null default 'fa',
  title_translated text not null,
  summary_translated text not null,
  model text,
  prompt_version text,
  created_at timestamptz not null default now()
);

create table if not exists public.impact_analyses (
  id uuid primary key default gen_random_uuid(),
  processed_item_id uuid not null references public.processed_items(id) on delete cascade,
  model text not null,
  prompt_version text not null,
  confidence integer not null check (confidence between 0 and 100),
  regime text,
  reasoning_fa text not null,
  invalidation_fa text,
  created_at timestamptz not null default now()
);

create table if not exists public.asset_impacts (
  id uuid primary key default gen_random_uuid(),
  impact_analysis_id uuid references public.impact_analyses(id) on delete cascade,
  processed_item_id uuid not null references public.processed_items(id) on delete cascade,
  asset text not null check (asset in ('BTC', 'ETH', 'SOL', 'USDT', 'DXY', 'Gold', 'Nasdaq', 'US10Y', 'Fed')),
  horizon text not null check (horizon in ('short', 'medium', 'long')),
  direction text not null check (direction in ('supportive', 'pressure', 'mixed', 'neutral')),
  confidence integer not null check (confidence between 0 and 100),
  explanation_fa text not null,
  invalidation_fa text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  processed_item_id uuid references public.processed_items(id) on delete set null,
  type text not null,
  level text not null check (level in ('Info', 'Watch', 'Important', 'Critical')),
  title_fa text not null,
  reasoning_fa text not null,
  scenario_fa text not null,
  affected_assets text[] not null default '{}',
  confidence integer not null check (confidence between 0 and 100),
  status text not null default 'pending' check (status in ('pending', 'approved', 'suppressed', 'sent')),
  created_by uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create table if not exists public.market_regimes (
  id uuid primary key default gen_random_uuid(),
  active_regime text not null,
  secondary_regimes text[] not null default '{}',
  confidence integer not null check (confidence between 0 and 100),
  risk_score integer not null check (risk_score between 0 and 100),
  liquidity_score integer not null check (liquidity_score between 0 and 100),
  leverage_score integer not null check (leverage_score between 0 and 100),
  stress_score integer not null check (stress_score between 0 and 100),
  interpretation_fa text not null,
  invalidation_fa text,
  input_vector jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.liquidity_snapshots (
  id uuid primary key default gen_random_uuid(),
  liquidity_score integer not null check (liquidity_score between 0 and 100),
  fed_balance_sheet numeric,
  reverse_repo numeric,
  tga numeric,
  dxy numeric,
  us10y numeric,
  stablecoin_supply_change_7d numeric,
  etf_net_flows_5d numeric,
  exchange_reserve_trend text,
  interpretation_fa text not null,
  observed_at timestamptz not null default now()
);

create table if not exists public.stablecoin_snapshots (
  id uuid primary key default gen_random_uuid(),
  asset text not null default 'USDT',
  network text not null,
  supply numeric,
  mint_amount numeric,
  burn_amount numeric,
  dominance numeric,
  exchange_inflow numeric,
  exchange_outflow numeric,
  iran_premium numeric,
  freeze_risk_score integer check (freeze_risk_score between 0 and 100),
  interpretation_fa text,
  observed_at timestamptz not null default now()
);

create table if not exists public.etf_flow_snapshots (
  id uuid primary key default gen_random_uuid(),
  issuer text not null,
  ticker text not null,
  asset text not null default 'BTC',
  net_flow numeric not null,
  cumulative_flow numeric,
  aum numeric,
  confidence integer check (confidence between 0 and 100),
  observed_at date not null,
  created_at timestamptz not null default now(),
  unique (ticker, observed_at)
);

create table if not exists public.onchain_snapshots (
  id uuid primary key default gen_random_uuid(),
  asset text not null,
  active_addresses numeric,
  exchange_reserves numeric,
  whale_exchange_inflow numeric,
  realized_profit_loss numeric,
  mvrv numeric,
  metadata jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null default now()
);

create table if not exists public.derivatives_snapshots (
  id uuid primary key default gen_random_uuid(),
  asset text not null,
  funding_rate numeric,
  open_interest numeric,
  basis numeric,
  options_skew numeric,
  liquidation_risk_score integer check (liquidation_risk_score between 0 and 100),
  metadata jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null default now()
);

create table if not exists public.sentiment_snapshots (
  id uuid primary key default gen_random_uuid(),
  fear_greed integer check (fear_greed between 0 and 100),
  retail_sentiment integer check (retail_sentiment between 0 and 100),
  professional_sentiment integer check (professional_sentiment between 0 and 100),
  panic_euphoria_score integer check (panic_euphoria_score between 0 and 100),
  narrative_clusters jsonb not null default '[]'::jsonb,
  interpretation_fa text,
  observed_at timestamptz not null default now()
);

create table if not exists public.correlation_snapshots (
  id uuid primary key default gen_random_uuid(),
  left_asset text not null,
  right_asset text not null,
  rolling_7d numeric not null,
  rolling_30d numeric not null,
  rolling_90d numeric not null,
  change_7d numeric not null,
  regime_state text not null check (regime_state in ('stable', 'shifting', 'decoupling', 'breakdown')),
  interpretation_fa text not null,
  observed_at timestamptz not null default now()
);

create table if not exists public.watchlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  name text not null,
  assets text[] not null default '{}',
  alert_types text[] not null default '{}',
  analysis_depth text not null default 'pro' check (analysis_depth in ('beginner', 'pro', 'expert')),
  macro_focus boolean not null default true,
  onchain_focus boolean not null default false,
  stablecoin_focus boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  processed_item_id uuid references public.processed_items(id) on delete cascade,
  alert_id uuid references public.alerts(id) on delete cascade,
  note text,
  created_at timestamptz not null default now(),
  check ((processed_item_id is not null) or (alert_id is not null))
);

create table if not exists public.ai_logs (
  id uuid primary key default gen_random_uuid(),
  raw_item_id uuid references public.raw_items(id) on delete set null,
  processed_item_id uuid references public.processed_items(id) on delete set null,
  model text not null,
  prompt_version text not null,
  prompt_hash text not null,
  input_tokens integer,
  output_tokens integer,
  latency_ms integer,
  status text not null check (status in ('success', 'failed', 'skipped')),
  error text,
  created_at timestamptz not null default now()
);

create table if not exists public.ingestion_jobs (
  id uuid primary key default gen_random_uuid(),
  source_id uuid references public.sources(id) on delete set null,
  status text not null default 'queued' check (status in ('queued', 'running', 'success', 'failed', 'retrying')),
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  payload jsonb not null default '{}'::jsonb,
  error text,
  run_after timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.audit_trail (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists raw_items_category_timestamp_idx on public.raw_items (category, timestamp desc);
create index if not exists raw_items_fingerprint_idx on public.raw_items (fingerprint_hash);
create index if not exists processed_items_category_importance_idx on public.processed_items (category, importance desc, published_at desc);
create index if not exists asset_impacts_asset_horizon_idx on public.asset_impacts (asset, horizon, created_at desc);
create index if not exists alerts_level_status_idx on public.alerts (level, status, created_at desc);
create index if not exists liquidity_snapshots_observed_idx on public.liquidity_snapshots (observed_at desc);
create index if not exists correlation_snapshots_pair_idx on public.correlation_snapshots (left_asset, right_asset, observed_at desc);
create index if not exists watchlists_user_idx on public.watchlists (user_id);
create index if not exists bookmarks_user_idx on public.bookmarks (user_id);
create index if not exists ai_logs_status_idx on public.ai_logs (status, created_at desc);
create index if not exists ingestion_jobs_status_idx on public.ingestion_jobs (status, run_after);

alter table public.users enable row level security;
alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.source_categories enable row level security;
alter table public.sources enable row level security;
alter table public.raw_items enable row level security;
alter table public.processed_items enable row level security;
alter table public.translations enable row level security;
alter table public.impact_analyses enable row level security;
alter table public.asset_impacts enable row level security;
alter table public.alerts enable row level security;
alter table public.market_regimes enable row level security;
alter table public.liquidity_snapshots enable row level security;
alter table public.stablecoin_snapshots enable row level security;
alter table public.etf_flow_snapshots enable row level security;
alter table public.onchain_snapshots enable row level security;
alter table public.derivatives_snapshots enable row level security;
alter table public.sentiment_snapshots enable row level security;
alter table public.correlation_snapshots enable row level security;
alter table public.watchlists enable row level security;
alter table public.bookmarks enable row level security;
alter table public.ai_logs enable row level security;
alter table public.ingestion_jobs enable row level security;
alter table public.audit_trail enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'app_role', '') = 'admin'
    or exists (select 1 from public.users where id = auth.uid() and role = 'admin')
$$;

create policy "users can read own user row" on public.users for select using (id = auth.uid() or public.is_admin());
create policy "users can update own profile user row" on public.users for update using (id = auth.uid() or public.is_admin());
create policy "profiles own read" on public.profiles for select using (user_id = auth.uid() or public.is_admin());
create policy "profiles own write" on public.profiles for all using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());
create policy "subscriptions own read" on public.subscriptions for select using (user_id = auth.uid() or public.is_admin());
create policy "watchlists own write" on public.watchlists for all using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());
create policy "bookmarks own write" on public.bookmarks for all using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());

create policy "public read categories" on public.source_categories for select using (true);
create policy "public read processed items" on public.processed_items for select using (true);
create policy "public read asset impacts" on public.asset_impacts for select using (true);
create policy "public read approved alerts" on public.alerts for select using (status in ('approved', 'sent') or public.is_admin());
create policy "public read regimes" on public.market_regimes for select using (true);
create policy "public read liquidity" on public.liquidity_snapshots for select using (true);
create policy "public read stablecoins" on public.stablecoin_snapshots for select using (true);
create policy "public read etf" on public.etf_flow_snapshots for select using (true);
create policy "public read onchain" on public.onchain_snapshots for select using (true);
create policy "public read derivatives" on public.derivatives_snapshots for select using (true);
create policy "public read sentiment" on public.sentiment_snapshots for select using (true);
create policy "public read correlations" on public.correlation_snapshots for select using (true);

create policy "admin manage sources" on public.sources for all using (public.is_admin()) with check (public.is_admin());
create policy "admin manage raw items" on public.raw_items for all using (public.is_admin()) with check (public.is_admin());
create policy "admin manage translations" on public.translations for all using (public.is_admin()) with check (public.is_admin());
create policy "admin manage impact analyses" on public.impact_analyses for all using (public.is_admin()) with check (public.is_admin());
create policy "admin manage alerts" on public.alerts for all using (public.is_admin()) with check (public.is_admin());
create policy "admin manage ai logs" on public.ai_logs for all using (public.is_admin()) with check (public.is_admin());
create policy "admin manage jobs" on public.ingestion_jobs for all using (public.is_admin()) with check (public.is_admin());
create policy "admin read audit" on public.audit_trail for select using (public.is_admin());

insert into public.source_categories (id, label_fa, description_fa, priority) values
  ('central_banks', 'بانک‌های مرکزی', 'Fed, ECB, BOJ, PBOC, IMF, BIS', 100),
  ('economic_data', 'داده‌های اقتصادی', 'FRED, BLS, BEA, Trading Economics', 95),
  ('financial_media', 'رسانه‌های مالی', 'Reuters, Bloomberg, FT, WSJ, CNBC', 88),
  ('crypto_media', 'رسانه‌های کریپتو', 'CoinDesk, The Block, Blockworks, Cointelegraph', 82),
  ('onchain', 'آن‌چین', 'Glassnode, Nansen, CryptoQuant, Coin Metrics, Santiment', 90),
  ('derivatives', 'مشتقات و leverage', 'CoinGlass, Deribit, Binance Futures, CME', 90),
  ('stablecoins', 'استیبل‌کوین', 'Tether, Circle, DefiLlama', 96),
  ('etf', 'ETF flows', 'Farside, IBIT, FBTC', 96),
  ('sentiment', 'سنتیمنت', 'X, Reddit, YouTube', 75),
  ('geopolitics', 'ژئوپلیتیک', 'White House, Treasury, NATO, OPEC', 92),
  ('alternative_data', 'داده‌های جایگزین', 'Search, app rankings, GitHub, web traffic', 70),
  ('exchange_health', 'سلامت صرافی‌ها', 'Proof of reserves and withdrawal risk', 93),
  ('volatility_regime', 'Volatility / Regime', 'DVOL, VIX, MOVE, vol-of-vol', 86)
on conflict (id) do update set label_fa = excluded.label_fa, description_fa = excluded.description_fa, priority = excluded.priority;
