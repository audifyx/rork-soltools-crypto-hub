-- Stabilize public social feed, follow lists, and presence RPCs.

create table if not exists public.followers (
  follower_id uuid not null,
  followee_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id)
);

create index if not exists followers_follower_idx on public.followers(follower_id, created_at desc);
create index if not exists followers_followee_idx on public.followers(followee_id, created_at desc);

alter table public.profiles add column if not exists is_online boolean not null default false;
alter table public.profiles add column if not exists last_seen_at timestamptz;

create index if not exists profiles_online_seen_idx on public.profiles(is_online desc, last_seen_at desc);

alter table public.followers enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='followers' and policyname='followers_select_all') then
    create policy followers_select_all on public.followers for select using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='followers' and policyname='followers_insert_own') then
    create policy followers_insert_own on public.followers for insert with check (follower_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='followers' and policyname='followers_delete_own') then
    create policy followers_delete_own on public.followers for delete using (follower_id = auth.uid());
  end if;
end $$;

create or replace function public.toggle_follow(target_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  did_follow boolean;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if target_user_id is null or target_user_id = auth.uid() then
    return false;
  end if;

  delete from public.followers
  where follower_id = auth.uid()
    and followee_id = target_user_id;

  if found then
    did_follow := false;
  else
    insert into public.followers(follower_id, followee_id)
    values (auth.uid(), target_user_id)
    on conflict do nothing;
    did_follow := true;
  end if;

  update public.profiles p
  set followers_count = coalesce((select count(*) from public.followers f where f.followee_id = p.user_id), 0)
  where p.user_id = target_user_id;

  update public.profiles p
  set following_count = coalesce((select count(*) from public.followers f where f.follower_id = p.user_id), 0)
  where p.user_id = auth.uid();

  return did_follow;
end;
$$;

create or replace function public.list_followers(target_user_id uuid)
returns table(
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  verified boolean,
  custom_badges jsonb,
  followers_count integer
)
language sql
security definer
set search_path = public
as $$
  select p.user_id, p.username, p.display_name, p.avatar_url, p.verified, p.custom_badges, p.followers_count
  from public.followers f
  join public.profiles p on p.user_id = f.follower_id
  where f.followee_id = target_user_id
  order by f.created_at desc;
$$;

create or replace function public.list_following(target_user_id uuid)
returns table(
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  verified boolean,
  custom_badges jsonb,
  followers_count integer
)
language sql
security definer
set search_path = public
as $$
  select p.user_id, p.username, p.display_name, p.avatar_url, p.verified, p.custom_badges, p.followers_count
  from public.followers f
  join public.profiles p on p.user_id = f.followee_id
  where f.follower_id = target_user_id
  order by f.created_at desc;
$$;

create or replace function public.get_following_feed(max_rows integer default 50)
returns table(
  id uuid,
  user_id uuid,
  content text,
  image_url text,
  ticker text,
  token_address text,
  change_pct numeric,
  likes_count integer,
  reposts_count integer,
  comments_count integer,
  created_at timestamptz,
  author_username text,
  author_display_name text,
  author_avatar_url text,
  author_avatar_color text,
  author_verified boolean
)
language sql
security definer
set search_path = public
as $$
  select cp.id, cp.user_id, cp.content, cp.image_url, cp.ticker, cp.token_address, cp.change_pct,
         cp.likes_count, cp.reposts_count, cp.comments_count, cp.created_at,
         p.username, p.display_name, p.avatar_url, p.avatar_color, p.verified
  from public.community_posts cp
  join public.followers f on f.followee_id = cp.user_id and f.follower_id = auth.uid()
  left join public.profiles p on p.user_id = cp.user_id
  where cp.community_id is null
    and cp.parent_post_id is null
  order by cp.created_at desc
  limit greatest(1, least(coalesce(max_rows, 50), 100));
$$;

create or replace function public.heartbeat(set_status text default 'online')
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    return;
  end if;
  update public.profiles
  set is_online = coalesce(set_status, 'online') = 'online',
      last_seen_at = now()
  where user_id = auth.uid();
end;
$$;

create or replace function public.set_offline()
returns void
language sql
security definer
set search_path = public
as $$
  update public.profiles
  set is_online = false,
      last_seen_at = now()
  where user_id = auth.uid();
$$;
