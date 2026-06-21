create or replace function public.has_active_customer_access()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.users
    where id = auth.uid()
      and (role = 'admin' or status = 'ACTIVE')
  )
$$;

-- Customer-facing intelligence is readable only by active accounts. Public samples
-- are static application content and never query these tables.
drop policy if exists "public read processed items" on public.processed_items;
drop policy if exists "public read asset impacts" on public.asset_impacts;
drop policy if exists "public read approved alerts" on public.alerts;
drop policy if exists "public read regimes" on public.market_regimes;
drop policy if exists "public read liquidity" on public.liquidity_snapshots;
drop policy if exists "public read stablecoins" on public.stablecoin_snapshots;
drop policy if exists "public read etf" on public.etf_flow_snapshots;
drop policy if exists "public read onchain" on public.onchain_snapshots;
drop policy if exists "public read derivatives" on public.derivatives_snapshots;
drop policy if exists "public read sentiment" on public.sentiment_snapshots;
drop policy if exists "public read correlations" on public.correlation_snapshots;
drop policy if exists "public read normalized events" on public.normalized_events;
drop policy if exists "public read approved smart alerts" on public.smart_alerts;
drop policy if exists "public read reliability snapshots" on public.reliability_snapshots;
drop policy if exists "public read event clusters" on public.event_clusters;
drop policy if exists "public read derived signals" on public.derived_signals;
drop policy if exists "public read liquidity scores" on public.liquidity_scores;
drop policy if exists "public read regime inputs" on public.regime_inputs;
drop policy if exists "public read market snapshots" on public.market_snapshots;
drop policy if exists "public read intelligence outputs" on public.intelligence_outputs;
drop policy if exists "public read etf daily flows" on public.etf_daily_flows;

create policy "active customers read processed items" on public.processed_items for select using (public.has_active_customer_access());
create policy "active customers read asset impacts" on public.asset_impacts for select using (public.has_active_customer_access());
create policy "active customers read approved alerts" on public.alerts for select using (public.has_active_customer_access() and status in ('approved', 'sent'));
create policy "active customers read regimes" on public.market_regimes for select using (public.has_active_customer_access());
create policy "active customers read liquidity" on public.liquidity_snapshots for select using (public.has_active_customer_access());
create policy "active customers read stablecoins" on public.stablecoin_snapshots for select using (public.has_active_customer_access());
create policy "active customers read etf" on public.etf_flow_snapshots for select using (public.has_active_customer_access());
create policy "active customers read onchain" on public.onchain_snapshots for select using (public.has_active_customer_access());
create policy "active customers read derivatives" on public.derivatives_snapshots for select using (public.has_active_customer_access());
create policy "active customers read sentiment" on public.sentiment_snapshots for select using (public.has_active_customer_access());
create policy "active customers read correlations" on public.correlation_snapshots for select using (public.has_active_customer_access());
create policy "active customers read normalized events" on public.normalized_events for select using (public.has_active_customer_access());
create policy "active customers read approved smart alerts" on public.smart_alerts for select using (public.has_active_customer_access() and status in ('approved', 'sent'));
create policy "active customers read reliability snapshots" on public.reliability_snapshots for select using (public.has_active_customer_access());
create policy "active customers read event clusters" on public.event_clusters for select using (public.has_active_customer_access());
create policy "active customers read derived signals" on public.derived_signals for select using (public.has_active_customer_access());
create policy "active customers read liquidity scores" on public.liquidity_scores for select using (public.has_active_customer_access());
create policy "active customers read regime inputs" on public.regime_inputs for select using (public.has_active_customer_access());
create policy "active customers read market snapshots" on public.market_snapshots for select using (public.has_active_customer_access());
create policy "active customers read intelligence outputs" on public.intelligence_outputs for select using (public.has_active_customer_access());
create policy "active customers read etf daily flows" on public.etf_daily_flows for select using (public.has_active_customer_access());

-- Operational and raw ingestion data is never customer-facing.
drop policy if exists "public read source health" on public.source_health;
drop policy if exists "public read raw events" on public.raw_events;
drop policy if exists "public read raw metrics" on public.raw_metrics;
drop policy if exists "public read ingestion runs" on public.ingestion_runs;
create policy "admins read source health" on public.source_health for select using (public.is_admin());
create policy "admins read raw events" on public.raw_events for select using (public.is_admin());
create policy "admins read raw metrics" on public.raw_metrics for select using (public.is_admin());
create policy "admins read ingestion runs" on public.ingestion_runs for select using (public.is_admin());

alter table public.forecast_snapshots enable row level security;
alter table public.forecast_validations enable row level security;
alter table public.forecast_accuracy_monthly enable row level security;

drop policy if exists "active customers read forecast snapshots" on public.forecast_snapshots;
drop policy if exists "active customers read forecast validations" on public.forecast_validations;
drop policy if exists "active customers read forecast accuracy monthly" on public.forecast_accuracy_monthly;
create policy "active customers read forecast snapshots" on public.forecast_snapshots for select using (public.has_active_customer_access());
create policy "active customers read forecast validations" on public.forecast_validations for select using (public.has_active_customer_access());
create policy "active customers read forecast accuracy monthly" on public.forecast_accuracy_monthly for select using (public.has_active_customer_access());

comment on function public.has_active_customer_access() is 'True only for ACTIVE CMIP customers or administrators.';
