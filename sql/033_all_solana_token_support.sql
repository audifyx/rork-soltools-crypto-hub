-- 033_all_solana_token_support.sql
-- Extends community token caching so Pump.fun, PumpSwap, SPL Token, and Token-2022 Solana mints all persist cleanly.
-- Safe to run more than once.

create extension if not exists pgcrypto;

create or replace function public.normalize_solana_mint_address(p_address text)
returns text
language plpgsql
immutable
as $$
declare
  clean text := nullif(trim(coalesce(p_address, '')), '');
begin
  if clean is null then
    return null;
  end if;

  clean := regexp_replace(clean, '[\.,;:\)\]\}]+$', '', 'g');

  if length(clean) < 32 or length(clean) > 44 or clean !~ '^[1-9A-HJ-NP-Za-km-z]+$' then
    raise exception 'Invalid Solana mint address: %', p_address;
  end if;

  return clean;
end;
$$;

alter table if exists public.community_posts
  add column if not exists token_program text,
  add column if not exists token_launchpad text,
  add column if not exists token_graduated_pool text,
  add column if not exists token_is_token_2022 boolean not null default false;

alter table if exists public.community_token_scans
  add column if not exists token_program text,
  add column if not exists launchpad text,
  add column if not exists graduated_pool text,
  add column if not exists is_token_2022 boolean not null default false,
  add column if not exists pair_created_at timestamptz,
  add column if not exists source_flags jsonb not null default '{}'::jsonb;

create index if not exists idx_community_token_scans_launchpad_updated
  on public.community_token_scans(launchpad, updated_at desc)
  where launchpad is not null;

create index if not exists idx_community_token_scans_program_updated
  on public.community_token_scans(token_program, updated_at desc)
  where token_program is not null;

create index if not exists idx_community_posts_token_launchpad_created
  on public.community_posts(token_launchpad, created_at desc)
  where token_launchpad is not null;

create or replace function public.upsert_community_token_scan(
  p_token_address text,
  p_symbol text default null,
  p_name text default null,
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
returns table(
  token_address text,
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
  metadata jsonb,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_address text := public.normalize_solana_mint_address(p_token_address);
  acting_user uuid := auth.uid();
  clean_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
  meta_token_program text := nullif(trim(coalesce(clean_metadata->>'tokenProgram', '')), '');
  meta_launchpad text := nullif(trim(coalesce(clean_metadata->>'launchpad', '')), '');
  meta_graduated_pool text := nullif(trim(coalesce(clean_metadata->>'graduatedPool', '')), '');
  meta_pair_created text := nullif(trim(coalesce(clean_metadata->>'pairCreatedAt', '')), '');
  meta_sources jsonb := coalesce(clean_metadata->'sources', '{}'::jsonb);
  next_pair_created_at timestamptz := null;
begin
  if meta_pair_created ~ '^\d+$' then
    next_pair_created_at := to_timestamp((meta_pair_created::numeric) / 1000.0);
  elsif meta_pair_created is not null then
    begin
      next_pair_created_at := meta_pair_created::timestamptz;
    exception when others then
      next_pair_created_at := null;
    end;
  end if;

  insert into public.community_token_scans(
    token_address,
    chain,
    symbol,
    name,
    logo_url,
    price_usd,
    change_24h,
    market_cap_usd,
    liquidity_usd,
    volume_24h_usd,
    pair_address,
    decimals,
    holder_count,
    metadata,
    token_program,
    launchpad,
    graduated_pool,
    is_token_2022,
    pair_created_at,
    source_flags,
    scanned_by,
    scanned_at,
    updated_at
  )
  values (
    clean_address,
    'solana',
    nullif(trim(coalesce(p_symbol, '')), ''),
    nullif(trim(coalesce(p_name, '')), ''),
    nullif(trim(coalesce(p_logo_url, '')), ''),
    p_price_usd,
    p_change_24h,
    p_market_cap_usd,
    p_liquidity_usd,
    p_volume_24h_usd,
    nullif(trim(coalesce(p_pair_address, '')), ''),
    p_decimals,
    p_holder_count,
    clean_metadata,
    meta_token_program,
    meta_launchpad,
    meta_graduated_pool,
    coalesce(meta_token_program = 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb', false),
    next_pair_created_at,
    meta_sources,
    acting_user,
    now(),
    now()
  )
  on conflict (token_address) do update
  set symbol = coalesce(excluded.symbol, public.community_token_scans.symbol),
      name = coalesce(excluded.name, public.community_token_scans.name),
      logo_url = coalesce(excluded.logo_url, public.community_token_scans.logo_url),
      price_usd = coalesce(excluded.price_usd, public.community_token_scans.price_usd),
      change_24h = coalesce(excluded.change_24h, public.community_token_scans.change_24h),
      market_cap_usd = coalesce(excluded.market_cap_usd, public.community_token_scans.market_cap_usd),
      liquidity_usd = coalesce(excluded.liquidity_usd, public.community_token_scans.liquidity_usd),
      volume_24h_usd = coalesce(excluded.volume_24h_usd, public.community_token_scans.volume_24h_usd),
      pair_address = coalesce(excluded.pair_address, public.community_token_scans.pair_address),
      decimals = coalesce(excluded.decimals, public.community_token_scans.decimals),
      holder_count = coalesce(excluded.holder_count, public.community_token_scans.holder_count),
      metadata = coalesce(public.community_token_scans.metadata, '{}'::jsonb) || coalesce(excluded.metadata, '{}'::jsonb),
      token_program = coalesce(excluded.token_program, public.community_token_scans.token_program),
      launchpad = coalesce(excluded.launchpad, public.community_token_scans.launchpad),
      graduated_pool = coalesce(excluded.graduated_pool, public.community_token_scans.graduated_pool),
      is_token_2022 = public.community_token_scans.is_token_2022 or excluded.is_token_2022,
      pair_created_at = coalesce(excluded.pair_created_at, public.community_token_scans.pair_created_at),
      source_flags = coalesce(public.community_token_scans.source_flags, '{}'::jsonb) || coalesce(excluded.source_flags, '{}'::jsonb),
      scanned_by = coalesce(acting_user, public.community_token_scans.scanned_by),
      scanned_at = now(),
      updated_at = now();

  return query
  select cts.token_address,
         cts.symbol,
         cts.name,
         cts.logo_url,
         cts.price_usd,
         cts.change_24h,
         cts.market_cap_usd,
         cts.liquidity_usd,
         cts.volume_24h_usd,
         cts.pair_address,
         cts.decimals,
         cts.holder_count,
         cts.metadata,
         cts.updated_at
  from public.community_token_scans cts
  where cts.token_address = clean_address;
end;
$$;

grant execute on function public.normalize_solana_mint_address(text) to anon, authenticated;
grant execute on function public.upsert_community_token_scan(text, text, text, text, numeric, numeric, numeric, numeric, numeric, text, integer, integer, jsonb) to authenticated;
