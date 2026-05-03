-- SolTools Spaces full buildout: host controls, stage management, presence heartbeat,
-- participant removals, moderation blocks, count triggers, and list/detail RPC helpers.
-- Safe to run after 20260503_spaces_livekit.sql.

create extension if not exists pgcrypto;

alter table public.livekit_rooms add column if not exists is_private boolean not null default false;
alter table public.livekit_rooms add column if not exists captions_enabled boolean not null default false;
alter table public.livekit_rooms add column if not exists replay_url text;
alter table public.livekit_rooms add column if not exists share_slug text;
alter table public.livekit_rooms add column if not exists updated_at timestamptz not null default now();

update public.livekit_rooms
set share_slug = lower('space-' || left(replace(id::text, '-', ''), 12))
where share_slug is null or trim(share_slug) = '';

create unique index if not exists livekit_rooms_share_slug_key on public.livekit_rooms(share_slug) where share_slug is not null;
create index if not exists livekit_rooms_active_public_idx on public.livekit_rooms(is_active, is_private, started_at desc) where status = 'live';
create index if not exists livekit_rooms_category_status_idx on public.livekit_rooms(category, status, created_at desc);

alter table public.livekit_participants add column if not exists removed_at timestamptz;
alter table public.livekit_participants add column if not exists removed_by uuid references auth.users(id) on delete set null;
alter table public.livekit_participants add column if not exists removal_reason text;

create index if not exists livekit_participants_room_role_idx on public.livekit_participants(room_id, role, joined_at asc) where left_at is null;
create index if not exists livekit_participants_last_seen_idx on public.livekit_participants(room_id, last_seen_at desc) where left_at is null;

create table if not exists public.space_participant_blocks (
  room_id uuid not null references public.livekit_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  blocked_by uuid references auth.users(id) on delete set null,
  reason text,
  created_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create index if not exists space_participant_blocks_user_idx on public.space_participant_blocks(user_id, created_at desc);

create table if not exists public.space_reports (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.livekit_rooms(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  target_user_id uuid references auth.users(id) on delete set null,
  reason text not null default 'other',
  details text,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  constraint space_reports_status_check check (status in ('open','reviewing','resolved','dismissed')),
  constraint space_reports_reason_check check (char_length(trim(reason)) between 2 and 60)
);

create index if not exists space_reports_room_status_idx on public.space_reports(room_id, status, created_at desc);
create index if not exists space_reports_reporter_idx on public.space_reports(reporter_id, created_at desc);

create table if not exists public.space_invites (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.livekit_rooms(id) on delete cascade,
  invited_user_id uuid references auth.users(id) on delete cascade,
  invited_by uuid not null references auth.users(id) on delete cascade,
  role text not null default 'speaker',
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint space_invites_role_check check (role in ('co-host','speaker','listener')),
  constraint space_invites_status_check check (status in ('pending','accepted','declined','cancelled'))
);

create index if not exists space_invites_room_idx on public.space_invites(room_id, created_at desc);
create index if not exists space_invites_user_idx on public.space_invites(invited_user_id, status, created_at desc);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists livekit_rooms_touch_updated_at on public.livekit_rooms;
create trigger livekit_rooms_touch_updated_at
before update on public.livekit_rooms
for each row execute function public.touch_updated_at();

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
        where p.room_id = target_room_id and p.left_at is null and p.removed_at is null and p.role = 'listener'
      ), 0),
      speakers_count = coalesce((
        select count(*)::integer from public.livekit_participants p
        where p.room_id = target_room_id and p.left_at is null and p.removed_at is null and p.role in ('host','co-host','speaker')
      ), 0),
      raised_hands = coalesce((
        select count(*)::integer from public.livekit_participants p
        where p.room_id = target_room_id and p.left_at is null and p.removed_at is null and p.hand_raised = true
      ), 0),
      updated_at = now()
  where r.id = target_room_id;
end;
$$;

create or replace function public.refresh_space_counts_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_room uuid;
begin
  affected_room := coalesce(new.room_id, old.room_id);
  if affected_room is not null then
    perform public.refresh_space_counts(affected_room);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists livekit_participants_refresh_counts on public.livekit_participants;
create trigger livekit_participants_refresh_counts
after insert or update or delete on public.livekit_participants
for each row execute function public.refresh_space_counts_trigger();

create or replace function public.assert_space_host(target_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if not exists (
    select 1
    from public.livekit_rooms r
    where r.id = target_room_id and r.host_id = auth.uid()
  ) and not exists (
    select 1
    from public.livekit_participants p
    where p.room_id = target_room_id
      and p.user_id = auth.uid()
      and p.left_at is null
      and p.removed_at is null
      and p.role in ('host','co-host')
  ) then
    raise exception 'host access required';
  end if;
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
  if exists (select 1 from public.space_participant_blocks b where b.room_id = target_room_id and b.user_id = me) then
    raise exception 'you were removed from this Space';
  end if;

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
    set role = case when role in ('host','co-host','speaker') then role else wanted_role end,
        display_name = coalesce(profile_name, display_name),
        removed_at = null,
        removed_by = null,
        removal_reason = null,
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

create or replace function public.heartbeat_space_participant(target_room_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  update public.livekit_participants
  set last_seen_at = now(),
      left_at = null
  where room_id = target_room_id
    and user_id = auth.uid()
    and removed_at is null;

  if not found then
    perform public.join_space(target_room_id);
  end if;

  perform public.refresh_space_counts(target_room_id);
  return true;
end;
$$;

create or replace function public.set_space_participant_role(
  target_room_id uuid,
  target_participant_id uuid,
  p_role text
)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  clean_role text := lower(trim(coalesce(p_role, 'listener')));
  target_user uuid;
begin
  perform public.assert_space_host(target_room_id);

  if clean_role not in ('host','co-host','speaker','listener') then
    clean_role := 'listener';
  end if;

  select user_id into target_user
  from public.livekit_participants
  where id = target_participant_id and room_id = target_room_id
  limit 1;

  if target_user is null then
    raise exception 'participant not found';
  end if;

  update public.livekit_participants
  set role = clean_role,
      muted = case when clean_role = 'listener' then true else muted end,
      hand_raised = case when clean_role in ('host','co-host','speaker') then false else hand_raised end,
      speaking = case when clean_role = 'listener' then false else speaking end,
      last_seen_at = now()
  where id = target_participant_id
    and room_id = target_room_id
    and removed_at is null;

  if not found then raise exception 'participant not found'; end if;

  insert into public.space_messages (room_id, user_id, body, message_type, metadata)
  values (
    target_room_id,
    auth.uid(),
    case when clean_role = 'listener' then 'A speaker was moved back to the audience.' else 'A listener was brought on stage.' end,
    'system',
    jsonb_build_object('participant_id', target_participant_id, 'role', clean_role)
  );

  perform public.refresh_space_counts(target_room_id);
  return true;
end;
$$;

create or replace function public.remove_space_participant(
  target_room_id uuid,
  target_participant_id uuid,
  p_reason text default 'removed by host'
)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_user uuid;
begin
  perform public.assert_space_host(target_room_id);

  select user_id into target_user
  from public.livekit_participants
  where id = target_participant_id and room_id = target_room_id
  limit 1;

  if target_user is null then raise exception 'participant not found'; end if;
  if target_user = auth.uid() then raise exception 'hosts cannot remove themselves'; end if;

  insert into public.space_participant_blocks (room_id, user_id, blocked_by, reason)
  values (target_room_id, target_user, auth.uid(), left(trim(coalesce(p_reason, 'removed by host')), 280))
  on conflict (room_id, user_id) do update
    set blocked_by = excluded.blocked_by,
        reason = excluded.reason,
        created_at = now();

  update public.livekit_participants
  set removed_at = now(),
      removed_by = auth.uid(),
      removal_reason = left(trim(coalesce(p_reason, 'removed by host')), 280),
      left_at = now(),
      muted = true,
      speaking = false,
      hand_raised = false,
      last_seen_at = now()
  where id = target_participant_id and room_id = target_room_id;

  insert into public.space_messages (room_id, user_id, body, message_type, metadata)
  values (
    target_room_id,
    auth.uid(),
    'A participant was removed by the host.',
    'system',
    jsonb_build_object('participant_id', target_participant_id)
  );

  perform public.refresh_space_counts(target_room_id);
  return true;
end;
$$;

create or replace function public.unblock_space_participant(target_room_id uuid, target_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  perform public.assert_space_host(target_room_id);
  delete from public.space_participant_blocks
  where room_id = target_room_id and user_id = target_user_id;
  return true;
end;
$$;

create or replace function public.report_space(
  target_room_id uuid,
  target_user_id uuid default null,
  p_reason text default 'other',
  p_details text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  report_id uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;

  insert into public.space_reports (room_id, reporter_id, target_user_id, reason, details)
  values (
    target_room_id,
    auth.uid(),
    target_user_id,
    left(trim(coalesce(p_reason, 'other')), 60),
    nullif(left(trim(coalesce(p_details, '')), 1000), '')
  )
  returning id into report_id;

  return report_id;
end;
$$;

create or replace function public.cleanup_stale_space_participants(p_stale_after interval default interval '2 minutes')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  changed integer := 0;
begin
  update public.livekit_participants
  set left_at = now(), speaking = false, hand_raised = false
  where left_at is null
    and removed_at is null
    and last_seen_at < now() - p_stale_after;

  get diagnostics changed = row_count;
  return changed;
end;
$$;

create or replace function public.list_spaces(max_rows integer default 120)
returns table (
  id uuid,
  name text,
  topic text,
  description text,
  host_id uuid,
  community_id uuid,
  livekit_room_name text,
  status text,
  is_active boolean,
  is_private boolean,
  started_at timestamptz,
  ended_at timestamptz,
  scheduled_at timestamptz,
  category text,
  accent_a text,
  accent_b text,
  recording boolean,
  captions_enabled boolean,
  replay_url text,
  share_slug text,
  raised_hands integer,
  listeners_count integer,
  speakers_count integer,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = public, auth
as $$
  select
    r.id, r.name, r.topic, r.description, r.host_id, r.community_id, r.livekit_room_name,
    r.status, r.is_active, r.is_private, r.started_at, r.ended_at, r.scheduled_at,
    r.category, r.accent_a, r.accent_b, r.recording, r.captions_enabled, r.replay_url,
    r.share_slug, r.raised_hands, r.listeners_count, r.speakers_count, r.created_at, r.updated_at
  from public.livekit_rooms r
  where r.status <> 'cancelled'
    and (r.is_private = false or r.host_id = auth.uid())
  order by
    case when r.status = 'live' then 0 when r.status = 'scheduled' then 1 else 2 end,
    coalesce(r.started_at, r.scheduled_at, r.created_at) desc
  limit greatest(1, least(coalesce(max_rows, 120), 250));
$$;

create or replace function public.end_space(target_room_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  perform public.assert_space_host(target_room_id);

  update public.livekit_rooms
  set status = 'ended', is_active = false, ended_at = coalesce(ended_at, now()), updated_at = now()
  where id = target_room_id;

  update public.livekit_participants
  set left_at = coalesce(left_at, now()), speaking = false, hand_raised = false, last_seen_at = now()
  where room_id = target_room_id and left_at is null;

  perform public.refresh_space_counts(target_room_id);
  return true;
end;
$$;

grant execute on function public.assert_space_host(uuid) to authenticated;
grant execute on function public.heartbeat_space_participant(uuid) to authenticated;
grant execute on function public.set_space_participant_role(uuid,uuid,text) to authenticated;
grant execute on function public.remove_space_participant(uuid,uuid,text) to authenticated;
grant execute on function public.unblock_space_participant(uuid,uuid) to authenticated;
grant execute on function public.report_space(uuid,uuid,text,text) to authenticated;
grant execute on function public.cleanup_stale_space_participants(interval) to authenticated;
grant execute on function public.list_spaces(integer) to anon, authenticated;

alter table public.space_participant_blocks enable row level security;
alter table public.space_reports enable row level security;
alter table public.space_invites enable row level security;

drop policy if exists "Space blocks visible to hosts and blocked users" on public.space_participant_blocks;
drop policy if exists "Hosts manage space blocks" on public.space_participant_blocks;
drop policy if exists "Users create space reports" on public.space_reports;
drop policy if exists "Users read own space reports" on public.space_reports;
drop policy if exists "Space invites visible to invited users and hosts" on public.space_invites;
drop policy if exists "Hosts manage space invites" on public.space_invites;
drop policy if exists "Invited users update own invite" on public.space_invites;

create policy "Space blocks visible to hosts and blocked users" on public.space_participant_blocks
  for select using (
    user_id = auth.uid()
    or exists (select 1 from public.livekit_rooms r where r.id = room_id and r.host_id = auth.uid())
    or exists (select 1 from public.livekit_participants p where p.room_id = room_id and p.user_id = auth.uid() and p.role in ('host','co-host') and p.left_at is null)
  );

create policy "Hosts manage space blocks" on public.space_participant_blocks
  for all to authenticated using (
    exists (select 1 from public.livekit_rooms r where r.id = room_id and r.host_id = auth.uid())
    or exists (select 1 from public.livekit_participants p where p.room_id = room_id and p.user_id = auth.uid() and p.role in ('host','co-host') and p.left_at is null)
  ) with check (
    exists (select 1 from public.livekit_rooms r where r.id = room_id and r.host_id = auth.uid())
    or exists (select 1 from public.livekit_participants p where p.room_id = room_id and p.user_id = auth.uid() and p.role in ('host','co-host') and p.left_at is null)
  );

create policy "Users create space reports" on public.space_reports
  for insert to authenticated with check (reporter_id = auth.uid());

create policy "Users read own space reports" on public.space_reports
  for select to authenticated using (
    reporter_id = auth.uid()
    or exists (select 1 from public.livekit_rooms r where r.id = room_id and r.host_id = auth.uid())
  );

create policy "Space invites visible to invited users and hosts" on public.space_invites
  for select to authenticated using (
    invited_user_id = auth.uid()
    or invited_by = auth.uid()
    or exists (select 1 from public.livekit_rooms r where r.id = room_id and r.host_id = auth.uid())
  );

create policy "Hosts manage space invites" on public.space_invites
  for insert to authenticated with check (
    invited_by = auth.uid()
    and (
      exists (select 1 from public.livekit_rooms r where r.id = room_id and r.host_id = auth.uid())
      or exists (select 1 from public.livekit_participants p where p.room_id = room_id and p.user_id = auth.uid() and p.role in ('host','co-host') and p.left_at is null)
    )
  );

create policy "Invited users update own invite" on public.space_invites
  for update to authenticated using (invited_user_id = auth.uid() or invited_by = auth.uid())
  with check (invited_user_id = auth.uid() or invited_by = auth.uid());

-- Realtime publication additions can fail if already added; run manually if your SQL editor blocks DO statements.
do $$
begin
  begin alter publication supabase_realtime add table public.space_participant_blocks; exception when others then null; end;
  begin alter publication supabase_realtime add table public.space_reports; exception when others then null; end;
  begin alter publication supabase_realtime add table public.space_invites; exception when others then null; end;
end $$;
