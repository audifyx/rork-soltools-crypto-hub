-- =====================================================================
-- 2026-05-13 · Team role + moderator dashboard
-- =====================================================================
-- Adds a 'team' role tier on top of admin_roles so the owner can promote
-- trusted users into a moderation team with fine-grained permissions.
-- Ships RPCs for: promote/revoke/update permissions, post & reel
-- moderation, ban / suspend / limit, report triage, online users,
-- and a small analytics view. Idempotent — safe to re-run.
-- =====================================================================

-- 1. Ensure admin_roles exists (defensive — created by earlier migration)
create table if not exists public.admin_roles (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  email       text,
  role        text not null default 'admin',
  permissions jsonb,
  created_at  timestamptz not null default now(),
  unique (user_id)
);

alter table public.admin_roles add column if not exists permissions jsonb;
alter table public.admin_roles add column if not exists granted_by uuid references auth.users(id) on delete set null;
alter table public.admin_roles add column if not exists updated_at timestamptz not null default now();

-- 2. ensure_owner_role: idempotent self-promotion for the bootstrap owner
create or replace function public.ensure_owner_role(check_user_id uuid, check_email text)
returns void language plpgsql security definer as $$
begin
  if lower(coalesce(check_email,'')) <> 'audifyx@gmail.com' then
    return;
  end if;
  insert into public.admin_roles(user_id, email, role)
    values (check_user_id, lower(check_email), 'owner')
    on conflict (user_id) do update set role = 'owner', email = lower(check_email), updated_at = now();
end $$;

-- 3. Default permission set for the team role
create or replace function public.default_team_permissions()
returns jsonb language sql immutable as $$
  select jsonb_build_object(
    'delete_posts',  true,
    'delete_reels',  true,
    'ban_users',     true,
    'suspend_users', true,
    'limit_users',   true,
    'resolve_reports', true,
    'view_online',   true,
    'view_analytics', true
  );
$$;

-- 4. Permission helpers ------------------------------------------------
create or replace function public.current_user_admin_role()
returns text language sql stable security definer as $$
  select role from public.admin_roles where user_id = auth.uid() limit 1;
$$;

create or replace function public.current_user_is_admin()
returns boolean language sql stable security definer as $$
  select exists (
    select 1
    from public.admin_roles ar
    where ar.user_id = auth.uid()
      and ar.role in ('owner','superadmin','admin','moderator','team')
  );
$$;

create or replace function public.current_user_is_team()
returns boolean language sql stable security definer as $$
  select exists (
    select 1
    from public.admin_roles ar
    where ar.user_id = auth.uid()
      and ar.role in ('owner','superadmin','admin','moderator','team')
  );
$$;

create or replace function public.current_user_is_owner()
returns boolean language sql stable security definer as $$
  select exists (
    select 1
    from public.admin_roles ar
    where ar.user_id = auth.uid() and ar.role = 'owner'
  );
$$;

create or replace function public.team_has_permission(p_key text)
returns boolean language plpgsql stable security definer as $$
declare
  v_role text;
  v_perms jsonb;
begin
  select role, permissions into v_role, v_perms
    from public.admin_roles where user_id = auth.uid() limit 1;
  if v_role is null then return false; end if;
  -- Owners and superadmins bypass permission flags
  if v_role in ('owner','superadmin','admin') then return true; end if;
  if v_perms is null then return false; end if;
  return coalesce((v_perms ->> p_key)::boolean, false);
end $$;

-- 5. Moderation tables -------------------------------------------------
create table if not exists public.user_suspensions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  reason      text,
  expires_at  timestamptz,
  created_at  timestamptz not null default now(),
  created_by  uuid references auth.users(id) on delete set null
);
create index if not exists user_suspensions_user_idx on public.user_suspensions(user_id);
create index if not exists user_suspensions_active_idx on public.user_suspensions(expires_at);

create table if not exists public.user_limits (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  can_post    boolean not null default true,
  can_comment boolean not null default true,
  can_dm      boolean not null default true,
  reason      text,
  expires_at  timestamptz,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id) on delete set null
);

create table if not exists public.user_reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete cascade,
  target_post_id uuid,
  target_reel_id uuid,
  reason      text not null,
  details     text,
  status      text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists user_reports_status_idx on public.user_reports(status, created_at desc);

create table if not exists public.team_actions_log (
  id          uuid primary key default gen_random_uuid(),
  team_user_id uuid not null references auth.users(id) on delete cascade,
  action      text not null,
  target_type text,
  target_id   text,
  metadata    jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists team_actions_log_recent_idx on public.team_actions_log(created_at desc);

-- 6. Team management RPCs (owner / admin only) -------------------------
create or replace function public.promote_team_member(
  p_user_id uuid,
  p_email   text,
  p_permissions jsonb default null
) returns void language plpgsql security definer as $$
begin
  if not public.current_user_is_owner() then
    raise exception 'Owner required';
  end if;
  insert into public.admin_roles(user_id, email, role, permissions, granted_by, updated_at)
    values (p_user_id, lower(coalesce(p_email,'')), 'team',
            coalesce(p_permissions, public.default_team_permissions()),
            auth.uid(), now())
    on conflict (user_id) do update
      set role = case when public.admin_roles.role = 'owner' then 'owner' else 'team' end,
          email = coalesce(lower(p_email), public.admin_roles.email),
          permissions = coalesce(p_permissions, public.default_team_permissions()),
          granted_by = auth.uid(),
          updated_at = now();
  insert into public.team_actions_log(team_user_id, action, target_type, target_id, metadata)
    values (auth.uid(), 'promote_team', 'user', p_user_id::text,
            jsonb_build_object('permissions', coalesce(p_permissions, public.default_team_permissions())));
end $$;

create or replace function public.update_team_permissions(
  p_user_id uuid,
  p_permissions jsonb
) returns void language plpgsql security definer as $$
begin
  if not public.current_user_is_owner() then
    raise exception 'Owner required';
  end if;
  update public.admin_roles
     set permissions = p_permissions,
         updated_at = now()
   where user_id = p_user_id and role = 'team';
  insert into public.team_actions_log(team_user_id, action, target_type, target_id, metadata)
    values (auth.uid(), 'update_team_permissions', 'user', p_user_id::text,
            jsonb_build_object('permissions', p_permissions));
end $$;

create or replace function public.revoke_team_member(p_user_id uuid)
returns void language plpgsql security definer as $$
begin
  if not public.current_user_is_owner() then
    raise exception 'Owner required';
  end if;
  delete from public.admin_roles where user_id = p_user_id and role = 'team';
  insert into public.team_actions_log(team_user_id, action, target_type, target_id, metadata)
    values (auth.uid(), 'revoke_team', 'user', p_user_id::text, '{}'::jsonb);
end $$;

-- 7. Moderation RPCs ---------------------------------------------------
create or replace function public.team_delete_post(p_post_id uuid, p_reason text default null)
returns void language plpgsql security definer as $$
begin
  if not public.team_has_permission('delete_posts') then
    raise exception 'Permission denied: delete_posts';
  end if;
  -- soft delete if column exists, else hard delete
  begin
    update public.community_posts set deleted_at = now() where id = p_post_id;
  exception when undefined_column then
    delete from public.community_posts where id = p_post_id;
  end;
  insert into public.team_actions_log(team_user_id, action, target_type, target_id, metadata)
    values (auth.uid(), 'delete_post', 'post', p_post_id::text, jsonb_build_object('reason', p_reason));
end $$;

create or replace function public.team_delete_reel(p_reel_id uuid, p_reason text default null)
returns void language plpgsql security definer as $$
begin
  if not public.team_has_permission('delete_reels') then
    raise exception 'Permission denied: delete_reels';
  end if;
  delete from public.reels where id = p_reel_id;
  insert into public.team_actions_log(team_user_id, action, target_type, target_id, metadata)
    values (auth.uid(), 'delete_reel', 'reel', p_reel_id::text, jsonb_build_object('reason', p_reason));
end $$;

create or replace function public.team_ban_user(p_user_id uuid, p_reason text default null)
returns void language plpgsql security definer as $$
begin
  if not public.team_has_permission('ban_users') then
    raise exception 'Permission denied: ban_users';
  end if;
  update public.profiles
     set is_banned = true,
         is_public = false,
         updated_at = now()
   where user_id = p_user_id or id = p_user_id;
  insert into public.team_actions_log(team_user_id, action, target_type, target_id, metadata)
    values (auth.uid(), 'ban_user', 'user', p_user_id::text, jsonb_build_object('reason', p_reason));
end $$;

create or replace function public.team_unban_user(p_user_id uuid)
returns void language plpgsql security definer as $$
begin
  if not public.team_has_permission('ban_users') then
    raise exception 'Permission denied: ban_users';
  end if;
  update public.profiles
     set is_banned = false, updated_at = now()
   where user_id = p_user_id or id = p_user_id;
  delete from public.user_suspensions where user_id = p_user_id;
  insert into public.team_actions_log(team_user_id, action, target_type, target_id, metadata)
    values (auth.uid(), 'unban_user', 'user', p_user_id::text, '{}'::jsonb);
end $$;

create or replace function public.team_suspend_user(
  p_user_id uuid,
  p_hours integer default 24,
  p_reason text default null
) returns void language plpgsql security definer as $$
declare
  v_expires timestamptz := now() + make_interval(hours => greatest(coalesce(p_hours,24),1));
begin
  if not public.team_has_permission('suspend_users') then
    raise exception 'Permission denied: suspend_users';
  end if;
  insert into public.user_suspensions(user_id, reason, expires_at, created_by)
    values (p_user_id, p_reason, v_expires, auth.uid());
  insert into public.team_actions_log(team_user_id, action, target_type, target_id, metadata)
    values (auth.uid(), 'suspend_user', 'user', p_user_id::text,
            jsonb_build_object('hours', p_hours, 'reason', p_reason, 'expires_at', v_expires));
end $$;

create or replace function public.team_limit_user(
  p_user_id uuid,
  p_can_post boolean default true,
  p_can_comment boolean default true,
  p_can_dm boolean default true,
  p_reason text default null,
  p_hours integer default null
) returns void language plpgsql security definer as $$
declare
  v_expires timestamptz;
begin
  if not public.team_has_permission('limit_users') then
    raise exception 'Permission denied: limit_users';
  end if;
  v_expires := case when p_hours is not null then now() + make_interval(hours => p_hours) else null end;
  insert into public.user_limits(user_id, can_post, can_comment, can_dm, reason, expires_at, updated_by, updated_at)
    values (p_user_id, p_can_post, p_can_comment, p_can_dm, p_reason, v_expires, auth.uid(), now())
    on conflict (user_id) do update
      set can_post = excluded.can_post,
          can_comment = excluded.can_comment,
          can_dm = excluded.can_dm,
          reason = excluded.reason,
          expires_at = excluded.expires_at,
          updated_by = auth.uid(),
          updated_at = now();
  insert into public.team_actions_log(team_user_id, action, target_type, target_id, metadata)
    values (auth.uid(), 'limit_user', 'user', p_user_id::text,
            jsonb_build_object('can_post', p_can_post, 'can_comment', p_can_comment, 'can_dm', p_can_dm,
                               'reason', p_reason, 'expires_at', v_expires));
end $$;

create or replace function public.team_resolve_report(
  p_report_id uuid,
  p_status text default 'resolved',
  p_notes text default null
) returns void language plpgsql security definer as $$
begin
  if not public.team_has_permission('resolve_reports') then
    raise exception 'Permission denied: resolve_reports';
  end if;
  update public.user_reports
     set status = coalesce(p_status, 'resolved'),
         resolved_by = auth.uid(),
         resolved_at = now()
   where id = p_report_id;
  insert into public.team_actions_log(team_user_id, action, target_type, target_id, metadata)
    values (auth.uid(), 'resolve_report', 'report', p_report_id::text,
            jsonb_build_object('status', p_status, 'notes', p_notes));
end $$;

-- 8. Online users + analytics views -----------------------------------
create or replace view public.team_online_users as
  select p.user_id,
         p.username,
         p.display_name,
         p.avatar_url,
         lp.surface,
         lp.last_seen
    from public.live_presence lp
    join public.profiles p on (p.user_id = lp.user_id or p.id = lp.user_id)
   where lp.last_seen > now() - interval '5 minutes';

create or replace view public.team_analytics_snapshot as
  select
    (select count(*) from public.profiles) as total_users,
    (select count(*) from public.profiles where updated_at > now() - interval '24 hours') as active_24h,
    (select count(*) from public.profiles where is_banned = true) as banned_users,
    (select count(*) from public.user_suspensions where expires_at > now()) as suspended_users,
    (select count(*) from public.user_reports where status = 'open') as open_reports,
    (select count(*) from public.team_actions_log where created_at > now() - interval '24 hours') as team_actions_24h,
    (select count(distinct lp.user_id) from public.live_presence lp where lp.last_seen > now() - interval '5 minutes') as online_now;

-- 9. Row-level security ----------------------------------------------
alter table public.user_suspensions enable row level security;
alter table public.user_limits enable row level security;
alter table public.user_reports enable row level security;
alter table public.team_actions_log enable row level security;

drop policy if exists user_suspensions_read on public.user_suspensions;
create policy user_suspensions_read on public.user_suspensions
  for select using (public.current_user_is_team() or user_id = auth.uid());

drop policy if exists user_suspensions_write on public.user_suspensions;
create policy user_suspensions_write on public.user_suspensions
  for all using (public.current_user_is_team()) with check (public.current_user_is_team());

drop policy if exists user_limits_read on public.user_limits;
create policy user_limits_read on public.user_limits
  for select using (public.current_user_is_team() or user_id = auth.uid());

drop policy if exists user_limits_write on public.user_limits;
create policy user_limits_write on public.user_limits
  for all using (public.current_user_is_team()) with check (public.current_user_is_team());

drop policy if exists user_reports_read on public.user_reports;
create policy user_reports_read on public.user_reports
  for select using (public.current_user_is_team() or reporter_id = auth.uid());

drop policy if exists user_reports_insert on public.user_reports;
create policy user_reports_insert on public.user_reports
  for insert with check (auth.uid() is not null);

drop policy if exists user_reports_update on public.user_reports;
create policy user_reports_update on public.user_reports
  for update using (public.current_user_is_team()) with check (public.current_user_is_team());

drop policy if exists team_actions_log_read on public.team_actions_log;
create policy team_actions_log_read on public.team_actions_log
  for select using (public.current_user_is_team());

-- 10. Realtime publication --------------------------------------------
do $$ begin
  begin alter publication supabase_realtime add table public.user_reports;     exception when others then null; end;
  begin alter publication supabase_realtime add table public.team_actions_log; exception when others then null; end;
  begin alter publication supabase_realtime add table public.user_suspensions; exception when others then null; end;
end $$;
