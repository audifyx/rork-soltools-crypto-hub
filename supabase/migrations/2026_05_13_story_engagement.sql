-- Story engagement: likes, comments, and view tracking.
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
create index if not exists idx_story_comments_story on public.story_comments(story_id, created_at desc);
create index if not exists idx_story_comments_user on public.story_comments(user_id);

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
alter table public.story_likes    enable row level security;
alter table public.story_comments enable row level security;
alter table public.story_views    enable row level security;

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

drop policy if exists sv_read on public.story_views;
create policy sv_read on public.story_views for select using (true);
drop policy if exists sv_write on public.story_views;
create policy sv_write on public.story_views
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------

-- View story: idempotent per (story, user). Increments view_count only the
-- first time a given user views a given story.
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

-- Toggle like
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

-- Add comment
create or replace function public.add_story_comment(p_story_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_body text := btrim(coalesce(p_body, ''));
  v_id uuid;
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

  insert into public.story_comments(story_id, user_id, body)
    values (p_story_id, v_user, v_body)
    returning id into v_id;

  update public.stories
    set comments_count = coalesce(comments_count, 0) + 1
    where id = p_story_id;

  return v_id;
end;
$$;
grant execute on function public.add_story_comment(uuid, text) to authenticated;

-- Delete own comment
create or replace function public.delete_story_comment(p_comment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_story uuid;
begin
  if v_user is null then
    raise exception 'not_authenticated';
  end if;
  select story_id into v_story
    from public.story_comments
   where id = p_comment_id and user_id = v_user;
  if v_story is null then
    raise exception 'not_found';
  end if;
  delete from public.story_comments where id = p_comment_id;
  update public.stories
    set comments_count = greatest(0, coalesce(comments_count, 0) - 1)
    where id = v_story;
end;
$$;
grant execute on function public.delete_story_comment(uuid) to authenticated;
