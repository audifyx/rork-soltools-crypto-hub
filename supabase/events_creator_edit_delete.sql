-- =============================================================================
-- Events: creator-only edit & delete + admin RPCs
--
-- Adds the SQL surface that the app calls:
--   * RLS so only the event host can UPDATE / DELETE their own event row.
--   * SECURITY DEFINER RPCs used by platform.ts:
--       - admin_create_event(...)
--       - admin_update_event(...)
--       - admin_delete_event(...)
--   * Direct table UPDATE/DELETE filtered by host_user_id (used by
--     updateMyEvent / deleteMyEvent) is permitted via RLS policies below.
--
-- Safe to run multiple times. Delete this file after running it once.
-- =============================================================================

alter table public.events enable row level security;

-- ---------- SELECT: everyone can read events ----------
do $$
declare p record;
begin
  for p in
    select polname from pg_policy
    where polrelid = 'public.events'::regclass and polcmd = 'r'
  loop
    execute format('drop policy if exists %I on public.events', p.polname);
  end loop;
end$$;

create policy events_select_all
  on public.events for select
  using (true);

-- ---------- INSERT: authenticated user, must be host ----------
do $$
declare p record;
begin
  for p in
    select polname from pg_policy
    where polrelid = 'public.events'::regclass and polcmd = 'a'
  loop
    execute format('drop policy if exists %I on public.events', p.polname);
  end loop;
end$$;

create policy events_insert_self
  on public.events for insert
  with check (auth.uid() = host_user_id);

-- ---------- UPDATE: only the host (creator) ----------
do $$
declare p record;
begin
  for p in
    select polname from pg_policy
    where polrelid = 'public.events'::regclass and polcmd = 'w'
  loop
    execute format('drop policy if exists %I on public.events', p.polname);
  end loop;
end$$;

create policy events_update_host
  on public.events for update
  using (auth.uid() = host_user_id)
  with check (auth.uid() = host_user_id);

-- ---------- DELETE: only the host (creator) ----------
do $$
declare p record;
begin
  for p in
    select polname from pg_policy
    where polrelid = 'public.events'::regclass and polcmd = 'd'
  loop
    execute format('drop policy if exists %I on public.events', p.polname);
  end loop;
end$$;

create policy events_delete_host
  on public.events for delete
  using (auth.uid() = host_user_id);

-- =============================================================================
-- Admin RPC: create event
-- =============================================================================
create or replace function public.admin_create_event(
  p_title         text,
  p_description   text default null,
  p_banner_url    text default null,
  p_starts_at     timestamptz default now(),
  p_ends_at       timestamptz default null,
  p_location      text default null,
  p_is_virtual    boolean default true,
  p_category      text default null,
  p_event_url     text default null,
  p_is_featured   boolean default false
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Sign in required';
  end if;

  insert into public.events (
    title, description, banner_url, starts_at, ends_at,
    location, is_virtual, url, category, host_user_id, is_featured, is_published
  ) values (
    p_title, p_description, p_banner_url, p_starts_at, p_ends_at,
    p_location, coalesce(p_is_virtual, true), p_event_url, p_category,
    v_uid, coalesce(p_is_featured, false), true
  )
  returning id into v_id;

  return v_id;
end$$;

grant execute on function public.admin_create_event(
  text, text, text, timestamptz, timestamptz, text, boolean, text, text, boolean
) to authenticated;

-- =============================================================================
-- Admin RPC: update event (creator-only)
-- =============================================================================
create or replace function public.admin_update_event(
  p_event_id      uuid,
  p_title         text default null,
  p_description   text default null,
  p_banner_url    text default null,
  p_starts_at     timestamptz default null,
  p_ends_at       timestamptz default null,
  p_location      text default null,
  p_is_virtual    boolean default null,
  p_category      text default null,
  p_event_url     text default null,
  p_is_featured   boolean default null,
  p_is_published  boolean default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_host uuid;
begin
  if v_uid is null then
    raise exception 'Sign in required';
  end if;

  select host_user_id into v_host from public.events where id = p_event_id;
  if v_host is null then
    raise exception 'Event not found';
  end if;
  if v_host <> v_uid then
    raise exception 'Only the creator can edit this event';
  end if;

  update public.events set
    title        = coalesce(p_title, title),
    description  = coalesce(p_description, description),
    banner_url   = coalesce(p_banner_url, banner_url),
    starts_at    = coalesce(p_starts_at, starts_at),
    ends_at      = coalesce(p_ends_at, ends_at),
    location     = coalesce(p_location, location),
    is_virtual   = coalesce(p_is_virtual, is_virtual),
    category     = coalesce(p_category, category),
    url          = coalesce(p_event_url, url),
    is_featured  = coalesce(p_is_featured, is_featured),
    is_published = coalesce(p_is_published, is_published)
  where id = p_event_id;
end$$;

grant execute on function public.admin_update_event(
  uuid, text, text, text, timestamptz, timestamptz, text, boolean, text, text, boolean, boolean
) to authenticated;

-- =============================================================================
-- Admin RPC: delete event (creator-only)
-- =============================================================================
create or replace function public.admin_delete_event(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_host uuid;
begin
  if v_uid is null then
    raise exception 'Sign in required';
  end if;

  select host_user_id into v_host from public.events where id = p_event_id;
  if v_host is null then
    raise exception 'Event not found';
  end if;
  if v_host <> v_uid then
    raise exception 'Only the creator can delete this event';
  end if;

  delete from public.events where id = p_event_id;
end$$;

grant execute on function public.admin_delete_event(uuid) to authenticated;
