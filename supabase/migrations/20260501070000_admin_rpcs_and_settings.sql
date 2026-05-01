-- =====================================================================
-- 20260501070000_admin_rpcs_and_settings
--
-- Mega migration to fill every server-side gap the app currently expects:
--
--   Posts
--     - toggle_post_like(target_post_id uuid)         (returns liked, likes_count)
--
--   Admin dashboard
--     - admin_top_users(max_rows int)
--     - admin_recent_activity(max_rows int)
--     - admin_delete_user(target_user_id uuid)
--     - admin_dashboard_stats() now also reports `announcements`
--
--   Announcements / broadcasts
--     - public.announcements table + RLS
--     - admin_announcement_create(...)
--     - admin_announcement_delete(announcement_id uuid)
--
--   App settings (feature flags)
--     - public.app_settings table + RLS
--     - admin_settings_all()
--     - admin_setting_set(in_key text, in_value jsonb)
--
--   Storage buckets (avatars / banners / community-images) + policies
--
-- Safe to run repeatedly: every CREATE / POLICY is idempotent.
-- =====================================================================

set local search_path = public;

-- =====================================================================
-- 1. POSTS · toggle_post_like
-- =====================================================================
create or replace function public.toggle_post_like(target_post_id uuid)
returns table (liked boolean, likes_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  did_like boolean;
  new_count integer;
begin
  if caller is null then
    raise exception 'not authenticated';
  end if;

  if exists (
    select 1 from public.post_likes
     where post_id = target_post_id and user_id = caller
  ) then
    delete from public.post_likes
     where post_id = target_post_id and user_id = caller;
    did_like := false;
  else
    insert into public.post_likes (post_id, user_id)
    values (target_post_id, caller)
    on conflict do nothing;
    did_like := true;
  end if;

  select coalesce(cp.likes_count, 0)
    into new_count
    from public.community_posts cp
   where cp.id = target_post_id;

  liked := did_like;
  likes_count := coalesce(new_count, 0);
  return next;
end $$;

grant execute on function public.toggle_post_like(uuid) to authenticated;

-- =====================================================================
-- 2. ADMIN · top users
-- =====================================================================
create or replace function public.admin_top_users(max_rows int default 6)
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  followers_count integer,
  verified boolean,
  is_banned boolean,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'admin only';
  end if;
  return query
    select p.user_id,
           p.username,
           p.display_name,
           p.avatar_url,
           coalesce(p.followers_count, 0)::int,
           coalesce(p.verified, false),
           coalesce(p.is_banned, false),
           p.created_at
      from public.profiles p
     order by coalesce(p.followers_count, 0) desc, p.created_at desc
     limit greatest(1, least(max_rows, 50));
end $$;

grant execute on function public.admin_top_users(int) to authenticated;

-- =====================================================================
-- 3. ADMIN · recent activity (audit log + profile join)
-- =====================================================================
create or replace function public.admin_recent_activity(max_rows int default 8)
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
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'admin only';
  end if;
  return query
    select a.id,
           a.admin_id,
           p.username       as admin_username,
           p.avatar_url     as admin_avatar,
           a.action,
           a.target_type,
           a.target_id,
           coalesce(a.meta, '{}'::jsonb) as meta,
           a.created_at
      from public.admin_audit_log a
      left join public.profiles p on p.user_id = a.admin_id
     order by a.created_at desc
     limit greatest(1, least(max_rows, 200));
end $$;

grant execute on function public.admin_recent_activity(int) to authenticated;

-- =====================================================================
-- 4. ADMIN · delete user (superadmin only)
-- =====================================================================
create or replace function public.admin_delete_user(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'not authenticated';
  end if;
  if not public.has_admin_role(caller, array['superadmin']) then
    raise exception 'only superadmins can delete users';
  end if;
  if target_user_id = caller then
    raise exception 'cannot delete your own account from here';
  end if;

  delete from public.admin_roles where user_id = target_user_id;
  delete from public.profiles    where user_id = target_user_id;
  -- Best-effort: remove from auth.users if extension allows.
  begin
    delete from auth.users where id = target_user_id;
  exception when others then
    -- The service role is required to delete from auth.users from SQL.
    -- The profile row + admin role are already gone, which is enough
    -- to soft-delete the user from the product surface.
    null;
  end;

  insert into public.admin_audit_log (admin_id, action, target_type, target_id, meta)
  values (caller, 'user_delete', 'user', target_user_id::text, '{}'::jsonb);
end $$;

grant execute on function public.admin_delete_user(uuid) to authenticated;

-- =====================================================================
-- 5. ANNOUNCEMENTS · table + RLS + RPCs
-- =====================================================================
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body  text not null,
  severity text not null default 'info'
    check (severity in ('info','success','warning','critical')),
  audience text not null default 'all'
    check (audience in ('all','traders','admins')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

create index if not exists announcements_recent_idx
  on public.announcements (created_at desc);

alter table public.announcements enable row level security;

do $$
begin
  begin execute 'drop policy if exists "announcements_read" on public.announcements';
  exception when others then null; end;

  execute $p$create policy "announcements_read" on public.announcements
    for select using (
      audience = 'all'
      or (audience = 'traders' and auth.uid() is not null)
      or (audience = 'admins'  and public.is_admin(auth.uid()))
    )$p$;

  begin execute 'drop policy if exists "announcements_admin_write" on public.announcements';
  exception when others then null; end;

  execute $p$create policy "announcements_admin_write" on public.announcements
    for all using (public.is_admin(auth.uid()))
            with check (public.is_admin(auth.uid()))$p$;
end $$;

create or replace function public.admin_announcement_create(
  in_title    text,
  in_body     text,
  in_severity text default 'info',
  in_audience text default 'all',
  in_expires_at timestamptz default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  new_id uuid;
begin
  if not public.is_admin(caller) then
    raise exception 'admin only';
  end if;
  if coalesce(btrim(in_title), '') = '' or coalesce(btrim(in_body), '') = '' then
    raise exception 'title and body are required';
  end if;

  insert into public.announcements (title, body, severity, audience, created_by, expires_at)
  values (btrim(in_title), btrim(in_body),
          coalesce(in_severity, 'info'),
          coalesce(in_audience, 'all'),
          caller, in_expires_at)
  returning id into new_id;

  insert into public.admin_audit_log (admin_id, action, target_type, target_id, meta)
  values (caller, 'announcement_create', 'announcements', new_id::text,
          json_build_object('title', in_title, 'severity', in_severity, 'audience', in_audience)::jsonb);

  return new_id;
end $$;

create or replace function public.admin_announcement_delete(announcement_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
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

-- =====================================================================
-- 6. APP SETTINGS · table + RLS + RPCs
-- =====================================================================
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default 'null'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

do $$
begin
  begin execute 'drop policy if exists "app_settings_read" on public.app_settings';
  exception when others then null; end;
  execute $p$create policy "app_settings_read" on public.app_settings
    for select using (true)$p$;

  begin execute 'drop policy if exists "app_settings_admin_write" on public.app_settings';
  exception when others then null; end;
  execute $p$create policy "app_settings_admin_write" on public.app_settings
    for all using (public.is_admin(auth.uid()))
            with check (public.is_admin(auth.uid()))$p$;
end $$;

-- Seed feature flags expected by the admin Settings panel.
insert into public.app_settings (key, value) values
  ('signups_open',      'true'::jsonb),
  ('listings_open',     'true'::jsonb),
  ('maintenance_mode',  'false'::jsonb)
on conflict (key) do nothing;

create or replace function public.admin_settings_all()
returns table (key text, value jsonb, updated_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'admin only';
  end if;
  return query
    select s.key, s.value, s.updated_at
      from public.app_settings s
     order by s.key asc;
end $$;

create or replace function public.admin_setting_set(in_key text, in_value jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
begin
  if not public.is_admin(caller) then
    raise exception 'admin only';
  end if;
  if coalesce(btrim(in_key), '') = '' then
    raise exception 'key is required';
  end if;

  insert into public.app_settings (key, value, updated_by, updated_at)
  values (in_key, coalesce(in_value, 'null'::jsonb), caller, now())
  on conflict (key) do update
     set value = excluded.value,
         updated_by = excluded.updated_by,
         updated_at = now();

  insert into public.admin_audit_log (admin_id, action, target_type, target_id, meta)
  values (caller, 'setting_set', 'app_settings', in_key,
          json_build_object('value', in_value)::jsonb);
end $$;

grant execute on function public.admin_settings_all() to authenticated;
grant execute on function public.admin_setting_set(text, jsonb) to authenticated;

-- =====================================================================
-- 7. Refresh admin_dashboard_stats so `announcements` is populated.
-- =====================================================================
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
    'announcements',   (select count(*) from public.announcements),
    'new_users_7d',    (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'new_listings_7d', (select count(*) from public.pump_v5_submissions where created_at > now() - interval '7 days')
  ) into result;
  return result;
end $$;

grant execute on function public.admin_dashboard_stats() to authenticated;

-- =====================================================================
-- 8. STORAGE · avatars / banners / community-images buckets + policies
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars',          'avatars',          true,  5242880,  array['image/png','image/jpeg','image/webp','image/gif']),
  ('banners',          'banners',          true, 10485760,  array['image/png','image/jpeg','image/webp','image/gif']),
  ('community-images', 'community-images', true, 10485760,  array['image/png','image/jpeg','image/webp','image/gif'])
on conflict (id) do update
   set public = excluded.public,
       file_size_limit = excluded.file_size_limit,
       allowed_mime_types = excluded.allowed_mime_types;

do $$
declare
  buckets text[] := array['avatars','banners','community-images'];
  b text;
begin
  foreach b in array buckets loop
    -- Public read
    begin execute format('drop policy if exists "%s_public_read" on storage.objects', b);
    exception when others then null; end;
    execute format($p$create policy "%s_public_read" on storage.objects
      for select using (bucket_id = %L)$p$, b, b);

    -- Authenticated insert into own folder (first path segment = uid)
    begin execute format('drop policy if exists "%s_owner_insert" on storage.objects', b);
    exception when others then null; end;
    execute format($p$create policy "%s_owner_insert" on storage.objects
      for insert to authenticated
      with check (bucket_id = %L and auth.uid()::text = (storage.foldername(name))[1])$p$, b, b);

    -- Authenticated update own files
    begin execute format('drop policy if exists "%s_owner_update" on storage.objects', b);
    exception when others then null; end;
    execute format($p$create policy "%s_owner_update" on storage.objects
      for update to authenticated
      using (bucket_id = %L and auth.uid()::text = (storage.foldername(name))[1])
      with check (bucket_id = %L and auth.uid()::text = (storage.foldername(name))[1])$p$, b, b, b);

    -- Authenticated delete own files OR admin delete any
    begin execute format('drop policy if exists "%s_owner_delete" on storage.objects', b);
    exception when others then null; end;
    execute format($p$create policy "%s_owner_delete" on storage.objects
      for delete to authenticated
      using (
        bucket_id = %L and (
          auth.uid()::text = (storage.foldername(name))[1]
          or public.is_admin(auth.uid())
        )
      )$p$, b, b);
  end loop;
end $$;

-- =====================================================================
-- Done.
-- =====================================================================
select 'admin_rpcs_and_settings migration applied' as status;
