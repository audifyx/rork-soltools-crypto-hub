-- =============================================================================
-- Share links + community member invites
-- Safe to run multiple times.
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Share links: stable app/open-graph links for posts, communities, reels, profiles.
-- -----------------------------------------------------------------------------
create table if not exists public.share_links (
  id           uuid primary key default gen_random_uuid(),
  code         text not null unique,
  created_by   uuid references auth.users(id) on delete set null,
  target_type  text not null check (target_type in ('post', 'community', 'reel', 'profile')),
  target_id    text not null,
  route        text not null,
  metadata     jsonb not null default '{}'::jsonb,
  clicks_count integer not null default 0,
  expires_at   timestamptz,
  created_at   timestamptz not null default now()
);

create index if not exists share_links_target_idx on public.share_links (target_type, target_id);
create index if not exists share_links_created_by_idx on public.share_links (created_by, created_at desc);

create table if not exists public.share_link_clicks (
  id            uuid primary key default gen_random_uuid(),
  share_link_id uuid not null references public.share_links(id) on delete cascade,
  viewer_id     uuid references auth.users(id) on delete set null,
  referrer      text,
  user_agent    text,
  created_at    timestamptz not null default now()
);

create index if not exists share_link_clicks_link_idx on public.share_link_clicks (share_link_id, created_at desc);

alter table public.share_links enable row level security;
alter table public.share_link_clicks enable row level security;

drop policy if exists share_links_public_read on public.share_links;
create policy share_links_public_read on public.share_links
  for select using (expires_at is null or expires_at > now());

drop policy if exists share_links_owner_insert on public.share_links;
create policy share_links_owner_insert on public.share_links
  for insert with check (created_by is null or created_by = auth.uid());

-- Click rows are written through resolve_share_link(); users do not need direct access.

create or replace function public.default_share_route(p_target_type text, p_target_id text)
returns text
language sql
immutable
as $$
  select case p_target_type
    when 'community' then '/community/' || p_target_id
    when 'post' then '/post/' || p_target_id
    when 'reel' then '/(tabs)/reels?focus=' || p_target_id
    when 'profile' then '/u/' || regexp_replace(p_target_id, '^@', '')
    else '/notifications'
  end;
$$;

create or replace function public.new_share_code()
returns text
language sql
volatile
as $$
  select lower(substr(encode(gen_random_bytes(9), 'base64'), 1, 10));
$$;

create or replace function public.create_share_link(
  p_target_type text,
  p_target_id   text,
  p_route       text default null,
  p_metadata    jsonb default '{}'::jsonb,
  p_expires_at  timestamptz default null
)
returns table (
  id uuid,
  code text,
  url text,
  app_url text,
  target_type text,
  target_id text,
  route text,
  metadata jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_code text;
  v_route text;
  v_row public.share_links%rowtype;
  v_attempts integer := 0;
begin
  p_target_type := lower(trim(coalesce(p_target_type, '')));
  p_target_id := trim(coalesce(p_target_id, ''));

  if p_target_type not in ('post', 'community', 'reel', 'profile') then
    raise exception 'invalid_target_type';
  end if;
  if p_target_id = '' then
    raise exception 'target_id_required';
  end if;

  v_route := coalesce(nullif(trim(p_route), ''), public.default_share_route(p_target_type, p_target_id));

  select * into v_row
  from public.share_links sl
  where sl.created_by is not distinct from v_uid
    and sl.target_type = p_target_type
    and sl.target_id = p_target_id
    and (sl.expires_at is null or sl.expires_at > now())
  order by sl.created_at desc
  limit 1;

  if v_row.id is null then
    loop
      v_attempts := v_attempts + 1;
      v_code := regexp_replace(public.new_share_code(), '[^a-zA-Z0-9]', '', 'g');
      if length(v_code) < 7 then
        v_code := lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
      end if;
      begin
        insert into public.share_links (code, created_by, target_type, target_id, route, metadata, expires_at)
        values (v_code, v_uid, p_target_type, p_target_id, v_route, coalesce(p_metadata, '{}'::jsonb), p_expires_at)
        returning * into v_row;
        exit;
      exception when unique_violation then
        if v_attempts > 8 then
          raise exception 'could_not_create_share_link';
        end if;
      end;
    end loop;
  else
    update public.share_links
       set metadata = coalesce(v_row.metadata, '{}'::jsonb) || coalesce(p_metadata, '{}'::jsonb),
           route = v_route
     where share_links.id = v_row.id
     returning * into v_row;
  end if;

  return query select
    v_row.id,
    v_row.code,
    'https://ogscan.fun/l/' || v_row.code,
    'rork-app://l/' || v_row.code,
    v_row.target_type,
    v_row.target_id,
    v_row.route,
    v_row.metadata;
end;
$$;

grant execute on function public.create_share_link(text, text, text, jsonb, timestamptz) to authenticated, anon;

create or replace function public.resolve_share_link(
  p_code text,
  p_referrer text default null,
  p_user_agent text default null
)
returns table (
  id uuid,
  code text,
  target_type text,
  target_id text,
  route text,
  metadata jsonb,
  clicks_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.share_links%rowtype;
begin
  select * into v_row
  from public.share_links sl
  where lower(sl.code) = lower(trim(coalesce(p_code, '')))
    and (sl.expires_at is null or sl.expires_at > now())
  limit 1;

  if v_row.id is null then
    return;
  end if;

  update public.share_links
     set clicks_count = clicks_count + 1
   where share_links.id = v_row.id
   returning * into v_row;

  insert into public.share_link_clicks (share_link_id, viewer_id, referrer, user_agent)
  values (v_row.id, v_uid, nullif(trim(coalesce(p_referrer, '')), ''), nullif(trim(coalesce(p_user_agent, '')), ''));

  return query select v_row.id, v_row.code, v_row.target_type, v_row.target_id, v_row.route, v_row.metadata, v_row.clicks_count;
end;
$$;

grant execute on function public.resolve_share_link(text, text, text) to authenticated, anon;

-- -----------------------------------------------------------------------------
-- Community invite picker + notification creation.
-- -----------------------------------------------------------------------------
create or replace function public.list_invitable_users(
  p_community_id uuid,
  p_limit integer default 80,
  p_search text default null
)
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  avatar_color text,
  verified boolean,
  followers_count integer,
  is_online boolean,
  last_seen_at timestamptz
)
language sql
security definer
stable
set search_path = public
as $$
  select
    coalesce(p.user_id, p.id) as user_id,
    p.username,
    p.display_name,
    p.avatar_url,
    p.avatar_color,
    coalesce(p.verified, false) as verified,
    coalesce(p.followers_count, 0)::integer as followers_count,
    coalesce(p.is_online, false) as is_online,
    p.last_seen_at
  from public.profiles p
  where coalesce(p.user_id, p.id) is not null
    and coalesce(p.user_id, p.id) <> auth.uid()
    and not exists (
      select 1 from public.community_members cm
      where cm.community_id = p_community_id
        and cm.user_id = coalesce(p.user_id, p.id)
    )
    and not exists (
      select 1 from public.notifications n
      where n.user_id = coalesce(p.user_id, p.id)
        and n.kind = 'community_invite'
        and n.target_type = 'community'
        and n.target_id = p_community_id::text
        and n.read_at is null
    )
    and (
      p_search is null
      or trim(p_search) = ''
      or p.username ilike '%' || trim(p_search) || '%'
      or p.display_name ilike '%' || trim(p_search) || '%'
    )
  order by coalesce(p.followers_count, 0) desc, p.created_at desc
  limit greatest(1, least(coalesce(p_limit, 80), 120));
$$;

grant execute on function public.list_invitable_users(uuid, integer, text) to authenticated;

create or replace function public.create_community_invite(
  p_community_id uuid,
  p_target_user_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_community record;
  v_actor record;
  v_target uuid := p_target_user_id;
  v_notification_id uuid;
  v_link record;
begin
  if v_uid is null then
    raise exception 'auth_required';
  end if;
  if p_community_id is null or p_target_user_id is null then
    raise exception 'community_and_target_required';
  end if;
  if p_target_user_id = v_uid then
    raise exception 'cannot_invite_self';
  end if;

  select id, name, slug, owner_id into v_community
  from public.communities
  where id = p_community_id;

  if v_community.id is null then
    raise exception 'community_not_found';
  end if;

  if not exists (
    select 1 from public.community_members cm
    where cm.community_id = p_community_id and cm.user_id = v_uid
  ) and v_community.owner_id is distinct from v_uid then
    raise exception 'not_a_member';
  end if;

  select coalesce(display_name, username, 'Someone') as name, username into v_actor
  from public.profiles
  where user_id = v_uid or id = v_uid
  limit 1;

  select * into v_link
  from public.create_share_link(
    'community',
    p_community_id::text,
    '/community/' || p_community_id::text,
    jsonb_build_object('communityName', v_community.name, 'communitySlug', v_community.slug),
    null
  );

  if exists (
    select 1 from public.community_members cm
    where cm.community_id = p_community_id and cm.user_id = v_target
  ) then
    raise exception 'already_member';
  end if;

  -- Keep only one unread invite per inviter/community/target so users are not spammed.
  select n.id into v_notification_id
  from public.notifications n
  where n.user_id = v_target
    and n.actor_id is not distinct from v_uid
    and n.kind = 'community_invite'
    and n.target_type = 'community'
    and n.target_id = p_community_id::text
    and n.read_at is null
  order by n.created_at desc
  limit 1;

  if v_notification_id is not null then
    update public.notifications
       set created_at = now(),
           title = 'Community invite',
           message = coalesce(v_actor.name, 'Someone') || ' invited you to join ' || v_community.name,
           body = coalesce(v_actor.name, 'Someone') || ' invited you to join ' || v_community.name,
           data = coalesce(data, '{}'::jsonb) || jsonb_build_object(
             'route', '/community/' || p_community_id::text,
             'communityId', p_community_id::text,
             'communityName', v_community.name,
             'communitySlug', v_community.slug,
             'inviteLink', v_link.url,
             'appLink', v_link.app_url,
             'action', 'join_community',
             'actorName', coalesce(v_actor.name, 'Someone'),
             'actorUsername', v_actor.username
           )
     where id = v_notification_id;

    insert into public.notification_dispatch_queue (notification_id, user_id, title, body, data)
    values (
      v_notification_id,
      v_target,
      'Community invite',
      coalesce(v_actor.name, 'Someone') || ' invited you to join ' || v_community.name,
      jsonb_build_object(
        'notificationId', v_notification_id::text,
        'kind', 'community_invite',
        'targetType', 'community',
        'targetId', p_community_id::text,
        'route', '/community/' || p_community_id::text,
        'communityId', p_community_id::text,
        'communityName', v_community.name,
        'action', 'join_community'
      )
    );
    return v_notification_id;
  end if;

  insert into public.notifications (
    user_id,
    kind,
    type,
    title,
    message,
    body,
    data,
    actor_id,
    target_type,
    target_id
  ) values (
    v_target,
    'community_invite',
    'invite',
    'Community invite',
    coalesce(v_actor.name, 'Someone') || ' invited you to join ' || v_community.name,
    coalesce(v_actor.name, 'Someone') || ' invited you to join ' || v_community.name,
    jsonb_build_object(
      'route', '/community/' || p_community_id::text,
      'communityId', p_community_id::text,
      'communityName', v_community.name,
      'communitySlug', v_community.slug,
      'inviteLink', v_link.url,
      'appLink', v_link.app_url,
      'action', 'join_community',
      'actorName', coalesce(v_actor.name, 'Someone'),
      'actorUsername', v_actor.username
    ),
    v_uid,
    'community',
    p_community_id::text
  ) returning id into v_notification_id;

  return v_notification_id;
end;
$$;

grant execute on function public.create_community_invite(uuid, uuid) to authenticated;

create or replace function public.accept_community_invite(
  p_notification_id uuid
)
returns table (
  status text,
  community_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_notification record;
  v_community_id uuid;
  v_role text := 'member';
begin
  if v_uid is null then
    raise exception 'auth_required';
  end if;
  if p_notification_id is null then
    raise exception 'notification_required';
  end if;

  select * into v_notification
  from public.notifications n
  where n.id = p_notification_id
    and n.user_id = v_uid
    and n.kind = 'community_invite'
  limit 1;

  if v_notification.id is null then
    raise exception 'invite_not_found';
  end if;

  begin
    v_community_id := coalesce(
      nullif(v_notification.target_id, '')::uuid,
      nullif(v_notification.data->>'communityId', '')::uuid
    );
  exception when others then
    raise exception 'invalid_invite_target';
  end;

  if v_community_id is null then
    raise exception 'invalid_invite_target';
  end if;

  if not exists (select 1 from public.communities c where c.id = v_community_id) then
    raise exception 'community_not_found';
  end if;

  if exists (
    select 1 from public.community_bans b
    where b.community_id = v_community_id and b.user_id = v_uid
  ) then
    raise exception 'banned';
  end if;

  if exists (
    select 1 from public.communities c
    where c.id = v_community_id and c.owner_id = v_uid
  ) then
    v_role := 'owner';
  end if;

  insert into public.community_members (community_id, user_id, role)
  values (v_community_id, v_uid, v_role)
  on conflict do nothing;

  delete from public.community_join_requests
  where community_id = v_community_id and user_id = v_uid;

  update public.notifications
     set read_at = coalesce(read_at, now())
   where id = p_notification_id and user_id = v_uid;

  return query select 'joined'::text, v_community_id;
end;
$$;

grant execute on function public.accept_community_invite(uuid) to authenticated;
