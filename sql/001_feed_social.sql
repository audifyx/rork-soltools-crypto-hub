-- Feed & social: power Home tabs (Following, Trending, New Pairs, Whales)
-- Apply in Supabase SQL editor, confirm done, then agent removes this file.

-- 1) Per-user post likes (replaces naive likes_count writes)
create table if not exists public.post_likes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (post_id, user_id)
);
create index if not exists post_likes_post_idx on public.post_likes(post_id);
create index if not exists post_likes_user_idx on public.post_likes(user_id);

alter table public.post_likes enable row level security;
drop policy if exists "post_likes_select_all" on public.post_likes;
create policy "post_likes_select_all" on public.post_likes for select using (true);
drop policy if exists "post_likes_insert_self" on public.post_likes;
create policy "post_likes_insert_self" on public.post_likes for insert with check (auth.uid() = user_id);
drop policy if exists "post_likes_delete_self" on public.post_likes;
create policy "post_likes_delete_self" on public.post_likes for delete using (auth.uid() = user_id);

-- Keep community_posts.likes_count in sync via triggers
create or replace function public._post_likes_after_insert()
returns trigger language plpgsql as $$
begin
  update public.community_posts
     set likes_count = coalesce(likes_count, 0) + 1
   where id = new.post_id;
  return new;
end $$;

create or replace function public._post_likes_after_delete()
returns trigger language plpgsql as $$
begin
  update public.community_posts
     set likes_count = greatest(coalesce(likes_count, 0) - 1, 0)
   where id = old.post_id;
  return old;
end $$;

drop trigger if exists post_likes_ins on public.post_likes;
create trigger post_likes_ins after insert on public.post_likes
for each row execute function public._post_likes_after_insert();

drop trigger if exists post_likes_del on public.post_likes;
create trigger post_likes_del after delete on public.post_likes
for each row execute function public._post_likes_after_delete();

-- 2) Comments on posts
create table if not exists public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null check (char_length(content) between 1 and 500),
  created_at timestamptz not null default now()
);
create index if not exists post_comments_post_idx on public.post_comments(post_id, created_at desc);

alter table public.post_comments enable row level security;
drop policy if exists "post_comments_select_all" on public.post_comments;
create policy "post_comments_select_all" on public.post_comments for select using (true);
drop policy if exists "post_comments_insert_self" on public.post_comments;
create policy "post_comments_insert_self" on public.post_comments for insert with check (auth.uid() = user_id);
drop policy if exists "post_comments_delete_self" on public.post_comments;
create policy "post_comments_delete_self" on public.post_comments for delete using (auth.uid() = user_id);

create or replace function public._post_comments_after_insert()
returns trigger language plpgsql as $$
begin
  update public.community_posts
     set comments_count = coalesce(comments_count, 0) + 1
   where id = new.post_id;
  return new;
end $$;

create or replace function public._post_comments_after_delete()
returns trigger language plpgsql as $$
begin
  update public.community_posts
     set comments_count = greatest(coalesce(comments_count, 0) - 1, 0)
   where id = old.post_id;
  return old;
end $$;

drop trigger if exists post_comments_ins on public.post_comments;
create trigger post_comments_ins after insert on public.post_comments
for each row execute function public._post_comments_after_insert();

drop trigger if exists post_comments_del on public.post_comments;
create trigger post_comments_del after delete on public.post_comments
for each row execute function public._post_comments_after_delete();

-- 3) Performance indexes on community_posts (Following / For You feeds)
create index if not exists community_posts_user_created_idx
  on public.community_posts(user_id, created_at desc);
create index if not exists community_posts_created_idx
  on public.community_posts(created_at desc);

-- 4) Whale events feed (powers Home > Whales tab)
create table if not exists public.whale_events (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null,
  token_address text,
  symbol text,
  side text not null check (side in ('buy','sell','transfer')),
  amount_usd numeric,
  amount_token numeric,
  tx_signature text,
  created_at timestamptz not null default now()
);
create index if not exists whale_events_created_idx on public.whale_events(created_at desc);
create index if not exists whale_events_token_idx on public.whale_events(token_address);

alter table public.whale_events enable row level security;
drop policy if exists "whale_events_select_all" on public.whale_events;
create policy "whale_events_select_all" on public.whale_events for select using (true);

-- 5) RPC: posts feed from accounts the caller follows
create or replace function public.get_following_feed(max_rows int default 50)
returns table (
  id uuid,
  user_id uuid,
  content text,
  image_url text,
  ticker text,
  change_pct numeric,
  likes_count int,
  reposts_count int,
  comments_count int,
  created_at timestamptz,
  author_username text,
  author_display_name text,
  author_avatar_url text,
  author_verified boolean
)
language sql stable security definer set search_path = public as $$
  select p.id, p.user_id, p.content, p.image_url, p.ticker, p.change_pct,
         p.likes_count, p.reposts_count, p.comments_count, p.created_at,
         pr.username, pr.display_name, pr.avatar_url, coalesce(pr.verified, false)
    from public.community_posts p
    join public.followers f on f.following_id = p.user_id and f.follower_id = auth.uid()
    left join public.profiles pr on pr.id = p.user_id
   order by p.created_at desc
   limit greatest(1, least(max_rows, 200));
$$;

grant execute on function public.get_following_feed(int) to authenticated;

-- 6) RPC: toggle a like on a post (returns new state)
create or replace function public.toggle_post_like(target_post_id uuid)
returns table (liked boolean, likes_count int)
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  existing uuid;
  new_count int;
begin
  if uid is null then
    raise exception 'auth required';
  end if;
  select id into existing from public.post_likes
   where post_id = target_post_id and user_id = uid;
  if existing is null then
    insert into public.post_likes(post_id, user_id) values (target_post_id, uid);
    select likes_count into new_count from public.community_posts where id = target_post_id;
    return query select true, coalesce(new_count, 0);
  else
    delete from public.post_likes where id = existing;
    select likes_count into new_count from public.community_posts where id = target_post_id;
    return query select false, coalesce(new_count, 0);
  end if;
end $$;

grant execute on function public.toggle_post_like(uuid) to authenticated;
