-- 010_core_profiles_accounts.sql
-- Idempotent patch for auth profiles, settings, follows, and presence.

create extension if not exists "pgcrypto";
create extension if not exists "citext";
create extension if not exists "pg_trgm";

create table if not exists public.admin_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin',
  granted_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create or replace function public.is_admin(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admin_roles where user_id = uid)
$$;

grant execute on function public.is_admin(uuid) to authenticated, anon;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists user_id uuid,
  add column if not exists username citext,
  add column if not exists display_name text,
  add column if not exists bio text,
  add column if not exists avatar_url text,
  add column if not exists banner_url text,
  add column if not exists avatar_color text,
  add column if not exists banner_from text,
  add column if not exists banner_to text,
  add column if not exists wallet_address text,
  add column if not exists twitter_handle text,
  add column if not exists website text,
  add column if not exists location text,
  add column if not exists badge text default 'Recruit',
  add column if not exists verified boolean not null default false,
  add column if not exists custom_badges jsonb not null default '[]'::jsonb,
  add column if not exists is_banned boolean not null default false,
  add column if not exists followers_count integer not null default 0,
  add column if not exists following_count integer not null default 0,
  add column if not exists trades_count integer not null default 0,
  add column if not exists win_rate numeric(6,2) not null default 0,
  add column if not exists pnl_pct numeric(10,2) not null default 0,
  add column if not exists volume_usd numeric(18,2) not null default 0,
  add column if not exists xp integer not null default 0,
  add column if not exists last_seen_at timestamptz,
  add column if not exists status text default 'offline';

update public.profiles set user_id = id where user_id is null;
create index if not exists profiles_username_lookup_idx on public.profiles (lower(username::text));
create index if not exists profiles_followers_idx on public.profiles (followers_count desc);

create table if not exists public.followers (
  follower_id uuid not null references auth.users(id) on delete cascade,
  followee_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index if not exists followers_followee_idx on public.followers (followee_id, created_at desc);

create table if not exists public.user_settings (user_id uuid primary key references auth.users(id) on delete cascade);
alter table public.user_settings
  add column if not exists push boolean not null default true,
  add column if not exists haptics boolean not null default true,
  add column if not exists voice_lobbies boolean not null default false,
  add column if not exists whale_alerts boolean not null default true,
  add column if not exists ai_narration boolean not null default false,
  add column if not exists private_profile boolean not null default false,
  add column if not exists hide_balance boolean not null default false,
  add column if not exists two_factor boolean not null default false,
  add column if not exists biometric boolean not null default false,
  add column if not exists currency text not null default 'USD',
  add column if not exists theme text not null default 'dark',
  add column if not exists language text not null default 'en',
  add column if not exists slippage numeric(6,3) not null default 1.0,
  add column if not exists priority_fee numeric(12,8) not null default 0.0005,
  add column if not exists mev_protection boolean not null default true,
  add column if not exists data jsonb not null default '{}'::jsonb,
  add column if not exists updated_at timestamptz not null default now();

create table if not exists public.user_presence (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'offline',
  last_seen timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists user_presence_status_idx on public.user_presence (status, last_seen desc);

do $$ begin
  alter table public.profiles enable row level security;
  alter table public.followers enable row level security;
  alter table public.user_settings enable row level security;
  alter table public.user_presence enable row level security;

  drop policy if exists profiles_read on public.profiles;
  create policy profiles_read on public.profiles for select using (true);
  drop policy if exists profiles_insert_self on public.profiles;
  create policy profiles_insert_self on public.profiles for insert with check (auth.uid() = id);
  drop policy if exists profiles_update_self on public.profiles;
  create policy profiles_update_self on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

  drop policy if exists followers_read on public.followers;
  create policy followers_read on public.followers for select using (true);
  drop policy if exists followers_write_self on public.followers;
  create policy followers_write_self on public.followers for insert with check (auth.uid() = follower_id);
  drop policy if exists followers_delete_self on public.followers;
  create policy followers_delete_self on public.followers for delete using (auth.uid() = follower_id);

  drop policy if exists user_settings_owner_all on public.user_settings;
  create policy user_settings_owner_all on public.user_settings for all
    using (auth.uid() = user_id) with check (auth.uid() = user_id);

  drop policy if exists user_presence_read on public.user_presence;
  create policy user_presence_read on public.user_presence for select using (true);
  drop policy if exists user_presence_self_all on public.user_presence;
  create policy user_presence_self_all on public.user_presence for all
    using (auth.uid() = user_id) with check (auth.uid() = user_id);
end $$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  base text;
  candidate text;
  i int := 0;
begin
  base := lower(coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1), 'user'));
  base := regexp_replace(base, '[^a-z0-9_]+', '', 'g');
  if length(base) < 3 then base := base || substr(replace(new.id::text, '-', ''), 1, 6); end if;
  candidate := base;
  while exists (select 1 from public.profiles where lower(username::text) = candidate and id <> new.id) loop
    i := i + 1;
    candidate := base || i::text;
    exit when i > 50;
  end loop;

  insert into public.profiles (id, user_id, username, display_name)
  values (new.id, new.id, candidate, coalesce(new.raw_user_meta_data->>'display_name', candidate))
  on conflict (id) do update set
    user_id = coalesce(public.profiles.user_id, excluded.user_id),
    username = coalesce(public.profiles.username, excluded.username),
    display_name = coalesce(public.profiles.display_name, excluded.display_name),
    updated_at = now();

  insert into public.user_settings (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

select '010_core_profiles_accounts applied' as status;
