-- =====================================================================
-- STORIES — ephemeral 36h photo stories with viewer tracking
-- =====================================================================
-- Idempotent migration that adds:
--   • stories + story_views tables
--   • storage bucket `story-media`
--   • RPCs: list_active_stories, list_story_viewers, record_story_view,
--           delete_my_story, sweep_expired_stories
--   • RLS, indexes, realtime publication
-- =====================================================================

create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- 1. Tables ----------------------------------------------------------
create table if not exists public.stories (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  media_url   text not null,
  caption     text,
  views_count integer not null default 0,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '36 hours')
);
create index if not exists stories_user_idx       on public.stories (user_id, created_at desc);
create index if not exists stories_active_idx     on public.stories (expires_at) where expires_at > now();
create index if not exists stories_created_idx    on public.stories (created_at desc);

create table if not exists public.story_views (
  story_id   uuid not null references public.stories(id) on delete cascade,
  viewer_id  uuid not null references auth.users(id) on delete cascade,
  viewed_at  timestamptz not null default now(),
  primary key (story_id, viewer_id)
);
create index if not exists story_views_viewer_idx on public.story_views (viewer_id, viewed_at desc);
create index if not exists story_views_story_idx  on public.story_views (story_id, viewed_at desc);

-- 2. RLS -------------------------------------------------------------
alter table public.stories      enable row level security;
alter table public.story_views  enable row level security;

drop policy if exists stories_read         on public.stories;
drop policy if exists stories_insert_self  on public.stories;
drop policy if exists stories_delete_self  on public.stories;
create policy stories_read        on public.stories for select using (true);
create policy stories_insert_self on public.stories for insert to authenticated
  with check (auth.uid() = user_id);
create policy stories_delete_self on public.stories for delete to authenticated
  using (auth.uid() = user_id);

drop policy if exists story_views_read        on public.story_views;
drop policy if exists story_views_insert_self on public.story_views;
create policy story_views_read        on public.story_views for select using (true);
create policy story_views_insert_self on public.story_views for insert to authenticated
  with check (auth.uid() = viewer_id);

-- 3. Storage bucket --------------------------------------------------
insert into storage.buckets (id, name, public) values
  ('story-media', 'story-media', true)
  on conflict (id) do update set public = true;

do $$
declare b text := 'story-media';
begin
  begin execute format('drop policy if exists %I on storage.objects', b||'_read'); exception when others then null; end;
  begin execute format('drop policy if exists %I on storage.objects', b||'_insert'); exception when others then null; end;
  begin execute format('drop policy if exists %I on storage.objects', b||'_update'); exception when others then null; end;
  begin execute format('drop policy if exists %I on storage.objects', b||'_delete'); exception when others then null; end;

  execute format($p$create policy %I on storage.objects
    for select using (bucket_id = %L)$p$, b||'_read', b);
  execute format($p$create policy %I on storage.objects
    for insert to authenticated
    with check (bucket_id = %L and (storage.foldername(name))[1] = auth.uid()::text)$p$, b||'_insert', b);
  execute format($p$create policy %I on storage.objects
    for update to authenticated
    using (bucket_id = %L and (storage.foldername(name))[1] = auth.uid()::text)
    with check (bucket_id = %L and (storage.foldername(name))[1] = auth.uid()::text)$p$, b||'_update', b, b);
  execute format($p$create policy %I on storage.objects
    for delete to authenticated
    using (bucket_id = %L and (storage.foldername(name))[1] = auth.uid()::text)$p$, b||'_delete', b);
end $$;

-- 4. Sweep helper (callers can run this opportunistically) -----------
create or replace function public.sweep_expired_stories()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  with d as (delete from public.stories where expires_at <= now() returning 1)
  select count(*)::int into n from d;
  return coalesce(n, 0);
end $$;
grant execute on function public.sweep_expired_stories() to authenticated, anon;

-- 5. List active stories with author + viewed_by_me ------------------
create or replace function public.list_active_stories(max_rows int default 200)
returns table (
  id           uuid,
  user_id      uuid,
  username     text,
  display_name text,
  avatar_url   text,
  avatar_color text,
  verified     boolean,
  media_url    text,
  caption      text,
  views_count  integer,
  created_at   timestamptz,
  expires_at   timestamptz,
  viewed_by_me boolean
) language plpgsql stable security definer set search_path = public as $$
declare caller uuid := auth.uid();
begin
  return query
    select s.id,
           s.user_id,
           p.username::text,
           p.display_name,
           p.avatar_url,
           p.avatar_color,
           coalesce(p.verified, false),
           s.media_url,
           s.caption,
           s.views_count,
           s.created_at,
           s.expires_at,
           case when caller is null then false
                else exists(select 1 from public.story_views v
                             where v.story_id = s.id and v.viewer_id = caller)
           end
      from public.stories s
      join public.profiles p on p.id = s.user_id
     where s.expires_at > now()
       and coalesce(p.is_banned, false) = false
     order by s.created_at desc
     limit greatest(1, least(max_rows, 500));
end $$;
grant execute on function public.list_active_stories(int) to authenticated, anon;

-- 6. Viewers for a story (only owner can call meaningfully) ----------
create or replace function public.list_story_viewers(target_story_id uuid)
returns table (
  user_id      uuid,
  username     text,
  display_name text,
  avatar_url   text,
  avatar_color text,
  verified     boolean,
  viewed_at    timestamptz
) language plpgsql stable security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  owner  uuid;
begin
  select user_id into owner from public.stories where id = target_story_id;
  if owner is null then return; end if;
  -- Anyone can read viewer list (RLS allowed) but we still gate to owner
  -- to avoid leaking viewers across users.
  if caller is null or caller <> owner then return; end if;

  return query
    select v.viewer_id,
           p.username::text,
           p.display_name,
           p.avatar_url,
           p.avatar_color,
           coalesce(p.verified, false),
           v.viewed_at
      from public.story_views v
      join public.profiles p on p.id = v.viewer_id
     where v.story_id = target_story_id
     order by v.viewed_at desc
     limit 500;
end $$;
grant execute on function public.list_story_viewers(uuid) to authenticated;

-- 7. Record a view (idempotent, increments views_count once) ---------
create or replace function public.record_story_view(target_story_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  owner  uuid;
  fresh  boolean := false;
  new_count integer;
begin
  if caller is null then return 0; end if;
  select user_id into owner from public.stories where id = target_story_id;
  if owner is null then return 0; end if;
  if owner = caller then
    select views_count into new_count from public.stories where id = target_story_id;
    return coalesce(new_count, 0);
  end if;

  insert into public.story_views (story_id, viewer_id)
  values (target_story_id, caller)
  on conflict do nothing;
  get diagnostics fresh = row_count;

  if fresh then
    update public.stories
       set views_count = views_count + 1
     where id = target_story_id
     returning views_count into new_count;
  else
    select views_count into new_count from public.stories where id = target_story_id;
  end if;

  return coalesce(new_count, 0);
end $$;
grant execute on function public.record_story_view(uuid) to authenticated;

-- 8. Delete my story --------------------------------------------------
create or replace function public.delete_my_story(target_story_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare caller uuid := auth.uid();
begin
  if caller is null then return false; end if;
  delete from public.stories
   where id = target_story_id and user_id = caller;
  return found;
end $$;
grant execute on function public.delete_my_story(uuid) to authenticated;

-- 9. Realtime publication --------------------------------------------
do $$
declare
  t text;
  tables text[] := array['stories','story_views'];
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

-- =====================================================================
-- DONE
-- =====================================================================
