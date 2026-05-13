-- =====================================================================
-- Presence (last_seen) + DM read receipts / delivery stamps
-- ---------------------------------------------------------------------
-- Idempotent migration. Safe to re-run.
--
-- Adds the columns and RPCs the mobile app expects so that:
--   • profile presence (is_online + last_seen_at) is real and updates
--     every 45s via the foreground heartbeat
--   • DM messages get a delivered_at stamp the moment they're inserted
--   • mark_dm_read stamps read_at on every unread message in the
--     conversation that wasn't sent by the caller, and resets the
--     participant unread_count to 0
--   • list_dm_messages keeps returning delivered_at / read_at / edited_at
--     / deleted_at / reply_to / reactions (so the Seen / Delivered / Sent
--     indicators light up)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Presence columns on profiles
-- ---------------------------------------------------------------------
alter table if exists public.profiles
  add column if not exists is_online      boolean       not null default false,
  add column if not exists last_seen_at   timestamptz   not null default now();

create index if not exists profiles_last_seen_idx
  on public.profiles (last_seen_at desc);

create index if not exists profiles_is_online_idx
  on public.profiles (is_online) where is_online = true;

-- ---------------------------------------------------------------------
-- 2. heartbeat() — call from the app every 30–60s while foreground
-- ---------------------------------------------------------------------
create or replace function public.heartbeat(set_status text default 'online')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  online boolean := lower(coalesce(set_status, 'online')) = 'online';
begin
  if uid is null then
    return;
  end if;
  update public.profiles
     set is_online    = online,
         last_seen_at = now()
   where user_id = uid;
end;
$$;

grant execute on function public.heartbeat(text) to authenticated;

-- ---------------------------------------------------------------------
-- 3. set_offline() — called on app background / unmount
-- ---------------------------------------------------------------------
create or replace function public.set_offline()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    return;
  end if;
  update public.profiles
     set is_online    = false,
         last_seen_at = now()
   where user_id = uid;
end;
$$;

grant execute on function public.set_offline() to authenticated;

-- ---------------------------------------------------------------------
-- 4. DM message delivery + read columns
-- ---------------------------------------------------------------------
alter table if exists public.dm_messages
  add column if not exists delivered_at timestamptz,
  add column if not exists read_at      timestamptz;

create index if not exists dm_messages_unread_idx
  on public.dm_messages (conversation_id, read_at)
  where read_at is null;

-- Stamp delivered_at automatically at insert time so every recipient
-- sees the double-check ("Delivered") as soon as the row hits the DB.
create or replace function public._dm_stamp_delivered()
returns trigger
language plpgsql
as $$
begin
  if new.delivered_at is null then
    new.delivered_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists _tg_dm_stamp_delivered on public.dm_messages;
create trigger _tg_dm_stamp_delivered
  before insert on public.dm_messages
  for each row execute function public._dm_stamp_delivered();

-- ---------------------------------------------------------------------
-- 5. mark_dm_read() — stamp read_at on every unread message from the
--    other side + zero the participant's unread_count.
--
--    Respects the recipient's read_receipts_enabled toggle on
--    dm_participants when that column exists (feature #5 in PLAN.md);
--    if the toggle is off we still zero unread_count locally but leave
--    read_at NULL so the sender doesn't see "Seen".
-- ---------------------------------------------------------------------
create or replace function public.mark_dm_read(p_conversation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  send_receipts boolean := true;
begin
  if uid is null or p_conversation_id is null then
    return false;
  end if;

  -- Must be a participant.
  if not exists (
    select 1 from public.dm_participants
     where conversation_id = p_conversation_id
       and user_id = uid
  ) then
    return false;
  end if;

  -- Honour the per-user read-receipts toggle if the column exists.
  begin
    select coalesce(read_receipts_enabled, true)
      into send_receipts
      from public.dm_participants
     where conversation_id = p_conversation_id
       and user_id = uid
     limit 1;
  exception when undefined_column then
    send_receipts := true;
  end;

  if send_receipts then
    update public.dm_messages
       set read_at = now()
     where conversation_id = p_conversation_id
       and sender_id <> uid
       and read_at is null;
  end if;

  update public.dm_participants
     set unread_count = 0,
         last_read_at = now()
   where conversation_id = p_conversation_id
     and user_id = uid;

  return true;
exception when undefined_column then
  -- Older dm_participants schema without last_read_at — fall back.
  update public.dm_participants
     set unread_count = 0
   where conversation_id = p_conversation_id
     and user_id = uid;
  return true;
end;
$$;

grant execute on function public.mark_dm_read(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 6. Realtime publication — make sure both tables stream changes so
--    the mobile app's postgres_changes channels fire instantly.
-- ---------------------------------------------------------------------
do $$
begin
  begin
    execute 'alter publication supabase_realtime add table public.dm_messages';
  exception when duplicate_object then null;
           when undefined_object then null;
  end;
  begin
    execute 'alter publication supabase_realtime add table public.profiles';
  exception when duplicate_object then null;
           when undefined_object then null;
  end;
end $$;
