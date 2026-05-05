-- Live crypto news (X-style) + engagement.
-- Idempotent. Stores upserted live items keyed by external string id
-- (e.g. "cc-12345") so likes/reposts/comments/saves persist across refreshes.

create extension if not exists "pgcrypto";

-- ---------- LIVE NEWS POSTS ----------
create table if not exists public.news_posts (
  id text primary key,                 -- external id e.g. cc-12345
  source text not null,
  source_url text,
  title text not null,
  body text,
  image_url text,
  category text not null default 'trending',
  sentiment text,
  coin_mentions text[] not null default '{}',
  published_at timestamptz not null default now(),
  ingested_at timestamptz not null default now(),
  raw jsonb
);

create index if not exists news_posts_published_idx on public.news_posts (published_at desc);
create index if not exists news_posts_category_idx on public.news_posts (category, published_at desc);
create index if not exists news_posts_mentions_gin on public.news_posts using gin (coin_mentions);

alter table public.news_posts enable row level security;
drop policy if exists news_posts_read on public.news_posts;
create policy news_posts_read on public.news_posts for select using (true);

-- ---------- ENGAGEMENT ----------
create table if not exists public.news_likes (
  user_id uuid not null references auth.users(id) on delete cascade,
  post_id text not null references public.news_posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
alter table public.news_likes enable row level security;
drop policy if exists news_likes_read on public.news_likes;
create policy news_likes_read on public.news_likes for select using (true);
drop policy if exists news_likes_owner on public.news_likes;
create policy news_likes_owner on public.news_likes for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.news_reposts (
  user_id uuid not null references auth.users(id) on delete cascade,
  post_id text not null references public.news_posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
alter table public.news_reposts enable row level security;
drop policy if exists news_reposts_read on public.news_reposts;
create policy news_reposts_read on public.news_reposts for select using (true);
drop policy if exists news_reposts_owner on public.news_reposts;
create policy news_reposts_owner on public.news_reposts for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.news_comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  post_id text not null references public.news_posts(id) on delete cascade,
  body text not null check (length(trim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists news_comments_post_idx on public.news_comments (post_id, created_at desc);
alter table public.news_comments enable row level security;
drop policy if exists news_comments_read on public.news_comments;
create policy news_comments_read on public.news_comments for select using (true);
drop policy if exists news_comments_owner_write on public.news_comments;
create policy news_comments_owner_write on public.news_comments for insert
  with check (auth.uid() = user_id);
drop policy if exists news_comments_owner_delete on public.news_comments;
create policy news_comments_owner_delete on public.news_comments for delete
  using (auth.uid() = user_id);

create table if not exists public.saved_news_posts (
  user_id uuid not null references auth.users(id) on delete cascade,
  post_id text not null references public.news_posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
alter table public.saved_news_posts enable row level security;
drop policy if exists saved_news_posts_owner on public.saved_news_posts;
create policy saved_news_posts_owner on public.saved_news_posts for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- RPCs ----------

-- Upsert a single live news item. Anyone authenticated can ingest from
-- the client side as it discovers new items from the public feed.
create or replace function public.upsert_news_post(
  p_id text,
  p_source text,
  p_source_url text,
  p_title text,
  p_body text,
  p_image_url text,
  p_category text,
  p_sentiment text,
  p_coin_mentions text[],
  p_published_at timestamptz
)
returns public.news_posts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.news_posts;
begin
  insert into public.news_posts (
    id, source, source_url, title, body, image_url,
    category, sentiment, coin_mentions, published_at
  ) values (
    p_id,
    coalesce(nullif(trim(p_source), ''), 'Unknown'),
    p_source_url,
    coalesce(nullif(trim(p_title), ''), '(untitled)'),
    p_body,
    p_image_url,
    coalesce(nullif(trim(p_category), ''), 'trending'),
    p_sentiment,
    coalesce(p_coin_mentions, '{}'),
    coalesce(p_published_at, now())
  )
  on conflict (id) do update set
    source = excluded.source,
    source_url = excluded.source_url,
    title = excluded.title,
    body = excluded.body,
    image_url = excluded.image_url,
    category = excluded.category,
    sentiment = excluded.sentiment,
    coin_mentions = excluded.coin_mentions,
    published_at = excluded.published_at
  returning * into v_row;
  return v_row;
end;
$$;

-- Bulk ingest (jsonb array)
create or replace function public.upsert_news_posts(p_items jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int := 0;
  v jsonb;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    return 0;
  end if;
  for v in select * from jsonb_array_elements(p_items) loop
    perform public.upsert_news_post(
      (v->>'id'),
      (v->>'source'),
      (v->>'source_url'),
      (v->>'title'),
      (v->>'body'),
      (v->>'image_url'),
      (v->>'category'),
      (v->>'sentiment'),
      coalesce(
        (select array_agg(value::text) from jsonb_array_elements_text(coalesce(v->'coin_mentions', '[]'::jsonb))),
        '{}'
      ),
      nullif(v->>'published_at','')::timestamptz
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Feed with per-user engagement counts
create or replace function public.get_news_feed_with_engagement(
  p_category text default null,
  p_limit int default 30,
  p_before timestamptz default null
)
returns table (
  id text,
  source text,
  source_url text,
  title text,
  body text,
  image_url text,
  category text,
  sentiment text,
  coin_mentions text[],
  published_at timestamptz,
  like_count int,
  repost_count int,
  comment_count int,
  liked_by_me boolean,
  reposted_by_me boolean,
  saved_by_me boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    n.id, n.source, n.source_url, n.title, n.body, n.image_url,
    n.category, n.sentiment, n.coin_mentions, n.published_at,
    coalesce((select count(*)::int from public.news_likes l where l.post_id = n.id), 0) as like_count,
    coalesce((select count(*)::int from public.news_reposts r where r.post_id = n.id), 0) as repost_count,
    coalesce((select count(*)::int from public.news_comments c where c.post_id = n.id), 0) as comment_count,
    exists(select 1 from public.news_likes l where l.post_id = n.id and l.user_id = auth.uid()) as liked_by_me,
    exists(select 1 from public.news_reposts r where r.post_id = n.id and r.user_id = auth.uid()) as reposted_by_me,
    exists(select 1 from public.saved_news_posts s where s.post_id = n.id and s.user_id = auth.uid()) as saved_by_me
  from public.news_posts n
  where (p_category is null or p_category = 'all' or n.category = p_category)
    and (p_before is null or n.published_at < p_before)
  order by n.published_at desc
  limit greatest(1, least(coalesce(p_limit, 30), 100));
$$;

create or replace function public.toggle_like_news_post(p_post_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_exists boolean;
begin
  if v_uid is null then raise exception 'auth required'; end if;
  select exists(select 1 from public.news_likes where user_id = v_uid and post_id = p_post_id) into v_exists;
  if v_exists then
    delete from public.news_likes where user_id = v_uid and post_id = p_post_id;
    return false;
  end if;
  insert into public.news_likes (user_id, post_id) values (v_uid, p_post_id) on conflict do nothing;
  return true;
end;
$$;

create or replace function public.toggle_repost_news_post(p_post_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_exists boolean;
begin
  if v_uid is null then raise exception 'auth required'; end if;
  select exists(select 1 from public.news_reposts where user_id = v_uid and post_id = p_post_id) into v_exists;
  if v_exists then
    delete from public.news_reposts where user_id = v_uid and post_id = p_post_id;
    return false;
  end if;
  insert into public.news_reposts (user_id, post_id) values (v_uid, p_post_id) on conflict do nothing;
  return true;
end;
$$;

create or replace function public.toggle_save_news_post(p_post_id text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_exists boolean;
begin
  if v_uid is null then raise exception 'auth required'; end if;
  select exists(select 1 from public.saved_news_posts where user_id = v_uid and post_id = p_post_id) into v_exists;
  if v_exists then
    delete from public.saved_news_posts where user_id = v_uid and post_id = p_post_id;
    return false;
  end if;
  insert into public.saved_news_posts (user_id, post_id) values (v_uid, p_post_id) on conflict do nothing;
  return true;
end;
$$;

create or replace function public.add_news_comment(p_post_id text, p_body text)
returns public.news_comments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.news_comments;
begin
  if v_uid is null then raise exception 'auth required'; end if;
  if p_body is null or length(trim(p_body)) = 0 then
    raise exception 'comment cannot be empty';
  end if;
  insert into public.news_comments (user_id, post_id, body)
  values (v_uid, p_post_id, trim(p_body))
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.get_news_comments(p_post_id text, p_limit int default 50)
returns table (
  id uuid,
  user_id uuid,
  username text,
  avatar_url text,
  body text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.user_id,
    coalesce(p.username, p.display_name, '') as username,
    p.avatar_url,
    c.body,
    c.created_at
  from public.news_comments c
  left join public.profiles p on p.id = c.user_id
  where c.post_id = p_post_id
  order by c.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

create or replace function public.get_saved_news_posts(p_limit int default 50)
returns setof public.news_posts
language sql
stable
security definer
set search_path = public
as $$
  select n.*
  from public.saved_news_posts s
  join public.news_posts n on n.id = s.post_id
  where s.user_id = auth.uid()
  order by s.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

-- ---------- GRANTS ----------
grant execute on function public.upsert_news_post(text, text, text, text, text, text, text, text, text[], timestamptz) to authenticated;
grant execute on function public.upsert_news_posts(jsonb) to authenticated;
grant execute on function public.get_news_feed_with_engagement(text, int, timestamptz) to anon, authenticated;
grant execute on function public.toggle_like_news_post(text) to authenticated;
grant execute on function public.toggle_repost_news_post(text) to authenticated;
grant execute on function public.toggle_save_news_post(text) to authenticated;
grant execute on function public.add_news_comment(text, text) to authenticated;
grant execute on function public.get_news_comments(text, int) to anon, authenticated;
grant execute on function public.get_saved_news_posts(int) to authenticated;
