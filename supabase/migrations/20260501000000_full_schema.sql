-- =====================================================================
-- SolTools — Full Supabase Schema
-- Project: ffjipnkhcebjvttliptb
-- Generated: 2026-05-01
--
-- This single file is idempotent and safe to run multiple times.
-- Covers: auth/profiles, social, launchpad, trading, alerts, lobbies,
--         live feed, credits, webhooks, support, admin, platform config,
--         and integration plumbing for LiveKit + Jupiter + Helius +
--         Birdeye + Alchemy + QuickNode (and other providers).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. EXTENSIONS
-- ---------------------------------------------------------------------
create extension if not exists "pgcrypto";
create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm";
create extension if not exists "citext";
-- Vault is managed by Supabase; used to store provider secrets server-side.
create extension if not exists "supabase_vault" with schema vault;


-- ---------------------------------------------------------------------
-- 1. ENUM TYPES
-- ---------------------------------------------------------------------
do $$ begin
  create type public.alert_condition as enum ('above','below','volume_spike','whale_buy');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.launch_venue as enum ('pumpfun','pumpswap','raydium','meteora','jupiter','other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.lobby_role as enum ('owner','admin','member');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.notification_kind as enum (
    'price_alert','whale_buy','mention','follow','reply','launch','system','trade','lobby'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.trade_side as enum ('buy','sell');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.support_status as enum ('open','pending','resolved','closed');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.api_provider as enum (
    'jupiter','helius','birdeye','alchemy','quicknode','solscan','dexscreener',
    'shyft','triton','pythnetwork','livekit','elevenlabs','openai','custom'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.livekit_room_kind as enum ('voice_lobby','live_trade','ama','support','dm_call');
exception when duplicate_object then null; end $$;


-- ---------------------------------------------------------------------
-- 2. CORE: PROFILES + ROLES
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  username citext unique,
  display_name text,
  bio text,
  avatar_url text,
  banner_url text,
  wallet_address text,
  twitter_handle text,
  website text,
  location text,
  badge text default 'Recruit',
  verified boolean not null default false,
  followers_count integer not null default 0,
  following_count integer not null default 0,
  trades_count integer not null default 0,
  win_rate numeric(6,2) not null default 0,
  pnl_pct numeric(10,2) not null default 0,
  xp integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_username_idx on public.profiles using gin (username gin_trgm_ops);
create index if not exists profiles_wallet_idx on public.profiles (wallet_address);

create table if not exists public.admin_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('superadmin','admin','moderator','support')),
  granted_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create or replace function public.is_admin(uid uuid)
returns boolean language sql stable as $$
  select exists (select 1 from public.admin_roles where user_id = uid)
$$;

create table if not exists public.followers (
  follower_id uuid not null references auth.users(id) on delete cascade,
  followee_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, followee_id),
  check (follower_id <> followee_id)
);
create index if not exists followers_followee_idx on public.followers (followee_id);

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  push boolean not null default true,
  haptics boolean not null default true,
  voice_lobbies boolean not null default false,
  whale_alerts boolean not null default true,
  ai_narration boolean not null default false,
  private_profile boolean not null default false,
  hide_balance boolean not null default false,
  two_factor boolean not null default false,
  biometric boolean not null default false,
  currency text not null default 'USD',
  theme text not null default 'dark',
  language text not null default 'en',
  slippage numeric(6,3) not null default 1.0,
  priority_fee numeric(12,8) not null default 0.0005,
  mev_protection boolean not null default true,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table if not exists public.user_activity (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists user_activity_user_idx on public.user_activity (user_id, created_at desc);


-- ---------------------------------------------------------------------
-- 3. LAUNCHPAD
-- ---------------------------------------------------------------------
create table if not exists public.pump_v5_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  token_name text not null,
  symbol text not null,
  description text,
  logo_url text,
  banner_url text,
  contract_address text not null,
  website text,
  twitter text,
  telegram text,
  discord text,
  tags text[] not null default '{}',
  liquidity_usd numeric(20,2),
  market_cap numeric(20,2),
  volume_24h_usd numeric(20,2),
  holders integer,
  price_usd numeric(24,12),
  change_24h_pct numeric(10,4),
  upvotes integer not null default 0,
  watchers integer not null default 0,
  is_featured boolean not null default false,
  is_hot boolean not null default false,
  is_verified boolean not null default false,
  status text not null default 'other',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pump_v5_created_idx on public.pump_v5_submissions (created_at desc);
create index if not exists pump_v5_user_idx on public.pump_v5_submissions (user_id);
create index if not exists pump_v5_contract_idx on public.pump_v5_submissions (contract_address);
create index if not exists pump_v5_search_idx on public.pump_v5_submissions
  using gin ((token_name || ' ' || symbol || ' ' || coalesce(contract_address,'')) gin_trgm_ops);

create table if not exists public.launch_upvotes (
  user_id uuid not null references auth.users(id) on delete cascade,
  submission_id uuid not null references public.pump_v5_submissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, submission_id)
);

create or replace function public.handle_launch_upvote()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    update public.pump_v5_submissions set upvotes = upvotes + 1 where id = new.submission_id;
  elsif tg_op = 'DELETE' then
    update public.pump_v5_submissions set upvotes = greatest(0, upvotes - 1) where id = old.submission_id;
  end if;
  return null;
end $$;

drop trigger if exists trg_launch_upvote_ins on public.launch_upvotes;
create trigger trg_launch_upvote_ins after insert on public.launch_upvotes
  for each row execute function public.handle_launch_upvote();
drop trigger if exists trg_launch_upvote_del on public.launch_upvotes;
create trigger trg_launch_upvote_del after delete on public.launch_upvotes
  for each row execute function public.handle_launch_upvote();


-- ---------------------------------------------------------------------
-- 4. SOCIAL: COMMUNITIES + POSTS + DMs
-- ---------------------------------------------------------------------
create table if not exists public.communities (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete set null,
  name text not null,
  slug citext unique not null,
  description text,
  avatar_url text,
  banner_url text,
  is_private boolean not null default false,
  member_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.community_members (
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.lobby_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (community_id, user_id)
);

create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  community_id uuid references public.communities(id) on delete set null,
  content text not null,
  image_url text,
  ticker text,
  change_pct numeric(10,4),
  likes_count integer not null default 0,
  reposts_count integer not null default 0,
  comments_count integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists community_posts_user_idx on public.community_posts (user_id, created_at desc);
create index if not exists community_posts_community_idx on public.community_posts (community_id, created_at desc);

create table if not exists public.community_messages (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  attachments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists community_messages_idx on public.community_messages (community_id, created_at desc);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists chat_messages_thread_idx on public.chat_messages
  (least(sender_id,recipient_id), greatest(sender_id,recipient_id), created_at desc);

create table if not exists public.chat_tracked_wallets (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid,
  wallet_address text not null,
  label text,
  created_at timestamptz not null default now()
);


-- ---------------------------------------------------------------------
-- 5. TRADING LOBBIES (LiveKit-backed voice / chat rooms)
-- ---------------------------------------------------------------------
create table if not exists public.trading_lobbies (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id) on delete set null,
  name text not null,
  description text,
  avatar_url text,
  is_voice boolean not null default false,
  livekit_room_id text,
  member_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.lobby_members (
  lobby_id uuid not null references public.trading_lobbies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.lobby_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (lobby_id, user_id)
);

create table if not exists public.lobby_messages (
  id uuid primary key default gen_random_uuid(),
  lobby_id uuid not null references public.trading_lobbies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  attachments jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists lobby_messages_idx on public.lobby_messages (lobby_id, created_at desc);

create table if not exists public.lobby_watchlists (
  id uuid primary key default gen_random_uuid(),
  lobby_id uuid not null references public.trading_lobbies(id) on delete cascade,
  token_address text not null,
  symbol text,
  added_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (lobby_id, token_address)
);


-- ---------------------------------------------------------------------
-- 6. WATCHLISTS / WALLETS / ALERTS
-- ---------------------------------------------------------------------
create table if not exists public.tracked_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_address text not null,
  symbol text,
  name text,
  notes text,
  created_at timestamptz not null default now(),
  unique (user_id, token_address)
);
create index if not exists tracked_tokens_user_idx on public.tracked_tokens (user_id, created_at desc);

create table if not exists public.tracked_wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  wallet_address text not null,
  label text,
  notes text,
  created_at timestamptz not null default now(),
  unique (user_id, wallet_address)
);
create index if not exists tracked_wallets_user_idx on public.tracked_wallets (user_id, created_at desc);

create table if not exists public.price_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_address text not null,
  symbol text,
  target_price numeric(24,12),
  condition public.alert_condition not null default 'above',
  is_active boolean not null default true,
  triggered_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists price_alerts_user_idx on public.price_alerts (user_id, created_at desc);

create table if not exists public.enhanced_price_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_address text not null,
  symbol text,
  rules jsonb not null default '{}'::jsonb,
  channels text[] not null default '{push}',
  is_active boolean not null default true,
  last_fired_at timestamptz,
  created_at timestamptz not null default now()
);


-- ---------------------------------------------------------------------
-- 7. TRADING / PnL / PORTFOLIO
-- ---------------------------------------------------------------------
create table if not exists public.trade_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tx_signature text,
  token_address text not null,
  symbol text,
  side public.trade_side not null,
  amount numeric(38,12) not null,
  price_usd numeric(24,12),
  total_usd numeric(24,4),
  fee_usd numeric(20,6),
  venue text,
  meta jsonb not null default '{}'::jsonb,
  executed_at timestamptz not null default now()
);
create index if not exists trade_history_user_idx on public.trade_history (user_id, executed_at desc);
create index if not exists trade_history_tx_idx on public.trade_history (tx_signature);

create table if not exists public.pnl_positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_address text not null,
  symbol text,
  amount numeric(38,12) not null default 0,
  avg_cost_usd numeric(24,12),
  realized_pnl_usd numeric(24,6) not null default 0,
  unrealized_pnl_usd numeric(24,6) not null default 0,
  updated_at timestamptz not null default now(),
  unique (user_id, token_address)
);

create table if not exists public.portfolio_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  total_usd numeric(24,4) not null,
  sol_balance numeric(38,12),
  breakdown jsonb not null default '{}'::jsonb,
  taken_at timestamptz not null default now()
);
create index if not exists portfolio_snapshots_user_idx on public.portfolio_snapshots (user_id, taken_at desc);


-- ---------------------------------------------------------------------
-- 8. NOTIFICATIONS
-- ---------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind public.notification_kind not null,
  title text not null,
  body text,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);


-- ---------------------------------------------------------------------
-- 9. CREDITS / BILLING
-- ---------------------------------------------------------------------
create table if not exists public.user_credits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance integer not null default 0,
  lifetime_earned integer not null default 0,
  lifetime_spent integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  delta integer not null,
  reason text not null,
  ref_id text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists credit_tx_user_idx on public.credit_transactions (user_id, created_at desc);


-- ---------------------------------------------------------------------
-- 10. SUPPORT + ADMIN
-- ---------------------------------------------------------------------
create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  subject text not null,
  body text not null,
  status public.support_status not null default 'open',
  priority text not null default 'normal',
  attachments jsonb not null default '[]'::jsonb,
  assignee_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
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

create table if not exists public.platform_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);


-- ---------------------------------------------------------------------
-- 11. LIVE FEED (Helius/QuickNode/Alchemy webhook ingestion)
-- ---------------------------------------------------------------------
create table if not exists public.live_feed_events (
  id uuid primary key default gen_random_uuid(),
  source public.api_provider not null,
  event_type text not null,
  signature text,
  slot bigint,
  wallet_address text,
  token_address text,
  amount numeric(38,12),
  value_usd numeric(24,4),
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  ingested_at timestamptz not null default now()
);
create index if not exists live_feed_time_idx on public.live_feed_events (occurred_at desc);
create index if not exists live_feed_wallet_idx on public.live_feed_events (wallet_address, occurred_at desc);
create index if not exists live_feed_token_idx on public.live_feed_events (token_address, occurred_at desc);
create index if not exists live_feed_signature_idx on public.live_feed_events (signature);

create table if not exists public.user_webhooks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider public.api_provider not null,
  url text not null,
  secret text,
  filters jsonb not null default '{}'::jsonb,
  external_id text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists user_webhooks_user_idx on public.user_webhooks (user_id);


-- ---------------------------------------------------------------------
-- 12. INTEGRATIONS — API KEYS, CACHES, LIVEKIT
-- ---------------------------------------------------------------------

-- Server-side API credentials (write via service-role only).
-- Key material is stored encrypted in Vault; the row holds only the secret_id.
create table if not exists public.api_credentials (
  id uuid primary key default gen_random_uuid(),
  provider public.api_provider not null,
  label text not null,
  secret_id uuid,            -- references vault.secrets(id) once written
  public_config jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  rotated_at timestamptz,
  created_at timestamptz not null default now(),
  unique (provider, label)
);

-- Per-user provider credentials (e.g. user-supplied QuickNode endpoint).
create table if not exists public.user_api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider public.api_provider not null,
  label text not null,
  secret_id uuid,
  public_config jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, provider, label)
);

-- Provider-agnostic request log (useful for rate-limits & debugging).
create table if not exists public.provider_request_log (
  id bigserial primary key,
  provider public.api_provider not null,
  endpoint text not null,
  user_id uuid references auth.users(id) on delete set null,
  status_code integer,
  latency_ms integer,
  cost_credits integer not null default 0,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists provider_log_time_idx on public.provider_request_log (created_at desc);
create index if not exists provider_log_provider_idx on public.provider_request_log (provider, created_at desc);

-- Jupiter swap quote/cache + executions.
create table if not exists public.jupiter_quotes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  input_mint text not null,
  output_mint text not null,
  input_amount numeric(38,12) not null,
  output_amount numeric(38,12),
  price_impact_pct numeric(10,6),
  route jsonb not null,
  slippage_bps integer,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists jupiter_quotes_user_idx on public.jupiter_quotes (user_id, created_at desc);

create table if not exists public.jupiter_swaps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  quote_id uuid references public.jupiter_quotes(id) on delete set null,
  tx_signature text,
  status text not null default 'pending',
  error text,
  created_at timestamptz not null default now()
);

-- Helius webhook subscriptions + raw events.
create table if not exists public.helius_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  external_id text,
  webhook_url text not null,
  account_addresses text[] not null default '{}',
  transaction_types text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.helius_events (
  id bigserial primary key,
  subscription_id uuid references public.helius_subscriptions(id) on delete set null,
  signature text,
  slot bigint,
  type text,
  payload jsonb not null,
  received_at timestamptz not null default now()
);
create index if not exists helius_events_sig_idx on public.helius_events (signature);
create index if not exists helius_events_time_idx on public.helius_events (received_at desc);

-- Birdeye token cache + alert subscriptions.
create table if not exists public.birdeye_token_cache (
  token_address text primary key,
  symbol text,
  name text,
  decimals integer,
  price_usd numeric(24,12),
  liquidity_usd numeric(20,2),
  market_cap numeric(20,2),
  volume_24h_usd numeric(20,2),
  change_24h_pct numeric(10,4),
  holders integer,
  meta jsonb not null default '{}'::jsonb,
  refreshed_at timestamptz not null default now()
);

create table if not exists public.birdeye_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token_address text not null,
  channels text[] not null default '{price}',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, token_address)
);

-- Alchemy webhook config + events.
create table if not exists public.alchemy_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  external_id text,
  network text not null default 'solana-mainnet',
  webhook_type text,
  addresses text[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.alchemy_events (
  id bigserial primary key,
  subscription_id uuid references public.alchemy_subscriptions(id) on delete set null,
  signature text,
  payload jsonb not null,
  received_at timestamptz not null default now()
);

-- QuickNode endpoints (per-tenant RPC URLs).
create table if not exists public.quicknode_endpoints (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  label text not null,
  http_url text not null,
  wss_url text,
  network text not null default 'solana-mainnet',
  region text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- LiveKit rooms + participants (voice lobbies, AMA, support calls).
create table if not exists public.livekit_rooms (
  id uuid primary key default gen_random_uuid(),
  external_room_id text unique,
  kind public.livekit_room_kind not null default 'voice_lobby',
  name text not null,
  host_id uuid references auth.users(id) on delete set null,
  lobby_id uuid references public.trading_lobbies(id) on delete set null,
  community_id uuid references public.communities(id) on delete set null,
  max_participants integer not null default 50,
  metadata jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists livekit_rooms_host_idx on public.livekit_rooms (host_id);

create table if not exists public.livekit_participants (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.livekit_rooms(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  identity text not null,
  role text not null default 'listener',  -- host | speaker | listener
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  metadata jsonb not null default '{}'::jsonb
);
create index if not exists livekit_participants_room_idx on public.livekit_participants (room_id);

create table if not exists public.livekit_tokens (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.livekit_rooms(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  identity text not null,
  jwt text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists livekit_tokens_user_idx on public.livekit_tokens (user_id);


-- ---------------------------------------------------------------------
-- 13. TRIGGERS — updated_at + counters + new-user bootstrap
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

do $$
declare t record;
begin
  for t in
    select unnest(array[
      'profiles','pump_v5_submissions','support_tickets'
    ]) as tbl
  loop
    execute format('drop trigger if exists trg_touch_updated_at on public.%I', t.tbl);
    execute format(
      'create trigger trg_touch_updated_at before update on public.%I
       for each row execute function public.touch_updated_at()', t.tbl);
  end loop;
end $$;

-- Auto-create profile + settings + credits on new auth user.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, user_id, username, display_name)
  values (
    new.id,
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'username',''), split_part(new.email,'@',1)),
    coalesce(nullif(new.raw_user_meta_data->>'username',''), split_part(new.email,'@',1))
  )
  on conflict (id) do nothing;

  insert into public.user_settings (user_id) values (new.id) on conflict (user_id) do nothing;
  insert into public.user_credits  (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end $$;

drop trigger if exists trg_on_auth_user_created on auth.users;
create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Followers counters
create or replace function public.handle_followers_change()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    update public.profiles set followers_count = followers_count + 1 where id = new.followee_id;
    update public.profiles set following_count = following_count + 1 where id = new.follower_id;
  elsif tg_op = 'DELETE' then
    update public.profiles set followers_count = greatest(0, followers_count - 1) where id = old.followee_id;
    update public.profiles set following_count = greatest(0, following_count - 1) where id = old.follower_id;
  end if;
  return null;
end $$;

drop trigger if exists trg_followers_ins on public.followers;
create trigger trg_followers_ins after insert on public.followers
  for each row execute function public.handle_followers_change();
drop trigger if exists trg_followers_del on public.followers;
create trigger trg_followers_del after delete on public.followers
  for each row execute function public.handle_followers_change();

-- Community member counters
create or replace function public.handle_community_member_change()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    update public.communities set member_count = member_count + 1 where id = new.community_id;
  elsif tg_op = 'DELETE' then
    update public.communities set member_count = greatest(0, member_count - 1) where id = old.community_id;
  end if;
  return null;
end $$;
drop trigger if exists trg_community_members_ins on public.community_members;
create trigger trg_community_members_ins after insert on public.community_members
  for each row execute function public.handle_community_member_change();
drop trigger if exists trg_community_members_del on public.community_members;
create trigger trg_community_members_del after delete on public.community_members
  for each row execute function public.handle_community_member_change();

-- Lobby member counters
create or replace function public.handle_lobby_member_change()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    update public.trading_lobbies set member_count = member_count + 1 where id = new.lobby_id;
  elsif tg_op = 'DELETE' then
    update public.trading_lobbies set member_count = greatest(0, member_count - 1) where id = old.lobby_id;
  end if;
  return null;
end $$;
drop trigger if exists trg_lobby_members_ins on public.lobby_members;
create trigger trg_lobby_members_ins after insert on public.lobby_members
  for each row execute function public.handle_lobby_member_change();
drop trigger if exists trg_lobby_members_del on public.lobby_members;
create trigger trg_lobby_members_del after delete on public.lobby_members
  for each row execute function public.handle_lobby_member_change();


-- ---------------------------------------------------------------------
-- 14. ROW LEVEL SECURITY
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  for t in select unnest(array[
    'profiles','admin_roles','followers','user_settings','user_activity',
    'pump_v5_submissions','launch_upvotes',
    'communities','community_members','community_posts','community_messages',
    'chat_messages','chat_tracked_wallets',
    'trading_lobbies','lobby_members','lobby_messages','lobby_watchlists',
    'tracked_tokens','tracked_wallets','price_alerts','enhanced_price_alerts',
    'trade_history','pnl_positions','portfolio_snapshots',
    'notifications','user_credits','credit_transactions',
    'support_tickets','admin_audit_log','platform_settings',
    'live_feed_events','user_webhooks',
    'api_credentials','user_api_keys','provider_request_log',
    'jupiter_quotes','jupiter_swaps',
    'helius_subscriptions','helius_events',
    'birdeye_token_cache','birdeye_subscriptions',
    'alchemy_subscriptions','alchemy_events',
    'quicknode_endpoints',
    'livekit_rooms','livekit_participants','livekit_tokens'
  ])
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Helper to (re)create policies idempotently.
create or replace function public._policy(tbl text, name text, cmd text, sql text)
returns void language plpgsql as $$
begin
  execute format('drop policy if exists %I on public.%I', name, tbl);
  execute format('create policy %I on public.%I for %s %s', name, tbl, cmd, sql);
end $$;

-- profiles
select public._policy('profiles','profiles_read','select','using (true)');
select public._policy('profiles','profiles_insert_self','insert','with check (auth.uid() = id)');
select public._policy('profiles','profiles_update_self','update','using (auth.uid() = id) with check (auth.uid() = id)');

-- admin_roles (read-self / admin manage)
select public._policy('admin_roles','admin_roles_read','select','using (auth.uid() = user_id or public.is_admin(auth.uid()))');
select public._policy('admin_roles','admin_roles_admin','all','using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()))');

-- followers
select public._policy('followers','followers_read','select','using (true)');
select public._policy('followers','followers_insert','insert','with check (auth.uid() = follower_id)');
select public._policy('followers','followers_delete','delete','using (auth.uid() = follower_id)');

-- user_settings / user_activity / user_credits / credit_transactions / notifications / portfolio / pnl / trade_history
do $$
declare t text;
begin
  for t in select unnest(array[
    'user_settings','user_activity','user_credits','credit_transactions',
    'notifications','tracked_tokens','tracked_wallets','price_alerts',
    'enhanced_price_alerts','trade_history','pnl_positions','portfolio_snapshots',
    'user_webhooks','user_api_keys',
    'jupiter_quotes','jupiter_swaps',
    'helius_subscriptions','helius_events',
    'birdeye_subscriptions','alchemy_subscriptions','alchemy_events',
    'quicknode_endpoints'
  ])
  loop
    perform public._policy(t, t||'_owner_select','select','using (auth.uid() = user_id)');
    perform public._policy(t, t||'_owner_insert','insert','with check (auth.uid() = user_id)');
    perform public._policy(t, t||'_owner_update','update','using (auth.uid() = user_id) with check (auth.uid() = user_id)');
    perform public._policy(t, t||'_owner_delete','delete','using (auth.uid() = user_id)');
  end loop;
end $$;

-- pump_v5_submissions: public read, owner write
select public._policy('pump_v5_submissions','launch_read','select','using (true)');
select public._policy('pump_v5_submissions','launch_insert','insert','with check (auth.uid() = user_id)');
select public._policy('pump_v5_submissions','launch_update','update','using (auth.uid() = user_id or public.is_admin(auth.uid())) with check (auth.uid() = user_id or public.is_admin(auth.uid()))');
select public._policy('pump_v5_submissions','launch_delete','delete','using (auth.uid() = user_id or public.is_admin(auth.uid()))');

-- launch_upvotes
select public._policy('launch_upvotes','launch_upvotes_read','select','using (true)');
select public._policy('launch_upvotes','launch_upvotes_insert','insert','with check (auth.uid() = user_id)');
select public._policy('launch_upvotes','launch_upvotes_delete','delete','using (auth.uid() = user_id)');

-- communities (public read)
select public._policy('communities','communities_read','select','using (not is_private or exists (select 1 from public.community_members m where m.community_id = id and m.user_id = auth.uid()))');
select public._policy('communities','communities_insert','insert','with check (auth.uid() = owner_id)');
select public._policy('communities','communities_update','update','using (auth.uid() = owner_id or public.is_admin(auth.uid())) with check (auth.uid() = owner_id or public.is_admin(auth.uid()))');
select public._policy('communities','communities_delete','delete','using (auth.uid() = owner_id or public.is_admin(auth.uid()))');

-- community_members
select public._policy('community_members','cm_read','select','using (true)');
select public._policy('community_members','cm_join','insert','with check (auth.uid() = user_id)');
select public._policy('community_members','cm_leave','delete','using (auth.uid() = user_id)');

-- community_posts (public read, owner write)
select public._policy('community_posts','cp_read','select','using (true)');
select public._policy('community_posts','cp_insert','insert','with check (auth.uid() = user_id)');
select public._policy('community_posts','cp_update','update','using (auth.uid() = user_id) with check (auth.uid() = user_id)');
select public._policy('community_posts','cp_delete','delete','using (auth.uid() = user_id or public.is_admin(auth.uid()))');

-- community_messages: members only
select public._policy('community_messages','cmsg_read','select','using (exists (select 1 from public.community_members m where m.community_id = community_messages.community_id and m.user_id = auth.uid()))');
select public._policy('community_messages','cmsg_insert','insert','with check (auth.uid() = user_id and exists (select 1 from public.community_members m where m.community_id = community_messages.community_id and m.user_id = auth.uid()))');
select public._policy('community_messages','cmsg_delete','delete','using (auth.uid() = user_id or public.is_admin(auth.uid()))');

-- chat_messages: sender or recipient
select public._policy('chat_messages','dm_read','select','using (auth.uid() in (sender_id, recipient_id))');
select public._policy('chat_messages','dm_insert','insert','with check (auth.uid() = sender_id)');
select public._policy('chat_messages','dm_update','update','using (auth.uid() = recipient_id) with check (auth.uid() = recipient_id)');
select public._policy('chat_messages','dm_delete','delete','using (auth.uid() = sender_id)');

-- chat_tracked_wallets — public read for now
select public._policy('chat_tracked_wallets','ctw_read','select','using (true)');

-- trading_lobbies + members + messages
select public._policy('trading_lobbies','tl_read','select','using (true)');
select public._policy('trading_lobbies','tl_insert','insert','with check (auth.uid() = owner_id)');
select public._policy('trading_lobbies','tl_update','update','using (auth.uid() = owner_id or public.is_admin(auth.uid())) with check (auth.uid() = owner_id or public.is_admin(auth.uid()))');
select public._policy('trading_lobbies','tl_delete','delete','using (auth.uid() = owner_id or public.is_admin(auth.uid()))');

select public._policy('lobby_members','lm_read','select','using (true)');
select public._policy('lobby_members','lm_join','insert','with check (auth.uid() = user_id)');
select public._policy('lobby_members','lm_leave','delete','using (auth.uid() = user_id)');

select public._policy('lobby_messages','lmsg_read','select','using (exists (select 1 from public.lobby_members m where m.lobby_id = lobby_messages.lobby_id and m.user_id = auth.uid()))');
select public._policy('lobby_messages','lmsg_insert','insert','with check (auth.uid() = user_id and exists (select 1 from public.lobby_members m where m.lobby_id = lobby_messages.lobby_id and m.user_id = auth.uid()))');
select public._policy('lobby_messages','lmsg_delete','delete','using (auth.uid() = user_id or public.is_admin(auth.uid()))');

select public._policy('lobby_watchlists','lw_read','select','using (true)');
select public._policy('lobby_watchlists','lw_write','all','using (exists (select 1 from public.lobby_members m where m.lobby_id = lobby_watchlists.lobby_id and m.user_id = auth.uid())) with check (exists (select 1 from public.lobby_members m where m.lobby_id = lobby_watchlists.lobby_id and m.user_id = auth.uid()))');

-- support_tickets: owner or admin
select public._policy('support_tickets','st_select','select','using (auth.uid() = user_id or public.is_admin(auth.uid()))');
select public._policy('support_tickets','st_insert','insert','with check (auth.uid() = user_id)');
select public._policy('support_tickets','st_update','update','using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()))');

-- admin_audit_log + platform_settings: admin only (read of settings public)
select public._policy('admin_audit_log','aal_admin','all','using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()))');
select public._policy('platform_settings','ps_read','select','using (true)');
select public._policy('platform_settings','ps_admin','all','using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()))');

-- live_feed_events: public read
select public._policy('live_feed_events','lfe_read','select','using (true)');

-- api_credentials: admin only (clients never read provider secrets)
select public._policy('api_credentials','apicred_admin','all','using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()))');

-- provider_request_log: admin only
select public._policy('provider_request_log','prl_admin','all','using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()))');

-- birdeye_token_cache: public read
select public._policy('birdeye_token_cache','btc_read','select','using (true)');

-- LiveKit rooms: public read; insert by host; participants visible to room members
select public._policy('livekit_rooms','lkr_read','select','using (true)');
select public._policy('livekit_rooms','lkr_insert','insert','with check (auth.uid() = host_id)');
select public._policy('livekit_rooms','lkr_update','update','using (auth.uid() = host_id or public.is_admin(auth.uid())) with check (auth.uid() = host_id or public.is_admin(auth.uid()))');
select public._policy('livekit_rooms','lkr_delete','delete','using (auth.uid() = host_id or public.is_admin(auth.uid()))');

select public._policy('livekit_participants','lkp_read','select','using (true)');
select public._policy('livekit_participants','lkp_insert','insert','with check (auth.uid() = user_id)');
select public._policy('livekit_participants','lkp_delete','delete','using (auth.uid() = user_id or exists (select 1 from public.livekit_rooms r where r.id = room_id and r.host_id = auth.uid()))');

-- livekit_tokens: only the owning user can read their token row
select public._policy('livekit_tokens','lkt_read','select','using (auth.uid() = user_id)');


-- ---------------------------------------------------------------------
-- 15. STORAGE BUCKETS (run-once; safe to re-run)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public) values
  ('avatars',         'avatars',         true),
  ('banners',         'banners',         true),
  ('launch-logos',    'launch-logos',    true),
  ('launch-banners',  'launch-banners',  true),
  ('post-images',     'post-images',     true),
  ('community-media', 'community-media', true),
  ('support-attachments','support-attachments', false)
on conflict (id) do nothing;

-- Storage policies: authenticated users can write to their own folder (`<uid>/...`)
create or replace function public._storage_policy(bucket text)
returns void language plpgsql as $$
begin
  execute format($p$drop policy if exists %I on storage.objects$p$, bucket||'_read');
  execute format($p$drop policy if exists %I on storage.objects$p$, bucket||'_insert');
  execute format($p$drop policy if exists %I on storage.objects$p$, bucket||'_update');
  execute format($p$drop policy if exists %I on storage.objects$p$, bucket||'_delete');

  execute format($p$create policy %I on storage.objects for select using (bucket_id = %L)$p$, bucket||'_read', bucket);
  execute format($p$create policy %I on storage.objects for insert to authenticated with check (bucket_id = %L and (storage.foldername(name))[1] = auth.uid()::text)$p$, bucket||'_insert', bucket);
  execute format($p$create policy %I on storage.objects for update to authenticated using (bucket_id = %L and (storage.foldername(name))[1] = auth.uid()::text) with check (bucket_id = %L and (storage.foldername(name))[1] = auth.uid()::text)$p$, bucket||'_update', bucket, bucket);
  execute format($p$create policy %I on storage.objects for delete to authenticated using (bucket_id = %L and (storage.foldername(name))[1] = auth.uid()::text)$p$, bucket||'_delete', bucket);
end $$;

select public._storage_policy('avatars');
select public._storage_policy('banners');
select public._storage_policy('launch-logos');
select public._storage_policy('launch-banners');
select public._storage_policy('post-images');
select public._storage_policy('community-media');

-- Private bucket: support-attachments — owner-only access
drop policy if exists support_attachments_read on storage.objects;
drop policy if exists support_attachments_write on storage.objects;
create policy support_attachments_read on storage.objects
  for select to authenticated
  using (bucket_id = 'support-attachments' and (
    (storage.foldername(name))[1] = auth.uid()::text or public.is_admin(auth.uid())
  ));
create policy support_attachments_write on storage.objects
  for insert to authenticated
  with check (bucket_id = 'support-attachments' and (storage.foldername(name))[1] = auth.uid()::text);


-- ---------------------------------------------------------------------
-- 16. REALTIME — broadcast on the tables clients subscribe to
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  for t in select unnest(array[
    'pump_v5_submissions','community_posts','community_messages','chat_messages',
    'lobby_messages','notifications','live_feed_events','price_alerts',
    'trade_history','livekit_rooms','livekit_participants'
  ])
  loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null; when others then null; end;
  end loop;
end $$;


-- ---------------------------------------------------------------------
-- 17. SECRETS BOOTSTRAP (run by Supabase agent with service-role)
-- ---------------------------------------------------------------------
-- Insert the placeholder rows so the agent can attach Vault secret IDs later.
-- The actual API keys are stored in vault.secrets, not here.
insert into public.api_credentials (provider, label, public_config) values
  ('livekit',   'default', jsonb_build_object('ws_url','wss://YOUR-LIVEKIT-HOST')),
  ('jupiter',   'default', jsonb_build_object('base_url','https://quote-api.jup.ag/v6')),
  ('helius',    'default', jsonb_build_object('base_url','https://api.helius.xyz')),
  ('birdeye',   'default', jsonb_build_object('base_url','https://public-api.birdeye.so')),
  ('alchemy',   'default', jsonb_build_object('network','solana-mainnet')),
  ('quicknode', 'default', jsonb_build_object('network','solana-mainnet'))
on conflict (provider, label) do nothing;

-- Example Vault wiring (the agent should run something like):
--
--   select vault.create_secret('LIVEKIT_API_SECRET_VALUE','livekit_api_secret');
--   update public.api_credentials
--     set secret_id = (select id from vault.secrets where name = 'livekit_api_secret')
--     where provider = 'livekit' and label = 'default';
--
-- Repeat for HELIUS_API_KEY, BIRDEYE_API_KEY, ALCHEMY_API_KEY,
-- QUICKNODE_HTTP_URL, JUPITER (no key required), etc.

-- =====================================================================
-- END
-- =====================================================================
