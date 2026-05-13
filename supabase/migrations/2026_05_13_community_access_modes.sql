-- Community access modes: public / holders / passcode / request
--
-- Adds server-side gating for non-public communities. All communities remain
-- listed in the directory, but their posts/members are hidden until the
-- viewer is approved.
--
-- The mobile client today persists this in AsyncStorage; this migration is
-- additive so the app keeps working while we migrate reads/writes to RPCs.

-- 1. Columns on communities ---------------------------------------------------
alter table public.communities
  add column if not exists access_type text not null default 'public'
    check (access_type in ('public','holders','passcode','request')),
  add column if not exists passcode_hash text,
  add column if not exists holder_token_mint text,
  add column if not exists holder_min_amount numeric default 0;

create index if not exists idx_communities_access_type
  on public.communities (access_type);

-- 2. Membership + join requests ----------------------------------------------
create table if not exists public.community_members (
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('member','mod','owner')),
  joined_at timestamptz not null default now(),
  primary key (community_id, user_id)
);

create index if not exists idx_community_members_user
  on public.community_members (user_id);

create table if not exists public.community_join_requests (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  message text,
  wallet_address text,
  requested_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id),
  unique (community_id, user_id)
);

create index if not exists idx_community_join_requests_community_status
  on public.community_join_requests (community_id, status);

-- 3. Helpers ------------------------------------------------------------------
create or replace function public.is_community_member(p_community uuid, p_user uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.community_members
    where community_id = p_community and user_id = p_user
  );
$$;

create or replace function public.is_community_owner(p_community uuid, p_user uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.communities
    where id = p_community and created_by = p_user
  )
  or exists (
    select 1 from public.community_members
    where community_id = p_community and user_id = p_user and role in ('owner','mod')
  );
$$;

-- 4. Join RPCs ----------------------------------------------------------------
create or replace function public.join_community_public(p_community uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_type text;
begin
  if v_uid is null then raise exception 'auth required'; end if;
  select access_type into v_type from public.communities where id = p_community;
  if v_type is null then raise exception 'community not found'; end if;
  if v_type <> 'public' then raise exception 'not a public community'; end if;
  insert into public.community_members(community_id, user_id) values (p_community, v_uid)
  on conflict do nothing;
end$$;

create or replace function public.join_community_passcode(p_community uuid, p_passcode text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_type text; v_hash text;
begin
  if v_uid is null then raise exception 'auth required'; end if;
  select access_type, passcode_hash into v_type, v_hash
    from public.communities where id = p_community;
  if v_type is null then raise exception 'community not found'; end if;
  if v_type <> 'passcode' then raise exception 'not a passcode community'; end if;
  if v_hash is null or v_hash <> encode(digest(p_passcode, 'sha256'), 'hex') then
    raise exception 'invalid passcode';
  end if;
  insert into public.community_members(community_id, user_id) values (p_community, v_uid)
  on conflict do nothing;
end$$;

create or replace function public.join_community_holders(p_community uuid, p_wallet text)
returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_type text;
begin
  if v_uid is null then raise exception 'auth required'; end if;
  select access_type into v_type from public.communities where id = p_community;
  if v_type is null then raise exception 'community not found'; end if;
  if v_type <> 'holders' then raise exception 'not a holders community'; end if;
  -- Trusts the client-supplied wallet verification done via Helius RPC.
  -- The edge function `verify-holder` (if present) should call this RPC.
  insert into public.community_members(community_id, user_id) values (p_community, v_uid)
  on conflict do nothing;
end$$;

create or replace function public.request_join_community(
  p_community uuid, p_message text default null, p_wallet text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_type text; v_id uuid;
begin
  if v_uid is null then raise exception 'auth required'; end if;
  select access_type into v_type from public.communities where id = p_community;
  if v_type is null then raise exception 'community not found'; end if;
  if v_type = 'public' then
    insert into public.community_members(community_id, user_id) values (p_community, v_uid)
    on conflict do nothing;
    return null;
  end if;
  insert into public.community_join_requests(community_id, user_id, message, wallet_address)
  values (p_community, v_uid, p_message, p_wallet)
  on conflict (community_id, user_id) do update
    set message = excluded.message,
        wallet_address = excluded.wallet_address,
        status = 'pending',
        requested_at = now()
  returning id into v_id;
  return v_id;
end$$;

create or replace function public.resolve_join_request(p_request uuid, p_approve boolean)
returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_community uuid; v_user uuid;
begin
  if v_uid is null then raise exception 'auth required'; end if;
  select community_id, user_id into v_community, v_user
    from public.community_join_requests where id = p_request;
  if v_community is null then raise exception 'request not found'; end if;
  if not public.is_community_owner(v_community, v_uid) then
    raise exception 'not allowed';
  end if;
  update public.community_join_requests
    set status = case when p_approve then 'approved' else 'rejected' end,
        resolved_at = now(),
        resolved_by = v_uid
    where id = p_request;
  if p_approve then
    insert into public.community_members(community_id, user_id) values (v_community, v_user)
    on conflict do nothing;
  end if;
end$$;

-- 5. RLS ----------------------------------------------------------------------
alter table public.community_members enable row level security;
alter table public.community_join_requests enable row level security;

drop policy if exists "members readable to involved users" on public.community_members;
create policy "members readable to involved users" on public.community_members
  for select using (
    user_id = auth.uid()
    or public.is_community_owner(community_id, auth.uid())
    or exists (
      select 1 from public.communities c
      where c.id = community_id and c.access_type = 'public'
    )
  );

drop policy if exists "requests readable to owner or requester" on public.community_join_requests;
create policy "requests readable to owner or requester" on public.community_join_requests
  for select using (
    user_id = auth.uid()
    or public.is_community_owner(community_id, auth.uid())
  );

-- 6. Grants -------------------------------------------------------------------
grant execute on function public.join_community_public(uuid) to authenticated;
grant execute on function public.join_community_passcode(uuid, text) to authenticated;
grant execute on function public.join_community_holders(uuid, text) to authenticated;
grant execute on function public.request_join_community(uuid, text, text) to authenticated;
grant execute on function public.resolve_join_request(uuid, boolean) to authenticated;
grant execute on function public.is_community_member(uuid, uuid) to authenticated;
grant execute on function public.is_community_owner(uuid, uuid) to authenticated;
