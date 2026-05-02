-- 017_admin_action_rpcs.sql
-- Short admin action RPC patch: users, badges, listings, tickets, broadcasts, settings.

create or replace function public.admin_search_users(q text default '', max_rows int default 50)
returns table (
  user_id uuid, email text, username text, display_name text, avatar_url text,
  verified boolean, badge text, custom_badges jsonb, is_banned boolean,
  followers_count integer, created_at timestamptz
) language plpgsql security definer set search_path = public as $$
declare needle text := nullif(trim(q), '');
begin
  if not public.is_admin(auth.uid()) then raise exception 'admin only'; end if;
  return query
    select p.id, u.email::text, p.username::text, p.display_name, p.avatar_url,
           p.verified, p.badge, coalesce(p.custom_badges, '[]'::jsonb),
           p.is_banned, p.followers_count, p.created_at
      from public.profiles p
      left join auth.users u on u.id = p.id
     where needle is null
        or u.email ilike '%' || needle || '%'
        or p.username::text ilike '%' || needle || '%'
        or p.display_name ilike '%' || needle || '%'
     order by p.created_at desc
     limit greatest(1, least(max_rows, 200));
end $$;

grant execute on function public.admin_search_users(text, int) to authenticated;

create or replace function public.admin_set_user_flags(
  target_user_id uuid,
  set_verified boolean default null,
  set_badge text default null,
  set_banned boolean default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(auth.uid()) then raise exception 'admin only'; end if;
  update public.profiles set
    verified = coalesce(set_verified, verified),
    badge = coalesce(nullif(set_badge, ''), badge),
    is_banned = coalesce(set_banned, is_banned),
    updated_at = now()
  where id = target_user_id;
  insert into public.admin_audit_log (admin_id, action, target_type, target_id, meta)
  values (auth.uid(), 'set_user_flags', 'profiles', target_user_id::text,
          jsonb_build_object('verified', set_verified, 'badge', set_badge, 'banned', set_banned));
end $$;

grant execute on function public.admin_set_user_flags(uuid, boolean, text, boolean) to authenticated;

create or replace function public.admin_add_badge(target_user_id uuid, badge_id text, badge_label text, badge_color text default null, badge_icon text default null)
returns void language plpgsql security definer set search_path = public as $$
declare badge jsonb;
begin
  if not public.is_admin(auth.uid()) then raise exception 'admin only'; end if;
  badge := jsonb_build_object('id', badge_id, 'label', badge_label, 'color', badge_color, 'icon', badge_icon, 'granted_at', now());
  update public.profiles
     set custom_badges = (select jsonb_agg(x) from (
           select elem as x from jsonb_array_elements(coalesce(custom_badges, '[]'::jsonb)) elem where elem->>'id' <> badge_id
           union all select badge
         ) s),
         updated_at = now()
   where id = target_user_id;
end $$;

grant execute on function public.admin_add_badge(uuid, text, text, text, text) to authenticated;

create or replace function public.admin_remove_badge(target_user_id uuid, badge_id text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(auth.uid()) then raise exception 'admin only'; end if;
  update public.profiles
     set custom_badges = coalesce((select jsonb_agg(elem) from jsonb_array_elements(custom_badges) elem where elem->>'id' <> badge_id), '[]'::jsonb),
         updated_at = now()
   where id = target_user_id;
end $$;

grant execute on function public.admin_remove_badge(uuid, text) to authenticated;

create or replace function public.admin_set_listing_flags(submission_id uuid, set_featured boolean default null, set_verified boolean default null, set_hot boolean default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(auth.uid()) then raise exception 'admin only'; end if;
  update public.pump_v5_submissions set
    is_featured = coalesce(set_featured, is_featured),
    is_verified = coalesce(set_verified, is_verified),
    is_hot = coalesce(set_hot, is_hot),
    updated_at = now()
  where id = submission_id;
end $$;

grant execute on function public.admin_set_listing_flags(uuid, boolean, boolean, boolean) to authenticated;

create or replace function public.admin_delete_listing(submission_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(auth.uid()) then raise exception 'admin only'; end if;
  delete from public.pump_v5_submissions where id = submission_id;
end $$;

grant execute on function public.admin_delete_listing(uuid) to authenticated;

create or replace function public.admin_update_ticket(ticket_id uuid, new_status public.support_status default null, new_priority text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(auth.uid()) then raise exception 'admin only'; end if;
  update public.support_tickets set
    status = coalesce(new_status, status),
    priority = coalesce(new_priority, priority),
    assignee_id = coalesce(assignee_id, auth.uid()),
    updated_at = now()
  where id = ticket_id;
end $$;

grant execute on function public.admin_update_ticket(uuid, public.support_status, text) to authenticated;

select '017_admin_action_rpcs applied' as status;
