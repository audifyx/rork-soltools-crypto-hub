-- Spaces advanced features: banner image, live viewer counter, peak listeners,
-- persistent pinned note and live poll, chat message likes and pinned messages.
-- Fully idempotent — safe to run repeatedly.

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- Columns: banner, persistent pin / poll, view counters
-- ----------------------------------------------------------------------------
alter table public.livekit_rooms add column if not exists banner_url text;
alter table public.livekit_rooms add column if not exists pinned_note text;
alter table public.livekit_rooms add column if not exists current_poll jsonb;
alter table public.livekit_rooms add column if not exists viewers_now integer not null default 0;
alter table public.livekit_rooms add column if not exists peak_listeners integer not null default 0;
alter table public.livekit_rooms add column if not exists total_views integer not null default 0;

-- ----------------------------------------------------------------------------
-- Chat: per-message likes and pinned flag.
-- ----------------------------------------------------------------------------
alter table public.space_messages add column if not exists likes_count integer not null default 0;
alter table public.space_messages add column if not exists pinned boolean not null default false;

create table if not exists public.space_message_likes (
  message_id uuid not null references public.space_messages(id) on delete cascade,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key(message_id, user_id)
);

alter table public.space_message_likes enable row level security;

do $$
declare pol record;
begin
  for pol in select tablename, policyname from pg_policies
             where schemaname = 'public' and tablename = 'space_message_likes'
  loop
    execute format('drop policy if exists %I on public.%I', pol.policyname, pol.tablename);
  end loop;
end $$;

create policy space_message_likes_select_all on public.space_message_likes for select using (true);
create policy space_message_likes_write_own on public.space_message_likes for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Tracks every unique user who joined a Space at least once. Backs
-- `total_views` so we never double count the same listener.
create table if not exists public.space_views (
  room_id uuid not null references public.livekit_rooms(id) on delete cascade,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key(room_id, user_id)
);

alter table public.space_views enable row level security;
do $$
declare pol record;
begin
  for pol in select tablename, policyname from pg_policies
             where schemaname = 'public' and tablename = 'space_views'
  loop
    execute format('drop policy if exists %I on public.%I', pol.policyname, pol.tablename);
  end loop;
end $$;
create policy space_views_select_all on public.space_views for select using (true);
create policy space_views_insert_self on public.space_views for insert with check (user_id = auth.uid());

-- ----------------------------------------------------------------------------
-- Refresh counts — now also writes viewer / peak / total snapshots.
-- ----------------------------------------------------------------------------
drop function if exists public.refresh_space_counts(uuid);
create function public.refresh_space_counts(target_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_speakers integer;
  v_listeners integer;
  v_hands integer;
  v_viewers integer;
  v_total integer;
begin
  select count(*) into v_speakers from public.livekit_participants
    where room_id = target_room_id and left_at is null and role in ('host','co-host','speaker');
  select count(*) into v_listeners from public.livekit_participants
    where room_id = target_room_id and left_at is null and role = 'listener';
  select count(*) into v_hands from public.livekit_participants
    where room_id = target_room_id and left_at is null and hand_raised;
  -- Active viewers = anyone whose heartbeat is fresher than 60 seconds.
  select count(*) into v_viewers from public.livekit_participants
    where room_id = target_room_id and left_at is null and last_seen_at > now() - interval '60 seconds';
  select count(*) into v_total from public.space_views where room_id = target_room_id;

  update public.livekit_rooms r
  set
    speakers_count = coalesce(v_speakers, 0),
    listeners_count = coalesce(v_listeners, 0),
    raised_hands = coalesce(v_hands, 0),
    viewers_now = coalesce(v_viewers, 0),
    peak_listeners = greatest(coalesce(r.peak_listeners, 0), coalesce(v_listeners, 0) + coalesce(v_speakers, 0)),
    total_views = coalesce(v_total, r.total_views),
    updated_at = now()
  where r.id = target_room_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- Create + start now accept a banner url.
-- ----------------------------------------------------------------------------
drop function if exists public.create_space(text, text, text, text, timestamptz, boolean, text, text);
drop function if exists public.create_space(text, text, text, text, timestamptz, boolean, text, text, text);
create function public.create_space(
  p_name text,
  p_topic text default 'ALPHA',
  p_description text default '',
  p_category text default 'alpha',
  p_scheduled_at timestamptz default null,
  p_recording boolean default false,
  p_accent_a text default '#F4C65B',
  p_accent_b text default '#55F5B2',
  p_banner_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  created_id uuid;
  room_name text;
  trimmed_name text;
begin
  if auth.uid() is null then raise exception 'Sign in to start a Space.' using errcode = '28000'; end if;
  trimmed_name := trim(coalesce(p_name, ''));
  if length(trimmed_name) < 3 then raise exception 'Give your Space a stronger title.' using errcode = '22023'; end if;

  created_id := gen_random_uuid();
  room_name := 'space-' || replace(created_id::text, '-', '');

  insert into public.livekit_rooms(
    id, name, topic, description, host_id, livekit_room_name,
    status, is_active, started_at, scheduled_at, category, recording, accent_a, accent_b, banner_url
  )
  values (
    created_id,
    trimmed_name,
    upper(left(coalesce(nullif(trim(coalesce(p_topic, '')), ''), 'ALPHA'), 28)),
    left(coalesce(p_description, ''), 500),
    auth.uid(),
    room_name,
    case when p_scheduled_at is null then 'live' else 'scheduled' end,
    p_scheduled_at is null,
    case when p_scheduled_at is null then now() else null end,
    p_scheduled_at,
    coalesce(nullif(p_category, ''), 'alpha'),
    coalesce(p_recording, false),
    coalesce(nullif(p_accent_a, ''), '#F4C65B'),
    coalesce(nullif(p_accent_b, ''), '#55F5B2'),
    nullif(trim(coalesce(p_banner_url, '')), '')
  );

  insert into public.livekit_participants(room_id, user_id, identity, display_name, role, muted, hand_raised, speaking, last_seen_at)
  values (created_id, auth.uid(), auth.uid()::text, 'Host', 'host', false, false, false, now())
  on conflict (room_id, user_id) do update
    set left_at = null, role = 'host', muted = false, last_seen_at = now();

  insert into public.space_views(room_id, user_id) values (created_id, auth.uid())
  on conflict do nothing;

  perform public.refresh_space_counts(created_id);
  return created_id;
end;
$$;

grant execute on function public.create_space(text, text, text, text, timestamptz, boolean, text, text, text) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- Host-only: update the banner image of an existing Space.
-- ----------------------------------------------------------------------------
drop function if exists public.update_space_banner(uuid, text);
create function public.update_space_banner(target_room_id uuid, p_banner_url text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Sign in to edit this Space.' using errcode = '28000'; end if;
  update public.livekit_rooms
  set banner_url = nullif(trim(coalesce(p_banner_url, '')), ''), updated_at = now()
  where id = target_room_id and host_id = auth.uid();
  if not found then raise exception 'Only the host can change the banner.' using errcode = '42501'; end if;
end;
$$;
grant execute on function public.update_space_banner(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- Persistent pinned note (host-only). NULL clears the pin.
-- ----------------------------------------------------------------------------
drop function if exists public.set_space_pin(uuid, text);
create function public.set_space_pin(target_room_id uuid, p_note text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Sign in to pin in this Space.' using errcode = '28000'; end if;
  update public.livekit_rooms
  set pinned_note = nullif(trim(coalesce(p_note, '')), ''), updated_at = now()
  where id = target_room_id and host_id = auth.uid();
  if not found then raise exception 'Only the host can pin notes.' using errcode = '42501'; end if;
end;
$$;
grant execute on function public.set_space_pin(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- Polls: stored as JSON on the room. Voting and closing also routed through
-- RPCs so new listeners pick up state without depending on broadcast.
-- ----------------------------------------------------------------------------
drop function if exists public.set_space_poll(uuid, jsonb);
create function public.set_space_poll(target_room_id uuid, p_poll jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Sign in to run a poll.' using errcode = '28000'; end if;
  update public.livekit_rooms
  set current_poll = p_poll, updated_at = now()
  where id = target_room_id and host_id = auth.uid();
  if not found then raise exception 'Only the host can run polls.' using errcode = '42501'; end if;
end;
$$;
grant execute on function public.set_space_poll(uuid, jsonb) to authenticated;

drop function if exists public.vote_space_poll(uuid, integer);
create function public.vote_space_poll(target_room_id uuid, p_option integer)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  current_poll jsonb;
  voter text;
begin
  if auth.uid() is null then raise exception 'Sign in to vote.' using errcode = '28000'; end if;
  voter := auth.uid()::text;
  select r.current_poll into current_poll from public.livekit_rooms r where id = target_room_id;
  if current_poll is null then return null; end if;
  if current_poll->'voters' ? voter then
    return current_poll;
  end if;
  current_poll := jsonb_set(
    current_poll,
    array['voters', voter],
    to_jsonb(p_option),
    true
  );
  update public.livekit_rooms
  set current_poll = current_poll, updated_at = now()
  where id = target_room_id;
  return current_poll;
end;
$$;
grant execute on function public.vote_space_poll(uuid, integer) to authenticated;

-- ----------------------------------------------------------------------------
-- Chat message likes (toggle) and host-only message pin.
-- ----------------------------------------------------------------------------
drop function if exists public.toggle_space_message_like(uuid);
create function public.toggle_space_message_like(target_message_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  liked boolean;
  new_count integer;
begin
  if auth.uid() is null then raise exception 'Sign in to react.' using errcode = '28000'; end if;
  if exists (select 1 from public.space_message_likes where message_id = target_message_id and user_id = auth.uid()) then
    delete from public.space_message_likes where message_id = target_message_id and user_id = auth.uid();
    liked := false;
  else
    insert into public.space_message_likes(message_id, user_id) values (target_message_id, auth.uid())
      on conflict do nothing;
    liked := true;
  end if;
  select count(*) into new_count from public.space_message_likes where message_id = target_message_id;
  update public.space_messages set likes_count = new_count where id = target_message_id;
  return new_count;
end;
$$;
grant execute on function public.toggle_space_message_like(uuid) to authenticated;

drop function if exists public.pin_space_message(uuid, uuid, boolean);
create function public.pin_space_message(target_room_id uuid, target_message_id uuid, p_pinned boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.livekit_rooms where id = target_room_id and host_id = auth.uid()) then
    raise exception 'Only the host can pin chat messages.' using errcode = '42501';
  end if;
  if coalesce(p_pinned, false) then
    update public.space_messages set pinned = false where room_id = target_room_id and pinned;
  end if;
  update public.space_messages set pinned = coalesce(p_pinned, false)
    where id = target_message_id and room_id = target_room_id;
end;
$$;
grant execute on function public.pin_space_message(uuid, uuid, boolean) to authenticated;

-- ----------------------------------------------------------------------------
-- Host-only single mute (matches what the social-provider already calls).
-- Safe re-create so the fallback path resolves to a real RPC.
-- ----------------------------------------------------------------------------
drop function if exists public.set_space_participant_mute(uuid, uuid, boolean);
create function public.set_space_participant_mute(target_room_id uuid, target_participant_id uuid, p_muted boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.livekit_rooms where id = target_room_id and host_id = auth.uid()) then
    raise exception 'Only the host can mute participants.' using errcode = '42501';
  end if;
  update public.livekit_participants
  set muted = coalesce(p_muted, true), speaking = false, last_seen_at = now()
  where id = target_participant_id and room_id = target_room_id;
end;
$$;
grant execute on function public.set_space_participant_mute(uuid, uuid, boolean) to authenticated;

drop function if exists public.mute_all_space_participants(uuid);
create function public.mute_all_space_participants(target_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.livekit_rooms where id = target_room_id and host_id = auth.uid()) then
    raise exception 'Only the host can mute the room.' using errcode = '42501';
  end if;
  update public.livekit_participants
  set muted = true, speaking = false, last_seen_at = now()
  where room_id = target_room_id and role <> 'host';
end;
$$;
grant execute on function public.mute_all_space_participants(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- join_space now stamps a space_view and bumps total_views via refresh.
-- ----------------------------------------------------------------------------
drop function if exists public.join_space(uuid);
create function public.join_space(target_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  host uuid;
  is_active_room boolean;
begin
  if auth.uid() is null then raise exception 'Sign in to join Spaces.' using errcode = '28000'; end if;
  select host_id, status <> 'ended' into host, is_active_room
  from public.livekit_rooms where id = target_room_id;
  if not coalesce(is_active_room, false) then raise exception 'Space is not available.' using errcode = '42704'; end if;

  insert into public.livekit_participants(room_id, user_id, identity, display_name, role, muted, hand_raised, speaking, left_at, last_seen_at)
  values (
    target_room_id, auth.uid(), auth.uid()::text, 'Trader',
    case when host = auth.uid() then 'host' else 'listener' end,
    case when host = auth.uid() then false else true end,
    false, false, null, now()
  )
  on conflict (room_id, user_id) do update
    set left_at = null,
        last_seen_at = now(),
        role = case when livekit_participants.user_id = host then 'host' else livekit_participants.role end;

  insert into public.space_views(room_id, user_id) values (target_room_id, auth.uid())
  on conflict do nothing;

  perform public.refresh_space_counts(target_room_id);
end;
$$;
grant execute on function public.join_space(uuid) to anon, authenticated;

-- ----------------------------------------------------------------------------
-- heartbeat refreshes counts too so the viewer counter ticks live.
-- ----------------------------------------------------------------------------
drop function if exists public.heartbeat_space_participant(uuid);
create function public.heartbeat_space_participant(target_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.livekit_participants
  set last_seen_at = now()
  where room_id = target_room_id and user_id = auth.uid() and left_at is null;
  perform public.refresh_space_counts(target_room_id);
end;
$$;
grant execute on function public.heartbeat_space_participant(uuid) to authenticated;

-- Tell PostgREST to refresh.
notify pgrst, 'reload schema';
