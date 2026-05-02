-- 015_community_create_rpc.sql
-- Atomic community creation RPC with owner auto-join.

create or replace function public.create_community(
  p_name text,
  p_slug text,
  p_description text default '',
  p_category text default 'alpha',
  p_icon_emoji text default '✨',
  p_accent_a text default null,
  p_accent_b text default null,
  p_rules jsonb default '[]'::jsonb,
  p_tags jsonb default '[]'::jsonb,
  p_is_private boolean default false,
  p_avatar_url text default null,
  p_banner_url text default null
) returns table (
  id uuid,
  name text,
  slug text,
  description text,
  owner_id uuid,
  category text,
  icon_emoji text,
  accent_a text,
  accent_b text,
  rules jsonb,
  tags jsonb,
  is_private boolean,
  avatar_url text,
  banner_url text,
  member_count integer,
  created_at timestamptz
) language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  new_id uuid;
  clean_slug text := lower(regexp_replace(coalesce(p_slug, ''), '^@', ''));
begin
  if caller is null then raise exception 'not authenticated'; end if;
  clean_slug := regexp_replace(clean_slug, '[^a-z0-9_\-]+', '', 'g');
  if clean_slug = '' then clean_slug := 'community-' || substr(gen_random_uuid()::text, 1, 8); end if;

  insert into public.communities (
    name, slug, description, owner_id, category, icon_emoji,
    accent_a, accent_b, rules, tags, is_private, avatar_url, banner_url
  ) values (
    nullif(trim(p_name), ''), clean_slug, coalesce(p_description, ''), caller,
    coalesce(p_category, 'alpha'), coalesce(p_icon_emoji, '✨'),
    p_accent_a, p_accent_b, coalesce(p_rules, '[]'::jsonb),
    coalesce(p_tags, '[]'::jsonb), coalesce(p_is_private, false),
    p_avatar_url, p_banner_url
  )
  returning communities.id into new_id;

  insert into public.community_members (community_id, user_id, role)
  values (new_id, caller, 'owner')
  on conflict do nothing;

  update public.communities
     set member_count = (select count(*)::int from public.community_members where community_id = new_id)
   where communities.id = new_id;

  return query
    select c.id, c.name, c.slug::text, c.description, c.owner_id,
           c.category, c.icon_emoji, c.accent_a, c.accent_b,
           c.rules, c.tags, c.is_private, c.avatar_url, c.banner_url,
           c.member_count, c.created_at
      from public.communities c
     where c.id = new_id;
end $$;

grant execute on function public.create_community(text,text,text,text,text,text,text,jsonb,jsonb,boolean,text,text) to authenticated;

select '015_community_create_rpc applied' as status;
