-- Separates the global/home feed from community timelines.
-- Home/global feeds should only return top-level posts with no community_id.
-- Community screens continue to use list_community_posts(target_community_id).

create index if not exists idx_community_posts_global_top_created
  on public.community_posts(created_at desc)
  where community_id is null and parent_post_id is null;

create or replace function public.get_following_feed(max_rows integer default 50)
returns table(
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
)
language sql
security definer
set search_path = public
as $$
  select
    cp.id,
    cp.user_id,
    cp.content::text,
    cp.image_url::text,
    coalesce(cp.ticker, cp.token_symbol)::text,
    coalesce(cp.change_pct, cp.token_change_24h),
    coalesce(cp.likes_count, 0)::integer,
    coalesce(cp.reposts_count, 0)::integer,
    coalesce(cp.comments_count, 0)::integer,
    cp.created_at
  from public.community_posts cp
  where cp.community_id is null
    and cp.parent_post_id is null
    and exists (
      select 1
      from public.followers f
      where f.follower_id = auth.uid()
        and f.followee_id = cp.user_id
    )
  order by cp.created_at desc
  limit greatest(1, least(coalesce(max_rows, 50), 200));
$$;

grant execute on function public.get_following_feed(integer) to authenticated;
