-- KOL Scan: track key opinion leader wallets and their on-chain activity.
-- Idempotent: safe to re-run.

create extension if not exists "pgcrypto";

-- ---------- KOL PROFILES ----------
create table if not exists public.kol_profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  x_handle text,
  wallet_address text not null,
  blockchain text not null default 'solana',
  avatar_url text,
  bio text,
  follower_count int not null default 0,
  total_pnl_usd numeric not null default 0,
  win_rate numeric not null default 0,            -- 0..100
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  unique (blockchain, wallet_address)
);

create index if not exists kol_profiles_followers_idx on public.kol_profiles (follower_count desc);
create index if not exists kol_profiles_handle_idx on public.kol_profiles (lower(x_handle));
create index if not exists kol_profiles_name_idx on public.kol_profiles (lower(name));

alter table public.kol_profiles enable row level security;
drop policy if exists kol_profiles_read on public.kol_profiles;
create policy kol_profiles_read on public.kol_profiles for select using (true);

-- ---------- KOL TRANSACTIONS ----------
create table if not exists public.kol_transactions (
  id uuid primary key default gen_random_uuid(),
  kol_id uuid not null references public.kol_profiles(id) on delete cascade,
  tx_hash text not null,
  blockchain text not null default 'solana',
  tx_type text not null,                          -- BUY|SELL|SWAP
  symbol_in text,
  symbol_out text,
  token_in_address text,
  token_out_address text,
  amount_in numeric,
  amount_out numeric,
  usd_value numeric,
  slippage_pct numeric,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (blockchain, tx_hash, kol_id)
);

create index if not exists kol_tx_recent_idx on public.kol_transactions (occurred_at desc);
create index if not exists kol_tx_kol_idx on public.kol_transactions (kol_id, occurred_at desc);
create index if not exists kol_tx_type_idx on public.kol_transactions (tx_type, occurred_at desc);

alter table public.kol_transactions enable row level security;
drop policy if exists kol_tx_read on public.kol_transactions;
create policy kol_tx_read on public.kol_transactions for select using (true);

-- ---------- USER → KOL FOLLOWS ----------
create table if not exists public.kol_followers (
  user_id uuid not null references auth.users(id) on delete cascade,
  kol_id uuid not null references public.kol_profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, kol_id)
);

alter table public.kol_followers enable row level security;
drop policy if exists kol_followers_owner_select on public.kol_followers;
create policy kol_followers_owner_select on public.kol_followers for select using (auth.uid() = user_id);
drop policy if exists kol_followers_owner_write on public.kol_followers;
create policy kol_followers_owner_write on public.kol_followers
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- RPCs ----------

create or replace function public.get_kol_profiles(p_limit int default 30, p_offset int default 0)
returns table (
  id uuid, name text, x_handle text, wallet_address text, blockchain text,
  avatar_url text, bio text, follower_count int, total_pnl_usd numeric,
  win_rate numeric, verified boolean, is_followed boolean
)
language sql stable security definer set search_path = public as $$
  select k.id, k.name, k.x_handle, k.wallet_address, k.blockchain,
         k.avatar_url, k.bio, k.follower_count, k.total_pnl_usd,
         k.win_rate, k.verified,
         exists(
           select 1 from public.kol_followers f
           where f.kol_id = k.id and f.user_id = auth.uid()
         ) as is_followed
  from public.kol_profiles k
  order by k.follower_count desc, k.created_at desc
  limit greatest(p_limit, 1) offset greatest(p_offset, 0)
$$;

create or replace function public.search_kol_profiles(p_query text, p_limit int default 30)
returns table (
  id uuid, name text, x_handle text, wallet_address text, blockchain text,
  avatar_url text, bio text, follower_count int, total_pnl_usd numeric,
  win_rate numeric, verified boolean, is_followed boolean
)
language sql stable security definer set search_path = public as $$
  select k.id, k.name, k.x_handle, k.wallet_address, k.blockchain,
         k.avatar_url, k.bio, k.follower_count, k.total_pnl_usd,
         k.win_rate, k.verified,
         exists(
           select 1 from public.kol_followers f
           where f.kol_id = k.id and f.user_id = auth.uid()
         ) as is_followed
  from public.kol_profiles k
  where coalesce(p_query, '') = ''
     or lower(k.name) like '%' || lower(p_query) || '%'
     or lower(coalesce(k.x_handle, '')) like '%' || lower(p_query) || '%'
     or lower(k.wallet_address) like '%' || lower(p_query) || '%'
  order by k.follower_count desc
  limit greatest(p_limit, 1)
$$;

create or replace function public.get_kol_recent_transactions(
  p_kol_id uuid default null,
  p_tx_type text default null,
  p_limit int default 50,
  p_before timestamptz default null
)
returns table (
  id uuid, kol_id uuid, kol_name text, kol_handle text, kol_avatar text,
  tx_hash text, blockchain text, tx_type text,
  symbol_in text, symbol_out text,
  token_in_address text, token_out_address text,
  amount_in numeric, amount_out numeric,
  usd_value numeric, slippage_pct numeric,
  occurred_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select t.id, t.kol_id, k.name as kol_name, k.x_handle as kol_handle, k.avatar_url as kol_avatar,
         t.tx_hash, t.blockchain, t.tx_type,
         t.symbol_in, t.symbol_out,
         t.token_in_address, t.token_out_address,
         t.amount_in, t.amount_out,
         t.usd_value, t.slippage_pct,
         t.occurred_at
  from public.kol_transactions t
  join public.kol_profiles k on k.id = t.kol_id
  where (p_kol_id is null or t.kol_id = p_kol_id)
    and (p_tx_type is null or upper(t.tx_type) = upper(p_tx_type))
    and (p_before is null or t.occurred_at < p_before)
  order by t.occurred_at desc
  limit greatest(p_limit, 1)
$$;

create or replace function public.toggle_follow_kol(p_kol_id uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_existing int;
begin
  if v_uid is null then
    raise exception 'auth required';
  end if;
  select 1 into v_existing from public.kol_followers
   where user_id = v_uid and kol_id = p_kol_id;
  if v_existing is not null then
    delete from public.kol_followers where user_id = v_uid and kol_id = p_kol_id;
    update public.kol_profiles set follower_count = greatest(follower_count - 1, 0) where id = p_kol_id;
    return false;
  end if;
  insert into public.kol_followers (user_id, kol_id) values (v_uid, p_kol_id)
  on conflict do nothing;
  update public.kol_profiles set follower_count = follower_count + 1 where id = p_kol_id;
  return true;
end;
$$;

create or replace function public.get_user_followed_kols(p_limit int default 100)
returns table (
  id uuid, name text, x_handle text, wallet_address text, blockchain text,
  avatar_url text, bio text, follower_count int, total_pnl_usd numeric,
  win_rate numeric, verified boolean, is_followed boolean
)
language sql stable security definer set search_path = public as $$
  select k.id, k.name, k.x_handle, k.wallet_address, k.blockchain,
         k.avatar_url, k.bio, k.follower_count, k.total_pnl_usd,
         k.win_rate, k.verified, true as is_followed
  from public.kol_followers f
  join public.kol_profiles k on k.id = f.kol_id
  where f.user_id = auth.uid()
  order by f.created_at desc
  limit greatest(p_limit, 1)
$$;

grant execute on function public.get_kol_profiles(int, int) to anon, authenticated;
grant execute on function public.search_kol_profiles(text, int) to anon, authenticated;
grant execute on function public.get_kol_recent_transactions(uuid, text, int, timestamptz) to anon, authenticated;
grant execute on function public.toggle_follow_kol(uuid) to authenticated;
grant execute on function public.get_user_followed_kols(int) to authenticated;

-- ---------- SEED (best-effort, only if empty) ----------
do $$
begin
  if (select count(*) from public.kol_profiles) = 0 then
    insert into public.kol_profiles (name, x_handle, wallet_address, blockchain, avatar_url, bio, follower_count, total_pnl_usd, win_rate, verified)
    values
      ('Ansem',     'blknoiz06',    '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1', 'solana', null, 'Crypto trader and KOL',     128400, 5_240_000, 71.4, true),
      ('Mert',      'mert_helius',  'GThUX1Atko4tqhN2NaiTazWSeFWMuiUvfFnyJyUghFMJ', 'solana', null, 'Helius founder',             96320,  1_810_000, 64.2, true),
      ('Cobie',     'cobie',        'CcoNN8vEoz8c5PgxBwqsdv1FztzSPxdMGTpbE1cEJtVL', 'solana', null, 'Up Only podcast',            58210,    920_000, 58.7, true),
      ('Mr Frog',   'TheMisterFrog','HUpjvz2TUnsZbY6X6mQHWJABGAFFjxCAXMiV4zKn8Bve', 'solana', null, 'On-chain memecoin sleuth',   42180,    640_000, 62.0, false),
      ('Tay',       'tayvano_',     'GDfnEsia2WLAW5t8yx2X5j2mkfA74i5kwGdDuZHt7XmG', 'solana', null, 'Security and on-chain wiz', 31100,    310_000, 55.1, true);
  end if;
end $$;
