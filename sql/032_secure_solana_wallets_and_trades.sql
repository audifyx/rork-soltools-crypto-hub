-- Secure Solana wallet metadata + trade audit tables.
-- IMPORTANT: this schema intentionally never stores private keys, seed phrases, or
-- Phantom session payloads. Wallet secrets stay encrypted on the user's device.

create extension if not exists pgcrypto;

create table if not exists public.trading_wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  wallet_address text not null,
  label text not null default 'Trading wallet',
  wallet_type text not null check (wallet_type in ('local', 'phantom')),
  secret_storage text not null default 'device_secure_store' check (secret_storage in ('device_secure_store', 'phantom_external')),
  is_backed_up boolean not null default false,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trading_wallets_address_len check (char_length(wallet_address) between 32 and 64)
);

create unique index if not exists trading_wallets_user_address_type_idx
  on public.trading_wallets(user_id, wallet_address, wallet_type)
  where revoked_at is null;

create index if not exists trading_wallets_user_created_idx
  on public.trading_wallets(user_id, created_at desc);

create table if not exists public.wallet_security_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  wallet_id uuid references public.trading_wallets(id) on delete set null,
  wallet_address text,
  event_type text not null check (event_type in ('created', 'imported', 'exported', 'deleted', 'phantom_connected', 'trade_signed')),
  client_event_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists wallet_security_events_user_created_idx
  on public.wallet_security_events(user_id, created_at desc);

create table if not exists public.wallet_trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  wallet_id uuid references public.trading_wallets(id) on delete set null,
  wallet_address text not null,
  input_mint text not null,
  output_mint text not null,
  input_symbol text,
  output_symbol text,
  in_amount_raw numeric not null default 0,
  out_amount_raw numeric not null default 0,
  slippage_bps integer not null default 100,
  price_impact_pct numeric,
  route_summary jsonb not null default '[]'::jsonb,
  quote_snapshot jsonb not null default '{}'::jsonb,
  signature text unique,
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'failed')),
  error_message text,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz
);

create index if not exists wallet_trades_user_created_idx
  on public.wallet_trades(user_id, created_at desc);

create index if not exists wallet_trades_wallet_created_idx
  on public.wallet_trades(wallet_id, created_at desc);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trading_wallets_touch_updated_at on public.trading_wallets;
create trigger trading_wallets_touch_updated_at
before update on public.trading_wallets
for each row execute function public.touch_updated_at();

create or replace function public.bump_profile_trade_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'confirmed' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    update public.profiles
    set trades_count = coalesce(trades_count, 0) + 1
    where user_id = new.user_id;
  end if;
  return new;
end;
$$;

drop trigger if exists wallet_trades_bump_profile_trade_count on public.wallet_trades;
create trigger wallet_trades_bump_profile_trade_count
after insert or update of status on public.wallet_trades
for each row execute function public.bump_profile_trade_count();

alter table public.trading_wallets enable row level security;
alter table public.wallet_security_events enable row level security;
alter table public.wallet_trades enable row level security;

drop policy if exists trading_wallets_select_own on public.trading_wallets;
create policy trading_wallets_select_own
on public.trading_wallets for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists trading_wallets_insert_own on public.trading_wallets;
create policy trading_wallets_insert_own
on public.trading_wallets for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists trading_wallets_update_own on public.trading_wallets;
create policy trading_wallets_update_own
on public.trading_wallets for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists trading_wallets_delete_own on public.trading_wallets;
create policy trading_wallets_delete_own
on public.trading_wallets for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists wallet_security_events_select_own on public.wallet_security_events;
create policy wallet_security_events_select_own
on public.wallet_security_events for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists wallet_security_events_insert_own on public.wallet_security_events;
create policy wallet_security_events_insert_own
on public.wallet_security_events for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists wallet_trades_select_own on public.wallet_trades;
create policy wallet_trades_select_own
on public.wallet_trades for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists wallet_trades_insert_own on public.wallet_trades;
create policy wallet_trades_insert_own
on public.wallet_trades for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists wallet_trades_update_own on public.wallet_trades;
create policy wallet_trades_update_own
on public.wallet_trades for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

comment on table public.trading_wallets is 'Public wallet metadata only. Private keys and Phantom sessions are never stored in Supabase.';
comment on column public.trading_wallets.secret_storage is 'device_secure_store = local Expo SecureStore; phantom_external = controlled by Phantom.';
comment on table public.wallet_trades is 'User-visible Jupiter trade audit trail without private key material.';
comment on table public.wallet_security_events is 'Audit events for wallet lifecycle actions; no secrets or plaintext keys.';
