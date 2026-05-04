-- Make follower / following lists resilient to legacy profiles whose
-- profiles.user_id doesn't match auth.users.id. Also backfill counters so
-- the strip on profile pages reflects reality after past inserts.
--
-- Idempotent: safe to re-run.

create or replace function public.list_followers(target_user_id uuid)
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  verified boolean,
  custom_badges jsonb,
  followers_count integer,
  bio text,
  is_online boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(p.user_id, f.follower_id) as user_id,
    p.username,
    p.display_name,
    p.avatar_url,
    coalesce(p.verified, false) as verified,
    coalesce(p.custom_badges, '[]'::jsonb) as custom_badges,
    coalesce(p.followers_count, 0) as followers_count,
    p.bio,
    coalesce(p.is_online, false) as is_online
  from public.follows f
  left join public.profiles p
    on p.user_id = f.follower_id or p.id = f.follower_id
  where f.following_id = target_user_id
  order by f.created_at desc
  limit 500;
$$;

create or replace function public.list_following(target_user_id uuid)
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  verified boolean,
  custom_badges jsonb,
  followers_count integer,
  bio text,
  is_online boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(p.user_id, f.following_id) as user_id,
    p.username,
    p.display_name,
    p.avatar_url,
    coalesce(p.verified, false) as verified,
    coalesce(p.custom_badges, '[]'::jsonb) as custom_badges,
    coalesce(p.followers_count, 0) as followers_count,
    p.bio,
    coalesce(p.is_online, false) as is_online
  from public.follows f
  left join public.profiles p
    on p.user_id = f.following_id or p.id = f.following_id
  where f.follower_id = target_user_id
  order by f.created_at desc
  limit 500;
$$;

grant execute on function public.list_followers(uuid) to anon, authenticated;
grant execute on function public.list_following(uuid) to anon, authenticated;

-- Re-sync counters in case the trigger missed legacy follow rows.
update public.profiles p set
  followers_count = coalesce((select count(*) from public.follows f where f.following_id = p.user_id), 0),
  following_count = coalesce((select count(*) from public.follows f where f.follower_id = p.user_id), 0);

-- ---------------------------------------------------------------------------
-- Messageable users: a SECURITY DEFINER search RPC that bypasses profile RLS
-- so the New Message picker can always show every trader on the platform,
-- not just the ones the caller has already DM'd with.
-- ---------------------------------------------------------------------------
create or replace function public.list_messageable_users(
  q text default '',
  max_rows integer default 80
)
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  avatar_color text,
  verified boolean,
  bio text,
  is_online boolean,
  followers_count integer,
  is_following boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (select auth.uid() as id)
  select
    p.user_id,
    p.username,
    p.display_name,
    p.avatar_url,
    p.avatar_color,
    coalesce(p.verified, false) as verified,
    p.bio,
    coalesce(p.is_online, false) as is_online,
    coalesce(p.followers_count, 0) as followers_count,
    public._is_following_me(p.user_id) as is_following
  from public.profiles p, me
  where p.user_id is not null
    and (me.id is null or p.user_id <> me.id)
    and (
      coalesce(q, '') = ''
      or p.username ilike '%' || q || '%'
      or p.display_name ilike '%' || q || '%'
    )
  order by
    (case when public._is_following_me(p.user_id) then 0 else 1 end),
    coalesce(p.followers_count, 0) desc,
    coalesce(p.is_online, false) desc,
    p.created_at desc
  limit greatest(coalesce(max_rows, 80), 1);
$$;

grant execute on function public.list_messageable_users(text, integer) to anon, authenticated;
