-- 028_community_token_cards.sql
-- Adds Solana token contract cards to community posts plus storage policies for post images.
-- Safe to run more than once.

create extension if not exists pgcrypto;

-- Public bucket used by expo/lib/upload.ts for community post attachments.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'post-images',
  'post-images',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']
)
on conflict (id) do update
set public = true,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'post_images_public_read'
  ) then
    create policy post_images_public_read
      on storage.objects
      for select
      using (bucket_id = 'post-images');
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'post_images_insert_own_folder'
  ) then
    create policy post_images_insert_own_folder
      on storage.objects
      for insert
      to authenticated
      with check (
        bucket_id = 'post-images'
        and auth.uid()::text = (storage.foldername(name))[1]
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'post_images_update_own_folder'
  ) then
    create policy post_images_update_own_folder
      on storage.objects
      for update
      to authenticated
      using (
        bucket_id = 'post-images'
        and auth.uid()::text = (storage.foldername(name))[1]
      )
      with check (
        bucket_id = 'post-images'
        and auth.uid()::text = (storage.foldername(name))[1]
      );
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'post_images_delete_own_or_moderator'
  ) then
    create policy post_images_delete_own_or_moderator
      on storage.objects
      for delete
      to authenticated
      using (
        bucket_id = 'post-images'
        and (
          auth.uid()::text = (storage.foldername(name))[1]
          or public.is_community_post_moderator(auth.uid())
        )
      );
  end if;
end $$;

alter table if exists public.community_posts
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
  add column if not exists token_metadata jsonb not null default '{}'::jsonb,
  add column if not exists token_scanned_at timestamptz;

create index if not exists idx_community_posts_token_address
  on public.community_posts(token_address)
  where token_address is not null;
create index if not exists idx_community_posts_token_created
  on public.community_posts(token_address, created_at desc)
  where token_address is not null;

create table if not exists public.community_token_scans (
  token_address text primary key,
  chain text not null default 'solana',
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
  scanned_by uuid references auth.users(id) on delete set null,
  scanned_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_community_token_scans_updated
  on public.community_token_scans(updated_at desc);

alter table public.community_token_scans enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'community_token_scans'
      and policyname = 'community_token_scans_select'
  ) then
    create policy community_token_scans_select
      on public.community_token_scans
      for select
      using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'community_token_scans'
      and policyname = 'community_token_scans_upsert_authenticated'
  ) then
    create policy community_token_scans_upsert_authenticated
      on public.community_token_scans
      for insert
      to authenticated
      with check (auth.uid() = scanned_by or scanned_by is null);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'community_token_scans'
      and policyname = 'community_token_scans_update_authenticated'
  ) then
    create policy community_token_scans_update_authenticated
      on public.community_token_scans
      for update
      to authenticated
      using (true)
      with check (true);
  end if;
end $$;

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
  clean_address text := nullif(trim(coalesce(p_token_address, '')), '');
  acting_user uuid := auth.uid();
begin
  if clean_address is null then
    raise exception 'Token address required';
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
    coalesce(p_metadata, '{}'::jsonb),
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
      metadata = coalesce(excluded.metadata, '{}'::jsonb) || coalesce(public.community_token_scans.metadata, '{}'::jsonb),
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

-- Refresh community post list RPCs so token cards hydrate in one request.
drop function if exists public.list_community_posts(uuid, integer);
create function public.list_community_posts(target_community_id uuid, max_rows integer default 100)
returns table(
  id uuid,
  community_id uuid,
  user_id uuid,
  username text,
  display_name text,
  avatar_color text,
  content text,
  image_url text,
  ticker text,
  change_pct numeric,
  created_at timestamptz,
  likes_count integer,
  comments_count integer,
  reposts_count integer,
  liked boolean,
  reposted boolean,
  bookmarked boolean,
  reported boolean,
  pinned boolean,
  parent_post_id uuid,
  quote_post_id uuid,
  quote_content text,
  quote_author_username text,
  quote_author_display_name text,
  quote_image_url text,
  quote_ticker text,
  quote_created_at timestamptz,
  parent_content text,
  parent_author_username text,
  parent_author_display_name text,
  token_address text,
  token_symbol text,
  token_name text,
  token_logo_url text,
  token_price_usd numeric,
  token_change_24h numeric,
  token_market_cap_usd numeric,
  token_liquidity_usd numeric,
  token_volume_24h_usd numeric,
  token_pair_address text,
  token_decimals integer,
  token_holder_count integer,
  token_metadata jsonb,
  token_scanned_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    cp.id,
    cp.community_id,
    cp.user_id,
    prof.username::text,
    prof.display_name::text,
    prof.avatar_color::text,
    cp.content::text,
    cp.image_url::text,
    coalesce(cp.ticker, cp.token_symbol)::text,
    coalesce(cp.change_pct, cp.token_change_24h),
    cp.created_at,
    coalesce(cp.likes_count, 0)::integer,
    coalesce(cp.comments_count, 0)::integer,
    coalesce(cp.reposts_count, 0)::integer,
    exists (select 1 from public.post_likes pl where pl.post_id = cp.id and pl.user_id = auth.uid()) as liked,
    exists (select 1 from public.post_reposts pr where pr.post_id = cp.id and pr.user_id = auth.uid()) as reposted,
    exists (select 1 from public.post_bookmarks pb where pb.post_id = cp.id and pb.user_id = auth.uid()) as bookmarked,
    exists (select 1 from public.post_reports rr where rr.post_id = cp.id and rr.reporter_id = auth.uid()) as reported,
    coalesce(cp.pinned, false) as pinned,
    cp.parent_post_id,
    cp.quote_post_id,
    qp.content::text as quote_content,
    qprof.username::text as quote_author_username,
    qprof.display_name::text as quote_author_display_name,
    qp.image_url::text as quote_image_url,
    coalesce(qp.ticker, qp.token_symbol)::text as quote_ticker,
    qp.created_at as quote_created_at,
    pp.content::text as parent_content,
    pprof.username::text as parent_author_username,
    pprof.display_name::text as parent_author_display_name,
    cp.token_address::text,
    coalesce(cp.token_symbol, cts.symbol)::text,
    coalesce(cp.token_name, cts.name)::text,
    coalesce(cp.token_logo_url, cts.logo_url)::text,
    coalesce(cp.token_price_usd, cts.price_usd),
    coalesce(cp.token_change_24h, cts.change_24h),
    coalesce(cp.token_market_cap_usd, cts.market_cap_usd),
    coalesce(cp.token_liquidity_usd, cts.liquidity_usd),
    coalesce(cp.token_volume_24h_usd, cts.volume_24h_usd),
    coalesce(cp.token_pair_address, cts.pair_address)::text,
    coalesce(cp.token_decimals, cts.decimals)::integer,
    coalesce(cp.token_holder_count, cts.holder_count)::integer,
    coalesce(nullif(cp.token_metadata, '{}'::jsonb), cts.metadata, '{}'::jsonb),
    cp.token_scanned_at
  from public.community_posts cp
  left join public.profiles prof on prof.user_id = cp.user_id or prof.id = cp.user_id
  left join public.community_posts qp on qp.id = cp.quote_post_id
  left join public.profiles qprof on qprof.user_id = qp.user_id or qprof.id = qp.user_id
  left join public.community_posts pp on pp.id = cp.parent_post_id
  left join public.profiles pprof on pprof.user_id = pp.user_id or pprof.id = pp.user_id
  left join public.community_token_scans cts on cts.token_address = cp.token_address
  where cp.community_id = target_community_id
    and cp.parent_post_id is null
  order by coalesce(cp.pinned, false) desc, cp.created_at desc
  limit greatest(1, least(coalesce(max_rows, 100), 250));
$$;

drop function if exists public.list_post_replies(uuid, integer);
create function public.list_post_replies(target_post_id uuid, max_rows integer default 100)
returns table(
  id uuid,
  community_id uuid,
  user_id uuid,
  username text,
  display_name text,
  avatar_color text,
  content text,
  image_url text,
  ticker text,
  change_pct numeric,
  created_at timestamptz,
  likes_count integer,
  comments_count integer,
  reposts_count integer,
  liked boolean,
  reposted boolean,
  bookmarked boolean,
  reported boolean,
  pinned boolean,
  parent_post_id uuid,
  quote_post_id uuid,
  quote_content text,
  quote_author_username text,
  quote_author_display_name text,
  quote_image_url text,
  quote_ticker text,
  quote_created_at timestamptz,
  parent_content text,
  parent_author_username text,
  parent_author_display_name text,
  token_address text,
  token_symbol text,
  token_name text,
  token_logo_url text,
  token_price_usd numeric,
  token_change_24h numeric,
  token_market_cap_usd numeric,
  token_liquidity_usd numeric,
  token_volume_24h_usd numeric,
  token_pair_address text,
  token_decimals integer,
  token_holder_count integer,
  token_metadata jsonb,
  token_scanned_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    cp.id,
    cp.community_id,
    cp.user_id,
    prof.username::text,
    prof.display_name::text,
    prof.avatar_color::text,
    cp.content::text,
    cp.image_url::text,
    coalesce(cp.ticker, cp.token_symbol)::text,
    coalesce(cp.change_pct, cp.token_change_24h),
    cp.created_at,
    coalesce(cp.likes_count, 0)::integer,
    coalesce(cp.comments_count, 0)::integer,
    coalesce(cp.reposts_count, 0)::integer,
    exists (select 1 from public.post_likes pl where pl.post_id = cp.id and pl.user_id = auth.uid()) as liked,
    exists (select 1 from public.post_reposts pr where pr.post_id = cp.id and pr.user_id = auth.uid()) as reposted,
    exists (select 1 from public.post_bookmarks pb where pb.post_id = cp.id and pb.user_id = auth.uid()) as bookmarked,
    exists (select 1 from public.post_reports rr where rr.post_id = cp.id and rr.reporter_id = auth.uid()) as reported,
    coalesce(cp.pinned, false) as pinned,
    cp.parent_post_id,
    cp.quote_post_id,
    qp.content::text as quote_content,
    qprof.username::text as quote_author_username,
    qprof.display_name::text as quote_author_display_name,
    qp.image_url::text as quote_image_url,
    coalesce(qp.ticker, qp.token_symbol)::text as quote_ticker,
    qp.created_at as quote_created_at,
    pp.content::text as parent_content,
    pprof.username::text as parent_author_username,
    pprof.display_name::text as parent_author_display_name,
    cp.token_address::text,
    coalesce(cp.token_symbol, cts.symbol)::text,
    coalesce(cp.token_name, cts.name)::text,
    coalesce(cp.token_logo_url, cts.logo_url)::text,
    coalesce(cp.token_price_usd, cts.price_usd),
    coalesce(cp.token_change_24h, cts.change_24h),
    coalesce(cp.token_market_cap_usd, cts.market_cap_usd),
    coalesce(cp.token_liquidity_usd, cts.liquidity_usd),
    coalesce(cp.token_volume_24h_usd, cts.volume_24h_usd),
    coalesce(cp.token_pair_address, cts.pair_address)::text,
    coalesce(cp.token_decimals, cts.decimals)::integer,
    coalesce(cp.token_holder_count, cts.holder_count)::integer,
    coalesce(nullif(cp.token_metadata, '{}'::jsonb), cts.metadata, '{}'::jsonb),
    cp.token_scanned_at
  from public.community_posts cp
  left join public.profiles prof on prof.user_id = cp.user_id or prof.id = cp.user_id
  left join public.community_posts qp on qp.id = cp.quote_post_id
  left join public.profiles qprof on qprof.user_id = qp.user_id or qprof.id = qp.user_id
  left join public.community_posts pp on pp.id = cp.parent_post_id
  left join public.profiles pprof on pprof.user_id = pp.user_id or pprof.id = pp.user_id
  left join public.community_token_scans cts on cts.token_address = cp.token_address
  where cp.parent_post_id = target_post_id
  order by cp.created_at asc
  limit greatest(1, least(coalesce(max_rows, 100), 250));
$$;

grant execute on function public.upsert_community_token_scan(text, text, text, text, numeric, numeric, numeric, numeric, numeric, text, integer, integer, jsonb) to authenticated;
grant execute on function public.list_community_posts(uuid, integer) to anon, authenticated;
grant execute on function public.list_post_replies(uuid, integer) to anon, authenticated;
