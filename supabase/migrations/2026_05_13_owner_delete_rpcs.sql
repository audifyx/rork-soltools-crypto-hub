-- =====================================================================
-- 2026-05-13 · Owner self-delete RPCs
-- ---------------------------------------------------------------------
-- Lets authenticated users remove their own content from any surface:
--   • delete_own_story(p_story_id uuid)
--   • delete_own_community(p_community_id uuid)
--   • delete_own_reel_comment(p_comment_id uuid)
--
-- Each function verifies ownership via auth.uid() and runs as SECURITY
-- DEFINER so RLS does not block the cascade cleanup. Existing admin/team
-- delete RPCs and the user-scoped delete_community_post / deleteReel
-- table delete continue to handle their own surfaces.
-- Idempotent: safe to run multiple times.
-- =====================================================================

set local search_path = public;

-- ---------------------------------------------------------------------
-- delete_own_story
-- ---------------------------------------------------------------------
create or replace function public.delete_own_story(p_story_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_has_author_col boolean;
begin
  if v_uid is null then
    raise exception 'auth required' using errcode = '28000';
  end if;

  select exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'stories' and column_name = 'author_id'
  ) into v_has_author_col;

  if v_has_author_col then
    select author_id into v_owner from public.stories where id = p_story_id;
  else
    select user_id into v_owner from public.stories where id = p_story_id;
  end if;

  if v_owner is null then
    raise exception 'story not found' using errcode = 'P0002';
  end if;

  if v_owner <> v_uid then
    raise exception 'forbidden: not story owner' using errcode = '42501';
  end if;

  -- best-effort cleanup of related rows (ignore if tables don't exist)
  begin execute 'delete from public.story_comment_likes where comment_id in (select id from public.story_comments where story_id = $1)' using p_story_id;
  exception when undefined_table then null; end;
  begin execute 'delete from public.story_comments where story_id = $1' using p_story_id;
  exception when undefined_table then null; end;
  begin execute 'delete from public.story_likes where story_id = $1' using p_story_id;
  exception when undefined_table then null; end;
  begin execute 'delete from public.story_views where story_id = $1' using p_story_id;
  exception when undefined_table then null; end;
  begin execute 'delete from public.story_replies where story_id = $1' using p_story_id;
  exception when undefined_table then null; end;

  delete from public.stories where id = p_story_id;
end;
$$;

grant execute on function public.delete_own_story(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- delete_own_community — owner only
-- ---------------------------------------------------------------------
create or replace function public.delete_own_community(p_community_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
begin
  if v_uid is null then
    raise exception 'auth required' using errcode = '28000';
  end if;

  select owner_id into v_owner from public.communities where id = p_community_id;
  if v_owner is null then
    raise exception 'community not found' using errcode = 'P0002';
  end if;
  if v_owner <> v_uid then
    raise exception 'forbidden: not community owner' using errcode = '42501';
  end if;

  -- Best-effort cleanup of related rows
  begin execute 'delete from public.community_post_likes where post_id in (select id from public.community_posts where community_id = $1)' using p_community_id;
  exception when undefined_table then null; end;
  begin execute 'delete from public.community_post_reposts where post_id in (select id from public.community_posts where community_id = $1)' using p_community_id;
  exception when undefined_table then null; end;
  begin execute 'delete from public.community_posts where community_id = $1' using p_community_id;
  exception when undefined_table then null; end;
  begin execute 'delete from public.community_members where community_id = $1' using p_community_id;
  exception when undefined_table then null; end;
  begin execute 'delete from public.community_join_requests where community_id = $1' using p_community_id;
  exception when undefined_table then null; end;
  begin execute 'delete from public.community_feature_settings where community_id = $1' using p_community_id;
  exception when undefined_table then null; end;

  delete from public.communities where id = p_community_id;
end;
$$;

grant execute on function public.delete_own_community(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- delete_own_reel_comment
-- ---------------------------------------------------------------------
create or replace function public.delete_own_reel_comment(p_comment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
begin
  if v_uid is null then
    raise exception 'auth required' using errcode = '28000';
  end if;

  select user_id into v_owner from public.reel_comments where id = p_comment_id;
  if v_owner is null then
    raise exception 'comment not found' using errcode = 'P0002';
  end if;
  if v_owner <> v_uid then
    raise exception 'forbidden: not comment owner' using errcode = '42501';
  end if;

  delete from public.reel_comments where id = p_comment_id;
end;
$$;

grant execute on function public.delete_own_reel_comment(uuid) to authenticated;
