-- KOL Portfolio + holdings + seeded recent transactions.
-- Idempotent: safe to re-run. Depends on 20260505_kol_scan.sql.

create extension if not exists "pgcrypto";

-- ---------- KOL HOLDINGS ----------
create table if not exists public.kol_holdings (
  id uuid primary key default gen_random_uuid(),
  kol_id uuid not null references public.kol_profiles(id) on delete cascade,
  token_address text not null,
  symbol text not null,
  name text,
  logo_url text,
  balance numeric not null default 0,
  avg_buy_price numeric,
  current_price numeric,
  value_usd numeric not null default 0,
  pnl_usd numeric not null default 0,
  pnl_pct numeric not null default 0,
  updated_at timestamptz not null default now(),
  unique (kol_id, token_address)
);

create index if not exists kol_holdings_kol_idx on public.kol_holdings (kol_id, value_usd desc);

alter table public.kol_holdings enable row level security;
drop policy if exists kol_holdings_read on public.kol_holdings;
create policy kol_holdings_read on public.kol_holdings for select using (true);

-- ---------- RPCs ----------

create or replace function public.get_kol_holdings(p_kol_id uuid)
returns table (
  id uuid, kol_id uuid, token_address text, symbol text, name text, logo_url text,
  balance numeric, avg_buy_price numeric, current_price numeric,
  value_usd numeric, pnl_usd numeric, pnl_pct numeric, updated_at timestamptz
)
language sql stable security definer set search_path = public as $$
  select h.id, h.kol_id, h.token_address, h.symbol, h.name, h.logo_url,
         h.balance, h.avg_buy_price, h.current_price,
         h.value_usd, h.pnl_usd, h.pnl_pct, h.updated_at
  from public.kol_holdings h
  where h.kol_id = p_kol_id
  order by h.value_usd desc
$$;

create or replace function public.get_kol_portfolio(p_kol_id uuid)
returns table (
  kol_id uuid,
  name text,
  x_handle text,
  wallet_address text,
  blockchain text,
  avatar_url text,
  bio text,
  follower_count int,
  verified boolean,
  is_followed boolean,
  total_value_usd numeric,
  total_pnl_usd numeric,
  total_pnl_pct numeric,
  win_rate numeric,
  token_count int,
  tx_count int,
  top_holding_symbol text,
  top_holding_value_usd numeric
)
language sql stable security definer set search_path = public as $$
  with agg as (
    select
      coalesce(sum(h.value_usd), 0)::numeric as total_value_usd,
      coalesce(sum(h.pnl_usd), 0)::numeric as total_pnl_usd,
      count(*)::int as token_count
    from public.kol_holdings h where h.kol_id = p_kol_id
  ),
  top as (
    select h.symbol, h.value_usd
    from public.kol_holdings h
    where h.kol_id = p_kol_id
    order by h.value_usd desc
    limit 1
  ),
  txs as (
    select count(*)::int as tx_count
    from public.kol_transactions t where t.kol_id = p_kol_id
  )
  select k.id as kol_id, k.name, k.x_handle, k.wallet_address, k.blockchain,
         k.avatar_url, k.bio, k.follower_count, k.verified,
         exists(
           select 1 from public.kol_followers f
           where f.kol_id = k.id and f.user_id = auth.uid()
         ) as is_followed,
         agg.total_value_usd,
         agg.total_pnl_usd,
         case when (agg.total_value_usd - agg.total_pnl_usd) > 0
              then (agg.total_pnl_usd / (agg.total_value_usd - agg.total_pnl_usd)) * 100
              else 0 end as total_pnl_pct,
         k.win_rate,
         agg.token_count,
         coalesce(txs.tx_count, 0) as tx_count,
         top.symbol as top_holding_symbol,
         top.value_usd as top_holding_value_usd
  from public.kol_profiles k
  cross join agg
  left join top on true
  left join txs on true
  where k.id = p_kol_id
$$;

grant execute on function public.get_kol_holdings(uuid) to anon, authenticated;
grant execute on function public.get_kol_portfolio(uuid) to anon, authenticated;

-- ---------- SEED HOLDINGS + RECENT TRANSACTIONS (idempotent-ish) ----------
-- Only seeds if nothing exists for a given KOL yet, so real on-chain sync can overwrite freely later.

do $$
declare
  rec record;
  i int;
  tokens text[] := array['SOL','BONK','WIF','JUP','JTO','POPCAT','MEW','PYTH','RAY','PNUT','FARTCOIN','GOAT'];
  addrs  text[] := array[
    'So11111111111111111111111111111111111111112',
    'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
    'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
    'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
    'jtojtomepa8beP8AuQc6eXt5FriJwfFMwQx2v2f9mCL',
    '7GCihgDB8fe6KNjn2MYtkzZcRjQy3t9GHdC8uHYmW2hr',
    'MEW1gQWJ3nEXg2qgERiKu7FAFj79PHvQVREQUzScPP5',
    'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3',
    '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
    '2qEHjDLDLbuBgRYvsxhc5D6uDWAivNFZGan56P1tpump',
    '9BB6NFEcjBCtnNLFko2FqVQBq8HHM13kCyYcdQbgpump',
    'CzLSujWBLFsSjncfkh59rUFqvafWcY5tzedWJSuypump'
  ];
  price numeric;
  bal numeric;
  val numeric;
  pnl numeric;
  sym text;
  addr text;
  buyer_addr text;
  buyer_sym text;
  ttype text;
  amt_in numeric;
  amt_out numeric;
  usd_v numeric;
begin
  for rec in select id, wallet_address from public.kol_profiles loop
    -- Only seed if this KOL has no holdings yet
    if (select count(*) from public.kol_holdings where kol_id = rec.id) = 0 then
      for i in 1..5 loop
        sym := tokens[((i * (hashtext(rec.id::text) & 7) ) % array_length(tokens,1)) + 1];
        addr := addrs[((i * (hashtext(rec.id::text) & 7) ) % array_length(addrs,1)) + 1];
        price := case sym
          when 'SOL' then 180 + random()*30
          when 'BONK' then 0.0000215 + random()*0.0000050
          when 'WIF' then 2.1 + random()*0.6
          when 'JUP' then 0.78 + random()*0.25
          when 'JTO' then 3.2 + random()*0.8
          when 'POPCAT' then 0.42 + random()*0.15
          when 'MEW' then 0.0072 + random()*0.0015
          when 'PYTH' then 0.34 + random()*0.1
          when 'RAY' then 4.2 + random()*0.9
          when 'PNUT' then 0.38 + random()*0.12
          when 'FARTCOIN' then 1.2 + random()*0.5
          when 'GOAT' then 0.18 + random()*0.08
          else 1 end;
        bal := case sym
          when 'SOL' then 200 + random()*800
          when 'BONK' then 50_000_000 + random()*250_000_000
          when 'WIF' then 12_000 + random()*40_000
          when 'JUP' then 40_000 + random()*120_000
          when 'JTO' then 8_000 + random()*22_000
          else 5_000 + random()*30_000 end;
        val := price * bal;
        pnl := val * (random()*0.8 - 0.2); -- -20% to +60% PnL
        insert into public.kol_holdings (kol_id, token_address, symbol, name, balance, avg_buy_price, current_price, value_usd, pnl_usd, pnl_pct)
        values (
          rec.id, addr || '-' || i, sym, sym, bal,
          price * (1 - (pnl / nullif(val, 0)) ), price, val, pnl,
          case when val - pnl > 0 then (pnl / (val - pnl)) * 100 else 0 end
        )
        on conflict (kol_id, token_address) do nothing;
      end loop;
    end if;

    -- Only seed transactions if none exist yet for this KOL
    if (select count(*) from public.kol_transactions where kol_id = rec.id) = 0 then
      for i in 1..10 loop
        ttype := (array['BUY','SELL','SWAP'])[1 + floor(random()*3)::int];
        sym := tokens[1 + floor(random()*array_length(tokens,1))::int];
        addr := addrs[1 + floor(random()*array_length(addrs,1))::int];
        buyer_sym := 'USDC';
        buyer_addr := 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
        amt_in := case when ttype = 'BUY' then 250 + random()*4500 else 1000 + random()*30_000 end;
        amt_out := case when ttype = 'BUY' then (amt_in / (0.5 + random()*20)) else (amt_in * (0.5 + random()*20)) end;
        usd_v := case when ttype = 'BUY' then amt_in else amt_in * (0.001 + random()*2) end;
        insert into public.kol_transactions (
          kol_id, tx_hash, blockchain, tx_type,
          symbol_in, symbol_out, token_in_address, token_out_address,
          amount_in, amount_out, usd_value, slippage_pct, occurred_at
        ) values (
          rec.id,
          encode(gen_random_bytes(32), 'hex'),
          'solana',
          ttype,
          case when ttype = 'BUY' then buyer_sym when ttype = 'SELL' then sym else sym end,
          case when ttype = 'BUY' then sym when ttype = 'SELL' then buyer_sym else tokens[1 + floor(random()*array_length(tokens,1))::int] end,
          case when ttype = 'BUY' then buyer_addr when ttype = 'SELL' then addr else addr end,
          case when ttype = 'BUY' then addr when ttype = 'SELL' then buyer_addr else addrs[1 + floor(random()*array_length(addrs,1))::int] end,
          amt_in,
          amt_out,
          usd_v,
          round((random()*3)::numeric, 2),
          now() - (interval '1 minute' * floor(random()*60*48))
        ) on conflict do nothing;
      end loop;
    end if;
  end loop;
end $$;

-- ---------- sync_kol_transactions stub (best-effort) ----------
-- If a real implementation isn't deployed yet, this no-op keeps client calls
-- from erroring. Real on-chain sync can replace it later.
create or replace function public.sync_kol_transactions()
returns table (inserted int, scanned int)
language plpgsql security definer set search_path = public as $$
begin
  return query select 0 as inserted, 0 as scanned;
end;
$$;

grant execute on function public.sync_kol_transactions() to authenticated, anon;
