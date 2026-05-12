-- Follow requests for private profiles.
-- When a target user has private_profile = true, follow attempts create a
-- pending request that the target must approve before the follower row is
-- inserted.

create table if not exists public.follow_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null,
  target_id uuid not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  responded_at timestamptz
);

create unique index if not exists follow_requests_pending_uidx
  on public.follow_requests(requester_id, target_id)
  where status = 'pending';

create index if not exists follow_requests_target_pending_idx
  on public.follow_requests(target_id, created_at desc)
  where status = 'pending';

alter table public.follow_requests enable row level security;

drop policy if exists follow_requests_select on public.follow_requests;
create policy follow_requests_select on public.follow_requests
  for select
  using (requester_id = auth.uid() or target_id = auth.uid());

drop policy if exists follow_requests_insert on public.follow_requests;
create policy follow_requests_insert on public.follow_requests
  for insert
  with check (requester_id = auth.uid());

drop policy if exists follow_requests_update on public.follow_requests;
create policy follow_requests_update on public.follow_requests
  for update
  using (requester_id = auth.uid() or target_id = auth.uid());

drop policy if exists follow_requests_delete on public.follow_requests;
create policy follow_requests_delete on public.follow_requests
  for delete
  using (requester_id = auth.uid() or target_id = auth.uid());

-- Helper: is the target's profile marked private?
create or replace function public.is_profile_private(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select us.private_profile
     from public.user_settings us
     join public.follow_identity_ids(target_user_id) t on t.id = us.user_id
     limit 1),
    false
  );
$$;

-- Create a follow request (or directly follow if target is public).
-- Returns: 'following' | 'requested' | 'self' | 'already_following' | 'already_requested'
create or replace function public.request_follow(target_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  target_auth_id uuid;
  v_private boolean;
  v_existing_follow integer;
  v_existing_request integer;
  v_requester_name text;
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

  if target_auth_id = auth.uid() then
    return 'self';
  end if;

  select count(*)
  into v_existing_follow
  from public.followers f
  where f.follower_id in (select id from public.follow_identity_ids(auth.uid()))
    and f.followee_id in (select id from public.follow_identity_ids(target_auth_id));
  if v_existing_follow > 0 then
    return 'already_following';
  end if;

  v_private := public.is_profile_private(target_auth_id);

  if not v_private then
    insert into public.followers(follower_id, followee_id)
    values (auth.uid(), target_auth_id)
    on conflict do nothing;

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

    return 'following';
  end if;

  select count(*)
  into v_existing_request
  from public.follow_requests fr
  where fr.requester_id = auth.uid()
    and fr.target_id = target_auth_id
    and fr.status = 'pending';
  if v_existing_request > 0 then
    return 'already_requested';
  end if;

  insert into public.follow_requests(requester_id, target_id, status)
  values (auth.uid(), target_auth_id, 'pending')
  on conflict do nothing;

  select coalesce(nullif(p.display_name, ''), nullif(p.username, ''), 'Someone')
  into v_requester_name
  from public.profiles p
  where p.user_id = auth.uid() or p.id = auth.uid()
  limit 1;

  perform public.create_notification(
    target_auth_id,
    auth.uid(),
    'follow_request',
    'New follow request',
    coalesce(v_requester_name, 'Someone') || ' wants to follow you',
    'follow_request',
    null,
    'normal'
  );

  return 'requested';
end;
$$;

-- Cancel a pending follow request the current user sent.
create or replace function public.cancel_follow_request(target_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  target_auth_id uuid;
  v_deleted integer;
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

  delete from public.follow_requests
  where requester_id = auth.uid()
    and target_id in (select id from public.follow_identity_ids(target_auth_id))
    and status = 'pending';

  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

-- Approve or reject a pending follow request (target side).
create or replace function public.respond_follow_request(p_request_id uuid, p_accept boolean)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.follow_requests%rowtype;
  v_target_name text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_request
  from public.follow_requests
  where id = p_request_id
    and target_id in (select id from public.follow_identity_ids(auth.uid()))
    and status = 'pending'
  for update;

  if not found then
    return 'not_found';
  end if;

  if p_accept then
    insert into public.followers(follower_id, followee_id)
    values (v_request.requester_id, v_request.target_id)
    on conflict do nothing;

    update public.profiles p
    set followers_count = (
      select count(*)::integer
      from public.followers f
      where f.followee_id in (select id from public.follow_identity_ids(v_request.target_id))
    )
    where p.user_id = v_request.target_id or p.id = v_request.target_id;

    update public.profiles p
    set following_count = (
      select count(*)::integer
      from public.followers f
      where f.follower_id in (select id from public.follow_identity_ids(v_request.requester_id))
    )
    where p.user_id = v_request.requester_id or p.id = v_request.requester_id;

    update public.follow_requests
    set status = 'accepted', responded_at = now()
    where id = v_request.id;

    select coalesce(nullif(p.display_name, ''), nullif(p.username, ''), 'Someone')
    into v_target_name
    from public.profiles p
    where p.user_id = auth.uid() or p.id = auth.uid()
    limit 1;

    perform public.create_notification(
      v_request.requester_id,
      auth.uid(),
      'follow',
      'Follow request approved',
      coalesce(v_target_name, 'Someone') || ' accepted your follow request',
      'profile',
      null,
      'normal'
    );

    return 'accepted';
  else
    update public.follow_requests
    set status = 'rejected', responded_at = now()
    where id = v_request.id;
    return 'rejected';
  end if;
end;
$$;

-- List pending incoming follow requests for the current user.
create or replace function public.list_follow_requests()
returns table(
  request_id uuid,
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  verified boolean,
  custom_badges jsonb,
  followers_count integer,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select distinct on (coalesce(p.user_id, p.id))
    fr.id as request_id,
    coalesce(p.user_id, p.id) as user_id,
    public.profile_public_name(p) as username,
    coalesce(nullif(p.display_name, ''), public.profile_public_name(p)) as display_name,
    p.avatar_url,
    coalesce(p.verified, false) as verified,
    coalesce(p.custom_badges, '[]'::jsonb) as custom_badges,
    coalesce(p.followers_count, 0) as followers_count,
    fr.created_at
  from public.follow_requests fr
  join public.profiles p on p.user_id = fr.requester_id or p.id = fr.requester_id
  where fr.target_id in (select id from public.follow_identity_ids(auth.uid()))
    and fr.status = 'pending'
  order by coalesce(p.user_id, p.id), fr.created_at desc;
$$;

-- Status of current user's follow request for a target.
create or replace function public.get_follow_request_status(target_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (
      select 1 from public.followers f
      where f.follower_id in (select id from public.follow_identity_ids(auth.uid()))
        and f.followee_id in (select id from public.follow_identity_ids(target_user_id))
    ) then 'following'
    when exists (
      select 1 from public.follow_requests fr
      where fr.requester_id in (select id from public.follow_identity_ids(auth.uid()))
        and fr.target_id in (select id from public.follow_identity_ids(target_user_id))
        and fr.status = 'pending'
    ) then 'requested'
    else 'none'
  end;
$$;

grant execute on function public.is_profile_private(uuid) to anon, authenticated;
grant execute on function public.request_follow(uuid) to authenticated;
grant execute on function public.cancel_follow_request(uuid) to authenticated;
grant execute on function public.respond_follow_request(uuid, boolean) to authenticated;
grant execute on function public.list_follow_requests() to authenticated;
grant execute on function public.get_follow_request_status(uuid) to authenticated;
