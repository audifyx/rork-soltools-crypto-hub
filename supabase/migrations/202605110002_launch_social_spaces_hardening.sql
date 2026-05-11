-- Launch hardening: make social feed/follows and Spaces work across real users.
-- Fixes RLS gaps that let creators see their own data while other users saw empty feeds/lists,
-- and lets the app create/join live Spaces even when RPC schema cache is stale.

create extension if not exists pgcrypto;

-- Public top-level social posts must be readable by everyone for the Home feed.
alter table if exists public.community_posts enable row level security;

do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'community_posts') then
    if not exists (select 1 from pg_policies where schemaname='public' and tablename='community_posts' and policyname='community_posts_select_public') then
      create policy community_posts_select_public on public.community_posts for select using (true);
    end if;
    if not exists (select 1 from pg_policies where schemaname='public' and tablename='community_posts' and policyname='community_posts_insert_own') then
      create policy community_posts_insert_own on public.community_posts for insert with check (user_id = auth.uid());
    end if;
    if not exists (select 1 from pg_policies where schemaname='public' and tablename='community_posts' and policyname='community_posts_update_own') then
      create policy community_posts_update_own on public.community_posts for update using (user_id = auth.uid()) with check (user_id = auth.uid());
    end if;
    if not exists (select 1 from pg_policies where schemaname='public' and tablename='community_posts' and policyname='community_posts_delete_own') then
      create policy community_posts_delete_own on public.community_posts for delete using (user_id = auth.uid());
    end if;
  end if;
end $$;

-- Followers table with public read and owner write.
create table if not exists public.followers (
  follower_id uuid not null,
  followee_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id)
);
create index if not exists followers_follower_idx on public.followers(follower_id, created_at desc);
create index if not exists followers_followee_idx on public.followers(followee_id, created_at desc);
alter table public.followers enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='followers' and policyname='followers_select_all') then
    create policy followers_select_all on public.followers for select using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='followers' and policyname='followers_insert_own') then
    create policy followers_insert_own on public.followers for insert with check (follower_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='followers' and policyname='followers_delete_own') then
    create policy followers_delete_own on public.followers for delete using (follower_id = auth.uid());
  end if;
end $$;

create or replace function public.get_public_feed(max_rows integer default 100)
returns table(
  id uuid,
  user_id uuid,
  content text,
  image_url text,
  ticker text,
  token_address text,
  change_pct numeric,
  likes_count integer,
  reposts_count integer,
  comments_count integer,
  created_at timestamptz,
  author_username text,
  author_display_name text,
  author_avatar_url text,
  author_avatar_color text,
  author_verified boolean
)
language sql
security definer
set search_path = public
as $$
  select cp.id, cp.user_id, cp.content, cp.image_url, cp.ticker, cp.token_address, cp.change_pct,
         coalesce(cp.likes_count, 0), coalesce(cp.reposts_count, 0), coalesce(cp.comments_count, 0), cp.created_at,
         p.username, p.display_name, p.avatar_url, p.avatar_color, coalesce(p.verified, false)
  from public.community_posts cp
  left join public.profiles p on p.user_id = cp.user_id or p.id = cp.user_id
  where cp.community_id is null
    and cp.parent_post_id is null
  order by cp.created_at desc
  limit greatest(1, least(coalesce(max_rows, 100), 200));
$$;

create or replace function public.get_following_feed(max_rows integer default 50)
returns table(
  id uuid,
  user_id uuid,
  content text,
  image_url text,
  ticker text,
  token_address text,
  change_pct numeric,
  likes_count integer,
  reposts_count integer,
  comments_count integer,
  created_at timestamptz,
  author_username text,
  author_display_name text,
  author_avatar_url text,
  author_avatar_color text,
  author_verified boolean
)
language sql
security definer
set search_path = public
as $$
  select cp.id, cp.user_id, cp.content, cp.image_url, cp.ticker, cp.token_address, cp.change_pct,
         coalesce(cp.likes_count, 0), coalesce(cp.reposts_count, 0), coalesce(cp.comments_count, 0), cp.created_at,
         p.username, p.display_name, p.avatar_url, p.avatar_color, coalesce(p.verified, false)
  from public.community_posts cp
  join public.followers f on f.followee_id = cp.user_id and f.follower_id = auth.uid()
  left join public.profiles p on p.user_id = cp.user_id or p.id = cp.user_id
  where cp.community_id is null
    and cp.parent_post_id is null
  order by cp.created_at desc
  limit greatest(1, least(coalesce(max_rows, 50), 100));
$$;

create or replace function public.toggle_follow(target_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare did_follow boolean;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if target_user_id is null or target_user_id = auth.uid() then return false; end if;

  delete from public.followers where follower_id = auth.uid() and followee_id = target_user_id;
  if found then
    did_follow := false;
  else
    insert into public.followers(follower_id, followee_id) values (auth.uid(), target_user_id) on conflict do nothing;
    did_follow := true;
  end if;

  update public.profiles set followers_count = (select count(*) from public.followers where followee_id = target_user_id) where user_id = target_user_id or id = target_user_id;
  update public.profiles set following_count = (select count(*) from public.followers where follower_id = auth.uid()) where user_id = auth.uid() or id = auth.uid();
  return did_follow;
end;
$$;

create or replace function public.list_followers(target_user_id uuid)
returns table(user_id uuid, username text, display_name text, avatar_url text, verified boolean, custom_badges jsonb, followers_count integer)
language sql
security definer
set search_path = public
as $$
  select coalesce(p.user_id, p.id), p.username, p.display_name, p.avatar_url, coalesce(p.verified, false), coalesce(p.custom_badges, '[]'::jsonb), coalesce(p.followers_count, 0)
  from public.followers f
  join public.profiles p on p.user_id = f.follower_id or p.id = f.follower_id
  where f.followee_id = target_user_id
  order by f.created_at desc;
$$;

create or replace function public.list_following(target_user_id uuid)
returns table(user_id uuid, username text, display_name text, avatar_url text, verified boolean, custom_badges jsonb, followers_count integer)
language sql
security definer
set search_path = public
as $$
  select coalesce(p.user_id, p.id), p.username, p.display_name, p.avatar_url, coalesce(p.verified, false), coalesce(p.custom_badges, '[]'::jsonb), coalesce(p.followers_count, 0)
  from public.followers f
  join public.profiles p on p.user_id = f.followee_id or p.id = f.followee_id
  where f.follower_id = target_user_id
  order by f.created_at desc;
$$;

-- Spaces RLS: direct app fallback needs write access if the RPC is temporarily missing from PostgREST cache.
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'livekit_rooms') then
    if not exists (select 1 from pg_policies where schemaname='public' and tablename='livekit_rooms' and policyname='livekit_rooms_insert_own') then
      create policy livekit_rooms_insert_own on public.livekit_rooms for insert with check (host_id = auth.uid());
    end if;
    if not exists (select 1 from pg_policies where schemaname='public' and tablename='livekit_rooms' and policyname='livekit_rooms_update_host') then
      create policy livekit_rooms_update_host on public.livekit_rooms for update using (host_id = auth.uid()) with check (host_id = auth.uid());
    end if;
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'livekit_participants') then
    if not exists (select 1 from pg_policies where schemaname='public' and tablename='livekit_participants' and policyname='livekit_participants_insert_own') then
      create policy livekit_participants_insert_own on public.livekit_participants for insert with check (user_id = auth.uid());
    end if;
    if not exists (select 1 from pg_policies where schemaname='public' and tablename='livekit_participants' and policyname='livekit_participants_update_own_or_host') then
      create policy livekit_participants_update_own_or_host on public.livekit_participants for update using (
        user_id = auth.uid() or exists (select 1 from public.livekit_rooms r where r.id = room_id and r.host_id = auth.uid())
      ) with check (
        user_id = auth.uid() or exists (select 1 from public.livekit_rooms r where r.id = room_id and r.host_id = auth.uid())
      );
    end if;
  end if;

  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'space_follows') then
    if not exists (select 1 from pg_policies where schemaname='public' and tablename='space_follows' and policyname='space_follows_write_own') then
      create policy space_follows_write_own on public.space_follows for all using (user_id = auth.uid()) with check (user_id = auth.uid());
    end if;
  end if;
end $$;
