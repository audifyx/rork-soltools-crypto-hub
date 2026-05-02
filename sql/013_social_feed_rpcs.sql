-- 013_social_feed_rpcs.sql
-- Idempotent feed, discovery, follow-list, and community RPCs.

create or replace function public.list_users(
  q text default '',
  online_only boolean default false,
  max_rows int default 200
) returns table (
  user_id uuid, username text, display_name text, avatar_url text, banner_url text,
  bio text, verified boolean, custom_badges jsonb, followers_count integer,
  is_online boolean, last_seen timestamptz, created_at timestamptz, is_following boolean
) language plpgsql stable security definer set search_path = public as $$
declare
  needle text := nullif(trim(q), '');
  caller uuid := auth.uid();
  cutoff timestamptz := now() - interval '90 seconds';
begin
  return query
    select p.id, p.username::text, p.display_name, p.avatar_url, p.banner_url,
           p.bio, p.verified, coalesce(p.custom_badges, '[]'::jsonb), p.followers_count,
           coalesce(up.last_seen >= cutoff and up.status <> 'offline', false),
           up.last_seen, p.created_at,
           case when caller is null then false else exists (
             select 1 from public.followers f where f.follower_id = caller and f.followee_id = p.id
           ) end
      from public.profiles p
      left join public.user_presence up on up.user_id = p.id
     where coalesce(p.is_banned, false) = false
       and (needle is null or p.username::text ilike '%' || needle || '%' or p.display_name ilike '%' || needle || '%')
       and (online_only is not true or (up.last_seen >= cutoff and up.status <> 'offline'))
     order by (up.last_seen >= cutoff and up.status <> 'offline') desc nulls last,
              up.last_seen desc nulls last, p.followers_count desc, p.created_at desc
     limit greatest(1, least(max_rows, 500));
end $$;

grant execute on function public.list_users(text, boolean, int) to authenticated, anon;

create or replace function public.users_overview()
returns table (total_users bigint, online_users bigint, new_today bigint)
language sql stable security definer set search_path = public as $$
  select
    (select count(*)::bigint from public.profiles where coalesce(is_banned, false) = false),
    (select count(*)::bigint from public.user_presence where last_seen >= now() - interval '90 seconds' and status <> 'offline'),
    (select count(*)::bigint from public.profiles where created_at >= date_trunc('day', now()) and coalesce(is_banned, false) = false);
$$;

grant execute on function public.users_overview() to authenticated, anon;

create or replace function public.search_profiles(q text, max_rows int default 25)
returns table (user_id uuid, username text, display_name text, avatar_url text, verified boolean, custom_badges jsonb, followers_count integer)
language sql stable security definer set search_path = public as $$
  select p.id, p.username::text, p.display_name, p.avatar_url, p.verified,
         coalesce(p.custom_badges, '[]'::jsonb), p.followers_count
    from public.profiles p
   where coalesce(p.is_banned, false) = false
     and (nullif(trim(q), '') is null or p.username::text ilike '%' || trim(q) || '%' or p.display_name ilike '%' || trim(q) || '%')
   order by p.followers_count desc, p.created_at desc
   limit greatest(1, least(max_rows, 100));
$$;

grant execute on function public.search_profiles(text, int) to authenticated, anon;

create or replace function public.list_followers(target_user_id uuid)
returns table (user_id uuid, username text, display_name text, avatar_url text, verified boolean, custom_badges jsonb)
language sql stable security definer set search_path = public as $$
  select p.id, p.username::text, p.display_name, p.avatar_url, p.verified, coalesce(p.custom_badges, '[]'::jsonb)
    from public.followers f join public.profiles p on p.id = f.follower_id
   where f.followee_id = target_user_id and coalesce(p.is_banned, false) = false
   order by f.created_at desc limit 500;
$$;

create or replace function public.list_following(target_user_id uuid)
returns table (user_id uuid, username text, display_name text, avatar_url text, verified boolean, custom_badges jsonb)
language sql stable security definer set search_path = public as $$
  select p.id, p.username::text, p.display_name, p.avatar_url, p.verified, coalesce(p.custom_badges, '[]'::jsonb)
    from public.followers f join public.profiles p on p.id = f.followee_id
   where f.follower_id = target_user_id and coalesce(p.is_banned, false) = false
   order by f.created_at desc limit 500;
$$;

grant execute on function public.list_followers(uuid) to authenticated, anon;
grant execute on function public.list_following(uuid) to authenticated, anon;

create or replace function public.toggle_post_like(target_post_id uuid)
returns table (liked boolean, likes_count integer)
language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  cur_count integer;
begin
  if caller is null then raise exception 'not authenticated'; end if;
  if exists (select 1 from public.post_likes where post_id = target_post_id and user_id = caller) then
    delete from public.post_likes where post_id = target_post_id and user_id = caller;
    liked := false;
  else
    insert into public.post_likes (post_id, user_id) values (target_post_id, caller) on conflict do nothing;
    liked := true;
  end if;
  update public.community_posts set likes_count = (select count(*)::int from public.post_likes where post_id = target_post_id) where id = target_post_id;
  select cp.likes_count into cur_count from public.community_posts cp where cp.id = target_post_id;
  likes_count := coalesce(cur_count, 0);
  return next;
end $$;

grant execute on function public.toggle_post_like(uuid) to authenticated;

create or replace function public.get_following_feed(max_rows int default 50)
returns table (id uuid, user_id uuid, content text, image_url text, ticker text, change_pct numeric, likes_count integer, reposts_count integer, comments_count integer, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select cp.id, cp.user_id, cp.content, cp.image_url, cp.ticker, cp.change_pct,
         cp.likes_count, cp.reposts_count, cp.comments_count, cp.created_at
    from public.community_posts cp
    join public.followers f on f.followee_id = cp.user_id
   where f.follower_id = auth.uid()
   order by cp.created_at desc
   limit greatest(1, least(max_rows, 200));
$$;

grant execute on function public.get_following_feed(int) to authenticated;

create or replace function public.list_community_posts(target_community_id uuid, max_rows int default 100)
returns table (
  id uuid, community_id uuid, user_id uuid, content text, ticker text, change_pct numeric,
  likes_count integer, comments_count integer, pinned boolean, created_at timestamptz,
  liked boolean, username text, display_name text, avatar_color text
) language sql stable security definer set search_path = public as $$
  select cp.id, cp.community_id, cp.user_id, cp.content, cp.ticker, cp.change_pct,
         cp.likes_count, cp.comments_count, cp.pinned, cp.created_at,
         case when auth.uid() is null then false else exists (
           select 1 from public.post_likes pl where pl.post_id = cp.id and pl.user_id = auth.uid()
         ) end,
         p.username::text, p.display_name, p.avatar_color
    from public.community_posts cp
    left join public.profiles p on p.id = cp.user_id
   where cp.community_id = target_community_id
   order by cp.pinned desc, cp.created_at desc
   limit greatest(1, least(max_rows, 200));
$$;

grant execute on function public.list_community_posts(uuid, int) to authenticated, anon;

select '013_social_feed_rpcs applied' as status;
