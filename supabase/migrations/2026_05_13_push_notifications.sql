-- =====================================================================
-- Native push notifications: token registry + dispatch trigger
-- ---------------------------------------------------------------------
-- Idempotent. Safe to re-run.
--
-- Provides:
--   • public.push_tokens (one row per device per user, RLS enforced)
--   • register_push_token / unregister_push_token / clear_user_push_tokens RPCs
--   • notification_dispatch_queue + enqueue trigger on notifications insert
--   • claim_notification_dispatch_batch for the edge function to drain
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. push_tokens
-- ---------------------------------------------------------------------
create table if not exists public.push_tokens (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  token           text not null,
  platform        text not null check (platform in ('ios','android','web')),
  device_name     text,
  app_version     text,
  enabled         boolean not null default true,
  last_seen_at    timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

create unique index if not exists push_tokens_token_uidx
  on public.push_tokens (token);

create index if not exists push_tokens_user_idx
  on public.push_tokens (user_id) where enabled = true;

alter table public.push_tokens enable row level security;

drop policy if exists "push_tokens self select" on public.push_tokens;
create policy "push_tokens self select" on public.push_tokens
  for select using (auth.uid() = user_id);

drop policy if exists "push_tokens self upsert" on public.push_tokens;
create policy "push_tokens self upsert" on public.push_tokens
  for insert with check (auth.uid() = user_id);

drop policy if exists "push_tokens self update" on public.push_tokens;
create policy "push_tokens self update" on public.push_tokens
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "push_tokens self delete" on public.push_tokens;
create policy "push_tokens self delete" on public.push_tokens
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- 2. RPCs to manage tokens
-- ---------------------------------------------------------------------
create or replace function public.register_push_token(
  p_token text,
  p_platform text,
  p_device_name text default null,
  p_app_version text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    raise exception 'not authenticated';
  end if;
  if p_token is null or length(p_token) < 8 then
    raise exception 'invalid token';
  end if;
  insert into public.push_tokens (user_id, token, platform, device_name, app_version, enabled, last_seen_at)
  values (uid, p_token, lower(coalesce(p_platform,'ios')), p_device_name, p_app_version, true, now())
  on conflict (token) do update
    set user_id      = excluded.user_id,
        platform     = excluded.platform,
        device_name  = coalesce(excluded.device_name, public.push_tokens.device_name),
        app_version  = coalesce(excluded.app_version, public.push_tokens.app_version),
        enabled      = true,
        last_seen_at = now();
end;
$$;

grant execute on function public.register_push_token(text,text,text,text) to authenticated;

create or replace function public.unregister_push_token(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then return; end if;
  delete from public.push_tokens where user_id = uid and token = p_token;
end;
$$;

grant execute on function public.unregister_push_token(text) to authenticated;

create or replace function public.clear_user_push_tokens()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then return; end if;
  delete from public.push_tokens where user_id = uid;
end;
$$;

grant execute on function public.clear_user_push_tokens() to authenticated;

-- ---------------------------------------------------------------------
-- 3. dispatch queue (drained by push-dispatch edge function)
-- ---------------------------------------------------------------------
create table if not exists public.notification_dispatch_queue (
  id              uuid primary key default gen_random_uuid(),
  notification_id uuid,
  user_id         uuid not null,
  title           text not null,
  body            text not null,
  data            jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  delivered_at    timestamptz,
  attempts        int not null default 0,
  last_error      text
);

create index if not exists ndq_pending_idx
  on public.notification_dispatch_queue (created_at)
  where delivered_at is null;

alter table public.notification_dispatch_queue enable row level security;
-- no public policies; only service role reads/writes.

-- Helper: quiet hours check against profile preferences
create or replace function public._push_in_quiet_hours(p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  qh_start int;
  qh_end   int;
  hour_now int;
begin
  begin
    select quiet_hours_start, quiet_hours_end
      into qh_start, qh_end
      from public.profiles
     where id = p_user_id;
  exception when undefined_column then
    return false;
  end;
  if qh_start is null or qh_end is null then return false; end if;
  if qh_start = qh_end then return false; end if;
  hour_now := extract(hour from (now() at time zone 'UTC'))::int;
  if qh_start < qh_end then
    return hour_now >= qh_start and hour_now < qh_end;
  else
    return hour_now >= qh_start or hour_now < qh_end;
  end if;
end;
$$;

-- Trigger: enqueue on notifications insert
create or replace function public._enqueue_push_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_title text;
  v_body  text;
  v_data  jsonb;
begin
  if NEW.user_id is null then return NEW; end if;
  if public._push_in_quiet_hours(NEW.user_id) then return NEW; end if;

  -- only enqueue if the user has at least one active token
  if not exists (
    select 1 from public.push_tokens
     where user_id = NEW.user_id and enabled = true
  ) then
    return NEW;
  end if;

  v_title := coalesce(NEW.title, 'New notification');
  v_body  := coalesce(NEW.message, NEW.body, '');
  v_data  := jsonb_build_object(
    'notificationId', NEW.id,
    'kind', NEW.kind,
    'targetType', NEW.target_type,
    'targetId',   NEW.target_id,
    'actor',      NEW.actor_username
  );

  insert into public.notification_dispatch_queue
    (notification_id, user_id, title, body, data)
  values (NEW.id, NEW.user_id, v_title, left(v_body, 240), v_data);

  return NEW;
exception when others then
  -- never break the parent insert
  return NEW;
end;
$$;

do $$
begin
  if exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'notifications'
  ) then
    drop trigger if exists trg_notifications_enqueue_push on public.notifications;
    create trigger trg_notifications_enqueue_push
      after insert on public.notifications
      for each row execute function public._enqueue_push_notification();
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 4. Batch claim helper for the edge function (service-role only)
-- ---------------------------------------------------------------------
create or replace function public.claim_notification_dispatch_batch(p_limit int default 50)
returns table (
  queue_id        uuid,
  notification_id uuid,
  user_id         uuid,
  title           text,
  body            text,
  data            jsonb,
  tokens          text[]
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with picked as (
    select id
      from public.notification_dispatch_queue
     where delivered_at is null
       and attempts < 5
     order by created_at asc
     limit greatest(1, least(coalesce(p_limit, 50), 200))
     for update skip locked
  ),
  updated as (
    update public.notification_dispatch_queue q
       set attempts = q.attempts + 1
      from picked
     where q.id = picked.id
     returning q.*
  )
  select u.id,
         u.notification_id,
         u.user_id,
         u.title,
         u.body,
         u.data,
         coalesce(
           (select array_agg(t.token)
              from public.push_tokens t
             where t.user_id = u.user_id and t.enabled = true),
           array[]::text[]
         )
    from updated u;
end;
$$;

revoke all on function public.claim_notification_dispatch_batch(int) from public;
revoke all on function public.claim_notification_dispatch_batch(int) from anon, authenticated;

create or replace function public.mark_notification_dispatch_delivered(
  p_queue_id uuid,
  p_error text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.notification_dispatch_queue
     set delivered_at = case when p_error is null then now() else delivered_at end,
         last_error   = coalesce(p_error, last_error)
   where id = p_queue_id;
end;
$$;

revoke all on function public.mark_notification_dispatch_delivered(uuid,text) from public;
revoke all on function public.mark_notification_dispatch_delivered(uuid,text) from anon, authenticated;

create or replace function public.disable_invalid_push_token(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.push_tokens set enabled = false where token = p_token;
end;
$$;

revoke all on function public.disable_invalid_push_token(text) from public;
revoke all on function public.disable_invalid_push_token(text) from anon, authenticated;
