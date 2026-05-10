-- Connect main SolTools social features: profiles, posts, likes, reposts, comments, notifications.
-- Safe/idempotent migration for beta stabilization.

create extension if not exists pgcrypto;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  actor_id uuid,
  kind text not null default 'system',
  title text,
  message text,
  body text,
  target_type text,
  target_id uuid,
  priority text not null default 'normal',
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_created_idx on public.notifications(user_id, created_at desc);
create index if not exists notifications_user_unread_idx on public.notifications(user_id, read_at) where read_at is null;
create index if not exists notifications_target_idx on public.notifications(target_type, target_id);

create or replace function public.get_unread_notification_count()
returns integer
language sql
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.notifications
  where user_id = auth.uid()
    and read_at is null;
$$;

create or replace function public.mark_notification_read(p_notification_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.notifications
  set read_at = coalesce(read_at, now())
  where id = p_notification_id
    and user_id = auth.uid();
end;
$$;

create or replace function public.list_notifications_page(
  p_before timestamptz default null,
  p_limit integer default 30,
  p_unread_only boolean default false
)
returns table(
  id uuid,
  kind text,
  title text,
  message text,
  body text,
  created_at timestamptz,
  read_at timestamptz,
  priority text,
  actor_id uuid,
  actor_username text,
  target_type text,
  target_id uuid
)
language sql
security definer
set search_path = public
as $$
  select
    n.id,
    n.kind,
    n.title,
    n.message,
    n.body,
    n.created_at,
    n.read_at,
    n.priority,
    n.actor_id,
    p.username as actor_username,
    n.target_type,
    n.target_id
  from public.notifications n
  left join public.profiles p on p.user_id = n.actor_id or p.id = n.actor_id
  where n.user_id = auth.uid()
    and (p_before is null or n.created_at < p_before)
    and (not p_unread_only or n.read_at is null)
  order by n.created_at desc
  limit greatest(1, least(coalesce(p_limit, 30), 100));
$$;

create index if not exists community_posts_user_created_idx on public.community_posts(user_id, created_at desc);
create index if not exists community_posts_parent_idx on public.community_posts(parent_post_id, created_at desc);
create index if not exists community_posts_community_created_idx on public.community_posts(community_id, created_at desc);

alter table public.communities add column if not exists holder_only boolean not null default false;
alter table public.communities add column if not exists gate_token_mint text;
alter table public.communities add column if not exists gate_minimum_balance numeric;

create or replace function public.create_community(
  p_name text,
  p_slug text,
  p_description text default null,
  p_category text default 'alpha',
  p_icon_emoji text default '🚀',
  p_accent_a text default '#55F5B2',
  p_accent_b text default '#6EE7FF',
  p_rules jsonb default '[]'::jsonb,
  p_tags jsonb default '[]'::jsonb,
  p_is_private boolean default false,
  p_holder_only boolean default false,
  p_gate_token_mint text default null,
  p_gate_minimum_balance numeric default null,
  p_avatar_url text default null,
  p_banner_url text default null
)
returns public.communities
language plpgsql
security definer
set search_path = public
as $
declare
  created public.communities;
begin
  insert into public.communities (
    name, slug, description, owner_id, category, icon_emoji, accent_a, accent_b,
    rules, tags, is_private, holder_only, gate_token_mint, gate_minimum_balance,
    avatar_url, banner_url
  ) values (
    p_name, p_slug, p_description, auth.uid(), p_category, p_icon_emoji, p_accent_a, p_accent_b,
    p_rules, p_tags, (p_is_private or p_holder_only), p_holder_only, p_gate_token_mint, p_gate_minimum_balance,
    p_avatar_url, p_banner_url
  )
  returning * into created;

  insert into public.community_members (community_id, user_id, role)
  values (created.id, auth.uid(), 'owner')
  on conflict do nothing;

  return created;
end;
$;

create table if not exists public.community_post_likes (
  user_id uuid not null,
  post_id uuid not null references public.community_posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

create table if not exists public.community_post_reposts (
  user_id uuid not null,
  post_id uuid not null references public.community_posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  quote_text text,
  primary key (user_id, post_id)
);

create index if not exists community_post_likes_user_created_idx on public.community_post_likes(user_id, created_at desc);
create index if not exists community_post_likes_post_idx on public.community_post_likes(post_id);
create index if not exists community_post_reposts_user_created_idx on public.community_post_reposts(user_id, created_at desc);
create index if not exists community_post_reposts_post_idx on public.community_post_reposts(post_id);

create or replace function public.list_profile_liked_posts(p_user_id uuid, p_limit integer default 80)
returns table(
  activity_type text,
  activity_at timestamptz,
  actor_user_id uuid,
  author_user_id uuid,
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
  parent_post_id uuid,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select 'like', l.created_at, l.user_id, cp.user_id, cp.id, cp.user_id, cp.content, cp.image_url, cp.ticker,
         cp.token_address, cp.change_pct, cp.likes_count, cp.reposts_count, cp.comments_count,
         cp.parent_post_id, cp.created_at
  from public.community_post_likes l
  join public.community_posts cp on cp.id = l.post_id
  where l.user_id = p_user_id
  order by l.created_at desc
  limit greatest(1, least(coalesce(p_limit, 80), 100));
$$;

create or replace function public.list_profile_reposted_posts(p_user_id uuid, p_limit integer default 80)
returns table(
  activity_type text,
  activity_at timestamptz,
  actor_user_id uuid,
  author_user_id uuid,
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
  parent_post_id uuid,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select 'repost', r.created_at, r.user_id, cp.user_id, cp.id, cp.user_id, cp.content, cp.image_url, cp.ticker,
         cp.token_address, cp.change_pct, cp.likes_count, cp.reposts_count, cp.comments_count,
         cp.parent_post_id, cp.created_at
  from public.community_post_reposts r
  join public.community_posts cp on cp.id = r.post_id
  where r.user_id = p_user_id
  order by r.created_at desc
  limit greatest(1, least(coalesce(p_limit, 80), 100));
$$;

create or replace function public.list_profile_post_activity(p_user_id uuid, p_limit integer default 80)
returns table(
  activity_type text,
  activity_at timestamptz,
  actor_user_id uuid,
  author_user_id uuid,
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
  parent_post_id uuid,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select 'post', cp.created_at, cp.user_id, cp.user_id, cp.id, cp.user_id, cp.content, cp.image_url, cp.ticker,
         cp.token_address, cp.change_pct, cp.likes_count, cp.reposts_count, cp.comments_count,
         cp.parent_post_id, cp.created_at
  from public.community_posts cp
  where cp.user_id = p_user_id
  order by cp.created_at desc
  limit greatest(1, least(coalesce(p_limit, 80), 100));
$$;

alter table public.notifications enable row level security;
alter table public.community_post_likes enable row level security;
alter table public.community_post_reposts enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='notifications' and policyname='notifications_select_own') then
    create policy notifications_select_own on public.notifications for select using (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='notifications' and policyname='notifications_update_own') then
    create policy notifications_update_own on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='community_post_likes' and policyname='likes_select_all') then
    create policy likes_select_all on public.community_post_likes for select using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='community_post_likes' and policyname='likes_write_own') then
    create policy likes_write_own on public.community_post_likes for all using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='community_post_reposts' and policyname='reposts_select_all') then
    create policy reposts_select_all on public.community_post_reposts for select using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='community_post_reposts' and policyname='reposts_write_own') then
    create policy reposts_write_own on public.community_post_reposts for all using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
end $$;
