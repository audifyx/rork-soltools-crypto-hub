-- DM Messages: advanced features migration.
-- Adds reactions, replies, edits, soft-deletes, and delivery/read receipts.
-- Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. New columns on dm_messages
-- ---------------------------------------------------------------------------
alter table public.dm_messages
  add column if not exists reply_to_id  uuid references public.dm_messages(id) on delete set null;

alter table public.dm_messages
  add column if not exists edited_at    timestamptz;

alter table public.dm_messages
  add column if not exists deleted_at   timestamptz;

alter table public.dm_messages
  add column if not exists delivered_at timestamptz;

alter table public.dm_messages
  add column if not exists read_at      timestamptz;

create index if not exists dm_messages_reply_to_idx
  on public.dm_messages(reply_to_id)
  where reply_to_id is not null;

create index if not exists dm_messages_conv_created_idx
  on public.dm_messages(conversation_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 2. dm_reactions table
-- ---------------------------------------------------------------------------
create table if not exists public.dm_reactions (
  message_id uuid not null references public.dm_messages(id) on delete cascade,
  user_id    uuid not null references auth.users(id)         on delete cascade,
  emoji      text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

create index if not exists dm_reactions_message_idx
  on public.dm_reactions(message_id);

alter table public.dm_reactions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='dm_reactions'
      and policyname='dm_reactions_select_participants'
  ) then
    create policy dm_reactions_select_participants on public.dm_reactions
      for select using (
        exists (
          select 1 from public.dm_messages m
          join public.dm_participants p
            on p.conversation_id = m.conversation_id
          where m.id = dm_reactions.message_id
            and p.user_id = auth.uid()
        )
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='dm_reactions'
      and policyname='dm_reactions_write_self'
  ) then
    create policy dm_reactions_write_self on public.dm_reactions
      for all
      using (user_id = auth.uid())
      with check (user_id = auth.uid());
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. toggle_dm_reaction(message_id, emoji)
-- ---------------------------------------------------------------------------
create or replace function public.toggle_dm_reaction(
  p_message_id uuid,
  p_emoji text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  existing_row record;
begin
  if caller is null then
    raise exception 'not_authenticated';
  end if;

  -- Caller must be a participant in the conversation that owns this message.
  if not exists (
    select 1
    from public.dm_messages m
    join public.dm_participants p
      on p.conversation_id = m.conversation_id
    where m.id = p_message_id
      and p.user_id = caller
  ) then
    raise exception 'not_a_participant';
  end if;

  select * into existing_row
  from public.dm_reactions
  where message_id = p_message_id
    and user_id = caller
    and emoji = p_emoji;

  if found then
    delete from public.dm_reactions
    where message_id = p_message_id
      and user_id = caller
      and emoji = p_emoji;
    return false;
  end if;

  insert into public.dm_reactions(message_id, user_id, emoji)
  values (p_message_id, caller, p_emoji);
  return true;
end;
$$;

grant execute on function public.toggle_dm_reaction(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. edit_dm_message(message_id, body)
-- ---------------------------------------------------------------------------
create or replace function public.edit_dm_message(
  p_message_id uuid,
  p_body text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  trimmed text := nullif(btrim(p_body), '');
begin
  if caller is null then
    raise exception 'not_authenticated';
  end if;
  if trimmed is null then
    raise exception 'empty_body';
  end if;

  update public.dm_messages
     set body = trimmed,
         edited_at = now()
   where id = p_message_id
     and sender_id = caller
     and deleted_at is null
     and coalesce(message_type, 'text') in ('text', 'ticker');

  if not found then
    raise exception 'edit_not_allowed';
  end if;

  return true;
end;
$$;

grant execute on function public.edit_dm_message(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. delete_dm_message(message_id)  --  soft delete for everyone
-- ---------------------------------------------------------------------------
create or replace function public.delete_dm_message(
  p_message_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'not_authenticated';
  end if;

  update public.dm_messages
     set deleted_at = now(),
         body = null,
         image_url = null,
         ticker = null
   where id = p_message_id
     and sender_id = caller
     and deleted_at is null;

  if not found then
    raise exception 'delete_not_allowed';
  end if;

  delete from public.dm_reactions where message_id = p_message_id;

  return true;
end;
$$;

grant execute on function public.delete_dm_message(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. send_dm_message — extended to accept p_reply_to_id
-- ---------------------------------------------------------------------------
drop function if exists public.send_dm_message(uuid, text, text, text);
drop function if exists public.send_dm_message(uuid, text, text, text, uuid);

create or replace function public.send_dm_message(
  p_conversation_id uuid,
  p_body text,
  p_ticker text default null,
  p_image_url text default null,
  p_reply_to_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  inferred_type text;
  new_id uuid;
  reply_ok boolean;
begin
  if caller is null then
    raise exception 'not_authenticated';
  end if;

  if not exists (
    select 1 from public.dm_participants
    where conversation_id = p_conversation_id
      and user_id = caller
  ) then
    raise exception 'not_a_participant';
  end if;

  -- Reject sending if either side has blocked the other.
  if exists (
    select 1
    from public.dm_participants p1
    join public.dm_participants p2
      on p2.conversation_id = p1.conversation_id
    join public.user_blocks b
      on (b.blocker_id = p1.user_id and b.blocked_id = p2.user_id)
      or (b.blocker_id = p2.user_id and b.blocked_id = p1.user_id)
    where p1.conversation_id = p_conversation_id
      and p1.user_id = caller
      and p2.user_id <> caller
  ) then
    raise exception 'user_blocked';
  end if;

  if p_image_url is not null and length(p_image_url) > 0 then
    inferred_type := 'image';
  elsif p_ticker is not null and length(p_ticker) > 0 then
    inferred_type := 'ticker';
  else
    inferred_type := 'text';
  end if;

  if p_reply_to_id is not null then
    select exists (
      select 1 from public.dm_messages
      where id = p_reply_to_id
        and conversation_id = p_conversation_id
    ) into reply_ok;
    if not reply_ok then
      p_reply_to_id := null;
    end if;
  end if;

  insert into public.dm_messages(
    conversation_id,
    sender_id,
    body,
    message_type,
    ticker,
    image_url,
    reply_to_id,
    delivered_at
  ) values (
    p_conversation_id,
    caller,
    nullif(p_body, ''),
    inferred_type,
    nullif(p_ticker, ''),
    nullif(p_image_url, ''),
    p_reply_to_id,
    now()
  )
  returning id into new_id;

  -- Surface the conversation if previously hidden by either side.
  update public.dm_participants
     set hidden_at = null
   where conversation_id = p_conversation_id;

  return new_id;
end;
$$;

grant execute on function public.send_dm_message(uuid, text, text, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. list_dm_messages — now returns reply context, reactions, edits, soft-delete
-- ---------------------------------------------------------------------------
drop function if exists public.list_dm_messages(uuid[]);

create or replace function public.list_dm_messages(
  p_conversation_ids uuid[]
)
returns table (
  id              uuid,
  conversation_id uuid,
  sender_id       uuid,
  body            text,
  message_type    text,
  ticker          text,
  image_url       text,
  created_at      timestamptz,
  read            boolean,
  delivered_at    timestamptz,
  read_at         timestamptz,
  edited_at       timestamptz,
  deleted_at      timestamptz,
  reply_to        jsonb,
  reactions       jsonb
)
language sql
security definer
set search_path = public
as $$
  with allowed as (
    select unnest(p_conversation_ids) as conversation_id
    intersect
    select conversation_id from public.dm_participants
    where user_id = auth.uid()
  ),
  msgs as (
    select m.*
    from public.dm_messages m
    join allowed a on a.conversation_id = m.conversation_id
    order by m.created_at asc
    limit 4000
  ),
  reactions_agg as (
    select
      r.message_id,
      jsonb_agg(
        jsonb_build_object(
          'emoji', r.emoji,
          'count', r.count,
          'mine',  r.mine
        )
        order by r.count desc, r.emoji asc
      ) as reactions
    from (
      select
        message_id,
        emoji,
        count(*)::integer as count,
        bool_or(user_id = auth.uid()) as mine
      from public.dm_reactions
      where message_id in (select id from msgs)
      group by message_id, emoji
    ) r
    group by r.message_id
  )
  select
    m.id,
    m.conversation_id,
    m.sender_id,
    m.body,
    m.message_type,
    m.ticker,
    m.image_url,
    m.created_at,
    coalesce(m.read_at is not null, false) as read,
    m.delivered_at,
    m.read_at,
    m.edited_at,
    m.deleted_at,
    case
      when m.reply_to_id is null then null
      else (
        select jsonb_build_object(
          'id',           rm.id,
          'sender_id',    rm.sender_id,
          'body',         case when rm.deleted_at is not null then null else rm.body end,
          'message_type', rm.message_type
        )
        from public.dm_messages rm
        where rm.id = m.reply_to_id
      )
    end as reply_to,
    coalesce(ra.reactions, '[]'::jsonb) as reactions
  from msgs m
  left join reactions_agg ra on ra.message_id = m.id
  order by m.created_at asc;
$$;

grant execute on function public.list_dm_messages(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. mark_dm_read — also stamp read_at on incoming messages (idempotent rewrite)
-- ---------------------------------------------------------------------------
create or replace function public.mark_dm_read(p_conversation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    return false;
  end if;
  if not exists (
    select 1 from public.dm_participants
    where conversation_id = p_conversation_id and user_id = caller
  ) then
    return false;
  end if;

  update public.dm_messages
     set read_at = coalesce(read_at, now())
   where conversation_id = p_conversation_id
     and sender_id <> caller
     and read_at is null;

  update public.dm_participants
     set last_read_at = now()
   where conversation_id = p_conversation_id
     and user_id = caller;

  return true;
end;
$$;

grant execute on function public.mark_dm_read(uuid) to authenticated;
