-- =====================================================================
-- USERS TAB — full schema, RPCs, RLS, realtime
-- =====================================================================
-- One-shot, idempotent migration that powers the in-app Users tab:
--   • Profiles columns the Users UI reads
--   • user_presence table + heartbeat / set_offline RPCs
--   • list_users / users_overview / search_profiles RPCs
--   • toggle_follow + follow notifications
--   • list_followers / list_following RPCs
--   • Trader leaderboard RPC (real, not derived)
--   • RLS, realtime publication, indexes
--
-- Safe to re-run.
-- =====================================================================

-- 0. Extensions ------------------------------------------------------
create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;
create extension if not exists citext;
create extension if not exists pg_trgm;

-- 1. Profiles columns -----------------------------------------------
alter table public.profiles
  add column if not exists display_name    text,
  add column if not exists bio             text,
  add column if not exists avatar_url      text,
  add column if not exists banner_url      text,
  add column if not exists avatar_color    text,
  add column if not exists banner_from     text,
  add column if not exists banner_to       text,
  add column if not exists wallet_address  text,
  add column if not exists twitter_handle  text,
  add column if not exists website         text,
  add column if not exists location        text,
  add column if not exists badge           text default 'Recruit',
  add column if not exists verified        boolean not null default false,
  add column if not exists custom_badges   jsonb   not null default '[]'::jsonb,
  add column if not exists is_banned       boolean not null default false,
  add column if not exists followers_count integer not null default 0,
  add column if not exists following_count integer not null default 0,
  add column if not exists trades_count    integer not null default 0,
  add column if not exists win_rate        numeric(6,2)  not null default 0,
  add column if not exists pnl_pct         numeric(10,2) not null default 0,
  add column if not exists volume_usd      numeric(18,2) not null default 0,
  add column if not exists xp              integer not null default 0,
  add column if not exists last_seen_at    timestamptz,
  add column if not exists status          text default 'offline',
  add column if not exists created_at      timestamptz not null default now(),
  add column if not exists updated_at      timestamptz not null default now();

create index if not exists profiles_handle_lookup_idx on public.profiles ((lower(username::text)));
create index if not exists profiles_followers_idx     on public.profiles (followers_count desc);
create index if not exists profiles_pnl_idx           on public.profiles (pnl_pct desc);
create index if not exists profiles_winrate_idx       on public.profiles (win_rate desc);
create index if not exists profiles_volume_idx        on public.profiles (volume_usd desc);

-- 2. Presence table --------------------------------------------------
create table if not exists public.user_presence (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  status     text not null default 'online' check (status in ('online','away','offline')),
  last_seen  timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists user_presence_last_seen_idx on public.user_presence (last_seen desc);

alter table public.user_presence enable row level security;

drop policy if exists user_presence_read         on public.user_presence;
drop policy if exists user_presence_self_write   on public.user_presence;
drop policy if exists user_presence_self_update  on public.user_presence;
create policy user_presence_read        on public.user_presence for select using (true);
create policy user_presence_self_write  on public.user_presence for insert to authenticated
  with check (auth.uid() = user_id);
create policy user_presence_self_update on public.user_presence for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 3. RLS for profiles + followers -----------------------------------
alter table public.profiles  enable row level security;
alter table public.followers enable row level security;

do $$
begin
  begin execute 'drop policy if exists "profiles_read"        on public.profiles'; exception when others then null; end;
  begin execute 'drop policy if exists "profiles_update_self" on public.profiles'; exception when others then null; end;
  begin execute 'drop policy if exists "profiles_insert_self" on public.profiles'; exception when others then null; end;
  execute $p$create policy "profiles_read"        on public.profiles for select using (true)$p$;
  execute $p$create policy "profiles_update_self" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id)$p$;
  execute $p$create policy "profiles_insert_self" on public.profiles for insert with check (auth.uid() = id)$p$;

  begin execute 'drop policy if exists "followers_read"        on public.followers'; exception when others then null; end;
  begin execute 'drop policy if exists "followers_write_self"  on public.followers'; exception when others then null; end;
  begin execute 'drop policy if exists "followers_delete_self" on public.followers'; exception when others then null; end;
  execute $p$create policy "followers_read"        on public.followers for select using (true)$p$;
  execute $p$create policy "followers_write_self"  on public.followers for insert with check (auth.uid() = follower_id)$p$;
  execute $p$create policy "followers_delete_self" on public.followers for delete using (auth.uid() = follower_id)$p$;
end $$;

-- 4. Heartbeat / Offline RPCs ---------------------------------------
create or replace function public.heartbeat(set_status text default 'online')
returns void language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  s text := coalesce(nullif(set_status, ''), 'online');
begin
  if caller is null then return; end if;
  if s not in ('online','away','offline') then s := 'online'; end if;
  insert into public.user_presence (user_id, status, last_seen, updated_at)
  values (caller, s, now(), now())
  on conflict (user_id) do update
    set status     = excluded.status,
        last_seen  = excluded.last_seen,
        updated_at = now();

  update public.profiles
     set last_seen_at = now(),
         status       = s,
         updated_at   = now()
   where id = caller;
end $$;
grant execute on function public.heartbeat(text) to authenticated;

create or replace function public.set_offline()
returns void language plpgsql security definer set search_path = public as $$
declare caller uuid := auth.uid();
begin
  if caller is null then return; end if;
  update public.user_presence
     set status = 'offline', updated_at = now()
   where user_id = caller;
  update public.profiles
     set status = 'offline', last_seen_at = now(), updated_at = now()
   where id = caller;
end $$;
grant execute on function public.set_offline() to authenticated;

-- 5. List users for the Users tab -----------------------------------
create or replace function public.list_users(
  q           text default '',
  online_only boolean default false,
  max_rows    int default 200
) returns table (
  user_id        uuid,
  username       text,
  display_name   text,
  avatar_url     text,
  banner_url     text,
  bio            text,
  verified       boolean,
  custom_badges  jsonb,
  followers_count integer,
  is_online      boolean,
  last_seen      timestamptz,
  created_at     timestamptz,
  is_following   boolean
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
         or p.display_name   ilike '%' || needle || '%'
       )
       and (
         online_only is not true
         or (pr.last_seen >= cutoff and pr.status <> 'offline')
       )
     order by
       (pr.last_seen >= cutoff and pr.status <> 'offline') desc nulls last,
       pr.last_seen           desc nulls last,
       p.followers_count      desc,
       p.created_at           desc
     limit greatest(1, least(max_rows, 500));
end $$;
grant execute on function public.list_users(text, boolean, int) to authenticated, anon;

-- 6. Users overview --------------------------------------------------
create or replace function public.users_overview()
returns table (
  total_users  bigint,
  online_users bigint,
  new_today    bigint
) language sql stable security definer set search_path = public as $$
  select
    (select count(*)::bigint from public.profiles where coalesce(is_banned,false) = false),
    (select count(*)::bigint from public.user_presence
       where last_seen >= now() - interval '90 seconds' and status <> 'offline'),
    (select count(*)::bigint from public.profiles
       where created_at >= date_trunc('day', now()) and coalesce(is_banned,false) = false)
$$;
grant execute on function public.users_overview() to authenticated, anon;

-- 7. Search profiles -------------------------------------------------
create or replace function public.search_profiles(q text, max_rows int default 25)
returns table (
  user_id        uuid,
  username       text,
  display_name   text,
  avatar_url     text,
  verified       boolean,
  custom_badges  jsonb,
  followers_count integer
) language plpgsql stable security definer set search_path = public as $$
declare needle text := nullif(trim(q), '');
begin
  return query
    select p.id, p.username::text, p.display_name, p.avatar_url,
           p.verified, coalesce(p.custom_badges, '[]'::jsonb), p.followers_count
      from public.profiles p
     where coalesce(p.is_banned,false) = false
       and (
         needle is null
         or p.username::text ilike '%' || needle || '%'
         or p.display_name   ilike '%' || needle || '%'
       )
     order by p.followers_count desc, p.created_at desc
     limit greatest(1, least(max_rows, 100));
end $$;
grant execute on function public.search_profiles(text, int) to authenticated, anon;

-- 8. Toggle follow + counts + notification --------------------------
create or replace function public.toggle_follow(target_user_id uuid)
returns table (following boolean, followers_count integer)
language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  exists_row boolean;
  cur_count integer;
begin
  if caller is null then raise exception 'not authenticated'; end if;
  if caller = target_user_id then raise exception 'cannot follow yourself'; end if;

  select exists(select 1 from public.followers
                 where follower_id = caller and followee_id = target_user_id)
    into exists_row;

  if exists_row then
    delete from public.followers
     where follower_id = caller and followee_id = target_user_id;
    select p.followers_count into cur_count from public.profiles p where p.id = target_user_id;
    return query select false, coalesce(cur_count, 0);
  else
    insert into public.followers (follower_id, followee_id)
    values (caller, target_user_id)
    on conflict do nothing;
    select p.followers_count into cur_count from public.profiles p where p.id = target_user_id;
    return query select true, coalesce(cur_count, 0);
  end if;
end $$;
grant execute on function public.toggle_follow(uuid) to authenticated;

-- 9. List followers / following -------------------------------------
create or replace function public.list_followers(target_user_id uuid)
returns table (
  user_id       uuid,
  username      text,
  display_name  text,
  avatar_url    text,
  verified      boolean,
  custom_badges jsonb
) language sql stable security definer set search_path = public as $$
  select p.id, p.username::text, p.display_name, p.avatar_url, p.verified,
         coalesce(p.custom_badges, '[]'::jsonb)
    from public.followers f
    join public.profiles  p on p.id = f.follower_id
   where f.followee_id = target_user_id
     and coalesce(p.is_banned,false) = false
   order by f.created_at desc
   limit 500;
$$;
grant execute on function public.list_followers(uuid) to authenticated, anon;

create or replace function public.list_following(target_user_id uuid)
returns table (
  user_id       uuid,
  username      text,
  display_name  text,
  avatar_url    text,
  verified      boolean,
  custom_badges jsonb
) language sql stable security definer set search_path = public as $$
  select p.id, p.username::text, p.display_name, p.avatar_url, p.verified,
         coalesce(p.custom_badges, '[]'::jsonb)
    from public.followers f
    join public.profiles  p on p.id = f.followee_id
   where f.follower_id = target_user_id
     and coalesce(p.is_banned,false) = false
   order by f.created_at desc
   limit 500;
$$;
grant execute on function public.list_following(uuid) to authenticated, anon;

-- 10. Trader leaderboard --------------------------------------------
create or replace function public.users_leaderboard(
  kind     text default 'pnl',     -- 'pnl' | 'winrate' | 'volume' | 'followers'
  max_rows int  default 25
) returns table (
  user_id        uuid,
  username       text,
  display_name   text,
  avatar_url     text,
  verified       boolean,
  custom_badges  jsonb,
  followers_count integer,
  trades_count   integer,
  pnl_pct        numeric,
  win_rate       numeric,
  volume_usd     numeric
) language plpgsql stable security definer set search_path = public as $$
declare k text := lower(coalesce(kind,'pnl'));
begin
  if k not in ('pnl','winrate','volume','followers') then k := 'pnl'; end if;

  return query
    select p.id, p.username::text, p.display_name, p.avatar_url, p.verified,
           coalesce(p.custom_badges, '[]'::jsonb),
           p.followers_count, p.trades_count,
           p.pnl_pct, p.win_rate, p.volume_usd
      from public.profiles p
     where coalesce(p.is_banned,false) = false
     order by
       case when k = 'pnl'       then p.pnl_pct       end desc nulls last,
       case when k = 'winrate'   then p.win_rate      end desc nulls last,
       case when k = 'volume'    then p.volume_usd    end desc nulls last,
       case when k = 'followers' then p.followers_count end desc nulls last,
       p.created_at desc
     limit greatest(1, least(max_rows, 100));
end $$;
grant execute on function public.users_leaderboard(text, int) to authenticated, anon;

-- 11. Follower-count + notification trigger -------------------------
create or replace function public.handle_followers_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.profiles set followers_count = followers_count + 1 where id = new.followee_id;
    update public.profiles set following_count = following_count + 1 where id = new.follower_id;
    begin
      insert into public.notifications (user_id, actor_id, type, title, body)
      values (new.followee_id, new.follower_id, 'follow', 'New follower',
              'Someone just followed you');
    exception when undefined_table then null;
              when others then null;
    end;
    return new;
  elsif tg_op = 'DELETE' then
    update public.profiles set followers_count = greatest(0, followers_count - 1) where id = old.followee_id;
    update public.profiles set following_count = greatest(0, following_count - 1) where id = old.follower_id;
    return old;
  end if;
  return null;
end $$;

drop trigger if exists trg_followers_ins on public.followers;
drop trigger if exists trg_followers_del on public.followers;
create trigger trg_followers_ins after insert on public.followers
  for each row execute function public.handle_followers_change();
create trigger trg_followers_del after delete on public.followers
  for each row execute function public.handle_followers_change();

-- 12. Re-sync follower / following counts ---------------------------
update public.profiles p
   set followers_count = coalesce((select count(*) from public.followers f where f.followee_id = p.id), 0),
       following_count = coalesce((select count(*) from public.followers f where f.follower_id = p.id), 0);

-- 13. Realtime publication ------------------------------------------
do $$
declare
  t text;
  tables text[] := array['profiles','followers','user_presence','notifications'];
begin
  foreach t in array tables loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
              when undefined_object  then null;
              when others            then null;
    end;
  end loop;
end $$;

-- 14. Auto-mark stale presence as offline (read-time helper) --------
create or replace function public.sweep_presence()
returns void language sql security definer set search_path = public as $$
  update public.user_presence
     set status = 'offline', updated_at = now()
   where status <> 'offline'
     and last_seen < now() - interval '5 minutes';
$$;
grant execute on function public.sweep_presence() to authenticated, anon;

-- =====================================================================
-- DONE
-- =====================================================================
