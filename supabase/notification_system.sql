-- =============================================================================
-- Notification System
-- Creates the notifications schema + RPCs the client and push-dispatch edge
-- function rely on.
--
-- Safe to run multiple times.
-- =============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.notifications (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  kind            text not null,
  type            text,
  title           text,
  message         text,
  body            text,
  data            jsonb not null default '{}'::jsonb,
  actor_id        uuid references auth.users(id) on delete set null,
  target_type     text,
  target_id       text,
  created_at      timestamptz not null default now(),
  read_at         timestamptz
);

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);
create index if not exists notifications_user_unread_idx
  on public.notifications (user_id) where read_at is null;
create index if not exists notifications_actor_idx
  on public.notifications (actor_id);

create table if not exists public.push_tokens (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  token           text not null unique,
  platform        text not null default 'ios',
  device_name     text,
  app_version     text,
  disabled_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists push_tokens_user_idx on public.push_tokens (user_id);
create index if not exists push_tokens_active_idx
  on public.push_tokens (user_id) where disabled_at is null;

create table if not exists public.notification_dispatch_queue (
  id              uuid primary key default gen_random_uuid(),
  notification_id uuid references public.notifications(id) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  title           text not null,
  body            text not null default '',
  data            jsonb not null default '{}'::jsonb,
  claimed_at      timestamptz,
  delivered_at    timestamptz,
  last_error      text,
  attempts        int not null default 0,
  created_at      timestamptz not null default now()
);
create index if not exists notif_queue_pending_idx
  on public.notification_dispatch_queue (created_at)
  where delivered_at is null;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.notifications enable row level security;
alter table public.push_tokens enable row level security;
alter table public.notification_dispatch_queue enable row level security;

drop policy if exists notif_select_own on public.notifications;
create policy notif_select_own on public.notifications
  for select using (auth.uid() = user_id);

drop policy if exists notif_update_own on public.notifications;
create policy notif_update_own on public.notifications
  for update using (auth.uid() = user_id);

drop policy if exists push_tokens_select_own on public.push_tokens;
create policy push_tokens_select_own on public.push_tokens
  for select using (auth.uid() = user_id);

drop policy if exists push_tokens_modify_own on public.push_tokens;
create policy push_tokens_modify_own on public.push_tokens
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Queue is service-role only; no public policies.

-- ---------------------------------------------------------------------------
-- Enqueue helper: fires whenever a notification row is inserted.
-- ---------------------------------------------------------------------------

create or replace function public.enqueue_notification_dispatch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notification_dispatch_queue (notification_id, user_id, title, body, data)
  values (
    new.id,
    new.user_id,
    coalesce(nullif(trim(new.title), ''), 'Update'),
    coalesce(nullif(trim(new.message), ''), nullif(trim(new.body), ''), ''),
    coalesce(new.data, '{}'::jsonb)
      || jsonb_build_object(
        'notificationId', new.id::text,
        'kind', new.kind,
        'targetType', new.target_type,
        'targetId', new.target_id
      )
  );
  return new;
end;
$$;

drop trigger if exists notifications_enqueue_dispatch on public.notifications;
create trigger notifications_enqueue_dispatch
after insert on public.notifications
for each row execute function public.enqueue_notification_dispatch();

-- ---------------------------------------------------------------------------
-- register_push_token / unregister_push_token
-- ---------------------------------------------------------------------------

create or replace function public.register_push_token(
  p_token       text,
  p_platform    text default 'ios',
  p_device_name text default null,
  p_app_version text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Not authenticated';
  end if;
  if p_token is null or length(trim(p_token)) = 0 then
    raise exception 'Token required';
  end if;

  insert into public.push_tokens (user_id, token, platform, device_name, app_version)
  values (v_user, p_token, coalesce(p_platform, 'ios'), p_device_name, p_app_version)
  on conflict (token) do update
    set user_id     = excluded.user_id,
        platform    = excluded.platform,
        device_name = excluded.device_name,
        app_version = excluded.app_version,
        disabled_at = null,
        updated_at  = now();
end;
$$;

create or replace function public.unregister_push_token(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Not authenticated';
  end if;
  delete from public.push_tokens
   where token = p_token and user_id = v_user;
end;
$$;

create or replace function public.disable_invalid_push_token(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.push_tokens
     set disabled_at = now(), updated_at = now()
   where token = p_token;
end;
$$;

-- ---------------------------------------------------------------------------
-- Notification list / unread count / mark read
-- ---------------------------------------------------------------------------

create or replace function public.list_notifications_page(
  p_before     timestamptz default null,
  p_limit      int default 30,
  p_unread_only boolean default false
)
returns table (
  id               uuid,
  kind             text,
  title            text,
  message          text,
  body             text,
  created_at       timestamptz,
  read_at          timestamptz,
  actor_username   text,
  actor_avatar_url text,
  target_type      text,
  target_id        text,
  data             jsonb
)
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_limit int := greatest(1, least(coalesce(p_limit, 30), 100));
begin
  if v_user is null then
    return;
  end if;

  return query
  select n.id,
         n.kind,
         n.title,
         n.message,
         n.body,
         n.created_at,
         n.read_at,
         p.username       as actor_username,
         p.avatar_url     as actor_avatar_url,
         n.target_type,
         n.target_id,
         n.data
    from public.notifications n
    left join public.profiles p on p.user_id = n.actor_id
   where n.user_id = v_user
     and (p_before is null or n.created_at < p_before)
     and (p_unread_only = false or n.read_at is null)
   order by n.created_at desc
   limit v_limit;
end;
$$;

create or replace function public.get_unread_notification_count()
returns integer
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(count(*), 0)::int
    from public.notifications
   where user_id = auth.uid() and read_at is null;
$$;

create or replace function public.mark_notification_read(p_notification_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.notifications
     set read_at = coalesce(read_at, now())
   where id = p_notification_id and user_id = auth.uid();
end;
$$;

create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int := 0;
begin
  update public.notifications
     set read_at = now()
   where user_id = auth.uid() and read_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Dispatch queue drain (used by push-dispatch edge function)
-- ---------------------------------------------------------------------------

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
declare
  v_limit int := greatest(1, least(coalesce(p_limit, 50), 200));
begin
  return query
  with claimed as (
    update public.notification_dispatch_queue q
       set claimed_at = now(),
           attempts   = attempts + 1
     where q.id in (
       select id from public.notification_dispatch_queue
        where delivered_at is null
          and (claimed_at is null or claimed_at < now() - interval '2 minutes')
        order by created_at asc
        limit v_limit
        for update skip locked
     )
   returning q.id, q.notification_id, q.user_id, q.title, q.body, q.data
  )
  select c.id,
         c.notification_id,
         c.user_id,
         c.title,
         c.body,
         c.data,
         coalesce(array_agg(pt.token) filter (where pt.token is not null), '{}'::text[]) as tokens
    from claimed c
    left join public.push_tokens pt
      on pt.user_id = c.user_id and pt.disabled_at is null
   group by c.id, c.notification_id, c.user_id, c.title, c.body, c.data;
end;
$$;

create or replace function public.mark_notification_dispatch_delivered(
  p_queue_id uuid,
  p_error    text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.notification_dispatch_queue
     set delivered_at = case when p_error is null then now() else delivered_at end,
         last_error   = p_error,
         claimed_at   = case when p_error is null then claimed_at else null end
   where id = p_queue_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

grant select, update on public.notifications to authenticated;
grant select, insert, update, delete on public.push_tokens to authenticated;

grant execute on function public.register_push_token(text, text, text, text) to authenticated;
grant execute on function public.unregister_push_token(text) to authenticated;
grant execute on function public.list_notifications_page(timestamptz, int, boolean) to authenticated;
grant execute on function public.get_unread_notification_count() to authenticated;
grant execute on function public.mark_notification_read(uuid) to authenticated;
grant execute on function public.mark_all_notifications_read() to authenticated;

-- Service-role only RPCs (push-dispatch edge function uses these via service key)
revoke all on function public.claim_notification_dispatch_batch(int) from public;
revoke all on function public.mark_notification_dispatch_delivered(uuid, text) from public;
revoke all on function public.disable_invalid_push_token(text) from public;
grant execute on function public.claim_notification_dispatch_batch(int) to service_role;
grant execute on function public.mark_notification_dispatch_delivered(uuid, text) to service_role;
grant execute on function public.disable_invalid_push_token(text) to service_role;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

do $$
begin
  begin
    execute 'alter publication supabase_realtime add table public.notifications';
  exception when duplicate_object then null;
           when others then null;
  end;
end $$;
