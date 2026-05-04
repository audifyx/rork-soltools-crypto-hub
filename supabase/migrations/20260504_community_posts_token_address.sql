-- Persist Solana token metadata on community_posts so the resolved CA
-- (from the autolink CA <-> ticker flow) is stored alongside each post.
-- Idempotent: safe to re-run.

alter table public.community_posts
  add column if not exists token_address text,
  add column if not exists token_symbol text,
  add column if not exists token_name text,
  add column if not exists token_logo_url text,
  add column if not exists token_price_usd numeric,
  add column if not exists token_change_24h numeric,
  add column if not exists token_market_cap_usd numeric,
  add column if not exists token_liquidity_usd numeric,
  add column if not exists token_volume_24h_usd numeric,
  add column if not exists token_pair_address text,
  add column if not exists token_decimals integer,
  add column if not exists token_holder_count integer,
  add column if not exists token_metadata jsonb default '{}'::jsonb,
  add column if not exists token_scanned_at timestamptz;

-- Helpful indexes for "posts mentioning a token" queries.
create index if not exists community_posts_token_address_idx
  on public.community_posts (token_address)
  where token_address is not null;

create index if not exists community_posts_token_symbol_idx
  on public.community_posts (token_symbol)
  where token_symbol is not null;
