-- =====================================================================
-- Admin / Owner dashboard — full SQL foundation
-- =====================================================================
-- This migration is idempotent. Safe to re-run.
-- Owner email is hard-coded as audifyx@gmail.com (matches SOLTOOLS_ADMIN_EMAIL).
--
-- Tables created / ensured:
--   * admin_roles
--   * admin_audit_log
--   * platform_settings
--   * support_tickets, support_messages
--   * credits, credit_logs  (created if absent — most projects already have them)
--
-- RPCs created:
--   * ensure_owner_role(check_user_id, check_email)
--   * get_my_admin_role()
--   * promote_team_member(p_user_id, p_email, p_permissions)
--   * revoke_team_member(p_user_id)
--   * team_delete_story(p_story_id, p_reason)
--   * team_delete_story_comment(p_comment_id, p_reason)
--   * delete_story_comment(p_comment_id)          -- alias used by old UI
--   * admin_log(p_action, p_target_type, p_target_id, p_old, p_new)
--   * admin_broadcast_notification(p_title, p_message, p_type)
--   * admin_grant_badge(p_user_id, p_badge)
--   * admin_revoke_badge(p_user_id, p_badge_id)
--   * admin_set_user_banned(p_user_id, p_banned)
--   * admin_adjust_credits(p_user_id, p_delta, p_reason)
--   * admin_reset_all_credits(p_balance, p_cap)
--   * admin_update_setting(p_key, p_value)
--   * admin_close_support_ticket(p_ticket_id, p_status)
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------
create or replace function public._is_owner_email(p_email text)
returns boolean
language sql
immutable
as $$
  select lower(coalesce(p_email, '')) = 'audifyx@gmail.com';
$$;

create or replace function public._current_user_email()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lower(coalesce((auth.jwt() ->> 'email'), ''));
$$;

-- ---------------------------------------------------------------------
-- admin_roles
-- ---------------------------------------------------------------------
create table if not exists public.admin_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text,
  role text not null check (role in ('owner','superadmin','admin','moderator','team','support')),
  permissions jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists admin_roles_user_role_uniq
  on public.admin_roles(user_id, role);

alter table public.admin_roles enable row level security;

drop policy if exists "admin_roles_select_self_or_admin" on public.admin_roles;
create policy "admin_roles_select_self_or_admin"
  on public.admin_roles for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.admin_roles ar
      where ar.user_id = auth.uid()
        and ar.role in ('owner','superadmin','admin')
    )
    or public._is_owner_email(public._current_user_email())
  );

drop policy if exists "admin_roles_write_owner" on public.admin_roles;
create policy "admin_roles_write_owner"
  on public.admin_roles for all
  using (
    exists (
      select 1 from public.admin_roles ar
      where ar.user_id = auth.uid() and ar.role = 'owner'
    )
    or public._is_owner_email(public._current_user_email())
  )
  with check (
    exists (
      select 1 from public.admin_roles ar
      where ar.user_id = auth.uid() and ar.role = 'owner'
    )
    or public._is_owner_email(public._current_user_email())
  );

-- ---------------------------------------------------------------------
-- admin_audit_log
-- ---------------------------------------------------------------------
create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null,
  action text not null,
  target_type text,
  target_id uuid,
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_log_created_idx
  on public.admin_audit_log(created_at desc);

alter table public.admin_audit_log enable row level security;

drop policy if exists "audit_select_admin" on public.admin_audit_log;
create policy "audit_select_admin"
  on public.admin_audit_log for select
  using (
    exists (
      select 1 from public.admin_roles ar
      where ar.user_id = auth.uid()
        and ar.role in ('owner','superadmin','admin','moderator','team')
    )
    or public._is_owner_email(public._current_user_email())
  );

drop policy if exists "audit_insert_admin" on public.admin_audit_log;
create policy "audit_insert_admin"
  on public.admin_audit_log for insert
  with check (
    admin_user_id = auth.uid()
    and (
      exists (
        select 1 from public.admin_roles ar
        where ar.user_id = auth.uid()
          and ar.role in ('owner','superadmin','admin','moderator','team','support')
      )
      or public._is_owner_email(public._current_user_email())
    )
  );

-- realtime
do $$ begin
  perform 1 from pg_publication where pubname = 'supabase_realtime';
  if found then
    begin
      execute 'alter publication supabase_realtime add table public.admin_audit_log';
    exception when duplicate_object then null;
    end;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- platform_settings
-- ---------------------------------------------------------------------
create table if not exists public.platform_settings (
  id uuid primary key default gen_random_uuid(),
  key text unique not null,
  value jsonb not null default 'null'::jsonb,
  category text not null default 'general',
  description text,
  updated_at timestamptz not null default now()
);

alter table public.platform_settings enable row level security;

drop policy if exists "settings_read_all" on public.platform_settings;
create policy "settings_read_all"
  on public.platform_settings for select
  using (true);

drop policy if exists "settings_write_admin" on public.platform_settings;
create policy "settings_write_admin"
  on public.platform_settings for all
  using (
    exists (
      select 1 from public.admin_roles ar
      where ar.user_id = auth.uid()
        and ar.role in ('owner','superadmin','admin')
    )
    or public._is_owner_email(public._current_user_email())
  )
  with check (
    exists (
      select 1 from public.admin_roles ar
      where ar.user_id = auth.uid()
        and ar.role in ('owner','superadmin','admin')
    )
    or public._is_owner_email(public._current_user_email())
  );

-- seed default settings (idempotent)
insert into public.platform_settings (key, value, category, description) values
  ('feature_pump_submissions', 'true'::jsonb, 'features', 'Allow users to submit tokens to the Pump V5 launchpad.'),
  ('feature_stories', 'true'::jsonb, 'features', 'Show the stories rail on home.'),
  ('feature_reels', 'true'::jsonb, 'features', 'Enable the Reels tab.'),
  ('feature_audio_rooms', 'true'::jsonb, 'features', 'Enable live audio lobbies.'),
  ('feature_events', 'true'::jsonb, 'features', 'Show the Events tab.'),
  ('feature_fyp', 'true'::jsonb, 'features', 'Enable the For-You feed.'),
  ('feature_marketplace', 'false'::jsonb, 'features', 'Handle marketplace listings.'),
  ('moderation_strict_mode', 'false'::jsonb, 'moderation', 'Auto-hide flagged posts pending review.'),
  ('moderation_min_account_age_hours', '0'::jsonb, 'moderation', 'Block posting for accounts younger than N hours.'),
  ('credits_monthly_cap_default', '6500'::jsonb, 'credits', 'Default monthly credit cap for new users.'),
  ('credits_starting_balance', '10000'::jsonb, 'credits', 'Starting credit balance.'),
  ('launchpad_min_liquidity_usd', '5000'::jsonb, 'launchpad', 'Minimum liquidity for live tokens.'),
  ('growth_invite_reward', '500'::jsonb, 'growth', 'Credits granted to inviter on referral.'),
  ('ops_maintenance_mode', 'false'::jsonb, 'ops', 'Read-only platform mode.'),
  ('ops_announcement_banner', '""'::jsonb, 'ops', 'Global banner string. Empty = hidden.')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- credits + credit_logs (create if missing — existing schemas keep theirs)
-- ---------------------------------------------------------------------
create table if not exists public.credits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance integer not null default 10000,
  monthly_cap integer not null default 6500,
  updated_at timestamptz not null default now()
);

alter table public.credits enable row level security;

drop policy if exists "credits_self_select" on public.credits;
create policy "credits_self_select"
  on public.credits for select
  using (user_id = auth.uid() or exists (
    select 1 from public.admin_roles ar
    where ar.user_id = auth.uid()
      and ar.role in ('owner','superadmin','admin')
  ));

drop policy if exists "credits_admin_write" on public.credits;
create policy "credits_admin_write"
  on public.credits for all
  using (
    exists (
      select 1 from public.admin_roles ar
      where ar.user_id = auth.uid()
        and ar.role in ('owner','superadmin','admin')
    )
    or public._is_owner_email(public._current_user_email())
  )
  with check (
    exists (
      select 1 from public.admin_roles ar
      where ar.user_id = auth.uid()
        and ar.role in ('owner','superadmin','admin')
    )
    or public._is_owner_email(public._current_user_email())
  );

create table if not exists public.credit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  action text not null,
  cost integer not null default 0,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists credit_logs_user_idx on public.credit_logs(user_id, created_at desc);

alter table public.credit_logs enable row level security;

drop policy if exists "credit_logs_select" on public.credit_logs;
create policy "credit_logs_select"
  on public.credit_logs for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.admin_roles ar
      where ar.user_id = auth.uid()
        and ar.role in ('owner','superadmin','admin','moderator','team')
    )
  );

drop policy if exists "credit_logs_insert_self" on public.credit_logs;
create policy "credit_logs_insert_self"
  on public.credit_logs for insert
  with check (user_id = auth.uid() or exists (
    select 1 from public.admin_roles ar
    where ar.user_id = auth.uid()
      and ar.role in ('owner','superadmin','admin')
  ));

-- ---------------------------------------------------------------------
-- Support tickets + messages
-- ---------------------------------------------------------------------
create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  username text,
  subject text not null,
  body text,
  status text not null default 'open' check (status in ('open','pending','closed','spam')),
  priority text default 'normal' check (priority in ('low','normal','high','urgent')),
  assigned_to uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists support_tickets_status_idx
  on public.support_tickets(status, updated_at desc);

alter table public.support_tickets enable row level security;

drop policy if exists "tickets_select" on public.support_tickets;
create policy "tickets_select"
  on public.support_tickets for select
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.admin_roles ar
      where ar.user_id = auth.uid()
        and ar.role in ('owner','superadmin','admin','moderator','team','support')
    )
  );

drop policy if exists "tickets_insert_self" on public.support_tickets;
create policy "tickets_insert_self"
  on public.support_tickets for insert
  with check (user_id = auth.uid());

drop policy if exists "tickets_update_admin_or_self" on public.support_tickets;
create policy "tickets_update_admin_or_self"
  on public.support_tickets for update
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.admin_roles ar
      where ar.user_id = auth.uid()
        and ar.role in ('owner','superadmin','admin','moderator','team','support')
    )
  );

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  sender_id uuid not null,
  body text not null,
  is_staff boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists support_messages_ticket_idx
  on public.support_messages(ticket_id, created_at);

alter table public.support_messages enable row level security;

drop policy if exists "support_messages_select" on public.support_messages;
create policy "support_messages_select"
  on public.support_messages for select
  using (
    exists (
      select 1 from public.support_tickets t
      where t.id = ticket_id and (
        t.user_id = auth.uid()
        or exists (
          select 1 from public.admin_roles ar
          where ar.user_id = auth.uid()
            and ar.role in ('owner','superadmin','admin','moderator','team','support')
        )
      )
    )
  );

drop policy if exists "support_messages_insert" on public.support_messages;
create policy "support_messages_insert"
  on public.support_messages for insert
  with check (
    sender_id = auth.uid()
    and exists (
      select 1 from public.support_tickets t
      where t.id = ticket_id and (
        t.user_id = auth.uid()
        or exists (
          select 1 from public.admin_roles ar
          where ar.user_id = auth.uid()
            and ar.role in ('owner','superadmin','admin','moderator','team','support')
        )
      )
    )
  );

do $$ begin
  begin
    execute 'alter publication supabase_realtime add table public.support_tickets';
  exception when duplicate_object then null; end;
  begin
    execute 'alter publication supabase_realtime add table public.support_messages';
  exception when duplicate_object then null; end;
end $$;

-- =====================================================================
-- RPCs
-- =====================================================================

-- ensure_owner_role: bootstrap the owner row when the hard-coded email signs in
create or replace function public.ensure_owner_role(
  check_user_id uuid,
  check_email   text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public._is_owner_email(check_email) then
    return;
  end if;
  insert into public.admin_roles (user_id, email, role, permissions)
  values (check_user_id, lower(check_email), 'owner', '{"all":true}'::jsonb)
  on conflict (user_id, role) do update
    set email = excluded.email,
        updated_at = now();
end;
$$;
grant execute on function public.ensure_owner_role(uuid, text) to authenticated;

-- get_my_admin_role: SECURITY DEFINER so RLS can't hide caller's own row
create or replace function public.get_my_admin_role()
returns table(role text, permissions jsonb)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := public._current_user_email();
begin
  if v_uid is null then
    return;
  end if;

  -- auto-promote owner email
  if public._is_owner_email(v_email) then
    perform public.ensure_owner_role(v_uid, v_email);
  end if;

  return query
    select ar.role, coalesce(ar.permissions, '{}'::jsonb)
    from public.admin_roles ar
    where ar.user_id = v_uid
    order by case ar.role
      when 'owner' then 1
      when 'superadmin' then 2
      when 'admin' then 3
      when 'moderator' then 4
      when 'team' then 5
      when 'support' then 6
      else 9 end
    limit 1;
end;
$$;
grant execute on function public.get_my_admin_role() to authenticated;

-- promote_team_member
create or replace function public.promote_team_member(
  p_user_id uuid,
  p_email   text,
  p_permissions jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_role text;
begin
  select role into v_caller_role
  from public.admin_roles
  where user_id = auth.uid()
  order by case role
    when 'owner' then 1 when 'superadmin' then 2 when 'admin' then 3 else 9 end
  limit 1;

  if not (public._is_owner_email(public._current_user_email())
          or v_caller_role in ('owner','superadmin','admin')) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  insert into public.admin_roles (user_id, email, role, permissions)
  values (p_user_id, lower(coalesce(p_email,'')), 'team', coalesce(p_permissions,'{}'::jsonb))
  on conflict (user_id, role) do update
    set permissions = excluded.permissions,
        email       = coalesce(excluded.email, public.admin_roles.email),
        updated_at  = now();
end;
$$;
grant execute on function public.promote_team_member(uuid, text, jsonb) to authenticated;

-- revoke_team_member
create or replace function public.revoke_team_member(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_role text;
begin
  select role into v_caller_role
  from public.admin_roles
  where user_id = auth.uid()
  order by case role
    when 'owner' then 1 when 'superadmin' then 2 when 'admin' then 3 else 9 end
  limit 1;

  if not (public._is_owner_email(public._current_user_email())
          or v_caller_role in ('owner','superadmin','admin')) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  delete from public.admin_roles
   where user_id = p_user_id
     and role in ('team','moderator','support');
end;
$$;
grant execute on function public.revoke_team_member(uuid) to authenticated;

-- team_delete_story / team_delete_story_comment / delete_story_comment
create or replace function public.team_delete_story(
  p_story_id uuid,
  p_reason   text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  select role into v_role
  from public.admin_roles
  where user_id = auth.uid()
  limit 1;

  if not (public._is_owner_email(public._current_user_email())
          or v_role in ('owner','superadmin','admin','moderator','team')) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  delete from public.stories where id = p_story_id;

  insert into public.admin_audit_log(admin_user_id, action, target_type, target_id, new_values)
  values (auth.uid(), 'team_delete_story', 'story', p_story_id,
          jsonb_build_object('reason', p_reason));
end;
$$;
grant execute on function public.team_delete_story(uuid, text) to authenticated;

create or replace function public.team_delete_story_comment(
  p_comment_id uuid,
  p_reason     text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  select role into v_role
  from public.admin_roles
  where user_id = auth.uid()
  limit 1;

  if not (public._is_owner_email(public._current_user_email())
          or v_role in ('owner','superadmin','admin','moderator','team')) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  delete from public.story_comments where id = p_comment_id;

  insert into public.admin_audit_log(admin_user_id, action, target_type, target_id, new_values)
  values (auth.uid(), 'team_delete_story_comment', 'story_comment', p_comment_id,
          jsonb_build_object('reason', p_reason));
end;
$$;
grant execute on function public.team_delete_story_comment(uuid, text) to authenticated;

create or replace function public.delete_story_comment(p_comment_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  select public.team_delete_story_comment(p_comment_id, null);
$$;
grant execute on function public.delete_story_comment(uuid) to authenticated;

-- admin_log: insert audit log entry (used as fallback by client code)
create or replace function public.admin_log(
  p_action text,
  p_target_type text,
  p_target_id uuid,
  p_old jsonb,
  p_new jsonb
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  insert into public.admin_audit_log(admin_user_id, action, target_type, target_id, old_values, new_values)
    values (auth.uid(), p_action, p_target_type, p_target_id, p_old, p_new)
    returning id into v_id;
  return v_id;
end;
$$;
grant execute on function public.admin_log(text, text, uuid, jsonb, jsonb) to authenticated;

-- admin_broadcast_notification: bulk-insert into notifications for all profiles
create or replace function public.admin_broadcast_notification(
  p_title text,
  p_message text,
  p_type text
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_count integer := 0;
begin
  select role into v_role from public.admin_roles where user_id = auth.uid() limit 1;
  if not (public._is_owner_email(public._current_user_email())
          or v_role in ('owner','superadmin','admin')) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  insert into public.notifications (user_id, type, title, message, body, data)
  select coalesce(p.user_id, p.id), coalesce(p_type,'announcement'),
         p_title, p_message, p_message,
         jsonb_build_object('source','admin','broadcast', true)
  from public.profiles p
  where coalesce(p.user_id, p.id) is not null;

  get diagnostics v_count = row_count;

  insert into public.admin_audit_log(admin_user_id, action, target_type, new_values)
  values (auth.uid(), 'broadcast_announcement', 'notification',
          jsonb_build_object('count', v_count, 'type', p_type, 'title', p_title));

  return v_count;
end;
$$;
grant execute on function public.admin_broadcast_notification(text, text, text) to authenticated;

-- admin_grant_badge / admin_revoke_badge
create or replace function public.admin_grant_badge(
  p_user_id uuid,
  p_badge   jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_current jsonb;
  v_id text;
  v_next jsonb;
begin
  select role into v_role from public.admin_roles where user_id = auth.uid() limit 1;
  if not (public._is_owner_email(public._current_user_email())
          or v_role in ('owner','superadmin','admin','moderator')) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  v_id := coalesce(p_badge->>'id','');
  if v_id = '' then raise exception 'invalid_badge'; end if;

  select coalesce(custom_badges, '[]'::jsonb) into v_current
  from public.profiles
  where user_id = p_user_id or id = p_user_id
  limit 1;

  v_next := (
    select coalesce(jsonb_agg(elem), '[]'::jsonb)
    from jsonb_array_elements(coalesce(v_current,'[]'::jsonb)) elem
    where (elem->>'id') is distinct from v_id
  ) || jsonb_build_array(p_badge);

  update public.profiles
     set custom_badges = v_next,
         updated_at = now()
   where user_id = p_user_id or id = p_user_id;

  insert into public.admin_audit_log(admin_user_id, action, target_type, target_id, new_values)
  values (auth.uid(), 'grant_badge', 'user', p_user_id, p_badge);
end;
$$;
grant execute on function public.admin_grant_badge(uuid, jsonb) to authenticated;

create or replace function public.admin_revoke_badge(
  p_user_id uuid,
  p_badge_id text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_current jsonb;
  v_next jsonb;
begin
  select role into v_role from public.admin_roles where user_id = auth.uid() limit 1;
  if not (public._is_owner_email(public._current_user_email())
          or v_role in ('owner','superadmin','admin','moderator')) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select coalesce(custom_badges, '[]'::jsonb) into v_current
  from public.profiles
  where user_id = p_user_id or id = p_user_id
  limit 1;

  v_next := (
    select coalesce(jsonb_agg(elem), '[]'::jsonb)
    from jsonb_array_elements(coalesce(v_current,'[]'::jsonb)) elem
    where (elem->>'id') is distinct from p_badge_id
  );

  update public.profiles
     set custom_badges = v_next,
         updated_at = now()
   where user_id = p_user_id or id = p_user_id;

  insert into public.admin_audit_log(admin_user_id, action, target_type, target_id, new_values)
  values (auth.uid(), 'revoke_badge', 'user', p_user_id,
          jsonb_build_object('badge_id', p_badge_id));
end;
$$;
grant execute on function public.admin_revoke_badge(uuid, text) to authenticated;

-- admin_set_user_banned
create or replace function public.admin_set_user_banned(
  p_user_id uuid,
  p_banned  boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  select role into v_role from public.admin_roles where user_id = auth.uid() limit 1;
  if not (public._is_owner_email(public._current_user_email())
          or v_role in ('owner','superadmin','admin','moderator','team')) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  update public.profiles
     set is_banned = p_banned,
         is_public = (not p_banned),
         updated_at = now()
   where user_id = p_user_id or id = p_user_id;

  insert into public.admin_audit_log(admin_user_id, action, target_type, target_id, new_values)
  values (auth.uid(),
          case when p_banned then 'ban_user' else 'unban_user' end,
          'user', p_user_id,
          jsonb_build_object('is_banned', p_banned));
end;
$$;
grant execute on function public.admin_set_user_banned(uuid, boolean) to authenticated;

-- admin_adjust_credits
create or replace function public.admin_adjust_credits(
  p_user_id uuid,
  p_delta   integer,
  p_reason  text
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_prev integer;
  v_next integer;
begin
  select role into v_role from public.admin_roles where user_id = auth.uid() limit 1;
  if not (public._is_owner_email(public._current_user_email())
          or v_role in ('owner','superadmin','admin')) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  insert into public.credits(user_id, balance, monthly_cap)
  values (p_user_id, 10000, 6500)
  on conflict (user_id) do nothing;

  select balance into v_prev from public.credits where user_id = p_user_id;
  v_next := greatest(0, coalesce(v_prev,0) + p_delta);

  update public.credits
     set balance = v_next, updated_at = now()
   where user_id = p_user_id;

  insert into public.credit_logs(user_id, action, cost, metadata)
  values (p_user_id, coalesce(p_reason,'admin_adjust'), -p_delta,
          jsonb_build_object('admin_id', auth.uid(), 'delta', p_delta));

  insert into public.admin_audit_log(admin_user_id, action, target_type, target_id, old_values, new_values)
  values (auth.uid(), 'adjust_credits', 'user', p_user_id,
          jsonb_build_object('balance', v_prev),
          jsonb_build_object('balance', v_next, 'delta', p_delta));

  return v_next;
end;
$$;
grant execute on function public.admin_adjust_credits(uuid, integer, text) to authenticated;

-- admin_reset_all_credits
create or replace function public.admin_reset_all_credits(
  p_balance integer,
  p_cap     integer
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_count integer;
begin
  select role into v_role from public.admin_roles where user_id = auth.uid() limit 1;
  if not (public._is_owner_email(public._current_user_email())
          or v_role in ('owner','superadmin')) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  update public.credits
     set balance = p_balance,
         monthly_cap = p_cap,
         updated_at = now();
  get diagnostics v_count = row_count;

  insert into public.admin_audit_log(admin_user_id, action, target_type, new_values)
  values (auth.uid(), 'reset_all_credits', 'credits',
          jsonb_build_object('balance', p_balance, 'cap', p_cap, 'rows', v_count));

  return v_count;
end;
$$;
grant execute on function public.admin_reset_all_credits(integer, integer) to authenticated;

-- admin_update_setting
create or replace function public.admin_update_setting(
  p_key   text,
  p_value jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_prev jsonb;
begin
  select role into v_role from public.admin_roles where user_id = auth.uid() limit 1;
  if not (public._is_owner_email(public._current_user_email())
          or v_role in ('owner','superadmin','admin')) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select value into v_prev from public.platform_settings where key = p_key;

  insert into public.platform_settings(key, value, category, description)
  values (p_key, p_value, 'general', null)
  on conflict (key) do update
    set value = excluded.value,
        updated_at = now();

  insert into public.admin_audit_log(admin_user_id, action, target_type, old_values, new_values)
  values (auth.uid(), 'update_platform_setting', 'setting',
          jsonb_build_object('key', p_key, 'value', v_prev),
          jsonb_build_object('key', p_key, 'value', p_value));
end;
$$;
grant execute on function public.admin_update_setting(text, jsonb) to authenticated;

-- admin_close_support_ticket
create or replace function public.admin_close_support_ticket(
  p_ticket_id uuid,
  p_status    text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_prev text;
begin
  select role into v_role from public.admin_roles where user_id = auth.uid() limit 1;
  if not (public._is_owner_email(public._current_user_email())
          or v_role in ('owner','superadmin','admin','moderator','team','support')) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select status into v_prev from public.support_tickets where id = p_ticket_id;

  update public.support_tickets
     set status = coalesce(p_status,'closed'),
         updated_at = now()
   where id = p_ticket_id;

  insert into public.admin_audit_log(admin_user_id, action, target_type, target_id, old_values, new_values)
  values (auth.uid(), 'update_support_ticket', 'support_ticket', p_ticket_id,
          jsonb_build_object('status', v_prev),
          jsonb_build_object('status', p_status));
end;
$$;
grant execute on function public.admin_close_support_ticket(uuid, text) to authenticated;

commit;

-- =====================================================================
-- Done.
-- After applying:
--   1. Sign in as audifyx@gmail.com — `ensure_owner_role` will bootstrap the row.
--   2. Open /admin to verify roles, badges, credits, settings, support, audit log.
--   3. Open /owner for the full Command Center (owner-locked).
-- =====================================================================
