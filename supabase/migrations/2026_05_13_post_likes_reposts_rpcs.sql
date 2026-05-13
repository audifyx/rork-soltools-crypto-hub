-- =====================================================================
-- 2026-05-13 · Post likes/reposts RPCs + counter triggers + realtime
-- ---------------------------------------------------------------------
-- Provides atomic toggle RPCs the app already calls:
--   toggle_post_like(target_post_id uuid)   → (liked, likes_count)
--   toggle_post_repost(target_post_id uuid) → (reposted, reposts_count)
--
-- Also ensures community_posts.likes_count / reposts_count / comments_count
-- stay in sync via triggers, and enables Realtime on the relevant tables
-- so the live feed updates instantly instead of waiting for poll cycles.
-- Idempotent: safe to run multiple times.
-- =====================================================================

set local search_path = public;

-- ---------------------------------------------------------------------
-- Counter columns (no-ops if already present)
-- ---------------------------------------------------------------------
alter table if exists public.community_posts
  add column if not exists likes_count integer not null default 0,
  add column if not exists reposts_count integer not null default 0,
  add column if not exists comments_count integer not null default 0;

-- ---------------------------------------------------------------------
-- Like counter triggers
-- ---------------------------------------------------------------------
create or replace function public._bump_post_likes_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.community_posts
       set likes_count = coalesce(likes_count, 0) + 1
     where id = new.post_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.community_posts
       set likes_count = greatest(0, coalesce(likes_count, 0) - 1)
     where id = old.post_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists _tg_bump_post_likes_ins on public.community_post_likes;
create trigger _tg_bump_post_likes_ins
  after insert on public.community_post_likes
  for each row execute function public._bump_post_likes_count();

drop trigger if exists _tg_bump_post_likes_del on public.community_post_likes;
create trigger _tg_bump_post_likes_del
  after delete on public.community_post_likes
  for each row execute function public._bump_post_likes_count();

-- ---------------------------------------------------------------------
-- Repost counter triggers
-- ---------------------------------------------------------------------
create or replace function public._bump_post_reposts_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.community_posts
       set reposts_count = coalesce(reposts_count, 0) + 1
     where id = new.post_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.community_posts
       set reposts_count = greatest(0, coalesce(reposts_count, 0) - 1)
     where id = old.post_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists _tg_bump_post_reposts_ins on public.community_post_reposts;
create trigger _tg_bump_post_reposts_ins
  after insert on public.community_post_reposts
  for each row execute function public._bump_post_reposts_count();

drop trigger if exists _tg_bump_post_reposts_del on public.community_post_reposts;
create trigger _tg_bump_post_reposts_del
  after delete on public.community_post_reposts
  for each row execute function public._bump_post_reposts_count();

-- ---------------------------------------------------------------------
-- Comments counter trigger (parent_post_id-aware)
-- ---------------------------------------------------------------------
create or replace function public._bump_post_comments_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.parent_post_id is not null then
      update public.community_posts
         set comments_count = coalesce(comments_count, 0) + 1
       where id = new.parent_post_id;
    end if;
    return new;
  elsif tg_op = 'DELETE' then
    if old.parent_post_id is not null then
      update public.community_posts
         set comments_count = greatest(0, coalesce(comments_count, 0) - 1)
       where id = old.parent_post_id;
    end if;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists _tg_bump_post_comments_ins on public.community_posts;
create trigger _tg_bump_post_comments_ins
  after insert on public.community_posts
  for each row execute function public._bump_post_comments_count();

drop trigger if exists _tg_bump_post_comments_del on public.community_posts;
create trigger _tg_bump_post_comments_del
  after delete on public.community_posts
  for each row execute function public._bump_post_comments_count();

-- ---------------------------------------------------------------------
-- toggle_post_like(target_post_id uuid) → (liked boolean, likes_count int)
-- ---------------------------------------------------------------------
create or replace function public.toggle_post_like(target_post_id uuid)
returns table(liked boolean, likes_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_exists boolean;
  v_count integer;
begin
  if v_uid is null then
    raise exception 'auth required' using errcode = '28000';
  end if;

  select exists(
    select 1 from public.community_post_likes
     where post_id = target_post_id and user_id = v_uid
  ) into v_exists;

  if v_exists then
    delete from public.community_post_likes
     where post_id = target_post_id and user_id = v_uid;
    liked := false;
  else
    insert into public.community_post_likes(post_id, user_id)
    values (target_post_id, v_uid)
    on conflict do nothing;
    liked := true;
  end if;

  select coalesce(cp.likes_count, 0)
    into v_count
    from public.community_posts cp
   where cp.id = target_post_id;
  likes_count := coalesce(v_count, 0);
  return next;
end;
$$;

grant execute on function public.toggle_post_like(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- toggle_post_repost(target_post_id uuid) → (reposted boolean, reposts_count int)
-- ---------------------------------------------------------------------
create or replace function public.toggle_post_repost(target_post_id uuid)
returns table(reposted boolean, reposts_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_exists boolean;
  v_count integer;
begin
  if v_uid is null then
    raise exception 'auth required' using errcode = '28000';
  end if;

  select exists(
    select 1 from public.community_post_reposts
     where post_id = target_post_id and user_id = v_uid
  ) into v_exists;

  if v_exists then
    delete from public.community_post_reposts
     where post_id = target_post_id and user_id = v_uid;
    reposted := false;
  else
    insert into public.community_post_reposts(post_id, user_id)
    values (target_post_id, v_uid)
    on conflict do nothing;
    reposted := true;
  end if;

  select coalesce(cp.reposts_count, 0)
    into v_count
    from public.community_posts cp
   where cp.id = target_post_id;
  reposts_count := coalesce(v_count, 0);
  return next;
end;
$$;

grant execute on function public.toggle_post_repost(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Realtime: surface live-feed inserts/updates immediately
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin execute 'alter publication supabase_realtime add table public.community_posts';
    exception when duplicate_object then null; end;
    begin execute 'alter publication supabase_realtime add table public.community_post_likes';
    exception when duplicate_object then null; end;
    begin execute 'alter publication supabase_realtime add table public.community_post_reposts';
    exception when duplicate_object then null; end;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- One-time count backfill so existing rows show correct totals
-- ---------------------------------------------------------------------
update public.community_posts cp
   set likes_count = coalesce(sub.c, 0)
  from (select post_id, count(*)::int as c from public.community_post_likes group by post_id) sub
 where sub.post_id = cp.id and coalesce(cp.likes_count, 0) <> coalesce(sub.c, 0);

update public.community_posts cp
   set reposts_count = coalesce(sub.c, 0)
  from (select post_id, count(*)::int as c from public.community_post_reposts group by post_id) sub
 where sub.post_id = cp.id and coalesce(cp.reposts_count, 0) <> coalesce(sub.c, 0);

update public.community_posts cp
   set comments_count = coalesce(sub.c, 0)
  from (
    select parent_post_id as post_id, count(*)::int as c
      from public.community_posts
     where parent_post_id is not null
     group by parent_post_id
  ) sub
 where sub.post_id = cp.id and coalesce(cp.comments_count, 0) <> coalesce(sub.c, 0);
