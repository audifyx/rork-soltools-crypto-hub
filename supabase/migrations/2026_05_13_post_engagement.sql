-- Post engagement: likes, reposts, bookmarks
-- Adds the missing RPCs used by the social provider and post detail screen.
-- Idempotent: tables and functions are guarded.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.community_post_likes (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index if not exists idx_cpl_user on public.community_post_likes(user_id);
create index if not exists idx_cpl_post on public.community_post_likes(post_id);

create table if not exists public.community_post_reposts (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index if not exists idx_cpr_user on public.community_post_reposts(user_id);
create index if not exists idx_cpr_post on public.community_post_reposts(post_id);

create table if not exists public.community_post_bookmarks (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index if not exists idx_cpb_user on public.community_post_bookmarks(user_id);

-- Ensure counters exist on community_posts.
alter table public.community_posts
  add column if not exists likes_count integer not null default 0,
  add column if not exists reposts_count integer not null default 0,
  add column if not exists comments_count integer not null default 0;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.community_post_likes enable row level security;
alter table public.community_post_reposts enable row level security;
alter table public.community_post_bookmarks enable row level security;

drop policy if exists cpl_read on public.community_post_likes;
create policy cpl_read on public.community_post_likes for select using (true);
drop policy if exists cpl_write on public.community_post_likes;
create policy cpl_write on public.community_post_likes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists cpr_read on public.community_post_reposts;
create policy cpr_read on public.community_post_reposts for select using (true);
drop policy if exists cpr_write on public.community_post_reposts;
create policy cpr_write on public.community_post_reposts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists cpb_read on public.community_post_bookmarks;
create policy cpb_read on public.community_post_bookmarks
  for select using (auth.uid() = user_id);
drop policy if exists cpb_write on public.community_post_bookmarks;
create policy cpb_write on public.community_post_bookmarks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

create or replace function public.toggle_post_like(target_post_id uuid)
returns table(liked boolean, likes_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_exists boolean;
  v_count integer;
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;

  select exists(
    select 1 from public.community_post_likes
    where post_id = target_post_id and user_id = v_user
  ) into v_exists;

  if v_exists then
    delete from public.community_post_likes
      where post_id = target_post_id and user_id = v_user;
    update public.community_posts
      set likes_count = greatest(0, coalesce(likes_count, 0) - 1)
      where id = target_post_id
      returning coalesce(likes_count, 0) into v_count;
    return query select false, coalesce(v_count, 0);
  else
    insert into public.community_post_likes(post_id, user_id)
      values (target_post_id, v_user)
      on conflict do nothing;
    update public.community_posts
      set likes_count = coalesce(likes_count, 0) + 1
      where id = target_post_id
      returning coalesce(likes_count, 0) into v_count;
    return query select true, coalesce(v_count, 0);
  end if;
end;
$$;

grant execute on function public.toggle_post_like(uuid) to authenticated;

create or replace function public.toggle_post_repost(target_post_id uuid)
returns table(reposted boolean, reposts_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_exists boolean;
  v_count integer;
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;

  select exists(
    select 1 from public.community_post_reposts
    where post_id = target_post_id and user_id = v_user
  ) into v_exists;

  if v_exists then
    delete from public.community_post_reposts
      where post_id = target_post_id and user_id = v_user;
    update public.community_posts
      set reposts_count = greatest(0, coalesce(reposts_count, 0) - 1)
      where id = target_post_id
      returning coalesce(reposts_count, 0) into v_count;
    return query select false, coalesce(v_count, 0);
  else
    insert into public.community_post_reposts(post_id, user_id)
      values (target_post_id, v_user)
      on conflict do nothing;
    update public.community_posts
      set reposts_count = coalesce(reposts_count, 0) + 1
      where id = target_post_id
      returning coalesce(reposts_count, 0) into v_count;
    return query select true, coalesce(v_count, 0);
  end if;
end;
$$;

grant execute on function public.toggle_post_repost(uuid) to authenticated;

create or replace function public.toggle_post_bookmark(target_post_id uuid)
returns table(bookmarked boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_exists boolean;
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;

  select exists(
    select 1 from public.community_post_bookmarks
    where post_id = target_post_id and user_id = v_user
  ) into v_exists;

  if v_exists then
    delete from public.community_post_bookmarks
      where post_id = target_post_id and user_id = v_user;
    return query select false;
  else
    insert into public.community_post_bookmarks(post_id, user_id)
      values (target_post_id, v_user)
      on conflict do nothing;
    return query select true;
  end if;
end;
$$;

grant execute on function public.toggle_post_bookmark(uuid) to authenticated;
