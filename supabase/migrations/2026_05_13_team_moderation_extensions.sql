-- Team moderation extensions: comments + stories deletion RPCs
-- Adds team_delete_comment, team_delete_story, team_delete_story_comment
-- and ensures team_permissions defaults include delete_comments + delete_stories.
--
-- Apply this after 2026_05_12_full_platform_features.sql.

set local search_path = public;

-- ---------------------------------------------------------------------------
-- Permission helper (reuses the team role model from prior migrations)
-- ---------------------------------------------------------------------------

create or replace function public._team_can(p_user_id uuid, p_perm text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
  v_perms jsonb;
begin
  if p_user_id is null then return false; end if;

  select role, coalesce(permissions, '{}'::jsonb)
    into v_role, v_perms
  from public.admin_roles
  where user_id = p_user_id
  limit 1;

  if v_role is null then return false; end if;

  -- Owners / superadmins / admins / moderators get full access.
  if v_role in ('owner', 'superadmin', 'admin', 'moderator') then
    return true;
  end if;

  if v_role = 'team' then
    return coalesce((v_perms ->> p_perm)::boolean, false);
  end if;

  return false;
end;
$$;

grant execute on function public._team_can(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Action logger (best-effort; ignores missing table)
-- ---------------------------------------------------------------------------

create or replace function public._team_log(
  p_user_id uuid,
  p_action text,
  p_target_type text,
  p_target_id text,
  p_metadata jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    insert into public.team_actions_log (team_user_id, action, target_type, target_id, metadata)
    values (p_user_id, p_action, p_target_type, p_target_id, p_metadata);
  exception when undefined_table then
    -- log table missing; ignore so the moderation action still succeeds
    null;
  end;
end;
$$;

grant execute on function public._team_log(uuid, text, text, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 1. team_delete_comment — deletes a community post comment (a post row whose
--    parent_post_id is set) and decrements parent's comments_count.
-- ---------------------------------------------------------------------------

create or replace function public.team_delete_comment(
  p_comment_id uuid,
  p_reason text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_parent uuid;
  v_author uuid;
  v_content text;
begin
  if not public._team_can(v_uid, 'delete_comments') then
    raise exception 'forbidden: missing delete_comments permission';
  end if;

  select parent_post_id, user_id, content
    into v_parent, v_author, v_content
  from public.community_posts
  where id = p_comment_id;

  if v_parent is null then
    raise exception 'not a comment: %', p_comment_id;
  end if;

  delete from public.community_posts where id = p_comment_id;

  update public.community_posts
     set comments_count = greatest(0, coalesce(comments_count, 0) - 1)
   where id = v_parent;

  perform public._team_log(
    v_uid,
    'team_delete_comment',
    'comment',
    p_comment_id::text,
    jsonb_build_object('parent_post_id', v_parent, 'author_id', v_author, 'reason', p_reason, 'snippet', left(coalesce(v_content, ''), 240))
  );
end;
$$;

grant execute on function public.team_delete_comment(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. team_delete_story — deletes a story plus its likes/views/comments.
-- ---------------------------------------------------------------------------

create or replace function public.team_delete_story(
  p_story_id uuid,
  p_reason text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_author uuid;
  v_caption text;
begin
  if not public._team_can(v_uid, 'delete_stories') then
    raise exception 'forbidden: missing delete_stories permission';
  end if;

  select author_id, caption
    into v_author, v_caption
  from public.stories
  where id = p_story_id;

  if v_author is null then
    -- author_id column not present, attempt user_id fallback
    begin
      execute 'select user_id, caption from public.stories where id = $1'
        into v_author, v_caption using p_story_id;
    exception when others then null;
    end;
  end if;

  -- Best-effort cascade across related child tables.
  begin delete from public.story_comment_likes where comment_id in (select id from public.story_comments where story_id = p_story_id); exception when undefined_table then null; end;
  begin delete from public.story_comments where story_id = p_story_id; exception when undefined_table then null; end;
  begin delete from public.story_likes where story_id = p_story_id; exception when undefined_table then null; end;
  begin delete from public.story_views where story_id = p_story_id; exception when undefined_table then null; end;
  begin delete from public.story_replies where story_id = p_story_id; exception when undefined_table then null; end;

  delete from public.stories where id = p_story_id;

  perform public._team_log(
    v_uid,
    'team_delete_story',
    'story',
    p_story_id::text,
    jsonb_build_object('author_id', v_author, 'reason', p_reason, 'caption', left(coalesce(v_caption, ''), 240))
  );
end;
$$;

grant execute on function public.team_delete_story(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. team_delete_story_comment — deletes a story comment (and replies),
--    decrements parent counters when applicable.
-- ---------------------------------------------------------------------------

create or replace function public.team_delete_story_comment(
  p_comment_id uuid,
  p_reason text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_story uuid;
  v_parent uuid;
  v_author uuid;
  v_body text;
  v_removed integer := 0;
begin
  if not public._team_can(v_uid, 'delete_comments') and not public._team_can(v_uid, 'delete_stories') then
    raise exception 'forbidden: missing delete_comments/delete_stories permission';
  end if;

  select story_id, parent_comment_id, user_id, body
    into v_story, v_parent, v_author, v_body
  from public.story_comments
  where id = p_comment_id;

  if v_story is null then
    raise exception 'story comment not found: %', p_comment_id;
  end if;

  -- Remove likes for this comment and its direct replies.
  begin
    delete from public.story_comment_likes
     where comment_id in (
       select id from public.story_comments
        where id = p_comment_id or parent_comment_id = p_comment_id
     );
  exception when undefined_table then null;
  end;

  -- Count replies for counter accounting before deletion.
  select count(*) into v_removed
    from public.story_comments
   where parent_comment_id = p_comment_id;

  delete from public.story_comments
   where id = p_comment_id or parent_comment_id = p_comment_id;

  -- Decrement parent's replies_count when this was itself a reply.
  if v_parent is not null then
    begin
      update public.story_comments
         set replies_count = greatest(0, coalesce(replies_count, 0) - 1)
       where id = v_parent;
    exception when others then null;
    end;
  end if;

  -- Decrement the story's comments_count by 1 (top-level) + replies.
  begin
    update public.stories
       set comments_count = greatest(0, coalesce(comments_count, 0) - (1 + v_removed))
     where id = v_story;
  exception when others then null;
  end;

  perform public._team_log(
    v_uid,
    'team_delete_story_comment',
    'story_comment',
    p_comment_id::text,
    jsonb_build_object(
      'story_id', v_story,
      'parent_comment_id', v_parent,
      'author_id', v_author,
      'replies_removed', v_removed,
      'reason', p_reason,
      'body', left(coalesce(v_body, ''), 240)
    )
  );
end;
$$;

grant execute on function public.team_delete_story_comment(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Backfill default permissions on team rows so existing moderators inherit
--    the new comment + story delete flags.
-- ---------------------------------------------------------------------------

update public.admin_roles
   set permissions = coalesce(permissions, '{}'::jsonb)
                     || jsonb_build_object(
                          'delete_comments', coalesce((permissions ->> 'delete_comments')::boolean, true),
                          'delete_stories',  coalesce((permissions ->> 'delete_stories')::boolean, true)
                        )
 where role = 'team';
