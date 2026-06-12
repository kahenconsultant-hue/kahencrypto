create table if not exists forecast_snapshots (
  id uuid primary key default gen_random_uuid(),
  snapshot_id text not null unique,
  forecast_timestamp timestamptz not null,
  asset text not null,
  asset_type text not null,
  prediction_horizon text not null,
  predicted_direction text not null,
  predicted_bias text not null,
  predicted_confidence numeric,
  risk_score numeric,
  liquidity_score numeric,
  regime text not null,
  main_drivers jsonb not null default '[]'::jsonb,
  price_at_prediction numeric not null,
  validation_date timestamptz not null,
  run_id text not null,
  engine_contributions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists forecast_snapshots_validation_date_idx
  on forecast_snapshots (validation_date);

create index if not exists forecast_snapshots_asset_horizon_idx
  on forecast_snapshots (asset, prediction_horizon, forecast_timestamp desc);

create table if not exists forecast_validations (
  id uuid primary key default gen_random_uuid(),
  validation_id text not null unique,
  snapshot_id text not null references forecast_snapshots(snapshot_id) on delete cascade,
  asset text not null,
  asset_type text not null,
  prediction_horizon text not null,
  prediction_timestamp timestamptz not null,
  validation_date timestamptz not null,
  validated_at timestamptz not null,
  predicted_direction text not null,
  predicted_confidence numeric,
  price_at_prediction numeric not null,
  actual_price numeric,
  realized_change_pct numeric,
  realized_direction text not null,
  result text not null,
  internal_score numeric,
  main_drivers jsonb not null default '[]'::jsonb,
  engine_contributions jsonb not null default '{}'::jsonb,
  outcome_summary_fa text not null,
  explanation_fa text not null,
  quality text not null,
  created_at timestamptz not null default now()
);

create index if not exists forecast_validations_asset_horizon_idx
  on forecast_validations (asset, prediction_horizon, validated_at desc);

create index if not exists forecast_validations_result_idx
  on forecast_validations (result, validated_at desc);

create table if not exists forecast_accuracy_monthly (
  id uuid primary key default gen_random_uuid(),
  month_key text not null,
  asset text,
  prediction_horizon text,
  engine text,
  validated_count integer not null default 0,
  accurate_count integer not null default 0,
  acceptable_count integer not null default 0,
  incorrect_count integer not null default 0,
  average_internal_score numeric,
  average_confidence numeric,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique(month_key, asset, prediction_horizon, engine)
);

