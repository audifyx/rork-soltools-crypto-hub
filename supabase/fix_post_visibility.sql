-- =============================================================================
-- Fix: posts authored by other users are not visible in the home feed.
--
-- The home feed reads `community_posts` directly (top-level rows, i.e.
-- `parent_post_id is null`). If RLS only allows the author to SELECT their
-- own rows, every other user's posts vanish from the feed.
--
-- This migration rebuilds the SELECT policy on `community_posts` so that:
--   * Profile-level posts (community_id IS NULL) are visible to everyone.
--   * Posts in non-private communities are visible to everyone.
--   * Posts in private communities are only visible to the owner and to
--     members of that community.
--
-- Authors keep full insert/update/delete control over their own rows.
--
-- Safe to run multiple times. Delete this file after running it once.
-- =============================================================================

alter table public.community_posts enable row level security;

-- 1) Drop any old SELECT policies so we start clean.
do $$
declare p record;
begin
  for p in
    select polname
    from pg_policy
    where polrelid = 'public.community_posts'::regclass
      and polcmd = 'r' -- SELECT
  loop
    execute format('drop policy if exists %I on public.community_posts', p.polname);
  end loop;
end$$;

-- 2) Permissive SELECT: profile posts + public-community posts are open,
--    private-community posts are restricted to owner/members.
create policy "community_posts_select_visible"
  on public.community_posts
  for select
  using (
    community_id is null
    or exists (
      select 1
      from public.communities c
      where c.id = community_posts.community_id
        and (
          coalesce(c.is_private, false) = false
          or c.owner_id = auth.uid()
          or exists (
            select 1
            from public.community_members m
            where m.community_id = c.id
              and m.user_id = auth.uid()
          )
        )
    )
  );

-- 3) Make sure authors can still write/edit/delete their own posts.
drop policy if exists "community_posts_insert_own" on public.community_posts;
create policy "community_posts_insert_own"
  on public.community_posts
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "community_posts_update_own" on public.community_posts;
create policy "community_posts_update_own"
  on public.community_posts
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "community_posts_delete_own" on public.community_posts;
create policy "community_posts_delete_own"
  on public.community_posts
  for delete
  to authenticated
  using (user_id = auth.uid());

-- 4) Same idea for likes/reposts so counts and viewer-state work across users.
alter table public.community_post_likes enable row level security;

do $$
declare p record;
begin
  for p in
    select polname
    from pg_policy
    where polrelid = 'public.community_post_likes'::regclass
      and polcmd = 'r'
  loop
    execute format('drop policy if exists %I on public.community_post_likes', p.polname);
  end loop;
end$$;

create policy "community_post_likes_select_all"
  on public.community_post_likes
  for select
  using (true);

drop policy if exists "community_post_likes_insert_self" on public.community_post_likes;
create policy "community_post_likes_insert_self"
  on public.community_post_likes
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "community_post_likes_delete_self" on public.community_post_likes;
create policy "community_post_likes_delete_self"
  on public.community_post_likes
  for delete
  to authenticated
  using (user_id = auth.uid());

alter table public.community_post_reposts enable row level security;

do $$
declare p record;
begin
  for p in
    select polname
    from pg_policy
    where polrelid = 'public.community_post_reposts'::regclass
      and polcmd = 'r'
  loop
    execute format('drop policy if exists %I on public.community_post_reposts', p.polname);
  end loop;
end$$;

create policy "community_post_reposts_select_all"
  on public.community_post_reposts
  for select
  using (true);

drop policy if exists "community_post_reposts_insert_self" on public.community_post_reposts;
create policy "community_post_reposts_insert_self"
  on public.community_post_reposts
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "community_post_reposts_delete_self" on public.community_post_reposts;
create policy "community_post_reposts_delete_self"
  on public.community_post_reposts
  for delete
  to authenticated
  using (user_id = auth.uid());
