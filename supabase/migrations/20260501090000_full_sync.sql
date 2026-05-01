-- =====================================================================
-- FULL SYNC MIGRATION
-- =====================================================================
-- One-shot, idempotent migration that aligns the database with every
-- table, column, view, RPC, trigger, RLS policy, realtime publication
-- and storage bucket the frontend currently expects.
--
-- Safe to re-run. Each statement uses IF NOT EXISTS / CREATE OR REPLACE
-- / DROP IF EXISTS guards.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Required extensions
-- ---------------------------------------------------------------------
create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;
create extension if not exists citext;
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------
-- 1. Profiles — make sure every column the UI reads exists
-- ---------------------------------------------------------------------
alter table public.profiles
  add column if not exists display_name   text,
  add column if not exists bio            text,
  add column if not exists avatar_url     text,
  add column if not exists banner_url     text,
  add column if not exists avatar_color   text,
  add column if not exists banner_from    text,
  add column if not exists banner_to      text,
  add column if not exists wallet_address text,
  add column if not exists twitter_handle text,
  add column if not exists website        text,
  add column if not exists location       text,
  add column if not exists badge          text default 'Recruit',
  add column if not exists verified       boolean not null default false,
  add column if not exists custom_badges  jsonb   not null default '[]'::jsonb,
  add column if not exists is_banned      boolean not null default false,
  add column if not exists followers_count integer not null default 0,
  add column if not exists following_count integer not null default 0,
  add column if not exists trades_count    integer not null default 0,
  add column if not exists win_rate        numeric(6,2)  not null default 0,
  add column if not exists pnl_pct         numeric(10,2) not null default 0,
  add column if not exists xp              integer not null default 0,
  add column if not exists last_seen_at    timestamptz,
  add column if not exists status          text default 'offline',
  add column if not exists created_at      timestamptz not null default now(),
  add column if not exists updated_at      timestamptz not null default now();

create index if not exists profiles_handle_lookup_idx
  on public.profiles ((lower(username::text)));
create index if not exists profiles_followers_idx
  on public.profiles (followers_count desc);

-- ---------------------------------------------------------------------
-- 2. follows view — code uses .from("follows") but table is followers
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'follows'
  ) then
    execute 'create or replace view public.follows as
             select follower_id, followee_id, created_at
               from public.followers';
  end if;
end $$;

grant select, insert, delete on public.follows to authenticated;
grant select on public.follows to anon;

-- ---------------------------------------------------------------------
-- 3. Communities — ensure all UI columns exist
-- ---------------------------------------------------------------------
alter table public.communities
  add column if not exists category       text not null default 'alpha',
  add column if not exists icon_emoji     text not null default '✨',
  add column if not exists accent_a       text,
  add column if not exists accent_b       text,
  add column if not exists verified       boolean not null default false,
  add column if not exists trending       boolean not null default false,
  add column if not exists pinned_ticker  text,
  add column if not exists rules          jsonb  not null default '[]'::jsonb,
  add column if not exists tags           jsonb  not null default '[]'::jsonb,
  add column if not exists posts_count    integer not null default 0,
  add column if not exists online_count   integer not null default 0,
  add column if not exists is_private     boolean not null default false,
  add column if not exists banner_url     text,
  add column if not exists avatar_url     text;

create index if not exists communities_category_idx on public.communities (category);
create index if not exists communities_trending_idx on public.communities (trending) where trending = true;

-- ---------------------------------------------------------------------
-- 4. Community posts — UI needs likes/comments/ticker/change_pct
-- ---------------------------------------------------------------------
alter table public.community_posts
  add column if not exists ticker          text,
  add column if not exists change_pct      numeric(10,4),
  add column if not exists image_url       text,
  add column if not exists likes_count     integer not null default 0,
  add column if not exists comments_count  integer not null default 0,
  add column if not exists reposts_count   integer not null default 0,
  add column if not exists pinned          boolean not null default false;

-- ---------------------------------------------------------------------
-- 5. LiveKit rooms — voice/spaces UI columns
-- ---------------------------------------------------------------------
alter table public.livekit_rooms
  add column if not exists topic            text not null default 'GENERAL',
  add column if not exists description      text not null default '',
  add column if not exists accent_a         text,
  add column if not exists accent_b         text,
  add column if not exists category         text not null default 'alpha',
  add column if not exists recording        boolean not null default false,
  add column if not exists scheduled_at     timestamptz,
  add column if not exists raised_hands     integer not null default 0,
  add column if not exists listeners_count  integer not null default 0,
  add column if not exists speakers_count   integer not null default 0;

-- Maintain participant counts on the room ----------------------------
create or replace function public.handle_livekit_participant_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.livekit_rooms
       set listeners_count = (
             select count(*) from public.livekit_participants
              where room_id = new.room_id and left_at is null and role = 'listener'),
           speakers_count = (
             select count(*) from public.livekit_participants
              where room_id = new.room_id and left_at is null and role in ('speaker','host'))
     where id = new.room_id;
    return new;
  elsif tg_op = 'UPDATE' or tg_op = 'DELETE' then
    update public.livekit_rooms
       set listeners_count = (
             select count(*) from public.livekit_participants
              where room_id = coalesce(new.room_id, old.room_id)
                and left_at is null and role = 'listener'),
           speakers_count = (
             select count(*) from public.livekit_participants
              where room_id = coalesce(new.room_id, old.room_id)
                and left_at is null and role in ('speaker','host'))
     where id = coalesce(new.room_id, old.room_id);
    return coalesce(new, old);
  end if;
  return null;
end $$;

drop trigger if exists trg_livekit_part_change on public.livekit_participants;
create trigger trg_livekit_part_change
after insert or update or delete on public.livekit_participants
for each row execute function public.handle_livekit_participant_change();

-- ---------------------------------------------------------------------
-- 6. Notifications table (UI-friendly schema)
-- ---------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  type text not null,
  title text,
  body  text,
  data  jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx
  on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;
do $$
begin
  begin execute 'drop policy if exists "notif_owner_read"   on public.notifications'; exception when others then null; end;
  begin execute 'drop policy if exists "notif_owner_update" on public.notifications'; exception when others then null; end;
  begin execute 'drop policy if exists "notif_owner_delete" on public.notifications'; exception when others then null; end;
  execute $p$create policy "notif_owner_read"   on public.notifications for select using (auth.uid() = user_id)$p$;
  execute $p$create policy "notif_owner_update" on public.notifications for update using (auth.uid() = user_id)$p$;
  execute $p$create policy "notif_owner_delete" on public.notifications for delete using (auth.uid() = user_id)$p$;
end $$;

-- ---------------------------------------------------------------------
-- 7. Direct messages
-- ---------------------------------------------------------------------
create table if not exists public.dm_threads (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references auth.users(id) on delete cascade,
  user_b uuid not null references auth.users(id) on delete cascade,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_a, user_b),
  check (user_a < user_b)
);
create index if not exists dm_threads_user_a_idx on public.dm_threads (user_a, last_message_at desc);
create index if not exists dm_threads_user_b_idx on public.dm_threads (user_b, last_message_at desc);

create table if not exists public.dm_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.dm_threads(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  attachments jsonb not null default '[]'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists dm_messages_thread_idx on public.dm_messages (thread_id, created_at desc);

alter table public.dm_threads  enable row level security;
alter table public.dm_messages enable row level security;

do $$
begin
  begin execute 'drop policy if exists "dm_thread_participants" on public.dm_threads'; exception when others then null; end;
  execute $p$create policy "dm_thread_participants" on public.dm_threads
    for all using (auth.uid() = user_a or auth.uid() = user_b)
        with check (auth.uid() = user_a or auth.uid() = user_b)$p$;

  begin execute 'drop policy if exists "dm_msg_participants_read"  on public.dm_messages'; exception when others then null; end;
  begin execute 'drop policy if exists "dm_msg_participants_write" on public.dm_messages'; exception when others then null; end;
  execute $p$create policy "dm_msg_participants_read" on public.dm_messages
    for select using (exists (
      select 1 from public.dm_threads t
       where t.id = thread_id and (auth.uid() = t.user_a or auth.uid() = t.user_b)
    ))$p$;
  execute $p$create policy "dm_msg_participants_write" on public.dm_messages
    for insert with check (
      auth.uid() = sender_id
      and exists (
        select 1 from public.dm_threads t
         where t.id = thread_id and (auth.uid() = t.user_a or auth.uid() = t.user_b)
      )
    )$p$;
end $$;

-- Bump thread last_message_at on insert
create or replace function public.handle_dm_message_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.dm_threads
     set last_message_at = new.created_at
   where id = new.thread_id;
  return new;
end $$;

drop trigger if exists trg_dm_message_insert on public.dm_messages;
create trigger trg_dm_message_insert
after insert on public.dm_messages
for each row execute function public.handle_dm_message_insert();

-- Helper: open or fetch a DM thread between two users
create or replace function public.dm_open_thread(other_user_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  a uuid;
  b uuid;
  tid uuid;
begin
  if caller is null then raise exception 'not authenticated'; end if;
  if caller = other_user_id then raise exception 'cannot DM yourself'; end if;
  if caller < other_user_id then a := caller; b := other_user_id;
  else a := other_user_id; b := caller; end if;

  select id into tid from public.dm_threads where user_a = a and user_b = b;
  if tid is null then
    insert into public.dm_threads (user_a, user_b) values (a, b)
    returning id into tid;
  end if;
  return tid;
end $$;

grant execute on function public.dm_open_thread(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 8. Comments on community posts
-- ---------------------------------------------------------------------
create table if not exists public.community_post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);
create index if not exists post_comments_post_idx
  on public.community_post_comments (post_id, created_at desc);

alter table public.community_post_comments enable row level security;
do $$
begin
  begin execute 'drop policy if exists "comments_read"        on public.community_post_comments'; exception when others then null; end;
  begin execute 'drop policy if exists "comments_write_self"  on public.community_post_comments'; exception when others then null; end;
  begin execute 'drop policy if exists "comments_delete_self" on public.community_post_comments'; exception when others then null; end;
  execute $p$create policy "comments_read"        on public.community_post_comments for select using (true)$p$;
  execute $p$create policy "comments_write_self"  on public.community_post_comments for insert with check (auth.uid() = user_id)$p$;
  execute $p$create policy "comments_delete_self" on public.community_post_comments for delete using (auth.uid() = user_id)$p$;
end $$;

create or replace function public.handle_post_comment_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.community_posts
       set comments_count = comments_count + 1
     where id = new.post_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.community_posts
       set comments_count = greatest(0, comments_count - 1)
     where id = old.post_id;
    return old;
  end if;
  return null;
end $$;

drop trigger if exists trg_post_comments_change on public.community_post_comments;
create trigger trg_post_comments_change
after insert or delete on public.community_post_comments
for each row execute function public.handle_post_comment_change();

-- ---------------------------------------------------------------------
-- 9. Toggle post like RPC (idempotent, returns liked + count)
-- ---------------------------------------------------------------------
create or replace function public.toggle_post_like(target_post_id uuid)
returns table (liked boolean, likes_count integer)
language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  exists_row boolean;
  cur_count integer;
begin
  if caller is null then raise exception 'not authenticated'; end if;

  select exists(select 1 from public.post_likes
                 where post_id = target_post_id and user_id = caller)
    into exists_row;

  if exists_row then
    delete from public.post_likes
     where post_id = target_post_id and user_id = caller;
    select cp.likes_count into cur_count from public.community_posts cp where cp.id = target_post_id;
    return query select false, coalesce(cur_count, 0);
  else
    insert into public.post_likes (post_id, user_id)
    values (target_post_id, caller)
    on conflict do nothing;
    select cp.likes_count into cur_count from public.community_posts cp where cp.id = target_post_id;
    return query select true, coalesce(cur_count, 0);
  end if;
end $$;

grant execute on function public.toggle_post_like(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 10. Auto-create profile on auth signup (idempotent)
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  base_username text;
  candidate    text;
  i            int := 0;
begin
  base_username := lower(coalesce(
    new.raw_user_meta_data->>'username',
    split_part(new.email, '@', 1),
    'user'
  ));
  base_username := regexp_replace(base_username, '[^a-z0-9_]+', '', 'g');
  if length(base_username) < 3 then
    base_username := base_username || substr(replace(new.id::text, '-', ''), 1, 6);
  end if;
  candidate := base_username;
  while exists(select 1 from public.profiles where lower(username::text) = candidate) loop
    i := i + 1;
    candidate := base_username || i::text;
    exit when i > 50;
  end loop;

  insert into public.profiles (id, user_id, username, display_name, created_at, updated_at)
  values (
    new.id,
    new.id,
    candidate,
    coalesce(new.raw_user_meta_data->>'display_name', candidate),
    now(),
    now()
  )
  on conflict (id) do nothing;

  -- Owner bootstrap
  if new.email = 'audifyx@gmail.com' then
    update public.profiles
       set verified = true,
           badge = 'Owner',
           display_name = coalesce(display_name, 'Audifyx'),
           updated_at = now()
     where id = new.id;
    insert into public.admin_roles (user_id, role, granted_by)
    values (new.id, 'superadmin', new.id)
    on conflict (user_id) do update set role = 'superadmin';
  end if;

  insert into public.user_settings (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

drop trigger if exists trg_on_auth_user_created on auth.users;
create trigger trg_on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Backfill any existing auth users that never got a profile row
insert into public.profiles (id, user_id, username, display_name, created_at, updated_at)
select u.id,
       u.id,
       lower(regexp_replace(coalesce(split_part(u.email, '@', 1), 'user'), '[^a-z0-9_]+', '', 'g'))
         || substr(replace(u.id::text, '-', ''), 1, 4),
       coalesce(split_part(u.email, '@', 1), 'User'),
       now(),
       now()
  from auth.users u
  left join public.profiles p on p.id = u.id
 where p.id is null
on conflict (id) do nothing;

-- Backfill user_settings
insert into public.user_settings (user_id)
select u.id from auth.users u
  left join public.user_settings s on s.user_id = u.id
 where s.user_id is null
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 11. Profile follower-count maintenance
-- ---------------------------------------------------------------------
create or replace function public.handle_followers_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.profiles set followers_count = followers_count + 1 where id = new.followee_id;
    update public.profiles set following_count = following_count + 1 where id = new.follower_id;

    -- Send a follow notification
    insert into public.notifications (user_id, actor_id, type, title, body)
    values (new.followee_id, new.follower_id, 'follow', 'New follower',
            'Someone just followed you')
    on conflict do nothing;
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

-- ---------------------------------------------------------------------
-- 12. RLS sanity for the social tables
-- ---------------------------------------------------------------------
alter table public.profiles            enable row level security;
alter table public.followers           enable row level security;
alter table public.communities         enable row level security;
alter table public.community_members   enable row level security;
alter table public.community_posts     enable row level security;
alter table public.livekit_rooms       enable row level security;
alter table public.livekit_participants enable row level security;

do $$
begin
  -- profiles
  begin execute 'drop policy if exists "profiles_read"          on public.profiles'; exception when others then null; end;
  begin execute 'drop policy if exists "profiles_update_self"   on public.profiles'; exception when others then null; end;
  begin execute 'drop policy if exists "profiles_insert_self"   on public.profiles'; exception when others then null; end;
  execute $p$create policy "profiles_read"        on public.profiles for select using (true)$p$;
  execute $p$create policy "profiles_update_self" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id)$p$;
  execute $p$create policy "profiles_insert_self" on public.profiles for insert with check (auth.uid() = id)$p$;

  -- followers
  begin execute 'drop policy if exists "followers_read"        on public.followers'; exception when others then null; end;
  begin execute 'drop policy if exists "followers_write_self"  on public.followers'; exception when others then null; end;
  begin execute 'drop policy if exists "followers_delete_self" on public.followers'; exception when others then null; end;
  execute $p$create policy "followers_read"        on public.followers for select using (true)$p$;
  execute $p$create policy "followers_write_self"  on public.followers for insert with check (auth.uid() = follower_id)$p$;
  execute $p$create policy "followers_delete_self" on public.followers for delete using (auth.uid() = follower_id)$p$;

  -- communities
  begin execute 'drop policy if exists "communities_read"         on public.communities'; exception when others then null; end;
  begin execute 'drop policy if exists "communities_create_owner" on public.communities'; exception when others then null; end;
  begin execute 'drop policy if exists "communities_update_owner" on public.communities'; exception when others then null; end;
  execute $p$create policy "communities_read" on public.communities for select using (true)$p$;
  execute $p$create policy "communities_create_owner" on public.communities for insert with check (auth.uid() = owner_id)$p$;
  execute $p$create policy "communities_update_owner" on public.communities for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id)$p$;

  -- community_members
  begin execute 'drop policy if exists "cm_read"        on public.community_members'; exception when others then null; end;
  begin execute 'drop policy if exists "cm_join_self"   on public.community_members'; exception when others then null; end;
  begin execute 'drop policy if exists "cm_leave_self"  on public.community_members'; exception when others then null; end;
  execute $p$create policy "cm_read"       on public.community_members for select using (true)$p$;
  execute $p$create policy "cm_join_self"  on public.community_members for insert with check (auth.uid() = user_id)$p$;
  execute $p$create policy "cm_leave_self" on public.community_members for delete using (auth.uid() = user_id)$p$;

  -- community_posts
  begin execute 'drop policy if exists "cp_read"         on public.community_posts'; exception when others then null; end;
  begin execute 'drop policy if exists "cp_write_self"   on public.community_posts'; exception when others then null; end;
  begin execute 'drop policy if exists "cp_update_self"  on public.community_posts'; exception when others then null; end;
  begin execute 'drop policy if exists "cp_delete_self"  on public.community_posts'; exception when others then null; end;
  execute $p$create policy "cp_read"        on public.community_posts for select using (true)$p$;
  execute $p$create policy "cp_write_self"  on public.community_posts for insert with check (auth.uid() = user_id)$p$;
  execute $p$create policy "cp_update_self" on public.community_posts for update using (auth.uid() = user_id) with check (auth.uid() = user_id)$p$;
  execute $p$create policy "cp_delete_self" on public.community_posts for delete using (auth.uid() = user_id or public.is_admin(auth.uid()))$p$;

  -- livekit_rooms
  begin execute 'drop policy if exists "lk_room_read"   on public.livekit_rooms'; exception when others then null; end;
  begin execute 'drop policy if exists "lk_room_host"   on public.livekit_rooms'; exception when others then null; end;
  begin execute 'drop policy if exists "lk_room_update" on public.livekit_rooms'; exception when others then null; end;
  execute $p$create policy "lk_room_read"   on public.livekit_rooms for select using (true)$p$;
  execute $p$create policy "lk_room_host"   on public.livekit_rooms for insert with check (auth.uid() = host_id)$p$;
  execute $p$create policy "lk_room_update" on public.livekit_rooms for update using (auth.uid() = host_id or public.is_admin(auth.uid())) with check (true)$p$;

  -- livekit_participants
  begin execute 'drop policy if exists "lk_part_read"   on public.livekit_participants'; exception when others then null; end;
  begin execute 'drop policy if exists "lk_part_join"   on public.livekit_participants'; exception when others then null; end;
  begin execute 'drop policy if exists "lk_part_update" on public.livekit_participants'; exception when others then null; end;
  execute $p$create policy "lk_part_read"   on public.livekit_participants for select using (true)$p$;
  execute $p$create policy "lk_part_join"   on public.livekit_participants for insert with check (auth.uid() = user_id)$p$;
  execute $p$create policy "lk_part_update" on public.livekit_participants for update using (auth.uid() = user_id or exists (
    select 1 from public.livekit_rooms r where r.id = room_id and r.host_id = auth.uid())) with check (true)$p$;
end $$;

-- ---------------------------------------------------------------------
-- 13. Realtime publication — make sure live tables stream
-- ---------------------------------------------------------------------
do $$
declare
  t text;
  tables text[] := array[
    'profiles', 'followers', 'notifications',
    'community_posts', 'community_members', 'communities',
    'post_likes', 'community_post_comments',
    'livekit_rooms', 'livekit_participants',
    'dm_threads', 'dm_messages',
    'announcements', 'whale_events'
  ];
begin
  foreach t in array tables loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
              when undefined_object then null;
              when others then null;
    end;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 14. Storage buckets for media uploads
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public) values
  ('profile-media',   'profile-media',   true),
  ('community-media', 'community-media', true),
  ('post-media',      'post-media',      true),
  ('dm-media',        'dm-media',        true)
on conflict (id) do update set public = excluded.public;

do $$
declare
  b text;
  buckets text[] := array['profile-media','community-media','post-media','dm-media'];
begin
  foreach b in array buckets loop
    begin execute format('drop policy if exists "%s_public_read"   on storage.objects', b); exception when others then null; end;
    begin execute format('drop policy if exists "%s_owner_write"   on storage.objects', b); exception when others then null; end;
    begin execute format('drop policy if exists "%s_owner_update"  on storage.objects', b); exception when others then null; end;
    begin execute format('drop policy if exists "%s_owner_delete"  on storage.objects', b); exception when others then null; end;

    execute format($p$create policy "%s_public_read" on storage.objects
      for select using (bucket_id = %L)$p$, b, b);

    execute format($p$create policy "%s_owner_write" on storage.objects
      for insert with check (
        bucket_id = %L
        and auth.uid() is not null
        and (storage.foldername(name))[1] = auth.uid()::text
      )$p$, b, b);

    execute format($p$create policy "%s_owner_update" on storage.objects
      for update using (
        bucket_id = %L
        and auth.uid() is not null
        and (storage.foldername(name))[1] = auth.uid()::text
      )$p$, b, b);

    execute format($p$create policy "%s_owner_delete" on storage.objects
      for delete using (
        bucket_id = %L
        and auth.uid() is not null
        and (storage.foldername(name))[1] = auth.uid()::text
      )$p$, b, b);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 15. Owner bootstrap for existing audifyx@gmail.com (if already signed up)
-- ---------------------------------------------------------------------
do $$
declare
  owner_id uuid;
begin
  select id into owner_id from auth.users where email = 'audifyx@gmail.com' limit 1;
  if owner_id is not null then
    update public.profiles
       set verified = true,
           badge = 'Owner',
           display_name = coalesce(display_name, 'Audifyx'),
           updated_at = now()
     where id = owner_id;
    insert into public.admin_roles (user_id, role, granted_by)
    values (owner_id, 'superadmin', owner_id)
    on conflict (user_id) do update set role = 'superadmin';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- DONE
-- =====================================================================
