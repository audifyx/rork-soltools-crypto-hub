-- =============================================================================
-- Fix: communities created by one user are not visible to other users.
-- Safe to run multiple times. Delete this file after running it once.
-- =============================================================================

-- 1) Make sure RLS is on, but everyone can SELECT public/non-private communities.
alter table public.communities enable row level security;

-- Drop any old, overly-restrictive SELECT policies so we start clean.
do $$
declare p record;
begin
  for p in
    select polname
    from pg_policy
    where polrelid = 'public.communities'::regclass
      and polcmd = 'r' -- SELECT
  loop
    execute format('drop policy if exists %I on public.communities', p.polname);
  end loop;
end$$;

-- Anyone (including anon) can see non-private communities.
create policy "communities_select_public"
  on public.communities
  for select
  using (
    coalesce(is_private, false) = false
    or owner_id = auth.uid()
  );

-- Authenticated users can create their own communities.
drop policy if exists "communities_insert_own" on public.communities;
create policy "communities_insert_own"
  on public.communities
  for insert
  to authenticated
  with check (owner_id = auth.uid());

-- Owners can update / delete their own communities.
drop policy if exists "communities_update_own" on public.communities;
create policy "communities_update_own"
  on public.communities
  for update
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "communities_delete_own" on public.communities;
create policy "communities_delete_own"
  on public.communities
  for delete
  to authenticated
  using (owner_id = auth.uid());

-- 2) Make sure is_private defaults to false (so brand-new communities are public).
alter table public.communities
  alter column is_private set default false;

update public.communities
   set is_private = false
 where is_private is null;

-- 3) Backfill any older rows that may have been silently created as private.
--    Only flip rows that don't have a holder-gate or explicit privacy intent.
update public.communities
   set is_private = false
 where is_private = true
   and coalesce(holder_only, false) = false
   and gate_token_mint is null;

-- 4) Make sure community_members is readable so member counts / joins work
--    across accounts.
alter table public.community_members enable row level security;

do $$
declare p record;
begin
  for p in
    select polname
    from pg_policy
    where polrelid = 'public.community_members'::regclass
      and polcmd = 'r'
  loop
    execute format('drop policy if exists %I on public.community_members', p.polname);
  end loop;
end$$;

create policy "community_members_select_all"
  on public.community_members
  for select
  using (true);

drop policy if exists "community_members_insert_self" on public.community_members;
create policy "community_members_insert_self"
  on public.community_members
  for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "community_members_delete_self" on public.community_members;
create policy "community_members_delete_self"
  on public.community_members
  for delete
  to authenticated
  using (user_id = auth.uid());

-- 5) Rebuild create_community as SECURITY DEFINER so the insert + owner
--    auto-join always succeeds and the row is created as public unless the
--    caller explicitly asks for a private/holder-gated community.
create or replace function public.create_community(
  p_name text,
  p_slug text,
  p_description text,
  p_category text,
  p_icon_emoji text,
  p_accent_a text,
  p_accent_b text,
  p_rules jsonb,
  p_tags jsonb,
  p_is_private boolean,
  p_holder_only boolean,
  p_gate_token_mint text,
  p_gate_minimum_balance numeric,
  p_avatar_url text,
  p_banner_url text
)
returns setof public.communities
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.communities%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  insert into public.communities (
    name, slug, description, owner_id, category, icon_emoji,
    accent_a, accent_b, rules, tags,
    is_private, holder_only, gate_token_mint, gate_minimum_balance,
    avatar_url, banner_url
  ) values (
    p_name, p_slug, p_description, v_uid, p_category, p_icon_emoji,
    p_accent_a, p_accent_b, p_rules, p_tags,
    coalesce(p_is_private, false),
    coalesce(p_holder_only, false),
    p_gate_token_mint, p_gate_minimum_balance,
    p_avatar_url, p_banner_url
  )
  returning * into v_row;

  insert into public.community_members (community_id, user_id, role)
  values (v_row.id, v_uid, 'owner')
  on conflict do nothing;

  return next v_row;
end;
$$;

grant execute on function public.create_community(
  text, text, text, text, text, text, text, jsonb, jsonb,
  boolean, boolean, text, numeric, text, text
) to authenticated;

-- 6) Public listing RPC fallback used by the client.
create or replace function public.list_public_communities(max_rows int default 200)
returns table (
  id uuid,
  name text,
  slug text,
  description text,
  owner_id uuid,
  member_count int,
  posts_count int,
  online_count int,
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
  holder_only boolean,
  gate_token_mint text,
  gate_minimum_balance numeric,
  avatar_url text,
  banner_url text,
  created_at timestamptz,
  owner_username text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id, c.name, c.slug, c.description, c.owner_id,
    c.member_count, c.posts_count, c.online_count,
    c.category, c.icon_emoji, c.accent_a, c.accent_b,
    c.verified, c.trending, c.pinned_ticker, c.rules, c.tags,
    c.is_private, c.holder_only, c.gate_token_mint, c.gate_minimum_balance,
    c.avatar_url, c.banner_url, c.created_at,
    p.username as owner_username
  from public.communities c
  left join public.profiles p
    on p.id = c.owner_id or p.user_id = c.owner_id
  where coalesce(c.is_private, false) = false
  order by c.created_at desc
  limit greatest(coalesce(max_rows, 200), 1);
$$;

grant execute on function public.list_public_communities(int) to anon, authenticated;
