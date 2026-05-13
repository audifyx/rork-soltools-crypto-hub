-- Team role unlock fix
--
-- Problem: when an owner promotes a user to the "team" role from the admin
-- dashboard, the promoted user's client cannot see their own admin_roles row
-- (RLS denies SELECT to non-owners). As a result the AdminProvider keeps
-- role = null, isTeam = false, and the Team Dashboard / moderation features
-- stay locked even though the row exists in the database.
--
-- This migration:
--   1. Guarantees public.admin_roles exists with the expected shape.
--   2. Adds an RLS policy letting every signed-in user read their own row.
--   3. (Re)creates the promote / revoke / update RPCs as SECURITY DEFINER so
--      the owner-only writes work regardless of table-level policies.
--   4. Adds a SECURITY DEFINER helper `get_my_admin_role()` so the client can
--      reliably resolve its own role + permissions even under strict RLS.
--   5. Ensures `ensure_owner_role()` exists so the owner email auto-elevates.

set local search_path = public;

-- ---------------------------------------------------------------------------
-- 1. Table guard (no-op if already created by an earlier migration)
-- ---------------------------------------------------------------------------

create table if not exists public.admin_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique,
  email text,
  role text not null check (role in ('owner','superadmin','admin','moderator','team','support')),
  permissions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.admin_roles enable row level security;

-- ---------------------------------------------------------------------------
-- 2. Self-read policy — the critical fix
-- ---------------------------------------------------------------------------

drop policy if exists "admin_roles self read" on public.admin_roles;
create policy "admin_roles self read"
  on public.admin_roles
  for select
  to authenticated
  using (user_id = auth.uid());

-- Owners/superadmins/admins can read every row (for the management table).
drop policy if exists "admin_roles staff read" on public.admin_roles;
create policy "admin_roles staff read"
  on public.admin_roles
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.admin_roles ar
      where ar.user_id = auth.uid()
        and ar.role in ('owner','superadmin','admin')
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Owner-only management RPCs (SECURITY DEFINER, owner check inside)
-- ---------------------------------------------------------------------------

create or replace function public._is_owner(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_roles
    where user_id = p_uid
      and role in ('owner','superadmin')
  );
$$;

grant execute on function public._is_owner(uuid) to authenticated;

create or replace function public.promote_team_member(
  p_user_id uuid,
  p_email text default null,
  p_permissions jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if not public._is_owner(v_uid) then
    raise exception 'forbidden: only owner/superadmin can promote team members';
  end if;
  if p_user_id is null then
    raise exception 'p_user_id is required';
  end if;

  insert into public.admin_roles (user_id, email, role, permissions)
  values (
    p_user_id,
    p_email,
    'team',
    coalesce(p_permissions, '{}'::jsonb)
  )
  on conflict (user_id) do update
    set role = 'team',
        email = coalesce(excluded.email, public.admin_roles.email),
        permissions = coalesce(excluded.permissions, '{}'::jsonb),
        updated_at = now();
end;
$$;

grant execute on function public.promote_team_member(uuid, text, jsonb) to authenticated;

create or replace function public.revoke_team_member(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if not public._is_owner(v_uid) then
    raise exception 'forbidden: only owner/superadmin can revoke team members';
  end if;
  delete from public.admin_roles
   where user_id = p_user_id
     and role = 'team';
end;
$$;

grant execute on function public.revoke_team_member(uuid) to authenticated;

create or replace function public.update_team_permissions(
  p_user_id uuid,
  p_permissions jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if not public._is_owner(v_uid) then
    raise exception 'forbidden: only owner/superadmin can update team permissions';
  end if;
  update public.admin_roles
     set permissions = coalesce(p_permissions, '{}'::jsonb),
         updated_at = now()
   where user_id = p_user_id
     and role = 'team';
end;
$$;

grant execute on function public.update_team_permissions(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Self-role resolver — used by the client to bypass RLS reliably
-- ---------------------------------------------------------------------------

create or replace function public.get_my_admin_role()
returns table (role text, permissions jsonb)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return;
  end if;
  return query
    select ar.role::text, coalesce(ar.permissions, '{}'::jsonb)
      from public.admin_roles ar
     where ar.user_id = v_uid
     limit 1;
end;
$$;

grant execute on function public.get_my_admin_role() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Owner auto-elevation (kept idempotent so the owner email always works)
-- ---------------------------------------------------------------------------

create or replace function public.ensure_owner_role(
  check_user_id uuid,
  check_email text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if check_user_id is null or check_email is null then
    return;
  end if;

  insert into public.admin_roles (user_id, email, role, permissions)
  values (check_user_id, check_email, 'owner', '{}'::jsonb)
  on conflict (user_id) do update
    set role = case
                 when public.admin_roles.role in ('owner','superadmin')
                   then public.admin_roles.role
                 else 'owner'
               end,
        email = coalesce(excluded.email, public.admin_roles.email),
        updated_at = now();
end;
$$;

grant execute on function public.ensure_owner_role(uuid, text) to authenticated;
