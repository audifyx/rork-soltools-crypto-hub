-- SolTools owner-only admin, direct messages, token search cache, and wallet/trading launch gate.
-- Run this in Supabase SQL editor before deploying the edge functions in this change.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Owner-only admin hardening
-- ---------------------------------------------------------------------------
create table if not exists public.admin_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text,
  role text not null default 'owner',
  permissions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_roles_role_check check (role in ('owner','superadmin','admin','moderator','support','user'))
);

alter table public.admin_roles add column if not exists email text;
alter table public.admin_roles add column if not exists permissions jsonb not null default '{}'::jsonb;
alter table public.admin_roles add column if not exists created_at timestamptz not null default now();
alter table public.admin_roles add column if not exists updated_at timestamptz not null default now();
create unique index if not exists admin_roles_user_id_key on public.admin_roles(user_id);

create or replace function public.is_soltools_owner()
returns boolean
language sql
stable
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) = 'audifyx@gmail.com';
$$;

create or replace function public.ensure_owner_role(check_user_id uuid, check_email text)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if lower(coalesce(check_email, '')) <> 'audifyx@gmail.com' then
    raise exception 'not authorized';
  end if;

  if auth.uid() is not null and auth.uid() <> check_user_id then
    raise exception 'user mismatch';
  end if;

  delete from public.admin_roles where lower(coalesce(email, '')) <> 'audifyx@gmail.com' or role <> 'owner';

  insert into public.admin_roles (user_id, email, role, permissions, updated_at)
  values (check_user_id, lower(check_email), 'owner', jsonb_build_object('owner', true, 'dashboard', true), now())
  on conflict (user_id) do update set
    email = excluded.email,
    role = 'owner',
    permissions = excluded.permissions,
    updated_at = now();

  return true;
end;
$$;

revoke all on function public.ensure_owner_role(uuid, text) from public;
grant execute on function public.ensure_owner_role(uuid, text) to authenticated;

-- Remove legacy admin grants now. The app also ignores these client-side.
delete from public.admin_roles where lower(coalesce(email, '')) <> 'audifyx@gmail.com' or role <> 'owner';

alter table public.admin_roles enable row level security;
drop policy if exists "Owner can read admin roles" on public.admin_roles;
drop policy if exists "Owner can write admin roles" on public.admin_roles;
drop policy if exists "Admins can read admin roles" on public.admin_roles;
drop policy if exists "Admins can write admin roles" on public.admin_roles;
create policy "Owner can read admin roles" on public.admin_roles
  for select to authenticated using (public.is_soltools_owner());
create policy "Owner can write admin roles" on public.admin_roles
  for all to authenticated using (public.is_soltools_owner()) with check (public.is_soltools_owner());

-- ---------------------------------------------------------------------------
-- Direct message system
-- ---------------------------------------------------------------------------
create table if not exists public.dm_conversations (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  last_message text not null default '',
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.dm_participants (
  conversation_id uuid not null references public.dm_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  pinned boolean not null default false,
  muted boolean not null default false,
  request boolean not null default false,
  last_read_at timestamptz,
  hidden_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table if not exists public.dm_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.dm_conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null default '',
  message_type text not null default 'text',
  ticker text,
  image_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint dm_messages_body_or_media check (char_length(trim(body)) > 0 or image_url is not null),
  constraint dm_messages_type_check check (message_type in ('text','ticker','tip','system','image'))
);

create index if not exists dm_participants_user_idx on public.dm_participants(user_id, hidden_at);
create index if not exists dm_messages_conversation_created_idx on public.dm_messages(conversation_id, created_at desc);
create index if not exists dm_conversations_last_idx on public.dm_conversations(last_message_at desc);

create or replace function public.is_dm_participant(check_conversation_id uuid, check_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.dm_participants p
    where p.conversation_id = check_conversation_id
      and p.user_id = check_user_id
      and p.hidden_at is null
  );
$$;

create or replace function public.get_or_create_dm(other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  me uuid := auth.uid();
  existing_id uuid;
  new_id uuid;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if other_user_id is null or other_user_id = me then raise exception 'invalid recipient'; end if;

  select p1.conversation_id into existing_id
  from public.dm_participants p1
  join public.dm_participants p2 on p2.conversation_id = p1.conversation_id
  where p1.user_id = me and p2.user_id = other_user_id
  limit 1;

  if existing_id is not null then
    update public.dm_participants set hidden_at = null where conversation_id = existing_id and user_id = me;
    return existing_id;
  end if;

  insert into public.dm_conversations (created_by) values (me) returning id into new_id;
  insert into public.dm_participants (conversation_id, user_id, request, last_read_at)
  values
    (new_id, me, false, now()),
    (new_id, other_user_id, true, null);
  return new_id;
end;
$$;

create or replace function public.send_dm_message(
  p_conversation_id uuid,
  p_body text,
  p_ticker text default null,
  p_image_url text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  me uuid := auth.uid();
  message_id uuid;
  clean_body text := left(trim(coalesce(p_body, '')), 4000);
  kind text := case when p_image_url is not null then 'image' when p_ticker is not null then 'ticker' else 'text' end;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if not public.is_dm_participant(p_conversation_id, me) then raise exception 'not a participant'; end if;
  if char_length(clean_body) = 0 and p_image_url is null then raise exception 'empty message'; end if;

  insert into public.dm_messages (conversation_id, sender_id, body, message_type, ticker, image_url)
  values (p_conversation_id, me, clean_body, kind, p_ticker, p_image_url)
  returning id into message_id;

  update public.dm_conversations
  set last_message = case when p_image_url is not null then 'Photo' else clean_body end,
      last_message_at = now(),
      updated_at = now()
  where id = p_conversation_id;

  update public.dm_participants
  set hidden_at = null,
      request = case when user_id = me then false else request end,
      last_read_at = case when user_id = me then now() else last_read_at end
  where conversation_id = p_conversation_id;

  return message_id;
end;
$$;

create or replace function public.mark_dm_read(p_conversation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  update public.dm_participants
  set last_read_at = now(), request = false
  where conversation_id = p_conversation_id and user_id = auth.uid();
  return found;
end;
$$;

create or replace function public.list_dm_conversations()
returns table (
  id uuid,
  other_user_id uuid,
  other_username text,
  display_name text,
  avatar_url text,
  avatar_color text,
  verified boolean,
  bio text,
  is_online boolean,
  last_message text,
  last_at timestamptz,
  unread_count integer,
  pinned boolean,
  muted boolean,
  request boolean
)
language sql
security definer
set search_path = public, auth
as $$
  select
    c.id,
    other_p.user_id as other_user_id,
    other_prof.username as other_username,
    other_prof.display_name,
    other_prof.avatar_url,
    other_prof.avatar_color,
    coalesce(other_prof.verified, false) as verified,
    other_prof.bio,
    coalesce(other_prof.is_online, false) as is_online,
    c.last_message,
    c.last_message_at as last_at,
    (
      select count(*)::integer
      from public.dm_messages m
      where m.conversation_id = c.id
        and m.sender_id <> auth.uid()
        and m.created_at > coalesce(me_p.last_read_at, 'epoch'::timestamptz)
    ) as unread_count,
    me_p.pinned,
    me_p.muted,
    me_p.request
  from public.dm_participants me_p
  join public.dm_conversations c on c.id = me_p.conversation_id
  join public.dm_participants other_p on other_p.conversation_id = c.id and other_p.user_id <> auth.uid()
  left join public.profiles other_prof on other_prof.user_id = other_p.user_id or other_prof.id = other_p.user_id
  where me_p.user_id = auth.uid()
    and me_p.hidden_at is null
  order by me_p.pinned desc, c.last_message_at desc;
$$;

grant execute on function public.get_or_create_dm(uuid) to authenticated;
grant execute on function public.send_dm_message(uuid, text, text, text) to authenticated;
grant execute on function public.mark_dm_read(uuid) to authenticated;
grant execute on function public.list_dm_conversations() to authenticated;

alter table public.dm_conversations enable row level security;
alter table public.dm_participants enable row level security;
alter table public.dm_messages enable row level security;

drop policy if exists "DM participants can read conversations" on public.dm_conversations;
drop policy if exists "DM creator can insert conversations" on public.dm_conversations;
drop policy if exists "DM participants can read participants" on public.dm_participants;
drop policy if exists "DM users can update own participant row" on public.dm_participants;
drop policy if exists "DM participants can read messages" on public.dm_messages;
drop policy if exists "DM participants can send messages" on public.dm_messages;

create policy "DM participants can read conversations" on public.dm_conversations
  for select to authenticated using (public.is_dm_participant(id, auth.uid()));
create policy "DM creator can insert conversations" on public.dm_conversations
  for insert to authenticated with check (created_by = auth.uid());
create policy "DM participants can read participants" on public.dm_participants
  for select to authenticated using (public.is_dm_participant(conversation_id, auth.uid()) or user_id = auth.uid());
create policy "DM users can update own participant row" on public.dm_participants
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "DM participants can read messages" on public.dm_messages
  for select to authenticated using (public.is_dm_participant(conversation_id, auth.uid()));
create policy "DM participants can send messages" on public.dm_messages
  for insert to authenticated with check (sender_id = auth.uid() and public.is_dm_participant(conversation_id, auth.uid()));

alter publication supabase_realtime add table public.dm_messages;
alter publication supabase_realtime add table public.dm_participants;

-- ---------------------------------------------------------------------------
-- Token search cache for pasted CAs
-- ---------------------------------------------------------------------------
create table if not exists public.token_search_cache (
  token_address text primary key,
  symbol text,
  name text,
  logo_url text,
  price_usd numeric,
  change_24h numeric,
  market_cap_usd numeric,
  liquidity_usd numeric,
  volume_24h_usd numeric,
  pair_address text,
  decimals integer,
  holder_count integer,
  metadata jsonb not null default '{}'::jsonb,
  scanned_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.token_search_cache enable row level security;
drop policy if exists "Anyone can read token search cache" on public.token_search_cache;
drop policy if exists "Authenticated can cache token search" on public.token_search_cache;
create policy "Anyone can read token search cache" on public.token_search_cache for select using (true);
create policy "Authenticated can cache token search" on public.token_search_cache
  for insert to authenticated with check (token_address ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$');
create policy "Authenticated can update token search cache" on public.token_search_cache
  for update to authenticated using (token_address ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$') with check (token_address ~ '^[1-9A-HJ-NP-Za-km-z]{32,44}$');

create or replace function public.upsert_token_search_cache(
  p_token_address text,
  p_symbol text,
  p_name text,
  p_logo_url text default null,
  p_price_usd numeric default null,
  p_change_24h numeric default null,
  p_market_cap_usd numeric default null,
  p_liquidity_usd numeric default null,
  p_volume_24h_usd numeric default null,
  p_pair_address text default null,
  p_decimals integer default null,
  p_holder_count integer default null,
  p_metadata jsonb default '{}'::jsonb
)
returns public.token_search_cache
language plpgsql
security definer
set search_path = public
as $$
declare
  out_row public.token_search_cache;
begin
  insert into public.token_search_cache (
    token_address, symbol, name, logo_url, price_usd, change_24h, market_cap_usd,
    liquidity_usd, volume_24h_usd, pair_address, decimals, holder_count, metadata, scanned_at, updated_at
  ) values (
    p_token_address, p_symbol, p_name, p_logo_url, p_price_usd, p_change_24h, p_market_cap_usd,
    p_liquidity_usd, p_volume_24h_usd, p_pair_address, p_decimals, p_holder_count, coalesce(p_metadata, '{}'::jsonb), now(), now()
  )
  on conflict (token_address) do update set
    symbol = excluded.symbol,
    name = excluded.name,
    logo_url = excluded.logo_url,
    price_usd = excluded.price_usd,
    change_24h = excluded.change_24h,
    market_cap_usd = excluded.market_cap_usd,
    liquidity_usd = excluded.liquidity_usd,
    volume_24h_usd = excluded.volume_24h_usd,
    pair_address = excluded.pair_address,
    decimals = excluded.decimals,
    holder_count = excluded.holder_count,
    metadata = excluded.metadata,
    scanned_at = now(),
    updated_at = now()
  returning * into out_row;
  return out_row;
end;
$$;

grant execute on function public.upsert_token_search_cache(text,text,text,text,numeric,numeric,numeric,numeric,numeric,text,integer,integer,jsonb) to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Launch-gated wallet / trading tables remain as coming soon. These are safe
-- data tables only; app execution paths still call assertTradingEnabled().
-- ---------------------------------------------------------------------------
create table if not exists public.trading_wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  wallet_address text not null,
  label text not null default 'Trading wallet',
  wallet_type text not null default 'local',
  is_backed_up boolean not null default false,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, wallet_address, wallet_type)
);

create table if not exists public.wallet_trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  wallet_id uuid,
  wallet_address text not null,
  input_mint text not null,
  output_mint text not null,
  input_symbol text,
  output_symbol text,
  in_amount_raw text,
  out_amount_raw text,
  slippage_bps integer,
  price_impact_pct numeric,
  route_summary jsonb,
  quote_snapshot jsonb,
  signature text,
  status text not null default 'pending',
  error_message text,
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.wallet_security_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  wallet_id uuid,
  wallet_address text,
  type text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.trading_wallets enable row level security;
alter table public.wallet_trades enable row level security;
alter table public.wallet_security_events enable row level security;

drop policy if exists "Users manage own trading wallets" on public.trading_wallets;
drop policy if exists "Users manage own wallet trades" on public.wallet_trades;
drop policy if exists "Users manage own wallet security events" on public.wallet_security_events;
create policy "Users manage own trading wallets" on public.trading_wallets for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Users manage own wallet trades" on public.wallet_trades for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Users manage own wallet security events" on public.wallet_security_events for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
