-- 018_admin_broadcast_settings.sql
-- Remaining admin RPCs: delete user, broadcasts, and settings.

create or replace function public.admin_delete_user(target_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(auth.uid()) then raise exception 'admin only'; end if;
  if target_user_id = auth.uid() then raise exception 'cannot delete yourself'; end if;

  delete from public.admin_roles where user_id = target_user_id;
  delete from public.followers where follower_id = target_user_id or followee_id = target_user_id;
  delete from public.community_members where user_id = target_user_id;
  delete from public.community_posts where user_id = target_user_id;
  delete from public.launch_upvotes where user_id = target_user_id;
  delete from public.pump_v5_submissions where user_id = target_user_id;
  delete from public.tracked_tokens where user_id = target_user_id;
  delete from public.tracked_wallets where user_id = target_user_id;
  delete from public.price_alerts where user_id = target_user_id;
  delete from public.user_settings where user_id = target_user_id;
  delete from public.user_presence where user_id = target_user_id;
  delete from public.profiles where id = target_user_id;
  delete from auth.users where id = target_user_id;

  insert into public.admin_audit_log (admin_id, action, target_type, target_id)
  values (auth.uid(), 'delete_user', 'auth.users', target_user_id::text);
end $$;

grant execute on function public.admin_delete_user(uuid) to authenticated;

create or replace function public.admin_announcement_create(
  in_title text,
  in_body text,
  in_severity text default 'info',
  in_audience text default 'all',
  in_expires_at timestamptz default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if not public.is_admin(auth.uid()) then raise exception 'admin only'; end if;
  insert into public.announcements (title, body, severity, audience, expires_at, created_by)
  values (
    nullif(trim(in_title), ''),
    nullif(trim(in_body), ''),
    coalesce(nullif(in_severity, ''), 'info'),
    coalesce(nullif(in_audience, ''), 'all'),
    in_expires_at,
    auth.uid()
  ) returning id into new_id;
  insert into public.admin_audit_log (admin_id, action, target_type, target_id)
  values (auth.uid(), 'announcement_create', 'announcements', new_id::text);
  return new_id;
end $$;

grant execute on function public.admin_announcement_create(text, text, text, text, timestamptz) to authenticated;

create or replace function public.admin_announcement_delete(announcement_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(auth.uid()) then raise exception 'admin only'; end if;
  delete from public.announcements where id = announcement_id;
  insert into public.admin_audit_log (admin_id, action, target_type, target_id)
  values (auth.uid(), 'announcement_delete', 'announcements', announcement_id::text);
end $$;

grant execute on function public.admin_announcement_delete(uuid) to authenticated;

create or replace function public.admin_settings_all()
returns table (key text, value jsonb, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select s.key, s.value, s.updated_at
    from public.app_settings s
   where public.is_admin(auth.uid())
   order by s.key;
$$;

grant execute on function public.admin_settings_all() to authenticated;

create or replace function public.admin_setting_set(in_key text, in_value jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(auth.uid()) then raise exception 'admin only'; end if;
  insert into public.app_settings (key, value, updated_by, updated_at)
  values (in_key, coalesce(in_value, 'null'::jsonb), auth.uid(), now())
  on conflict (key) do update set
    value = excluded.value,
    updated_by = excluded.updated_by,
    updated_at = now();
end $$;

grant execute on function public.admin_setting_set(text, jsonb) to authenticated;

select '018_admin_broadcast_settings applied' as status;
