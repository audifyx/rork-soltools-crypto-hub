-- 022_admin_ops_rpcs.sql
-- Short admin ops RPCs for dashboard health, providers, and moderation.

create or replace function public.admin_platform_overview()
returns json language plpgsql security definer set search_path = public as $$
declare degraded int; health int;
begin
  if not public.is_admin(auth.uid()) then raise exception 'admin only'; end if;
  select count(*) into degraded from public.admin_data_sources where status in ('degraded','outage');
  health := greatest(0, 100 - (degraded * 12)
    - case when (select count(*) from public.support_tickets where status = 'open') > 25 then 8 else 0 end
    - case when (select count(*) from public.admin_moderation_queue where status in ('open','reviewing')) > 20 then 8 else 0 end);

  return json_build_object(
    'health_score', health,
    'users_total', (select count(*) from public.profiles),
    'online_now', (select count(*) from public.user_presence where status = 'online' and updated_at > now() - interval '5 minutes'),
    'listings_total', (select count(*) from public.pump_v5_submissions),
    'listings_verified', (select count(*) from public.pump_v5_submissions where is_verified),
    'communities_total', (select count(*) from public.communities),
    'posts_total', (select count(*) from public.community_posts),
    'tracked_tokens', (select count(*) from public.tracked_tokens),
    'tracked_wallets', (select count(*) from public.tracked_wallets),
    'active_alerts', (select count(*) from public.price_alerts where is_active),
    'open_tickets', (select count(*) from public.support_tickets where status = 'open'),
    'pending_moderation', (select count(*) from public.admin_moderation_queue where status in ('open','reviewing')),
    'data_sources_degraded', degraded,
    'live_rooms_active', (select count(*) from public.livekit_rooms where is_active),
    'whale_events_24h', (select count(*) from public.whale_events where created_at > now() - interval '24 hours'),
    'volume_24h_usd', coalesce((select sum(volume_24h_usd) from public.pump_v5_submissions), 0),
    'liquidity_usd', coalesce((select sum(liquidity_usd) from public.pump_v5_submissions), 0),
    'market_cap_usd', coalesce((select sum(market_cap) from public.pump_v5_submissions), 0),
    'last_listing_at', (select max(created_at) from public.pump_v5_submissions),
    'last_signup_at', (select max(created_at) from public.profiles)
  );
end $$;

grant execute on function public.admin_platform_overview() to authenticated;

create or replace function public.admin_data_sources_all()
returns table (provider text, status text, last_success_at timestamptz, last_error_at timestamptz, latency_ms integer, request_count_24h integer, error_count_24h integer, meta jsonb, updated_at timestamptz)
language sql stable security definer set search_path = public as $$
  select provider, status, last_success_at, last_error_at, latency_ms, request_count_24h, error_count_24h, meta, updated_at
    from public.admin_data_sources
   where public.is_admin(auth.uid())
   order by case status when 'outage' then 0 when 'degraded' then 1 when 'unknown' then 2 else 3 end, provider;
$$;

grant execute on function public.admin_data_sources_all() to authenticated;

create or replace function public.admin_data_source_upsert(in_provider text, in_status text, in_latency_ms integer default null, in_meta jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(auth.uid()) then raise exception 'admin only'; end if;
  insert into public.admin_data_sources (provider, status, latency_ms, meta, updated_by, updated_at, last_success_at, last_error_at)
  values (in_provider, coalesce(nullif(in_status, ''), 'unknown'), in_latency_ms, coalesce(in_meta, '{}'::jsonb), auth.uid(), now(),
    case when in_status = 'healthy' then now() else null end,
    case when in_status in ('degraded','outage') then now() else null end)
  on conflict (provider) do update set
    status = excluded.status,
    latency_ms = coalesce(excluded.latency_ms, public.admin_data_sources.latency_ms),
    meta = public.admin_data_sources.meta || excluded.meta,
    updated_by = excluded.updated_by,
    updated_at = now(),
    last_success_at = coalesce(excluded.last_success_at, public.admin_data_sources.last_success_at),
    last_error_at = coalesce(excluded.last_error_at, public.admin_data_sources.last_error_at);

  insert into public.admin_audit_log (admin_id, action, target_type, target_id, meta)
  values (auth.uid(), 'data_source_update', 'admin_data_sources', in_provider, jsonb_build_object('status', in_status));
end $$;

grant execute on function public.admin_data_source_upsert(text, text, integer, jsonb) to authenticated;

select '022_admin_ops_rpcs part 1 applied' as status;
