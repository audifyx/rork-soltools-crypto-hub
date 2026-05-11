-- Typing presence + last_seen helpers for DMs.

create table if not exists public.dm_typing (
  conversation_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  updated_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create index if not exists dm_typing_updated_idx
  on public.dm_typing(conversation_id, updated_at desc);

alter table public.dm_typing enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='dm_typing'
      and policyname='dm_typing_select_participants'
  ) then
    create policy dm_typing_select_participants on public.dm_typing
      for select using (
        exists (
          select 1 from public.dm_participants p
          where p.conversation_id = dm_typing.conversation_id
            and p.user_id = auth.uid()
        )
      );
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='dm_typing'
      and policyname='dm_typing_write_self'
  ) then
    create policy dm_typing_write_self on public.dm_typing
      for all using (user_id = auth.uid())
      with check (user_id = auth.uid());
  end if;
end $$;

create or replace function public.set_dm_typing(
  p_conversation_id uuid,
  p_typing boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then return; end if;
  if not exists (
    select 1 from public.dm_participants
    where conversation_id = p_conversation_id and user_id = auth.uid()
  ) then
    return;
  end if;

  if coalesce(p_typing, false) then
    insert into public.dm_typing(conversation_id, user_id, updated_at)
    values (p_conversation_id, auth.uid(), now())
    on conflict (conversation_id, user_id)
    do update set updated_at = now();
  else
    delete from public.dm_typing
    where conversation_id = p_conversation_id and user_id = auth.uid();
  end if;

  -- Touch presence too, since user is active.
  update public.profiles
    set last_seen_at = now(), is_online = true
    where user_id = auth.uid();
end;
$$;

create or replace function public.list_dm_typing(
  p_conversation_id uuid
)
returns table(
  user_id uuid,
  username text,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select t.user_id, p.username, t.updated_at
  from public.dm_typing t
  left join public.profiles p on p.user_id = t.user_id
  where t.conversation_id = p_conversation_id
    and t.user_id <> auth.uid()
    and t.updated_at > now() - interval '6 seconds'
    and exists (
      select 1 from public.dm_participants dp
      where dp.conversation_id = p_conversation_id
        and dp.user_id = auth.uid()
    );
$$;

grant execute on function public.set_dm_typing(uuid, boolean) to authenticated;
grant execute on function public.list_dm_typing(uuid) to authenticated;
