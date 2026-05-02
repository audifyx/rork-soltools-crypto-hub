-- 014_launchpad_watchlists_alerts.sql
-- Idempotent patch for token launchpad, upvotes, watchlists, wallets, and alerts.

do $$ begin
  create type public.alert_condition as enum ('above','below','volume_spike','whale_buy');
exception when duplicate_object then null; end $$;

create table if not exists public.pump_v5_submissions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.pump_v5_submissions
  add column if not exists user_id uuid references auth.users(id) on delete set null,
  add column if not exists token_name text,
  add column if not exists symbol text,
  add column if not exists description text,
  add column if not exists logo_url text,
  add column if not exists banner_url text,
  add column if not exists contract_address text,
  add column if not exists website text,
  add column if not exists twitter text,
  add column if not exists telegram text,
  add column if not exists discord text,
  add column if not exists tags text[] not null default '{}',
  add column if not exists liquidity_usd numeric(20,2),
  add column if not exists market_cap numeric(20,2),
  add column if not exists volume_24h_usd numeric(20,2),
  add column if not exists holders integer,
  add column if not exists price_usd numeric(24,12),
  add column if not exists change_24h_pct numeric(10,4),
  add column if not exists upvotes integer not null default 0,
  add column if not exists watchers integer not null default 0,
  add column if not exists is_featured boolean not null default false,
  add column if not exists is_hot boolean not null default false,
  add column if not exists is_verified boolean not null default false,
  add column if not exists status text not null default 'other';
create index if not exists pump_v5_created_idx on public.pump_v5_submissions (created_at desc);
create index if not exists pump_v5_user_idx on public.pump_v5_submissions (user_id);
create index if not exists pump_v5_contract_idx on public.pump_v5_submissions (contract_address);

create table if not exists public.launch_upvotes (
  user_id uuid not null references auth.users(id) on delete cascade,
  submission_id uuid not null references public.pump_v5_submissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, submission_id)
);

create table if not exists public.tracked_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_address text not null,
  symbol text,
  name text,
  notes text,
  created_at timestamptz not null default now(),
  unique (user_id, token_address)
);

create table if not exists public.tracked_wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  wallet_address text not null,
  label text,
  notes text,
  created_at timestamptz not null default now(),
  unique (user_id, wallet_address)
);

create table if not exists public.price_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_address text not null,
  symbol text,
  target_price numeric(24,12),
  condition public.alert_condition not null default 'above',
  is_active boolean not null default true,
  triggered_at timestamptz,
  created_at timestamptz not null default now()
);

create or replace function public.handle_launch_upvote()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.pump_v5_submissions set upvotes = upvotes + 1 where id = new.submission_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.pump_v5_submissions set upvotes = greatest(0, upvotes - 1) where id = old.submission_id;
    return old;
  end if;
  return null;
end $$;

drop trigger if exists launch_upvotes_count_ins on public.launch_upvotes;
create trigger launch_upvotes_count_ins after insert on public.launch_upvotes
for each row execute function public.handle_launch_upvote();
drop trigger if exists launch_upvotes_count_del on public.launch_upvotes;
create trigger launch_upvotes_count_del after delete on public.launch_upvotes
for each row execute function public.handle_launch_upvote();

do $$ begin
  alter table public.pump_v5_submissions enable row level security;
  alter table public.launch_upvotes enable row level security;
  alter table public.tracked_tokens enable row level security;
  alter table public.tracked_wallets enable row level security;
  alter table public.price_alerts enable row level security;

  drop policy if exists launch_read on public.pump_v5_submissions;
  create policy launch_read on public.pump_v5_submissions for select using (true);
  drop policy if exists launch_insert on public.pump_v5_submissions;
  create policy launch_insert on public.pump_v5_submissions for insert with check (auth.uid() = user_id);
  drop policy if exists launch_update on public.pump_v5_submissions;
  create policy launch_update on public.pump_v5_submissions for update using (auth.uid() = user_id or public.is_admin(auth.uid())) with check (auth.uid() = user_id or public.is_admin(auth.uid()));
  drop policy if exists launch_delete on public.pump_v5_submissions;
  create policy launch_delete on public.pump_v5_submissions for delete using (auth.uid() = user_id or public.is_admin(auth.uid()));

  drop policy if exists launch_upvotes_read on public.launch_upvotes;
  create policy launch_upvotes_read on public.launch_upvotes for select using (true);
  drop policy if exists launch_upvotes_insert on public.launch_upvotes;
  create policy launch_upvotes_insert on public.launch_upvotes for insert with check (auth.uid() = user_id);
  drop policy if exists launch_upvotes_delete on public.launch_upvotes;
  create policy launch_upvotes_delete on public.launch_upvotes for delete using (auth.uid() = user_id);

  drop policy if exists tracked_tokens_owner_all on public.tracked_tokens;
  create policy tracked_tokens_owner_all on public.tracked_tokens for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  drop policy if exists tracked_wallets_owner_all on public.tracked_wallets;
  create policy tracked_wallets_owner_all on public.tracked_wallets for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  drop policy if exists price_alerts_owner_all on public.price_alerts;
  create policy price_alerts_owner_all on public.price_alerts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
end $$;

select '014_launchpad_watchlists_alerts applied' as status;
