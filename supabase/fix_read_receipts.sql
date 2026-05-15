-- =====================================================================
-- Fix DM read receipts so the sender sees "Seen" instantly when the peer
-- opens the thread.
--
-- Root causes being fixed:
--   1. mark_dm_read() did not always stamp read_at on the individual
--      dm_messages rows, only the participant last_read_at.
--   2. list_dm_messages() returned only the literal dm_messages.read_at,
--      so older messages whose stamps were missed never lit up "Seen".
--   3. Realtime publication may not have included dm_participants, so
--      sender's thread never refetched when the peer marked the convo
--      read.
--   4. Some installs don't have the read_receipts_enabled column yet,
--      which made the RPC ERROR out and silently leave read_at NULL.
--
-- This migration is idempotent — safe to re-run.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Make sure required columns exist
-- ---------------------------------------------------------------------
alter table if exists public.dm_messages
  add column if not exists delivered_at timestamptz,
  add column if not exists read_at      timestamptz;

alter table if exists public.dm_participants
  add column if not exists last_read_at          timestamptz,
  add column if not exists read_receipts_enabled boolean not null default true,
  add column if not exists unread_count          integer not null default 0;

create index if not exists dm_messages_conv_read_idx
  on public.dm_messages (conversation_id, read_at)
  where read_at is null;

-- ---------------------------------------------------------------------
-- 2. Stamp delivered_at on every new message (only if column missing on row)
-- ---------------------------------------------------------------------
create or replace function public.dm_messages_stamp_delivered()
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

drop trigger if exists dm_messages_stamp_delivered_trg on public.dm_messages;
create trigger dm_messages_stamp_delivered_trg
  before insert on public.dm_messages
  for each row
  execute function public.dm_messages_stamp_delivered();

-- ---------------------------------------------------------------------
-- 3. mark_dm_read() — stamp read_at on every message from the other
--    party in the conversation, update participant cursor, zero unread.
--    Respects read_receipts_enabled (when off, still zeros unread but
--    does NOT stamp per-message read_at so the sender stays on
--    "Delivered").
-- ---------------------------------------------------------------------
drop function if exists public.mark_dm_read(uuid);

create or replace function public.mark_dm_read(p_conversation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  receipts_on boolean := true;
begin
  if uid is null then
    return false;
  end if;

  -- Caller must be a participant.
  if not exists (
    select 1 from public.dm_participants
     where conversation_id = p_conversation_id
       and user_id = uid
  ) then
    return false;
  end if;

  -- Always zero the caller's unread + bump last_read_at.
  update public.dm_participants
     set unread_count = 0,
         last_read_at = greatest(coalesce(last_read_at, 'epoch'::timestamptz), now())
   where conversation_id = p_conversation_id
     and user_id = uid;

  -- Look up the caller's read-receipt preference (default true).
  select coalesce(read_receipts_enabled, true) into receipts_on
    from public.dm_participants
   where conversation_id = p_conversation_id
     and user_id = uid;

  if receipts_on then
    update public.dm_messages
       set read_at = now()
     where conversation_id = p_conversation_id
       and sender_id <> uid
       and read_at is null
       and coalesce(deleted_at, 'epoch'::timestamptz) = 'epoch'::timestamptz;
  end if;

  return true;
end;
$$;

grant execute on function public.mark_dm_read(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 4. list_dm_messages() — project read_at, with a fallback computed
--    from the *other* participant's last_read_at so the sender sees
--    "Seen" even if the per-message stamp got skipped (e.g. legacy rows).
-- ---------------------------------------------------------------------
drop function if exists public.list_dm_messages(uuid[]);

create or replace function public.list_dm_messages(p_conversation_ids uuid[])
returns table (
  id              uuid,
  conversation_id uuid,
  sender_id       uuid,
  body            text,
  message_type    text,
  ticker          text,
  image_url       text,
  created_at      timestamptz,
  delivered_at    timestamptz,
  read_at         timestamptz,
  edited_at       timestamptz,
  deleted_at      timestamptz,
  reply_to        jsonb,
  reactions       jsonb
)
language sql
security definer
stable
set search_path = public
as $$
  with uid as (select auth.uid() as id),
  allowed as (
    select dp.conversation_id
      from public.dm_participants dp, uid
     where dp.user_id = uid.id
       and dp.conversation_id = any(coalesce(p_conversation_ids, '{}'::uuid[]))
  ),
  peer_cursor as (
    -- For each conversation, the *other* participant's last_read_at.
    -- If they have receipts disabled, return null so we don't fake "Seen".
    select dp.conversation_id,
           case when coalesce(dp.read_receipts_enabled, true)
                then dp.last_read_at
                else null
           end as last_read_at
      from public.dm_participants dp, uid
     where dp.conversation_id in (select conversation_id from allowed)
       and dp.user_id <> uid.id
  ),
  msgs as (
    select m.*
      from public.dm_messages m
      join allowed a on a.conversation_id = m.conversation_id
  ),
  reaction_rows as (
    select r.message_id,
           jsonb_agg(
             jsonb_build_object(
               'emoji', r.emoji,
               'count', r.cnt,
               'mine',  r.mine
             )
             order by r.emoji
           ) as reactions
      from (
        select message_id,
               emoji,
               count(*)::int as cnt,
               bool_or(user_id = (select id from uid)) as mine
          from public.dm_reactions
         where message_id in (select id from msgs)
         group by message_id, emoji
      ) r
     group by r.message_id
  )
  select m.id,
         m.conversation_id,
         m.sender_id,
         m.body,
         m.message_type,
         m.ticker,
         m.image_url,
         m.created_at,
         m.delivered_at,
         -- Effective read_at: the stamped value, else the peer's cursor
         -- if it is >= this message's created_at.
         coalesce(
           m.read_at,
           case
             when m.sender_id = (select id from uid)
              and pc.last_read_at is not null
              and pc.last_read_at >= m.created_at
             then pc.last_read_at
             else null
           end
         ) as read_at,
         m.edited_at,
         m.deleted_at,
         case
           when m.reply_to_id is null then null
           else (
             select jsonb_build_object(
                      'id',           rm.id,
                      'sender_id',    rm.sender_id,
                      'body',         rm.body,
                      'message_type', rm.message_type
                    )
               from public.dm_messages rm
              where rm.id = m.reply_to_id
           )
         end as reply_to,
         coalesce(rr.reactions, '[]'::jsonb) as reactions
    from msgs m
    left join peer_cursor   pc on pc.conversation_id = m.conversation_id
    left join reaction_rows rr on rr.message_id     = m.id
   order by m.created_at asc;
$$;

grant execute on function public.list_dm_messages(uuid[]) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Make sure realtime publishes both tables so the sender's thread
--    refetches when the peer's participant row updates.
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename  = 'dm_messages'
  ) then
    execute 'alter publication supabase_realtime add table public.dm_messages';
  end if;
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename  = 'dm_participants'
  ) then
    execute 'alter publication supabase_realtime add table public.dm_participants';
  end if;
exception when others then
  -- Publication may not exist in some local installs; ignore.
  null;
end;
$$;

-- Ensure UPDATE events ship the full row so the client sees read_at /
-- last_read_at without an extra fetch.
alter table public.dm_messages     replica identity full;
alter table public.dm_participants replica identity full;
