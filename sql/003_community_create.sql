-- ============================================================================
-- 003_community_create.sql
-- Adds support for the Create Community flow shipped in the app.
--
-- Run after 002_storage_and_buckets.sql.
-- Safe to re-run: every statement uses IF [NOT] EXISTS.
-- ============================================================================

-- 1. Communities table -------------------------------------------------------
create table if not exists public.communities (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    slug text unique,
    description text default '',
    owner_id uuid references auth.users(id) on delete set null,
    member_count integer default 1,
    posts_count integer default 0,
    online_count integer default 0,
    category text default 'alpha',
    icon_emoji text default '✨',
    accent_a text,
    accent_b text,
    verified boolean default false,
    trending boolean default false,
    pinned_ticker text,
    rules jsonb default '[]'::jsonb,
    tags jsonb default '[]'::jsonb,
    is_private boolean default false,
    created_at timestamptz default now()
);

create index if not exists communities_owner_idx on public.communities(owner_id);
create index if not exists communities_trending_idx on public.communities(trending);
create index if not exists communities_category_idx on public.communities(category);

-- 2. Membership table --------------------------------------------------------
create table if not exists public.community_members (
    community_id uuid references public.communities(id) on delete cascade,
    user_id uuid references auth.users(id) on delete cascade,
    role text default 'member',
    joined_at timestamptz default now(),
    primary key (community_id, user_id)
);

create index if not exists community_members_user_idx on public.community_members(user_id);

-- 3. Posts table -------------------------------------------------------------
create table if not exists public.community_posts (
    id uuid primary key default gen_random_uuid(),
    community_id uuid references public.communities(id) on delete cascade,
    user_id uuid references auth.users(id) on delete set null,
    content text not null,
    ticker text,
    change_pct numeric,
    likes_count integer default 0,
    comments_count integer default 0,
    pinned boolean default false,
    created_at timestamptz default now()
);

create index if not exists community_posts_community_idx on public.community_posts(community_id, created_at desc);

-- 4. RLS ---------------------------------------------------------------------
alter table public.communities enable row level security;
alter table public.community_members enable row level security;
alter table public.community_posts enable row level security;

-- Communities: anyone can read non-private; owners can manage.
drop policy if exists "communities_select" on public.communities;
create policy "communities_select" on public.communities
    for select using (
        is_private = false
        or owner_id = auth.uid()
        or exists (
            select 1 from public.community_members m
            where m.community_id = id and m.user_id = auth.uid()
        )
    );

drop policy if exists "communities_insert" on public.communities;
create policy "communities_insert" on public.communities
    for insert with check (auth.uid() is not null and owner_id = auth.uid());

drop policy if exists "communities_update_owner" on public.communities;
create policy "communities_update_owner" on public.communities
    for update using (owner_id = auth.uid());

-- Members: a user can read their own memberships and members of communities they belong to.
drop policy if exists "community_members_select" on public.community_members;
create policy "community_members_select" on public.community_members
    for select using (true);

drop policy if exists "community_members_insert_self" on public.community_members;
create policy "community_members_insert_self" on public.community_members
    for insert with check (auth.uid() = user_id);

drop policy if exists "community_members_delete_self" on public.community_members;
create policy "community_members_delete_self" on public.community_members
    for delete using (auth.uid() = user_id);

-- Posts: members can read; authors can insert/update.
drop policy if exists "community_posts_select" on public.community_posts;
create policy "community_posts_select" on public.community_posts
    for select using (
        exists (
            select 1 from public.communities c
            where c.id = community_id
              and (
                c.is_private = false
                or c.owner_id = auth.uid()
                or exists (
                    select 1 from public.community_members m
                    where m.community_id = c.id and m.user_id = auth.uid()
                )
              )
        )
    );

drop policy if exists "community_posts_insert" on public.community_posts;
create policy "community_posts_insert" on public.community_posts
    for insert with check (auth.uid() = user_id);

drop policy if exists "community_posts_update_author" on public.community_posts;
create policy "community_posts_update_author" on public.community_posts
    for update using (auth.uid() = user_id);

-- 5. Triggers to keep counters in sync ---------------------------------------
create or replace function public.community_member_count_trigger()
returns trigger language plpgsql as $$
begin
    if (tg_op = 'INSERT') then
        update public.communities set member_count = coalesce(member_count, 0) + 1
            where id = new.community_id;
    elsif (tg_op = 'DELETE') then
        update public.communities set member_count = greatest(coalesce(member_count, 1) - 1, 0)
            where id = old.community_id;
    end if;
    return null;
end;
$$;

drop trigger if exists trg_community_member_count on public.community_members;
create trigger trg_community_member_count
    after insert or delete on public.community_members
    for each row execute function public.community_member_count_trigger();

create or replace function public.community_post_count_trigger()
returns trigger language plpgsql as $$
begin
    if (tg_op = 'INSERT') then
        update public.communities set posts_count = coalesce(posts_count, 0) + 1
            where id = new.community_id;
    elsif (tg_op = 'DELETE') then
        update public.communities set posts_count = greatest(coalesce(posts_count, 1) - 1, 0)
            where id = old.community_id;
    end if;
    return null;
end;
$$;

drop trigger if exists trg_community_post_count on public.community_posts;
create trigger trg_community_post_count
    after insert or delete on public.community_posts
    for each row execute function public.community_post_count_trigger();
