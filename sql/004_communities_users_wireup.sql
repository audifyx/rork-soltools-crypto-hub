-- ============================================================================
-- 004_communities_users_wireup.sql
-- Final wiring for Communities + Users tabs.
-- Idempotent. Safe to re-run. Short on purpose.
-- ============================================================================

-- 1. Make sure community columns the UI needs exist ------------------------
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
  add column if not exists online_count  integer not null default 0;

create unique index if not exists communities_slug_uniq
  on public.communities (lower(slug)) where slug is not null;

-- 2. Re-sync counters from source-of-truth tables --------------------------
update public.communities c
   set member_count = coalesce((
         select count(*) from public.community_members m where m.community_id = c.id
       ), 0),
       posts_count  = coalesce((
         select count(*) from public.community_posts p where p.community_id = c.id
       ), 0);

-- 3. RLS for communities (read-all, owner-write) ---------------------------
alter table public.communities       enable row level security;
alter table public.community_members enable row level security;
alter table public.community_posts   enable row level security;

do $$
begin
  begin execute 'drop policy if exists "communities_read"         on public.communities';        exception when others then null; end;
  begin execute 'drop policy if exists "communities_select"       on public.communities';        exception when others then null; end;
  begin execute 'drop policy if exists "communities_create_owner" on public.communities';        exception when others then null; end;
  begin execute 'drop policy if exists "communities_insert"       on public.communities';        exception when others then null; end;
  begin execute 'drop policy if exists "communities_update_owner" on public.communities';        exception when others then null; end;
  begin execute 'drop policy if exists "communities_update"       on public.communities';        exception when others then null; end;
  execute $p$create policy "communities_read"         on public.communities for select using (true)$p$;
  execute $p$create policy "communities_create_owner" on public.communities for insert with check (auth.uid() = owner_id)$p$;
  execute $p$create policy "communities_update_owner" on public.communities for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id)$p$;

  begin execute 'drop policy if exists "cm_read"       on public.community_members'; exception when others then null; end;
  begin execute 'drop policy if exists "cm_join_self"  on public.community_members'; exception when others then null; end;
  begin execute 'drop policy if exists "cm_leave_self" on public.community_members'; exception when others then null; end;
  execute $p$create policy "cm_read"       on public.community_members for select using (true)$p$;
  execute $p$create policy "cm_join_self"  on public.community_members for insert with check (auth.uid() = user_id)$p$;
  execute $p$create policy "cm_leave_self" on public.community_members for delete using (auth.uid() = user_id)$p$;

  begin execute 'drop policy if exists "cp_read"       on public.community_posts'; exception when others then null; end;
  begin execute 'drop policy if exists "cp_write_self" on public.community_posts'; exception when others then null; end;
  execute $p$create policy "cp_read"       on public.community_posts for select using (true)$p$;
  execute $p$create policy "cp_write_self" on public.community_posts for insert with check (auth.uid() = user_id)$p$;
end $$;

-- 4. Single source of truth for member/post counter triggers ---------------
create or replace function public.fn_community_members_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.communities set member_count = member_count + 1 where id = new.community_id;
  elsif tg_op = 'DELETE' then
    update public.communities set member_count = greatest(0, member_count - 1) where id = old.community_id;
  end if;
  return null;
end $$;

drop trigger if exists trg_community_members_ins   on public.community_members;
drop trigger if exists trg_community_members_del   on public.community_members;
drop trigger if exists trg_community_member_count  on public.community_members;
create trigger trg_community_members_ins after insert on public.community_members
  for each row execute function public.fn_community_members_count();
create trigger trg_community_members_del after delete on public.community_members
  for each row execute function public.fn_community_members_count();

create or replace function public.fn_community_posts_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.communities set posts_count = posts_count + 1 where id = new.community_id;
  elsif tg_op = 'DELETE' then
    update public.communities set posts_count = greatest(0, posts_count - 1) where id = old.community_id;
  end if;
  return null;
end $$;

drop trigger if exists trg_community_posts_count_ins on public.community_posts;
drop trigger if exists trg_community_posts_count_del on public.community_posts;
drop trigger if exists trg_community_post_count     on public.community_posts;
create trigger trg_community_posts_count_ins after insert on public.community_posts
  for each row execute function public.fn_community_posts_count();
create trigger trg_community_posts_count_del after delete on public.community_posts
  for each row execute function public.fn_community_posts_count();

-- 5. Realtime publication for community + users tables ---------------------
do $$
declare
  t text;
  tables text[] := array[
    'communities', 'community_members', 'community_posts',
    'profiles',    'followers',         'user_presence'
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

-- 6. Re-sync follower / following counts -----------------------------------
-- Some older deployments use `following_id` instead of `followee_id` on the
-- followers table. Detect the column at runtime so this block is portable.
do $
declare
  followee_col text;
begin
  -- Make sure the counter columns exist on profiles
  begin
    alter table public.profiles add column if not exists followers_count integer not null default 0;
  exception when others then null; end;
  begin
    alter table public.profiles add column if not exists following_count integer not null default 0;
  exception when others then null; end;

  if not exists (select 1 from information_schema.tables
                  where table_schema = 'public' and table_name = 'followers') then
    return;
  end if;

  select column_name into followee_col
    from information_schema.columns
   where table_schema = 'public'
     and table_name   = 'followers'
     and column_name in ('followee_id','following_id')
   order by case column_name when 'followee_id' then 0 else 1 end
   limit 1;

  if followee_col is null then
    -- Nothing we can sync against; bail out quietly.
    return;
  end if;

  execute format($f$
    update public.profiles p
       set followers_count = coalesce((select count(*) from public.followers f where f.%I = p.id), 0),
           following_count = coalesce((select count(*) from public.followers f where f.follower_id = p.id), 0)
  $f$, followee_col);
end $;

-- 7. Whoami/current user posts cache helper for postsByCommunity -----------
-- Returns the post + a `liked` flag for the caller. UI uses this to render
-- the heart state on first paint without a second round-trip per post.
create or replace function public.list_community_posts(target_community_id uuid, max_rows int default 100)
returns table (
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

-- ============================================================================
-- DONE
-- ============================================================================
