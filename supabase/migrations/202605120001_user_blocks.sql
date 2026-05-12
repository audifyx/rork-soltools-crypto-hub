-- Blocked users: a single user_blocks table with RLS, plus RPCs that block,
-- unblock, and list. Blocking auto-unfollows both directions and hides any
-- shared DM conversation so neither side can see history or send messages.

create table if not exists public.user_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  reason     text,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index if not exists user_blocks_blocker_idx on public.user_blocks(blocker_id);
create index if not exists user_blocks_blocked_idx on public.user_blocks(blocked_id);

alter table public.user_blocks enable row level security;

drop policy if exists "user_blocks_select_own" on public.user_blocks;
create policy "user_blocks_select_own" on public.user_blocks
  for select to authenticated
  using (blocker_id = auth.uid() or blocked_id = auth.uid());

drop policy if exists "user_blocks_insert_own" on public.user_blocks;
create policy "user_blocks_insert_own" on public.user_blocks
  for insert to authenticated
  with check (blocker_id = auth.uid());

drop policy if exists "user_blocks_delete_own" on public.user_blocks;
create policy "user_blocks_delete_own" on public.user_blocks
  for delete to authenticated
  using (blocker_id = auth.uid());

-- ---------------------------------------------------------------------------
-- block_dm_user(p_blocked_id, p_reason)
-- ---------------------------------------------------------------------------
create or replace function public.block_dm_user(
  p_blocked_id uuid,
  p_reason text default null
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
  if p_blocked_id is null or p_blocked_id = caller then
    raise exception 'invalid_target';
  end if;

  insert into public.user_blocks (blocker_id, blocked_id, reason)
  values (caller, p_blocked_id, p_reason)
  on conflict (blocker_id, blocked_id) do update set reason = excluded.reason;

  -- Unfollow both directions if the followers table exists.
  begin
    delete from public.followers
     where (follower_id = caller and following_id = p_blocked_id)
        or (follower_id = p_blocked_id and following_id = caller);
  exception when undefined_table then null;
  end;

  -- Cancel any pending follow requests in either direction.
  begin
    delete from public.follow_requests
     where (requester_id = caller and target_id = p_blocked_id)
        or (requester_id = p_blocked_id and target_id = caller);
  exception when undefined_table then null;
  end;

  -- Hide every shared DM conversation for both participants.
  begin
    update public.dm_participants
       set hidden_at = now()
     where conversation_id in (
       select dp1.conversation_id
         from public.dm_participants dp1
         join public.dm_participants dp2
           on dp1.conversation_id = dp2.conversation_id
        where dp1.user_id = caller
          and dp2.user_id = p_blocked_id
     );
  exception when undefined_table then null;
  end;

  return true;
end;
$$;

grant execute on function public.block_dm_user(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- unblock_dm_user(p_blocked_id)
-- ---------------------------------------------------------------------------
create or replace function public.unblock_dm_user(p_blocked_id uuid)
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
  delete from public.user_blocks
   where blocker_id = caller and blocked_id = p_blocked_id;
  return true;
end;
$$;

grant execute on function public.unblock_dm_user(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- list_blocked_users() — rich row for the management UI.
-- ---------------------------------------------------------------------------
create or replace function public.list_blocked_users()
returns table (
  blocked_id   uuid,
  username     text,
  display_name text,
  avatar_url   text,
  avatar_color text,
  verified     boolean,
  bio          text,
  reason       text,
  created_at   timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    b.blocked_id,
    p.username,
    p.display_name,
    p.avatar_url,
    p.avatar_color,
    coalesce(p.verified, false) as verified,
    p.bio,
    b.reason,
    b.created_at
  from public.user_blocks b
  left join public.profiles p
    on p.user_id = b.blocked_id or p.id = b.blocked_id
  where b.blocker_id = auth.uid()
  order by b.created_at desc;
$$;

grant execute on function public.list_blocked_users() to authenticated;

-- ---------------------------------------------------------------------------
-- is_user_blocked(p_other_id) — true if either direction is blocked.
-- ---------------------------------------------------------------------------
create or replace function public.is_user_blocked(p_other_id uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_blocks
     where (blocker_id = auth.uid() and blocked_id = p_other_id)
        or (blocker_id = p_other_id and blocked_id = auth.uid())
  );
$$;

grant execute on function public.is_user_blocked(uuid) to authenticated;
