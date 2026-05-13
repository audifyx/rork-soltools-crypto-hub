-- =====================================================================
-- 2026-05-13 · Moderation v2
-- =====================================================================
-- Comprehensive ban / suspend / limit system on top of the existing
-- team-role model. Adds:
--   • Profile-level state columns: is_banned, ban_expires_at, ban_reason,
--     is_suspended, suspend_expires_at, suspend_reason,
--     can_post / can_comment / can_like / can_dm + limit_expires_at
--   • History tables: user_moderation_events
--   • RPCs (security definer, team-gated):
--       team_ban_user(p_user_id, p_reason, p_hours)
--       team_unban_user(p_user_id)
--       team_suspend_user(p_user_id, p_hours, p_reason)
--       team_unsuspend_user(p_user_id)
--       team_limit_user(p_user_id, p_can_post, p_can_comment,
--                       p_can_like, p_can_dm, p_hours, p_reason)
--       team_clear_limits(p_user_id)
--       expire_moderation_state()  (auto-clears expired bans/suspensions)
--   • Self-readable RPC: get_my_moderation_status()
--
-- Idempotent — safe to re-run. Requires:
--   • public.profiles
--   • public._team_can(uuid,text)  (from team-roles migrations)
--   • public._team_log(uuid,text,text,text,jsonb)
-- =====================================================================

set local search_path = public;

-- ---------------------------------------------------------------------
-- 1. Profile state columns
-- ---------------------------------------------------------------------

alter table public.profiles add column if not exists is_banned boolean not null default false;
alter table public.profiles add column if not exists ban_expires_at timestamptz;
alter table public.profiles add column if not exists ban_reason text;
alter table public.profiles add column if not exists banned_at timestamptz;

alter table public.profiles add column if not exists is_suspended boolean not null default false;
alter table public.profiles add column if not exists suspend_expires_at timestamptz;
alter table public.profiles add column if not exists suspend_reason text;
alter table public.profiles add column if not exists suspended_at timestamptz;

alter table public.profiles add column if not exists can_post boolean not null default true;
alter table public.profiles add column if not exists can_comment boolean not null default true;
alter table public.profiles add column if not exists can_like boolean not null default true;
alter table public.profiles add column if not exists can_dm boolean not null default true;
alter table public.profiles add column if not exists limit_expires_at timestamptz;
alter table public.profiles add column if not exists limit_reason text;

create index if not exists profiles_is_banned_idx on public.profiles (is_banned) where is_banned = true;
create index if not exists profiles_is_suspended_idx on public.profiles (is_suspended) where is_suspended = true;
create index if not exists profiles_ban_expires_idx on public.profiles (ban_expires_at) where ban_expires_at is not null;
create index if not exists profiles_suspend_expires_idx on public.profiles (suspend_expires_at) where suspend_expires_at is not null;
create index if not exists profiles_limit_expires_idx on public.profiles (limit_expires_at) where limit_expires_at is not null;

-- ---------------------------------------------------------------------
-- 2. Moderation events history (audit trail)
-- ---------------------------------------------------------------------

create table if not exists public.user_moderation_events (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null,
  action       text not null,        -- ban / unban / suspend / unsuspend / limit / clear_limits
  reason       text,
  duration_hours integer,            -- null = permanent
  expires_at   timestamptz,
  metadata     jsonb,
  moderator_id uuid,
  created_at   timestamptz not null default now()
);

create index if not exists user_moderation_events_user_idx on public.user_moderation_events (user_id, created_at desc);
create index if not exists user_moderation_events_action_idx on public.user_moderation_events (action, created_at desc);

alter table public.user_moderation_events enable row level security;

drop policy if exists "moderation events self read" on public.user_moderation_events;
create policy "moderation events self read"
  on public.user_moderation_events
  for select
  using (auth.uid() = user_id);

drop policy if exists "moderation events team read" on public.user_moderation_events;
create policy "moderation events team read"
  on public.user_moderation_events
  for select
  using (public._team_can(auth.uid(), 'view_analytics'));

-- ---------------------------------------------------------------------
-- 3. Internal helpers
-- ---------------------------------------------------------------------

create or replace function public._compute_expiry(p_hours integer)
returns timestamptz
language sql
immutable
as $$
  select case when p_hours is null or p_hours <= 0 then null else now() + make_interval(hours => p_hours) end;
$$;

-- ---------------------------------------------------------------------
-- 4. team_ban_user — permanent or timed
-- ---------------------------------------------------------------------

create or replace function public.team_ban_user(
  p_user_id uuid,
  p_reason text default null,
  p_hours integer default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_expires timestamptz;
begin
  if not public._team_can(v_uid, 'ban_users') then
    raise exception 'forbidden: missing ban_users permission';
  end if;
  if p_user_id is null then
    raise exception 'user_id required';
  end if;

  v_expires := public._compute_expiry(p_hours);

  update public.profiles
     set is_banned = true,
         banned_at = now(),
         ban_expires_at = v_expires,
         ban_reason = nullif(trim(coalesce(p_reason, '')), ''),
         is_public = false,
         updated_at = now()
   where user_id = p_user_id or id = p_user_id;

  insert into public.user_moderation_events (user_id, action, reason, duration_hours, expires_at, moderator_id)
  values (p_user_id, 'ban', p_reason, p_hours, v_expires, v_uid);

  perform public._team_log(
    v_uid,
    'team_ban_user',
    'user',
    p_user_id::text,
    jsonb_build_object('reason', p_reason, 'hours', p_hours, 'expires_at', v_expires)
  );
end;
$$;

grant execute on function public.team_ban_user(uuid, text, integer) to authenticated;

-- Backward-compat overload (single-arg) — keeps older callers working.
create or replace function public.team_ban_user(p_user_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  select public.team_ban_user(p_user_id, null::text, null::integer);
$$;

grant execute on function public.team_ban_user(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 5. team_unban_user
-- ---------------------------------------------------------------------

create or replace function public.team_unban_user(
  p_user_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if not public._team_can(v_uid, 'ban_users') then
    raise exception 'forbidden: missing ban_users permission';
  end if;

  update public.profiles
     set is_banned = false,
         ban_expires_at = null,
         ban_reason = null,
         banned_at = null,
         is_public = true,
         updated_at = now()
   where user_id = p_user_id or id = p_user_id;

  insert into public.user_moderation_events (user_id, action, moderator_id)
  values (p_user_id, 'unban', v_uid);

  perform public._team_log(v_uid, 'team_unban_user', 'user', p_user_id::text, null);
end;
$$;

grant execute on function public.team_unban_user(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 6. team_suspend_user — can log in but blocked from actions
-- ---------------------------------------------------------------------

create or replace function public.team_suspend_user(
  p_user_id uuid,
  p_hours integer default null,
  p_reason text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_expires timestamptz;
begin
  if not public._team_can(v_uid, 'suspend_users') then
    raise exception 'forbidden: missing suspend_users permission';
  end if;

  v_expires := public._compute_expiry(p_hours);

  update public.profiles
     set is_suspended = true,
         suspend_expires_at = v_expires,
         suspend_reason = nullif(trim(coalesce(p_reason, '')), ''),
         suspended_at = now(),
         can_post = false,
         can_comment = false,
         can_like = false,
         can_dm = false,
         updated_at = now()
   where user_id = p_user_id or id = p_user_id;

  insert into public.user_moderation_events (user_id, action, reason, duration_hours, expires_at, moderator_id)
  values (p_user_id, 'suspend', p_reason, p_hours, v_expires, v_uid);

  perform public._team_log(
    v_uid,
    'team_suspend_user',
    'user',
    p_user_id::text,
    jsonb_build_object('reason', p_reason, 'hours', p_hours, 'expires_at', v_expires)
  );
end;
$$;

grant execute on function public.team_suspend_user(uuid, integer, text) to authenticated;

-- ---------------------------------------------------------------------
-- 7. team_unsuspend_user — restores full action permissions
-- ---------------------------------------------------------------------

create or replace function public.team_unsuspend_user(
  p_user_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if not public._team_can(v_uid, 'suspend_users') then
    raise exception 'forbidden: missing suspend_users permission';
  end if;

  update public.profiles
     set is_suspended = false,
         suspend_expires_at = null,
         suspend_reason = null,
         suspended_at = null,
         can_post = true,
         can_comment = true,
         can_like = true,
         can_dm = true,
         limit_expires_at = null,
         limit_reason = null,
         updated_at = now()
   where user_id = p_user_id or id = p_user_id;

  insert into public.user_moderation_events (user_id, action, moderator_id)
  values (p_user_id, 'unsuspend', v_uid);

  perform public._team_log(v_uid, 'team_unsuspend_user', 'user', p_user_id::text, null);
end;
$$;

grant execute on function public.team_unsuspend_user(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 8. team_limit_user — granular per-action limits, time-based
-- ---------------------------------------------------------------------

create or replace function public.team_limit_user(
  p_user_id uuid,
  p_can_post boolean default true,
  p_can_comment boolean default true,
  p_can_like boolean default true,
  p_can_dm boolean default true,
  p_hours integer default 24,
  p_reason text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_expires timestamptz;
begin
  if not public._team_can(v_uid, 'limit_users') then
    raise exception 'forbidden: missing limit_users permission';
  end if;

  v_expires := public._compute_expiry(p_hours);

  update public.profiles
     set can_post = coalesce(p_can_post, true),
         can_comment = coalesce(p_can_comment, true),
         can_like = coalesce(p_can_like, true),
         can_dm = coalesce(p_can_dm, true),
         limit_expires_at = v_expires,
         limit_reason = nullif(trim(coalesce(p_reason, '')), ''),
         updated_at = now()
   where user_id = p_user_id or id = p_user_id;

  insert into public.user_moderation_events (user_id, action, reason, duration_hours, expires_at, moderator_id, metadata)
  values (
    p_user_id, 'limit', p_reason, p_hours, v_expires, v_uid,
    jsonb_build_object('can_post', p_can_post, 'can_comment', p_can_comment, 'can_like', p_can_like, 'can_dm', p_can_dm)
  );

  perform public._team_log(
    v_uid,
    'team_limit_user',
    'user',
    p_user_id::text,
    jsonb_build_object('can_post', p_can_post, 'can_comment', p_can_comment, 'can_like', p_can_like, 'can_dm', p_can_dm, 'hours', p_hours, 'reason', p_reason)
  );
end;
$$;

grant execute on function public.team_limit_user(uuid, boolean, boolean, boolean, boolean, integer, text) to authenticated;

-- Backward-compat overload (no like flag).
create or replace function public.team_limit_user(
  p_user_id uuid,
  p_can_post boolean,
  p_can_comment boolean,
  p_can_dm boolean,
  p_reason text,
  p_hours integer
) returns void
language sql
security definer
set search_path = public
as $$
  select public.team_limit_user(p_user_id, p_can_post, p_can_comment, true, p_can_dm, p_hours, p_reason);
$$;

grant execute on function public.team_limit_user(uuid, boolean, boolean, boolean, text, integer) to authenticated;

-- ---------------------------------------------------------------------
-- 9. team_clear_limits — restore all action permissions
-- ---------------------------------------------------------------------

create or replace function public.team_clear_limits(
  p_user_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if not public._team_can(v_uid, 'limit_users') then
    raise exception 'forbidden: missing limit_users permission';
  end if;

  update public.profiles
     set can_post = true,
         can_comment = true,
         can_like = true,
         can_dm = true,
         limit_expires_at = null,
         limit_reason = null,
         updated_at = now()
   where user_id = p_user_id or id = p_user_id;

  insert into public.user_moderation_events (user_id, action, moderator_id)
  values (p_user_id, 'clear_limits', v_uid);

  perform public._team_log(v_uid, 'team_clear_limits', 'user', p_user_id::text, null);
end;
$$;

grant execute on function public.team_clear_limits(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 10. expire_moderation_state — auto-clears expired bans / suspensions
--      Safe to invoke on any client read; runs cheap when nothing expired.
-- ---------------------------------------------------------------------

create or replace function public.expire_moderation_state()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Expire bans
  update public.profiles
     set is_banned = false,
         ban_expires_at = null,
         ban_reason = null,
         banned_at = null,
         is_public = true,
         updated_at = now()
   where is_banned = true
     and ban_expires_at is not null
     and ban_expires_at <= now();

  -- Expire suspensions (also restores action permissions)
  update public.profiles
     set is_suspended = false,
         suspend_expires_at = null,
         suspend_reason = null,
         suspended_at = null,
         can_post = true,
         can_comment = true,
         can_like = true,
         can_dm = true,
         updated_at = now()
   where is_suspended = true
     and suspend_expires_at is not null
     and suspend_expires_at <= now();

  -- Expire granular limits
  update public.profiles
     set can_post = true,
         can_comment = true,
         can_like = true,
         can_dm = true,
         limit_expires_at = null,
         limit_reason = null,
         updated_at = now()
   where limit_expires_at is not null
     and limit_expires_at <= now()
     and is_suspended = false;
end;
$$;

grant execute on function public.expire_moderation_state() to authenticated, anon;

-- ---------------------------------------------------------------------
-- 11. get_my_moderation_status — self-readable, auto-expires first
-- ---------------------------------------------------------------------

drop function if exists public.get_my_moderation_status();

create or replace function public.get_my_moderation_status()
returns table (
  is_banned boolean,
  ban_expires_at timestamptz,
  ban_reason text,
  banned_at timestamptz,
  is_suspended boolean,
  suspend_expires_at timestamptz,
  suspend_reason text,
  suspended_at timestamptz,
  can_post boolean,
  can_comment boolean,
  can_like boolean,
  can_dm boolean,
  limit_expires_at timestamptz,
  limit_reason text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    return;
  end if;

  perform public.expire_moderation_state();

  return query
  select
    coalesce(p.is_banned, false),
    p.ban_expires_at,
    p.ban_reason,
    p.banned_at,
    coalesce(p.is_suspended, false),
    p.suspend_expires_at,
    p.suspend_reason,
    p.suspended_at,
    coalesce(p.can_post, true),
    coalesce(p.can_comment, true),
    coalesce(p.can_like, true),
    coalesce(p.can_dm, true),
    p.limit_expires_at,
    p.limit_reason
  from public.profiles p
  where p.user_id = v_uid or p.id = v_uid
  limit 1;
end;
$$;

grant execute on function public.get_my_moderation_status() to authenticated;
