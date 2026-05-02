-- 025_community_interactions.sql
-- Adds X-style community interactions: likes, replies, reposts, quotes, bookmarks,
-- and RPCs used by the Expo app. Safe to run more than once.

create extension if not exists pgcrypto;

alter table if exists public.community_posts
  add column if not exists parent_post_id uuid references public.community_posts(id) on delete cascade,
  add column if not exists quote_post_id uuid references public.community_posts(id) on delete set null,
  add column if not exists reposts_count integer not null default 0,
  add column if not exists likes_count integer not null default 0,
  add column if not exists comments_count integer not null default 0;

create table if not exists public.post_likes (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.post_reposts (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.post_bookmarks (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index if not exists idx_community_posts_parent_created
  on public.community_posts(parent_post_id, created_at desc);
create index if not exists idx_community_posts_quote_created
  on public.community_posts(quote_post_id, created_at desc);
create index if not exists idx_community_posts_community_top_created
  on public.community_posts(community_id, created_at desc)
  where parent_post_id is null;
create index if not exists idx_post_likes_user on public.post_likes(user_id, created_at desc);
create index if not exists idx_post_reposts_user on public.post_reposts(user_id, created_at desc);
create index if not exists idx_post_bookmarks_user on public.post_bookmarks(user_id, created_at desc);

alter table public.post_likes enable row level security;
alter table public.post_reposts enable row level security;
alter table public.post_bookmarks enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'post_likes' and policyname = 'post_likes_select') then
    create policy post_likes_select on public.post_likes for select using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'post_likes' and policyname = 'post_likes_insert_own') then
    create policy post_likes_insert_own on public.post_likes for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'post_likes' and policyname = 'post_likes_delete_own') then
    create policy post_likes_delete_own on public.post_likes for delete using (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'post_reposts' and policyname = 'post_reposts_select') then
    create policy post_reposts_select on public.post_reposts for select using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'post_reposts' and policyname = 'post_reposts_insert_own') then
    create policy post_reposts_insert_own on public.post_reposts for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'post_reposts' and policyname = 'post_reposts_delete_own') then
    create policy post_reposts_delete_own on public.post_reposts for delete using (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'post_bookmarks' and policyname = 'post_bookmarks_select_own') then
    create policy post_bookmarks_select_own on public.post_bookmarks for select using (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'post_bookmarks' and policyname = 'post_bookmarks_insert_own') then
    create policy post_bookmarks_insert_own on public.post_bookmarks for insert with check (auth.uid() = user_id);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'post_bookmarks' and policyname = 'post_bookmarks_delete_own') then
    create policy post_bookmarks_delete_own on public.post_bookmarks for delete using (auth.uid() = user_id);
  end if;
end $$;

create or replace function public.sync_community_post_counts(target_post_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if target_post_id is null then
    return;
  end if;

  update public.community_posts cp
  set
    likes_count = coalesce((select count(*)::integer from public.post_likes pl where pl.post_id = target_post_id), 0),
    comments_count = coalesce((select count(*)::integer from public.community_posts replies where replies.parent_post_id = target_post_id), 0),
    reposts_count = coalesce((select count(*)::integer from public.post_reposts pr where pr.post_id = target_post_id), 0)
      + coalesce((select count(*)::integer from public.community_posts quotes where quotes.quote_post_id = target_post_id), 0)
  where cp.id = target_post_id;
end;
$$;

create or replace function public.sync_post_like_count_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_community_post_counts(coalesce(new.post_id, old.post_id));
  return coalesce(new, old);
end;
$$;

create or replace function public.sync_post_repost_count_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_community_post_counts(coalesce(new.post_id, old.post_id));
  return coalesce(new, old);
end;
$$;

create or replace function public.sync_reply_quote_count_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op in ('DELETE', 'UPDATE') then
    perform public.sync_community_post_counts(old.parent_post_id);
    perform public.sync_community_post_counts(old.quote_post_id);
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.sync_community_post_counts(new.parent_post_id);
    perform public.sync_community_post_counts(new.quote_post_id);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_post_likes_sync_counts on public.post_likes;
create trigger trg_post_likes_sync_counts
after insert or delete on public.post_likes
for each row execute function public.sync_post_like_count_trigger();

drop trigger if exists trg_post_reposts_sync_counts on public.post_reposts;
create trigger trg_post_reposts_sync_counts
after insert or delete on public.post_reposts
for each row execute function public.sync_post_repost_count_trigger();

drop trigger if exists trg_community_posts_reply_quote_sync_counts on public.community_posts;
create trigger trg_community_posts_reply_quote_sync_counts
after insert or delete or update of parent_post_id, quote_post_id on public.community_posts
for each row execute function public.sync_reply_quote_count_trigger();

create or replace function public.toggle_post_like(target_post_id uuid)
returns table(liked boolean, likes_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  acting_user uuid := auth.uid();
  now_liked boolean;
  next_count integer;
begin
  if acting_user is null then
    raise exception 'Sign in required';
  end if;

  if exists (select 1 from public.post_likes pl where pl.post_id = target_post_id and pl.user_id = acting_user) then
    delete from public.post_likes pl where pl.post_id = target_post_id and pl.user_id = acting_user;
    now_liked := false;
  else
    insert into public.post_likes(post_id, user_id) values (target_post_id, acting_user)
    on conflict do nothing;
    now_liked := true;
  end if;

  perform public.sync_community_post_counts(target_post_id);
  select cp.likes_count into next_count from public.community_posts cp where cp.id = target_post_id;
  return query select now_liked, coalesce(next_count, 0);
end;
$$;

create or replace function public.toggle_post_repost(target_post_id uuid)
returns table(reposted boolean, reposts_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  acting_user uuid := auth.uid();
  now_reposted boolean;
  next_count integer;
begin
  if acting_user is null then
    raise exception 'Sign in required';
  end if;

  if exists (select 1 from public.post_reposts pr where pr.post_id = target_post_id and pr.user_id = acting_user) then
    delete from public.post_reposts pr where pr.post_id = target_post_id and pr.user_id = acting_user;
    now_reposted := false;
  else
    insert into public.post_reposts(post_id, user_id) values (target_post_id, acting_user)
    on conflict do nothing;
    now_reposted := true;
  end if;

  perform public.sync_community_post_counts(target_post_id);
  select cp.reposts_count into next_count from public.community_posts cp where cp.id = target_post_id;
  return query select now_reposted, coalesce(next_count, 0);
end;
$$;

create or replace function public.toggle_post_bookmark(target_post_id uuid)
returns table(bookmarked boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  acting_user uuid := auth.uid();
  now_bookmarked boolean;
begin
  if acting_user is null then
    raise exception 'Sign in required';
  end if;

  if exists (select 1 from public.post_bookmarks pb where pb.post_id = target_post_id and pb.user_id = acting_user) then
    delete from public.post_bookmarks pb where pb.post_id = target_post_id and pb.user_id = acting_user;
    now_bookmarked := false;
  else
    insert into public.post_bookmarks(post_id, user_id) values (target_post_id, acting_user)
    on conflict do nothing;
    now_bookmarked := true;
  end if;

  return query select now_bookmarked;
end;
$$;

create or replace function public.list_community_posts(target_community_id uuid, max_rows integer default 100)
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
    false as pinned,
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
  order by cp.created_at desc
  limit greatest(1, least(coalesce(max_rows, 100), 250));
$$;

create or replace function public.list_post_replies(target_post_id uuid, max_rows integer default 100)
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
    false as pinned,
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

create or replace function public.create_post_reply(target_post_id uuid, p_content text)
returns table(
  id uuid,
  community_id uuid,
  user_id uuid,
  content text,
  created_at timestamptz,
  parent_post_id uuid,
  comments_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  acting_user uuid := auth.uid();
  parent_row public.community_posts%rowtype;
  inserted_row public.community_posts%rowtype;
  clean_content text := nullif(trim(coalesce(p_content, '')), '');
begin
  if acting_user is null then
    raise exception 'Sign in required';
  end if;
  if clean_content is null then
    raise exception 'Reply cannot be empty';
  end if;

  select * into parent_row from public.community_posts cp where cp.id = target_post_id;
  if parent_row.id is null then
    raise exception 'Post not found';
  end if;

  insert into public.community_posts(user_id, community_id, parent_post_id, content)
  values (acting_user, parent_row.community_id, target_post_id, clean_content)
  returning * into inserted_row;

  perform public.sync_community_post_counts(target_post_id);

  return query
  select inserted_row.id,
         inserted_row.community_id,
         inserted_row.user_id,
         inserted_row.content::text,
         inserted_row.created_at,
         inserted_row.parent_post_id,
         coalesce((select cp.comments_count from public.community_posts cp where cp.id = target_post_id), 0)::integer;
end;
$$;

create or replace function public.quote_community_post(target_post_id uuid, p_content text)
returns table(
  id uuid,
  community_id uuid,
  user_id uuid,
  content text,
  created_at timestamptz,
  quote_post_id uuid,
  reposts_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  acting_user uuid := auth.uid();
  source_row public.community_posts%rowtype;
  inserted_row public.community_posts%rowtype;
  clean_content text := nullif(trim(coalesce(p_content, '')), '');
begin
  if acting_user is null then
    raise exception 'Sign in required';
  end if;
  if clean_content is null then
    raise exception 'Quote cannot be empty';
  end if;

  select * into source_row from public.community_posts cp where cp.id = target_post_id;
  if source_row.id is null then
    raise exception 'Post not found';
  end if;

  insert into public.community_posts(user_id, community_id, quote_post_id, content)
  values (acting_user, source_row.community_id, target_post_id, clean_content)
  returning * into inserted_row;

  perform public.sync_community_post_counts(target_post_id);

  return query
  select inserted_row.id,
         inserted_row.community_id,
         inserted_row.user_id,
         inserted_row.content::text,
         inserted_row.created_at,
         inserted_row.quote_post_id,
         coalesce((select cp.reposts_count from public.community_posts cp where cp.id = target_post_id), 0)::integer;
end;
$$;

grant execute on function public.toggle_post_like(uuid) to authenticated;
grant execute on function public.toggle_post_repost(uuid) to authenticated;
grant execute on function public.toggle_post_bookmark(uuid) to authenticated;
grant execute on function public.list_community_posts(uuid, integer) to anon, authenticated;
grant execute on function public.list_post_replies(uuid, integer) to anon, authenticated;
grant execute on function public.create_post_reply(uuid, text) to authenticated;
grant execute on function public.quote_community_post(uuid, text) to authenticated;

-- Backfill counts for existing posts after the schema/functions are installed.
do $$
declare
  r record;
begin
  for r in select id from public.community_posts loop
    perform public.sync_community_post_counts(r.id);
  end loop;
end $$;
