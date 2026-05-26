insert into public.source_categories (id, label_fa, description_fa, priority)
values
  ('central_banks', 'بانک‌های مرکزی', 'سیاست پولی و اطلاعیه‌های بانک مرکزی', 100),
  ('economic_data', 'داده‌های اقتصادی', 'تقویم و داده‌های اقتصاد کلان', 95),
  ('financial_media', 'رسانه‌های مالی', 'خبرهای مالی و بازارهای سنتی', 80),
  ('crypto_media', 'رسانه‌های کریپتو', 'خبرهای تخصصی بازار کریپتو', 75),
  ('onchain', 'آن‌چین', 'تراکنش، ذخایر و جریان کیف پول‌ها', 85),
  ('derivatives', 'مشتقات', 'فاندینگ، بهره باز و اهرم', 85),
  ('stablecoins', 'استیبل‌کوین', 'عرضه، مینت، برن و جریان نقدینگی استیبل‌کوین', 90),
  ('etf', 'ETF', 'جریان نهادی و صندوق‌های قابل معامله', 90),
  ('sentiment', 'سنتیمنت', 'سنتیمنت خبری و اجتماعی', 65),
  ('geopolitics', 'ژئوپلیتیک', 'تنش‌های سیاسی، امنیتی و ریسک تحریم', 80),
  ('alternative_data', 'داده جایگزین', 'منابع مکمل و داده‌های غیرساختاریافته', 45),
  ('exchange_health', 'سلامت صرافی', 'ریسک نقدینگی و عملیاتی صرافی‌ها', 75),
  ('volatility_regime', 'نوسان و رژیم', 'نوسان، ترس و تغییر رژیم بازار', 80),
  ('market_data', 'داده بازار', 'قیمت، حجم، نرخ و سری‌های قابل محاسبه', 100),
  ('source_health', 'سلامت منابع', 'وضعیت فنی منابع و ingestion', 60)
on conflict (id) do update set
  label_fa = excluded.label_fa,
  description_fa = excluded.description_fa,
  priority = excluded.priority;

alter table public.sources drop constraint if exists sources_source_type_check;
alter table public.sources add constraint sources_source_type_check
  check (source_type in ('rss', 'api', 'crawler', 'websocket', 'scraper', 'social', 'filings'));

alter table public.sources add column if not exists source_key text;
alter table public.sources add column if not exists polling_interval_seconds integer not null default 1800;
alter table public.sources add column if not exists timeout_ms integer not null default 8000;
alter table public.sources add column if not exists parser text not null default 'none';
alter table public.sources add column if not exists tier integer not null default 3 check (tier between 1 and 3);
alter table public.sources add column if not exists asset_relevance text[] not null default '{}';
alter table public.sources add column if not exists required_env_keys text[] not null default '{}';
alter table public.sources add column if not exists rate_limit_per_minute integer;
alter table public.sources add column if not exists degraded_mode text not null default 'mark_unavailable'
  check (degraded_mode in ('disable_module', 'mark_unavailable', 'allow_partial'));

create unique index if not exists sources_source_key_uidx on public.sources (source_key) where source_key is not null;
create index if not exists sources_enabled_idx on public.sources (enabled, priority desc);

create table if not exists public.processing_errors (
  id uuid primary key default gen_random_uuid(),
  run_id uuid,
  job_id text,
  source_id_text text,
  pipeline_stage text not null,
  severity text not null default 'error' check (severity in ('info', 'warning', 'error', 'critical')),
  message text not null,
  error_code text,
  payload jsonb not null default '{}'::jsonb,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.dead_letters (
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

create table if not exists public.normalized_events (
  id uuid primary key default gen_random_uuid(),
  raw_event_id uuid references public.raw_events(id) on delete set null,
  source_id_text text,
  event_type text not null,
  category text not null,
  affected_assets text[] not null default '{}',
  title text not null,
  summary text,
  event_timestamp timestamptz not null,
  normalized_payload jsonb not null default '{}'::jsonb,
  quality text not null default 'unavailable' check (quality in ('live', 'partial_live', 'delayed', 'estimated', 'unavailable')),
  confidence integer check (confidence between 0 and 100),
  processing_status text not null default 'pending' check (processing_status in ('pending', 'processed', 'failed', 'skipped')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.smart_alerts (
  id uuid primary key default gen_random_uuid(),
  normalized_event_id uuid references public.normalized_events(id) on delete set null,
  run_id uuid,
  alert_type text not null,
  priority text not null check (priority in ('low', 'medium', 'high', 'critical')),
  direction text not null check (direction in ('bullish', 'bearish', 'neutral', 'mixed')),
  title_fa text not null,
  explanation_fa text not null,
  affected_assets text[] not null default '{}',
  evidence jsonb not null default '{}'::jsonb,
  confidence integer check (confidence between 0 and 100),
  status text not null default 'draft' check (status in ('draft', 'review', 'approved', 'suppressed', 'sent')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.reliability_snapshots (
  id uuid primary key default gen_random_uuid(),
  run_id uuid,
  storage_mode text not null check (storage_mode in ('supabase', 'local_fallback', 'memory')),
  supabase_connected boolean not null default false,
  service_role_available boolean not null default false,
  active_sources integer not null default 0,
  failed_sources integer not null default 0,
  missing_api_keys text[] not null default '{}',
  coverage jsonb not null default '{}'::jsonb,
  write_status jsonb not null default '{}'::jsonb,
  observed_at timestamptz not null default now()
);

create index if not exists processing_errors_stage_idx on public.processing_errors (pipeline_stage, created_at desc);
create index if not exists dead_letters_run_idx on public.dead_letters (run_id, failed_at desc);
create index if not exists dead_letters_source_idx on public.dead_letters (source_id_text, failed_at desc);
create index if not exists normalized_events_time_idx on public.normalized_events (event_timestamp desc);
create index if not exists normalized_events_type_idx on public.normalized_events (event_type, event_timestamp desc);
create index if not exists smart_alerts_status_idx on public.smart_alerts (status, created_at desc);
create index if not exists reliability_snapshots_time_idx on public.reliability_snapshots (observed_at desc);

alter table public.processing_errors enable row level security;
alter table public.dead_letters enable row level security;
alter table public.normalized_events enable row level security;
alter table public.smart_alerts enable row level security;
alter table public.reliability_snapshots enable row level security;

drop policy if exists "admin read processing errors" on public.processing_errors;
drop policy if exists "admin read dead letters" on public.dead_letters;
drop policy if exists "public read normalized events" on public.normalized_events;
drop policy if exists "public read approved smart alerts" on public.smart_alerts;
drop policy if exists "public read reliability snapshots" on public.reliability_snapshots;

create policy "admin read processing errors" on public.processing_errors for select using (public.is_admin());
create policy "admin read dead letters" on public.dead_letters for select using (public.is_admin());
create policy "public read normalized events" on public.normalized_events for select using (true);
create policy "public read approved smart alerts" on public.smart_alerts for select using (status in ('approved', 'sent') or public.is_admin());
create policy "public read reliability snapshots" on public.reliability_snapshots for select using (true);
