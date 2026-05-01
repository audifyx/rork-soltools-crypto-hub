-- =====================================================================
-- ADMIN MEGAPACK
-- Adds the data + RPCs the redesigned admin console needs:
--   * announcements (broadcasts) table
--   * platform_settings KV helpers
--   * richer dashboard stats (growth, top users, recent listings)
--   * admin_user_detail / admin_recent_activity / admin_set_admin_role
--   * admin_announcement_create + list
-- Idempotent — safe to re-run.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Announcements / broadcasts
-- ---------------------------------------------------------------------
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  severity text not null default 'info' check (severity in ('info','success','warning','critical')),
  audience text not null default 'all' check (audience in ('all','traders','admins')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

create index if not exists announcements_recent_idx on public.announcements (created_at desc);

alter table public.announcements enable row level security;

do $$
begin
  begin execute 'drop policy if exists "announcements_read" on public.announcements'; exception when others then null; end;
  execute $p$create policy "announcements_read" on public.announcements
    for select using (true)$p$;
  begin execute 'drop policy if exists "announcements_admin_write" on public.announcements'; exception when others then null; end;
  execute $p$create policy "announcements_admin_write" on public.announcements
    for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()))$p$;
end $$;

create or replace function public.admin_announcement_create(
  in_title text,
  in_body text,
  in_severity text default 'info',
  in_audience text default 'all',
  in_expires_at timestamptz default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  new_id uuid;
begin
  if not public.is_admin(caller) then
    raise exception 'admin only';
  end if;
  insert into public.announcements (title, body, severity, audience, created_by, expires_at)
  values (coalesce(nullif(trim(in_title),''),'Announcement'), in_body, coalesce(in_severity,'info'), coalesce(in_audience,'all'), caller, in_expires_at)
  returning id into new_id;

  insert into public.admin_audit_log (admin_id, action, target_type, target_id, meta)
  values (caller, 'announcement_create', 'announcements', new_id::text,
          jsonb_build_object('severity', in_severity, 'audience', in_audience));
  return new_id;
end $$;

create or replace function public.admin_announcement_delete(announcement_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare caller uuid := auth.uid();
begin
  if not public.is_admin(caller) then
    raise exception 'admin only';
  end if;
  delete from public.announcements where id = announcement_id;
  insert into public.admin_audit_log (admin_id, action, target_type, target_id, meta)
  values (caller, 'announcement_delete', 'announcements', announcement_id::text, '{}'::jsonb);
end $$;

grant execute on function public.admin_announcement_create(text, text, text, text, timestamptz) to authenticated;
grant execute on function public.admin_announcement_delete(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 2. Platform settings get/set helpers
-- ---------------------------------------------------------------------
create or replace function public.admin_setting_set(in_key text, in_value jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare caller uuid := auth.uid();
begin
  if not public.is_admin(caller) then
    raise exception 'admin only';
  end if;
  insert into public.platform_settings (key, value, updated_by, updated_at)
  values (in_key, in_value, caller, now())
  on conflict (key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();

  insert into public.admin_audit_log (admin_id, action, target_type, target_id, meta)
  values (caller, 'setting_set', 'platform_settings', in_key, in_value);
  return in_value;
end $$;

create or replace function public.admin_settings_all()
returns table (key text, value jsonb, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select key, value, updated_at from public.platform_settings order by key asc
$$;

grant execute on function public.admin_setting_set(text, jsonb) to authenticated;
grant execute on function public.admin_settings_all() to authenticated;

-- ---------------------------------------------------------------------
-- 3. Richer dashboard stats (replaces admin_dashboard_stats)
-- ---------------------------------------------------------------------
create or replace function public.admin_dashboard_stats()
returns json language plpgsql security definer set search_path = public as $$
declare result json;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'admin only';
  end if;

  select json_build_object(
    'users',            (select count(*) from public.profiles),
    'admins',           (select count(*) from public.admin_roles),
    'listings',         (select count(*) from public.pump_v5_submissions),
    'featured',         (select count(*) from public.pump_v5_submissions where is_featured),
    'verified',         (select count(*) from public.pump_v5_submissions where is_verified),
    'hot',              (select count(*) from public.pump_v5_submissions where is_hot),
    'support_open',     (select count(*) from public.support_tickets where status = 'open'),
    'support_pending',  (select count(*) from public.support_tickets where status = 'pending'),
    'support_total',    (select count(*) from public.support_tickets),
    'banned_users',     (select count(*) from public.profiles where is_banned),
    'verified_users',   (select count(*) from public.profiles where verified),
    'new_users_24h',    (select count(*) from public.profiles where created_at > now() - interval '24 hours'),
    'new_users_7d',     (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'new_listings_24h', (select count(*) from public.pump_v5_submissions where created_at > now() - interval '24 hours'),
    'new_listings_7d',  (select count(*) from public.pump_v5_submissions where created_at > now() - interval '7 days'),
    'posts_total',      (select count(*) from public.community_posts),
    'posts_24h',        (select count(*) from public.community_posts where created_at > now() - interval '24 hours'),
    'announcements',    (select count(*) from public.announcements),
    'last_listing_at',  (select max(created_at) from public.pump_v5_submissions),
    'last_signup_at',   (select max(created_at) from public.profiles)
  ) into result;
  return result;
end $$;

grant execute on function public.admin_dashboard_stats() to authenticated;

-- ---------------------------------------------------------------------
-- 4. Top users / leaderboard for admin overview
-- ---------------------------------------------------------------------
create or replace function public.admin_top_users(max_rows int default 8)
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  followers_count integer,
  verified boolean,
  is_banned boolean,
  created_at timestamptz
) language sql stable security definer set search_path = public as $$
  select p.id, p.username::text, p.display_name, p.avatar_url,
         p.followers_count, p.verified, p.is_banned, p.created_at
    from public.profiles p
   order by p.followers_count desc nulls last, p.created_at desc
   limit greatest(1, least(max_rows, 50))
$$;

grant execute on function public.admin_top_users(int) to authenticated;

-- ---------------------------------------------------------------------
-- 5. Recent listings preview for admin overview
-- ---------------------------------------------------------------------
create or replace function public.admin_recent_listings(max_rows int default 6)
returns table (
  id uuid,
  token_name text,
  symbol text,
  contract_address text,
  market_cap numeric,
  is_featured boolean,
  is_verified boolean,
  is_hot boolean,
  created_at timestamptz
) language sql stable security definer set search_path = public as $$
  select s.id, s.token_name, s.symbol, s.contract_address,
         s.market_cap, s.is_featured, s.is_verified, s.is_hot, s.created_at
    from public.pump_v5_submissions s
   order by s.created_at desc
   limit greatest(1, least(max_rows, 50))
$$;

grant execute on function public.admin_recent_listings(int) to authenticated;

-- ---------------------------------------------------------------------
-- 6. Detailed user view (for admin user drill-down)
-- ---------------------------------------------------------------------
create or replace function public.admin_user_detail(target_user_id uuid)
returns json language plpgsql security definer set search_path = public as $$
declare result json;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'admin only';
  end if;

  select json_build_object(
    'user_id',         p.id,
    'email',           u.email,
    'username',        p.username,
    'display_name',    p.display_name,
    'avatar_url',      p.avatar_url,
    'banner_url',      p.banner_url,
    'bio',             p.bio,
    'verified',        p.verified,
    'badge',           p.badge,
    'custom_badges',   p.custom_badges,
    'is_banned',       p.is_banned,
    'followers_count', p.followers_count,
    'following_count', p.following_count,
    'wallet_address',  p.wallet_address,
    'created_at',      p.created_at,
    'role',            (select role from public.admin_roles where user_id = p.id),
    'listings_count',  (select count(*) from public.pump_v5_submissions s where s.user_id = p.id),
    'posts_count',     (select count(*) from public.community_posts c where c.user_id = p.id),
    'tickets_count',   (select count(*) from public.support_tickets t where t.user_id = p.id)
  ) into result
  from public.profiles p
  left join auth.users u on u.id = p.id
  where p.id = target_user_id;

  if result is null then
    raise exception 'user not found';
  end if;
  return result;
end $$;

grant execute on function public.admin_user_detail(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 7. Recent admin activity (audit + signals) for the overview tab
-- ---------------------------------------------------------------------
create or replace function public.admin_recent_activity(max_rows int default 10)
returns table (
  id uuid,
  admin_id uuid,
  admin_username text,
  admin_avatar text,
  action text,
  target_type text,
  target_id text,
  meta jsonb,
  created_at timestamptz
) language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'admin only';
  end if;
  return query
    select a.id, a.admin_id,
           p.username::text as admin_username,
           p.avatar_url as admin_avatar,
           a.action, a.target_type, a.target_id, a.meta, a.created_at
      from public.admin_audit_log a
      left join public.profiles p on p.id = a.admin_id
     order by a.created_at desc
     limit greatest(1, least(max_rows, 100));
end $$;

grant execute on function public.admin_recent_activity(int) to authenticated;

-- ---------------------------------------------------------------------
-- 8. Quick utilities admins use a lot
-- ---------------------------------------------------------------------
-- Hard-delete a user (auth.users cascade clears profile via FK)
create or replace function public.admin_delete_user(target_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare caller uuid := auth.uid();
begin
  if not public.has_admin_role(caller, array['superadmin']) then
    raise exception 'only superadmins can delete users';
  end if;
  if target_user_id = caller then
    raise exception 'cannot delete yourself';
  end if;
  -- protect the bootstrap owner
  if exists (select 1 from auth.users where id = target_user_id and lower(email) = 'audifyx@gmail.com') then
    raise exception 'cannot delete the platform owner';
  end if;
  delete from public.profiles where id = target_user_id;
  begin
    delete from auth.users where id = target_user_id;
  exception when others then
    null; -- profiles deletion is enough if auth deletion is restricted
  end;

  insert into public.admin_audit_log (admin_id, action, target_type, target_id, meta)
  values (caller, 'user_delete', 'profiles', target_user_id::text, '{}'::jsonb);
end $$;

grant execute on function public.admin_delete_user(uuid) to authenticated;

-- Bulk listing actions
create or replace function public.admin_bulk_listing(
  ids uuid[],
  set_featured boolean default null,
  set_verified boolean default null,
  set_hot boolean default null,
  do_delete boolean default false
) returns int language plpgsql security definer set search_path = public as $$
declare caller uuid := auth.uid(); affected int := 0;
begin
  if not public.is_admin(caller) then
    raise exception 'admin only';
  end if;
  if do_delete then
    delete from public.pump_v5_submissions where id = any(ids);
    get diagnostics affected = row_count;
  else
    update public.pump_v5_submissions
       set is_featured = coalesce(set_featured, is_featured),
           is_verified = coalesce(set_verified, is_verified),
           is_hot      = coalesce(set_hot, is_hot),
           updated_at  = now()
     where id = any(ids);
    get diagnostics affected = row_count;
  end if;

  insert into public.admin_audit_log (admin_id, action, target_type, target_id, meta)
  values (caller, 'listing_bulk', 'pump_v5_submissions', null,
          jsonb_build_object('count', affected, 'delete', do_delete,
                             'featured', set_featured, 'verified', set_verified, 'hot', set_hot));
  return affected;
end $$;

grant execute on function public.admin_bulk_listing(uuid[], boolean, boolean, boolean, boolean) to authenticated;

-- ---------------------------------------------------------------------
-- 9. Seed default platform settings (only inserts missing keys)
-- ---------------------------------------------------------------------
insert into public.platform_settings (key, value)
values
  ('signups_open', 'true'::jsonb),
  ('listings_open', 'true'::jsonb),
  ('maintenance_mode', 'false'::jsonb),
  ('featured_banner', '{"enabled":false,"text":""}'::jsonb)
on conflict (key) do nothing;
