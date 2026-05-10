-- Spaces voice rooms: LiveKit-backed social rooms, participants, chat, reactions.
-- Idempotent migration so the Spaces feature has real tables/RPCs behind the app UI.

create extension if not exists pgcrypto;

create table if not exists public.livekit_rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  topic text default 'ALPHA',
  description text,
  host_id uuid not null default auth.uid(),
  community_id uuid,
  livekit_room_name text not null unique,
  status text not null default 'scheduled' check (status in ('scheduled', 'live', 'ended', 'cancelled')),
  is_active boolean not null default false,
  started_at timestamptz,
  ended_at timestamptz,
  scheduled_at timestamptz,
  category text not null default 'alpha',
  accent_a text default '#F4C65B',
  accent_b text default '#55F5B2',
  recording boolean not null default false,
  raised_hands integer not null default 0,
  listeners_count integer not null default 0,
  speakers_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.livekit_participants (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.livekit_rooms(id) on delete cascade,
  user_id uuid not null,
  identity text not null,
  display_name text,
  role text not null default 'listener' check (role in ('host', 'co-host', 'speaker', 'listener')),
  muted boolean not null default true,
  hand_raised boolean not null default false,
  speaking boolean not null default false,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  last_seen_at timestamptz not null default now(),
  unique(room_id, user_id)
);

create table if not exists public.space_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.livekit_rooms(id) on delete cascade,
  user_id uuid not null,
  body text not null,
  message_type text not null default 'text' check (message_type in ('text', 'system', 'ticker', 'reaction')),
  created_at timestamptz not null default now()
);

create table if not exists public.space_reactions (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.livekit_rooms(id) on delete cascade,
  user_id uuid not null,
  emoji text not null default '🔥',
  created_at timestamptz not null default now()
);

create table if not exists public.space_follows (
  room_id uuid not null references public.livekit_rooms(id) on delete cascade,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key(room_id, user_id)
);

create index if not exists livekit_rooms_status_started_idx on public.livekit_rooms(status, started_at desc nulls last);
create index if not exists livekit_rooms_created_idx on public.livekit_rooms(created_at desc);
create index if not exists livekit_participants_room_active_idx on public.livekit_participants(room_id, left_at, joined_at);
create index if not exists space_messages_room_created_idx on public.space_messages(room_id, created_at);

alter table public.livekit_rooms enable row level security;
alter table public.livekit_participants enable row level security;
alter table public.space_messages enable row level security;
alter table public.space_reactions enable row level security;
alter table public.space_follows enable row level security;

drop policy if exists "read livekit rooms" on public.livekit_rooms;
drop policy if exists "read livekit participants" on public.livekit_participants;
drop policy if exists "read space messages" on public.space_messages;
drop policy if exists "read space reactions" on public.space_reactions;
drop policy if exists "read own space follows" on public.space_follows;

create policy "read livekit rooms" on public.livekit_rooms for select using (true);
create policy "read livekit participants" on public.livekit_participants for select using (true);
create policy "read space messages" on public.space_messages for select using (true);
create policy "read space reactions" on public.space_reactions for select using (true);
create policy "read own space follows" on public.space_follows for select using (auth.uid() = user_id);

create or replace function public.refresh_space_counts(target_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.livekit_rooms r
  set
    speakers_count = coalesce((select count(*) from public.livekit_participants p where p.room_id = target_room_id and p.left_at is null and p.role in ('host','co-host','speaker')), 0),
    listeners_count = coalesce((select count(*) from public.livekit_participants p where p.room_id = target_room_id and p.left_at is null and p.role = 'listener'), 0),
    raised_hands = coalesce((select count(*) from public.livekit_participants p where p.room_id = target_room_id and p.left_at is null and p.hand_raised), 0),
    updated_at = now()
  where r.id = target_room_id;
end;
$$;

create or replace function public.create_space(
  p_name text,
  p_topic text default 'ALPHA',
  p_description text default '',
  p_category text default 'alpha',
  p_scheduled_at timestamptz default null,
  p_recording boolean default false,
  p_accent_a text default '#F4C65B',
  p_accent_b text default '#55F5B2'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  created_id uuid;
  room_name text;
begin
  if auth.uid() is null then raise exception 'Sign in to start a Space.'; end if;
  if length(trim(coalesce(p_name, ''))) < 3 then raise exception 'Give your Space a stronger title.'; end if;

  created_id := gen_random_uuid();
  room_name := 'space-' || replace(created_id::text, '-', '');

  insert into public.livekit_rooms(id, name, topic, description, host_id, livekit_room_name, status, is_active, started_at, scheduled_at, category, recording, accent_a, accent_b)
  values (
    created_id,
    trim(p_name),
    upper(left(coalesce(nullif(trim(p_topic), ''), 'ALPHA'), 28)),
    left(coalesce(p_description, ''), 500),
    auth.uid(),
    room_name,
    case when p_scheduled_at is null then 'live' else 'scheduled' end,
    p_scheduled_at is null,
    case when p_scheduled_at is null then now() else null end,
    p_scheduled_at,
    coalesce(nullif(p_category, ''), 'alpha'),
    coalesce(p_recording, false),
    coalesce(p_accent_a, '#F4C65B'),
    coalesce(p_accent_b, '#55F5B2')
  );

  insert into public.livekit_participants(room_id, user_id, identity, display_name, role, muted, hand_raised, speaking)
  values (created_id, auth.uid(), auth.uid()::text, 'Host', 'host', false, false, false)
  on conflict (room_id, user_id) do update set left_at = null, role = 'host', muted = false, last_seen_at = now();

  perform public.refresh_space_counts(created_id);
  return created_id;
end;
$$;

create or replace function public.start_space(target_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'Sign in to start this Space.'; end if;
  update public.livekit_rooms
  set status = 'live', is_active = true, started_at = coalesce(started_at, now()), ended_at = null, updated_at = now()
  where id = target_room_id and host_id = auth.uid();
  if not found then raise exception 'Only the host can start this Space.'; end if;
end;
$$;

create or replace function public.join_space(target_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  host uuid;
begin
  if auth.uid() is null then raise exception 'Sign in to join Spaces.'; end if;
  select host_id into host from public.livekit_rooms where id = target_room_id and status <> 'ended';
  if host is null then raise exception 'Space is not available.'; end if;

  insert into public.livekit_participants(room_id, user_id, identity, display_name, role, muted, hand_raised, speaking, left_at, last_seen_at)
  values (target_room_id, auth.uid(), auth.uid()::text, 'Trader', case when host = auth.uid() then 'host' else 'listener' end, true, false, false, null, now())
  on conflict (room_id, user_id) do update set left_at = null, last_seen_at = now(), role = case when livekit_participants.user_id = host then 'host' else livekit_participants.role end;

  perform public.refresh_space_counts(target_room_id);
end;
$$;

create or replace function public.leave_space(target_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.livekit_participants set left_at = now(), speaking = false, hand_raised = false, last_seen_at = now()
  where room_id = target_room_id and user_id = auth.uid();
  perform public.refresh_space_counts(target_room_id);
end;
$$;

create or replace function public.set_space_mute(target_room_id uuid, p_muted boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.livekit_participants
  set muted = coalesce(p_muted, true), speaking = not coalesce(p_muted, true), last_seen_at = now()
  where room_id = target_room_id and user_id = auth.uid() and left_at is null and role in ('host','co-host','speaker');
  if not found then raise exception 'Raise your hand and wait for speaker access.'; end if;
end;
$$;

create or replace function public.set_space_hand(target_room_id uuid, p_raised boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.livekit_participants
  set hand_raised = coalesce(p_raised, false), last_seen_at = now()
  where room_id = target_room_id and user_id = auth.uid() and left_at is null;
  perform public.refresh_space_counts(target_room_id);
end;
$$;

create or replace function public.set_space_participant_role(target_room_id uuid, target_participant_id uuid, p_role text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.livekit_rooms where id = target_room_id and host_id = auth.uid()) then
    raise exception 'Only hosts can manage the stage.';
  end if;
  update public.livekit_participants
  set role = case when p_role in ('host','co-host','speaker','listener') then p_role else 'listener' end,
      hand_raised = false,
      muted = case when p_role in ('host','co-host','speaker') then muted else true end,
      last_seen_at = now()
  where id = target_participant_id and room_id = target_room_id;
  perform public.refresh_space_counts(target_room_id);
end;
$$;

create or replace function public.remove_space_participant(target_room_id uuid, target_participant_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.livekit_rooms where id = target_room_id and host_id = auth.uid()) then
    raise exception 'Only hosts can remove listeners.';
  end if;
  update public.livekit_participants set left_at = now(), speaking = false, hand_raised = false where id = target_participant_id and room_id = target_room_id;
  perform public.refresh_space_counts(target_room_id);
end;
$$;

create or replace function public.heartbeat_space_participant(target_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.livekit_participants set last_seen_at = now() where room_id = target_room_id and user_id = auth.uid() and left_at is null;
end;
$$;

create or replace function public.send_space_message(target_room_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare created_id uuid;
begin
  if auth.uid() is null then raise exception 'Sign in to chat in Spaces.'; end if;
  if length(trim(coalesce(p_body, ''))) = 0 then return null; end if;
  insert into public.space_messages(room_id, user_id, body, message_type)
  values (target_room_id, auth.uid(), left(trim(p_body), 1000), case when trim(p_body) ~ '^[$#][A-Za-z0-9_]+' then 'ticker' else 'text' end)
  returning id into created_id;
  return created_id;
end;
$$;

create or replace function public.add_space_reaction(target_room_id uuid, p_emoji text default '🔥')
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.space_reactions(room_id, user_id, emoji) values (target_room_id, auth.uid(), left(coalesce(p_emoji, '🔥'), 8));
  insert into public.space_messages(room_id, user_id, body, message_type) values (target_room_id, auth.uid(), left(coalesce(p_emoji, '🔥'), 8), 'reaction');
end;
$$;

create or replace function public.end_space(target_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.livekit_rooms set status = 'ended', is_active = false, ended_at = now(), updated_at = now()
  where id = target_room_id and host_id = auth.uid();
  if not found then raise exception 'Only the host can end this Space.'; end if;
  update public.livekit_participants set left_at = coalesce(left_at, now()), speaking = false where room_id = target_room_id;
  perform public.refresh_space_counts(target_room_id);
end;
$$;

create or replace function public.follow_space(target_room_id uuid, p_follow boolean default true)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return; end if;
  if coalesce(p_follow, true) then
    insert into public.space_follows(room_id, user_id) values (target_room_id, auth.uid()) on conflict do nothing;
  else
    delete from public.space_follows where room_id = target_room_id and user_id = auth.uid();
  end if;
end;
$$;
