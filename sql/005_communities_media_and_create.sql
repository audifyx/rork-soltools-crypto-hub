-- ============================================================================
-- 005_communities_media_and_create.sql
-- Adds avatar/banner image columns to communities (idempotent), an atomic
-- create_community RPC that inserts the row + auto-joins the owner so the
-- community shows up immediately, and re-applies sane RLS so created
-- communities are visible across users.
--
-- Safe to re-run.
-- ============================================================================

-- 1. Make sure the media columns the UI now writes exist --------------------
alter table public.communities
  add column if not exists avatar_url text,
  add column if not exists banner_url text;

-- 2. Drop both legacy + current SELECT policies and recreate a single,
--    permissive read policy. Multiple PERMISSIVE policies OR together but
--    older deployments left a private-gating policy that hid newly created
--    communities for non-members; consolidating avoids surprises.
do $$
begin
  begin execute 'drop policy if exists "communities_select"       on public.communities'; exception when others then null; end;
  begin execute 'drop policy if exists "communities_read"         on public.communities'; exception when others then null; end;
  begin execute 'drop policy if exists "communities_create_owner" on public.communities'; exception when others then null; end;
  begin execute 'drop policy if exists "communities_insert"       on public.communities'; exception when others then null; end;
  begin execute 'drop policy if exists "communities_update_owner" on public.communities'; exception when others then null; end;
  begin execute 'drop policy if exists "communities_update"       on public.communities'; exception when others then null; end;

  execute $p$create policy "communities_read"         on public.communities
            for select using (true)$p$;
  execute $p$create policy "communities_create_owner" on public.communities
            for insert with check (auth.uid() = owner_id)$p$;
  execute $p$create policy "communities_update_owner" on public.communities
            for update using (auth.uid() = owner_id)
            with check (auth.uid() = owner_id)$p$;
end $$;

-- 3. Atomic create RPC: inserts the community AND auto-joins the owner
--    in a single round trip so the new community is visible everywhere
--    immediately (cards, joined list, member count).
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
  caller uuid := auth.uid();
  new_id uuid;
  clean_slug text := lower(regexp_replace(coalesce(p_slug,''), '^@', ''));
begin
  if caller is null then raise exception 'not authenticated'; end if;

  insert into public.communities (
    name, slug, description, owner_id, category, icon_emoji,
    accent_a, accent_b, rules, tags, is_private,
    avatar_url, banner_url
  ) values (
    p_name, nullif(clean_slug, ''), coalesce(p_description, ''), caller,
    coalesce(p_category, 'alpha'), coalesce(p_icon_emoji, '✨'),
    p_accent_a, p_accent_b, coalesce(p_rules, '[]'::jsonb),
    coalesce(p_tags, '[]'::jsonb), coalesce(p_is_private, false),
    p_avatar_url, p_banner_url
  )
  returning communities.id into new_id;

  -- Auto-join owner (idempotent) — counter trigger keeps member_count in sync.
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

-- 4. Helpful: ensure unique slug index exists (case-insensitive, partial). --
create unique index if not exists communities_slug_uniq
  on public.communities (lower(slug)) where slug is not null;

-- ============================================================================
-- DONE
-- ============================================================================
