-- 035_soltools_full_platform_integration.sql
-- Full SOL Tools platform integration schema + compatibility aliases.
-- Safe to run more than once.

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Roles / admin guard
-- -----------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'app_role') then
    create type public.app_role as enum ('admin', 'moderator', 'user');
  end if;
end $$;

create table if not exists public.user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null default 'user',
  created_at timestamptz not null default now(),
  primary key (user_id, role)
);

alter table public.user_roles enable row level security;

create or replace function public.has_role(target_user_id uuid, target_role public.app_role)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.user_roles ur
    where ur.user_id = target_user_id
      and ur.role = target_role
  );
$$;

create or replace function public.is_platform_admin(target_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public, auth
stable
as $$
  select coalesce(public.has_role(target_user_id, 'admin'::public.app_role), false)
    or exists (
      select 1 from auth.users u
      where u.id = target_user_id
        and lower(u.email) = 'audifyx@gmail.com'
    );
$$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='user_roles' and policyname='user_roles_select_self_or_admin') then
    create policy user_roles_select_self_or_admin on public.user_roles
      for select to authenticated
      using (auth.uid() = user_id or public.is_platform_admin(auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='user_roles' and policyname='user_roles_admin_write') then
    create policy user_roles_admin_write on public.user_roles
      for all to authenticated
      using (public.is_platform_admin(auth.uid()))
      with check (public.is_platform_admin(auth.uid()));
  end if;
end $$;

grant execute on function public.has_role(uuid, public.app_role) to authenticated;
grant execute on function public.is_platform_admin(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Profiles compatibility + reserved username guard
-- -----------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete cascade,
  username text unique,
  display_name text,
  avatar_url text,
  banner_url text,
  bio text,
  sol_wallet text,
  wallet_address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists username text,
  add column if not exists display_name text,
  add column if not exists avatar_url text,
  add column if not exists banner_url text,
  add column if not exists bio text,
  add column if not exists sol_wallet text,
  add column if not exists wallet_address text,
  add column if not exists twitter_handle text,
  add column if not exists website text,
  add column if not exists location text,
  add column if not exists followers_count integer not null default 0,
  add column if not exists following_count integer not null default 0,
  add column if not exists verified boolean not null default false,
  add column if not exists custom_badges jsonb not null default '[]'::jsonb,
  add column if not exists trades_count integer not null default 0,
  add column if not exists win_rate numeric not null default 0,
  add column if not exists pnl_pct numeric not null default 0,
  add column if not exists xp integer not null default 0,
  add column if not exists badge text,
  add column if not exists avatar_color text,
  add column if not exists banner_from text,
  add column if not exists banner_to text,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists profiles_user_id_unique_idx on public.profiles(user_id) where user_id is not null;
create unique index if not exists profiles_username_lower_unique_idx on public.profiles(lower(username)) where username is not null;

create or replace function public.block_reserved_username()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.username is not null
    and lower(trim(new.username)) = 'administrator'
    and not public.is_platform_admin(coalesce(new.user_id, new.id)) then
    raise exception 'Reserved username';
  end if;
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_block_reserved_username on public.profiles;
create trigger profiles_block_reserved_username
before insert or update of username on public.profiles
for each row execute function public.block_reserved_username();

alter table public.profiles enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='profiles_select_public') then
    create policy profiles_select_public on public.profiles for select using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='profiles_insert_own') then
    create policy profiles_insert_own on public.profiles for insert to authenticated
      with check (auth.uid() = user_id or auth.uid() = id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='profiles_update_own_or_admin') then
    create policy profiles_update_own_or_admin on public.profiles for update to authenticated
      using (auth.uid() = user_id or auth.uid() = id or public.is_platform_admin(auth.uid()))
      with check (auth.uid() = user_id or auth.uid() = id or public.is_platform_admin(auth.uid()));
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- User tracking tables
-- -----------------------------------------------------------------------------
create table if not exists public.tracked_wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  address text,
  wallet_address text,
  label text not null default 'Tracked wallet',
  created_at timestamptz not null default now(),
  constraint tracked_wallets_any_address check (coalesce(address, wallet_address) is not null)
);

alter table public.tracked_wallets
  add column if not exists address text,
  add column if not exists wallet_address text,
  add column if not exists label text not null default 'Tracked wallet';

create unique index if not exists tracked_wallets_user_wallet_unique_idx
  on public.tracked_wallets(user_id, coalesce(address, wallet_address));
create index if not exists tracked_wallets_user_created_idx on public.tracked_wallets(user_id, created_at desc);

create table if not exists public.watchlist_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mint text not null,
  symbol text,
  name text,
  added_at timestamptz not null default now(),
  unique (user_id, mint)
);

create table if not exists public.tracked_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_address text not null,
  symbol text,
  name text,
  created_at timestamptz not null default now(),
  unique (user_id, token_address)
);

create table if not exists public.price_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mint text,
  token_address text,
  symbol text,
  target_price numeric not null,
  direction text,
  condition text,
  triggered boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint price_alerts_direction_check check (coalesce(direction, condition, 'above') in ('above', 'below', 'volume_spike', 'whale_buy'))
);

alter table public.price_alerts
  add column if not exists mint text,
  add column if not exists token_address text,
  add column if not exists symbol text,
  add column if not exists direction text,
  add column if not exists condition text,
  add column if not exists triggered boolean not null default false,
  add column if not exists is_active boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists price_alerts_user_active_idx on public.price_alerts(user_id, is_active, created_at desc);
create index if not exists price_alerts_target_idx on public.price_alerts(coalesce(mint, token_address), target_price) where is_active = true;

alter table public.tracked_wallets enable row level security;
alter table public.watchlist_tokens enable row level security;
alter table public.tracked_tokens enable row level security;
alter table public.price_alerts enable row level security;

do $$
declare
  tbl text;
begin
  foreach tbl in array array['tracked_wallets','watchlist_tokens','tracked_tokens','price_alerts'] loop
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=tbl and policyname=tbl || '_select_own') then
      execute format('create policy %I on public.%I for select to authenticated using (auth.uid() = user_id)', tbl || '_select_own', tbl);
    end if;
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=tbl and policyname=tbl || '_insert_own') then
      execute format('create policy %I on public.%I for insert to authenticated with check (auth.uid() = user_id)', tbl || '_insert_own', tbl);
    end if;
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=tbl and policyname=tbl || '_update_own') then
      execute format('create policy %I on public.%I for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)', tbl || '_update_own', tbl);
    end if;
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=tbl and policyname=tbl || '_delete_own') then
      execute format('create policy %I on public.%I for delete to authenticated using (auth.uid() = user_id)', tbl || '_delete_own', tbl);
    end if;
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Credits / billing ledger
-- -----------------------------------------------------------------------------
create table if not exists public.credits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance integer not null default 10000 check (balance >= 0),
  monthly_cap integer not null default 6500,
  updated_at timestamptz not null default now()
);

create table if not exists public.credit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  cost integer not null check (cost >= 0),
  created_at timestamptz not null default now()
);

create or replace function public.spend_credits(uid uuid, amount integer, action text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  next_balance integer;
begin
  if uid is null or uid <> auth.uid() then
    raise exception 'Not allowed';
  end if;
  if amount < 0 then
    raise exception 'Invalid amount';
  end if;

  insert into public.credits(user_id, balance)
  values (uid, 10000)
  on conflict (user_id) do nothing;

  update public.credits
  set balance = balance - amount,
      updated_at = now()
  where user_id = uid
    and balance >= amount
  returning balance into next_balance;

  if next_balance is null then
    raise exception 'Not enough credits';
  end if;

  insert into public.credit_logs(user_id, action, cost)
  values (uid, action, amount);

  return next_balance;
end;
$$;

alter table public.credits enable row level security;
alter table public.credit_logs enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='credits' and policyname='credits_select_own_or_admin') then
    create policy credits_select_own_or_admin on public.credits for select to authenticated
      using (auth.uid() = user_id or public.is_platform_admin(auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='credits' and policyname='credits_admin_write') then
    create policy credits_admin_write on public.credits for all to authenticated
      using (public.is_platform_admin(auth.uid()))
      with check (public.is_platform_admin(auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='credit_logs' and policyname='credit_logs_select_own_or_admin') then
    create policy credit_logs_select_own_or_admin on public.credit_logs for select to authenticated
      using (auth.uid() = user_id or public.is_platform_admin(auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='credit_logs' and policyname='credit_logs_insert_own') then
    create policy credit_logs_insert_own on public.credit_logs for insert to authenticated
      with check (auth.uid() = user_id);
  end if;
end $$;

grant execute on function public.spend_credits(uuid, integer, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Support, callouts, webhooks, notifications, settings
-- -----------------------------------------------------------------------------
create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject text not null default 'Support request',
  status text not null default 'open' check (status in ('open', 'pending', 'closed')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  body text not null,
  is_staff boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.callouts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('token', 'wallet')),
  target text not null,
  note text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.callout_analysis (
  id uuid primary key default gen_random_uuid(),
  callout_id uuid not null references public.callouts(id) on delete cascade,
  ai_summary text,
  score numeric,
  verdict text,
  created_at timestamptz not null default now(),
  unique (callout_id)
);

create table if not exists public.webhooks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  endpoint_url text not null,
  event_types text[] not null default '{}',
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  body text,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.platform_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  description text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.platform_settings(key, value, description)
values
  ('maintenance_mode', 'false', 'Temporarily disable app access'),
  ('signup_open', 'true', 'Allow new signups'),
  ('wallet_trading_enabled', 'false', 'Enable create/import/export/Phantom/Jupiter trading'),
  ('phantom_connect_enabled', 'false', 'Enable Phantom wallet connection'),
  ('jupiter_swaps_enabled', 'false', 'Enable Jupiter swaps'),
  ('ai_tools_enabled', 'true', 'Enable AI analysis surfaces'),
  ('voice_lobbies_enabled', 'true', 'Enable LiveKit lobbies'),
  ('spaces_enabled', 'true', 'Enable spaces'),
  ('communities_enabled', 'true', 'Enable communities'),
  ('callouts_enabled', 'true', 'Enable callouts'),
  ('discord_webhook_enabled', 'false', 'Enable outbound Discord mirrors'),
  ('notifications_enabled', 'true', 'Enable app notifications'),
  ('price_alerts_enabled', 'true', 'Enable price alerts'),
  ('token_sniper_enabled', 'true', 'Enable token sniper UI'),
  ('pumpfun_scan_enabled', 'true', 'Enable Pump.fun/PumpSwap token scans'),
  ('official_token_enabled', 'true', 'Enable official SOL Tools token dashboard'),
  ('default_credit_grant', '10000', 'Default monthly credits'),
  ('rollover_monthly_cap', '6500', 'Max monthly rollover cap'),
  ('admin_email', '"audifyx@gmail.com"', 'Primary admin email'),
  ('theme_preset', '"broken_glass_gold"', 'Default theme preset'),
  ('support_enabled', 'true', 'Enable support center'),
  ('webhooks_enabled', 'true', 'Enable user webhooks')
on conflict (key) do update
set value = excluded.value,
    description = excluded.description;

alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;
alter table public.callouts enable row level security;
alter table public.callout_analysis enable row level security;
alter table public.webhooks enable row level security;
alter table public.notifications enable row level security;
alter table public.platform_settings enable row level security;

do $$
declare
  tbl text;
begin
  foreach tbl in array array['support_tickets','callouts','webhooks','notifications'] loop
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=tbl and policyname=tbl || '_own_or_admin_select') then
      execute format('create policy %I on public.%I for select to authenticated using (auth.uid() = user_id or public.is_platform_admin(auth.uid()))', tbl || '_own_or_admin_select', tbl);
    end if;
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=tbl and policyname=tbl || '_own_insert') then
      execute format('create policy %I on public.%I for insert to authenticated with check (auth.uid() = user_id or public.is_platform_admin(auth.uid()))', tbl || '_own_insert', tbl);
    end if;
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=tbl and policyname=tbl || '_own_or_admin_update') then
      execute format('create policy %I on public.%I for update to authenticated using (auth.uid() = user_id or public.is_platform_admin(auth.uid())) with check (auth.uid() = user_id or public.is_platform_admin(auth.uid()))', tbl || '_own_or_admin_update', tbl);
    end if;
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=tbl and policyname=tbl || '_own_or_admin_delete') then
      execute format('create policy %I on public.%I for delete to authenticated using (auth.uid() = user_id or public.is_platform_admin(auth.uid()))', tbl || '_own_or_admin_delete', tbl);
    end if;
  end loop;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='support_messages' and policyname='support_messages_ticket_member_select') then
    create policy support_messages_ticket_member_select on public.support_messages for select to authenticated
      using (
        public.is_platform_admin(auth.uid()) or exists (
          select 1 from public.support_tickets st
          where st.id = ticket_id and st.user_id = auth.uid()
        )
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='support_messages' and policyname='support_messages_ticket_member_insert') then
    create policy support_messages_ticket_member_insert on public.support_messages for insert to authenticated
      with check (
        public.is_platform_admin(auth.uid()) or exists (
          select 1 from public.support_tickets st
          where st.id = ticket_id and st.user_id = auth.uid()
        )
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='callout_analysis' and policyname='callout_analysis_select_public') then
    create policy callout_analysis_select_public on public.callout_analysis for select using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='callout_analysis' and policyname='callout_analysis_admin_write') then
    create policy callout_analysis_admin_write on public.callout_analysis for all to authenticated
      using (public.is_platform_admin(auth.uid()))
      with check (public.is_platform_admin(auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='platform_settings' and policyname='platform_settings_select_all') then
    create policy platform_settings_select_all on public.platform_settings for select using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='platform_settings' and policyname='platform_settings_admin_write') then
    create policy platform_settings_admin_write on public.platform_settings for all to authenticated
      using (public.is_platform_admin(auth.uid()))
      with check (public.is_platform_admin(auth.uid()));
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Trading lobby aliases requested by platform prompt. Existing voice_lobbies remain canonical.
-- -----------------------------------------------------------------------------
create table if not exists public.trading_lobbies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  host_id uuid not null references auth.users(id) on delete cascade,
  livekit_room text not null unique,
  status text not null default 'live' check (status in ('live', 'ended')),
  created_at timestamptz not null default now()
);

create table if not exists public.lobby_members (
  id uuid primary key default gen_random_uuid(),
  lobby_id uuid not null references public.trading_lobbies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'listener',
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  unique (lobby_id, user_id)
);

create table if not exists public.lobby_chat (
  id uuid primary key default gen_random_uuid(),
  lobby_id uuid not null references public.trading_lobbies(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  message text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.lobby_watchlist (
  id uuid primary key default gen_random_uuid(),
  lobby_id uuid not null references public.trading_lobbies(id) on delete cascade,
  type text not null default 'token' check (type in ('token', 'wallet')),
  address text not null,
  label text,
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (lobby_id, address)
);

alter table public.trading_lobbies enable row level security;
alter table public.lobby_members enable row level security;
alter table public.lobby_chat enable row level security;
alter table public.lobby_watchlist enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='trading_lobbies' and policyname='trading_lobbies_select_live') then
    create policy trading_lobbies_select_live on public.trading_lobbies for select using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='trading_lobbies' and policyname='trading_lobbies_insert_host') then
    create policy trading_lobbies_insert_host on public.trading_lobbies for insert to authenticated with check (auth.uid() = host_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='trading_lobbies' and policyname='trading_lobbies_update_host_admin') then
    create policy trading_lobbies_update_host_admin on public.trading_lobbies for update to authenticated
      using (auth.uid() = host_id or public.is_platform_admin(auth.uid()))
      with check (auth.uid() = host_id or public.is_platform_admin(auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='lobby_members' and policyname='lobby_members_select_all') then
    create policy lobby_members_select_all on public.lobby_members for select using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='lobby_members' and policyname='lobby_members_insert_self') then
    create policy lobby_members_insert_self on public.lobby_members for insert to authenticated with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='lobby_chat' and policyname='lobby_chat_select_all') then
    create policy lobby_chat_select_all on public.lobby_chat for select using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='lobby_chat' and policyname='lobby_chat_insert_auth') then
    create policy lobby_chat_insert_auth on public.lobby_chat for insert to authenticated with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='lobby_watchlist' and policyname='lobby_watchlist_select_all') then
    create policy lobby_watchlist_select_all on public.lobby_watchlist for select using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='lobby_watchlist' and policyname='lobby_watchlist_insert_auth') then
    create policy lobby_watchlist_insert_auth on public.lobby_watchlist for insert to authenticated with check (auth.uid() = added_by or added_by is null);
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Module registry mirrors the mobile in-app source of truth.
-- -----------------------------------------------------------------------------
create table if not exists public.soltools_modules (
  id text primary key,
  name text not null,
  category text not null,
  surface text not null,
  status text not null check (status in ('live', 'beta', 'planned', 'gated')),
  credit_cost integer,
  gated_reason text,
  updated_at timestamptz not null default now()
);

insert into public.soltools_modules(id, name, category, surface, status, credit_cost, gated_reason)
values
  ('wallet-search','Wallet Search','wallet','Wallet Tracker','live',null,null),
  ('portfolio-overview','Portfolio Overview','wallet','Wallet Tracker','live',null,null),
  ('token-detail-popup','Token Detail Popup','token','Token Lookup','live',null,null),
  ('token-sniper','Token Sniper','token','Tools','beta',null,null),
  ('rug-detector','Rug Detector','advanced','Tools','live',2,null),
  ('holder-analysis','Holder Analysis','basic','Tools','beta',2,null),
  ('price-alerts','Price Alerts','premium','Tools','live',null,null),
  ('ai-chat','AI Chat','ai','AlphaChat','beta',1,null),
  ('ai-token-analysis','AI Token Analysis','ai','Tools','beta',2,null),
  ('communities','Communities','social','Communities','live',null,null),
  ('trading-lobbies','Trading Lobbies','voice','Lobbies','live',null,null),
  ('admin-dashboard','Admin Dashboard','admin','Admin','live',null,null),
  ('broken-glass-theme','Broken Glass Theme','theme','All','live',null,null),
  ('wallet-import-export','Create / Import / Export Wallet','wallet','Wallet','gated',null,'App Store launch safety gate'),
  ('phantom-connect','Phantom Connect','wallet','Wallet','gated',null,'App Store launch safety gate'),
  ('jupiter-trading','Jupiter Trading','wallet','Wallet','gated',null,'App Store launch safety gate')
on conflict (id) do update
set name = excluded.name,
    category = excluded.category,
    surface = excluded.surface,
    status = excluded.status,
    credit_cost = excluded.credit_cost,
    gated_reason = excluded.gated_reason,
    updated_at = now();

alter table public.soltools_modules enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='soltools_modules' and policyname='soltools_modules_select_all') then
    create policy soltools_modules_select_all on public.soltools_modules for select using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='soltools_modules' and policyname='soltools_modules_admin_write') then
    create policy soltools_modules_admin_write on public.soltools_modules for all to authenticated
      using (public.is_platform_admin(auth.uid()))
      with check (public.is_platform_admin(auth.uid()));
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Realtime readiness
-- -----------------------------------------------------------------------------
alter table if exists public.support_messages replica identity full;
alter table if exists public.support_tickets replica identity full;
alter table if exists public.community_posts replica identity full;
alter table if exists public.community_post_replies replica identity full;
alter table if exists public.callouts replica identity full;
alter table if exists public.lobby_chat replica identity full;
alter table if exists public.tracked_wallets replica identity full;

do $$
declare
  rel regclass;
begin
  foreach rel in array array[
    'public.support_messages'::regclass,
    'public.support_tickets'::regclass,
    'public.callouts'::regclass,
    'public.lobby_chat'::regclass,
    'public.tracked_wallets'::regclass
  ] loop
    begin
      execute format('alter publication supabase_realtime add table %s', rel);
    exception
      when duplicate_object then null;
      when undefined_object then null;
    end;
  end loop;
end $$;
