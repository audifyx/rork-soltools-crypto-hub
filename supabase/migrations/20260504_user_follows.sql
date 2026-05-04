-- User-to-user follow graph: table, counters, RPCs.
-- Idempotent so it's safe to re-run.

-- 1. Counters on profiles -----------------------------------------------------
alter table public.profiles
  add column if not exists followers_count integer not null default 0,
  add column if not exists following_count integer not null default 0;

-- 2. Follows table ------------------------------------------------------------
create table if not exists public.follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  following_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint follows_no_self check (follower_id <> following_id)
);
create index if not exists follows_following_idx on public.follows(following_id, created_at desc);
create index if not exists follows_follower_idx on public.follows(follower_id, created_at desc);

-- 3. Counter trigger ----------------------------------------------------------
create or replace function public.follows_sync_counts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    update public.profiles set followers_count = followers_count + 1 where user_id = new.following_id;
    update public.profiles set following_count = following_count + 1 where user_id = new.follower_id;
    return new;
  elsif (tg_op = 'DELETE') then
    update public.profiles set followers_count = greatest(followers_count - 1, 0) where user_id = old.following_id;
    update public.profiles set following_count = greatest(following_count - 1, 0) where user_id = old.follower_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists follows_sync_counts_aiu on public.follows;
create trigger follows_sync_counts_aiu
after insert or delete on public.follows
for each row execute function public.follows_sync_counts();

-- Backfill counters once
update public.profiles p set
  followers_count = coalesce((select count(*) from public.follows f where f.following_id = p.user_id), 0),
  following_count = coalesce((select count(*) from public.follows f where f.follower_id = p.user_id), 0);

-- 4. toggle_follow RPC --------------------------------------------------------
create or replace function public.toggle_follow(target_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  now_following boolean;
begin
  if me is null then
    raise exception 'not authenticated';
  end if;
  if target_user_id is null or target_user_id = me then
    raise exception 'invalid target';
  end if;

  if exists (select 1 from public.follows where follower_id = me and following_id = target_user_id) then
    delete from public.follows where follower_id = me and following_id = target_user_id;
    now_following := false;
  else
    insert into public.follows (follower_id, following_id)
      values (me, target_user_id)
      on conflict do nothing;
    now_following := true;
  end if;

  return now_following;
end;
$$;

grant execute on function public.toggle_follow(uuid) to authenticated;

-- 5. list_followers / list_following RPCs ------------------------------------
create or replace function public.list_followers(target_user_id uuid)
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  verified boolean,
  custom_badges jsonb,
  followers_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  select p.user_id,
         p.username,
         p.display_name,
         p.avatar_url,
         coalesce(p.verified, false) as verified,
         coalesce(p.custom_badges, '[]'::jsonb) as custom_badges,
         coalesce(p.followers_count, 0) as followers_count
  from public.follows f
  join public.profiles p on p.user_id = f.follower_id
  where f.following_id = target_user_id
  order by f.created_at desc
  limit 500;
$$;

create or replace function public.list_following(target_user_id uuid)
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  verified boolean,
  custom_badges jsonb,
  followers_count integer
)
language sql
stable
security definer
set search_path = public
as $$
  select p.user_id,
         p.username,
         p.display_name,
         p.avatar_url,
         coalesce(p.verified, false) as verified,
         coalesce(p.custom_badges, '[]'::jsonb) as custom_badges,
         coalesce(p.followers_count, 0) as followers_count
  from public.follows f
  join public.profiles p on p.user_id = f.following_id
  where f.follower_id = target_user_id
  order by f.created_at desc
  limit 500;
$$;

grant execute on function public.list_followers(uuid) to anon, authenticated;
grant execute on function public.list_following(uuid) to anon, authenticated;

-- 6. RLS ----------------------------------------------------------------------
alter table public.follows enable row level security;

drop policy if exists "Follows are readable" on public.follows;
create policy "Follows are readable" on public.follows
  for select using (true);

drop policy if exists "Users insert own follow" on public.follows;
create policy "Users insert own follow" on public.follows
  for insert with check (auth.uid() = follower_id);

drop policy if exists "Users delete own follow" on public.follows;
create policy "Users delete own follow" on public.follows
  for delete using (auth.uid() = follower_id);
