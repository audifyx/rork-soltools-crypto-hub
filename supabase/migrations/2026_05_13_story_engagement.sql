-- Story engagement: likes, comments, replies, comment likes, and view tracking.
-- Consolidated migration — supersedes any prior story engagement file.
-- Idempotent. Safe to re-run.

-- ---------------------------------------------------------------------------
-- Counters on stories
-- ---------------------------------------------------------------------------
alter table public.stories
  add column if not exists likes_count integer not null default 0,
  add column if not exists comments_count integer not null default 0,
  add column if not exists view_count integer not null default 0;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.story_likes (
  story_id uuid not null references public.stories(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (story_id, user_id)
);
create index if not exists idx_story_likes_user on public.story_likes(user_id);
create index if not exists idx_story_likes_story on public.story_likes(story_id);

create table if not exists public.story_comments (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);

-- Add reply + counter columns to existing story_comments
alter table public.story_comments
  add column if not exists parent_comment_id uuid references public.story_comments(id) on delete cascade,
  add column if not exists likes_count integer not null default 0,
  add column if not exists replies_count integer not null default 0;

create index if not exists idx_story_comments_story on public.story_comments(story_id, created_at desc);
create index if not exists idx_story_comments_user on public.story_comments(user_id);
create index if not exists idx_story_comments_parent on public.story_comments(parent_comment_id, created_at asc);

create table if not exists public.story_comment_likes (
  comment_id uuid not null references public.story_comments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);
create index if not exists idx_story_comment_likes_user on public.story_comment_likes(user_id);
create index if not exists idx_story_comment_likes_comment on public.story_comment_likes(comment_id);

create table if not exists public.story_views (
  story_id uuid not null references public.stories(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (story_id, user_id)
);
create index if not exists idx_story_views_story on public.story_views(story_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.story_likes         enable row level security;
alter table public.story_comments      enable row level security;
alter table public.story_comment_likes enable row level security;
alter table public.story_views         enable row level security;

drop policy if exists sl_read on public.story_likes;
create policy sl_read on public.story_likes for select using (true);
drop policy if exists sl_write on public.story_likes;
create policy sl_write on public.story_likes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists sc_read on public.story_comments;
create policy sc_read on public.story_comments for select using (true);
drop policy if exists sc_insert on public.story_comments;
create policy sc_insert on public.story_comments
  for insert with check (auth.uid() = user_id);
drop policy if exists sc_delete on public.story_comments;
create policy sc_delete on public.story_comments
  for delete using (auth.uid() = user_id);

drop policy if exists scl_read on public.story_comment_likes;
create policy scl_read on public.story_comment_likes for select using (true);
drop policy if exists scl_write on public.story_comment_likes;
create policy scl_write on public.story_comment_likes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists sv_read on public.story_views;
create policy sv_read on public.story_views for select using (true);
drop policy if exists sv_write on public.story_views;
create policy sv_write on public.story_views
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- View story: idempotent per (story, user).
create or replace function public.view_story(p_story_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_inserted integer := 0;
begin
  if v_user is null then
    return;
  end if;
  insert into public.story_views(story_id, user_id)
    values (p_story_id, v_user)
    on conflict (story_id, user_id) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted > 0 then
    update public.stories
      set view_count = coalesce(view_count, 0) + 1
      where id = p_story_id;
  end if;
end;
$$;
grant execute on function public.view_story(uuid) to authenticated;

-- Toggle like on a story
create or replace function public.toggle_story_like(p_story_id uuid)
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
    select 1 from public.story_likes
    where story_id = p_story_id and user_id = v_user
  ) into v_exists;

  if v_exists then
    delete from public.story_likes
      where story_id = p_story_id and user_id = v_user;
    update public.stories
      set likes_count = greatest(0, coalesce(likes_count, 0) - 1)
      where id = p_story_id
      returning coalesce(likes_count, 0) into v_count;
    return query select false, coalesce(v_count, 0);
  else
    insert into public.story_likes(story_id, user_id)
      values (p_story_id, v_user)
      on conflict do nothing;
    update public.stories
      set likes_count = coalesce(likes_count, 0) + 1
      where id = p_story_id
      returning coalesce(likes_count, 0) into v_count;
    return query select true, coalesce(v_count, 0);
  end if;
end;
$$;
grant execute on function public.toggle_story_like(uuid) to authenticated;

-- Add comment (top-level or reply when p_parent_comment_id is provided)
create or replace function public.add_story_comment(
  p_story_id uuid,
  p_body text,
  p_parent_comment_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_body text := btrim(coalesce(p_body, ''));
  v_id uuid;
  v_parent_story uuid;
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;
  if length(v_body) = 0 then
    raise exception 'empty_body';
  end if;
  if length(v_body) > 500 then
    v_body := substring(v_body from 1 for 500);
  end if;

  if p_parent_comment_id is not null then
    select story_id into v_parent_story
      from public.story_comments
     where id = p_parent_comment_id;
    if v_parent_story is null then
      raise exception 'parent_not_found';
    end if;
    if v_parent_story <> p_story_id then
      raise exception 'parent_story_mismatch';
    end if;
  end if;

  insert into public.story_comments(story_id, user_id, body, parent_comment_id)
    values (p_story_id, v_user, v_body, p_parent_comment_id)
    returning id into v_id;

  update public.stories
    set comments_count = coalesce(comments_count, 0) + 1
    where id = p_story_id;

  if p_parent_comment_id is not null then
    update public.story_comments
      set replies_count = coalesce(replies_count, 0) + 1
      where id = p_parent_comment_id;
  end if;

  return v_id;
end;
$$;
grant execute on function public.add_story_comment(uuid, text, uuid) to authenticated;
grant execute on function public.add_story_comment(uuid, text) to authenticated;

-- Delete own comment. Cascades to replies via FK; updates counters.
create or replace function public.delete_story_comment(p_comment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_story uuid;
  v_parent uuid;
  v_descendants integer := 0;
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;
  select story_id, parent_comment_id into v_story, v_parent
    from public.story_comments
   where id = p_comment_id and user_id = v_user;
  if v_story is null then
    raise exception 'not_found';
  end if;

  -- Count descendants (replies) before deletion so we can adjust counters.
  with recursive descendants as (
    select id from public.story_comments where parent_comment_id = p_comment_id
    union all
    select c.id from public.story_comments c
    join descendants d on c.parent_comment_id = d.id
  )
  select count(*) into v_descendants from descendants;

  delete from public.story_comments where id = p_comment_id;

  update public.stories
    set comments_count = greatest(0, coalesce(comments_count, 0) - (1 + v_descendants))
    where id = v_story;

  if v_parent is not null then
    update public.story_comments
      set replies_count = greatest(0, coalesce(replies_count, 0) - 1)
      where id = v_parent;
  end if;
end;
$$;
grant execute on function public.delete_story_comment(uuid) to authenticated;

-- Toggle like on a comment
create or replace function public.toggle_story_comment_like(p_comment_id uuid)
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
    select 1 from public.story_comment_likes
    where comment_id = p_comment_id and user_id = v_user
  ) into v_exists;

  if v_exists then
    delete from public.story_comment_likes
      where comment_id = p_comment_id and user_id = v_user;
    update public.story_comments
      set likes_count = greatest(0, coalesce(likes_count, 0) - 1)
      where id = p_comment_id
      returning coalesce(likes_count, 0) into v_count;
    return query select false, coalesce(v_count, 0);
  else
    insert into public.story_comment_likes(comment_id, user_id)
      values (p_comment_id, v_user)
      on conflict do nothing;
    update public.story_comments
      set likes_count = coalesce(likes_count, 0) + 1
      where id = p_comment_id
      returning coalesce(likes_count, 0) into v_count;
    return query select true, coalesce(v_count, 0);
  end if;
end;
$$;
grant execute on function public.toggle_story_comment_like(uuid) to authenticated;
