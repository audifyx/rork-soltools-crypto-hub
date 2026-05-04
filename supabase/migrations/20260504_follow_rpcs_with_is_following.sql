-- RPCs that return `is_following` so the Follow button reflects state instantly.
-- Idempotent: safe to re-run.

-- Helper: return true when the current auth user follows target.
create or replace function public._is_following_me(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.uid() is null or target is null then false
    else exists (
      select 1 from public.follows f
      where f.follower_id = auth.uid() and f.following_id = target
    )
  end;
$$;

grant execute on function public._is_following_me(uuid) to anon, authenticated;

-- 1. get_profile_by_handle ----------------------------------------------------
create or replace function public.get_profile_by_handle(handle text)
returns table (
  id uuid,
  user_id uuid,
  username text,
  display_name text,
  bio text,
  avatar_url text,
  banner_url text,
  avatar_color text,
  banner_from text,
  banner_to text,
  wallet_address text,
  twitter_handle text,
  website text,
  location text,
  badge text,
  verified boolean,
  custom_badges jsonb,
  followers_count integer,
  following_count integer,
  trades_count integer,
  win_rate numeric,
  pnl_pct numeric,
  xp integer,
  created_at timestamptz,
  is_following boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.id,
    p.user_id,
    p.username,
    p.display_name,
    p.bio,
    p.avatar_url,
    p.banner_url,
    p.avatar_color,
    p.banner_from,
    p.banner_to,
    p.wallet_address,
    p.twitter_handle,
    p.website,
    p.location,
    p.badge,
    coalesce(p.verified, false) as verified,
    coalesce(p.custom_badges, '[]'::jsonb) as custom_badges,
    coalesce(p.followers_count, 0) as followers_count,
    coalesce(p.following_count, 0) as following_count,
    coalesce(p.trades_count, 0) as trades_count,
    coalesce(p.win_rate, 0)::numeric as win_rate,
    coalesce(p.pnl_pct, 0)::numeric as pnl_pct,
    coalesce(p.xp, 0) as xp,
    p.created_at,
    public._is_following_me(p.user_id) as is_following
  from public.profiles p
  where lower(p.username) = lower(coalesce(handle, ''))
  limit 1;
$$;

grant execute on function public.get_profile_by_handle(text) to anon, authenticated;

-- 2. list_users ---------------------------------------------------------------
create or replace function public.list_users(q text default '', online_only boolean default false, max_rows integer default 200)
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  banner_url text,
  bio text,
  verified boolean,
  custom_badges jsonb,
  followers_count integer,
  is_online boolean,
  last_seen timestamptz,
  created_at timestamptz,
  is_following boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select
      p.user_id,
      p.username,
      p.display_name,
      p.avatar_url,
      p.banner_url,
      p.bio,
      coalesce(p.verified, false) as verified,
      coalesce(p.custom_badges, '[]'::jsonb) as custom_badges,
      coalesce(p.followers_count, 0) as followers_count,
      coalesce(p.last_seen, p.updated_at, p.created_at) as last_seen_eff,
      p.created_at,
      coalesce(p.status, 'offline') as status
    from public.profiles p
    where p.user_id is not null
      and (
        coalesce(q, '') = ''
        or p.username ilike '%' || q || '%'
        or p.display_name ilike '%' || q || '%'
      )
  )
  select
    b.user_id,
    b.username,
    b.display_name,
    b.avatar_url,
    b.banner_url,
    b.bio,
    b.verified,
    b.custom_badges,
    b.followers_count,
    (b.status = 'online' and b.last_seen_eff > now() - interval '3 minutes') as is_online,
    b.last_seen_eff as last_seen,
    b.created_at,
    public._is_following_me(b.user_id) as is_following
  from base b
  where (
    not coalesce(online_only, false)
    or (b.status = 'online' and b.last_seen_eff > now() - interval '3 minutes')
  )
  order by b.followers_count desc, b.created_at desc
  limit greatest(coalesce(max_rows, 200), 1);
$$;

grant execute on function public.list_users(text, boolean, integer) to anon, authenticated;

-- 3. users_overview -----------------------------------------------------------
create or replace function public.users_overview()
returns table (
  total_users bigint,
  online_users bigint,
  new_today bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    (select count(*) from public.profiles)::bigint as total_users,
    (select count(*) from public.profiles p
       where coalesce(p.status, 'offline') = 'online'
         and coalesce(p.last_seen, p.updated_at, p.created_at) > now() - interval '3 minutes')::bigint as online_users,
    (select count(*) from public.profiles p
       where p.created_at >= date_trunc('day', now()))::bigint as new_today;
$$;

grant execute on function public.users_overview() to anon, authenticated;

-- 4. search_profiles ----------------------------------------------------------
create or replace function public.search_profiles(q text default '', max_rows integer default 30)
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  verified boolean,
  custom_badges jsonb,
  followers_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    p.user_id,
    p.username,
    p.display_name,
    p.avatar_url,
    coalesce(p.verified, false) as verified,
    coalesce(p.custom_badges, '[]'::jsonb) as custom_badges,
    coalesce(p.followers_count, 0) as followers_count
  from public.profiles p
  where (
    coalesce(q, '') = ''
    or p.username ilike '%' || q || '%'
    or p.display_name ilike '%' || q || '%'
  )
  order by p.followers_count desc nulls last, p.created_at desc
  limit greatest(coalesce(max_rows, 30), 1);
$$;

grant execute on function public.search_profiles(text, integer) to anon, authenticated;
