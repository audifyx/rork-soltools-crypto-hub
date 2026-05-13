-- =====================================================================
-- list_dm_messages() — rebuild so it projects read_at / delivered_at /
-- edited_at / deleted_at / reply_to / reactions out to the client.
-- ---------------------------------------------------------------------
-- Without these fields the DM bubble can never light up "Seen" because
-- the row coming back to the client has no read_at, even though
-- mark_dm_read() stamps it on the table.
--
-- Idempotent. Safe to re-run.
-- =====================================================================

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
  with allowed as (
    select dp.conversation_id
      from public.dm_participants dp
     where dp.user_id = auth.uid()
       and dp.conversation_id = any(coalesce(p_conversation_ids, '{}'::uuid[]))
  ),
  msgs as (
    select m.*
      from public.dm_messages m
      join allowed a on a.conversation_id = m.conversation_id
  ),
  reaction_rows as (
    select
      r.message_id,
      jsonb_agg(
        jsonb_build_object(
          'emoji', r.emoji,
          'count', r.cnt,
          'mine',  r.mine
        )
        order by r.emoji
      ) as reactions
    from (
      select
        message_id,
        emoji,
        count(*)::int                                       as cnt,
        bool_or(user_id = auth.uid())                       as mine
      from public.dm_message_reactions
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
    coalesce(m.message_type, 'text')                        as message_type,
    m.ticker,
    m.image_url,
    m.created_at,
    m.delivered_at,
    m.read_at,
    m.edited_at,
    m.deleted_at,
    case
      when m.reply_to is not null then (
        select jsonb_build_object(
          'id',           r.id,
          'sender_id',    r.sender_id,
          'body',         r.body,
          'message_type', coalesce(r.message_type, 'text')
        )
        from public.dm_messages r
        where r.id = m.reply_to
      )
      else null
    end                                                     as reply_to,
    coalesce(rr.reactions, '[]'::jsonb)                     as reactions
  from msgs m
  left join reaction_rows rr on rr.message_id = m.id
  order by m.created_at asc;
$$;

grant execute on function public.list_dm_messages(uuid[]) to authenticated;
