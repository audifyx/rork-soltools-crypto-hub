-- admin-dashboard.sql
-- Owner-locked SolTools admin dashboard schema, RLS, realtime, and compatibility aliases.
-- Safe to run more than once without dropping existing platform/API tables.

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Admin roles: requested shape + compatibility with older one-row-per-user table.
-- -----------------------------------------------------------------------------
create table if not exists public.admin_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null default '',
  role text not null default 'user',
  permissions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, role)
);

alter table public.admin_roles
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists email text default '',
  add column if not exists permissions jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

update public.admin_roles ar
set id = coalesce(ar.id, gen_random_uuid()),
    email = coalesce(nullif(ar.email, ''), u.email, ''),
    updated_at = now()
from auth.users u
where ar.user_id = u.id;

alter table public.admin_roles
  alter column id set not null,
  alter column email set not null;

create unique index if not exists admin_roles_id_unique_idx on public.admin_roles(id);
create unique index if not exists admin_roles_user_id_unique_idx on public.admin_roles(user_id);
create unique index if not exists admin_roles_user_role_unique_idx on public.admin_roles(user_id, role);

-- Replace older role checks so owner is accepted while keeping existing roles alive.
do $$
declare
  c record;
begin
  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.admin_roles'::regclass
      and contype = 'c'
  loop
    execute format('alter table public.admin_roles drop constraint if exists %I', c.conname);
  end loop;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.admin_roles'::regclass
      and conname = 'admin_roles_role_check'
  ) then
    alter table public.admin_roles
      add constraint admin_roles_role_check
      check (role in ('owner', 'superadmin', 'admin', 'moderator', 'support', 'user'));
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Requested dashboard tables.
-- -----------------------------------------------------------------------------
create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  target_type text,
  target_id uuid,
  old_values jsonb,
  new_values jsonb,
  ip_address text,
  created_at timestamptz not null default now()
);

create table if not exists public.platform_settings (
  id uuid default gen_random_uuid(),
  key text not null unique,
  value jsonb not null default '{}'::jsonb,
  category text not null default 'general',
  description text,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

alter table public.platform_settings
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists category text not null default 'general',
  add column if not exists description text,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by uuid references auth.users(id) on delete set null;

update public.platform_settings set id = coalesce(id, gen_random_uuid());
create unique index if not exists platform_settings_id_unique_idx on public.platform_settings(id);
create unique index if not exists platform_settings_key_unique_idx on public.platform_settings(key);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null default 'system',
  title text not null,
  message text not null default '',
  body text,
  data jsonb not null default '{}'::jsonb,
  is_read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.notifications
  add column if not exists type text not null default 'system',
  add column if not exists message text not null default '',
  add column if not exists body text,
  add column if not exists data jsonb not null default '{}'::jsonb,
  add column if not exists is_read boolean not null default false,
  add column if not exists read_at timestamptz;

update public.notifications
set message = coalesce(nullif(message, ''), body, ''),
    body = coalesce(body, message),
    is_read = coalesce(is_read, read_at is not null);

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  username text,
  subject text not null,
  body text,
  status text not null default 'open',
  priority text not null default 'normal',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.support_tickets
  add column if not exists username text,
  add column if not exists body text,
  add column if not exists priority text not null default 'normal',
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  content text not null default '',
  body text,
  is_admin boolean not null default false,
  is_staff boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.support_messages
  add column if not exists content text not null default '',
  add column if not exists body text,
  add column if not exists is_admin boolean not null default false,
  add column if not exists is_staff boolean not null default false;

update public.support_messages
set content = coalesce(nullif(content, ''), body, ''),
    body = coalesce(body, content),
    is_admin = coalesce(is_admin, is_staff),
    is_staff = coalesce(is_staff, is_admin);

-- Minimal compatibility tables/columns used by dashboard tabs.
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users(id) on delete cascade,
  username text unique,
  display_name text,
  avatar_url text,
  bio text,
  sol_wallet text,
  wallet_address text,
  is_public boolean not null default true,
  is_banned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists user_id uuid references auth.users(id) on delete cascade,
  add column if not exists username text,
  add column if not exists display_name text,
  add column if not exists avatar_url text,
  add column if not exists bio text,
  add column if not exists sol_wallet text,
  add column if not exists wallet_address text,
  add column if not exists is_public boolean not null default true,
  add column if not exists is_banned boolean not null default false,
  add column if not exists followers_count integer not null default 0,
  add column if not exists trades_count integer not null default 0,
  add column if not exists win_rate numeric not null default 0,
  add column if not exists pnl_pct numeric not null default 0,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists profiles_user_id_unique_idx on public.profiles(user_id) where user_id is not null;

create table if not exists public.pump_v5_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  token_name text not null default 'Untitled Token',
  symbol text not null default 'TKN',
  contract_address text not null default '',
  status text not null default 'pending',
  tier text not null default 'free',
  is_featured boolean not null default false,
  is_verified boolean not null default false,
  is_hot boolean not null default false,
  admin_notes text,
  market_cap numeric,
  liquidity_usd numeric,
  volume_24h_usd numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.pump_v5_submissions
  add column if not exists user_id uuid references auth.users(id) on delete set null,
  add column if not exists token_name text not null default 'Untitled Token',
  add column if not exists symbol text not null default 'TKN',
  add column if not exists contract_address text not null default '',
  add column if not exists status text not null default 'pending',
  add column if not exists tier text not null default 'free',
  add column if not exists is_featured boolean not null default false,
  add column if not exists is_verified boolean not null default false,
  add column if not exists is_hot boolean not null default false,
  add column if not exists admin_notes text,
  add column if not exists market_cap numeric,
  add column if not exists liquidity_usd numeric,
  add column if not exists volume_24h_usd numeric,
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.credits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance integer not null default 10000,
  monthly_cap integer not null default 6500,
  updated_at timestamptz not null default now()
);

create table if not exists public.credit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  cost integer not null default 0,
  created_at timestamptz not null default now()
);

create or replace view public.user_credits as
select
  c.user_id,
  greatest(0, 10000 - c.balance) as used_credits,
  c.balance as remaining_credits,
  10000 as total_credits,
  c.monthly_cap,
  c.updated_at
from public.credits c;

create table if not exists public.communities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.communities
  add column if not exists name text,
  add column if not exists owner_id uuid references auth.users(id) on delete set null,
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.trading_lobbies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  host_id uuid references auth.users(id) on delete set null,
  livekit_room text,
  status text not null default 'live',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.trading_lobbies
  add column if not exists host_id uuid references auth.users(id) on delete set null,
  add column if not exists livekit_room text,
  add column if not exists status text not null default 'live',
  add column if not exists is_active boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

update public.trading_lobbies set is_active = (status = 'live') where status is not null;

create table if not exists public.lobby_members (
  id uuid primary key default gen_random_uuid(),
  lobby_id uuid not null references public.trading_lobbies(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role text not null default 'listener',
  joined_at timestamptz not null default now(),
  left_at timestamptz
);

-- -----------------------------------------------------------------------------
-- Helper functions.
-- -----------------------------------------------------------------------------
create or replace function public.is_owner_email(check_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select lower(coalesce(check_email, '')) = 'audifyx@gmail.com';
$$;

create or replace function public.is_admin_owner(check_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.admin_roles ar
    where ar.user_id = check_user_id
      and ar.role in ('owner', 'superadmin')
  ) or exists (
    select 1
    from auth.users u
    where u.id = check_user_id
      and lower(u.email) = 'audifyx@gmail.com'
  );
$$;

create or replace function public.is_dashboard_admin(check_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.is_admin_owner(check_user_id)
    or exists (
      select 1
      from public.admin_roles ar
      where ar.user_id = check_user_id
        and ar.role in ('admin', 'owner', 'superadmin')
    );
$$;

create or replace function public.ensure_owner_role(check_user_id uuid, check_email text)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.is_owner_email(check_email) then
    return false;
  end if;

  if exists (select 1 from public.admin_roles where user_id = check_user_id and role = 'owner') then
    update public.admin_roles
    set email = check_email,
        permissions = '{"all": true}'::jsonb,
        updated_at = now()
    where user_id = check_user_id and role = 'owner';
  elsif exists (select 1 from public.admin_roles where user_id = check_user_id) then
    update public.admin_roles
    set email = check_email,
        role = 'owner',
        permissions = '{"all": true}'::jsonb,
        updated_at = now()
    where user_id = check_user_id;
  else
    insert into public.admin_roles (user_id, email, role, permissions)
    values (check_user_id, check_email, 'owner', '{"all": true}'::jsonb);
  end if;

  return true;
end;
$$;

create or replace function public.handle_owner_role()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if public.is_owner_email(new.email) then
    perform public.ensure_owner_role(new.id, new.email);
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_owner on auth.users;
create trigger on_auth_user_created_owner
after insert on auth.users
for each row execute function public.handle_owner_role();

create or replace function public.protect_admin_username()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.username is not null
    and lower(trim(new.username)) = 'administrator'
    and not public.is_admin_owner(coalesce(new.user_id, new.id)) then
    raise exception 'Reserved username';
  end if;
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists protect_admin_username on public.profiles;
create trigger protect_admin_username
before insert or update of username on public.profiles
for each row execute function public.protect_admin_username();

grant execute on function public.is_owner_email(text) to authenticated;
grant execute on function public.is_admin_owner(uuid) to authenticated;
grant execute on function public.is_dashboard_admin(uuid) to authenticated;
grant execute on function public.ensure_owner_role(uuid, text) to authenticated;

-- -----------------------------------------------------------------------------
-- RLS policies.
-- -----------------------------------------------------------------------------
alter table public.admin_roles enable row level security;
alter table public.admin_audit_log enable row level security;
alter table public.platform_settings enable row level security;
alter table public.notifications enable row level security;
alter table public.support_tickets enable row level security;
alter table public.support_messages enable row level security;
alter table public.profiles enable row level security;
alter table public.pump_v5_submissions enable row level security;
alter table public.credits enable row level security;
alter table public.credit_logs enable row level security;
alter table public.communities enable row level security;
alter table public.trading_lobbies enable row level security;
alter table public.lobby_members enable row level security;

drop policy if exists "Users can read own admin role" on public.admin_roles;
drop policy if exists "Owners can manage admin roles" on public.admin_roles;
drop policy if exists "Owner email self register" on public.admin_roles;
create policy "Users can read own admin role" on public.admin_roles
  for select to authenticated using (auth.uid() = user_id or public.is_admin_owner(auth.uid()));
create policy "Owners can manage admin roles" on public.admin_roles
  for all to authenticated using (public.is_admin_owner(auth.uid())) with check (public.is_admin_owner(auth.uid()));
create policy "Owner email self register" on public.admin_roles
  for insert to authenticated
  with check (auth.uid() = user_id and lower(auth.jwt()->>'email') = 'audifyx@gmail.com');

drop policy if exists "Only admins can view audit logs" on public.admin_audit_log;
drop policy if exists "Admins can insert audit logs" on public.admin_audit_log;
create policy "Only admins can view audit logs" on public.admin_audit_log
  for select to authenticated using (public.is_dashboard_admin(auth.uid()));
create policy "Admins can insert audit logs" on public.admin_audit_log
  for insert to authenticated with check (public.is_dashboard_admin(auth.uid()));

drop policy if exists "Owners can manage platform settings" on public.platform_settings;
create policy "Owners can manage platform settings" on public.platform_settings
  for all to authenticated using (public.is_admin_owner(auth.uid())) with check (public.is_admin_owner(auth.uid()));

drop policy if exists "Users view own notifications" on public.notifications;
drop policy if exists "Users insert own notifications" on public.notifications;
drop policy if exists "Users update own notifications" on public.notifications;
drop policy if exists "Users delete own notifications" on public.notifications;
drop policy if exists "Admins can broadcast notifications" on public.notifications;
create policy "Users view own notifications" on public.notifications
  for select to authenticated using (auth.uid() = user_id or public.is_dashboard_admin(auth.uid()));
create policy "Users insert own notifications" on public.notifications
  for insert to authenticated with check (auth.uid() = user_id);
create policy "Users update own notifications" on public.notifications
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users delete own notifications" on public.notifications
  for delete to authenticated using (auth.uid() = user_id);
create policy "Admins can broadcast notifications" on public.notifications
  for insert to authenticated with check (public.is_dashboard_admin(auth.uid()));

drop policy if exists "Users can create tickets" on public.support_tickets;
drop policy if exists "Users view own or admins all" on public.support_tickets;
drop policy if exists "Admins can update tickets" on public.support_tickets;
create policy "Users can create tickets" on public.support_tickets
  for insert to authenticated with check (user_id = auth.uid());
create policy "Users view own or admins all" on public.support_tickets
  for select to authenticated using (user_id = auth.uid() or public.is_dashboard_admin(auth.uid()));
create policy "Admins can update tickets" on public.support_tickets
  for update to authenticated using (public.is_dashboard_admin(auth.uid())) with check (public.is_dashboard_admin(auth.uid()));

drop policy if exists "Authenticated can send" on public.support_messages;
drop policy if exists "Ticket participants can read" on public.support_messages;
create policy "Authenticated can send" on public.support_messages
  for insert to authenticated with check (user_id = auth.uid());
create policy "Ticket participants can read" on public.support_messages
  for select to authenticated using (
    exists (
      select 1 from public.support_tickets st
      where st.id = support_messages.ticket_id
        and (st.user_id = auth.uid() or public.is_dashboard_admin(auth.uid()))
    )
  );

-- Compatibility policies for dashboard-managed tables.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='profiles_admin_dashboard_select') then
    create policy profiles_admin_dashboard_select on public.profiles for select using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='profiles_admin_dashboard_update') then
    create policy profiles_admin_dashboard_update on public.profiles for update to authenticated
      using (auth.uid() = user_id or auth.uid() = id or public.is_dashboard_admin(auth.uid()))
      with check (auth.uid() = user_id or auth.uid() = id or public.is_dashboard_admin(auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='pump_v5_submissions' and policyname='pump_v5_submissions_admin_dashboard_all') then
    create policy pump_v5_submissions_admin_dashboard_all on public.pump_v5_submissions for all to authenticated
      using (public.is_dashboard_admin(auth.uid()) or auth.uid() = user_id)
      with check (public.is_dashboard_admin(auth.uid()) or auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='credits' and policyname='credits_admin_dashboard_all') then
    create policy credits_admin_dashboard_all on public.credits for all to authenticated
      using (auth.uid() = user_id or public.is_dashboard_admin(auth.uid()))
      with check (auth.uid() = user_id or public.is_dashboard_admin(auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='credit_logs' and policyname='credit_logs_admin_dashboard_select') then
    create policy credit_logs_admin_dashboard_select on public.credit_logs for select to authenticated
      using (auth.uid() = user_id or public.is_dashboard_admin(auth.uid()));
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='communities' and policyname='communities_admin_dashboard_all') then
    create policy communities_admin_dashboard_all on public.communities for all to authenticated
      using (public.is_dashboard_admin(auth.uid()) or auth.uid() = owner_id)
      with check (public.is_dashboard_admin(auth.uid()) or auth.uid() = owner_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='trading_lobbies' and policyname='trading_lobbies_admin_dashboard_all') then
    create policy trading_lobbies_admin_dashboard_all on public.trading_lobbies for all to authenticated
      using (public.is_dashboard_admin(auth.uid()) or auth.uid() = host_id)
      with check (public.is_dashboard_admin(auth.uid()) or auth.uid() = host_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='lobby_members' and policyname='lobby_members_admin_dashboard_select') then
    create policy lobby_members_admin_dashboard_select on public.lobby_members for select using (true);
  end if;
end $$;

-- -----------------------------------------------------------------------------
-- Realtime publication.
-- -----------------------------------------------------------------------------
do $$
declare
  tbl regclass;
begin
  foreach tbl in array array[
    'public.support_messages'::regclass,
    'public.support_tickets'::regclass,
    'public.notifications'::regclass,
    'public.admin_audit_log'::regclass
  ] loop
    begin
      execute format('alter publication supabase_realtime add table %s', tbl);
    exception
      when duplicate_object then null;
      when undefined_object then null;
      when insufficient_privilege then null;
    end;
  end loop;
end $$;

alter table public.support_messages replica identity full;
alter table public.support_tickets replica identity full;
alter table public.notifications replica identity full;
alter table public.admin_audit_log replica identity full;

-- -----------------------------------------------------------------------------
-- Seed default settings.
-- -----------------------------------------------------------------------------
insert into public.platform_settings (key, value, category, description) values
  ('submissions_open',          'true'::jsonb,   'submissions', 'Allow new token submissions'),
  ('auto_approve_submissions',  'false'::jsonb,  'submissions', 'Auto-approve clean submissions'),
  ('require_email_verify',      'true'::jsonb,   'users',       'New users must verify email'),
  ('chat_enabled',              'true'::jsonb,   'chat',        'Global chat on/off'),
  ('chat_slow_mode_seconds',    '0'::jsonb,      'chat',        'Slow-mode delay'),
  ('rpc_rate_limit_per_min',    '60'::jsonb,     'api',         'Per-user RPC limit'),
  ('show_leaderboard',          'true'::jsonb,   'display',     'Display leaderboard publicly'),
  ('maintenance_mode',          'false'::jsonb,  'moderation',  'Lock platform to admins only')
on conflict (key) do nothing;
