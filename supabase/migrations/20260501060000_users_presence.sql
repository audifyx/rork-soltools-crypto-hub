-- =====================================================================
-- Users + Presence
--
-- 1. Hardens the public storage buckets used for profile avatar/banner
--    uploads (and post images), so any signed-in user can write to
--    their own folder and read all media.
-- 2. Adds a `user_presence` table with realtime online tracking.
-- 3. Adds RPCs to heartbeat presence and to list all users / online
--    users for the new in-app Users tab.
--
-- Safe to run multiple times.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Storage buckets (idempotent) -------------------------------------
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public) values
  ('profile-media', 'profile-media', true),
  ('post-images',   'post-images',   true)
on conflict (id) do update set public = excluded.public;

do $$
declare
  buckets text[] := array['profile-media','post-images'];
  b text;
begin
  foreach b in array buckets loop
    execute format('drop policy if exists %I on storage.objects', b || '_public_read');
    execute format('drop policy if exists %I on storage.objects', b || '_owner_insert');
    execute format('drop policy if exists %I on storage.objects', b || '_owner_update');
    execute format('drop policy if exists %I on storage.objects', b || '_owner_delete');

    execute format(
      $p$create policy %I on storage.objects for select using (bucket_id = %L)$p$,
      b || '_public_read', b
    );
    execute format(
      $p$create policy %I on storage.objects for insert to authenticated
         with check (bucket_id = %L and (storage.foldername(name))[1] = auth.uid()::text)$p$,
      b || '_owner_insert', b
    );
    execute format(
      $p$create policy %I on storage.objects for update to authenticated
         using (bucket_id = %L and (storage.foldername(name))[1] = auth.uid()::text)
         with check (bucket_id = %L and (storage.foldername(name))[1] = auth.uid()::text)$p$,
      b || '_owner_update', b, b
    );
    execute format(
      $p$create policy %I on storage.objects for delete to authenticated
         using (bucket_id = %L and (storage.foldername(name))[1] = auth.uid()::text)$p$,
      b || '_owner_delete', b
    );
  end loop;
end $$;


-- ---------------------------------------------------------------------
-- 2. Presence table ---------------------------------------------------
-- ---------------------------------------------------------------------
create table if not exists public.user_presence (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  status     text not null default 'online' check (status in ('online','away','offline')),
  last_seen  timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_presence_last_seen_idx
  on public.user_presence (last_seen desc);

alter table public.user_presence enable row level security;

drop policy if exists user_presence_read on public.user_presence;
create policy user_presence_read on public.user_presence
  for select using (true);

drop policy if exists user_presence_self_write on public.user_presence;
create policy user_presence_self_write on public.user_presence
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists user_presence_self_update on public.user_presence;
create policy user_presence_self_update on public.user_presence
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Realtime publication
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'user_presence'
  ) then
    execute 'alter publication supabase_realtime add table public.user_presence';
  end if;
exception when others then null;
end $$;


-- ---------------------------------------------------------------------
-- 3. RPCs --------------------------------------------------------------
-- ---------------------------------------------------------------------

-- Heartbeat: caller is online right now.
create or replace function public.heartbeat(set_status text default 'online')
returns void
language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  s text := coalesce(nullif(set_status, ''), 'online');
begin
  if caller is null then
    return;
  end if;
  if s not in ('online','away','offline') then
    s := 'online';
  end if;
  insert into public.user_presence (user_id, status, last_seen, updated_at)
  values (caller, s, now(), now())
  on conflict (user_id) do update
    set status = excluded.status,
        last_seen = excluded.last_seen,
        updated_at = now();
end $$;

grant execute on function public.heartbeat(text) to authenticated;

-- Sign-out helper: mark caller offline.
create or replace function public.set_offline()
returns void
language plpgsql security definer set search_path = public as $$
declare caller uuid := auth.uid();
begin
  if caller is null then return; end if;
  update public.user_presence
     set status = 'offline', updated_at = now()
   where user_id = caller;
end $$;

grant execute on function public.set_offline() to authenticated;

-- List users for the Users tab.
-- `online_only`=true filters to last_seen within 90 seconds.
create or replace function public.list_users(
  q text default '',
  online_only boolean default false,
  max_rows int default 100
) returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  banner_url text,
  bio text,
  verified boolean,
  custom_badges jsonb,
  followers_count integer,
  is_online boolean,
  last_seen timestamptz,
  created_at timestamptz,
  is_following boolean
) language plpgsql stable security definer set search_path = public as $$
declare
  needle text := nullif(trim(q), '');
  caller uuid := auth.uid();
  cutoff timestamptz := now() - interval '90 seconds';
begin
  return query
    select p.id,
           p.username::text,
           p.display_name,
           p.avatar_url,
           p.banner_url,
           p.bio,
           p.verified,
           coalesce(p.custom_badges, '[]'::jsonb),
           p.followers_count,
           coalesce(pr.last_seen >= cutoff and pr.status <> 'offline', false) as is_online,
           pr.last_seen,
           p.created_at,
           case when caller is null then false
                else exists(select 1 from public.followers f
                             where f.follower_id = caller and f.followee_id = p.id)
           end as is_following
      from public.profiles p
      left join public.user_presence pr on pr.user_id = p.id
     where coalesce(p.is_banned, false) = false
       and (
         needle is null
         or p.username::text ilike '%' || needle || '%'
         or p.display_name ilike '%' || needle || '%'
       )
       and (
         online_only is not true
         or (pr.last_seen >= cutoff and pr.status <> 'offline')
       )
     order by
       (pr.last_seen >= cutoff and pr.status <> 'offline') desc nulls last,
       pr.last_seen desc nulls last,
       p.followers_count desc,
       p.created_at desc
     limit greatest(1, least(max_rows, 500));
end $$;

grant execute on function public.list_users(text, boolean, int) to authenticated, anon;

-- Quick stat helper for the Users tab header.
create or replace function public.users_overview()
returns table (
  total_users bigint,
  online_users bigint,
  new_today bigint
) language sql stable security definer set search_path = public as $$
  select
    (select count(*)::bigint from public.profiles where coalesce(is_banned,false) = false),
    (select count(*)::bigint from public.user_presence
       where last_seen >= now() - interval '90 seconds'
         and status <> 'offline'),
    (select count(*)::bigint from public.profiles
       where created_at >= date_trunc('day', now())
         and coalesce(is_banned,false) = false)
$$;

grant execute on function public.users_overview() to authenticated, anon;


-- ---------------------------------------------------------------------
-- 4. Profile self-update RPC (avatar / banner / bio / etc.) ----------
-- ---------------------------------------------------------------------
create or replace function public.update_my_profile(
  set_display_name text default null,
  set_username     text default null,
  set_bio          text default null,
  set_avatar_url   text default null,
  set_banner_url   text default null,
  set_avatar_color text default null,
  set_banner_from  text default null,
  set_banner_to    text default null,
  set_wallet       text default null,
  set_twitter      text default null,
  set_website      text default null,
  set_location     text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'not authenticated';
  end if;

  insert into public.profiles (id, user_id, username, display_name)
  values (
    caller, caller,
    coalesce(set_username, 'user_' || substr(caller::text, 1, 6)),
    coalesce(set_display_name, set_username, 'New User')
  )
  on conflict (id) do nothing;

  update public.profiles
     set display_name   = coalesce(set_display_name, display_name),
         username       = coalesce(set_username, username),
         bio            = coalesce(set_bio, bio),
         avatar_url     = coalesce(set_avatar_url, avatar_url),
         banner_url     = coalesce(set_banner_url, banner_url),
         avatar_color   = coalesce(set_avatar_color, avatar_color),
         banner_from    = coalesce(set_banner_from, banner_from),
         banner_to      = coalesce(set_banner_to, banner_to),
         wallet_address = coalesce(set_wallet, wallet_address),
         twitter_handle = coalesce(set_twitter, twitter_handle),
         website        = coalesce(set_website, website),
         location       = coalesce(set_location, location),
         updated_at     = now()
   where id = caller;
end $$;

grant execute on function public.update_my_profile(
  text, text, text, text, text, text, text, text, text, text, text, text
) to authenticated;
