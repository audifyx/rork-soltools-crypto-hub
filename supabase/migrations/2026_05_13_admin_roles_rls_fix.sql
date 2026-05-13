-- Admin roles RLS fix
--
-- Problem: the prior "admin_roles staff read" policy referenced the same
-- admin_roles table inside its USING clause. Every SELECT on admin_roles
-- triggered RLS recursion ("infinite recursion detected in policy for
-- relation admin_roles"), which:
--   • broke the AdminProvider fallback path that selects role/permissions
--     directly when get_my_admin_role() returns nothing,
--   • broke the owner-only team list in the admin dashboard.
--
-- Fix: replace the staff-read policy with a SECURITY DEFINER helper that
-- does the role lookup with RLS bypassed, then reference the helper in the
-- policy. Also harden get_my_admin_role() to always return a row (NULL role
-- for unprivileged users) so client logic doesn't fall through to the
-- recursive SELECT.
set local search_path = public;

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

-- SECURITY DEFINER role check — bypasses RLS so policies can call it safely.
create or replace function public._has_staff_role(p_uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from public.admin_roles ar
     where ar.user_id = p_uid
       and ar.role in ('owner','superadmin','admin')
  );
$$;

grant execute on function public._has_staff_role(uuid) to authenticated;

-- Self-read: every signed-in user can read their own row (critical so the
-- AdminProvider can resolve role/permissions even without the RPC).
drop policy if exists "admin_roles self read" on public.admin_roles;
create policy "admin_roles self read"
  on public.admin_roles
  for select
  to authenticated
  using (user_id = auth.uid());

-- Staff read: owners/superadmins/admins can read every row. Uses the
-- SECURITY DEFINER helper so this policy never recurses into itself.
drop policy if exists "admin_roles staff read" on public.admin_roles;
create policy "admin_roles staff read"
  on public.admin_roles
  for select
  to authenticated
  using (public._has_staff_role(auth.uid()));

-- Harden the self-role resolver: always return exactly one row so the
-- client can trust the response shape. If the user has no admin_roles row,
-- role/permissions come back as null and the client treats them as a
-- normal user (instead of falling through to the recursive fallback).
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
    return query select null::text, '{}'::jsonb;
    return;
  end if;
  return query
    select ar.role::text, coalesce(ar.permissions, '{}'::jsonb)
      from public.admin_roles ar
     where ar.user_id = v_uid
     limit 1;
  if not found then
    return query select null::text, '{}'::jsonb;
  end if;
end;
$$;

grant execute on function public.get_my_admin_role() to authenticated;

-- Backfill: if the owner email exists in auth but not in admin_roles, the
-- AdminProvider already calls ensure_owner_role(). Nothing to do here.
