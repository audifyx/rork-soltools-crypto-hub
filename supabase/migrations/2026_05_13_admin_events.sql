-- =====================================================================
-- 2026-05-13 · Admin events feature
-- =====================================================================
-- Adds admin-managed events (Discord-style: banner image, title, time,
-- info, location) that surface on the For-You feed for every user.
-- Safe to run on fresh and existing databases (fully idempotent).
-- =====================================================================

-- 1. Events table -----------------------------------------------------
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  host_id uuid references auth.users(id) on delete set null,
  community_id uuid,
  title text not null,
  description text,
  cover_url text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  is_virtual boolean not null default true,
  rsvp_count integer not null default 0,
  created_at timestamptz not null default now()
);

-- Admin-event columns (additive, idempotent)
alter table public.events add column if not exists banner_url       text;
alter table public.events add column if not exists category         text;
alter table public.events add column if not exists event_url        text;
alter table public.events add column if not exists is_featured      boolean not null default false;
alter table public.events add column if not exists is_published     boolean not null default true;
alter table public.events add column if not exists is_admin_event   boolean not null default false;
alter table public.events add column if not exists going_count      integer not null default 0;
alter table public.events add column if not exists updated_at       timestamptz not null default now();
alter table public.events add column if not exists created_by       uuid references auth.users(id) on delete set null;

create index if not exists events_upcoming_idx     on public.events(starts_at);
create index if not exists events_featured_idx     on public.events(is_featured, starts_at) where is_published = true;
create index if not exists events_published_idx    on public.events(is_published, starts_at);

-- 2. RSVPs ------------------------------------------------------------
create table if not exists public.event_rsvps (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'going' check (status in ('going','interested','declined','no')),
  remind_me boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index if not exists event_rsvps_user_idx on public.event_rsvps(user_id);

-- 3. Counter maintenance ---------------------------------------------
create or replace function public.events_refresh_counts(p_event_id uuid)
returns void language plpgsql security definer as $$
begin
  update public.events e set
    rsvp_count  = coalesce((select count(*) from public.event_rsvps r where r.event_id = e.id and r.status in ('going','interested')), 0),
    going_count = coalesce((select count(*) from public.event_rsvps r where r.event_id = e.id and r.status = 'going'), 0)
  where e.id = p_event_id;
end $$;

create or replace function public.event_rsvps_after_change()
returns trigger language plpgsql as $$
begin
  perform public.events_refresh_counts(coalesce(new.event_id, old.event_id));
  return null;
end $$;

drop trigger if exists event_rsvps_after_change_trg on public.event_rsvps;
create trigger event_rsvps_after_change_trg
after insert or update or delete on public.event_rsvps
for each row execute function public.event_rsvps_after_change();

-- 4. RSVP RPC (idempotent upsert) ------------------------------------
create or replace function public.rsvp_event(
  p_event_id uuid,
  p_status text default 'going',
  p_remind_me boolean default true
) returns void language plpgsql security definer as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;
  if p_status = 'no' then
    delete from public.event_rsvps where event_id = p_event_id and user_id = auth.uid();
  else
    insert into public.event_rsvps(event_id, user_id, status, remind_me)
      values (p_event_id, auth.uid(), p_status, coalesce(p_remind_me, true))
      on conflict (event_id, user_id)
      do update set status = excluded.status,
                    remind_me = excluded.remind_me;
  end if;
  perform public.events_refresh_counts(p_event_id);
end $$;

-- 5. Admin helper ----------------------------------------------------
create or replace function public.current_user_is_admin()
returns boolean language sql stable security definer as $$
  select exists (
    select 1
    from public.admin_roles ar
    where ar.user_id = auth.uid()
      and ar.role in ('owner','superadmin','admin','moderator')
  );
$$;

-- 6. Admin event RPCs ------------------------------------------------
create or replace function public.admin_create_event(
  p_title text,
  p_description text,
  p_banner_url text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_location text,
  p_is_virtual boolean,
  p_category text,
  p_event_url text,
  p_is_featured boolean
) returns uuid language plpgsql security definer as $$
declare
  v_id uuid;
begin
  if not public.current_user_is_admin() then
    raise exception 'Admin required';
  end if;
  if coalesce(trim(p_title), '') = '' then
    raise exception 'Title required';
  end if;
  insert into public.events(
    host_id, created_by, title, description, banner_url, cover_url,
    starts_at, ends_at, location, is_virtual, category, event_url,
    is_featured, is_published, is_admin_event
  ) values (
    auth.uid(), auth.uid(), p_title, p_description, p_banner_url, p_banner_url,
    p_starts_at, p_ends_at, p_location, coalesce(p_is_virtual, true),
    p_category, p_event_url, coalesce(p_is_featured, false), true, true
  )
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.admin_update_event(
  p_event_id uuid,
  p_title text,
  p_description text,
  p_banner_url text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_location text,
  p_is_virtual boolean,
  p_category text,
  p_event_url text,
  p_is_featured boolean,
  p_is_published boolean
) returns void language plpgsql security definer as $$
begin
  if not public.current_user_is_admin() then
    raise exception 'Admin required';
  end if;
  update public.events set
    title        = coalesce(p_title, title),
    description  = p_description,
    banner_url   = p_banner_url,
    cover_url    = coalesce(p_banner_url, cover_url),
    starts_at    = coalesce(p_starts_at, starts_at),
    ends_at      = p_ends_at,
    location     = p_location,
    is_virtual   = coalesce(p_is_virtual, is_virtual),
    category     = p_category,
    event_url    = p_event_url,
    is_featured  = coalesce(p_is_featured, is_featured),
    is_published = coalesce(p_is_published, is_published),
    updated_at   = now()
  where id = p_event_id;
end $$;

create or replace function public.admin_delete_event(p_event_id uuid)
returns void language plpgsql security definer as $$
begin
  if not public.current_user_is_admin() then
    raise exception 'Admin required';
  end if;
  delete from public.events where id = p_event_id;
end $$;

-- 7. Row level security ---------------------------------------------
alter table public.events       enable row level security;
alter table public.event_rsvps  enable row level security;

drop policy if exists events_read on public.events;
create policy events_read on public.events
  for select using (is_published = true or host_id = auth.uid() or public.current_user_is_admin());

drop policy if exists events_write on public.events;
create policy events_write on public.events
  for all using (host_id = auth.uid() or public.current_user_is_admin())
  with check (host_id = auth.uid() or public.current_user_is_admin());

drop policy if exists event_rsvps_read on public.event_rsvps;
create policy event_rsvps_read on public.event_rsvps for select using (true);

drop policy if exists event_rsvps_write on public.event_rsvps;
create policy event_rsvps_write on public.event_rsvps
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 8. Realtime --------------------------------------------------------
do $$ begin
  begin alter publication supabase_realtime add table public.events;      exception when others then null; end;
  begin alter publication supabase_realtime add table public.event_rsvps; exception when others then null; end;
end $$;
