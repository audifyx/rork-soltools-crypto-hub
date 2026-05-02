-- ==============================================================
-- Rork Solana Social Trading App — Complete Supabase Setup
-- Generated: 2026-05-02
-- 
-- HOW TO USE:
--   1. Open Supabase → SQL Editor → New Query
--   2. Paste this entire file
--   3. Run. Idempotent (safe to re-run).
-- 
-- Includes: schema, RLS, RPCs, storage buckets, triggers, indexes.
-- ==============================================================


-- ==============================================================
-- SECTION: supabase/migrations/20260501000000_full_schema.sql
-- ==============================================================

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


-- ==============================================================
-- SECTION: supabase/migrations/20260501010000_admin_dashboard.sql
-- ==============================================================

-- =====================================================================
-- Admin Dashboard support
-- - Bootstraps audifyx@gmail.com as the platform's only superadmin
-- - Adds RPC helpers so admins can manage other admins by email
-- - Adds RPC helpers for moderation actions on launchpad listings
-- - Adds aggregated stats RPC for the admin dashboard
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Hardened is_admin / has_admin_role helpers
-- ---------------------------------------------------------------------
create or replace function public.is_admin(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admin_roles where user_id = uid)
$$;

create or replace function public.has_admin_role(uid uuid, required text[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.admin_roles
    where user_id = uid and role = any(required)
  )
$$;

-- ---------------------------------------------------------------------
-- 2. Bootstrap audifyx@gmail.com as the only superadmin
-- ---------------------------------------------------------------------
do $$
declare
  target_id uuid;
begin
  select id into target_id from auth.users where lower(email) = 'audifyx@gmail.com' limit 1;
  if target_id is not null then
    insert into public.admin_roles (user_id, role, granted_by)
    values (target_id, 'superadmin', target_id)
    on conflict (user_id) do update set role = 'superadmin';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 3. Admin management RPCs (only superadmins can grant/revoke)
-- ---------------------------------------------------------------------
create or replace function public.admin_add_by_email(target_email text, target_role text default 'admin')
returns json language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  target_id uuid;
begin
  if caller is null then
    raise exception 'not authenticated';
  end if;
  if not public.has_admin_role(caller, array['superadmin']) then
    raise exception 'only superadmins can grant admin roles';
  end if;
  if target_role not in ('superadmin','admin','moderator','support') then
    raise exception 'invalid role: %', target_role;
  end if;

  select id into target_id from auth.users where lower(email) = lower(target_email) limit 1;
  if target_id is null then
    raise exception 'no user with email %', target_email;
  end if;

  insert into public.admin_roles (user_id, role, granted_by)
  values (target_id, target_role, caller)
  on conflict (user_id) do update set role = excluded.role, granted_by = excluded.granted_by;

  insert into public.admin_audit_log (admin_id, action, target_type, target_id, meta)
  values (caller, 'grant_role', 'user', target_id::text, json_build_object('role', target_role, 'email', target_email)::jsonb);

  return json_build_object('user_id', target_id, 'role', target_role);
end $$;

create or replace function public.admin_remove(target_user_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'not authenticated';
  end if;
  if not public.has_admin_role(caller, array['superadmin']) then
    raise exception 'only superadmins can revoke admin roles';
  end if;
  if target_user_id = caller then
    raise exception 'cannot revoke your own superadmin role here';
  end if;
  delete from public.admin_roles where user_id = target_user_id;

  insert into public.admin_audit_log (admin_id, action, target_type, target_id, meta)
  values (caller, 'revoke_role', 'user', target_user_id::text, '{}'::jsonb);

  return true;
end $$;

-- View admins with profile info (admin only)
create or replace function public.admin_list_admins()
returns table (
  user_id uuid,
  role text,
  granted_by uuid,
  created_at timestamptz,
  email text,
  username text,
  avatar_url text
) language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'admin only';
  end if;
  return query
    select ar.user_id, ar.role, ar.granted_by, ar.created_at,
           u.email::text, p.username, p.avatar_url
    from public.admin_roles ar
    left join auth.users u on u.id = ar.user_id
    left join public.profiles p on p.user_id = ar.user_id
    order by ar.created_at asc;
end $$;

-- ---------------------------------------------------------------------
-- 4. Launchpad moderation RPCs
-- ---------------------------------------------------------------------
create or replace function public.admin_set_listing_flags(
  submission_id uuid,
  set_featured boolean default null,
  set_verified boolean default null,
  set_hot boolean default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
begin
  if not public.is_admin(caller) then
    raise exception 'admin only';
  end if;
  update public.pump_v5_submissions
     set is_featured = coalesce(set_featured, is_featured),
         is_verified = coalesce(set_verified, is_verified),
         is_hot      = coalesce(set_hot, is_hot),
         updated_at  = now()
   where id = submission_id;

  insert into public.admin_audit_log (admin_id, action, target_type, target_id, meta)
  values (caller, 'listing_flags', 'pump_v5_submissions', submission_id::text,
          json_build_object('featured', set_featured, 'verified', set_verified, 'hot', set_hot)::jsonb);
end $$;

create or replace function public.admin_delete_listing(submission_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
begin
  if not public.is_admin(caller) then
    raise exception 'admin only';
  end if;
  delete from public.pump_v5_submissions where id = submission_id;
  insert into public.admin_audit_log (admin_id, action, target_type, target_id, meta)
  values (caller, 'listing_delete', 'pump_v5_submissions', submission_id::text, '{}'::jsonb);
end $$;

-- ---------------------------------------------------------------------
-- 5. Dashboard stats RPC
-- ---------------------------------------------------------------------
create or replace function public.admin_dashboard_stats()
returns json language plpgsql security definer set search_path = public as $$
declare
  result json;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'admin only';
  end if;
  select json_build_object(
    'users',           (select count(*) from public.profiles),
    'admins',          (select count(*) from public.admin_roles),
    'listings',        (select count(*) from public.pump_v5_submissions),
    'featured',        (select count(*) from public.pump_v5_submissions where is_featured),
    'verified',        (select count(*) from public.pump_v5_submissions where is_verified),
    'support_open',    (select count(*) from public.support_tickets where status = 'open'),
    'support_total',   (select count(*) from public.support_tickets),
    'new_users_7d',    (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'new_listings_7d', (select count(*) from public.pump_v5_submissions where created_at > now() - interval '7 days')
  ) into result;
  return result;
end $$;

-- ---------------------------------------------------------------------
-- 6. Support ticket update RPC (admins/support only)
-- ---------------------------------------------------------------------
create or replace function public.admin_update_ticket(
  ticket_id uuid,
  new_status public.support_status default null,
  new_priority text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
begin
  if not public.has_admin_role(caller, array['superadmin','admin','support','moderator']) then
    raise exception 'admin/support only';
  end if;
  update public.support_tickets
     set status = coalesce(new_status, status),
         priority = coalesce(new_priority, priority),
         assignee_id = coalesce(assignee_id, caller),
         updated_at = now()
   where id = ticket_id;

  insert into public.admin_audit_log (admin_id, action, target_type, target_id, meta)
  values (caller, 'ticket_update', 'support_tickets', ticket_id::text,
          json_build_object('status', new_status, 'priority', new_priority)::jsonb);
end $$;

-- ---------------------------------------------------------------------
-- 7. Grants
-- ---------------------------------------------------------------------
grant execute on function public.admin_add_by_email(text, text) to authenticated;
grant execute on function public.admin_remove(uuid) to authenticated;
grant execute on function public.admin_list_admins() to authenticated;
grant execute on function public.admin_set_listing_flags(uuid, boolean, boolean, boolean) to authenticated;
grant execute on function public.admin_delete_listing(uuid) to authenticated;
grant execute on function public.admin_dashboard_stats() to authenticated;
grant execute on function public.admin_update_ticket(uuid, public.support_status, text) to authenticated;
grant execute on function public.is_admin(uuid) to authenticated, anon;
grant execute on function public.has_admin_role(uuid, text[]) to authenticated;


-- ==============================================================
-- SECTION: supabase/migrations/20260501020000_profiles_social.sql
-- ==============================================================

-- =====================================================================
-- Profiles social — banner uploads, custom verify "bags" / badges,
-- follow/unfollow RPCs, public profile lookup, admin badge controls.
-- =====================================================================

-- 1. Schema additions ------------------------------------------------------

alter table public.profiles
  add column if not exists display_name text,
  add column if not exists banner_url text,
  add column if not exists avatar_color text,
  add column if not exists banner_from text,
  add column if not exists banner_to text,
  add column if not exists custom_badges jsonb not null default '[]'::jsonb,
  add column if not exists is_banned boolean not null default false;

create index if not exists profiles_handle_lookup_idx on public.profiles ((lower(username::text)));

-- 2. Storage bucket for profile media -------------------------------------

insert into storage.buckets (id, name, public)
values ('profile-media', 'profile-media', true)
on conflict (id) do update set public = excluded.public;

do $$
begin
  -- Public read
  begin
    execute 'drop policy if exists "profile_media_public_read" on storage.objects';
  exception when others then null;
  end;
  execute $p$create policy "profile_media_public_read" on storage.objects
    for select using (bucket_id = 'profile-media')$p$;

  -- Owner write (path starts with auth.uid())
  begin
    execute 'drop policy if exists "profile_media_owner_write" on storage.objects';
  exception when others then null;
  end;
  execute $p$create policy "profile_media_owner_write" on storage.objects
    for insert with check (
      bucket_id = 'profile-media'
      and auth.uid() is not null
      and (storage.foldername(name))[1] = auth.uid()::text
    )$p$;

  begin
    execute 'drop policy if exists "profile_media_owner_update" on storage.objects';
  exception when others then null;
  end;
  execute $p$create policy "profile_media_owner_update" on storage.objects
    for update using (
      bucket_id = 'profile-media'
      and auth.uid() is not null
      and (storage.foldername(name))[1] = auth.uid()::text
    )$p$;

  begin
    execute 'drop policy if exists "profile_media_owner_delete" on storage.objects';
  exception when others then null;
  end;
  execute $p$create policy "profile_media_owner_delete" on storage.objects
    for delete using (
      bucket_id = 'profile-media'
      and auth.uid() is not null
      and (storage.foldername(name))[1] = auth.uid()::text
    )$p$;
end $$;

-- 3. Follow / unfollow RPC -------------------------------------------------

create or replace function public.toggle_follow(target_user_id uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  exists_row boolean;
begin
  if caller is null then
    raise exception 'not authenticated';
  end if;
  if caller = target_user_id then
    raise exception 'cannot follow yourself';
  end if;

  select exists(
    select 1 from public.followers
     where follower_id = caller and followee_id = target_user_id
  ) into exists_row;

  if exists_row then
    delete from public.followers
     where follower_id = caller and followee_id = target_user_id;
    return false;
  else
    insert into public.followers (follower_id, followee_id)
    values (caller, target_user_id)
    on conflict do nothing;
    return true;
  end if;
end $$;

grant execute on function public.toggle_follow(uuid) to authenticated;

-- 4. Public profile lookup -------------------------------------------------

create or replace function public.get_profile_by_handle(handle text)
returns table (
  id uuid,
  username text,
  display_name text,
  bio text,
  avatar_url text,
  banner_url text,
  avatar_color text,
  banner_from text,
  banner_to text,
  wallet_address text,
  twitter_handle text,
  website text,
  location text,
  badge text,
  verified boolean,
  custom_badges jsonb,
  followers_count integer,
  following_count integer,
  trades_count integer,
  win_rate numeric,
  pnl_pct numeric,
  xp integer,
  created_at timestamptz,
  is_following boolean
) language plpgsql security definer set search_path = public as $$
declare
  clean text := regexp_replace(handle, '^@', '');
  caller uuid := auth.uid();
begin
  return query
    select p.id,
           p.username::text,
           p.display_name,
           p.bio,
           p.avatar_url,
           p.banner_url,
           p.avatar_color,
           p.banner_from,
           p.banner_to,
           p.wallet_address,
           p.twitter_handle,
           p.website,
           p.location,
           p.badge,
           p.verified,
           p.custom_badges,
           p.followers_count,
           p.following_count,
           p.trades_count,
           p.win_rate,
           p.pnl_pct,
           p.xp,
           p.created_at,
           case when caller is null then false
                else exists(select 1 from public.followers f
                            where f.follower_id = caller and f.followee_id = p.id)
           end as is_following
      from public.profiles p
     where lower(p.username::text) = lower(clean);
end $$;

grant execute on function public.get_profile_by_handle(text) to authenticated, anon;

-- Lookup followers / following lists ---------------------------------------

create or replace function public.list_following(target_user_id uuid)
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  verified boolean,
  custom_badges jsonb
) language sql stable security definer set search_path = public as $$
  select p.id, p.username::text, p.display_name, p.avatar_url, p.verified, p.custom_badges
    from public.followers f
    join public.profiles p on p.id = f.followee_id
   where f.follower_id = target_user_id
   order by f.created_at desc
   limit 500
$$;

create or replace function public.list_followers(target_user_id uuid)
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  verified boolean,
  custom_badges jsonb
) language sql stable security definer set search_path = public as $$
  select p.id, p.username::text, p.display_name, p.avatar_url, p.verified, p.custom_badges
    from public.followers f
    join public.profiles p on p.id = f.follower_id
   where f.followee_id = target_user_id
   order by f.created_at desc
   limit 500
$$;

grant execute on function public.list_following(uuid) to authenticated, anon;
grant execute on function public.list_followers(uuid) to authenticated, anon;

-- 5. Admin: search + manage user badges -----------------------------------

create or replace function public.admin_search_users(q text default '', max_rows int default 50)
returns table (
  user_id uuid,
  email text,
  username text,
  display_name text,
  avatar_url text,
  verified boolean,
  badge text,
  custom_badges jsonb,
  is_banned boolean,
  followers_count integer,
  created_at timestamptz
) language plpgsql security definer set search_path = public as $$
declare
  needle text := nullif(trim(q), '');
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'admin only';
  end if;
  return query
    select p.id,
           u.email::text,
           p.username::text,
           p.display_name,
           p.avatar_url,
           p.verified,
           p.badge,
           p.custom_badges,
           p.is_banned,
           p.followers_count,
           p.created_at
      from public.profiles p
      left join auth.users u on u.id = p.id
     where needle is null
        or u.email::text ilike '%' || needle || '%'
        or p.username::text ilike '%' || needle || '%'
        or p.display_name ilike '%' || needle || '%'
     order by p.created_at desc
     limit greatest(1, least(max_rows, 200));
end $$;

grant execute on function public.admin_search_users(text, int) to authenticated;

create or replace function public.admin_set_user_flags(
  target_user_id uuid,
  set_verified boolean default null,
  set_badge text default null,
  set_banned boolean default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
begin
  if not public.is_admin(caller) then
    raise exception 'admin only';
  end if;
  update public.profiles
     set verified = coalesce(set_verified, verified),
         badge    = coalesce(set_badge, badge),
         is_banned = coalesce(set_banned, is_banned),
         updated_at = now()
   where id = target_user_id;

  insert into public.admin_audit_log (admin_id, action, target_type, target_id, meta)
  values (caller, 'user_flags', 'profiles', target_user_id::text,
          json_build_object('verified', set_verified, 'badge', set_badge, 'banned', set_banned)::jsonb);
end $$;

grant execute on function public.admin_set_user_flags(uuid, boolean, text, boolean) to authenticated;

create or replace function public.admin_add_badge(
  target_user_id uuid,
  badge_id text,
  badge_label text,
  badge_color text default '#FFD56B',
  badge_icon text default 'shield'
) returns jsonb language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  current jsonb;
  next jsonb;
begin
  if not public.is_admin(caller) then
    raise exception 'admin only';
  end if;
  select coalesce(custom_badges, '[]'::jsonb) into current
    from public.profiles where id = target_user_id;
  if current is null then
    raise exception 'user not found';
  end if;

  -- remove any existing entry with same id, then append
  next := coalesce(
    (select jsonb_agg(b) from jsonb_array_elements(current) b
       where coalesce(b->>'id','') <> badge_id),
    '[]'::jsonb
  );
  next := next || jsonb_build_array(jsonb_build_object(
    'id', badge_id,
    'label', badge_label,
    'color', coalesce(badge_color, '#FFD56B'),
    'icon', coalesce(badge_icon, 'shield'),
    'granted_at', to_jsonb(now())
  ));

  update public.profiles set custom_badges = next, updated_at = now()
   where id = target_user_id;

  insert into public.admin_audit_log (admin_id, action, target_type, target_id, meta)
  values (caller, 'badge_grant', 'profiles', target_user_id::text,
          jsonb_build_object('id', badge_id, 'label', badge_label, 'color', badge_color, 'icon', badge_icon));

  return next;
end $$;

create or replace function public.admin_remove_badge(target_user_id uuid, badge_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  current jsonb;
  next jsonb;
begin
  if not public.is_admin(caller) then
    raise exception 'admin only';
  end if;
  select coalesce(custom_badges, '[]'::jsonb) into current
    from public.profiles where id = target_user_id;
  next := coalesce(
    (select jsonb_agg(b) from jsonb_array_elements(current) b
       where coalesce(b->>'id','') <> badge_id),
    '[]'::jsonb
  );
  update public.profiles set custom_badges = next, updated_at = now()
   where id = target_user_id;

  insert into public.admin_audit_log (admin_id, action, target_type, target_id, meta)
  values (caller, 'badge_revoke', 'profiles', target_user_id::text,
          jsonb_build_object('id', badge_id));
  return next;
end $$;

grant execute on function public.admin_add_badge(uuid, text, text, text, text) to authenticated;
grant execute on function public.admin_remove_badge(uuid, text) to authenticated;

-- 6. Public profile search (for following discovery) ---------------------

create or replace function public.search_profiles(q text, max_rows int default 25)
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  verified boolean,
  custom_badges jsonb,
  followers_count integer
) language sql stable security definer set search_path = public as $$
  select p.id, p.username::text, p.display_name, p.avatar_url, p.verified,
         p.custom_badges, p.followers_count
    from public.profiles p
   where length(trim(coalesce(q,''))) = 0
      or p.username::text ilike '%' || trim(q) || '%'
      or p.display_name ilike '%' || trim(q) || '%'
   order by p.followers_count desc, p.created_at desc
   limit greatest(1, least(max_rows, 100))
$$;

grant execute on function public.search_profiles(text, int) to authenticated, anon;


-- ==============================================================
-- SECTION: supabase/migrations/20260501030000_feed_likes_whales.sql
-- ==============================================================

-- =====================================================================
-- Feed essentials: post likes, whale events, and the Following feed RPC.
-- These power the Home tab's For You / Following / Whales filters and
-- post like state across the app.
-- =====================================================================

-- 1. post_likes ---------------------------------------------------------
create table if not exists public.post_likes (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index if not exists post_likes_user_idx on public.post_likes (user_id, created_at desc);
create index if not exists post_likes_post_idx on public.post_likes (post_id);

alter table public.post_likes enable row level security;

do $$
begin
  begin
    execute 'drop policy if exists "post_likes_read" on public.post_likes';
  exception when others then null;
  end;
  execute $p$create policy "post_likes_read" on public.post_likes
    for select using (true)$p$;

  begin
    execute 'drop policy if exists "post_likes_write_self" on public.post_likes';
  exception when others then null;
  end;
  execute $p$create policy "post_likes_write_self" on public.post_likes
    for insert with check (auth.uid() = user_id)$p$;

  begin
    execute 'drop policy if exists "post_likes_delete_self" on public.post_likes';
  exception when others then null;
  end;
  execute $p$create policy "post_likes_delete_self" on public.post_likes
    for delete using (auth.uid() = user_id)$p$;
end $$;

-- Maintain likes_count on community_posts ------------------------------
create or replace function public.handle_post_like_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.community_posts
       set likes_count = likes_count + 1
     where id = new.post_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.community_posts
       set likes_count = greatest(0, likes_count - 1)
     where id = old.post_id;
    return old;
  end if;
  return null;
end $$;

drop trigger if exists post_likes_count_trg on public.post_likes;
create trigger post_likes_count_trg
after insert or delete on public.post_likes
for each row execute function public.handle_post_like_change();

-- 2. whale_events -------------------------------------------------------
create table if not exists public.whale_events (
  id uuid primary key default gen_random_uuid(),
  wallet_address text not null,
  token_address text,
  symbol text,
  side text not null check (side in ('buy','sell','transfer')),
  amount_usd numeric(20,4),
  amount_token numeric(30,8),
  tx_signature text,
  created_at timestamptz not null default now()
);

create index if not exists whale_events_recent_idx on public.whale_events (created_at desc);
create index if not exists whale_events_token_idx on public.whale_events (token_address);

alter table public.whale_events enable row level security;

do $$
begin
  begin
    execute 'drop policy if exists "whale_events_read" on public.whale_events';
  exception when others then null;
  end;
  execute $p$create policy "whale_events_read" on public.whale_events
    for select using (true)$p$;
end $$;

-- 3. Following feed RPC -------------------------------------------------
create or replace function public.get_following_feed(max_rows int default 50)
returns table (
  id uuid,
  user_id uuid,
  content text,
  image_url text,
  ticker text,
  change_pct numeric,
  likes_count integer,
  reposts_count integer,
  comments_count integer,
  created_at timestamptz
) language sql stable security definer set search_path = public as $$
  select cp.id,
         cp.user_id,
         cp.content,
         cp.image_url,
         cp.ticker,
         cp.change_pct,
         cp.likes_count,
         cp.reposts_count,
         cp.comments_count,
         cp.created_at
    from public.community_posts cp
    join public.followers f on f.followee_id = cp.user_id
   where f.follower_id = auth.uid()
   order by cp.created_at desc
   limit greatest(1, least(max_rows, 200))
$$;

grant execute on function public.get_following_feed(int) to authenticated;


-- ==============================================================
-- SECTION: supabase/migrations/20260501040000_audifyx_owner.sql
-- ==============================================================

-- =====================================================================
-- Owner bootstrap + new-user blank profile defaults
--
-- 1. Make sure every new auth user gets a fresh profile with NO avatar
--    and NO banner — they upload one at sign-up or anytime later.
-- 2. Bootstrap audifyx@gmail.com as the platform owner with:
--      - superadmin role
--      - verified = true
--      - custom_badges: OWNER + DEV
--      - a permanent custom avatar + banner
--    These flags are preserved every time the bootstrap runs (idempotent).
-- 3. Re-bootstraps automatically the moment audifyx@gmail.com signs up.
-- =====================================================================

-- --------------------------------------------------------------------
-- 1. handle_new_user — blank media for everyone except audifyx
-- --------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  is_owner boolean := lower(coalesce(new.email, '')) = 'audifyx@gmail.com';
  owner_avatar text := 'https://r2-pub.rork.com/generated-images/690ae05a-2c77-4177-aebc-813612d3370c.png';
  owner_banner text := 'https://r2-pub.rork.com/generated-images/4d5d4184-779c-4b8a-95ad-eddddb365d09.png';
  owner_badges jsonb := jsonb_build_array(
    jsonb_build_object('id','owner','label','OWNER','color','#FFD56B','icon','crown','granted_at', to_jsonb(now())),
    jsonb_build_object('id','dev','label','DEV','color','#38D7FF','icon','code','granted_at', to_jsonb(now()))
  );
begin
  insert into public.profiles (
    id, user_id, username, display_name,
    avatar_url, banner_url,
    verified, custom_badges
  )
  values (
    new.id,
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'username',''), split_part(new.email,'@',1)),
    coalesce(nullif(new.raw_user_meta_data->>'username',''), split_part(new.email,'@',1)),
    case when is_owner then owner_avatar else null end,
    case when is_owner then owner_banner else null end,
    case when is_owner then true else false end,
    case when is_owner then owner_badges else '[]'::jsonb end
  )
  on conflict (id) do update
    set avatar_url   = case when is_owner then owner_avatar else public.profiles.avatar_url end,
        banner_url   = case when is_owner then owner_banner else public.profiles.banner_url end,
        verified     = case when is_owner then true else public.profiles.verified end,
        custom_badges = case when is_owner then owner_badges else public.profiles.custom_badges end,
        updated_at   = now();

  insert into public.user_settings (user_id) values (new.id) on conflict (user_id) do nothing;
  insert into public.user_credits  (user_id) values (new.id) on conflict (user_id) do nothing;

  if is_owner then
    insert into public.admin_roles (user_id, role, granted_by)
    values (new.id, 'superadmin', new.id)
    on conflict (user_id) do update set role = 'superadmin';
  end if;

  return new;
end $$;

drop trigger if exists trg_on_auth_user_created on auth.users;
create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- --------------------------------------------------------------------
-- 2. One-shot bootstrap if the owner already exists
-- --------------------------------------------------------------------
do $$
declare
  owner_id uuid;
  owner_avatar text := 'https://r2-pub.rork.com/generated-images/690ae05a-2c77-4177-aebc-813612d3370c.png';
  owner_banner text := 'https://r2-pub.rork.com/generated-images/4d5d4184-779c-4b8a-95ad-eddddb365d09.png';
  owner_badges jsonb := jsonb_build_array(
    jsonb_build_object('id','owner','label','OWNER','color','#FFD56B','icon','crown','granted_at', to_jsonb(now())),
    jsonb_build_object('id','dev','label','DEV','color','#38D7FF','icon','code','granted_at', to_jsonb(now()))
  );
begin
  select id into owner_id from auth.users where lower(email) = 'audifyx@gmail.com' limit 1;
  if owner_id is null then
    return;
  end if;

  -- Make sure profile row exists
  insert into public.profiles (id, user_id, username, display_name)
  values (owner_id, owner_id, 'audifyx', 'Audifyx')
  on conflict (id) do nothing;

  update public.profiles
     set avatar_url    = owner_avatar,
         banner_url    = owner_banner,
         verified      = true,
         badge         = coalesce(badge, 'owner'),
         display_name  = coalesce(nullif(display_name, ''), 'Audifyx'),
         username      = coalesce(nullif(username::text, ''), 'audifyx'),
         custom_badges = owner_badges,
         updated_at    = now()
   where id = owner_id;

  insert into public.admin_roles (user_id, role, granted_by)
  values (owner_id, 'superadmin', owner_id)
  on conflict (user_id) do update set role = 'superadmin';

  insert into public.user_settings (user_id) values (owner_id) on conflict (user_id) do nothing;
  insert into public.user_credits  (user_id) values (owner_id) on conflict (user_id) do nothing;
end $$;

-- --------------------------------------------------------------------
-- 3. Safety net: protect owner badges from being wiped by upserts
-- --------------------------------------------------------------------
create or replace function public.preserve_owner_identity()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  is_owner boolean;
begin
  select lower(email) = 'audifyx@gmail.com' into is_owner
    from auth.users where id = new.id;
  if coalesce(is_owner, false) then
    new.verified := true;
    if new.custom_badges is null
       or jsonb_typeof(new.custom_badges) <> 'array'
       or jsonb_array_length(new.custom_badges) = 0 then
      new.custom_badges := jsonb_build_array(
        jsonb_build_object('id','owner','label','OWNER','color','#FFD56B','icon','crown'),
        jsonb_build_object('id','dev','label','DEV','color','#38D7FF','icon','code')
      );
    end if;
    if new.avatar_url is null or new.avatar_url = '' then
      new.avatar_url := 'https://r2-pub.rork.com/generated-images/690ae05a-2c77-4177-aebc-813612d3370c.png';
    end if;
    if new.banner_url is null or new.banner_url = '' then
      new.banner_url := 'https://r2-pub.rork.com/generated-images/4d5d4184-779c-4b8a-95ad-eddddb365d09.png';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_preserve_owner_identity on public.profiles;
create trigger trg_preserve_owner_identity
  before insert or update on public.profiles
  for each row execute function public.preserve_owner_identity();


-- ==============================================================
-- SECTION: supabase/migrations/20260501050000_audifyx_owner_assets.sql
-- ==============================================================

-- =====================================================================
-- Audifyx owner profile — final custom avatar + banner
--
-- Locks in the real branded avatar & banner generated for the platform
-- owner (audifyx@gmail.com), refreshes the OWNER + DEV badges, and
-- guarantees the bootstrap survives every future sign-in / upsert.
--
-- Safe to run repeatedly. Only touches the owner row.
-- =====================================================================

-- 1. Refresh the new-user trigger with final asset URLs ---------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  is_owner boolean := lower(coalesce(new.email, '')) = 'audifyx@gmail.com';
  owner_avatar text := 'https://r2-pub.rork.com/generated-images/cf1055f1-cb3f-45fa-9d53-e7bf835bd3fe.png';
  owner_banner text := 'https://r2-pub.rork.com/generated-images/647148c5-8a0c-4947-ba97-f62b44261d5b.png';
  owner_badges jsonb := jsonb_build_array(
    jsonb_build_object('id','owner','label','OWNER','color','#FFD56B','icon','crown','granted_at', to_jsonb(now())),
    jsonb_build_object('id','dev','label','DEV','color','#38D7FF','icon','code','granted_at', to_jsonb(now()))
  );
begin
  insert into public.profiles (
    id, user_id, username, display_name,
    avatar_url, banner_url,
    verified, custom_badges
  )
  values (
    new.id,
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'username',''), split_part(new.email,'@',1)),
    coalesce(nullif(new.raw_user_meta_data->>'username',''), split_part(new.email,'@',1)),
    case when is_owner then owner_avatar else null end,
    case when is_owner then owner_banner else null end,
    case when is_owner then true else false end,
    case when is_owner then owner_badges else '[]'::jsonb end
  )
  on conflict (id) do update
    set avatar_url    = case when is_owner then owner_avatar else public.profiles.avatar_url end,
        banner_url    = case when is_owner then owner_banner else public.profiles.banner_url end,
        verified      = case when is_owner then true else public.profiles.verified end,
        custom_badges = case when is_owner then owner_badges else public.profiles.custom_badges end,
        updated_at    = now();

  insert into public.user_settings (user_id) values (new.id) on conflict (user_id) do nothing;
  insert into public.user_credits  (user_id) values (new.id) on conflict (user_id) do nothing;

  if is_owner then
    insert into public.admin_roles (user_id, role, granted_by)
    values (new.id, 'superadmin', new.id)
    on conflict (user_id) do update set role = 'superadmin';
  end if;

  return new;
end $$;

drop trigger if exists trg_on_auth_user_created on auth.users;
create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 2. Refresh the safety-net trigger so future profile updates can't
--    erase the owner's branded media or badges --------------------------
create or replace function public.preserve_owner_identity()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  is_owner boolean;
  owner_avatar text := 'https://r2-pub.rork.com/generated-images/cf1055f1-cb3f-45fa-9d53-e7bf835bd3fe.png';
  owner_banner text := 'https://r2-pub.rork.com/generated-images/647148c5-8a0c-4947-ba97-f62b44261d5b.png';
begin
  select lower(email) = 'audifyx@gmail.com' into is_owner
    from auth.users where id = new.id;
  if coalesce(is_owner, false) then
    new.verified := true;
    if new.custom_badges is null
       or jsonb_typeof(new.custom_badges) <> 'array'
       or jsonb_array_length(new.custom_badges) = 0 then
      new.custom_badges := jsonb_build_array(
        jsonb_build_object('id','owner','label','OWNER','color','#FFD56B','icon','crown'),
        jsonb_build_object('id','dev','label','DEV','color','#38D7FF','icon','code')
      );
    end if;
    if new.avatar_url is null or new.avatar_url = '' then
      new.avatar_url := owner_avatar;
    end if;
    if new.banner_url is null or new.banner_url = '' then
      new.banner_url := owner_banner;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_preserve_owner_identity on public.profiles;
create trigger trg_preserve_owner_identity
  before insert or update on public.profiles
  for each row execute function public.preserve_owner_identity();

-- 3. One-shot bootstrap if the owner already exists --------------------
do $$
declare
  owner_id uuid;
  owner_avatar text := 'https://r2-pub.rork.com/generated-images/cf1055f1-cb3f-45fa-9d53-e7bf835bd3fe.png';
  owner_banner text := 'https://r2-pub.rork.com/generated-images/647148c5-8a0c-4947-ba97-f62b44261d5b.png';
  owner_badges jsonb := jsonb_build_array(
    jsonb_build_object('id','owner','label','OWNER','color','#FFD56B','icon','crown','granted_at', to_jsonb(now())),
    jsonb_build_object('id','dev','label','DEV','color','#38D7FF','icon','code','granted_at', to_jsonb(now()))
  );
begin
  select id into owner_id from auth.users where lower(email) = 'audifyx@gmail.com' limit 1;
  if owner_id is null then
    return;
  end if;

  insert into public.profiles (id, user_id, username, display_name)
  values (owner_id, owner_id, 'audifyx', 'Audifyx')
  on conflict (id) do nothing;

  update public.profiles
     set avatar_url    = owner_avatar,
         banner_url    = owner_banner,
         verified      = true,
         badge         = coalesce(badge, 'owner'),
         display_name  = coalesce(nullif(display_name, ''), 'Audifyx'),
         username      = coalesce(nullif(username::text, ''), 'audifyx'),
         custom_badges = owner_badges,
         updated_at    = now()
   where id = owner_id;

  insert into public.admin_roles (user_id, role, granted_by)
  values (owner_id, 'superadmin', owner_id)
  on conflict (user_id) do update set role = 'superadmin';

  insert into public.user_settings (user_id) values (owner_id) on conflict (user_id) do nothing;
  insert into public.user_credits  (user_id) values (owner_id) on conflict (user_id) do nothing;
end $$;


-- ==============================================================
-- SECTION: supabase/migrations/20260501060000_users_presence.sql
-- ==============================================================

-- =====================================================================
-- Users + Presence
--
-- 1. Hardens the public storage buckets used for profile avatar/banner
--    uploads (and post images), so any signed-in user can write to
--    their own folder and read all media.
-- 2. Adds a `user_presence` table with realtime online tracking.
-- 3. Adds RPCs to heartbeat presence and to list all users / online
--    users for the new in-app Users tab.
--
-- Safe to run multiple times.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Storage buckets (idempotent) -------------------------------------
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public) values
  ('profile-media', 'profile-media', true),
  ('post-images',   'post-images',   true)
on conflict (id) do update set public = excluded.public;

do $$
declare
  buckets text[] := array['profile-media','post-images'];
  b text;
begin
  foreach b in array buckets loop
    execute format('drop policy if exists %I on storage.objects', b || '_public_read');
    execute format('drop policy if exists %I on storage.objects', b || '_owner_insert');
    execute format('drop policy if exists %I on storage.objects', b || '_owner_update');
    execute format('drop policy if exists %I on storage.objects', b || '_owner_delete');

    execute format(
      $p$create policy %I on storage.objects for select using (bucket_id = %L)$p$,
      b || '_public_read', b
    );
    execute format(
      $p$create policy %I on storage.objects for insert to authenticated
         with check (bucket_id = %L and (storage.foldername(name))[1] = auth.uid()::text)$p$,
      b || '_owner_insert', b
    );
    execute format(
      $p$create policy %I on storage.objects for update to authenticated
         using (bucket_id = %L and (storage.foldername(name))[1] = auth.uid()::text)
         with check (bucket_id = %L and (storage.foldername(name))[1] = auth.uid()::text)$p$,
      b || '_owner_update', b, b
    );
    execute format(
      $p$create policy %I on storage.objects for delete to authenticated
         using (bucket_id = %L and (storage.foldername(name))[1] = auth.uid()::text)$p$,
      b || '_owner_delete', b
    );
  end loop;
end $$;


-- ---------------------------------------------------------------------
-- 2. Presence table ---------------------------------------------------
-- ---------------------------------------------------------------------
create table if not exists public.user_presence (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  status     text not null default 'online' check (status in ('online','away','offline')),
  last_seen  timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_presence_last_seen_idx
  on public.user_presence (last_seen desc);

alter table public.user_presence enable row level security;

drop policy if exists user_presence_read on public.user_presence;
create policy user_presence_read on public.user_presence
  for select using (true);

drop policy if exists user_presence_self_write on public.user_presence;
create policy user_presence_self_write on public.user_presence
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists user_presence_self_update on public.user_presence;
create policy user_presence_self_update on public.user_presence
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Realtime publication
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'user_presence'
  ) then
    execute 'alter publication supabase_realtime add table public.user_presence';
  end if;
exception when others then null;
end $$;


-- ---------------------------------------------------------------------
-- 3. RPCs --------------------------------------------------------------
-- ---------------------------------------------------------------------

-- Heartbeat: caller is online right now.
create or replace function public.heartbeat(set_status text default 'online')
returns void
language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  s text := coalesce(nullif(set_status, ''), 'online');
begin
  if caller is null then
    return;
  end if;
  if s not in ('online','away','offline') then
    s := 'online';
  end if;
  insert into public.user_presence (user_id, status, last_seen, updated_at)
  values (caller, s, now(), now())
  on conflict (user_id) do update
    set status = excluded.status,
        last_seen = excluded.last_seen,
        updated_at = now();
end $$;

grant execute on function public.heartbeat(text) to authenticated;

-- Sign-out helper: mark caller offline.
create or replace function public.set_offline()
returns void
language plpgsql security definer set search_path = public as $$
declare caller uuid := auth.uid();
begin
  if caller is null then return; end if;
  update public.user_presence
     set status = 'offline', updated_at = now()
   where user_id = caller;
end $$;

grant execute on function public.set_offline() to authenticated;

-- List users for the Users tab.
-- `online_only`=true filters to last_seen within 90 seconds.
create or replace function public.list_users(
  q text default '',
  online_only boolean default false,
  max_rows int default 100
) returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  banner_url text,
  bio text,
  verified boolean,
  custom_badges jsonb,
  followers_count integer,
  is_online boolean,
  last_seen timestamptz,
  created_at timestamptz,
  is_following boolean
) language plpgsql stable security definer set search_path = public as $$
declare
  needle text := nullif(trim(q), '');
  caller uuid := auth.uid();
  cutoff timestamptz := now() - interval '90 seconds';
begin
  return query
    select p.id,
           p.username::text,
           p.display_name,
           p.avatar_url,
           p.banner_url,
           p.bio,
           p.verified,
           coalesce(p.custom_badges, '[]'::jsonb),
           p.followers_count,
           coalesce(pr.last_seen >= cutoff and pr.status <> 'offline', false) as is_online,
           pr.last_seen,
           p.created_at,
           case when caller is null then false
                else exists(select 1 from public.followers f
                             where f.follower_id = caller and f.followee_id = p.id)
           end as is_following
      from public.profiles p
      left join public.user_presence pr on pr.user_id = p.id
     where coalesce(p.is_banned, false) = false
       and (
         needle is null
         or p.username::text ilike '%' || needle || '%'
         or p.display_name ilike '%' || needle || '%'
       )
       and (
         online_only is not true
         or (pr.last_seen >= cutoff and pr.status <> 'offline')
       )
     order by
       (pr.last_seen >= cutoff and pr.status <> 'offline') desc nulls last,
       pr.last_seen desc nulls last,
       p.followers_count desc,
       p.created_at desc
     limit greatest(1, least(max_rows, 500));
end $$;

grant execute on function public.list_users(text, boolean, int) to authenticated, anon;

-- Quick stat helper for the Users tab header.
create or replace function public.users_overview()
returns table (
  total_users bigint,
  online_users bigint,
  new_today bigint
) language sql stable security definer set search_path = public as $$
  select
    (select count(*)::bigint from public.profiles where coalesce(is_banned,false) = false),
    (select count(*)::bigint from public.user_presence
       where last_seen >= now() - interval '90 seconds'
         and status <> 'offline'),
    (select count(*)::bigint from public.profiles
       where created_at >= date_trunc('day', now())
         and coalesce(is_banned,false) = false)
$$;

grant execute on function public.users_overview() to authenticated, anon;


-- ---------------------------------------------------------------------
-- 4. Profile self-update RPC (avatar / banner / bio / etc.) ----------
-- ---------------------------------------------------------------------
create or replace function public.update_my_profile(
  set_display_name text default null,
  set_username     text default null,
  set_bio          text default null,
  set_avatar_url   text default null,
  set_banner_url   text default null,
  set_avatar_color text default null,
  set_banner_from  text default null,
  set_banner_to    text default null,
  set_wallet       text default null,
  set_twitter      text default null,
  set_website      text default null,
  set_location     text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'not authenticated';
  end if;

  insert into public.profiles (id, user_id, username, display_name)
  values (
    caller, caller,
    coalesce(set_username, 'user_' || substr(caller::text, 1, 6)),
    coalesce(set_display_name, set_username, 'New User')
  )
  on conflict (id) do nothing;

  update public.profiles
     set display_name   = coalesce(set_display_name, display_name),
         username       = coalesce(set_username, username),
         bio            = coalesce(set_bio, bio),
         avatar_url     = coalesce(set_avatar_url, avatar_url),
         banner_url     = coalesce(set_banner_url, banner_url),
         avatar_color   = coalesce(set_avatar_color, avatar_color),
         banner_from    = coalesce(set_banner_from, banner_from),
         banner_to      = coalesce(set_banner_to, banner_to),
         wallet_address = coalesce(set_wallet, wallet_address),
         twitter_handle = coalesce(set_twitter, twitter_handle),
         website        = coalesce(set_website, website),
         location       = coalesce(set_location, location),
         updated_at     = now()
   where id = caller;
end $$;

grant execute on function public.update_my_profile(
  text, text, text, text, text, text, text, text, text, text, text, text
) to authenticated;


-- ==============================================================
-- SECTION: supabase/migrations/20260501070000_admin_rpcs_and_settings.sql
-- ==============================================================

-- =====================================================================
-- 20260501070000_admin_rpcs_and_settings
--
-- Mega migration to fill every server-side gap the app currently expects:
--
--   Posts
--     - toggle_post_like(target_post_id uuid)         (returns liked, likes_count)
--
--   Admin dashboard
--     - admin_top_users(max_rows int)
--     - admin_recent_activity(max_rows int)
--     - admin_delete_user(target_user_id uuid)
--     - admin_dashboard_stats() now also reports `announcements`
--
--   Announcements / broadcasts
--     - public.announcements table + RLS
--     - admin_announcement_create(...)
--     - admin_announcement_delete(announcement_id uuid)
--
--   App settings (feature flags)
--     - public.app_settings table + RLS
--     - admin_settings_all()
--     - admin_setting_set(in_key text, in_value jsonb)
--
--   Storage buckets (avatars / banners / community-images) + policies
--
-- Safe to run repeatedly: every CREATE / POLICY is idempotent.
-- =====================================================================

set local search_path = public;

-- =====================================================================
-- 1. POSTS · toggle_post_like
-- =====================================================================
create or replace function public.toggle_post_like(target_post_id uuid)
returns table (liked boolean, likes_count integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  did_like boolean;
  new_count integer;
begin
  if caller is null then
    raise exception 'not authenticated';
  end if;

  if exists (
    select 1 from public.post_likes
     where post_id = target_post_id and user_id = caller
  ) then
    delete from public.post_likes
     where post_id = target_post_id and user_id = caller;
    did_like := false;
  else
    insert into public.post_likes (post_id, user_id)
    values (target_post_id, caller)
    on conflict do nothing;
    did_like := true;
  end if;

  select coalesce(cp.likes_count, 0)
    into new_count
    from public.community_posts cp
   where cp.id = target_post_id;

  liked := did_like;
  likes_count := coalesce(new_count, 0);
  return next;
end $$;

grant execute on function public.toggle_post_like(uuid) to authenticated;

-- =====================================================================
-- 2. ADMIN · top users
-- =====================================================================
create or replace function public.admin_top_users(max_rows int default 6)
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  followers_count integer,
  verified boolean,
  is_banned boolean,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'admin only';
  end if;
  return query
    select p.user_id,
           p.username,
           p.display_name,
           p.avatar_url,
           coalesce(p.followers_count, 0)::int,
           coalesce(p.verified, false),
           coalesce(p.is_banned, false),
           p.created_at
      from public.profiles p
     order by coalesce(p.followers_count, 0) desc, p.created_at desc
     limit greatest(1, least(max_rows, 50));
end $$;

grant execute on function public.admin_top_users(int) to authenticated;

-- =====================================================================
-- 3. ADMIN · recent activity (audit log + profile join)
-- =====================================================================
create or replace function public.admin_recent_activity(max_rows int default 8)
returns table (
  id uuid,
  admin_id uuid,
  admin_username text,
  admin_avatar text,
  action text,
  target_type text,
  target_id text,
  meta jsonb,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'admin only';
  end if;
  return query
    select a.id,
           a.admin_id,
           p.username       as admin_username,
           p.avatar_url     as admin_avatar,
           a.action,
           a.target_type,
           a.target_id,
           coalesce(a.meta, '{}'::jsonb) as meta,
           a.created_at
      from public.admin_audit_log a
      left join public.profiles p on p.user_id = a.admin_id
     order by a.created_at desc
     limit greatest(1, least(max_rows, 200));
end $$;

grant execute on function public.admin_recent_activity(int) to authenticated;

-- =====================================================================
-- 4. ADMIN · delete user (superadmin only)
-- =====================================================================
create or replace function public.admin_delete_user(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'not authenticated';
  end if;
  if not public.has_admin_role(caller, array['superadmin']) then
    raise exception 'only superadmins can delete users';
  end if;
  if target_user_id = caller then
    raise exception 'cannot delete your own account from here';
  end if;

  delete from public.admin_roles where user_id = target_user_id;
  delete from public.profiles    where user_id = target_user_id;
  -- Best-effort: remove from auth.users if extension allows.
  begin
    delete from auth.users where id = target_user_id;
  exception when others then
    -- The service role is required to delete from auth.users from SQL.
    -- The profile row + admin role are already gone, which is enough
    -- to soft-delete the user from the product surface.
    null;
  end;

  insert into public.admin_audit_log (admin_id, action, target_type, target_id, meta)
  values (caller, 'user_delete', 'user', target_user_id::text, '{}'::jsonb);
end $$;

grant execute on function public.admin_delete_user(uuid) to authenticated;

-- =====================================================================
-- 5. ANNOUNCEMENTS · table + RLS + RPCs
-- =====================================================================
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body  text not null,
  severity text not null default 'info'
    check (severity in ('info','success','warning','critical')),
  audience text not null default 'all'
    check (audience in ('all','traders','admins')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

create index if not exists announcements_recent_idx
  on public.announcements (created_at desc);

alter table public.announcements enable row level security;

do $$
begin
  begin execute 'drop policy if exists "announcements_read" on public.announcements';
  exception when others then null; end;

  execute $p$create policy "announcements_read" on public.announcements
    for select using (
      audience = 'all'
      or (audience = 'traders' and auth.uid() is not null)
      or (audience = 'admins'  and public.is_admin(auth.uid()))
    )$p$;

  begin execute 'drop policy if exists "announcements_admin_write" on public.announcements';
  exception when others then null; end;

  execute $p$create policy "announcements_admin_write" on public.announcements
    for all using (public.is_admin(auth.uid()))
            with check (public.is_admin(auth.uid()))$p$;
end $$;

create or replace function public.admin_announcement_create(
  in_title    text,
  in_body     text,
  in_severity text default 'info',
  in_audience text default 'all',
  in_expires_at timestamptz default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  new_id uuid;
begin
  if not public.is_admin(caller) then
    raise exception 'admin only';
  end if;
  if coalesce(btrim(in_title), '') = '' or coalesce(btrim(in_body), '') = '' then
    raise exception 'title and body are required';
  end if;

  insert into public.announcements (title, body, severity, audience, created_by, expires_at)
  values (btrim(in_title), btrim(in_body),
          coalesce(in_severity, 'info'),
          coalesce(in_audience, 'all'),
          caller, in_expires_at)
  returning id into new_id;

  insert into public.admin_audit_log (admin_id, action, target_type, target_id, meta)
  values (caller, 'announcement_create', 'announcements', new_id::text,
          json_build_object('title', in_title, 'severity', in_severity, 'audience', in_audience)::jsonb);

  return new_id;
end $$;

create or replace function public.admin_announcement_delete(announcement_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
begin
  if not public.is_admin(caller) then
    raise exception 'admin only';
  end if;
  delete from public.announcements where id = announcement_id;
  insert into public.admin_audit_log (admin_id, action, target_type, target_id, meta)
  values (caller, 'announcement_delete', 'announcements', announcement_id::text, '{}'::jsonb);
end $$;

grant execute on function public.admin_announcement_create(text, text, text, text, timestamptz) to authenticated;
grant execute on function public.admin_announcement_delete(uuid) to authenticated;

-- =====================================================================
-- 6. APP SETTINGS · table + RLS + RPCs
-- =====================================================================
create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default 'null'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

do $$
begin
  begin execute 'drop policy if exists "app_settings_read" on public.app_settings';
  exception when others then null; end;
  execute $p$create policy "app_settings_read" on public.app_settings
    for select using (true)$p$;

  begin execute 'drop policy if exists "app_settings_admin_write" on public.app_settings';
  exception when others then null; end;
  execute $p$create policy "app_settings_admin_write" on public.app_settings
    for all using (public.is_admin(auth.uid()))
            with check (public.is_admin(auth.uid()))$p$;
end $$;

-- Seed feature flags expected by the admin Settings panel.
insert into public.app_settings (key, value) values
  ('signups_open',      'true'::jsonb),
  ('listings_open',     'true'::jsonb),
  ('maintenance_mode',  'false'::jsonb)
on conflict (key) do nothing;

create or replace function public.admin_settings_all()
returns table (key text, value jsonb, updated_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'admin only';
  end if;
  return query
    select s.key, s.value, s.updated_at
      from public.app_settings s
     order by s.key asc;
end $$;

create or replace function public.admin_setting_set(in_key text, in_value jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
begin
  if not public.is_admin(caller) then
    raise exception 'admin only';
  end if;
  if coalesce(btrim(in_key), '') = '' then
    raise exception 'key is required';
  end if;

  insert into public.app_settings (key, value, updated_by, updated_at)
  values (in_key, coalesce(in_value, 'null'::jsonb), caller, now())
  on conflict (key) do update
     set value = excluded.value,
         updated_by = excluded.updated_by,
         updated_at = now();

  insert into public.admin_audit_log (admin_id, action, target_type, target_id, meta)
  values (caller, 'setting_set', 'app_settings', in_key,
          json_build_object('value', in_value)::jsonb);
end $$;

grant execute on function public.admin_settings_all() to authenticated;
grant execute on function public.admin_setting_set(text, jsonb) to authenticated;

-- =====================================================================
-- 7. Refresh admin_dashboard_stats so `announcements` is populated.
-- =====================================================================
create or replace function public.admin_dashboard_stats()
returns json language plpgsql security definer set search_path = public as $$
declare
  result json;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'admin only';
  end if;
  select json_build_object(
    'users',           (select count(*) from public.profiles),
    'admins',          (select count(*) from public.admin_roles),
    'listings',        (select count(*) from public.pump_v5_submissions),
    'featured',        (select count(*) from public.pump_v5_submissions where is_featured),
    'verified',        (select count(*) from public.pump_v5_submissions where is_verified),
    'support_open',    (select count(*) from public.support_tickets where status = 'open'),
    'support_total',   (select count(*) from public.support_tickets),
    'announcements',   (select count(*) from public.announcements),
    'new_users_7d',    (select count(*) from public.profiles where created_at > now() - interval '7 days'),
    'new_listings_7d', (select count(*) from public.pump_v5_submissions where created_at > now() - interval '7 days')
  ) into result;
  return result;
end $$;

grant execute on function public.admin_dashboard_stats() to authenticated;

-- =====================================================================
-- 8. STORAGE · avatars / banners / community-images buckets + policies
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars',          'avatars',          true,  5242880,  array['image/png','image/jpeg','image/webp','image/gif']),
  ('banners',          'banners',          true, 10485760,  array['image/png','image/jpeg','image/webp','image/gif']),
  ('community-images', 'community-images', true, 10485760,  array['image/png','image/jpeg','image/webp','image/gif'])
on conflict (id) do update
   set public = excluded.public,
       file_size_limit = excluded.file_size_limit,
       allowed_mime_types = excluded.allowed_mime_types;

do $$
declare
  buckets text[] := array['avatars','banners','community-images'];
  b text;
begin
  foreach b in array buckets loop
    -- Public read
    begin execute format('drop policy if exists "%s_public_read" on storage.objects', b);
    exception when others then null; end;
    execute format($p$create policy "%s_public_read" on storage.objects
      for select using (bucket_id = %L)$p$, b, b);

    -- Authenticated insert into own folder (first path segment = uid)
    begin execute format('drop policy if exists "%s_owner_insert" on storage.objects', b);
    exception when others then null; end;
    execute format($p$create policy "%s_owner_insert" on storage.objects
      for insert to authenticated
      with check (bucket_id = %L and auth.uid()::text = (storage.foldername(name))[1])$p$, b, b);

    -- Authenticated update own files
    begin execute format('drop policy if exists "%s_owner_update" on storage.objects', b);
    exception when others then null; end;
    execute format($p$create policy "%s_owner_update" on storage.objects
      for update to authenticated
      using (bucket_id = %L and auth.uid()::text = (storage.foldername(name))[1])
      with check (bucket_id = %L and auth.uid()::text = (storage.foldername(name))[1])$p$, b, b, b);

    -- Authenticated delete own files OR admin delete any
    begin execute format('drop policy if exists "%s_owner_delete" on storage.objects', b);
    exception when others then null; end;
    execute format($p$create policy "%s_owner_delete" on storage.objects
      for delete to authenticated
      using (
        bucket_id = %L and (
          auth.uid()::text = (storage.foldername(name))[1]
          or public.is_admin(auth.uid())
        )
      )$p$, b, b);
  end loop;
end $$;

-- =====================================================================
-- Done.
-- =====================================================================
select 'admin_rpcs_and_settings migration applied' as status;


-- ==============================================================
-- SECTION: supabase/migrations/20260501080000_communities_voice_extras.sql
-- ==============================================================

-- Extend communities + livekit_rooms with the fields the UI needs so
-- everything in the app can be backed by real data (no mock seeds).

alter table public.communities
  add column if not exists category text not null default 'alpha',
  add column if not exists icon_emoji text not null default '✨',
  add column if not exists accent_a text,
  add column if not exists accent_b text,
  add column if not exists verified boolean not null default false,
  add column if not exists trending boolean not null default false,
  add column if not exists pinned_ticker text,
  add column if not exists rules jsonb not null default '[]'::jsonb,
  add column if not exists tags jsonb not null default '[]'::jsonb,
  add column if not exists posts_count integer not null default 0,
  add column if not exists online_count integer not null default 0;

alter table public.livekit_rooms
  add column if not exists topic text not null default 'GENERAL',
  add column if not exists description text not null default '',
  add column if not exists accent_a text,
  add column if not exists accent_b text,
  add column if not exists category text not null default 'alpha',
  add column if not exists recording boolean not null default false,
  add column if not exists scheduled_at timestamptz,
  add column if not exists raised_hands integer not null default 0,
  add column if not exists listeners_count integer not null default 0,
  add column if not exists speakers_count integer not null default 0;

-- Bump posts_count on community_posts insert/delete.
create or replace function public.handle_community_post_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.community_id is not null then
    update public.communities
       set posts_count = posts_count + 1
     where id = new.community_id;
  elsif tg_op = 'DELETE' and old.community_id is not null then
    update public.communities
       set posts_count = greatest(0, posts_count - 1)
     where id = old.community_id;
  end if;
  return null;
end $$;

drop trigger if exists trg_community_posts_count_ins on public.community_posts;
create trigger trg_community_posts_count_ins after insert on public.community_posts
  for each row execute function public.handle_community_post_count();

drop trigger if exists trg_community_posts_count_del on public.community_posts;
create trigger trg_community_posts_count_del after delete on public.community_posts
  for each row execute function public.handle_community_post_count();


-- ==============================================================
-- SECTION: supabase/migrations/20260501090000_full_sync.sql
-- ==============================================================

-- =====================================================================
-- FULL SYNC MIGRATION
-- =====================================================================
-- One-shot, idempotent migration that aligns the database with every
-- table, column, view, RPC, trigger, RLS policy, realtime publication
-- and storage bucket the frontend currently expects.
--
-- Safe to re-run. Each statement uses IF NOT EXISTS / CREATE OR REPLACE
-- / DROP IF EXISTS guards.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Required extensions
-- ---------------------------------------------------------------------
create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;
create extension if not exists citext;
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------
-- 1. Profiles — make sure every column the UI reads exists
-- ---------------------------------------------------------------------
alter table public.profiles
  add column if not exists display_name   text,
  add column if not exists bio            text,
  add column if not exists avatar_url     text,
  add column if not exists banner_url     text,
  add column if not exists avatar_color   text,
  add column if not exists banner_from    text,
  add column if not exists banner_to      text,
  add column if not exists wallet_address text,
  add column if not exists twitter_handle text,
  add column if not exists website        text,
  add column if not exists location       text,
  add column if not exists badge          text default 'Recruit',
  add column if not exists verified       boolean not null default false,
  add column if not exists custom_badges  jsonb   not null default '[]'::jsonb,
  add column if not exists is_banned      boolean not null default false,
  add column if not exists followers_count integer not null default 0,
  add column if not exists following_count integer not null default 0,
  add column if not exists trades_count    integer not null default 0,
  add column if not exists win_rate        numeric(6,2)  not null default 0,
  add column if not exists pnl_pct         numeric(10,2) not null default 0,
  add column if not exists xp              integer not null default 0,
  add column if not exists last_seen_at    timestamptz,
  add column if not exists status          text default 'offline',
  add column if not exists created_at      timestamptz not null default now(),
  add column if not exists updated_at      timestamptz not null default now();

create index if not exists profiles_handle_lookup_idx
  on public.profiles ((lower(username::text)));
create index if not exists profiles_followers_idx
  on public.profiles (followers_count desc);

-- ---------------------------------------------------------------------
-- 2. follows view — code uses .from("follows") but table is followers
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.tables
     where table_schema = 'public' and table_name = 'follows'
  ) then
    execute 'create or replace view public.follows as
             select follower_id, followee_id, created_at
               from public.followers';
  end if;
end $$;

grant select, insert, delete on public.follows to authenticated;
grant select on public.follows to anon;

-- ---------------------------------------------------------------------
-- 3. Communities — ensure all UI columns exist
-- ---------------------------------------------------------------------
alter table public.communities
  add column if not exists category       text not null default 'alpha',
  add column if not exists icon_emoji     text not null default '✨',
  add column if not exists accent_a       text,
  add column if not exists accent_b       text,
  add column if not exists verified       boolean not null default false,
  add column if not exists trending       boolean not null default false,
  add column if not exists pinned_ticker  text,
  add column if not exists rules          jsonb  not null default '[]'::jsonb,
  add column if not exists tags           jsonb  not null default '[]'::jsonb,
  add column if not exists posts_count    integer not null default 0,
  add column if not exists online_count   integer not null default 0,
  add column if not exists is_private     boolean not null default false,
  add column if not exists banner_url     text,
  add column if not exists avatar_url     text;

create index if not exists communities_category_idx on public.communities (category);
create index if not exists communities_trending_idx on public.communities (trending) where trending = true;

-- ---------------------------------------------------------------------
-- 4. Community posts — UI needs likes/comments/ticker/change_pct
-- ---------------------------------------------------------------------
alter table public.community_posts
  add column if not exists ticker          text,
  add column if not exists change_pct      numeric(10,4),
  add column if not exists image_url       text,
  add column if not exists likes_count     integer not null default 0,
  add column if not exists comments_count  integer not null default 0,
  add column if not exists reposts_count   integer not null default 0,
  add column if not exists pinned          boolean not null default false;

-- ---------------------------------------------------------------------
-- 5. LiveKit rooms — voice/spaces UI columns
-- ---------------------------------------------------------------------
alter table public.livekit_rooms
  add column if not exists topic            text not null default 'GENERAL',
  add column if not exists description      text not null default '',
  add column if not exists accent_a         text,
  add column if not exists accent_b         text,
  add column if not exists category         text not null default 'alpha',
  add column if not exists recording        boolean not null default false,
  add column if not exists scheduled_at     timestamptz,
  add column if not exists raised_hands     integer not null default 0,
  add column if not exists listeners_count  integer not null default 0,
  add column if not exists speakers_count   integer not null default 0;

-- Maintain participant counts on the room ----------------------------
create or replace function public.handle_livekit_participant_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.livekit_rooms
       set listeners_count = (
             select count(*) from public.livekit_participants
              where room_id = new.room_id and left_at is null and role = 'listener'),
           speakers_count = (
             select count(*) from public.livekit_participants
              where room_id = new.room_id and left_at is null and role in ('speaker','host'))
     where id = new.room_id;
    return new;
  elsif tg_op = 'UPDATE' or tg_op = 'DELETE' then
    update public.livekit_rooms
       set listeners_count = (
             select count(*) from public.livekit_participants
              where room_id = coalesce(new.room_id, old.room_id)
                and left_at is null and role = 'listener'),
           speakers_count = (
             select count(*) from public.livekit_participants
              where room_id = coalesce(new.room_id, old.room_id)
                and left_at is null and role in ('speaker','host'))
     where id = coalesce(new.room_id, old.room_id);
    return coalesce(new, old);
  end if;
  return null;
end $$;

drop trigger if exists trg_livekit_part_change on public.livekit_participants;
create trigger trg_livekit_part_change
after insert or update or delete on public.livekit_participants
for each row execute function public.handle_livekit_participant_change();

-- ---------------------------------------------------------------------
-- 6. Notifications table (UI-friendly schema)
-- ---------------------------------------------------------------------
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  type text not null,
  title text,
  body  text,
  data  jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx
  on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;
do $$
begin
  begin execute 'drop policy if exists "notif_owner_read"   on public.notifications'; exception when others then null; end;
  begin execute 'drop policy if exists "notif_owner_update" on public.notifications'; exception when others then null; end;
  begin execute 'drop policy if exists "notif_owner_delete" on public.notifications'; exception when others then null; end;
  execute $p$create policy "notif_owner_read"   on public.notifications for select using (auth.uid() = user_id)$p$;
  execute $p$create policy "notif_owner_update" on public.notifications for update using (auth.uid() = user_id)$p$;
  execute $p$create policy "notif_owner_delete" on public.notifications for delete using (auth.uid() = user_id)$p$;
end $$;

-- ---------------------------------------------------------------------
-- 7. Direct messages
-- ---------------------------------------------------------------------
create table if not exists public.dm_threads (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references auth.users(id) on delete cascade,
  user_b uuid not null references auth.users(id) on delete cascade,
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_a, user_b),
  check (user_a < user_b)
);
create index if not exists dm_threads_user_a_idx on public.dm_threads (user_a, last_message_at desc);
create index if not exists dm_threads_user_b_idx on public.dm_threads (user_b, last_message_at desc);

create table if not exists public.dm_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.dm_threads(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  attachments jsonb not null default '[]'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists dm_messages_thread_idx on public.dm_messages (thread_id, created_at desc);

alter table public.dm_threads  enable row level security;
alter table public.dm_messages enable row level security;

do $$
begin
  begin execute 'drop policy if exists "dm_thread_participants" on public.dm_threads'; exception when others then null; end;
  execute $p$create policy "dm_thread_participants" on public.dm_threads
    for all using (auth.uid() = user_a or auth.uid() = user_b)
        with check (auth.uid() = user_a or auth.uid() = user_b)$p$;

  begin execute 'drop policy if exists "dm_msg_participants_read"  on public.dm_messages'; exception when others then null; end;
  begin execute 'drop policy if exists "dm_msg_participants_write" on public.dm_messages'; exception when others then null; end;
  execute $p$create policy "dm_msg_participants_read" on public.dm_messages
    for select using (exists (
      select 1 from public.dm_threads t
       where t.id = thread_id and (auth.uid() = t.user_a or auth.uid() = t.user_b)
    ))$p$;
  execute $p$create policy "dm_msg_participants_write" on public.dm_messages
    for insert with check (
      auth.uid() = sender_id
      and exists (
        select 1 from public.dm_threads t
         where t.id = thread_id and (auth.uid() = t.user_a or auth.uid() = t.user_b)
      )
    )$p$;
end $$;

-- Bump thread last_message_at on insert
create or replace function public.handle_dm_message_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.dm_threads
     set last_message_at = new.created_at
   where id = new.thread_id;
  return new;
end $$;

drop trigger if exists trg_dm_message_insert on public.dm_messages;
create trigger trg_dm_message_insert
after insert on public.dm_messages
for each row execute function public.handle_dm_message_insert();

-- Helper: open or fetch a DM thread between two users
create or replace function public.dm_open_thread(other_user_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  a uuid;
  b uuid;
  tid uuid;
begin
  if caller is null then raise exception 'not authenticated'; end if;
  if caller = other_user_id then raise exception 'cannot DM yourself'; end if;
  if caller < other_user_id then a := caller; b := other_user_id;
  else a := other_user_id; b := caller; end if;

  select id into tid from public.dm_threads where user_a = a and user_b = b;
  if tid is null then
    insert into public.dm_threads (user_a, user_b) values (a, b)
    returning id into tid;
  end if;
  return tid;
end $$;

grant execute on function public.dm_open_thread(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 8. Comments on community posts
-- ---------------------------------------------------------------------
create table if not exists public.community_post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now()
);
create index if not exists post_comments_post_idx
  on public.community_post_comments (post_id, created_at desc);

alter table public.community_post_comments enable row level security;
do $$
begin
  begin execute 'drop policy if exists "comments_read"        on public.community_post_comments'; exception when others then null; end;
  begin execute 'drop policy if exists "comments_write_self"  on public.community_post_comments'; exception when others then null; end;
  begin execute 'drop policy if exists "comments_delete_self" on public.community_post_comments'; exception when others then null; end;
  execute $p$create policy "comments_read"        on public.community_post_comments for select using (true)$p$;
  execute $p$create policy "comments_write_self"  on public.community_post_comments for insert with check (auth.uid() = user_id)$p$;
  execute $p$create policy "comments_delete_self" on public.community_post_comments for delete using (auth.uid() = user_id)$p$;
end $$;

create or replace function public.handle_post_comment_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.community_posts
       set comments_count = comments_count + 1
     where id = new.post_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.community_posts
       set comments_count = greatest(0, comments_count - 1)
     where id = old.post_id;
    return old;
  end if;
  return null;
end $$;

drop trigger if exists trg_post_comments_change on public.community_post_comments;
create trigger trg_post_comments_change
after insert or delete on public.community_post_comments
for each row execute function public.handle_post_comment_change();

-- ---------------------------------------------------------------------
-- 9. Toggle post like RPC (idempotent, returns liked + count)
-- ---------------------------------------------------------------------
create or replace function public.toggle_post_like(target_post_id uuid)
returns table (liked boolean, likes_count integer)
language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  exists_row boolean;
  cur_count integer;
begin
  if caller is null then raise exception 'not authenticated'; end if;

  select exists(select 1 from public.post_likes
                 where post_id = target_post_id and user_id = caller)
    into exists_row;

  if exists_row then
    delete from public.post_likes
     where post_id = target_post_id and user_id = caller;
    select cp.likes_count into cur_count from public.community_posts cp where cp.id = target_post_id;
    return query select false, coalesce(cur_count, 0);
  else
    insert into public.post_likes (post_id, user_id)
    values (target_post_id, caller)
    on conflict do nothing;
    select cp.likes_count into cur_count from public.community_posts cp where cp.id = target_post_id;
    return query select true, coalesce(cur_count, 0);
  end if;
end $$;

grant execute on function public.toggle_post_like(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 10. Auto-create profile on auth signup (idempotent)
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  base_username text;
  candidate    text;
  i            int := 0;
begin
  base_username := lower(coalesce(
    new.raw_user_meta_data->>'username',
    split_part(new.email, '@', 1),
    'user'
  ));
  base_username := regexp_replace(base_username, '[^a-z0-9_]+', '', 'g');
  if length(base_username) < 3 then
    base_username := base_username || substr(replace(new.id::text, '-', ''), 1, 6);
  end if;
  candidate := base_username;
  while exists(select 1 from public.profiles where lower(username::text) = candidate) loop
    i := i + 1;
    candidate := base_username || i::text;
    exit when i > 50;
  end loop;

  insert into public.profiles (id, user_id, username, display_name, created_at, updated_at)
  values (
    new.id,
    new.id,
    candidate,
    coalesce(new.raw_user_meta_data->>'display_name', candidate),
    now(),
    now()
  )
  on conflict (id) do nothing;

  -- Owner bootstrap
  if new.email = 'audifyx@gmail.com' then
    update public.profiles
       set verified = true,
           badge = 'Owner',
           display_name = coalesce(display_name, 'Audifyx'),
           updated_at = now()
     where id = new.id;
    insert into public.admin_roles (user_id, role, granted_by)
    values (new.id, 'superadmin', new.id)
    on conflict (user_id) do update set role = 'superadmin';
  end if;

  insert into public.user_settings (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

drop trigger if exists trg_on_auth_user_created on auth.users;
create trigger trg_on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Backfill any existing auth users that never got a profile row
insert into public.profiles (id, user_id, username, display_name, created_at, updated_at)
select u.id,
       u.id,
       lower(regexp_replace(coalesce(split_part(u.email, '@', 1), 'user'), '[^a-z0-9_]+', '', 'g'))
         || substr(replace(u.id::text, '-', ''), 1, 4),
       coalesce(split_part(u.email, '@', 1), 'User'),
       now(),
       now()
  from auth.users u
  left join public.profiles p on p.id = u.id
 where p.id is null
on conflict (id) do nothing;

-- Backfill user_settings
insert into public.user_settings (user_id)
select u.id from auth.users u
  left join public.user_settings s on s.user_id = u.id
 where s.user_id is null
on conflict do nothing;

-- ---------------------------------------------------------------------
-- 11. Profile follower-count maintenance
-- ---------------------------------------------------------------------
create or replace function public.handle_followers_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.profiles set followers_count = followers_count + 1 where id = new.followee_id;
    update public.profiles set following_count = following_count + 1 where id = new.follower_id;

    -- Send a follow notification
    insert into public.notifications (user_id, actor_id, type, title, body)
    values (new.followee_id, new.follower_id, 'follow', 'New follower',
            'Someone just followed you')
    on conflict do nothing;
    return new;
  elsif tg_op = 'DELETE' then
    update public.profiles set followers_count = greatest(0, followers_count - 1) where id = old.followee_id;
    update public.profiles set following_count = greatest(0, following_count - 1) where id = old.follower_id;
    return old;
  end if;
  return null;
end $$;

drop trigger if exists trg_followers_ins on public.followers;
drop trigger if exists trg_followers_del on public.followers;
create trigger trg_followers_ins after insert on public.followers
  for each row execute function public.handle_followers_change();
create trigger trg_followers_del after delete on public.followers
  for each row execute function public.handle_followers_change();

-- ---------------------------------------------------------------------
-- 12. RLS sanity for the social tables
-- ---------------------------------------------------------------------
alter table public.profiles            enable row level security;
alter table public.followers           enable row level security;
alter table public.communities         enable row level security;
alter table public.community_members   enable row level security;
alter table public.community_posts     enable row level security;
alter table public.livekit_rooms       enable row level security;
alter table public.livekit_participants enable row level security;

do $$
begin
  -- profiles
  begin execute 'drop policy if exists "profiles_read"          on public.profiles'; exception when others then null; end;
  begin execute 'drop policy if exists "profiles_update_self"   on public.profiles'; exception when others then null; end;
  begin execute 'drop policy if exists "profiles_insert_self"   on public.profiles'; exception when others then null; end;
  execute $p$create policy "profiles_read"        on public.profiles for select using (true)$p$;
  execute $p$create policy "profiles_update_self" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id)$p$;
  execute $p$create policy "profiles_insert_self" on public.profiles for insert with check (auth.uid() = id)$p$;

  -- followers
  begin execute 'drop policy if exists "followers_read"        on public.followers'; exception when others then null; end;
  begin execute 'drop policy if exists "followers_write_self"  on public.followers'; exception when others then null; end;
  begin execute 'drop policy if exists "followers_delete_self" on public.followers'; exception when others then null; end;
  execute $p$create policy "followers_read"        on public.followers for select using (true)$p$;
  execute $p$create policy "followers_write_self"  on public.followers for insert with check (auth.uid() = follower_id)$p$;
  execute $p$create policy "followers_delete_self" on public.followers for delete using (auth.uid() = follower_id)$p$;

  -- communities
  begin execute 'drop policy if exists "communities_read"         on public.communities'; exception when others then null; end;
  begin execute 'drop policy if exists "communities_create_owner" on public.communities'; exception when others then null; end;
  begin execute 'drop policy if exists "communities_update_owner" on public.communities'; exception when others then null; end;
  execute $p$create policy "communities_read" on public.communities for select using (true)$p$;
  execute $p$create policy "communities_create_owner" on public.communities for insert with check (auth.uid() = owner_id)$p$;
  execute $p$create policy "communities_update_owner" on public.communities for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id)$p$;

  -- community_members
  begin execute 'drop policy if exists "cm_read"        on public.community_members'; exception when others then null; end;
  begin execute 'drop policy if exists "cm_join_self"   on public.community_members'; exception when others then null; end;
  begin execute 'drop policy if exists "cm_leave_self"  on public.community_members'; exception when others then null; end;
  execute $p$create policy "cm_read"       on public.community_members for select using (true)$p$;
  execute $p$create policy "cm_join_self"  on public.community_members for insert with check (auth.uid() = user_id)$p$;
  execute $p$create policy "cm_leave_self" on public.community_members for delete using (auth.uid() = user_id)$p$;

  -- community_posts
  begin execute 'drop policy if exists "cp_read"         on public.community_posts'; exception when others then null; end;
  begin execute 'drop policy if exists "cp_write_self"   on public.community_posts'; exception when others then null; end;
  begin execute 'drop policy if exists "cp_update_self"  on public.community_posts'; exception when others then null; end;
  begin execute 'drop policy if exists "cp_delete_self"  on public.community_posts'; exception when others then null; end;
  execute $p$create policy "cp_read"        on public.community_posts for select using (true)$p$;
  execute $p$create policy "cp_write_self"  on public.community_posts for insert with check (auth.uid() = user_id)$p$;
  execute $p$create policy "cp_update_self" on public.community_posts for update using (auth.uid() = user_id) with check (auth.uid() = user_id)$p$;
  execute $p$create policy "cp_delete_self" on public.community_posts for delete using (auth.uid() = user_id or public.is_admin(auth.uid()))$p$;

  -- livekit_rooms
  begin execute 'drop policy if exists "lk_room_read"   on public.livekit_rooms'; exception when others then null; end;
  begin execute 'drop policy if exists "lk_room_host"   on public.livekit_rooms'; exception when others then null; end;
  begin execute 'drop policy if exists "lk_room_update" on public.livekit_rooms'; exception when others then null; end;
  execute $p$create policy "lk_room_read"   on public.livekit_rooms for select using (true)$p$;
  execute $p$create policy "lk_room_host"   on public.livekit_rooms for insert with check (auth.uid() = host_id)$p$;
  execute $p$create policy "lk_room_update" on public.livekit_rooms for update using (auth.uid() = host_id or public.is_admin(auth.uid())) with check (true)$p$;

  -- livekit_participants
  begin execute 'drop policy if exists "lk_part_read"   on public.livekit_participants'; exception when others then null; end;
  begin execute 'drop policy if exists "lk_part_join"   on public.livekit_participants'; exception when others then null; end;
  begin execute 'drop policy if exists "lk_part_update" on public.livekit_participants'; exception when others then null; end;
  execute $p$create policy "lk_part_read"   on public.livekit_participants for select using (true)$p$;
  execute $p$create policy "lk_part_join"   on public.livekit_participants for insert with check (auth.uid() = user_id)$p$;
  execute $p$create policy "lk_part_update" on public.livekit_participants for update using (auth.uid() = user_id or exists (
    select 1 from public.livekit_rooms r where r.id = room_id and r.host_id = auth.uid())) with check (true)$p$;
end $$;

-- ---------------------------------------------------------------------
-- 13. Realtime publication — make sure live tables stream
-- ---------------------------------------------------------------------
do $$
declare
  t text;
  tables text[] := array[
    'profiles', 'followers', 'notifications',
    'community_posts', 'community_members', 'communities',
    'post_likes', 'community_post_comments',
    'livekit_rooms', 'livekit_participants',
    'dm_threads', 'dm_messages',
    'announcements', 'whale_events'
  ];
begin
  foreach t in array tables loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
              when undefined_object then null;
              when others then null;
    end;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 14. Storage buckets for media uploads
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public) values
  ('profile-media',   'profile-media',   true),
  ('community-media', 'community-media', true),
  ('post-media',      'post-media',      true),
  ('dm-media',        'dm-media',        true)
on conflict (id) do update set public = excluded.public;

do $$
declare
  b text;
  buckets text[] := array['profile-media','community-media','post-media','dm-media'];
begin
  foreach b in array buckets loop
    begin execute format('drop policy if exists "%s_public_read"   on storage.objects', b); exception when others then null; end;
    begin execute format('drop policy if exists "%s_owner_write"   on storage.objects', b); exception when others then null; end;
    begin execute format('drop policy if exists "%s_owner_update"  on storage.objects', b); exception when others then null; end;
    begin execute format('drop policy if exists "%s_owner_delete"  on storage.objects', b); exception when others then null; end;

    execute format($p$create policy "%s_public_read" on storage.objects
      for select using (bucket_id = %L)$p$, b, b);

    execute format($p$create policy "%s_owner_write" on storage.objects
      for insert with check (
        bucket_id = %L
        and auth.uid() is not null
        and (storage.foldername(name))[1] = auth.uid()::text
      )$p$, b, b);

    execute format($p$create policy "%s_owner_update" on storage.objects
      for update using (
        bucket_id = %L
        and auth.uid() is not null
        and (storage.foldername(name))[1] = auth.uid()::text
      )$p$, b, b);

    execute format($p$create policy "%s_owner_delete" on storage.objects
      for delete using (
        bucket_id = %L
        and auth.uid() is not null
        and (storage.foldername(name))[1] = auth.uid()::text
      )$p$, b, b);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 15. Owner bootstrap for existing audifyx@gmail.com (if already signed up)
-- ---------------------------------------------------------------------
do $$
declare
  owner_id uuid;
begin
  select id into owner_id from auth.users where email = 'audifyx@gmail.com' limit 1;
  if owner_id is not null then
    update public.profiles
       set verified = true,
           badge = 'Owner',
           display_name = coalesce(display_name, 'Audifyx'),
           updated_at = now()
     where id = owner_id;
    insert into public.admin_roles (user_id, role, granted_by)
    values (owner_id, 'superadmin', owner_id)
    on conflict (user_id) do update set role = 'superadmin';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- DONE
-- =====================================================================


-- ==============================================================
-- SECTION: supabase/migrations/20260501100000_users_tab.sql
-- ==============================================================

-- =====================================================================
-- USERS TAB — full schema, RPCs, RLS, realtime
-- =====================================================================
-- One-shot, idempotent migration that powers the in-app Users tab:
--   • Profiles columns the Users UI reads
--   • user_presence table + heartbeat / set_offline RPCs
--   • list_users / users_overview / search_profiles RPCs
--   • toggle_follow + follow notifications
--   • list_followers / list_following RPCs
--   • Trader leaderboard RPC (real, not derived)
--   • RLS, realtime publication, indexes
--
-- Safe to re-run.
-- =====================================================================

-- 0. Extensions ------------------------------------------------------
create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;
create extension if not exists citext;
create extension if not exists pg_trgm;

-- 1. Profiles columns -----------------------------------------------
alter table public.profiles
  add column if not exists display_name    text,
  add column if not exists bio             text,
  add column if not exists avatar_url      text,
  add column if not exists banner_url      text,
  add column if not exists avatar_color    text,
  add column if not exists banner_from     text,
  add column if not exists banner_to       text,
  add column if not exists wallet_address  text,
  add column if not exists twitter_handle  text,
  add column if not exists website         text,
  add column if not exists location        text,
  add column if not exists badge           text default 'Recruit',
  add column if not exists verified        boolean not null default false,
  add column if not exists custom_badges   jsonb   not null default '[]'::jsonb,
  add column if not exists is_banned       boolean not null default false,
  add column if not exists followers_count integer not null default 0,
  add column if not exists following_count integer not null default 0,
  add column if not exists trades_count    integer not null default 0,
  add column if not exists win_rate        numeric(6,2)  not null default 0,
  add column if not exists pnl_pct         numeric(10,2) not null default 0,
  add column if not exists volume_usd      numeric(18,2) not null default 0,
  add column if not exists xp              integer not null default 0,
  add column if not exists last_seen_at    timestamptz,
  add column if not exists status          text default 'offline',
  add column if not exists created_at      timestamptz not null default now(),
  add column if not exists updated_at      timestamptz not null default now();

create index if not exists profiles_handle_lookup_idx on public.profiles ((lower(username::text)));
create index if not exists profiles_followers_idx     on public.profiles (followers_count desc);
create index if not exists profiles_pnl_idx           on public.profiles (pnl_pct desc);
create index if not exists profiles_winrate_idx       on public.profiles (win_rate desc);
create index if not exists profiles_volume_idx        on public.profiles (volume_usd desc);

-- 2. Presence table --------------------------------------------------
create table if not exists public.user_presence (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  status     text not null default 'online' check (status in ('online','away','offline')),
  last_seen  timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists user_presence_last_seen_idx on public.user_presence (last_seen desc);

alter table public.user_presence enable row level security;

drop policy if exists user_presence_read         on public.user_presence;
drop policy if exists user_presence_self_write   on public.user_presence;
drop policy if exists user_presence_self_update  on public.user_presence;
create policy user_presence_read        on public.user_presence for select using (true);
create policy user_presence_self_write  on public.user_presence for insert to authenticated
  with check (auth.uid() = user_id);
create policy user_presence_self_update on public.user_presence for update to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 3. RLS for profiles + followers -----------------------------------
alter table public.profiles  enable row level security;
alter table public.followers enable row level security;

do $$
begin
  begin execute 'drop policy if exists "profiles_read"        on public.profiles'; exception when others then null; end;
  begin execute 'drop policy if exists "profiles_update_self" on public.profiles'; exception when others then null; end;
  begin execute 'drop policy if exists "profiles_insert_self" on public.profiles'; exception when others then null; end;
  execute $p$create policy "profiles_read"        on public.profiles for select using (true)$p$;
  execute $p$create policy "profiles_update_self" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id)$p$;
  execute $p$create policy "profiles_insert_self" on public.profiles for insert with check (auth.uid() = id)$p$;

  begin execute 'drop policy if exists "followers_read"        on public.followers'; exception when others then null; end;
  begin execute 'drop policy if exists "followers_write_self"  on public.followers'; exception when others then null; end;
  begin execute 'drop policy if exists "followers_delete_self" on public.followers'; exception when others then null; end;
  execute $p$create policy "followers_read"        on public.followers for select using (true)$p$;
  execute $p$create policy "followers_write_self"  on public.followers for insert with check (auth.uid() = follower_id)$p$;
  execute $p$create policy "followers_delete_self" on public.followers for delete using (auth.uid() = follower_id)$p$;
end $$;

-- 4. Heartbeat / Offline RPCs ---------------------------------------
create or replace function public.heartbeat(set_status text default 'online')
returns void language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  s text := coalesce(nullif(set_status, ''), 'online');
begin
  if caller is null then return; end if;
  if s not in ('online','away','offline') then s := 'online'; end if;
  insert into public.user_presence (user_id, status, last_seen, updated_at)
  values (caller, s, now(), now())
  on conflict (user_id) do update
    set status     = excluded.status,
        last_seen  = excluded.last_seen,
        updated_at = now();

  update public.profiles
     set last_seen_at = now(),
         status       = s,
         updated_at   = now()
   where id = caller;
end $$;
grant execute on function public.heartbeat(text) to authenticated;

create or replace function public.set_offline()
returns void language plpgsql security definer set search_path = public as $$
declare caller uuid := auth.uid();
begin
  if caller is null then return; end if;
  update public.user_presence
     set status = 'offline', updated_at = now()
   where user_id = caller;
  update public.profiles
     set status = 'offline', last_seen_at = now(), updated_at = now()
   where id = caller;
end $$;
grant execute on function public.set_offline() to authenticated;

-- 5. List users for the Users tab -----------------------------------
create or replace function public.list_users(
  q           text default '',
  online_only boolean default false,
  max_rows    int default 200
) returns table (
  user_id        uuid,
  username       text,
  display_name   text,
  avatar_url     text,
  banner_url     text,
  bio            text,
  verified       boolean,
  custom_badges  jsonb,
  followers_count integer,
  is_online      boolean,
  last_seen      timestamptz,
  created_at     timestamptz,
  is_following   boolean
) language plpgsql stable security definer set search_path = public as $$
declare
  needle text := nullif(trim(q), '');
  caller uuid := auth.uid();
  cutoff timestamptz := now() - interval '90 seconds';
begin
  return query
    select p.id,
           p.username::text,
           p.display_name,
           p.avatar_url,
           p.banner_url,
           p.bio,
           p.verified,
           coalesce(p.custom_badges, '[]'::jsonb),
           p.followers_count,
           coalesce(pr.last_seen >= cutoff and pr.status <> 'offline', false) as is_online,
           pr.last_seen,
           p.created_at,
           case when caller is null then false
                else exists(select 1 from public.followers f
                             where f.follower_id = caller and f.followee_id = p.id)
           end as is_following
      from public.profiles p
      left join public.user_presence pr on pr.user_id = p.id
     where coalesce(p.is_banned, false) = false
       and (
         needle is null
         or p.username::text ilike '%' || needle || '%'
         or p.display_name   ilike '%' || needle || '%'
       )
       and (
         online_only is not true
         or (pr.last_seen >= cutoff and pr.status <> 'offline')
       )
     order by
       (pr.last_seen >= cutoff and pr.status <> 'offline') desc nulls last,
       pr.last_seen           desc nulls last,
       p.followers_count      desc,
       p.created_at           desc
     limit greatest(1, least(max_rows, 500));
end $$;
grant execute on function public.list_users(text, boolean, int) to authenticated, anon;

-- 6. Users overview --------------------------------------------------
create or replace function public.users_overview()
returns table (
  total_users  bigint,
  online_users bigint,
  new_today    bigint
) language sql stable security definer set search_path = public as $$
  select
    (select count(*)::bigint from public.profiles where coalesce(is_banned,false) = false),
    (select count(*)::bigint from public.user_presence
       where last_seen >= now() - interval '90 seconds' and status <> 'offline'),
    (select count(*)::bigint from public.profiles
       where created_at >= date_trunc('day', now()) and coalesce(is_banned,false) = false)
$$;
grant execute on function public.users_overview() to authenticated, anon;

-- 7. Search profiles -------------------------------------------------
create or replace function public.search_profiles(q text, max_rows int default 25)
returns table (
  user_id        uuid,
  username       text,
  display_name   text,
  avatar_url     text,
  verified       boolean,
  custom_badges  jsonb,
  followers_count integer
) language plpgsql stable security definer set search_path = public as $$
declare needle text := nullif(trim(q), '');
begin
  return query
    select p.id, p.username::text, p.display_name, p.avatar_url,
           p.verified, coalesce(p.custom_badges, '[]'::jsonb), p.followers_count
      from public.profiles p
     where coalesce(p.is_banned,false) = false
       and (
         needle is null
         or p.username::text ilike '%' || needle || '%'
         or p.display_name   ilike '%' || needle || '%'
       )
     order by p.followers_count desc, p.created_at desc
     limit greatest(1, least(max_rows, 100));
end $$;
grant execute on function public.search_profiles(text, int) to authenticated, anon;

-- 8. Toggle follow + counts + notification --------------------------
create or replace function public.toggle_follow(target_user_id uuid)
returns table (following boolean, followers_count integer)
language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  exists_row boolean;
  cur_count integer;
begin
  if caller is null then raise exception 'not authenticated'; end if;
  if caller = target_user_id then raise exception 'cannot follow yourself'; end if;

  select exists(select 1 from public.followers
                 where follower_id = caller and followee_id = target_user_id)
    into exists_row;

  if exists_row then
    delete from public.followers
     where follower_id = caller and followee_id = target_user_id;
    select p.followers_count into cur_count from public.profiles p where p.id = target_user_id;
    return query select false, coalesce(cur_count, 0);
  else
    insert into public.followers (follower_id, followee_id)
    values (caller, target_user_id)
    on conflict do nothing;
    select p.followers_count into cur_count from public.profiles p where p.id = target_user_id;
    return query select true, coalesce(cur_count, 0);
  end if;
end $$;
grant execute on function public.toggle_follow(uuid) to authenticated;

-- 9. List followers / following -------------------------------------
create or replace function public.list_followers(target_user_id uuid)
returns table (
  user_id       uuid,
  username      text,
  display_name  text,
  avatar_url    text,
  verified      boolean,
  custom_badges jsonb
) language sql stable security definer set search_path = public as $$
  select p.id, p.username::text, p.display_name, p.avatar_url, p.verified,
         coalesce(p.custom_badges, '[]'::jsonb)
    from public.followers f
    join public.profiles  p on p.id = f.follower_id
   where f.followee_id = target_user_id
     and coalesce(p.is_banned,false) = false
   order by f.created_at desc
   limit 500;
$$;
grant execute on function public.list_followers(uuid) to authenticated, anon;

create or replace function public.list_following(target_user_id uuid)
returns table (
  user_id       uuid,
  username      text,
  display_name  text,
  avatar_url    text,
  verified      boolean,
  custom_badges jsonb
) language sql stable security definer set search_path = public as $$
  select p.id, p.username::text, p.display_name, p.avatar_url, p.verified,
         coalesce(p.custom_badges, '[]'::jsonb)
    from public.followers f
    join public.profiles  p on p.id = f.followee_id
   where f.follower_id = target_user_id
     and coalesce(p.is_banned,false) = false
   order by f.created_at desc
   limit 500;
$$;
grant execute on function public.list_following(uuid) to authenticated, anon;

-- 10. Trader leaderboard --------------------------------------------
create or replace function public.users_leaderboard(
  kind     text default 'pnl',     -- 'pnl' | 'winrate' | 'volume' | 'followers'
  max_rows int  default 25
) returns table (
  user_id        uuid,
  username       text,
  display_name   text,
  avatar_url     text,
  verified       boolean,
  custom_badges  jsonb,
  followers_count integer,
  trades_count   integer,
  pnl_pct        numeric,
  win_rate       numeric,
  volume_usd     numeric
) language plpgsql stable security definer set search_path = public as $$
declare k text := lower(coalesce(kind,'pnl'));
begin
  if k not in ('pnl','winrate','volume','followers') then k := 'pnl'; end if;

  return query
    select p.id, p.username::text, p.display_name, p.avatar_url, p.verified,
           coalesce(p.custom_badges, '[]'::jsonb),
           p.followers_count, p.trades_count,
           p.pnl_pct, p.win_rate, p.volume_usd
      from public.profiles p
     where coalesce(p.is_banned,false) = false
     order by
       case when k = 'pnl'       then p.pnl_pct       end desc nulls last,
       case when k = 'winrate'   then p.win_rate      end desc nulls last,
       case when k = 'volume'    then p.volume_usd    end desc nulls last,
       case when k = 'followers' then p.followers_count end desc nulls last,
       p.created_at desc
     limit greatest(1, least(max_rows, 100));
end $$;
grant execute on function public.users_leaderboard(text, int) to authenticated, anon;

-- 11. Follower-count + notification trigger -------------------------
create or replace function public.handle_followers_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.profiles set followers_count = followers_count + 1 where id = new.followee_id;
    update public.profiles set following_count = following_count + 1 where id = new.follower_id;
    begin
      insert into public.notifications (user_id, actor_id, type, title, body)
      values (new.followee_id, new.follower_id, 'follow', 'New follower',
              'Someone just followed you');
    exception when undefined_table then null;
              when others then null;
    end;
    return new;
  elsif tg_op = 'DELETE' then
    update public.profiles set followers_count = greatest(0, followers_count - 1) where id = old.followee_id;
    update public.profiles set following_count = greatest(0, following_count - 1) where id = old.follower_id;
    return old;
  end if;
  return null;
end $$;

drop trigger if exists trg_followers_ins on public.followers;
drop trigger if exists trg_followers_del on public.followers;
create trigger trg_followers_ins after insert on public.followers
  for each row execute function public.handle_followers_change();
create trigger trg_followers_del after delete on public.followers
  for each row execute function public.handle_followers_change();

-- 12. Re-sync follower / following counts ---------------------------
update public.profiles p
   set followers_count = coalesce((select count(*) from public.followers f where f.followee_id = p.id), 0),
       following_count = coalesce((select count(*) from public.followers f where f.follower_id = p.id), 0);

-- 13. Realtime publication ------------------------------------------
do $$
declare
  t text;
  tables text[] := array['profiles','followers','user_presence','notifications'];
begin
  foreach t in array tables loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
              when undefined_object  then null;
              when others            then null;
    end;
  end loop;
end $$;

-- 14. Auto-mark stale presence as offline (read-time helper) --------
create or replace function public.sweep_presence()
returns void language sql security definer set search_path = public as $$
  update public.user_presence
     set status = 'offline', updated_at = now()
   where status <> 'offline'
     and last_seen < now() - interval '5 minutes';
$$;
grant execute on function public.sweep_presence() to authenticated, anon;

-- =====================================================================
-- DONE
-- =====================================================================


-- ==============================================================
-- SECTION: supabase/migrations/20260501110000_stories.sql
-- ==============================================================

-- =====================================================================
-- STORIES — ephemeral 36h photo stories with viewer tracking
-- =====================================================================
-- Idempotent migration that adds:
--   • stories + story_views tables
--   • storage bucket `story-media`
--   • RPCs: list_active_stories, list_story_viewers, record_story_view,
--           delete_my_story, sweep_expired_stories
--   • RLS, indexes, realtime publication
-- =====================================================================

create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- 1. Tables ----------------------------------------------------------
create table if not exists public.stories (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  media_url   text not null,
  caption     text,
  views_count integer not null default 0,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '36 hours')
);
create index if not exists stories_user_idx       on public.stories (user_id, created_at desc);
create index if not exists stories_active_idx     on public.stories (expires_at);
create index if not exists stories_created_idx    on public.stories (created_at desc);

create table if not exists public.story_views (
  story_id   uuid not null references public.stories(id) on delete cascade,
  viewer_id  uuid not null references auth.users(id) on delete cascade,
  viewed_at  timestamptz not null default now(),
  primary key (story_id, viewer_id)
);
create index if not exists story_views_viewer_idx on public.story_views (viewer_id, viewed_at desc);
create index if not exists story_views_story_idx  on public.story_views (story_id, viewed_at desc);

-- 2. RLS -------------------------------------------------------------
alter table public.stories      enable row level security;
alter table public.story_views  enable row level security;

drop policy if exists stories_read         on public.stories;
drop policy if exists stories_insert_self  on public.stories;
drop policy if exists stories_delete_self  on public.stories;
create policy stories_read        on public.stories for select using (true);
create policy stories_insert_self on public.stories for insert to authenticated
  with check (auth.uid() = user_id);
create policy stories_delete_self on public.stories for delete to authenticated
  using (auth.uid() = user_id);

drop policy if exists story_views_read        on public.story_views;
drop policy if exists story_views_insert_self on public.story_views;
create policy story_views_read        on public.story_views for select using (true);
create policy story_views_insert_self on public.story_views for insert to authenticated
  with check (auth.uid() = viewer_id);

-- 3. Storage bucket --------------------------------------------------
insert into storage.buckets (id, name, public) values
  ('story-media', 'story-media', true)
  on conflict (id) do update set public = true;

do $$
declare b text := 'story-media';
begin
  begin execute format('drop policy if exists %I on storage.objects', b||'_read'); exception when others then null; end;
  begin execute format('drop policy if exists %I on storage.objects', b||'_insert'); exception when others then null; end;
  begin execute format('drop policy if exists %I on storage.objects', b||'_update'); exception when others then null; end;
  begin execute format('drop policy if exists %I on storage.objects', b||'_delete'); exception when others then null; end;

  execute format($p$create policy %I on storage.objects
    for select using (bucket_id = %L)$p$, b||'_read', b);
  execute format($p$create policy %I on storage.objects
    for insert to authenticated
    with check (bucket_id = %L and (storage.foldername(name))[1] = auth.uid()::text)$p$, b||'_insert', b);
  execute format($p$create policy %I on storage.objects
    for update to authenticated
    using (bucket_id = %L and (storage.foldername(name))[1] = auth.uid()::text)
    with check (bucket_id = %L and (storage.foldername(name))[1] = auth.uid()::text)$p$, b||'_update', b, b);
  execute format($p$create policy %I on storage.objects
    for delete to authenticated
    using (bucket_id = %L and (storage.foldername(name))[1] = auth.uid()::text)$p$, b||'_delete', b);
end $$;

-- 4. Sweep helper (callers can run this opportunistically) -----------
create or replace function public.sweep_expired_stories()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  with d as (delete from public.stories where expires_at <= now() returning 1)
  select count(*)::int into n from d;
  return coalesce(n, 0);
end $$;
grant execute on function public.sweep_expired_stories() to authenticated, anon;

-- 5. List active stories with author + viewed_by_me ------------------
create or replace function public.list_active_stories(max_rows int default 200)
returns table (
  id           uuid,
  user_id      uuid,
  username     text,
  display_name text,
  avatar_url   text,
  avatar_color text,
  verified     boolean,
  media_url    text,
  caption      text,
  views_count  integer,
  created_at   timestamptz,
  expires_at   timestamptz,
  viewed_by_me boolean
) language plpgsql stable security definer set search_path = public as $$
declare caller uuid := auth.uid();
begin
  return query
    select s.id,
           s.user_id,
           p.username::text,
           p.display_name,
           p.avatar_url,
           p.avatar_color,
           coalesce(p.verified, false),
           s.media_url,
           s.caption,
           s.views_count,
           s.created_at,
           s.expires_at,
           case when caller is null then false
                else exists(select 1 from public.story_views v
                             where v.story_id = s.id and v.viewer_id = caller)
           end
      from public.stories s
      join public.profiles p on p.id = s.user_id
     where s.expires_at > now()
       and coalesce(p.is_banned, false) = false
     order by s.created_at desc
     limit greatest(1, least(max_rows, 500));
end $$;
grant execute on function public.list_active_stories(int) to authenticated, anon;

-- 6. Viewers for a story (only owner can call meaningfully) ----------
create or replace function public.list_story_viewers(target_story_id uuid)
returns table (
  user_id      uuid,
  username     text,
  display_name text,
  avatar_url   text,
  avatar_color text,
  verified     boolean,
  viewed_at    timestamptz
) language plpgsql stable security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  owner  uuid;
begin
  select user_id into owner from public.stories where id = target_story_id;
  if owner is null then return; end if;
  -- Anyone can read viewer list (RLS allowed) but we still gate to owner
  -- to avoid leaking viewers across users.
  if caller is null or caller <> owner then return; end if;

  return query
    select v.viewer_id,
           p.username::text,
           p.display_name,
           p.avatar_url,
           p.avatar_color,
           coalesce(p.verified, false),
           v.viewed_at
      from public.story_views v
      join public.profiles p on p.id = v.viewer_id
     where v.story_id = target_story_id
     order by v.viewed_at desc
     limit 500;
end $$;
grant execute on function public.list_story_viewers(uuid) to authenticated;

-- 7. Record a view (idempotent, increments views_count once) ---------
create or replace function public.record_story_view(target_story_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  owner  uuid;
  fresh  boolean := false;
  new_count integer;
begin
  if caller is null then return 0; end if;
  select user_id into owner from public.stories where id = target_story_id;
  if owner is null then return 0; end if;
  if owner = caller then
    select views_count into new_count from public.stories where id = target_story_id;
    return coalesce(new_count, 0);
  end if;

  insert into public.story_views (story_id, viewer_id)
  values (target_story_id, caller)
  on conflict do nothing;
  get diagnostics fresh = row_count;

  if fresh then
    update public.stories
       set views_count = views_count + 1
     where id = target_story_id
     returning views_count into new_count;
  else
    select views_count into new_count from public.stories where id = target_story_id;
  end if;

  return coalesce(new_count, 0);
end $$;
grant execute on function public.record_story_view(uuid) to authenticated;

-- 8. Delete my story --------------------------------------------------
create or replace function public.delete_my_story(target_story_id uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare caller uuid := auth.uid();
begin
  if caller is null then return false; end if;
  delete from public.stories
   where id = target_story_id and user_id = caller;
  return found;
end $$;
grant execute on function public.delete_my_story(uuid) to authenticated;

-- 9. Realtime publication --------------------------------------------
do $$
declare
  t text;
  tables text[] := array['stories','story_views'];
begin
  foreach t in array tables loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
              when undefined_object  then null;
              when others            then null;
    end;
  end loop;
end $$;

-- =====================================================================
-- DONE
-- =====================================================================


-- ==============================================================
-- SECTION: sql/002_storage_and_buckets.sql
-- ==============================================================

-- =====================================================================
-- STORAGE BUCKETS CONFIGURATION
-- Supabase Storage buckets for user uploads
-- =====================================================================

-- NOTE: Storage buckets are created via the Supabase Dashboard or API
-- These SQL statements document the required bucket structure

-- BUCKET 1: Avatars
-- Name: avatars
-- Public: true
-- MIME types: image/*
-- Max file size: 5 MB (5242880 bytes)
-- Storage Path: /avatars/{user_id}/avatar.{ext}

-- BUCKET 2: Banners/Wallpapers  
-- Name: banners
-- Public: true
-- MIME types: image/*
-- Max file size: 10 MB (10485760 bytes)
-- Storage Path: /banners/{user_id}/banner.{ext}

-- BUCKET 3: Community Images
-- Name: community-images
-- Public: true
-- MIME types: image/*
-- Max file size: 10 MB (10485760 bytes)
-- Storage Path: /community/{community_id}/{post_id}/image.{ext}

-- Storage Policies Documentation:

-- AVATARS BUCKET:
-- 1. Anonymous can view all avatars (SELECT)
-- 2. Authenticated users can upload to their own avatar folder (INSERT)
-- 3. Users can update/delete their own avatar (UPDATE, DELETE)
-- 4. Admin can delete any avatar (DELETE)

-- BANNERS BUCKET:
-- 1. Anonymous can view all banners (SELECT)
-- 2. Authenticated users can upload to their own banner folder (INSERT)
-- 3. Users can update/delete their own banner (UPDATE, DELETE)
-- 4. Admin can delete any banner (DELETE)

-- COMMUNITY IMAGES BUCKET:
-- 1. Anonymous can view community images (SELECT)
-- 2. Authenticated users can upload to community posts (INSERT)
-- 3. Users can manage their own post images (UPDATE, DELETE)
-- 4. Community admins can delete images in their community (DELETE)

-- NOTE: Configure these policies in the Supabase Dashboard:
-- Storage > [Bucket Name] > Policies

select 'Storage buckets configuration documented. Create buckets in Supabase Dashboard.' as status;


-- ==============================================================
-- SECTION: sql/003_community_create.sql
-- ==============================================================

-- ============================================================================
-- 003_community_create.sql
-- Adds support for the Create Community flow shipped in the app.
--
-- Run after 002_storage_and_buckets.sql.
-- Safe to re-run: every statement uses IF [NOT] EXISTS.
-- ============================================================================

-- 1. Communities table -------------------------------------------------------
create table if not exists public.communities (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    slug text unique,
    description text default '',
    owner_id uuid references auth.users(id) on delete set null,
    member_count integer default 1,
    posts_count integer default 0,
    online_count integer default 0,
    category text default 'alpha',
    icon_emoji text default '✨',
    accent_a text,
    accent_b text,
    verified boolean default false,
    trending boolean default false,
    pinned_ticker text,
    rules jsonb default '[]'::jsonb,
    tags jsonb default '[]'::jsonb,
    is_private boolean default false,
    created_at timestamptz default now()
);

create index if not exists communities_owner_idx on public.communities(owner_id);
create index if not exists communities_trending_idx on public.communities(trending);
create index if not exists communities_category_idx on public.communities(category);

-- 2. Membership table --------------------------------------------------------
create table if not exists public.community_members (
    community_id uuid references public.communities(id) on delete cascade,
    user_id uuid references auth.users(id) on delete cascade,
    role text default 'member',
    joined_at timestamptz default now(),
    primary key (community_id, user_id)
);

create index if not exists community_members_user_idx on public.community_members(user_id);

-- 3. Posts table -------------------------------------------------------------
create table if not exists public.community_posts (
    id uuid primary key default gen_random_uuid(),
    community_id uuid references public.communities(id) on delete cascade,
    user_id uuid references auth.users(id) on delete set null,
    content text not null,
    ticker text,
    change_pct numeric,
    likes_count integer default 0,
    comments_count integer default 0,
    pinned boolean default false,
    created_at timestamptz default now()
);

create index if not exists community_posts_community_idx on public.community_posts(community_id, created_at desc);

-- 4. RLS ---------------------------------------------------------------------
alter table public.communities enable row level security;
alter table public.community_members enable row level security;
alter table public.community_posts enable row level security;

-- Communities: anyone can read non-private; owners can manage.
drop policy if exists "communities_select" on public.communities;
create policy "communities_select" on public.communities
    for select using (
        is_private = false
        or owner_id = auth.uid()
        or exists (
            select 1 from public.community_members m
            where m.community_id = id and m.user_id = auth.uid()
        )
    );

drop policy if exists "communities_insert" on public.communities;
create policy "communities_insert" on public.communities
    for insert with check (auth.uid() is not null and owner_id = auth.uid());

drop policy if exists "communities_update_owner" on public.communities;
create policy "communities_update_owner" on public.communities
    for update using (owner_id = auth.uid());

-- Members: a user can read their own memberships and members of communities they belong to.
drop policy if exists "community_members_select" on public.community_members;
create policy "community_members_select" on public.community_members
    for select using (true);

drop policy if exists "community_members_insert_self" on public.community_members;
create policy "community_members_insert_self" on public.community_members
    for insert with check (auth.uid() = user_id);

drop policy if exists "community_members_delete_self" on public.community_members;
create policy "community_members_delete_self" on public.community_members
    for delete using (auth.uid() = user_id);

-- Posts: members can read; authors can insert/update.
drop policy if exists "community_posts_select" on public.community_posts;
create policy "community_posts_select" on public.community_posts
    for select using (
        exists (
            select 1 from public.communities c
            where c.id = community_id
              and (
                c.is_private = false
                or c.owner_id = auth.uid()
                or exists (
                    select 1 from public.community_members m
                    where m.community_id = c.id and m.user_id = auth.uid()
                )
              )
        )
    );

drop policy if exists "community_posts_insert" on public.community_posts;
create policy "community_posts_insert" on public.community_posts
    for insert with check (auth.uid() = user_id);

drop policy if exists "community_posts_update_author" on public.community_posts;
create policy "community_posts_update_author" on public.community_posts
    for update using (auth.uid() = user_id);

-- 5. Triggers to keep counters in sync ---------------------------------------
create or replace function public.community_member_count_trigger()
returns trigger language plpgsql as $$
begin
    if (tg_op = 'INSERT') then
        update public.communities set member_count = coalesce(member_count, 0) + 1
            where id = new.community_id;
    elsif (tg_op = 'DELETE') then
        update public.communities set member_count = greatest(coalesce(member_count, 1) - 1, 0)
            where id = old.community_id;
    end if;
    return null;
end;
$$;

drop trigger if exists trg_community_member_count on public.community_members;
create trigger trg_community_member_count
    after insert or delete on public.community_members
    for each row execute function public.community_member_count_trigger();

create or replace function public.community_post_count_trigger()
returns trigger language plpgsql as $$
begin
    if (tg_op = 'INSERT') then
        update public.communities set posts_count = coalesce(posts_count, 0) + 1
            where id = new.community_id;
    elsif (tg_op = 'DELETE') then
        update public.communities set posts_count = greatest(coalesce(posts_count, 1) - 1, 0)
            where id = old.community_id;
    end if;
    return null;
end;
$$;

drop trigger if exists trg_community_post_count on public.community_posts;
create trigger trg_community_post_count
    after insert or delete on public.community_posts
    for each row execute function public.community_post_count_trigger();

