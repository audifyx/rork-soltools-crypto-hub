-- =====================================================================
-- 2026-05-13 · Moderation enforcement triggers
-- =====================================================================
-- Server-side enforcement for ban / suspend / limit on key user actions.
-- The team_suspend_user / team_ban_user / team_limit_user RPCs flip flags
-- on the profile row; this migration installs BEFORE INSERT triggers on
-- the actor's outgoing actions so suspended/banned/limited users cannot
-- post, comment, like, repost, message, or otherwise act.
--
-- Triggers are idempotent and only attach when the target table exists.
-- =====================================================================

set local search_path = public;

-- ---------------------------------------------------------------------
-- Core enforcement helper. Raises if the calling auth.uid() is banned,
-- suspended, or has the relevant action limited.
--
--   p_action ∈ ('post', 'comment', 'like', 'dm')
-- ---------------------------------------------------------------------

create or replace function public._enforce_moderation(p_action text)
returns void
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_is_banned boolean;
  v_is_suspended boolean;
  v_ban_expires timestamptz;
  v_suspend_expires timestamptz;
  v_can_post boolean;
  v_can_comment boolean;
  v_can_like boolean;
  v_can_dm boolean;
  v_limit_expires timestamptz;
begin
  if v_uid is null then return; end if;

  select
    coalesce(p.is_banned, false),
    coalesce(p.is_suspended, false),
    p.ban_expires_at,
    p.suspend_expires_at,
    coalesce(p.can_post, true),
    coalesce(p.can_comment, true),
    coalesce(p.can_like, true),
    coalesce(p.can_dm, true),
    p.limit_expires_at
  into
    v_is_banned,
    v_is_suspended,
    v_ban_expires,
    v_suspend_expires,
    v_can_post,
    v_can_comment,
    v_can_like,
    v_can_dm,
    v_limit_expires
  from public.profiles p
  where p.user_id = v_uid or p.id = v_uid
  limit 1;

  -- No profile row → allow (will be created by signup flow).
  if not found then return; end if;

  -- Expired ban → treat as cleared.
  if v_is_banned and v_ban_expires is not null and v_ban_expires <= now() then
    v_is_banned := false;
  end if;
  if v_is_suspended and v_suspend_expires is not null and v_suspend_expires <= now() then
    v_is_suspended := false;
  end if;

  if v_is_banned then
    raise exception 'banned: account is banned'
      using errcode = 'P0001', hint = 'ban';
  end if;

  if v_is_suspended then
    raise exception 'suspended: account is suspended from this action'
      using errcode = 'P0001', hint = 'suspend';
  end if;

  -- Granular limits (auto-expire if elapsed).
  if v_limit_expires is not null and v_limit_expires <= now() then
    v_can_post := true;
    v_can_comment := true;
    v_can_like := true;
    v_can_dm := true;
  end if;

  if p_action = 'post' and not v_can_post then
    raise exception 'limited: posting is temporarily disabled'
      using errcode = 'P0001', hint = 'limit_post';
  elsif p_action = 'comment' and not v_can_comment then
    raise exception 'limited: commenting is temporarily disabled'
      using errcode = 'P0001', hint = 'limit_comment';
  elsif p_action = 'like' and not v_can_like then
    raise exception 'limited: liking is temporarily disabled'
      using errcode = 'P0001', hint = 'limit_like';
  elsif p_action = 'dm' and not v_can_dm then
    raise exception 'limited: messaging is temporarily disabled'
      using errcode = 'P0001', hint = 'limit_dm';
  end if;
end;
$$;

grant execute on function public._enforce_moderation(text) to authenticated;

-- ---------------------------------------------------------------------
-- Action-specific trigger entry points (one per action type — keeps
-- the trigger attach DO-blocks small and explicit).
-- ---------------------------------------------------------------------

create or replace function public._tg_enforce_post()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  -- Replies/comments live in the same posts table; treat parent_post_id != null as comment.
  if tg_table_name = 'community_posts'
     and (new.parent_post_id is not null or new.reply_to_post_id is not null) then
    perform public._enforce_moderation('comment');
  else
    perform public._enforce_moderation('post');
  end if;
  return new;
end;
$$;

create or replace function public._tg_enforce_comment()
returns trigger language plpgsql security definer set search_path = public as $$
begin perform public._enforce_moderation('comment'); return new; end;
$$;

create or replace function public._tg_enforce_like()
returns trigger language plpgsql security definer set search_path = public as $$
begin perform public._enforce_moderation('like'); return new; end;
$$;

create or replace function public._tg_enforce_dm()
returns trigger language plpgsql security definer set search_path = public as $$
begin perform public._enforce_moderation('dm'); return new; end;
$$;

-- ---------------------------------------------------------------------
-- Helper: attach a BEFORE INSERT trigger if the table exists. Drops any
-- prior version with the same name first to stay idempotent.
-- ---------------------------------------------------------------------

create or replace function public._attach_moderation_trigger(
  p_table text,
  p_fn    text,
  p_name  text default null
) returns void
language plpgsql
as $$
declare
  v_name text := coalesce(p_name, 'trg_' || p_table || '_moderation');
begin
  if exists (
    select 1 from pg_tables where schemaname = 'public' and tablename = p_table
  ) then
    execute format('drop trigger if exists %I on public.%I', v_name, p_table);
    execute format(
      'create trigger %I before insert on public.%I for each row execute function public.%I()',
      v_name, p_table, p_fn
    );
  end if;
end;
$$;

-- ---------------------------------------------------------------------
-- Attach triggers for all known action surfaces.
-- ---------------------------------------------------------------------

do $$
begin
  -- Posts / replies / comments (same table, trigger fn auto-detects)
  perform public._attach_moderation_trigger('community_posts',           '_tg_enforce_post');
  perform public._attach_moderation_trigger('posts',                     '_tg_enforce_post');
  perform public._attach_moderation_trigger('post_comments',             '_tg_enforce_comment');
  perform public._attach_moderation_trigger('post_replies',              '_tg_enforce_comment');
  perform public._attach_moderation_trigger('community_post_comments',   '_tg_enforce_comment');

  -- Stories (post-like) + story replies/comments
  perform public._attach_moderation_trigger('stories',                   '_tg_enforce_post');
  perform public._attach_moderation_trigger('story_replies',             '_tg_enforce_comment');
  perform public._attach_moderation_trigger('story_comments',            '_tg_enforce_comment');
  perform public._attach_moderation_trigger('story_comment_replies',     '_tg_enforce_comment');

  -- Reels are post-like
  perform public._attach_moderation_trigger('reels',                     '_tg_enforce_post');
  perform public._attach_moderation_trigger('reel_comments',             '_tg_enforce_comment');

  -- Likes across surfaces
  perform public._attach_moderation_trigger('post_likes',                '_tg_enforce_like');
  perform public._attach_moderation_trigger('community_post_likes',      '_tg_enforce_like');
  perform public._attach_moderation_trigger('post_comment_likes',        '_tg_enforce_like');
  perform public._attach_moderation_trigger('comment_likes',             '_tg_enforce_like');
  perform public._attach_moderation_trigger('story_likes',               '_tg_enforce_like');
  perform public._attach_moderation_trigger('story_comment_likes',       '_tg_enforce_like');
  perform public._attach_moderation_trigger('reel_likes',                '_tg_enforce_like');

  -- Reposts (treat as posts)
  perform public._attach_moderation_trigger('post_reposts',              '_tg_enforce_post');
  perform public._attach_moderation_trigger('community_post_reposts',    '_tg_enforce_post');

  -- DMs
  perform public._attach_moderation_trigger('dm_messages',               '_tg_enforce_dm');
end
$$;
