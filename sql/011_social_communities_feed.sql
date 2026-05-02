-- 011_social_communities_feed.sql
-- Idempotent patch for communities, posts, likes, voice rooms, and whale feed.

create table if not exists public.communities (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now()
);
alter table public.communities
  add column if not exists owner_id uuid references auth.users(id) on delete set null,
  add column if not exists name text,
  add column if not exists slug citext,
  add column if not exists description text,
  add column if not exists avatar_url text,
  add column if not exists banner_url text,
  add column if not exists is_private boolean not null default false,
  add column if not exists member_count integer not null default 0,
  add column if not exists posts_count integer not null default 0,
  add column if not exists online_count integer not null default 0,
  add column if not exists category text not null default 'alpha',
  add column if not exists icon_emoji text not null default '✨',
  add column if not exists accent_a text,
  add column if not exists accent_b text,
  add column if not exists verified boolean not null default false,
  add column if not exists trending boolean not null default false,
  add column if not exists pinned_ticker text,
  add column if not exists rules jsonb not null default '[]'::jsonb,
  add column if not exists tags jsonb not null default '[]'::jsonb;
create index if not exists communities_created_idx on public.communities (created_at desc);
create index if not exists communities_slug_idx on public.communities (lower(slug::text));

create table if not exists public.community_members (
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (community_id, user_id)
);

create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.community_posts
  add column if not exists community_id uuid references public.communities(id) on delete set null,
  add column if not exists content text not null default '',
  add column if not exists image_url text,
  add column if not exists ticker text,
  add column if not exists change_pct numeric(10,4),
  add column if not exists likes_count integer not null default 0,
  add column if not exists reposts_count integer not null default 0,
  add column if not exists comments_count integer not null default 0,
  add column if not exists pinned boolean not null default false;
create index if not exists community_posts_created_idx on public.community_posts (created_at desc);
create index if not exists community_posts_community_idx on public.community_posts (community_id, created_at desc);

create table if not exists public.post_likes (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.community_post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.livekit_rooms (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Live Space',
  created_at timestamptz not null default now()
);
alter table public.livekit_rooms
  add column if not exists external_room_id text,
  add column if not exists host_id uuid references auth.users(id) on delete set null,
  add column if not exists community_id uuid references public.communities(id) on delete set null,
  add column if not exists is_active boolean not null default true,
  add column if not exists started_at timestamptz,
  add column if not exists ended_at timestamptz,
  add column if not exists topic text not null default 'GENERAL',
  add column if not exists description text not null default '',
  add column if not exists accent_a text,
  add column if not exists accent_b text,
  add column if not exists category text not null default 'alpha',
  add column if not exists recording boolean not null default false,
  add column if not exists scheduled_at timestamptz,
  add column if not exists raised_hands integer not null default 0,
  add column if not exists listeners_count integer not null default 0,
  add column if not exists speakers_count integer not null default 0;

create table if not exists public.livekit_participants (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.livekit_rooms(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  identity text not null,
  role text not null default 'listener',
  joined_at timestamptz not null default now(),
  left_at timestamptz
);

create table if not exists public.whale_events (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null,
  token_address text,
  symbol text,
  side text not null default 'transfer' check (side in ('buy','sell','transfer')),
  amount_usd numeric(20,4),
  amount_token numeric(30,8),
  tx_signature text,
  created_at timestamptz not null default now()
);
create index if not exists whale_events_recent_idx on public.whale_events (created_at desc);

do $$ begin
  alter table public.communities enable row level security;
  alter table public.community_members enable row level security;
  alter table public.community_posts enable row level security;
  alter table public.post_likes enable row level security;
  alter table public.community_post_comments enable row level security;
  alter table public.livekit_rooms enable row level security;
  alter table public.livekit_participants enable row level security;
  alter table public.whale_events enable row level security;

  drop policy if exists communities_read on public.communities;
  create policy communities_read on public.communities for select using (true);
  drop policy if exists communities_create_owner on public.communities;
  create policy communities_create_owner on public.communities for insert with check (auth.uid() = owner_id);
  drop policy if exists communities_update_owner on public.communities;
  create policy communities_update_owner on public.communities for update using (auth.uid() = owner_id or public.is_admin(auth.uid())) with check (auth.uid() = owner_id or public.is_admin(auth.uid()));

  drop policy if exists cm_read on public.community_members;
  create policy cm_read on public.community_members for select using (true);
  drop policy if exists cm_join_self on public.community_members;
  create policy cm_join_self on public.community_members for insert with check (auth.uid() = user_id);
  drop policy if exists cm_leave_self on public.community_members;
  create policy cm_leave_self on public.community_members for delete using (auth.uid() = user_id or public.is_admin(auth.uid()));

  drop policy if exists cp_read on public.community_posts;
  create policy cp_read on public.community_posts for select using (true);
  drop policy if exists cp_write_self on public.community_posts;
  create policy cp_write_self on public.community_posts for insert with check (auth.uid() = user_id);
  drop policy if exists cp_update_self on public.community_posts;
  create policy cp_update_self on public.community_posts for update using (auth.uid() = user_id or public.is_admin(auth.uid())) with check (auth.uid() = user_id or public.is_admin(auth.uid()));
  drop policy if exists cp_delete_self on public.community_posts;
  create policy cp_delete_self on public.community_posts for delete using (auth.uid() = user_id or public.is_admin(auth.uid()));

  drop policy if exists post_likes_read on public.post_likes;
  create policy post_likes_read on public.post_likes for select using (true);
  drop policy if exists post_likes_write_self on public.post_likes;
  create policy post_likes_write_self on public.post_likes for insert with check (auth.uid() = user_id);
  drop policy if exists post_likes_delete_self on public.post_likes;
  create policy post_likes_delete_self on public.post_likes for delete using (auth.uid() = user_id);

  drop policy if exists comments_read on public.community_post_comments;
  create policy comments_read on public.community_post_comments for select using (true);
  drop policy if exists comments_write_self on public.community_post_comments;
  create policy comments_write_self on public.community_post_comments for insert with check (auth.uid() = user_id);
  drop policy if exists comments_delete_self on public.community_post_comments;
  create policy comments_delete_self on public.community_post_comments for delete using (auth.uid() = user_id or public.is_admin(auth.uid()));

  drop policy if exists lk_room_read on public.livekit_rooms;
  create policy lk_room_read on public.livekit_rooms for select using (true);
  drop policy if exists lk_part_read on public.livekit_participants;
  create policy lk_part_read on public.livekit_participants for select using (true);
  drop policy if exists whale_events_read on public.whale_events;
  create policy whale_events_read on public.whale_events for select using (true);
end $$;

select '011_social_communities_feed applied' as status;
