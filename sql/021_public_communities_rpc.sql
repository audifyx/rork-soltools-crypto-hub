-- 021_public_communities_rpc.sql
-- Public discover feed for communities. Keeps private communities hidden unless
-- the caller owns or joined them, while allowing everyone to see public groups.

create or replace function public.list_public_communities(max_rows int default 200)
returns table (
  id uuid,
  name text,
  slug text,
  description text,
  owner_id uuid,
  member_count integer,
  posts_count integer,
  online_count integer,
  category text,
  icon_emoji text,
  accent_a text,
  accent_b text,
  verified boolean,
  trending boolean,
  pinned_ticker text,
  rules jsonb,
  tags jsonb,
  is_private boolean,
  avatar_url text,
  banner_url text,
  created_at timestamptz,
  owner_username text
)
language sql
security definer
set search_path = public
as $$
  select
    c.id,
    c.name,
    c.slug::text,
    c.description,
    c.owner_id,
    c.member_count,
    c.posts_count,
    c.online_count,
    c.category,
    c.icon_emoji,
    c.accent_a,
    c.accent_b,
    c.verified,
    c.trending,
    c.pinned_ticker,
    c.rules,
    c.tags,
    c.is_private,
    c.avatar_url,
    c.banner_url,
    c.created_at,
    p.username
  from public.communities c
  left join public.profiles p on p.id = c.owner_id
  where coalesce(c.is_private, false) = false
     or c.owner_id = auth.uid()
     or exists (
       select 1
       from public.community_members m
       where m.community_id = c.id
         and m.user_id = auth.uid()
     )
  order by c.created_at desc
  limit greatest(1, least(coalesce(max_rows, 200), 500));
$$;

grant execute on function public.list_public_communities(int) to anon, authenticated;

-- Make the direct Supabase fallback match the public discovery behavior.
do $$
begin
  drop policy if exists communities_read on public.communities;
  create policy communities_read on public.communities
    for select using (
      coalesce(is_private, false) = false
      or owner_id = auth.uid()
      or exists (
        select 1
        from public.community_members m
        where m.community_id = communities.id
          and m.user_id = auth.uid()
      )
    );
end $$;

select '021_public_communities_rpc applied' as status;
