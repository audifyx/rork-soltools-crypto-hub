-- Adds an RPC to delete a DM conversation for both participants. Each
-- participant's `hidden_at` is stamped and all messages are removed so
-- nobody can re-open the thread or see the old history.
create or replace function public.delete_dm_for_everyone(p_conversation_id uuid)
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

  -- Caller must be a participant in this conversation.
  if not exists (
    select 1
    from public.dm_participants
    where conversation_id = p_conversation_id
      and user_id = caller
  ) then
    raise exception 'not_a_participant';
  end if;

  -- Wipe all messages so neither side can see history again.
  delete from public.dm_messages
  where conversation_id = p_conversation_id;

  -- Hide the conversation for every participant.
  update public.dm_participants
     set hidden_at = now()
   where conversation_id = p_conversation_id;

  return true;
end;
$$;

grant execute on function public.delete_dm_for_everyone(uuid) to authenticated;
