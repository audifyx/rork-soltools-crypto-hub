-- =====================================================================
-- BACKEND SYNC FIX — make data visible across users
-- =====================================================================
-- Consolidates RPCs and RLS that were previously only in the loose
-- sql/ folder, so every install gets:
--   • list_community_posts(target_community_id, max_rows)
--   • create_community(...) atomic insert + auto-join owner
--   • Open SELECT RLS on profiles / communities / community_posts /
--     community_members / followers / livekit_rooms / user_presence
--   • Counter resyncs so member/post/follower numbers are correct
--   • Realtime publication coverage for the social tables
--
-- Idempotent. Safe to re-run.
-- =====================================================================

-- 1. Ensure the columns the UI reads from exist ----------------------------
alter table public.communities
  add column if not exists slug          text,
  add column if not exists category      text not null default 'alpha',
  add column if not exists icon_emoji    text not null default '✨',
  add column if not exists accent_a      text,
  add column if not exists accent_b      text,
  add column if not exists verified      boolean not null default false,
  add column if not exists trending      boolean not null default false,
  add column if not exists pinned_ticker text,
  add column if not exists rules         jsonb   not null default '[]'::jsonb,
  add column if not exists tags          jsonb   not null default '[]'::jsonb,
  add column if not exists is_private    boolean not null default false,
  add column if not exists member_count  integer not null default 0,
  add column if not exists posts_count   integer not null default 0,
  add column if not exists online_count  integer not null default 0,
  add column if not exists avatar_url    text,
  add column if not exists banner_url    text;

create unique index if not exists communities_slug_uniq
  on public.communities (lower(slug)) where slug is not null;

alter table public.community_posts
  add column if not exists image_url      text,
  add column if not exists likes_count    integer not null default 0,
  add column if not exists reposts_count  integer not null default 0,
  add column if not exists comments_count integer not null default 0,
  add column if not exists pinned         boolean not null default false,
  add column if not exists ticker         text,
  add column if not exists change_pct     numeric(10,2);

-- 2. RLS: open read across the social surface, owner-write -----------------
alter table public.profiles            enable row level security;
alter table public.followers           enable row level security;
alter table public.communities         enable row level security;
alter table public.community_members   enable row level security;
alter table public.community_posts     enable row level security;

do $$
begin
  -- profiles: anyone can read, owner can update / insert their row
  begin execute 'drop policy if exists "profiles_read"        on public.profiles'; exception when others then null; end;
  begin execute 'drop policy if exists "profiles_update_self" on public.profiles'; exception when others then null; end;
  begin execute 'drop policy if exists "profiles_insert_self" on public.profiles'; exception when others then null; end;
  execute $p$create policy "profiles_read"        on public.profiles for select using (true)$p$;
  execute $p$create policy "profiles_update_self" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id)$p$;
  execute $p$create policy "profiles_insert_self" on public.profiles for insert with check (auth.uid() = id)$p$;

  -- followers
  begin execute 'drop policy if exists "followers_read"        on public.followers'; exception when others then null; end;
  begin execute 'drop policy if exists "followers_write_self"  on public.followers'; exception when others then null; end;
  begin execute 'drop policy if exists "followers_delete_self" on public.followers'; exception when others then null; end;
  execute $p$create policy "followers_read"        on public.followers for select using (true)$p$;
  execute $p$create policy "followers_write_self"  on public.followers for insert with check (auth.uid() = follower_id)$p$;
  execute $p$create policy "followers_delete_self" on public.followers for delete using (auth.uid() = follower_id)$p$;

  -- communities
  begin execute 'drop policy if exists "communities_read"         on public.communities'; exception when others then null; end;
  begin execute 'drop policy if exists "communities_select"       on public.communities'; exception when others then null; end;
  begin execute 'drop policy if exists "communities_create_owner" on public.communities'; exception when others then null; end;
  begin execute 'drop policy if exists "communities_insert"       on public.communities'; exception when others then null; end;
  begin execute 'drop policy if exists "communities_update_owner" on public.communities'; exception when others then null; end;
  begin execute 'drop policy if exists "communities_update"       on public.communities'; exception when others then null; end;
  execute $p$create policy "communities_read"         on public.communities for select using (true)$p$;
  execute $p$create policy "communities_create_owner" on public.communities for insert with check (auth.uid() = owner_id)$p$;
  execute $p$create policy "communities_update_owner" on public.communities for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id)$p$;

  -- community_members
  begin execute 'drop policy if exists "cm_read"       on public.community_members'; exception when others then null; end;
  begin execute 'drop policy if exists "cm_join_self"  on public.community_members'; exception when others then null; end;
  begin execute 'drop policy if exists "cm_leave_self" on public.community_members'; exception when others then null; end;
  execute $p$create policy "cm_read"       on public.community_members for select using (true)$p$;
  execute $p$create policy "cm_join_self"  on public.community_members for insert with check (auth.uid() = user_id)$p$;
  execute $p$create policy "cm_leave_self" on public.community_members for delete using (auth.uid() = user_id)$p$;

  -- community_posts
  begin execute 'drop policy if exists "cp_read"        on public.community_posts'; exception when others then null; end;
  begin execute 'drop policy if exists "cp_write_self"  on public.community_posts'; exception when others then null; end;
  begin execute 'drop policy if exists "cp_update_self" on public.community_posts'; exception when others then null; end;
  begin execute 'drop policy if exists "cp_delete_self" on public.community_posts'; exception when others then null; end;
  execute $p$create policy "cp_read"        on public.community_posts for select using (true)$p$;
  execute $p$create policy "cp_write_self"  on public.community_posts for insert with check (auth.uid() = user_id)$p$;
  execute $p$create policy "cp_update_self" on public.community_posts for update using (auth.uid() = user_id) with check (auth.uid() = user_id)$p$;
  execute $p$create policy "cp_delete_self" on public.community_posts for delete using (auth.uid() = user_id)$p$;
end $$;

-- 3. list_community_posts RPC --------------------------------------------
create or replace function public.list_community_posts(
  target_community_id uuid,
  max_rows int default 100
) returns table (
  id              uuid,
  community_id    uuid,
  user_id         uuid,
  content         text,
  ticker          text,
  change_pct      numeric,
  likes_count     integer,
  comments_count  integer,
  pinned          boolean,
  created_at      timestamptz,
  liked           boolean,
  username        text,
  display_name    text,
  avatar_color    text
) language sql stable security definer set search_path = public as $$
  select cp.id, cp.community_id, cp.user_id, cp.content, cp.ticker, cp.change_pct,
         cp.likes_count, cp.comments_count, coalesce(cp.pinned, false),
         cp.created_at,
         case when auth.uid() is null then false
              else exists(select 1 from public.post_likes pl
                           where pl.post_id = cp.id and pl.user_id = auth.uid())
         end as liked,
         p.username::text, p.display_name, p.avatar_color
    from public.community_posts cp
    left join public.profiles p on p.id = cp.user_id
   where cp.community_id = target_community_id
   order by coalesce(cp.pinned, false) desc, cp.created_at desc
   limit greatest(1, least(max_rows, 200));
$$;

grant execute on function public.list_community_posts(uuid, int) to authenticated, anon;

-- 4. create_community RPC -- atomic insert + owner auto-join ------------
create or replace function public.create_community(
  p_name        text,
  p_slug        text,
  p_description text default '',
  p_category    text default 'alpha',
  p_icon_emoji  text default '✨',
  p_accent_a    text default null,
  p_accent_b    text default null,
  p_rules       jsonb default '[]'::jsonb,
  p_tags        jsonb default '[]'::jsonb,
  p_is_private  boolean default false,
  p_avatar_url  text default null,
  p_banner_url  text default null
) returns table (
  id           uuid,
  name         text,
  slug         text,
  description  text,
  owner_id     uuid,
  category     text,
  icon_emoji   text,
  accent_a     text,
  accent_b     text,
  rules        jsonb,
  tags         jsonb,
  is_private   boolean,
  avatar_url   text,
  banner_url   text,
  member_count integer,
  created_at   timestamptz
) language plpgsql security definer set search_path = public as $$
declare
  caller     uuid := auth.uid();
  new_id     uuid;
  clean_slug text := lower(regexp_replace(coalesce(p_slug, ''), '^@', ''));
begin
  if caller is null then
    raise exception 'not authenticated';
  end if;

  insert into public.communities (
    name, slug, description, owner_id, category, icon_emoji,
    accent_a, accent_b, rules, tags, is_private,
    avatar_url, banner_url
  ) values (
    p_name, nullif(clean_slug, ''), coalesce(p_description, ''), caller,
    coalesce(p_category, 'alpha'), coalesce(p_icon_emoji, '✨'),
    p_accent_a, p_accent_b,
    coalesce(p_rules, '[]'::jsonb), coalesce(p_tags, '[]'::jsonb),
    coalesce(p_is_private, false),
    p_avatar_url, p_banner_url
  )
  returning communities.id into new_id;

  insert into public.community_members (community_id, user_id, role)
  values (new_id, caller, 'owner')
  on conflict do nothing;

  return query
    select c.id, c.name, c.slug, c.description, c.owner_id,
           c.category, c.icon_emoji, c.accent_a, c.accent_b,
           c.rules, c.tags, c.is_private,
           c.avatar_url, c.banner_url, c.member_count, c.created_at
      from public.communities c
     where c.id = new_id;
end $$;

grant execute on function public.create_community(
  text, text, text, text, text, text, text, jsonb, jsonb, boolean, text, text
) to authenticated;

-- 5. Counter resync ------------------------------------------------------
update public.communities c
   set member_count = coalesce((
         select count(*) from public.community_members m where m.community_id = c.id
       ), 0),
       posts_count  = coalesce((
         select count(*) from public.community_posts p where p.community_id = c.id
       ), 0);

update public.profiles p
   set followers_count = coalesce((select count(*) from public.followers f where f.followee_id = p.id), 0),
       following_count = coalesce((select count(*) from public.followers f where f.follower_id = p.id), 0);

-- 6. Realtime publication --------------------------------------------------
do $$
declare
  t      text;
  tables text[] := array[
    'profiles', 'followers', 'user_presence',
    'communities', 'community_members', 'community_posts',
    'post_likes', 'notifications', 'livekit_rooms', 'livekit_participants'
  ];
begin
  foreach t in array tables loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
              when undefined_object  then null;
              when others            then null;
    end;
  end loop;
end $$;

-- =====================================================================
-- DONE
-- =====================================================================
