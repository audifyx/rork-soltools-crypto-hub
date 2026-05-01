-- =====================================================================
-- Admin Dashboard support
-- - Bootstraps audifyx@gmail.com as the platform's only superadmin
-- - Adds RPC helpers so admins can manage other admins by email
-- - Adds RPC helpers for moderation actions on launchpad listings
-- - Adds aggregated stats RPC for the admin dashboard
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Hardened is_admin / has_admin_role helpers
-- ---------------------------------------------------------------------
create or replace function public.is_admin(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admin_roles where user_id = uid)
$$;

create or replace function public.has_admin_role(uid uuid, required text[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.admin_roles
    where user_id = uid and role = any(required)
  )
$$;

-- ---------------------------------------------------------------------
-- 2. Bootstrap audifyx@gmail.com as the only superadmin
-- ---------------------------------------------------------------------
do $$
declare
  target_id uuid;
begin
  select id into target_id from auth.users where lower(email) = 'audifyx@gmail.com' limit 1;
  if target_id is not null then
    insert into public.admin_roles (user_id, role, granted_by)
    values (target_id, 'superadmin', target_id)
    on conflict (user_id) do update set role = 'superadmin';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 3. Admin management RPCs (only superadmins can grant/revoke)
-- ---------------------------------------------------------------------
create or replace function public.admin_add_by_email(target_email text, target_role text default 'admin')
returns json language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  target_id uuid;
begin
  if caller is null then
    raise exception 'not authenticated';
  end if;
  if not public.has_admin_role(caller, array['superadmin']) then
    raise exception 'only superadmins can grant admin roles';
  end if;
  if target_role not in ('superadmin','admin','moderator','support') then
    raise exception 'invalid role: %', target_role;
  end if;

  select id into target_id from auth.users where lower(email) = lower(target_email) limit 1;
  if target_id is null then
    raise exception 'no user with email %', target_email;
  end if;

  insert into public.admin_roles (user_id, role, granted_by)
  values (target_id, target_role, caller)
  on conflict (user_id) do update set role = excluded.role, granted_by = excluded.granted_by;

  insert into public.admin_audit_log (admin_id, action, target_type, target_id, meta)
  values (caller, 'grant_role', 'user', target_id::text, json_build_object('role', target_role, 'email', target_email)::jsonb);

  return json_build_object('user_id', target_id, 'role', target_role);
end $$;

create or replace function public.admin_remove(target_user_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'not authenticated';
  end if;
  if not public.has_admin_role(caller, array['superadmin']) then
    raise exception 'only superadmins can revoke admin roles';
  end if;
  if target_user_id = caller then
    raise exception 'cannot revoke your own superadmin role here';
  end if;
  delete from public.admin_roles where user_id = target_user_id;

  insert into public.admin_audit_log (admin_id, action, target_type, target_id, meta)
  values (caller, 'revoke_role', 'user', target_user_id::text, '{}'::jsonb);

  return true;
end $$;

-- View admins with profile info (admin only)
create or replace function public.admin_list_admins()
returns table (
  user_id uuid,
  role text,
  granted_by uuid,
  created_at timestamptz,
  email text,
  username text,
  avatar_url text
) language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'admin only';
  end if;
  return query
    select ar.user_id, ar.role, ar.granted_by, ar.created_at,
           u.email::text, p.username, p.avatar_url
    from public.admin_roles ar
    left join auth.users u on u.id = ar.user_id
    left join public.profiles p on p.user_id = ar.user_id
    order by ar.created_at asc;
end $$;

-- ---------------------------------------------------------------------
-- 4. Launchpad moderation RPCs
-- ---------------------------------------------------------------------
create or replace function public.admin_set_listing_flags(
  submission_id uuid,
  set_featured boolean default null,
  set_verified boolean default null,
  set_hot boolean default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
begin
  if not public.is_admin(caller) then
    raise exception 'admin only';
  end if;
  update public.pump_v5_submissions
     set is_featured = coalesce(set_featured, is_featured),
         is_verified = coalesce(set_verified, is_verified),
         is_hot      = coalesce(set_hot, is_hot),
         updated_at  = now()
   where id = submission_id;

  insert into public.admin_audit_log (admin_id, action, target_type, target_id, meta)
  values (caller, 'listing_flags', 'pump_v5_submissions', submission_id::text,
          json_build_object('featured', set_featured, 'verified', set_verified, 'hot', set_hot)::jsonb);
end $$;

create or replace function public.admin_delete_listing(submission_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
begin
  if not public.is_admin(caller) then
    raise exception 'admin only';
  end if;
  delete from public.pump_v5_submissions where id = submission_id;
  insert into public.admin_audit_log (admin_id, action, target_type, target_id, meta)
  values (caller, 'listing_delete', 'pump_v5_submissions', submission_id::text, '{}'::jsonb);
end $$;

-- ---------------------------------------------------------------------
-- 5. Dashboard stats RPC
-- ---------------------------------------------------------------------
create or replace function public.admin_dashboard_stats()
returns json language plpgsql security definer set search_path = public as $$
declare
  result json;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'admin only';
  end if;
  select json_build_object(
    'users',           (select count(*) from public.profiles),
    'admins',          (select count(*) from public.admin_roles),
    'listings',        (select count(*) from public.pump_v5_submissions),
    'featured',        (select count(*) from public.pump_v5_submissions where is_featured),
    'verified',        (select count(*) from public.pump_v5_submissions where is_verified),
    'support_open',    (select count(*) from public.support_tickets where status = 'open'),
    'support_total',   (select count(*) from public.support_tickets),
    'new_users_7d',    (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'new_listings_7d', (select count(*) from public.pump_v5_submissions where created_at > now() - interval '7 days')
  ) into result;
  return result;
end $$;

-- ---------------------------------------------------------------------
-- 6. Support ticket update RPC (admins/support only)
-- ---------------------------------------------------------------------
create or replace function public.admin_update_ticket(
  ticket_id uuid,
  new_status public.support_status default null,
  new_priority text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
begin
  if not public.has_admin_role(caller, array['superadmin','admin','support','moderator']) then
    raise exception 'admin/support only';
  end if;
  update public.support_tickets
     set status = coalesce(new_status, status),
         priority = coalesce(new_priority, priority),
         assignee_id = coalesce(assignee_id, caller),
         updated_at = now()
   where id = ticket_id;

  insert into public.admin_audit_log (admin_id, action, target_type, target_id, meta)
  values (caller, 'ticket_update', 'support_tickets', ticket_id::text,
          json_build_object('status', new_status, 'priority', new_priority)::jsonb);
end $$;

-- ---------------------------------------------------------------------
-- 7. Grants
-- ---------------------------------------------------------------------
grant execute on function public.admin_add_by_email(text, text) to authenticated;
grant execute on function public.admin_remove(uuid) to authenticated;
grant execute on function public.admin_list_admins() to authenticated;
grant execute on function public.admin_set_listing_flags(uuid, boolean, boolean, boolean) to authenticated;
grant execute on function public.admin_delete_listing(uuid) to authenticated;
grant execute on function public.admin_dashboard_stats() to authenticated;
grant execute on function public.admin_update_ticket(uuid, public.support_status, text) to authenticated;
grant execute on function public.is_admin(uuid) to authenticated, anon;
grant execute on function public.has_admin_role(uuid, text[]) to authenticated;
