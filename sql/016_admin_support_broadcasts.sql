-- 016_admin_support_broadcasts.sql
-- Admin dashboard, support tickets, broadcasts, and moderation RPCs.

do $$ begin
  create type public.support_status as enum ('open','pending','resolved','closed');
exception when duplicate_object then null; end $$;

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  subject text not null default '',
  body text not null default '',
  status public.support_status not null default 'open',
  priority text not null default 'normal',
  assignee_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  severity text not null default 'info' check (severity in ('info','success','warning','critical')),
  audience text not null default 'all' check (audience in ('all','traders','admins')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default 'null'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

do $$ begin
  alter table public.support_tickets enable row level security;
  alter table public.announcements enable row level security;
  alter table public.app_settings enable row level security;
  alter table public.admin_audit_log enable row level security;

  drop policy if exists support_tickets_owner_or_admin on public.support_tickets;
  create policy support_tickets_owner_or_admin on public.support_tickets for select using (auth.uid() = user_id or public.is_admin(auth.uid()));
  drop policy if exists support_tickets_insert_self on public.support_tickets;
  create policy support_tickets_insert_self on public.support_tickets for insert with check (auth.uid() = user_id);
  drop policy if exists support_tickets_admin_update on public.support_tickets;
  create policy support_tickets_admin_update on public.support_tickets for update using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

  drop policy if exists announcements_read on public.announcements;
  create policy announcements_read on public.announcements for select using (expires_at is null or expires_at > now());
  drop policy if exists announcements_admin_all on public.announcements;
  create policy announcements_admin_all on public.announcements for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

  drop policy if exists app_settings_read on public.app_settings;
  create policy app_settings_read on public.app_settings for select using (true);
  drop policy if exists app_settings_admin_all on public.app_settings;
  create policy app_settings_admin_all on public.app_settings for all using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

  drop policy if exists admin_audit_admin_read on public.admin_audit_log;
  create policy admin_audit_admin_read on public.admin_audit_log for select using (public.is_admin(auth.uid()));
end $$;

create or replace function public.admin_dashboard_stats()
returns json language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(auth.uid()) then raise exception 'admin only'; end if;
  return json_build_object(
    'users', (select count(*) from public.profiles),
    'admins', (select count(*) from public.admin_roles),
    'listings', (select count(*) from public.pump_v5_submissions),
    'featured', (select count(*) from public.pump_v5_submissions where is_featured),
    'verified', (select count(*) from public.pump_v5_submissions where is_verified),
    'hot', (select count(*) from public.pump_v5_submissions where is_hot),
    'support_open', (select count(*) from public.support_tickets where status = 'open'),
    'support_total', (select count(*) from public.support_tickets),
    'announcements', (select count(*) from public.announcements),
    'new_users_24h', (select count(*) from public.profiles where created_at > now() - interval '24 hours'),
    'new_users_7d', (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'new_listings_24h', (select count(*) from public.pump_v5_submissions where created_at > now() - interval '24 hours'),
    'new_listings_7d', (select count(*) from public.pump_v5_submissions where created_at > now() - interval '7 days'),
    'posts_24h', (select count(*) from public.community_posts where created_at > now() - interval '24 hours'),
    'verified_users', (select count(*) from public.profiles where verified),
    'banned_users', (select count(*) from public.profiles where is_banned)
  );
end $$;

grant execute on function public.admin_dashboard_stats() to authenticated;

create or replace function public.admin_top_users(max_rows int default 6)
returns table (user_id uuid, username text, display_name text, avatar_url text, followers_count integer, verified boolean, is_banned boolean, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.username::text, p.display_name, p.avatar_url, p.followers_count, p.verified, p.is_banned, p.created_at
    from public.profiles p
   where public.is_admin(auth.uid())
   order by p.followers_count desc, p.created_at desc
   limit greatest(1, least(max_rows, 50));
$$;

grant execute on function public.admin_top_users(int) to authenticated;

create or replace function public.admin_recent_activity(max_rows int default 8)
returns table (id uuid, admin_id uuid, admin_username text, admin_avatar text, action text, target_type text, target_id text, meta jsonb, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select a.id, a.admin_id, p.username::text, p.avatar_url, a.action, a.target_type, a.target_id, a.meta, a.created_at
    from public.admin_audit_log a
    left join public.profiles p on p.id = a.admin_id
   where public.is_admin(auth.uid())
   order by a.created_at desc
   limit greatest(1, least(max_rows, 100));
$$;

grant execute on function public.admin_recent_activity(int) to authenticated;

create or replace function public.admin_list_admins()
returns table (user_id uuid, email text, username text, role text, created_at timestamptz)
language sql stable security definer set search_path = public as $$
  select ar.user_id, au.email::text, p.username::text, ar.role, ar.created_at
    from public.admin_roles ar
    left join auth.users au on au.id = ar.user_id
    left join public.profiles p on p.id = ar.user_id
   where public.is_admin(auth.uid())
   order by ar.created_at desc;
$$;

grant execute on function public.admin_list_admins() to authenticated;

create or replace function public.admin_add_by_email(target_email text, target_role text default 'admin')
returns void language plpgsql security definer set search_path = public as $$
declare target_id uuid;
begin
  if not public.is_admin(auth.uid()) then raise exception 'admin only'; end if;
  select id into target_id from auth.users where lower(email) = lower(target_email) limit 1;
  if target_id is null then raise exception 'user not found'; end if;
  insert into public.admin_roles (user_id, role, granted_by)
  values (target_id, coalesce(target_role, 'admin'), auth.uid())
  on conflict (user_id) do update set role = excluded.role;
end $$;

grant execute on function public.admin_add_by_email(text, text) to authenticated;

create or replace function public.admin_remove(target_user_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(auth.uid()) then raise exception 'admin only'; end if;
  delete from public.admin_roles where user_id = target_user_id;
end $$;

grant execute on function public.admin_remove(uuid) to authenticated;

select '016_admin_support_broadcasts base applied' as status;
