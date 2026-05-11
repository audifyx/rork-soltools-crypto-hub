-- Fix username identity across auth-created profiles and follow lists.
-- Some older rows stored email-like values in username/display_name or only had id populated.

update public.profiles
set username = lower(substr(regexp_replace(split_part(coalesce(username, display_name, 'user_' || left(coalesce(user_id::text, id::text), 8)), '@', 1), '[^a-zA-Z0-9_]+', '_', 'g'), 1, 24))
where username is null or username = '' or username like '%@%';

update public.profiles
set display_name = username
where display_name is null or display_name = '' or display_name like '%@%';

create or replace function public.profile_public_name(p public.profiles)
returns text
language sql
stable
as $$
  select coalesce(nullif(p.username, ''), 'user_' || left(coalesce(p.user_id::text, p.id::text), 8));
$$;

create or replace function public.list_followers(target_user_id uuid)
returns table(user_id uuid, username text, display_name text, avatar_url text, verified boolean, custom_badges jsonb, followers_count integer)
language sql
security definer
set search_path = public
as $$
  select
    coalesce(p.user_id, p.id),
    public.profile_public_name(p),
    coalesce(nullif(p.display_name, ''), public.profile_public_name(p)),
    p.avatar_url,
    coalesce(p.verified, false),
    coalesce(p.custom_badges, '[]'::jsonb),
    coalesce(p.followers_count, 0)
  from public.followers f
  join public.profiles p on p.user_id = f.follower_id or p.id = f.follower_id
  where f.followee_id = target_user_id
     or f.followee_id in (select coalesce(pr.user_id, pr.id) from public.profiles pr where pr.user_id = target_user_id or pr.id = target_user_id)
  order by f.created_at desc;
$$;

create or replace function public.list_following(target_user_id uuid)
returns table(user_id uuid, username text, display_name text, avatar_url text, verified boolean, custom_badges jsonb, followers_count integer)
language sql
security definer
set search_path = public
as $$
  select
    coalesce(p.user_id, p.id),
    public.profile_public_name(p),
    coalesce(nullif(p.display_name, ''), public.profile_public_name(p)),
    p.avatar_url,
    coalesce(p.verified, false),
    coalesce(p.custom_badges, '[]'::jsonb),
    coalesce(p.followers_count, 0)
  from public.followers f
  join public.profiles p on p.user_id = f.followee_id or p.id = f.followee_id
  where f.follower_id = target_user_id
     or f.follower_id in (select coalesce(pr.user_id, pr.id) from public.profiles pr where pr.user_id = target_user_id or pr.id = target_user_id)
  order by f.created_at desc;
$$;
