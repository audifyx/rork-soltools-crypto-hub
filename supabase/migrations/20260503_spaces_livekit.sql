-- SolTools Spaces: LiveKit-backed audio spaces, chat, follows, and presence.
-- Run in Supabase SQL editor, then deploy supabase/functions/livekit-token.

create extension if not exists pgcrypto;

create table if not exists public.livekit_rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  topic text,
  description text,
  host_id uuid not null references auth.users(id) on delete cascade,
  community_id uuid,
  livekit_room_name text not null unique,
  status text not null default 'scheduled',
  is_active boolean not null default false,
  scheduled_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  category text not null default 'alpha',
  accent_a text,
  accent_b text,
  recording boolean not null default false,
  raised_hands integer not null default 0,
  listeners_count integer not null default 0,
  speakers_count integer not null default 0,
  max_participants integer not null default 500,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint livekit_rooms_status_check check (status in ('scheduled','live','ended','cancelled')),
  constraint livekit_rooms_category_check check (category in ('alpha','whales','ai','ta','memes','launches')),
  constraint livekit_rooms_name_length check (char_length(trim(name)) between 3 and 120)
);

alter table public.livekit_rooms add column if not exists livekit_room_name text;
alter table public.livekit_rooms add column if not exists status text not null default 'scheduled';
alter table public.livekit_rooms add column if not exists max_participants integer not null default 500;
alter table public.livekit_rooms add column if not exists metadata jsonb not null default '{}'::jsonb;

update public.livekit_rooms
set livekit_room_name = 'space-' || replace(id::text, '-', '')
where livekit_room_name is null or trim(livekit_room_name) = '';

create unique index if not exists livekit_rooms_room_name_key on public.livekit_rooms(livekit_room_name);
create index if not exists livekit_rooms_status_started_idx on public.livekit_rooms(status, is_active, started_at desc);
create index if not exists livekit_rooms_scheduled_idx on public.livekit_rooms(scheduled_at asc) where ended_at is null;
create index if not exists livekit_rooms_host_idx on public.livekit_rooms(host_id, created_at desc);

create table if not exists public.livekit_participants (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.livekit_rooms(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  identity text not null,
  display_name text,
  role text not null default 'listener',
  muted boolean not null default true,
  hand_raised boolean not null default false,
  speaking boolean not null default false,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  last_seen_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint livekit_participants_role_check check (role in ('host','co-host','speaker','listener'))
);

alter table public.livekit_participants add column if not exists display_name text;
alter table public.livekit_participants add column if not exists muted boolean not null default true;
alter table public.livekit_participants add column if not exists hand_raised boolean not null default false;
alter table public.livekit_participants add column if not exists speaking boolean not null default false;
alter table public.livekit_participants add column if not exists last_seen_at timestamptz not null default now();
alter table public.livekit_participants add column if not exists metadata jsonb not null default '{}'::jsonb;

create unique index if not exists livekit_participants_active_user_key
  on public.livekit_participants(room_id, user_id)
  where left_at is null and user_id is not null;
create unique index if not exists livekit_participants_active_identity_key
  on public.livekit_participants(room_id, identity)
  where left_at is null;
create index if not exists livekit_participants_room_active_idx on public.livekit_participants(room_id, left_at, joined_at asc);

create table if not exists public.space_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.livekit_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  message_type text not null default 'text',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint space_messages_body_check check (char_length(trim(body)) between 1 and 1000),
  constraint space_messages_type_check check (message_type in ('text','system','ticker','reaction'))
);
create index if not exists space_messages_room_created_idx on public.space_messages(room_id, created_at asc);

create table if not exists public.space_reactions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.livekit_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null default '🔥',
  created_at timestamptz not null default now()
);
create index if not exists space_reactions_room_created_idx on public.space_reactions(room_id, created_at desc);

create table if not exists public.space_follows (
  room_id uuid not null references public.livekit_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (room_id, user_id)
);
create index if not exists space_follows_user_idx on public.space_follows(user_id, created_at desc);

create or replace function public.refresh_space_counts(target_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.livekit_rooms r
  set listeners_count = coalesce((
        select count(*)::integer from public.livekit_participants p
        where p.room_id = target_room_id and p.left_at is null and p.role = 'listener'
      ), 0),
      speakers_count = coalesce((
        select count(*)::integer from public.livekit_participants p
        where p.room_id = target_room_id and p.left_at is null and p.role in ('host','co-host','speaker')
      ), 0),
      raised_hands = coalesce((
        select count(*)::integer from public.livekit_participants p
        where p.room_id = target_room_id and p.left_at is null and p.hand_raised = true
      ), 0),
      updated_at = now()
  where r.id = target_room_id;
end;
$$;

create or replace function public.create_space(
  p_name text,
  p_topic text default null,
  p_description text default null,
  p_category text default 'alpha',
  p_scheduled_at timestamptz default null,
  p_recording boolean default false,
  p_accent_a text default null,
  p_accent_b text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  me uuid := auth.uid();
  new_id uuid := gen_random_uuid();
  clean_name text := left(trim(coalesce(p_name, '')), 120);
  clean_topic text := upper(left(trim(coalesce(p_topic, 'ALPHA')), 28));
  clean_category text := lower(trim(coalesce(p_category, 'alpha')));
  starts_now boolean := p_scheduled_at is null or p_scheduled_at <= now() + interval '60 seconds';
  profile_name text;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if char_length(clean_name) < 3 then raise exception 'space title is too short'; end if;
  if clean_category not in ('alpha','whales','ai','ta','memes','launches') then clean_category := 'alpha'; end if;

  select coalesce(nullif(display_name, ''), nullif(username, ''), split_part((auth.jwt() ->> 'email'), '@', 1), 'Host')
  into profile_name
  from public.profiles
  where user_id = me or id = me
  limit 1;

  insert into public.livekit_rooms (
    id, name, topic, description, host_id, livekit_room_name, status, is_active,
    scheduled_at, started_at, category, accent_a, accent_b, recording
  ) values (
    new_id,
    clean_name,
    clean_topic,
    left(trim(coalesce(p_description, '')), 500),
    me,
    'space-' || replace(new_id::text, '-', ''),
    case when starts_now then 'live' else 'scheduled' end,
    starts_now,
    case when starts_now then null else p_scheduled_at end,
    case when starts_now then now() else null end,
    clean_category,
    p_accent_a,
    p_accent_b,
    coalesce(p_recording, false)
  );

  insert into public.livekit_participants (room_id, user_id, identity, display_name, role, muted, hand_raised)
  values (new_id, me, me::text, coalesce(profile_name, 'Host'), 'host', false, false);

  perform public.refresh_space_counts(new_id);
  return new_id;
end;
$$;

create or replace function public.start_space(target_room_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  update public.livekit_rooms
  set status = 'live', is_active = true, started_at = coalesce(started_at, now()), scheduled_at = null, updated_at = now()
  where id = target_room_id and host_id = auth.uid() and ended_at is null;
  if not found then raise exception 'space not found or not host'; end if;
  return true;
end;
$$;

create or replace function public.join_space(target_room_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  me uuid := auth.uid();
  room record;
  existing_id uuid;
  wanted_role text := 'listener';
  profile_name text;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select * into room from public.livekit_rooms where id = target_room_id;
  if room.id is null then raise exception 'space not found'; end if;
  if room.ended_at is not null or room.status in ('ended','cancelled') then raise exception 'space is closed'; end if;

  if room.host_id = me then
    wanted_role := 'host';
  elsif room.is_active = false then
    raise exception 'space is not live yet';
  end if;

  select coalesce(nullif(display_name, ''), nullif(username, ''), split_part((auth.jwt() ->> 'email'), '@', 1), 'Listener')
  into profile_name
  from public.profiles
  where user_id = me or id = me
  limit 1;

  select id into existing_id
  from public.livekit_participants
  where room_id = target_room_id and user_id = me and left_at is null
  limit 1;

  if existing_id is not null then
    update public.livekit_participants
    set role = case when role = 'host' then 'host' else wanted_role end,
        display_name = coalesce(profile_name, display_name),
        last_seen_at = now()
    where id = existing_id;
  else
    insert into public.livekit_participants (room_id, user_id, identity, display_name, role, muted, hand_raised)
    values (target_room_id, me, me::text, coalesce(profile_name, 'Listener'), wanted_role, wanted_role = 'listener', false);
  end if;

  perform public.refresh_space_counts(target_room_id);
  return true;
end;
$$;

create or replace function public.leave_space(target_room_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  update public.livekit_participants
  set left_at = now(), last_seen_at = now(), speaking = false, hand_raised = false
  where room_id = target_room_id and user_id = auth.uid() and left_at is null;
  perform public.refresh_space_counts(target_room_id);
  return true;
end;
$$;

create or replace function public.set_space_mute(target_room_id uuid, p_muted boolean)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_role text;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  select role into current_role from public.livekit_participants
  where room_id = target_room_id and user_id = auth.uid() and left_at is null
  limit 1;
  if current_role is null then raise exception 'join the space first'; end if;
  if current_role = 'listener' and coalesce(p_muted, true) = false then
    raise exception 'listeners must be invited before unmuting';
  end if;
  update public.livekit_participants
  set muted = coalesce(p_muted, true), speaking = case when coalesce(p_muted, true) then false else speaking end, last_seen_at = now()
  where room_id = target_room_id and user_id = auth.uid() and left_at is null;
  return true;
end;
$$;

create or replace function public.set_space_hand(target_room_id uuid, p_raised boolean)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  update public.livekit_participants
  set hand_raised = coalesce(p_raised, false), last_seen_at = now()
  where room_id = target_room_id and user_id = auth.uid() and left_at is null;
  if not found then
    perform public.join_space(target_room_id);
    update public.livekit_participants set hand_raised = coalesce(p_raised, false)
    where room_id = target_room_id and user_id = auth.uid() and left_at is null;
  end if;
  perform public.refresh_space_counts(target_room_id);
  return true;
end;
$$;

create or replace function public.send_space_message(target_room_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  me uuid := auth.uid();
  message_id uuid;
  clean_body text := left(trim(coalesce(p_body, '')), 1000);
begin
  if me is null then raise exception 'not authenticated'; end if;
  if char_length(clean_body) = 0 then raise exception 'message cannot be empty'; end if;
  if not exists (
    select 1 from public.livekit_participants p
    where p.room_id = target_room_id and p.user_id = me and p.left_at is null
  ) then
    perform public.join_space(target_room_id);
  end if;
  insert into public.space_messages (room_id, user_id, body, message_type)
  values (target_room_id, me, clean_body, case when clean_body like '$%' then 'ticker' else 'text' end)
  returning id into message_id;
  return message_id;
end;
$$;

create or replace function public.end_space(target_room_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  update public.livekit_rooms
  set status = 'ended', is_active = false, ended_at = coalesce(ended_at, now()), updated_at = now()
  where id = target_room_id and host_id = auth.uid();
  if not found then raise exception 'space not found or not host'; end if;
  update public.livekit_participants
  set left_at = coalesce(left_at, now()), speaking = false, hand_raised = false, last_seen_at = now()
  where room_id = target_room_id and left_at is null;
  perform public.refresh_space_counts(target_room_id);
  return true;
end;
$$;

create or replace function public.follow_space(target_room_id uuid, p_follow boolean default true)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if coalesce(p_follow, true) then
    insert into public.space_follows (room_id, user_id)
    values (target_room_id, auth.uid())
    on conflict (room_id, user_id) do nothing;
  else
    delete from public.space_follows where room_id = target_room_id and user_id = auth.uid();
  end if;
  return true;
end;
$$;

create or replace function public.add_space_reaction(target_room_id uuid, p_emoji text default '🔥')
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  insert into public.space_reactions (room_id, user_id, emoji)
  values (target_room_id, auth.uid(), left(coalesce(nullif(trim(p_emoji), ''), '🔥'), 8));
  return true;
end;
$$;

grant execute on function public.create_space(text,text,text,text,timestamptz,boolean,text,text) to authenticated;
grant execute on function public.start_space(uuid) to authenticated;
grant execute on function public.join_space(uuid) to authenticated;
grant execute on function public.leave_space(uuid) to authenticated;
grant execute on function public.set_space_mute(uuid,boolean) to authenticated;
grant execute on function public.set_space_hand(uuid,boolean) to authenticated;
grant execute on function public.send_space_message(uuid,text) to authenticated;
grant execute on function public.end_space(uuid) to authenticated;
grant execute on function public.follow_space(uuid,boolean) to authenticated;
grant execute on function public.add_space_reaction(uuid,text) to authenticated;

alter table public.livekit_rooms enable row level security;
alter table public.livekit_participants enable row level security;
alter table public.space_messages enable row level security;
alter table public.space_reactions enable row level security;
alter table public.space_follows enable row level security;

drop policy if exists "Anyone can read public spaces" on public.livekit_rooms;
drop policy if exists "Hosts can update own spaces" on public.livekit_rooms;
drop policy if exists "Participants visible in spaces" on public.livekit_participants;
drop policy if exists "Users manage own space participant" on public.livekit_participants;
drop policy if exists "Anyone can read space messages" on public.space_messages;
drop policy if exists "Participants can write space messages" on public.space_messages;
drop policy if exists "Anyone can read space reactions" on public.space_reactions;
drop policy if exists "Users can add space reactions" on public.space_reactions;
drop policy if exists "Users manage own space follows" on public.space_follows;

create policy "Anyone can read public spaces" on public.livekit_rooms
  for select using (status <> 'cancelled');
create policy "Hosts can update own spaces" on public.livekit_rooms
  for update to authenticated using (host_id = auth.uid()) with check (host_id = auth.uid());

create policy "Participants visible in spaces" on public.livekit_participants
  for select using (true);
create policy "Users manage own space participant" on public.livekit_participants
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "Anyone can read space messages" on public.space_messages
  for select using (true);
create policy "Participants can write space messages" on public.space_messages
  for insert to authenticated with check (user_id = auth.uid());

create policy "Anyone can read space reactions" on public.space_reactions
  for select using (true);
create policy "Users can add space reactions" on public.space_reactions
  for insert to authenticated with check (user_id = auth.uid());

create policy "Users manage own space follows" on public.space_follows
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

alter publication supabase_realtime add table public.livekit_rooms;
alter publication supabase_realtime add table public.livekit_participants;
alter publication supabase_realtime add table public.space_messages;
alter publication supabase_realtime add table public.space_reactions;
