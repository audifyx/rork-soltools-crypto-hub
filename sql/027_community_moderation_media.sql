-- 027_community_moderation_media.sql
-- Adds community post media support helpers, saved/report state enrichment,
-- moderator pinning, and user reporting. Safe to run more than once.

create extension if not exists pgcrypto;

create table if not exists public.admin_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('superadmin', 'admin', 'moderator', 'support')),
  created_at timestamptz not null default now()
);

alter table public.admin_roles enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'admin_roles'
      and policyname = 'admin_roles_select_self'
  ) then
    create policy admin_roles_select_self
      on public.admin_roles
      for select
      using (auth.uid() = user_id);
  end if;
end $$;

create or replace function public.is_community_post_moderator(target_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.admin_roles ar
    where ar.user_id = target_user_id
      and ar.role in ('superadmin', 'admin', 'moderator')
  );
$$;

alter table if exists public.community_posts
  add column if not exists pinned boolean not null default false,
  add column if not exists image_url text;

create table if not exists public.post_reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  reporter_id uuid not null references auth.users(id) on delete cascade,
  reason text not null default 'reported from app',
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed', 'actioned')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  unique (post_id, reporter_id)
);

create index if not exists idx_community_posts_pinned_created
  on public.community_posts(community_id, pinned desc, created_at desc)
  where parent_post_id is null;
create index if not exists idx_post_reports_post_created on public.post_reports(post_id, created_at desc);
create index if not exists idx_post_reports_reporter_created on public.post_reports(reporter_id, created_at desc);
create index if not exists idx_post_reports_status_created on public.post_reports(status, created_at desc);

alter table public.post_reports enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'post_reports'
      and policyname = 'post_reports_select_own_or_moderator'
  ) then
    create policy post_reports_select_own_or_moderator
      on public.post_reports
      for select
      using (auth.uid() = reporter_id or public.is_community_post_moderator(auth.uid()));
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'post_reports'
      and policyname = 'post_reports_insert_own'
  ) then
    create policy post_reports_insert_own
      on public.post_reports
      for insert
      with check (auth.uid() = reporter_id);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'post_reports'
      and policyname = 'post_reports_update_moderator'
  ) then
    create policy post_reports_update_moderator
      on public.post_reports
      for update
      using (public.is_community_post_moderator(auth.uid()))
      with check (public.is_community_post_moderator(auth.uid()));
  end if;
end $$;

create or replace function public.report_community_post(target_post_id uuid, p_reason text default 'reported from app')
returns table(reported boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  acting_user uuid := auth.uid();
  clean_reason text := left(nullif(trim(coalesce(p_reason, '')), ''), 500);
begin
  if acting_user is null then
    raise exception 'Sign in required';
  end if;

  if not exists (select 1 from public.community_posts cp where cp.id = target_post_id) then
    raise exception 'Post not found';
  end if;

  insert into public.post_reports(post_id, reporter_id, reason)
  values (target_post_id, acting_user, coalesce(clean_reason, 'reported from app'))
  on conflict (post_id, reporter_id) do update
    set reason = excluded.reason,
        status = 'open',
        created_at = now(),
        reviewed_at = null,
        reviewed_by = null;

  return query select true;
end;
$$;

create or replace function public.toggle_community_post_pin(target_post_id uuid)
returns table(pinned boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  acting_user uuid := auth.uid();
  next_pinned boolean;
begin
  if acting_user is null then
    raise exception 'Sign in required';
  end if;
  if not public.is_community_post_moderator(acting_user) then
    raise exception 'Only moderators can pin posts';
  end if;

  update public.community_posts cp
  set pinned = not coalesce(cp.pinned, false)
  where cp.id = target_post_id
  returning cp.pinned into next_pinned;

  if next_pinned is null then
    raise exception 'Post not found';
  end if;

  return query select next_pinned;
end;
$$;

drop function if exists public.list_community_posts(uuid, integer);
create function public.list_community_posts(target_community_id uuid, max_rows integer default 100)
returns table(
  id uuid,
  community_id uuid,
  user_id uuid,
  username text,
  display_name text,
  avatar_color text,
  content text,
  image_url text,
  ticker text,
  change_pct numeric,
  created_at timestamptz,
  likes_count integer,
  comments_count integer,
  reposts_count integer,
  liked boolean,
  reposted boolean,
  bookmarked boolean,
  reported boolean,
  pinned boolean,
  parent_post_id uuid,
  quote_post_id uuid,
  quote_content text,
  quote_author_username text,
  quote_author_display_name text,
  quote_image_url text,
  quote_ticker text,
  quote_created_at timestamptz,
  parent_content text,
  parent_author_username text,
  parent_author_display_name text
)
language sql
security definer
set search_path = public
as $$
  select
    cp.id,
    cp.community_id,
    cp.user_id,
    prof.username::text,
    prof.display_name::text,
    prof.avatar_color::text,
    cp.content::text,
    cp.image_url::text,
    cp.ticker::text,
    cp.change_pct,
    cp.created_at,
    coalesce(cp.likes_count, 0)::integer,
    coalesce(cp.comments_count, 0)::integer,
    coalesce(cp.reposts_count, 0)::integer,
    exists (select 1 from public.post_likes pl where pl.post_id = cp.id and pl.user_id = auth.uid()) as liked,
    exists (select 1 from public.post_reposts pr where pr.post_id = cp.id and pr.user_id = auth.uid()) as reposted,
    exists (select 1 from public.post_bookmarks pb where pb.post_id = cp.id and pb.user_id = auth.uid()) as bookmarked,
    exists (select 1 from public.post_reports rr where rr.post_id = cp.id and rr.reporter_id = auth.uid()) as reported,
    coalesce(cp.pinned, false) as pinned,
    cp.parent_post_id,
    cp.quote_post_id,
    qp.content::text as quote_content,
    qprof.username::text as quote_author_username,
    qprof.display_name::text as quote_author_display_name,
    qp.image_url::text as quote_image_url,
    qp.ticker::text as quote_ticker,
    qp.created_at as quote_created_at,
    pp.content::text as parent_content,
    pprof.username::text as parent_author_username,
    pprof.display_name::text as parent_author_display_name
  from public.community_posts cp
  left join public.profiles prof on prof.user_id = cp.user_id or prof.id = cp.user_id
  left join public.community_posts qp on qp.id = cp.quote_post_id
  left join public.profiles qprof on qprof.user_id = qp.user_id or qprof.id = qp.user_id
  left join public.community_posts pp on pp.id = cp.parent_post_id
  left join public.profiles pprof on pprof.user_id = pp.user_id or pprof.id = pp.user_id
  where cp.community_id = target_community_id
    and cp.parent_post_id is null
  order by coalesce(cp.pinned, false) desc, cp.created_at desc
  limit greatest(1, least(coalesce(max_rows, 100), 250));
$$;

drop function if exists public.list_post_replies(uuid, integer);
create function public.list_post_replies(target_post_id uuid, max_rows integer default 100)
returns table(
  id uuid,
  community_id uuid,
  user_id uuid,
  username text,
  display_name text,
  avatar_color text,
  content text,
  image_url text,
  ticker text,
  change_pct numeric,
  created_at timestamptz,
  likes_count integer,
  comments_count integer,
  reposts_count integer,
  liked boolean,
  reposted boolean,
  bookmarked boolean,
  reported boolean,
  pinned boolean,
  parent_post_id uuid,
  quote_post_id uuid,
  quote_content text,
  quote_author_username text,
  quote_author_display_name text,
  quote_image_url text,
  quote_ticker text,
  quote_created_at timestamptz,
  parent_content text,
  parent_author_username text,
  parent_author_display_name text
)
language sql
security definer
set search_path = public
as $$
  select
    cp.id,
    cp.community_id,
    cp.user_id,
    prof.username::text,
    prof.display_name::text,
    prof.avatar_color::text,
    cp.content::text,
    cp.image_url::text,
    cp.ticker::text,
    cp.change_pct,
    cp.created_at,
    coalesce(cp.likes_count, 0)::integer,
    coalesce(cp.comments_count, 0)::integer,
    coalesce(cp.reposts_count, 0)::integer,
    exists (select 1 from public.post_likes pl where pl.post_id = cp.id and pl.user_id = auth.uid()) as liked,
    exists (select 1 from public.post_reposts pr where pr.post_id = cp.id and pr.user_id = auth.uid()) as reposted,
    exists (select 1 from public.post_bookmarks pb where pb.post_id = cp.id and pb.user_id = auth.uid()) as bookmarked,
    exists (select 1 from public.post_reports rr where rr.post_id = cp.id and rr.reporter_id = auth.uid()) as reported,
    coalesce(cp.pinned, false) as pinned,
    cp.parent_post_id,
    cp.quote_post_id,
    qp.content::text as quote_content,
    qprof.username::text as quote_author_username,
    qprof.display_name::text as quote_author_display_name,
    qp.image_url::text as quote_image_url,
    qp.ticker::text as quote_ticker,
    qp.created_at as quote_created_at,
    pp.content::text as parent_content,
    pprof.username::text as parent_author_username,
    pprof.display_name::text as parent_author_display_name
  from public.community_posts cp
  left join public.profiles prof on prof.user_id = cp.user_id or prof.id = cp.user_id
  left join public.community_posts qp on qp.id = cp.quote_post_id
  left join public.profiles qprof on qprof.user_id = qp.user_id or qprof.id = qp.user_id
  left join public.community_posts pp on pp.id = cp.parent_post_id
  left join public.profiles pprof on pprof.user_id = pp.user_id or pprof.id = pp.user_id
  where cp.parent_post_id = target_post_id
  order by cp.created_at asc
  limit greatest(1, least(coalesce(max_rows, 100), 250));
$$;

grant execute on function public.is_community_post_moderator(uuid) to authenticated;
grant execute on function public.report_community_post(uuid, text) to authenticated;
grant execute on function public.toggle_community_post_pin(uuid) to authenticated;
grant execute on function public.list_community_posts(uuid, integer) to anon, authenticated;
grant execute on function public.list_post_replies(uuid, integer) to anon, authenticated;
