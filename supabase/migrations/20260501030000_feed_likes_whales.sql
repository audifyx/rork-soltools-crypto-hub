-- =====================================================================
-- Feed essentials: post likes, whale events, and the Following feed RPC.
-- These power the Home tab's For You / Following / Whales filters and
-- post like state across the app.
-- =====================================================================

-- 1. post_likes ---------------------------------------------------------
create table if not exists public.post_likes (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index if not exists post_likes_user_idx on public.post_likes (user_id, created_at desc);
create index if not exists post_likes_post_idx on public.post_likes (post_id);

alter table public.post_likes enable row level security;

do $$
begin
  begin
    execute 'drop policy if exists "post_likes_read" on public.post_likes';
  exception when others then null;
  end;
  execute $p$create policy "post_likes_read" on public.post_likes
    for select using (true)$p$;

  begin
    execute 'drop policy if exists "post_likes_write_self" on public.post_likes';
  exception when others then null;
  end;
  execute $p$create policy "post_likes_write_self" on public.post_likes
    for insert with check (auth.uid() = user_id)$p$;

  begin
    execute 'drop policy if exists "post_likes_delete_self" on public.post_likes';
  exception when others then null;
  end;
  execute $p$create policy "post_likes_delete_self" on public.post_likes
    for delete using (auth.uid() = user_id)$p$;
end $$;

-- Maintain likes_count on community_posts ------------------------------
create or replace function public.handle_post_like_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.community_posts
       set likes_count = likes_count + 1
     where id = new.post_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.community_posts
       set likes_count = greatest(0, likes_count - 1)
     where id = old.post_id;
    return old;
  end if;
  return null;
end $$;

drop trigger if exists post_likes_count_trg on public.post_likes;
create trigger post_likes_count_trg
after insert or delete on public.post_likes
for each row execute function public.handle_post_like_change();

-- 2. whale_events -------------------------------------------------------
create table if not exists public.whale_events (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null,
  token_address text,
  symbol text,
  side text not null check (side in ('buy','sell','transfer')),
  amount_usd numeric(20,4),
  amount_token numeric(30,8),
  tx_signature text,
  created_at timestamptz not null default now()
);

create index if not exists whale_events_recent_idx on public.whale_events (created_at desc);
create index if not exists whale_events_token_idx on public.whale_events (token_address);

alter table public.whale_events enable row level security;

do $$
begin
  begin
    execute 'drop policy if exists "whale_events_read" on public.whale_events';
  exception when others then null;
  end;
  execute $p$create policy "whale_events_read" on public.whale_events
    for select using (true)$p$;
end $$;

-- 3. Following feed RPC -------------------------------------------------
create or replace function public.get_following_feed(max_rows int default 50)
returns table (
  id uuid,
  user_id uuid,
  content text,
  image_url text,
  ticker text,
  change_pct numeric,
  likes_count integer,
  reposts_count integer,
  comments_count integer,
  created_at timestamptz
) language sql stable security definer set search_path = public as $$
  select cp.id,
         cp.user_id,
         cp.content,
         cp.image_url,
         cp.ticker,
         cp.change_pct,
         cp.likes_count,
         cp.reposts_count,
         cp.comments_count,
         cp.created_at
    from public.community_posts cp
    join public.followers f on f.followee_id = cp.user_id
   where f.follower_id = auth.uid()
   order by cp.created_at desc
   limit greatest(1, least(max_rows, 200))
$$;

grant execute on function public.get_following_feed(int) to authenticated;
