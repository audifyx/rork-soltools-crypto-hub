-- =============================================================================
-- Blocking System (DM + follow + content visibility)
-- =============================================================================
-- Idempotent migration that fully wires user-to-user blocking:
--   * `user_blocks` table (acts as the source of truth used by RPCs and RLS)
--   * `block_dm_user(p_blocked_id, p_reason)` RPC
--   * `unblock_dm_user(p_blocked_id)` RPC
--   * `list_blocked_users()` RPC returning enriched profile rows
--   * `is_blocked_between(a, b)` helper used by other RPCs
--   * On block: removes follows in both directions and hides DM thread for the
--     blocker (so the blocker stops seeing the user in conversations).
--   * RLS for the table itself.
-- =============================================================================

begin;

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
create table if not exists public.user_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  reason text,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_no_self check (blocker_id <> blocked_id)
);

create index if not exists user_blocks_blocker_idx on public.user_blocks(blocker_id);
create index if not exists user_blocks_blocked_idx on public.user_blocks(blocked_id);

alter table public.user_blocks enable row level security;

drop policy if exists "user_blocks self read" on public.user_blocks;
create policy "user_blocks self read" on public.user_blocks
  for select using (auth.uid() = blocker_id);

drop policy if exists "user_blocks insert own" on public.user_blocks;
create policy "user_blocks insert own" on public.user_blocks
  for insert with check (auth.uid() = blocker_id);

drop policy if exists "user_blocks delete own" on public.user_blocks;
create policy "user_blocks delete own" on public.user_blocks
  for delete using (auth.uid() = blocker_id);

-- ---------------------------------------------------------------------------
-- Helper: are two users blocking each other in any direction?
-- ---------------------------------------------------------------------------
create or replace function public.is_blocked_between(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists(
    select 1 from public.user_blocks
    where (blocker_id = p_a and blocked_id = p_b)
       or (blocker_id = p_b and blocked_id = p_a)
  );
$$;

grant execute on function public.is_blocked_between(uuid, uuid) to authenticated, anon;

-- ---------------------------------------------------------------------------
-- RPC: block_dm_user
-- ---------------------------------------------------------------------------
create or replace function public.block_dm_user(
  p_blocked_id uuid,
  p_reason text default 'user_blocked'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'auth required' using errcode = '42501';
  end if;
  if p_blocked_id is null then
    raise exception 'p_blocked_id required' using errcode = '22023';
  end if;
  if v_me = p_blocked_id then
    raise exception 'cannot block yourself' using errcode = '22023';
  end if;

  insert into public.user_blocks (blocker_id, blocked_id, reason)
  values (v_me, p_blocked_id, nullif(p_reason, ''))
  on conflict (blocker_id, blocked_id)
    do update set reason = excluded.reason, created_at = now();

  -- Best-effort cleanup of social graph in both directions.
  begin
    delete from public.follows
    where (follower_id = v_me and following_id = p_blocked_id)
       or (follower_id = p_blocked_id and following_id = v_me);
  exception when undefined_table then null;
  end;

  begin
    delete from public.follow_requests
    where (requester_id = v_me and target_id = p_blocked_id)
       or (requester_id = p_blocked_id and target_id = v_me);
  exception when undefined_table then null;
  end;

  -- Hide any DM conversation between the two users for the blocker so they
  -- stop seeing the chat in their inbox.
  begin
    update public.dm_participants p
       set hidden_at = now()
     where p.user_id = v_me
       and p.conversation_id in (
         select conversation_id
           from public.dm_participants
          group by conversation_id
         having bool_or(user_id = v_me) and bool_or(user_id = p_blocked_id)
       );
  exception when undefined_table then null;
  end;
end;
$$;

grant execute on function public.block_dm_user(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: unblock_dm_user
-- ---------------------------------------------------------------------------
create or replace function public.unblock_dm_user(p_blocked_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    raise exception 'auth required' using errcode = '42501';
  end if;
  if p_blocked_id is null then
    raise exception 'p_blocked_id required' using errcode = '22023';
  end if;

  delete from public.user_blocks
   where blocker_id = v_me and blocked_id = p_blocked_id;
end;
$$;

grant execute on function public.unblock_dm_user(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: list_blocked_users
-- ---------------------------------------------------------------------------
create or replace function public.list_blocked_users()
returns table (
  blocked_id uuid,
  username text,
  display_name text,
  avatar_url text,
  avatar_color text,
  verified boolean,
  bio text,
  reason text,
  created_at timestamptz
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
  left join public.profiles p on p.user_id = b.blocked_id
  where b.blocker_id = auth.uid()
  order by b.created_at desc;
$$;

grant execute on function public.list_blocked_users() to authenticated;

commit;
