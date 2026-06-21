alter table public.users
  add column if not exists full_name text,
  add column if not exists phone_or_telegram text,
  add column if not exists country text,
  add column if not exists status text not null default 'PENDING_PAYMENT',
  add column if not exists consent_accepted boolean not null default false,
  add column if not exists terms_accepted boolean not null default false,
  add column if not exists admin_notes text,
  add column if not exists activated_at timestamptz,
  add column if not exists suspended_at timestamptz,
  add column if not exists last_login_at timestamptz;

alter table public.users alter column role set default 'customer';
alter table public.users drop constraint if exists users_role_check;
alter table public.users
  add constraint users_role_check check (role in ('customer', 'user', 'analyst', 'admin'));

alter table public.users drop constraint if exists users_status_check;
alter table public.users
  add constraint users_status_check check (
    status in ('PENDING_PAYMENT', 'PAYMENT_SUBMITTED', 'ACTIVE', 'SUSPENDED', 'REJECTED', 'DISABLED')
  );

create unique index if not exists users_email_lower_unique on public.users (lower(email));
create index if not exists users_status_created_idx on public.users (status, created_at desc);
create index if not exists users_role_idx on public.users (role);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and role = 'admin'
  )
$$;

drop policy if exists "users can update own profile user row" on public.users;
create policy "users can update safe own user fields"
  on public.users for update
  using (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

revoke update on public.users from authenticated;
grant update (full_name, phone_or_telegram, country, updated_at, last_login_at) on public.users to authenticated;

create table if not exists public.email_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete set null,
  recipient_email text not null,
  subject text not null,
  template_key text not null,
  status text not null check (status in ('sent', 'failed', 'skipped_not_configured')),
  sent_at timestamptz,
  error text,
  created_at timestamptz not null default now()
);

create index if not exists email_logs_user_created_idx on public.email_logs (user_id, created_at desc);
create index if not exists email_logs_recipient_created_idx on public.email_logs (recipient_email, created_at desc);
alter table public.email_logs enable row level security;

drop policy if exists "admins can read email logs" on public.email_logs;
create policy "admins can read email logs"
  on public.email_logs for select
  using (public.is_admin());

comment on column public.users.status is 'Manual CMIP customer access state. Customers cannot update this field.';
comment on column public.users.role is 'Server-managed authorization role. Customers cannot update this field.';

