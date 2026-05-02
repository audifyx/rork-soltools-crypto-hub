-- 020_admin_platform_overview.sql
-- Connected admin stats for every major SolTools surface.

create table if not exists public.admin_data_sources (
  provider text primary key,
  status text not null default 'unknown' check (status in ('healthy','degraded','outage','unknown')),
  last_success_at timestamptz,
  last_error_at timestamptz,
  latency_ms integer,
  request_count_24h integer not null default 0,
  error_count_24h integer not null default 0,
  meta jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_moderation_queue (
  id uuid primary key default gen_random_uuid(),
  item_type text not null,
  item_id text not null,
  reason text not null default '',
  status text not null default 'open' check (status in ('open','reviewing','resolved','rejected')),
  reporter_id uuid references auth.users(id) on delete set null,
  assigned_to uuid references auth.users(id) on delete set null,
  resolved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  meta jsonb not null default '{}'::jsonb
);

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
    'support_pending', (select count(*) from public.support_tickets where status = 'pending'),
    'support_total', (select count(*) from public.support_tickets),
    'online_now', (select count(*) from public.user_presence where status = 'online' and updated_at > now() - interval '5 minutes'),
    'communities', (select count(*) from public.communities),
    'live_rooms_active', (select count(*) from public.livekit_rooms where is_active),
    'comments_total', (select count(*) from public.community_post_comments),
    'tracked_tokens', (select count(*) from public.tracked_tokens),
    'tracked_wallets', (select count(*) from public.tracked_wallets),
    'active_alerts', (select count(*) from public.price_alerts where is_active),
    'whale_events_24h', (select count(*) from public.whale_events where created_at > now() - interval '24 hours'),
    'announcements', (select count(*) from public.announcements),
    'broadcasts_active', (select count(*) from public.announcements where expires_at is null or expires_at > now()),
    'new_users_24h', (select count(*) from public.profiles where created_at > now() - interval '24 hours'),
    'new_users_7d', (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'new_listings_24h', (select count(*) from public.pump_v5_submissions where created_at > now() - interval '24 hours'),
    'new_listings_7d', (select count(*) from public.pump_v5_submissions where created_at > now() - interval '7 days'),
    'posts_total', (select count(*) from public.community_posts),
    'posts_24h', (select count(*) from public.community_posts where created_at > now() - interval '24 hours'),
    'verified_users', (select count(*) from public.profiles where verified),
    'banned_users', (select count(*) from public.profiles where is_banned),
    'pending_moderation', (select count(*) from public.admin_moderation_queue where status in ('open','reviewing')),
    'data_sources_total', (select count(*) from public.admin_data_sources),
    'data_sources_degraded', (select count(*) from public.admin_data_sources where status in ('degraded','outage')),
    'last_listing_at', (select max(created_at) from public.pump_v5_submissions),
    'last_signup_at', (select max(created_at) from public.profiles)
  );
end $$;

grant execute on function public.admin_dashboard_stats() to authenticated;

select '020_admin_platform_overview applied' as status;
