-- ============================================================
-- SolTools full setup (compact). Run once in Supabase SQL Editor.
-- Idempotent: safe to re-run.
-- ============================================================
create extension if not exists pgcrypto;

-- ---------- PROFILES ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  user_id uuid generated always as (id) stored,
  username text unique,
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
  badge text default 'Recruit',
  verified boolean default false,
  custom_badges jsonb default '[]'::jsonb,
  followers_count int default 0,
  following_count int default 0,
  trades_count int default 0,
  win_rate numeric default 0,
  pnl_pct numeric default 0,
  xp int default 0,
  status text default 'offline',
  last_seen timestamptz,
  created_at timestamptz default now()
);
alter table public.profiles enable row level security;
drop policy if exists p_read on public.profiles;
create policy p_read on public.profiles for select using (true);
drop policy if exists p_upsert on public.profiles;
create policy p_upsert on public.profiles for insert with check (auth.uid() = id);
drop policy if exists p_update on public.profiles;
create policy p_update on public.profiles for update using (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- FOLLOWS ----------
create table if not exists public.follows (
  follower_id uuid references auth.users(id) on delete cascade,
  followee_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (follower_id, followee_id)
);
-- Legacy alias view some screens query as `followers`
create or replace view public.followers as select * from public.follows;
alter table public.follows enable row level security;
drop policy if exists f_read on public.follows;
create policy f_read on public.follows for select using (true);
drop policy if exists f_ins on public.follows;
create policy f_ins on public.follows for insert with check (auth.uid() = follower_id);
drop policy if exists f_del on public.follows;
create policy f_del on public.follows for delete using (auth.uid() = follower_id);

-- ---------- COMMUNITIES ----------
create table if not exists public.communities (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique,
  description text,
  owner_id uuid references auth.users(id) on delete set null,
  member_count int default 0,
  posts_count int default 0,
  online_count int default 0,
  category text default 'alpha',
  icon_emoji text,
  accent_a text,
  accent_b text,
  verified boolean default false,
  trending boolean default false,
  pinned_ticker text,
  rules jsonb default '[]'::jsonb,
  tags jsonb default '[]'::jsonb,
  is_private boolean default false,
  created_at timestamptz default now()
);
alter table public.communities enable row level security;
drop policy if exists c_read on public.communities;
create policy c_read on public.communities for select using (true);
drop policy if exists c_ins on public.communities;
create policy c_ins on public.communities for insert with check (auth.uid() = owner_id);
drop policy if exists c_upd on public.communities;
create policy c_upd on public.communities for update using (auth.uid() = owner_id);

create table if not exists public.community_members (
  community_id uuid references public.communities(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  joined_at timestamptz default now(),
  primary key (community_id, user_id)
);
alter table public.community_members enable row level security;
drop policy if exists cm_read on public.community_members;
create policy cm_read on public.community_members for select using (true);
drop policy if exists cm_ins on public.community_members;
create policy cm_ins on public.community_members for insert with check (auth.uid() = user_id);
drop policy if exists cm_del on public.community_members;
create policy cm_del on public.community_members for delete using (auth.uid() = user_id);

-- ---------- POSTS ----------
create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  community_id uuid references public.communities(id) on delete cascade,
  content text not null default '',
  image_url text,
  ticker text,
  change_pct numeric,
  likes_count int default 0,
  reposts_count int default 0,
  comments_count int default 0,
  created_at timestamptz default now()
);
create index if not exists idx_posts_user on public.community_posts(user_id, created_at desc);
create index if not exists idx_posts_community on public.community_posts(community_id, created_at desc);
alter table public.community_posts enable row level security;
drop policy if exists cp_read on public.community_posts;
create policy cp_read on public.community_posts for select using (true);
drop policy if exists cp_ins on public.community_posts;
create policy cp_ins on public.community_posts for insert with check (auth.uid() = user_id);
drop policy if exists cp_upd on public.community_posts;
create policy cp_upd on public.community_posts for update using (auth.uid() = user_id);
drop policy if exists cp_del on public.community_posts;
create policy cp_del on public.community_posts for delete using (auth.uid() = user_id);

create table if not exists public.post_likes (
  post_id uuid references public.community_posts(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (post_id, user_id)
);
alter table public.post_likes enable row level security;
drop policy if exists pl_read on public.post_likes;
create policy pl_read on public.post_likes for select using (true);
drop policy if exists pl_ins on public.post_likes;
create policy pl_ins on public.post_likes for insert with check (auth.uid() = user_id);
drop policy if exists pl_del on public.post_likes;
create policy pl_del on public.post_likes for delete using (auth.uid() = user_id);

-- ---------- STORIES ----------
create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  media_url text not null,
  caption text,
  views_count int default 0,
  created_at timestamptz default now(),
  expires_at timestamptz default (now() + interval '24 hours')
);
create index if not exists idx_stories_active on public.stories(expires_at desc);
alter table public.stories enable row level security;
drop policy if exists s_read on public.stories;
create policy s_read on public.stories for select using (true);
drop policy if exists s_ins on public.stories;
create policy s_ins on public.stories for insert with check (auth.uid() = user_id);
drop policy if exists s_del on public.stories;
create policy s_del on public.stories for delete using (auth.uid() = user_id);

create table if not exists public.story_views (
  story_id uuid references public.stories(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  viewed_at timestamptz default now(),
  primary key (story_id, user_id)
);
alter table public.story_views enable row level security;
drop policy if exists sv_read on public.story_views;
create policy sv_read on public.story_views for select using (true);
drop policy if exists sv_ins on public.story_views;
create policy sv_ins on public.story_views for insert with check (auth.uid() = user_id);

-- ---------- TRACKING ----------
create table if not exists public.tracked_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_address text not null,
  symbol text,
  name text,
  created_at timestamptz default now(),
  unique (user_id, token_address)
);
alter table public.tracked_tokens enable row level security;
drop policy if exists tt_all on public.tracked_tokens;
create policy tt_all on public.tracked_tokens for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.price_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_address text,
  symbol text,
  target_price numeric,
  condition text,
  is_active boolean default true,
  created_at timestamptz default now()
);
alter table public.price_alerts enable row level security;
drop policy if exists pa_all on public.price_alerts;
create policy pa_all on public.price_alerts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.tracked_wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  wallet_address text not null,
  label text,
  created_at timestamptz default now(),
  unique (user_id, wallet_address)
);
alter table public.tracked_wallets enable row level security;
drop policy if exists tw_all on public.tracked_wallets;
create policy tw_all on public.tracked_wallets for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.user_settings (
  id uuid primary key,
  user_id uuid unique references auth.users(id) on delete cascade,
  updated_at timestamptz default now()
);
alter table public.user_settings enable row level security;
drop policy if exists us_all on public.user_settings;
create policy us_all on public.user_settings for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- SPACES / LIVEKIT ----------
create table if not exists public.livekit_rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  topic text,
  description text,
  host_id uuid references auth.users(id) on delete set null,
  community_id uuid references public.communities(id) on delete set null,
  is_active boolean default true,
  started_at timestamptz,
  ended_at timestamptz,
  scheduled_at timestamptz,
  category text,
  accent_a text,
  accent_b text,
  recording boolean default false,
  raised_hands int default 0,
  listeners_count int default 0,
  speakers_count int default 0,
  created_at timestamptz default now()
);
alter table public.livekit_rooms enable row level security;
drop policy if exists lr_read on public.livekit_rooms;
create policy lr_read on public.livekit_rooms for select using (true);
drop policy if exists lr_ins on public.livekit_rooms;
create policy lr_ins on public.livekit_rooms for insert with check (auth.uid() = host_id);
drop policy if exists lr_upd on public.livekit_rooms;
create policy lr_upd on public.livekit_rooms for update using (auth.uid() = host_id);

create table if not exists public.livekit_participants (
  room_id uuid references public.livekit_rooms(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  role text default 'listener',
  joined_at timestamptz default now(),
  primary key (room_id, user_id)
);
alter table public.livekit_participants enable row level security;
drop policy if exists lp_read on public.livekit_participants;
create policy lp_read on public.livekit_participants for select using (true);
drop policy if exists lp_ins on public.livekit_participants;
create policy lp_ins on public.livekit_participants for insert with check (auth.uid() = user_id);
drop policy if exists lp_del on public.livekit_participants;
create policy lp_del on public.livekit_participants for delete using (auth.uid() = user_id);

-- ---------- ADMIN / MISC ----------
create table if not exists public.admin_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text default 'admin'
);
alter table public.admin_roles enable row level security;
drop policy if exists ar_read on public.admin_roles;
create policy ar_read on public.admin_roles for select using (auth.uid() = user_id);

create table if not exists public.whale_events (
  id uuid primary key default gen_random_uuid(),
  wallet_address text,
  token_address text,
  symbol text,
  amount_usd numeric,
  side text,
  created_at timestamptz default now()
);
alter table public.whale_events enable row level security;
drop policy if exists we_read on public.whale_events;
create policy we_read on public.whale_events for select using (true);

create table if not exists public.pump_v5_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  ticker text,
  name text,
  description text,
  image_url text,
  status text default 'pending',
  created_at timestamptz default now()
);
alter table public.pump_v5_submissions enable row level security;
drop policy if exists ps_read on public.pump_v5_submissions;
create policy ps_read on public.pump_v5_submissions for select using (true);
drop policy if exists ps_ins on public.pump_v5_submissions;
create policy ps_ins on public.pump_v5_submissions for insert with check (auth.uid() = user_id);
drop policy if exists ps_upd on public.pump_v5_submissions;
create policy ps_upd on public.pump_v5_submissions for update using (auth.uid() = user_id or exists(select 1 from public.admin_roles where user_id = auth.uid()));
drop policy if exists ps_del on public.pump_v5_submissions;
create policy ps_del on public.pump_v5_submissions for delete using (auth.uid() = user_id or exists(select 1 from public.admin_roles where user_id = auth.uid()));

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  subject text,
  message text,
  status text default 'open',
  created_at timestamptz default now()
);
alter table public.support_tickets enable row level security;
drop policy if exists st_ins on public.support_tickets;
create policy st_ins on public.support_tickets for insert with check (auth.uid() = user_id);
drop policy if exists st_read on public.support_tickets;
create policy st_read on public.support_tickets for select using (auth.uid() = user_id or exists(select 1 from public.admin_roles where user_id = auth.uid()));
drop policy if exists st_upd on public.support_tickets;
create policy st_upd on public.support_tickets for update using (exists(select 1 from public.admin_roles where user_id = auth.uid()));

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text,
  body text,
  active boolean default true,
  created_at timestamptz default now()
);
alter table public.announcements enable row level security;
drop policy if exists an_read on public.announcements;
create policy an_read on public.announcements for select using (true);
drop policy if exists an_write on public.announcements;
create policy an_write on public.announcements for all using (exists(select 1 from public.admin_roles where user_id = auth.uid())) with check (exists(select 1 from public.admin_roles where user_id = auth.uid()));

-- ============================================================
-- RPCs
-- ============================================================

-- Toggle post like + return current state
create or replace function public.toggle_post_like(target_post_id uuid)
returns table(liked boolean, likes_count int)
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); existed boolean;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select true into existed from public.post_likes where post_id = target_post_id and user_id = uid;
  if existed then
    delete from public.post_likes where post_id = target_post_id and user_id = uid;
    update public.community_posts set likes_count = greatest(0, likes_count - 1) where id = target_post_id;
    return query select false, p.likes_count from public.community_posts p where p.id = target_post_id;
  else
    insert into public.post_likes(post_id, user_id) values (target_post_id, uid) on conflict do nothing;
    update public.community_posts set likes_count = likes_count + 1 where id = target_post_id;
    return query select true, p.likes_count from public.community_posts p where p.id = target_post_id;
  end if;
end $$;

-- Toggle follow
create or replace function public.toggle_follow(target_user_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); existed boolean;
begin
  if uid is null or uid = target_user_id then return false; end if;
  select true into existed from public.follows where follower_id = uid and followee_id = target_user_id;
  if existed then
    delete from public.follows where follower_id = uid and followee_id = target_user_id;
    update public.profiles set following_count = greatest(0, following_count - 1) where id = uid;
    update public.profiles set followers_count = greatest(0, followers_count - 1) where id = target_user_id;
    return false;
  else
    insert into public.follows(follower_id, followee_id) values (uid, target_user_id);
    update public.profiles set following_count = following_count + 1 where id = uid;
    update public.profiles set followers_count = followers_count + 1 where id = target_user_id;
    return true;
  end if;
end $$;

-- Profile by handle
create or replace function public.get_profile_by_handle(handle text)
returns setof public.profiles language sql stable as $$
  select * from public.profiles where username = regexp_replace(handle, '^@', '') limit 1;
$$;

-- Search profiles
create or replace function public.search_profiles(q text, max_rows int default 20)
returns setof public.profiles language sql stable as $$
  select * from public.profiles
  where username ilike '%'||q||'%' or display_name ilike '%'||q||'%'
  order by followers_count desc limit max_rows;
$$;

-- Heartbeat / offline
create or replace function public.heartbeat(set_status text default 'online')
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  update public.profiles set status = set_status, last_seen = now() where id = auth.uid();
end $$;

create or replace function public.set_offline()
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  update public.profiles set status = 'offline', last_seen = now() where id = auth.uid();
end $$;

-- Admin user listing
create or replace function public.list_users(max_rows int default 100)
returns setof public.profiles language sql stable as $$
  select * from public.profiles order by created_at desc limit max_rows;
$$;

create or replace function public.users_overview()
returns table(total bigint, online bigint, verified bigint)
language sql stable as $$
  select count(*)::bigint, count(*) filter (where status = 'online')::bigint, count(*) filter (where verified)::bigint
  from public.profiles;
$$;

-- Following feed
create or replace function public.get_following_feed(max_rows int default 50)
returns table(
  id uuid, user_id uuid, content text, image_url text, ticker text,
  change_pct numeric, likes_count int, reposts_count int, comments_count int,
  created_at timestamptz, username text, display_name text, avatar_url text, avatar_color text, verified boolean
)
language sql stable as $$
  select p.id, p.user_id, p.content, p.image_url, p.ticker, p.change_pct,
         p.likes_count, p.reposts_count, p.comments_count, p.created_at,
         pr.username, pr.display_name, pr.avatar_url, pr.avatar_color, pr.verified
  from public.community_posts p
  join public.profiles pr on pr.id = p.user_id
  where p.user_id in (select followee_id from public.follows where follower_id = auth.uid())
     or p.user_id = auth.uid()
  order by p.created_at desc
  limit max_rows;
$$;

-- Stories RPCs
create or replace function public.list_active_stories(max_rows int default 200)
returns table(
  id uuid, user_id uuid, username text, display_name text, avatar_url text,
  avatar_color text, verified boolean, media_url text, caption text,
  views_count int, created_at timestamptz, expires_at timestamptz, viewed_by_me boolean
)
language sql stable as $$
  select s.id, s.user_id, pr.username, pr.display_name, pr.avatar_url, pr.avatar_color,
         coalesce(pr.verified, false), s.media_url, s.caption, s.views_count, s.created_at, s.expires_at,
         exists(select 1 from public.story_views v where v.story_id = s.id and v.user_id = auth.uid())
  from public.stories s
  join public.profiles pr on pr.id = s.user_id
  where s.expires_at > now()
  order by s.created_at desc
  limit max_rows;
$$;

create or replace function public.create_story(p_media_url text, p_caption text default null)
returns setof public.stories language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;
  return query insert into public.stories(user_id, media_url, caption)
    values (uid, p_media_url, p_caption) returning *;
end $$;

create or replace function public.delete_my_story(target_story_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  delete from public.stories where id = target_story_id and user_id = auth.uid();
  return found;
end $$;

create or replace function public.record_story_view(target_story_id uuid)
returns int language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); newcount int;
begin
  if uid is null then return 0; end if;
  insert into public.story_views(story_id, user_id) values (target_story_id, uid) on conflict do nothing;
  if found then
    update public.stories set views_count = views_count + 1 where id = target_story_id;
  end if;
  select views_count into newcount from public.stories where id = target_story_id;
  return coalesce(newcount, 0);
end $$;

create or replace function public.list_story_viewers(target_story_id uuid)
returns table(
  user_id uuid, username text, display_name text, avatar_url text,
  avatar_color text, verified boolean, viewed_at timestamptz
)
language sql stable as $$
  select v.user_id, pr.username, pr.display_name, pr.avatar_url, pr.avatar_color,
         coalesce(pr.verified, false), v.viewed_at
  from public.story_views v
  join public.profiles pr on pr.id = v.user_id
  where v.story_id = target_story_id
    and exists(select 1 from public.stories s where s.id = target_story_id and s.user_id = auth.uid())
  order by v.viewed_at desc;
$$;

-- ============================================================
-- STORAGE BUCKETS
-- ============================================================
insert into storage.buckets (id, name, public) values
  ('avatars','avatars', true),
  ('posts','posts', true),
  ('stories','stories', true)
on conflict (id) do update set public = true;

-- Storage RLS: anyone read, owner write under their uid folder
drop policy if exists "storage_read" on storage.objects;
create policy "storage_read" on storage.objects for select
  using (bucket_id in ('avatars','posts','stories'));

drop policy if exists "storage_write_own" on storage.objects;
create policy "storage_write_own" on storage.objects for insert
  with check (bucket_id in ('avatars','posts','stories') and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "storage_update_own" on storage.objects;
create policy "storage_update_own" on storage.objects for update
  using (bucket_id in ('avatars','posts','stories') and auth.uid()::text = (storage.foldername(name))[1]);

drop policy if exists "storage_delete_own" on storage.objects;
create policy "storage_delete_own" on storage.objects for delete
  using (bucket_id in ('avatars','posts','stories') and auth.uid()::text = (storage.foldername(name))[1]);

-- Done.
