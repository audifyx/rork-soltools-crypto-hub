-- OGScan mobile state + watch intelligence tables
-- Use this if backend persistence is needed beyond local AsyncStorage.

create extension if not exists pgcrypto;

create table if not exists public.ogscan_user_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  selected_mint text not null default 'EfnZmcFKMXofKA5V5ujvjqtSorvuQD2MzJPz3dxXpump',
  active_chain text not null default 'solana' check (active_chain = 'solana'),
  recent_searches text[] not null default array['OGScan','EfnZmcFKMXofKA5V5ujvjqtSorvuQD2MzJPz3dxXpump'],
  filter_presets jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ogscan_watched_mints (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mint text not null,
  label text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(user_id, mint)
);

create table if not exists public.ogscan_watched_devs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  wallet text not null,
  label text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(user_id, wallet)
);

create index if not exists ogscan_watched_mints_user_created_idx on public.ogscan_watched_mints(user_id, created_at desc);
create index if not exists ogscan_watched_devs_user_created_idx on public.ogscan_watched_devs(user_id, created_at desc);

alter table public.ogscan_user_state enable row level security;
alter table public.ogscan_watched_mints enable row level security;
alter table public.ogscan_watched_devs enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='ogscan_user_state' and policyname='ogscan_user_state_own') then
    create policy ogscan_user_state_own on public.ogscan_user_state for all using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='ogscan_watched_mints' and policyname='ogscan_watched_mints_own') then
    create policy ogscan_watched_mints_own on public.ogscan_watched_mints for all using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='ogscan_watched_devs' and policyname='ogscan_watched_devs_own') then
    create policy ogscan_watched_devs_own on public.ogscan_watched_devs for all using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
end $$;

insert into public.ogscan_watched_mints(user_id, mint, label)
select id, 'EfnZmcFKMXofKA5V5ujvjqtSorvuQD2MzJPz3dxXpump', 'Official OGScan token'
from auth.users
on conflict (user_id, mint) do nothing;

insert into public.ogscan_watched_devs(user_id, wallet, label)
select id, 'CicbPxARTDrwQ4XcxWsn6SYeG4FMJHirS633cZUJeQDh', 'Official OGScan dev wallet'
from auth.users
on conflict (user_id, wallet) do nothing;
