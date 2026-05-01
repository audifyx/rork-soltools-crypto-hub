-- =====================================================================
-- Profiles social — banner uploads, custom verify "bags" / badges,
-- follow/unfollow RPCs, public profile lookup, admin badge controls.
-- =====================================================================

-- 1. Schema additions ------------------------------------------------------

alter table public.profiles
  add column if not exists display_name text,
  add column if not exists banner_url text,
  add column if not exists avatar_color text,
  add column if not exists banner_from text,
  add column if not exists banner_to text,
  add column if not exists custom_badges jsonb not null default '[]'::jsonb,
  add column if not exists is_banned boolean not null default false;

create index if not exists profiles_handle_lookup_idx on public.profiles ((lower(username::text)));

-- 2. Storage bucket for profile media -------------------------------------

insert into storage.buckets (id, name, public)
values ('profile-media', 'profile-media', true)
on conflict (id) do update set public = excluded.public;

do $$
begin
  -- Public read
  begin
    execute 'drop policy if exists "profile_media_public_read" on storage.objects';
  exception when others then null;
  end;
  execute $p$create policy "profile_media_public_read" on storage.objects
    for select using (bucket_id = 'profile-media')$p$;

  -- Owner write (path starts with auth.uid())
  begin
    execute 'drop policy if exists "profile_media_owner_write" on storage.objects';
  exception when others then null;
  end;
  execute $p$create policy "profile_media_owner_write" on storage.objects
    for insert with check (
      bucket_id = 'profile-media'
      and auth.uid() is not null
      and (storage.foldername(name))[1] = auth.uid()::text
    )$p$;

  begin
    execute 'drop policy if exists "profile_media_owner_update" on storage.objects';
  exception when others then null;
  end;
  execute $p$create policy "profile_media_owner_update" on storage.objects
    for update using (
      bucket_id = 'profile-media'
      and auth.uid() is not null
      and (storage.foldername(name))[1] = auth.uid()::text
    )$p$;

  begin
    execute 'drop policy if exists "profile_media_owner_delete" on storage.objects';
  exception when others then null;
  end;
  execute $p$create policy "profile_media_owner_delete" on storage.objects
    for delete using (
      bucket_id = 'profile-media'
      and auth.uid() is not null
      and (storage.foldername(name))[1] = auth.uid()::text
    )$p$;
end $$;

-- 3. Follow / unfollow RPC -------------------------------------------------

create or replace function public.toggle_follow(target_user_id uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  exists_row boolean;
begin
  if caller is null then
    raise exception 'not authenticated';
  end if;
  if caller = target_user_id then
    raise exception 'cannot follow yourself';
  end if;

  select exists(
    select 1 from public.followers
     where follower_id = caller and followee_id = target_user_id
  ) into exists_row;

  if exists_row then
    delete from public.followers
     where follower_id = caller and followee_id = target_user_id;
    return false;
  else
    insert into public.followers (follower_id, followee_id)
    values (caller, target_user_id)
    on conflict do nothing;
    return true;
  end if;
end $$;

grant execute on function public.toggle_follow(uuid) to authenticated;

-- 4. Public profile lookup -------------------------------------------------

create or replace function public.get_profile_by_handle(handle text)
returns table (
  id uuid,
  username text,
  display_name text,
  bio text,
  avatar_url text,
  banner_url text,
  avatar_color text,
  banner_from text,
  banner_to text,
  wallet_address text,
  twitter_handle text,
  website text,
  location text,
  badge text,
  verified boolean,
  custom_badges jsonb,
  followers_count integer,
  following_count integer,
  trades_count integer,
  win_rate numeric,
  pnl_pct numeric,
  xp integer,
  created_at timestamptz,
  is_following boolean
) language plpgsql security definer set search_path = public as $$
declare
  clean text := regexp_replace(handle, '^@', '');
  caller uuid := auth.uid();
begin
  return query
    select p.id,
           p.username::text,
           p.display_name,
           p.bio,
           p.avatar_url,
           p.banner_url,
           p.avatar_color,
           p.banner_from,
           p.banner_to,
           p.wallet_address,
           p.twitter_handle,
           p.website,
           p.location,
           p.badge,
           p.verified,
           p.custom_badges,
           p.followers_count,
           p.following_count,
           p.trades_count,
           p.win_rate,
           p.pnl_pct,
           p.xp,
           p.created_at,
           case when caller is null then false
                else exists(select 1 from public.followers f
                            where f.follower_id = caller and f.followee_id = p.id)
           end as is_following
      from public.profiles p
     where lower(p.username::text) = lower(clean);
end $$;

grant execute on function public.get_profile_by_handle(text) to authenticated, anon;

-- Lookup followers / following lists ---------------------------------------

create or replace function public.list_following(target_user_id uuid)
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  verified boolean,
  custom_badges jsonb
) language sql stable security definer set search_path = public as $$
  select p.id, p.username::text, p.display_name, p.avatar_url, p.verified, p.custom_badges
    from public.followers f
    join public.profiles p on p.id = f.followee_id
   where f.follower_id = target_user_id
   order by f.created_at desc
   limit 500
$$;

create or replace function public.list_followers(target_user_id uuid)
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  verified boolean,
  custom_badges jsonb
) language sql stable security definer set search_path = public as $$
  select p.id, p.username::text, p.display_name, p.avatar_url, p.verified, p.custom_badges
    from public.followers f
    join public.profiles p on p.id = f.follower_id
   where f.followee_id = target_user_id
   order by f.created_at desc
   limit 500
$$;

grant execute on function public.list_following(uuid) to authenticated, anon;
grant execute on function public.list_followers(uuid) to authenticated, anon;

-- 5. Admin: search + manage user badges -----------------------------------

create or replace function public.admin_search_users(q text default '', max_rows int default 50)
returns table (
  user_id uuid,
  email text,
  username text,
  display_name text,
  avatar_url text,
  verified boolean,
  badge text,
  custom_badges jsonb,
  is_banned boolean,
  followers_count integer,
  created_at timestamptz
) language plpgsql security definer set search_path = public as $$
declare
  needle text := nullif(trim(q), '');
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'admin only';
  end if;
  return query
    select p.id,
           u.email::text,
           p.username::text,
           p.display_name,
           p.avatar_url,
           p.verified,
           p.badge,
           p.custom_badges,
           p.is_banned,
           p.followers_count,
           p.created_at
      from public.profiles p
      left join auth.users u on u.id = p.id
     where needle is null
        or u.email::text ilike '%' || needle || '%'
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
declare
  caller uuid := auth.uid();
begin
  if not public.is_admin(caller) then
    raise exception 'admin only';
  end if;
  update public.profiles
     set verified = coalesce(set_verified, verified),
         badge    = coalesce(set_badge, badge),
         is_banned = coalesce(set_banned, is_banned),
         updated_at = now()
   where id = target_user_id;

  insert into public.admin_audit_log (admin_id, action, target_type, target_id, meta)
  values (caller, 'user_flags', 'profiles', target_user_id::text,
          json_build_object('verified', set_verified, 'badge', set_badge, 'banned', set_banned)::jsonb);
end $$;

grant execute on function public.admin_set_user_flags(uuid, boolean, text, boolean) to authenticated;

create or replace function public.admin_add_badge(
  target_user_id uuid,
  badge_id text,
  badge_label text,
  badge_color text default '#FFD56B',
  badge_icon text default 'shield'
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  current jsonb;
  next jsonb;
begin
  if not public.is_admin(caller) then
    raise exception 'admin only';
  end if;
  select coalesce(custom_badges, '[]'::jsonb) into current
    from public.profiles where id = target_user_id;
  if current is null then
    raise exception 'user not found';
  end if;

  -- remove any existing entry with same id, then append
  next := coalesce(
    (select jsonb_agg(b) from jsonb_array_elements(current) b
       where coalesce(b->>'id','') <> badge_id),
    '[]'::jsonb
  );
  next := next || jsonb_build_array(jsonb_build_object(
    'id', badge_id,
    'label', badge_label,
    'color', coalesce(badge_color, '#FFD56B'),
    'icon', coalesce(badge_icon, 'shield'),
    'granted_at', to_jsonb(now())
  ));

  update public.profiles set custom_badges = next, updated_at = now()
   where id = target_user_id;

  insert into public.admin_audit_log (admin_id, action, target_type, target_id, meta)
  values (caller, 'badge_grant', 'profiles', target_user_id::text,
          jsonb_build_object('id', badge_id, 'label', badge_label, 'color', badge_color, 'icon', badge_icon));

  return next;
end $$;

create or replace function public.admin_remove_badge(target_user_id uuid, badge_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  current jsonb;
  next jsonb;
begin
  if not public.is_admin(caller) then
    raise exception 'admin only';
  end if;
  select coalesce(custom_badges, '[]'::jsonb) into current
    from public.profiles where id = target_user_id;
  next := coalesce(
    (select jsonb_agg(b) from jsonb_array_elements(current) b
       where coalesce(b->>'id','') <> badge_id),
    '[]'::jsonb
  );
  update public.profiles set custom_badges = next, updated_at = now()
   where id = target_user_id;

  insert into public.admin_audit_log (admin_id, action, target_type, target_id, meta)
  values (caller, 'badge_revoke', 'profiles', target_user_id::text,
          jsonb_build_object('id', badge_id));
  return next;
end $$;

grant execute on function public.admin_add_badge(uuid, text, text, text, text) to authenticated;
grant execute on function public.admin_remove_badge(uuid, text) to authenticated;

-- 6. Public profile search (for following discovery) ---------------------

create or replace function public.search_profiles(q text, max_rows int default 25)
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  verified boolean,
  custom_badges jsonb,
  followers_count integer
) language sql stable security definer set search_path = public as $$
  select p.id, p.username::text, p.display_name, p.avatar_url, p.verified,
         p.custom_badges, p.followers_count
    from public.profiles p
   where length(trim(coalesce(q,''))) = 0
      or p.username::text ilike '%' || trim(q) || '%'
      or p.display_name ilike '%' || trim(q) || '%'
   order by p.followers_count desc, p.created_at desc
   limit greatest(1, least(max_rows, 100))
$$;

grant execute on function public.search_profiles(text, int) to authenticated, anon;
