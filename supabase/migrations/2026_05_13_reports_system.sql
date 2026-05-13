-- =====================================================================
-- 2026-05-13 · Unified reports system
-- =====================================================================
-- Adds a single, categorised reports queue that any user can write to
-- and the moderation team can resolve. Supports reports on:
--   • posts (community_posts)
--   • comments (community_posts where parent_post_id is set)
--   • reels
--   • stories
--   • story_comments
--   • users
--   • tokens (Solana contract address or symbol)
--   • communities
--
-- Extends the existing `user_reports` table (target_user_id / target_post_id
-- / target_reel_id) with new target columns + a structured `target_type` /
-- `category` taxonomy. Ships:
--   • submit_report() RPC for clients
--   • team_resolve_report(p_report_id, p_status, p_notes) (compat)
--   • team_resolve_report_v2(p_report_id, p_status, p_notes, p_action)
--   • team_delete_token / team_delete_community / team_delete_reel
--   • View team_report_counts for the dashboard
--
-- Idempotent — safe to re-run.
-- =====================================================================

set local search_path = public;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. Defensive: ensure user_reports table exists with the legacy shape.
-- ---------------------------------------------------------------------
create table if not exists public.user_reports (
  id              uuid primary key default gen_random_uuid(),
  reporter_id     uuid references auth.users(id) on delete set null,
  target_user_id  uuid,
  target_post_id  uuid,
  target_reel_id  uuid,
  reason          text not null default 'other',
  details         text,
  status          text not null default 'open',
  resolver_id     uuid,
  resolver_notes  text,
  resolved_at     timestamptz,
  created_at      timestamptz not null default now()
);

-- 2. Extend with category, type, and new targets
alter table public.user_reports add column if not exists target_type text;
alter table public.user_reports add column if not exists category text;
alter table public.user_reports add column if not exists target_comment_id uuid;
alter table public.user_reports add column if not exists target_story_id uuid;
alter table public.user_reports add column if not exists target_story_comment_id uuid;
alter table public.user_reports add column if not exists target_community_id uuid;
alter table public.user_reports add column if not exists target_token text;
alter table public.user_reports add column if not exists action_taken text;

create index if not exists user_reports_target_type_status_idx
  on public.user_reports (target_type, status, created_at desc);
create index if not exists user_reports_category_idx
  on public.user_reports (category, created_at desc);
create index if not exists user_reports_status_created_idx
  on public.user_reports (status, created_at desc);
create index if not exists user_reports_token_idx
  on public.user_reports (target_token) where target_token is not null;

alter table public.user_reports enable row level security;

drop policy if exists "user_reports_insert_authenticated" on public.user_reports;
create policy "user_reports_insert_authenticated"
  on public.user_reports
  for insert
  to authenticated
  with check (auth.uid() = reporter_id);

drop policy if exists "user_reports_select_self" on public.user_reports;
create policy "user_reports_select_self"
  on public.user_reports
  for select
  using (auth.uid() = reporter_id);

drop policy if exists "user_reports_select_team" on public.user_reports;
create policy "user_reports_select_team"
  on public.user_reports
  for select
  using (
    exists (
      select 1 from public.admin_roles ar
      where ar.user_id = auth.uid()
        and ar.role in ('owner', 'superadmin', 'admin', 'moderator', 'team', 'support')
    )
  );

drop policy if exists "user_reports_update_team" on public.user_reports;
create policy "user_reports_update_team"
  on public.user_reports
  for update
  using (
    exists (
      select 1 from public.admin_roles ar
      where ar.user_id = auth.uid()
        and ar.role in ('owner', 'superadmin', 'admin', 'moderator', 'team')
    )
  );

-- ---------------------------------------------------------------------
-- 3. Helper: _is_team() (defensive)
-- ---------------------------------------------------------------------
create or replace function public._is_team_member(p_user uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.admin_roles ar
    where ar.user_id = p_user
      and ar.role in ('owner', 'superadmin', 'admin', 'moderator', 'team')
  );
$$;

grant execute on function public._is_team_member(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 4. submit_report — universal client-facing RPC
-- ---------------------------------------------------------------------
create or replace function public.submit_report(
  p_target_type text,
  p_target_id text,
  p_category text default 'other',
  p_details text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_report_id uuid;
  v_post uuid;
  v_reel uuid;
  v_story uuid;
  v_story_comment uuid;
  v_user uuid;
  v_community uuid;
  v_comment uuid;
  v_token text;
  v_kind text := lower(coalesce(p_target_type, ''));
  v_cat text := coalesce(nullif(trim(p_category), ''), 'other');
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if p_target_id is null or length(trim(p_target_id)) = 0 then
    raise exception 'target_id required';
  end if;

  case v_kind
    when 'post' then v_post := p_target_id::uuid;
    when 'comment' then v_comment := p_target_id::uuid;
    when 'reel' then v_reel := p_target_id::uuid;
    when 'story' then v_story := p_target_id::uuid;
    when 'story_comment' then v_story_comment := p_target_id::uuid;
    when 'user' then v_user := p_target_id::uuid;
    when 'community' then v_community := p_target_id::uuid;
    when 'token' then v_token := trim(p_target_id);
    else raise exception 'invalid target_type: %', p_target_type;
  end case;

  insert into public.user_reports (
    reporter_id, target_type, category,
    target_user_id, target_post_id, target_comment_id, target_reel_id,
    target_story_id, target_story_comment_id, target_community_id, target_token,
    reason, details, status
  ) values (
    v_uid, v_kind, v_cat,
    v_user, v_post, v_comment, v_reel,
    v_story, v_story_comment, v_community, v_token,
    v_cat, nullif(trim(coalesce(p_details, '')), ''), 'open'
  )
  returning id into v_report_id;

  return v_report_id;
end;
$$;

grant execute on function public.submit_report(text, text, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 5. team_resolve_report — primary resolver (extends legacy 3-arg signature)
-- ---------------------------------------------------------------------
create or replace function public.team_resolve_report(
  p_report_id uuid,
  p_status text,
  p_notes text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if not public._is_team_member(v_uid) then
    raise exception 'forbidden: team membership required';
  end if;
  if p_status not in ('open', 'reviewing', 'resolved', 'dismissed', 'actioned') then
    raise exception 'invalid status: %', p_status;
  end if;

  update public.user_reports
     set status = p_status,
         resolver_id = v_uid,
         resolver_notes = nullif(trim(coalesce(p_notes, '')), ''),
         resolved_at = case when p_status in ('resolved','dismissed','actioned') then now() else null end
   where id = p_report_id;

  -- Best-effort audit log
  begin
    perform public._team_log(v_uid, 'team_resolve_report', 'report', p_report_id::text,
      jsonb_build_object('status', p_status, 'notes', p_notes));
  exception when undefined_function then null;
  end;
end;
$$;

grant execute on function public.team_resolve_report(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 6. team_delete_post (defensive: idempotent recreate)
-- ---------------------------------------------------------------------
create or replace function public.team_delete_post(
  p_post_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if not public._is_team_member(v_uid) then
    raise exception 'forbidden: team membership required';
  end if;

  delete from public.community_posts where id = p_post_id;

  begin
    perform public._team_log(v_uid, 'team_delete_post', 'post', p_post_id::text,
      jsonb_build_object('reason', p_reason));
  exception when undefined_function then null;
  end;
end;
$$;

grant execute on function public.team_delete_post(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 7. team_delete_reel (defensive)
-- ---------------------------------------------------------------------
create or replace function public.team_delete_reel(
  p_reel_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if not public._is_team_member(v_uid) then
    raise exception 'forbidden: team membership required';
  end if;

  delete from public.reels where id = p_reel_id;

  begin
    perform public._team_log(v_uid, 'team_delete_reel', 'reel', p_reel_id::text,
      jsonb_build_object('reason', p_reason));
  exception when undefined_function then null;
  end;
end;
$$;

grant execute on function public.team_delete_reel(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 8. team_delete_token — removes a token submission / listing
-- ---------------------------------------------------------------------
create or replace function public.team_delete_token(
  p_token text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_addr text := trim(coalesce(p_token, ''));
begin
  if not public._is_team_member(v_uid) then
    raise exception 'forbidden: team membership required';
  end if;
  if length(v_addr) = 0 then
    raise exception 'token address required';
  end if;

  begin
    delete from public.pump_v5_submissions
     where contract_address = v_addr or symbol = v_addr;
  exception when undefined_table then null;
  end;

  begin
    delete from public.tracked_tokens
     where contract_address = v_addr or symbol = v_addr;
  exception when undefined_table then null;
  end;

  begin
    perform public._team_log(v_uid, 'team_delete_token', 'token', v_addr,
      jsonb_build_object('reason', p_reason));
  exception when undefined_function then null;
  end;
end;
$$;

grant execute on function public.team_delete_token(text, text) to authenticated;

-- ---------------------------------------------------------------------
-- 9. team_delete_community
-- ---------------------------------------------------------------------
create or replace function public.team_delete_community(
  p_community_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if not public._is_team_member(v_uid) then
    raise exception 'forbidden: team membership required';
  end if;

  delete from public.communities where id = p_community_id;

  begin
    perform public._team_log(v_uid, 'team_delete_community', 'community', p_community_id::text,
      jsonb_build_object('reason', p_reason));
  exception when undefined_function then null;
  end;
end;
$$;

grant execute on function public.team_delete_community(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- 10. Reports counts view — for admin overview tiles
-- ---------------------------------------------------------------------
create or replace view public.team_report_counts as
select
  coalesce(target_type, 'other') as target_type,
  status,
  count(*)::int as total
from public.user_reports
group by target_type, status;

grant select on public.team_report_counts to authenticated;

-- ---------------------------------------------------------------------
-- 11. Convenience: list_reports — read with filters (team only)
-- ---------------------------------------------------------------------
create or replace function public.list_reports(
  p_target_type text default null,
  p_status text default null,
  p_max integer default 200
)
returns setof public.user_reports
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if not public._is_team_member(auth.uid()) then
    raise exception 'forbidden: team membership required';
  end if;

  return query
  select *
    from public.user_reports r
   where (p_target_type is null or r.target_type = p_target_type)
     and (p_status is null or r.status = p_status)
   order by r.created_at desc
   limit greatest(coalesce(p_max, 200), 1);
end;
$$;

grant execute on function public.list_reports(text, text, integer) to authenticated;
