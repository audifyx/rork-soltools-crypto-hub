-- 029_voice_lobbies.sql
-- Adds functional voice lobby persistence: lobbies, members, chat, reactions,
-- shared watchlists, RLS, realtime, and RPCs used by the Expo UI. Safe to run more than once.

create extension if not exists pgcrypto;

create table if not exists public.admin_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('superadmin', 'admin', 'moderator', 'support')),
  created_at timestamptz not null default now()
);

alter table public.admin_roles enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'admin_roles'
      and policyname = 'admin_roles_select_self'
  ) then
    create policy admin_roles_select_self
      on public.admin_roles
      for select
      using (auth.uid() = user_id);
  end if;
end $$;

create or replace function public.is_voice_lobby_admin(target_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.admin_roles ar
    where ar.user_id = target_user_id
      and ar.role in ('superadmin', 'admin', 'moderator')
  );
$$;

create table if not exists public.voice_lobbies (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references auth.users(id) on delete cascade,
  community_id uuid null,
  name text not null check (char_length(trim(name)) between 1 and 80),
  topic text not null default '',
  is_private boolean not null default false,
  status text not null default 'live' check (status in ('live', 'scheduled', 'ended')),
  tags text[] not null default '{}',
  livekit_room text not null unique,
  reactions_count integer not null default 0 check (reactions_count >= 0),
  raised_hands_count integer not null default 0 check (raised_hands_count >= 0),
  speakers_count integer not null default 0 check (speakers_count >= 0),
  listeners_count integer not null default 0 check (listeners_count >= 0),
  scheduled_at timestamptz,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.voice_lobby_members (
  id uuid primary key default gen_random_uuid(),
  lobby_id uuid not null references public.voice_lobbies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'listener' check (role in ('host', 'speaker', 'listener')),
  mic_muted boolean not null default true,
  speaking boolean not null default false,
  raised_hand boolean not null default false,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  last_seen_at timestamptz not null default now(),
  unique (lobby_id, user_id)
);

create table if not exists public.voice_lobby_messages (
  id uuid primary key default gen_random_uuid(),
  lobby_id uuid not null references public.voice_lobbies(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  kind text not null default 'text' check (kind in ('text', 'ticker', 'wallet', 'system')),
  content text not null check (char_length(trim(content)) between 1 and 1000),
  ticker text,
  wallet_address text,
  created_at timestamptz not null default now()
);

create table if not exists public.voice_lobby_watchlist (
  id uuid primary key default gen_random_uuid(),
  lobby_id uuid not null references public.voice_lobbies(id) on delete cascade,
  type text not null check (type in ('token', 'wallet')),
  label text not null check (char_length(trim(label)) between 1 and 80),
  address text not null check (char_length(trim(address)) >= 4),
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (lobby_id, address)
);

create table if not exists public.voice_lobby_reactions (
  id uuid primary key default gen_random_uuid(),
  lobby_id uuid not null references public.voice_lobbies(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  emoji text not null default '🔥',
  created_at timestamptz not null default now()
);

create index if not exists idx_voice_lobbies_status_created on public.voice_lobbies(status, created_at desc);
create index if not exists idx_voice_lobbies_public_live on public.voice_lobbies(is_private, status, started_at desc);
create index if not exists idx_voice_lobby_members_lobby_active on public.voice_lobby_members(lobby_id, left_at, role);
create index if not exists idx_voice_lobby_members_user_active on public.voice_lobby_members(user_id, left_at);
create index if not exists idx_voice_lobby_messages_lobby_created on public.voice_lobby_messages(lobby_id, created_at desc);
create index if not exists idx_voice_lobby_watch_lobby_created on public.voice_lobby_watchlist(lobby_id, created_at desc);
create index if not exists idx_voice_lobby_reactions_lobby_created on public.voice_lobby_reactions(lobby_id, created_at desc);

alter table public.voice_lobbies enable row level security;
alter table public.voice_lobby_members enable row level security;
alter table public.voice_lobby_messages enable row level security;
alter table public.voice_lobby_watchlist enable row level security;
alter table public.voice_lobby_reactions enable row level security;

create or replace function public.is_voice_lobby_member(target_lobby_id uuid, target_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.voice_lobby_members vlm
    where vlm.lobby_id = target_lobby_id
      and vlm.user_id = target_user_id
      and vlm.left_at is null
  );
$$;

create or replace function public.can_view_voice_lobby(target_lobby_id uuid, target_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.voice_lobbies vl
    where vl.id = target_lobby_id
      and (
        vl.is_private = false
        or vl.host_id = target_user_id
        or public.is_voice_lobby_member(vl.id, target_user_id)
        or public.is_voice_lobby_admin(target_user_id)
      )
  );
$$;

create or replace function public.can_manage_voice_lobby(target_lobby_id uuid, target_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.voice_lobbies vl
    where vl.id = target_lobby_id
      and (vl.host_id = target_user_id or public.is_voice_lobby_admin(target_user_id))
  );
$$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'voice_lobbies' and policyname = 'voice_lobbies_select_visible') then
    create policy voice_lobbies_select_visible
      on public.voice_lobbies for select
      using (
        is_private = false
        or host_id = auth.uid()
        or public.is_voice_lobby_member(id, auth.uid())
        or public.is_voice_lobby_admin(auth.uid())
      );
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'voice_lobbies' and policyname = 'voice_lobbies_insert_host') then
    create policy voice_lobbies_insert_host
      on public.voice_lobbies for insert
      with check (auth.uid() = host_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'voice_lobbies' and policyname = 'voice_lobbies_update_host_or_admin') then
    create policy voice_lobbies_update_host_or_admin
      on public.voice_lobbies for update
      using (host_id = auth.uid() or public.is_voice_lobby_admin(auth.uid()))
      with check (host_id = auth.uid() or public.is_voice_lobby_admin(auth.uid()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'voice_lobby_members' and policyname = 'voice_lobby_members_select_visible') then
    create policy voice_lobby_members_select_visible
      on public.voice_lobby_members for select
      using (public.can_view_voice_lobby(lobby_id, auth.uid()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'voice_lobby_members' and policyname = 'voice_lobby_members_insert_self') then
    create policy voice_lobby_members_insert_self
      on public.voice_lobby_members for insert
      with check (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'voice_lobby_members' and policyname = 'voice_lobby_members_update_self_or_manager') then
    create policy voice_lobby_members_update_self_or_manager
      on public.voice_lobby_members for update
      using (auth.uid() = user_id or public.can_manage_voice_lobby(lobby_id, auth.uid()))
      with check (auth.uid() = user_id or public.can_manage_voice_lobby(lobby_id, auth.uid()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'voice_lobby_messages' and policyname = 'voice_lobby_messages_select_visible') then
    create policy voice_lobby_messages_select_visible
      on public.voice_lobby_messages for select
      using (public.can_view_voice_lobby(lobby_id, auth.uid()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'voice_lobby_messages' and policyname = 'voice_lobby_messages_insert_member') then
    create policy voice_lobby_messages_insert_member
      on public.voice_lobby_messages for insert
      with check (auth.uid() = user_id and public.is_voice_lobby_member(lobby_id, auth.uid()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'voice_lobby_messages' and policyname = 'voice_lobby_messages_delete_own_or_manager') then
    create policy voice_lobby_messages_delete_own_or_manager
      on public.voice_lobby_messages for delete
      using (auth.uid() = user_id or public.can_manage_voice_lobby(lobby_id, auth.uid()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'voice_lobby_watchlist' and policyname = 'voice_lobby_watchlist_select_visible') then
    create policy voice_lobby_watchlist_select_visible
      on public.voice_lobby_watchlist for select
      using (public.can_view_voice_lobby(lobby_id, auth.uid()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'voice_lobby_watchlist' and policyname = 'voice_lobby_watchlist_insert_member') then
    create policy voice_lobby_watchlist_insert_member
      on public.voice_lobby_watchlist for insert
      with check (auth.uid() = added_by and public.is_voice_lobby_member(lobby_id, auth.uid()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'voice_lobby_watchlist' and policyname = 'voice_lobby_watchlist_delete_own_or_manager') then
    create policy voice_lobby_watchlist_delete_own_or_manager
      on public.voice_lobby_watchlist for delete
      using (auth.uid() = added_by or public.can_manage_voice_lobby(lobby_id, auth.uid()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'voice_lobby_reactions' and policyname = 'voice_lobby_reactions_select_visible') then
    create policy voice_lobby_reactions_select_visible
      on public.voice_lobby_reactions for select
      using (public.can_view_voice_lobby(lobby_id, auth.uid()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'voice_lobby_reactions' and policyname = 'voice_lobby_reactions_insert_member') then
    create policy voice_lobby_reactions_insert_member
      on public.voice_lobby_reactions for insert
      with check (auth.uid() = user_id and public.is_voice_lobby_member(lobby_id, auth.uid()));
  end if;
end $$;

create or replace function public.touch_voice_lobby_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_voice_lobbies_updated_at on public.voice_lobbies;
create trigger trg_voice_lobbies_updated_at
before update on public.voice_lobbies
for each row execute function public.touch_voice_lobby_updated_at();

create or replace function public.sync_voice_lobby_counts(target_lobby_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.voice_lobbies vl
  set
    speakers_count = coalesce((
      select count(*)::integer
      from public.voice_lobby_members m
      where m.lobby_id = target_lobby_id
        and m.left_at is null
        and m.role in ('host', 'speaker')
    ), 0),
    listeners_count = coalesce((
      select count(*)::integer
      from public.voice_lobby_members m
      where m.lobby_id = target_lobby_id
        and m.left_at is null
        and m.role = 'listener'
    ), 0),
    raised_hands_count = coalesce((
      select count(*)::integer
      from public.voice_lobby_members m
      where m.lobby_id = target_lobby_id
        and m.left_at is null
        and m.raised_hand = true
    ), 0)
  where vl.id = target_lobby_id;
end;
$$;

create or replace function public.trg_sync_voice_lobby_counts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.sync_voice_lobby_counts(coalesce(new.lobby_id, old.lobby_id));
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_voice_lobby_members_sync_counts on public.voice_lobby_members;
create trigger trg_voice_lobby_members_sync_counts
after insert or update or delete on public.voice_lobby_members
for each row execute function public.trg_sync_voice_lobby_counts();

create or replace function public.voice_profile_summary(target_user_id uuid)
returns table(handle text, display_name text)
language sql
security definer
set search_path = public
stable
as $$
  select
    coalesce('@' || nullif(p.username, ''), '@' || left(target_user_id::text, 6))::text as handle,
    coalesce(nullif(p.display_name, ''), nullif(p.username, ''), left(target_user_id::text, 6))::text as display_name
  from public.profiles p
  where p.user_id = target_user_id or p.id = target_user_id
  limit 1;
$$;

create or replace function public.voice_handle(target_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  h text;
begin
  select vps.handle into h from public.voice_profile_summary(target_user_id) vps limit 1;
  return coalesce(h, '@' || left(target_user_id::text, 6));
end;
$$;

create or replace function public.voice_display_name(target_user_id uuid)
returns text
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  n text;
begin
  select vps.display_name into n from public.voice_profile_summary(target_user_id) vps limit 1;
  return coalesce(n, left(target_user_id::text, 6));
end;
$$;

create or replace function public.list_voice_lobbies(max_rows integer default 80)
returns table(
  id uuid,
  name text,
  topic text,
  host_id uuid,
  host_handle text,
  host_name text,
  is_private boolean,
  status text,
  tags text[],
  livekit_room text,
  reactions_count integer,
  raised_hands_count integer,
  speakers_count integer,
  listeners_count integer,
  created_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  members jsonb,
  messages jsonb,
  watchlist jsonb
)
language sql
security definer
set search_path = public
stable
as $$
  select
    vl.id,
    vl.name::text,
    vl.topic::text,
    vl.host_id,
    public.voice_handle(vl.host_id) as host_handle,
    public.voice_display_name(vl.host_id) as host_name,
    vl.is_private,
    vl.status::text,
    vl.tags,
    vl.livekit_room::text,
    coalesce(vl.reactions_count, 0)::integer,
    coalesce(vl.raised_hands_count, 0)::integer,
    coalesce(vl.speakers_count, 0)::integer,
    coalesce(vl.listeners_count, 0)::integer,
    vl.created_at,
    vl.started_at,
    vl.ended_at,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', m.id,
          'user_id', m.user_id,
          'handle', public.voice_handle(m.user_id),
          'display_name', public.voice_display_name(m.user_id),
          'role', m.role,
          'mic_muted', m.mic_muted,
          'speaking', m.speaking,
          'raised_hand', m.raised_hand,
          'joined_at', m.joined_at
        ) order by case m.role when 'host' then 0 when 'speaker' then 1 else 2 end, m.joined_at asc
      )
      from public.voice_lobby_members m
      where m.lobby_id = vl.id and m.left_at is null
    ), '[]'::jsonb) as members,
    coalesce((
      select jsonb_agg(x.obj order by x.created_at asc)
      from (
        select
          msg.created_at,
          jsonb_build_object(
            'id', msg.id,
            'lobby_id', msg.lobby_id,
            'from_handle', coalesce(public.voice_handle(msg.user_id), 'system'),
            'kind', msg.kind,
            'content', msg.content,
            'ticker', msg.ticker,
            'wallet_address', msg.wallet_address,
            'created_at', msg.created_at
          ) as obj
        from public.voice_lobby_messages msg
        where msg.lobby_id = vl.id
        order by msg.created_at desc
        limit 80
      ) x
    ), '[]'::jsonb) as messages,
    coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', w.id,
          'type', w.type,
          'label', w.label,
          'address', w.address,
          'added_by_handle', public.voice_handle(w.added_by),
          'created_at', w.created_at
        ) order by w.created_at desc
      )
      from public.voice_lobby_watchlist w
      where w.lobby_id = vl.id
    ), '[]'::jsonb) as watchlist
  from public.voice_lobbies vl
  where vl.status <> 'ended'
    and public.can_view_voice_lobby(vl.id, auth.uid())
  order by vl.started_at desc nulls last, vl.created_at desc
  limit greatest(1, least(coalesce(max_rows, 80), 200));
$$;

create or replace function public.create_voice_lobby(
  p_name text,
  p_topic text default '',
  p_is_private boolean default false,
  p_tags text[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  acting_user uuid := auth.uid();
  new_id uuid := gen_random_uuid();
  clean_name text := left(nullif(trim(coalesce(p_name, '')), ''), 80);
  clean_topic text := left(trim(coalesce(p_topic, '')), 240);
begin
  if acting_user is null then
    raise exception 'Sign in required';
  end if;
  if clean_name is null then
    raise exception 'Lobby name required';
  end if;

  insert into public.voice_lobbies(id, host_id, name, topic, is_private, tags, livekit_room)
  values (new_id, acting_user, clean_name, clean_topic, coalesce(p_is_private, false), coalesce(p_tags, '{}'), 'voice-' || new_id::text);

  insert into public.voice_lobby_members(lobby_id, user_id, role, mic_muted, speaking, raised_hand)
  values (new_id, acting_user, 'host', true, false, false);

  insert into public.voice_lobby_messages(lobby_id, user_id, kind, content)
  values (new_id, acting_user, 'system', public.voice_handle(acting_user) || ' opened the lobby.');

  perform public.sync_voice_lobby_counts(new_id);
  return new_id;
end;
$$;

create or replace function public.join_voice_lobby(target_lobby_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  acting_user uuid := auth.uid();
  lb public.voice_lobbies%rowtype;
begin
  if acting_user is null then
    raise exception 'Sign in required';
  end if;

  select * into lb from public.voice_lobbies where id = target_lobby_id and status <> 'ended';
  if lb.id is null then
    raise exception 'Lobby not found';
  end if;
  if lb.is_private and lb.host_id <> acting_user and not public.is_voice_lobby_member(target_lobby_id, acting_user) and not public.is_voice_lobby_admin(acting_user) then
    raise exception 'This lobby is private';
  end if;

  insert into public.voice_lobby_members(lobby_id, user_id, role, mic_muted, speaking, raised_hand, left_at, last_seen_at)
  values (target_lobby_id, acting_user, case when lb.host_id = acting_user then 'host' else 'listener' end, true, false, false, null, now())
  on conflict (lobby_id, user_id) do update
    set left_at = null,
        last_seen_at = now(),
        mic_muted = true,
        speaking = false,
        role = case when public.voice_lobby_members.user_id = lb.host_id then 'host' else public.voice_lobby_members.role end;

  insert into public.voice_lobby_messages(lobby_id, user_id, kind, content)
  values (target_lobby_id, acting_user, 'system', public.voice_handle(acting_user) || ' joined.');

  perform public.sync_voice_lobby_counts(target_lobby_id);
  return true;
end;
$$;

create or replace function public.leave_voice_lobby(target_lobby_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  acting_user uuid := auth.uid();
begin
  if acting_user is null then
    raise exception 'Sign in required';
  end if;

  update public.voice_lobby_members
  set left_at = now(),
      mic_muted = true,
      speaking = false,
      raised_hand = false,
      last_seen_at = now()
  where lobby_id = target_lobby_id and user_id = acting_user;

  insert into public.voice_lobby_messages(lobby_id, user_id, kind, content)
  values (target_lobby_id, acting_user, 'system', public.voice_handle(acting_user) || ' left.');

  perform public.sync_voice_lobby_counts(target_lobby_id);
  return true;
end;
$$;

create or replace function public.send_voice_lobby_message(target_lobby_id uuid, p_text text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  acting_user uuid := auth.uid();
  clean_text text := left(nullif(trim(coalesce(p_text, '')), ''), 1000);
  msg_kind text := 'text';
  msg_ticker text := null;
  msg_id uuid;
begin
  if acting_user is null then
    raise exception 'Sign in required';
  end if;
  if clean_text is null then
    raise exception 'Message cannot be empty';
  end if;
  if not public.is_voice_lobby_member(target_lobby_id, acting_user) then
    perform public.join_voice_lobby(target_lobby_id);
  end if;

  if clean_text ~ '^\$[A-Za-z0-9_]{1,16}' then
    msg_kind := 'ticker';
    msg_ticker := upper(substring(clean_text from '^\$([A-Za-z0-9_]{1,16})'));
  end if;

  insert into public.voice_lobby_messages(lobby_id, user_id, kind, content, ticker)
  values (target_lobby_id, acting_user, msg_kind, clean_text, msg_ticker)
  returning id into msg_id;

  return msg_id;
end;
$$;

create or replace function public.set_voice_lobby_mute(target_lobby_id uuid, p_muted boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  acting_user uuid := auth.uid();
begin
  if acting_user is null then
    raise exception 'Sign in required';
  end if;
  if not public.is_voice_lobby_member(target_lobby_id, acting_user) then
    perform public.join_voice_lobby(target_lobby_id);
  end if;

  update public.voice_lobby_members
  set mic_muted = coalesce(p_muted, true),
      speaking = not coalesce(p_muted, true),
      last_seen_at = now(),
      role = case when role = 'listener' and coalesce(p_muted, true) = false then 'speaker' else role end
  where lobby_id = target_lobby_id and user_id = acting_user;

  perform public.sync_voice_lobby_counts(target_lobby_id);
  return true;
end;
$$;

create or replace function public.set_voice_lobby_hand(target_lobby_id uuid, p_raised boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  acting_user uuid := auth.uid();
begin
  if acting_user is null then
    raise exception 'Sign in required';
  end if;
  if not public.is_voice_lobby_member(target_lobby_id, acting_user) then
    perform public.join_voice_lobby(target_lobby_id);
  end if;

  update public.voice_lobby_members
  set raised_hand = coalesce(p_raised, false),
      last_seen_at = now()
  where lobby_id = target_lobby_id and user_id = acting_user;

  perform public.sync_voice_lobby_counts(target_lobby_id);
  return true;
end;
$$;

create or replace function public.add_voice_lobby_reaction(target_lobby_id uuid, p_emoji text default '🔥')
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  acting_user uuid := auth.uid();
  next_count integer;
begin
  if acting_user is null then
    raise exception 'Sign in required';
  end if;
  if not public.is_voice_lobby_member(target_lobby_id, acting_user) then
    perform public.join_voice_lobby(target_lobby_id);
  end if;

  insert into public.voice_lobby_reactions(lobby_id, user_id, emoji)
  values (target_lobby_id, acting_user, left(coalesce(nullif(trim(p_emoji), ''), '🔥'), 8));

  update public.voice_lobbies
  set reactions_count = reactions_count + 1
  where id = target_lobby_id
  returning reactions_count into next_count;

  return coalesce(next_count, 0);
end;
$$;

create or replace function public.add_voice_lobby_watch(
  target_lobby_id uuid,
  p_type text,
  p_label text,
  p_address text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  acting_user uuid := auth.uid();
  clean_type text := case when p_type = 'wallet' then 'wallet' else 'token' end;
  clean_address text := nullif(trim(coalesce(p_address, '')), '');
  clean_label text := left(nullif(trim(coalesce(p_label, '')), ''), 80);
  watch_id uuid;
begin
  if acting_user is null then
    raise exception 'Sign in required';
  end if;
  if clean_address is null or char_length(clean_address) < 4 then
    raise exception 'Address required';
  end if;
  if not public.is_voice_lobby_member(target_lobby_id, acting_user) then
    perform public.join_voice_lobby(target_lobby_id);
  end if;

  insert into public.voice_lobby_watchlist(lobby_id, type, label, address, added_by)
  values (target_lobby_id, clean_type, coalesce(clean_label, left(clean_address, 8)), clean_address, acting_user)
  on conflict (lobby_id, address) do update
    set type = excluded.type,
        label = excluded.label,
        added_by = excluded.added_by,
        created_at = now()
  returning id into watch_id;

  insert into public.voice_lobby_messages(lobby_id, user_id, kind, content, ticker, wallet_address)
  values (
    target_lobby_id,
    acting_user,
    case when clean_type = 'wallet' then 'wallet' else 'ticker' end,
    'Tracking ' || clean_type || ' ' || coalesce(clean_label, left(clean_address, 8)),
    case when clean_type = 'token' then coalesce(clean_label, left(clean_address, 8)) else null end,
    case when clean_type = 'wallet' then clean_address else null end
  );

  return watch_id;
end;
$$;

create or replace function public.remove_voice_lobby_watch(target_lobby_id uuid, target_watch_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  acting_user uuid := auth.uid();
begin
  if acting_user is null then
    raise exception 'Sign in required';
  end if;

  delete from public.voice_lobby_watchlist w
  where w.id = target_watch_id
    and w.lobby_id = target_lobby_id
    and (
      w.added_by = acting_user
      or public.can_manage_voice_lobby(target_lobby_id, acting_user)
    );

  return true;
end;
$$;

create or replace function public.close_voice_lobby(target_lobby_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  acting_user uuid := auth.uid();
begin
  if acting_user is null then
    raise exception 'Sign in required';
  end if;
  if not public.can_manage_voice_lobby(target_lobby_id, acting_user) then
    raise exception 'Only the host or an admin can close this lobby';
  end if;

  update public.voice_lobbies
  set status = 'ended', ended_at = now()
  where id = target_lobby_id;

  update public.voice_lobby_members
  set left_at = coalesce(left_at, now()), mic_muted = true, speaking = false, raised_hand = false
  where lobby_id = target_lobby_id;

  perform public.sync_voice_lobby_counts(target_lobby_id);
  return true;
end;
$$;

grant select on public.voice_lobbies to anon, authenticated;
grant select on public.voice_lobby_members to anon, authenticated;
grant select on public.voice_lobby_messages to anon, authenticated;
grant select on public.voice_lobby_watchlist to anon, authenticated;
grant select on public.voice_lobby_reactions to anon, authenticated;
grant insert, update, delete on public.voice_lobbies to authenticated;
grant insert, update, delete on public.voice_lobby_members to authenticated;
grant insert, delete on public.voice_lobby_messages to authenticated;
grant insert, delete on public.voice_lobby_watchlist to authenticated;
grant insert on public.voice_lobby_reactions to authenticated;

grant execute on function public.is_voice_lobby_admin(uuid) to authenticated;
grant execute on function public.is_voice_lobby_member(uuid, uuid) to authenticated;
grant execute on function public.can_view_voice_lobby(uuid, uuid) to authenticated;
grant execute on function public.can_manage_voice_lobby(uuid, uuid) to authenticated;
grant execute on function public.list_voice_lobbies(integer) to anon, authenticated;
grant execute on function public.create_voice_lobby(text, text, boolean, text[]) to authenticated;
grant execute on function public.join_voice_lobby(uuid) to authenticated;
grant execute on function public.leave_voice_lobby(uuid) to authenticated;
grant execute on function public.send_voice_lobby_message(uuid, text) to authenticated;
grant execute on function public.set_voice_lobby_mute(uuid, boolean) to authenticated;
grant execute on function public.set_voice_lobby_hand(uuid, boolean) to authenticated;
grant execute on function public.add_voice_lobby_reaction(uuid, text) to authenticated;
grant execute on function public.add_voice_lobby_watch(uuid, text, text, text) to authenticated;
grant execute on function public.remove_voice_lobby_watch(uuid, uuid) to authenticated;
grant execute on function public.close_voice_lobby(uuid) to authenticated;

do $$
begin
  begin
    alter publication supabase_realtime add table public.voice_lobbies;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.voice_lobby_members;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.voice_lobby_messages;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.voice_lobby_watchlist;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.voice_lobby_reactions;
  exception when duplicate_object then null;
  end;
end $$;
