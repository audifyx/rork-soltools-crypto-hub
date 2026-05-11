-- Final follow identity fix: make followers/following lists work no matter whether older rows stored auth user_id or profile id.

create or replace function public.follow_identity_ids(target_user_id uuid)
returns table(id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select distinct x.id
  from (
    select target_user_id as id
    union all
    select p.user_id from public.profiles p where p.id = target_user_id or p.user_id = target_user_id
    union all
    select p.id from public.profiles p where p.id = target_user_id or p.user_id = target_user_id
  ) x
  where x.id is not null;
$$;

create or replace function public.profile_public_name(p public.profiles)
returns text
language sql
stable
as $$
  select coalesce(nullif(p.username, ''), 'user_' || left(coalesce(p.user_id::text, p.id::text), 8));
$$;

create or replace function public.toggle_follow(target_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  target_auth_id uuid;
  did_follow boolean;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select coalesce(p.user_id, p.id, target_user_id)
  into target_auth_id
  from public.profiles p
  where p.user_id = target_user_id or p.id = target_user_id
  limit 1;

  target_auth_id := coalesce(target_auth_id, target_user_id);

  if target_auth_id is null or target_auth_id = auth.uid() then
    return false;
  end if;

  delete from public.followers
  where follower_id in (select id from public.follow_identity_ids(auth.uid()))
    and followee_id in (select id from public.follow_identity_ids(target_auth_id));

  if found then
    did_follow := false;
  else
    insert into public.followers(follower_id, followee_id)
    values (auth.uid(), target_auth_id)
    on conflict do nothing;
    did_follow := true;
  end if;

  update public.profiles p
  set followers_count = (
    select count(*)::integer
    from public.followers f
    where f.followee_id in (select id from public.follow_identity_ids(target_auth_id))
  )
  where p.user_id = target_auth_id or p.id = target_auth_id;

  update public.profiles p
  set following_count = (
    select count(*)::integer
    from public.followers f
    where f.follower_id in (select id from public.follow_identity_ids(auth.uid()))
  )
  where p.user_id = auth.uid() or p.id = auth.uid();

  return did_follow;
end;
$$;

create or replace function public.list_followers(target_user_id uuid)
returns table(user_id uuid, username text, display_name text, avatar_url text, verified boolean, custom_badges jsonb, followers_count integer)
language sql
security definer
set search_path = public
as $$
  select distinct on (coalesce(p.user_id, p.id))
    coalesce(p.user_id, p.id) as user_id,
    public.profile_public_name(p) as username,
    coalesce(nullif(p.display_name, ''), public.profile_public_name(p)) as display_name,
    p.avatar_url,
    coalesce(p.verified, false) as verified,
    coalesce(p.custom_badges, '[]'::jsonb) as custom_badges,
    coalesce(p.followers_count, 0) as followers_count
  from public.followers f
  join public.profiles p on p.user_id = f.follower_id or p.id = f.follower_id
  where f.followee_id in (select id from public.follow_identity_ids(target_user_id))
  order by coalesce(p.user_id, p.id), f.created_at desc;
$$;

create or replace function public.list_following(target_user_id uuid)
returns table(user_id uuid, username text, display_name text, avatar_url text, verified boolean, custom_badges jsonb, followers_count integer)
language sql
security definer
set search_path = public
as $$
  select distinct on (coalesce(p.user_id, p.id))
    coalesce(p.user_id, p.id) as user_id,
    public.profile_public_name(p) as username,
    coalesce(nullif(p.display_name, ''), public.profile_public_name(p)) as display_name,
    p.avatar_url,
    coalesce(p.verified, false) as verified,
    coalesce(p.custom_badges, '[]'::jsonb) as custom_badges,
    coalesce(p.followers_count, 0) as followers_count
  from public.followers f
  join public.profiles p on p.user_id = f.followee_id or p.id = f.followee_id
  where f.follower_id in (select id from public.follow_identity_ids(target_user_id))
  order by coalesce(p.user_id, p.id), f.created_at desc;
$$;

update public.profiles p
set followers_count = (
  select count(*)::integer
  from public.followers f
  where f.followee_id in (select id from public.follow_identity_ids(coalesce(p.user_id, p.id)))
),
following_count = (
  select count(*)::integer
  from public.followers f
  where f.follower_id in (select id from public.follow_identity_ids(coalesce(p.user_id, p.id)))
);
