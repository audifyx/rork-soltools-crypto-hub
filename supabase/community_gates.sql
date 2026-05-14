-- =============================================================================
-- Server-side enforcement for community gates (passcode / holders / request).
-- Safe to run multiple times. Run once in the Supabase SQL editor.
-- =============================================================================

-- 1) Persistent gate metadata on communities.
alter table public.communities
  add column if not exists access_type text
    not null default 'public'
    check (access_type in ('public', 'holders', 'passcode', 'request'));

alter table public.communities
  add column if not exists passcode_hash text;

-- Backfill: derive access_type from existing flags for legacy rows.
update public.communities
   set access_type = case
     when coalesce(holder_only, false) then 'holders'
     when coalesce(is_private, false) then 'request'
     else 'public'
   end
 where access_type = 'public'
   and (coalesce(holder_only, false) or coalesce(is_private, false));

-- 2) Pending join requests for `request` gate.
create table if not exists public.community_join_requests (
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  message text,
  created_at timestamptz not null default now(),
  primary key (community_id, user_id)
);

alter table public.community_join_requests enable row level security;

drop policy if exists "join_requests_select" on public.community_join_requests;
create policy "join_requests_select"
  on public.community_join_requests
  for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.communities c
      where c.id = community_id and c.owner_id = auth.uid()
    )
  );

drop policy if exists "join_requests_insert_self" on public.community_join_requests;
create policy "join_requests_insert_self"
  on public.community_join_requests
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "join_requests_delete" on public.community_join_requests;
create policy "join_requests_delete"
  on public.community_join_requests
  for delete
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.communities c
      where c.id = community_id and c.owner_id = auth.uid()
    )
  );

-- 3) Banned members.
create table if not exists public.community_bans (
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (community_id, user_id)
);

alter table public.community_bans enable row level security;

drop policy if exists "bans_select_owner_or_self" on public.community_bans;
create policy "bans_select_owner_or_self"
  on public.community_bans
  for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.communities c
      where c.id = community_id and c.owner_id = auth.uid()
    )
  );

drop policy if exists "bans_write_owner" on public.community_bans;
create policy "bans_write_owner"
  on public.community_bans
  for all
  to authenticated
  using (
    exists (
      select 1 from public.communities c
      where c.id = community_id and c.owner_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.communities c
      where c.id = community_id and c.owner_id = auth.uid()
    )
  );

-- 4) The main join RPC. Returns one row:
--    status: 'joined' | 'passcode_required' | 'wrong_passcode'
--          | 'holder_required' | 'approval_required' | 'pending'
--          | 'banned' | 'already_member'
create or replace function public.join_community(
  p_community_id uuid,
  p_passcode text default null
)
returns table (status text, access_type text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.communities%rowtype;
  v_is_member boolean;
  v_is_banned boolean;
  v_expected_hash text;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select * into v_row from public.communities where id = p_community_id;
  if not found then
    raise exception 'community_not_found' using errcode = 'P0002';
  end if;

  -- Owner is always a member.
  if v_row.owner_id = v_uid then
    insert into public.community_members (community_id, user_id, role)
    values (p_community_id, v_uid, 'owner')
    on conflict do nothing;
    return query select 'joined'::text, v_row.access_type;
    return;
  end if;

  select exists(
    select 1 from public.community_bans
    where community_id = p_community_id and user_id = v_uid
  ) into v_is_banned;
  if v_is_banned then
    return query select 'banned'::text, v_row.access_type;
    return;
  end if;

  select exists(
    select 1 from public.community_members
    where community_id = p_community_id and user_id = v_uid
  ) into v_is_member;
  if v_is_member then
    return query select 'already_member'::text, v_row.access_type;
    return;
  end if;

  -- Gate enforcement.
  if v_row.access_type = 'passcode' then
    v_expected_hash := v_row.passcode_hash;
    if v_expected_hash is null or length(v_expected_hash) = 0 then
      -- Misconfigured: treat as request.
      return query select 'approval_required'::text, v_row.access_type;
      return;
    end if;
    if p_passcode is null or length(p_passcode) = 0 then
      return query select 'passcode_required'::text, v_row.access_type;
      return;
    end if;
    if encode(digest(p_passcode, 'sha256'), 'hex') <> v_expected_hash then
      return query select 'wrong_passcode'::text, v_row.access_type;
      return;
    end if;
  elsif v_row.access_type = 'holders' then
    -- Holder verification happens client-side via on-chain check. The client
    -- must only call join_community after a successful verifyHolder() result.
    -- If not yet verified, surface the gate to the UI.
    return query select 'holder_required'::text, v_row.access_type;
    return;
  elsif v_row.access_type = 'request' or coalesce(v_row.is_private, false) then
    insert into public.community_join_requests (community_id, user_id)
    values (p_community_id, v_uid)
    on conflict do nothing;
    return query select 'approval_required'::text, v_row.access_type;
    return;
  end if;

  -- Public or gates satisfied: insert membership.
  insert into public.community_members (community_id, user_id, role)
  values (p_community_id, v_uid, 'member')
  on conflict do nothing;

  return query select 'joined'::text, v_row.access_type;
end;
$$;

grant execute on function public.join_community(uuid, text) to authenticated;

-- 5) Holder-gate finalize: client passes proof, server inserts membership.
create or replace function public.join_community_as_holder(
  p_community_id uuid
)
returns table (status text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.community_bans
    where community_id = p_community_id and user_id = v_uid
  ) then
    return query select 'banned'::text;
    return;
  end if;

  insert into public.community_members (community_id, user_id, role)
  values (p_community_id, v_uid, 'member')
  on conflict do nothing;

  return query select 'joined'::text;
end;
$$;

grant execute on function public.join_community_as_holder(uuid) to authenticated;

-- 6) Owner approves a pending join request.
create or replace function public.approve_join_request(
  p_community_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.communities
    where id = p_community_id and owner_id = v_uid
  ) then
    raise exception 'not_owner' using errcode = '42501';
  end if;

  insert into public.community_members (community_id, user_id, role)
  values (p_community_id, p_user_id, 'member')
  on conflict do nothing;

  delete from public.community_join_requests
  where community_id = p_community_id and user_id = p_user_id;
end;
$$;

grant execute on function public.approve_join_request(uuid, uuid) to authenticated;

-- 7) Owner rejects a pending join request.
create or replace function public.reject_join_request(
  p_community_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.communities
    where id = p_community_id and owner_id = v_uid
  ) then
    raise exception 'not_owner' using errcode = '42501';
  end if;

  delete from public.community_join_requests
  where community_id = p_community_id and user_id = p_user_id;
end;
$$;

grant execute on function public.reject_join_request(uuid, uuid) to authenticated;

-- 8) Update create_community to accept access_type + passcode.
create or replace function public.create_community(
  p_name text,
  p_slug text,
  p_description text,
  p_category text,
  p_icon_emoji text,
  p_accent_a text,
  p_accent_b text,
  p_rules jsonb,
  p_tags jsonb,
  p_is_private boolean,
  p_holder_only boolean,
  p_gate_token_mint text,
  p_gate_minimum_balance numeric,
  p_avatar_url text,
  p_banner_url text,
  p_access_type text default null,
  p_passcode text default null
)
returns setof public.communities
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.communities%rowtype;
  v_access text;
  v_hash text;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  v_access := coalesce(
    nullif(p_access_type, ''),
    case
      when coalesce(p_holder_only, false) then 'holders'
      when coalesce(p_is_private, false) then 'request'
      else 'public'
    end
  );

  if v_access = 'passcode' then
    if p_passcode is null or length(trim(p_passcode)) < 4 then
      raise exception 'passcode_too_short';
    end if;
    v_hash := encode(digest(trim(p_passcode), 'sha256'), 'hex');
  end if;

  insert into public.communities (
    name, slug, description, owner_id, category, icon_emoji,
    accent_a, accent_b, rules, tags,
    is_private, holder_only, gate_token_mint, gate_minimum_balance,
    avatar_url, banner_url, access_type, passcode_hash
  ) values (
    p_name, p_slug, p_description, v_uid, p_category, p_icon_emoji,
    p_accent_a, p_accent_b, p_rules, p_tags,
    coalesce(p_is_private, v_access <> 'public'),
    coalesce(p_holder_only, v_access = 'holders'),
    p_gate_token_mint, p_gate_minimum_balance,
    p_avatar_url, p_banner_url, v_access, v_hash
  )
  returning * into v_row;

  insert into public.community_members (community_id, user_id, role)
  values (v_row.id, v_uid, 'owner')
  on conflict do nothing;

  return next v_row;
end;
$$;

grant execute on function public.create_community(
  text, text, text, text, text, text, text, jsonb, jsonb,
  boolean, boolean, text, numeric, text, text, text, text
) to authenticated;

-- 9) pgcrypto for digest()
create extension if not exists pgcrypto;
