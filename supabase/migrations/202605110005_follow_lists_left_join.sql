-- Follow lists must surface every follow row, even when the target/follower has no
-- matching profile entry. Use LEFT JOIN + synthesized usernames, then align the
-- cached follower/following counters with the distinct rows the lists return.

create or replace function public.list_followers(target_user_id uuid)
returns table(
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  verified boolean,
  custom_badges jsonb,
  followers_count integer
)
language sql
security definer
set search_path = public
as $$
  with target_ids as (
    select id from public.follow_identity_ids(target_user_id)
  ),
  follow_rows as (
    select distinct f.follower_id as link_id, max(f.created_at) as created_at
    from public.followers f
    where f.followee_id in (select id from target_ids)
    group by f.follower_id
  ),
  expanded as (
    select
      r.link_id,
      r.created_at,
      coalesce(p.user_id, p.id, r.link_id) as resolved_id,
      p.username,
      p.display_name,
      p.avatar_url,
      p.verified,
      p.custom_badges,
      p.followers_count
    from follow_rows r
    left join public.profiles p
      on p.user_id = r.link_id or p.id = r.link_id
  )
  select distinct on (resolved_id)
    resolved_id as user_id,
    coalesce(nullif(username, ''), 'user_' || left(resolved_id::text, 8)) as username,
    coalesce(nullif(display_name, ''), nullif(username, ''), 'Trader') as display_name,
    avatar_url,
    coalesce(verified, false) as verified,
    coalesce(custom_badges, '[]'::jsonb) as custom_badges,
    coalesce(followers_count, 0) as followers_count
  from expanded
  order by resolved_id, created_at desc;
$$;

create or replace function public.list_following(target_user_id uuid)
returns table(
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  verified boolean,
  custom_badges jsonb,
  followers_count integer
)
language sql
security definer
set search_path = public
as $$
  with target_ids as (
    select id from public.follow_identity_ids(target_user_id)
  ),
  follow_rows as (
    select distinct f.followee_id as link_id, max(f.created_at) as created_at
    from public.followers f
    where f.follower_id in (select id from target_ids)
    group by f.followee_id
  ),
  expanded as (
    select
      r.link_id,
      r.created_at,
      coalesce(p.user_id, p.id, r.link_id) as resolved_id,
      p.username,
      p.display_name,
      p.avatar_url,
      p.verified,
      p.custom_badges,
      p.followers_count
    from follow_rows r
    left join public.profiles p
      on p.user_id = r.link_id or p.id = r.link_id
  )
  select distinct on (resolved_id)
    resolved_id as user_id,
    coalesce(nullif(username, ''), 'user_' || left(resolved_id::text, 8)) as username,
    coalesce(nullif(display_name, ''), nullif(username, ''), 'Trader') as display_name,
    avatar_url,
    coalesce(verified, false) as verified,
    coalesce(custom_badges, '[]'::jsonb) as custom_badges,
    coalesce(followers_count, 0) as followers_count
  from expanded
  order by resolved_id, created_at desc;
$$;

-- Resync cached counters to the distinct counterpart count so UI numbers align with the lists.
update public.profiles p
set followers_count = coalesce((
  select count(distinct f.follower_id)::integer
  from public.followers f
  where f.followee_id in (select id from public.follow_identity_ids(coalesce(p.user_id, p.id)))
), 0),
following_count = coalesce((
  select count(distinct f.followee_id)::integer
  from public.followers f
  where f.follower_id in (select id from public.follow_identity_ids(coalesce(p.user_id, p.id)))
), 0);
