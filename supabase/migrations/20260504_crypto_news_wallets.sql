-- Crypto news + portfolio tracker schema
-- Idempotent: safe to re-run.

create extension if not exists "pgcrypto";

-- ---------- CRYPTO NEWS ----------
create table if not exists public.crypto_news (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_url text,
  title text not null,
  description text,
  image_url text,
  category text not null default 'trending',  -- trending|meme|viral|kol
  sentiment text,                              -- bullish|bearish|neutral
  coin_mentions text[] default '{}',
  engagement_likes int default 0,
  engagement_shares int default 0,
  engagement_comments int default 0,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists crypto_news_published_idx on public.crypto_news (published_at desc);
create index if not exists crypto_news_category_idx on public.crypto_news (category, published_at desc);

alter table public.crypto_news enable row level security;
drop policy if exists crypto_news_read on public.crypto_news;
create policy crypto_news_read on public.crypto_news for select using (true);

create table if not exists public.saved_news (
  user_id uuid not null references auth.users(id) on delete cascade,
  news_id uuid not null references public.crypto_news(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, news_id)
);

alter table public.saved_news enable row level security;
drop policy if exists saved_news_owner_select on public.saved_news;
create policy saved_news_owner_select on public.saved_news for select using (auth.uid() = user_id);
drop policy if exists saved_news_owner_write on public.saved_news;
create policy saved_news_owner_write on public.saved_news for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- USER WALLETS ----------
create table if not exists public.user_wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  blockchain text not null default 'solana',
  address text not null,
  label text,
  created_at timestamptz not null default now(),
  unique (user_id, blockchain, address)
);

alter table public.user_wallets enable row level security;
drop policy if exists user_wallets_owner_select on public.user_wallets;
create policy user_wallets_owner_select on public.user_wallets for select using (auth.uid() = user_id);
drop policy if exists user_wallets_owner_write on public.user_wallets;
create policy user_wallets_owner_write on public.user_wallets for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.wallet_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  wallet_id uuid references public.user_wallets(id) on delete cascade,
  token_address text,
  rule text not null,                  -- price_above|price_below|tx_in|tx_out|balance_change
  threshold numeric,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.wallet_alerts enable row level security;
drop policy if exists wallet_alerts_owner_all on public.wallet_alerts;
create policy wallet_alerts_owner_all on public.wallet_alerts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- RPCs ----------

create or replace function public.get_crypto_news_feed(
  p_category text default null,
  p_limit int default 30,
  p_before timestamptz default null
)
returns setof public.crypto_news
language sql
stable
security definer
set search_path = public
as $$
  select n.*
  from public.crypto_news n
  where (p_category is null or p_category = 'all' or n.category = p_category)
    and (p_before is null or n.published_at < p_before)
  order by n.published_at desc
  limit greatest(1, least(coalesce(p_limit, 30), 100));
$$;

create or replace function public.search_crypto_news(p_query text, p_limit int default 30)
returns setof public.crypto_news
language sql
stable
security definer
set search_path = public
as $$
  select n.*
  from public.crypto_news n
  where p_query is not null
    and (n.title ilike '%' || p_query || '%'
         or n.description ilike '%' || p_query || '%'
         or exists (select 1 from unnest(n.coin_mentions) m where m ilike '%' || p_query || '%'))
  order by n.published_at desc
  limit greatest(1, least(coalesce(p_limit, 30), 100));
$$;

create or replace function public.toggle_save_news(p_news_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_exists boolean;
begin
  if v_uid is null then
    raise exception 'auth required';
  end if;
  select exists(select 1 from public.saved_news where user_id = v_uid and news_id = p_news_id) into v_exists;
  if v_exists then
    delete from public.saved_news where user_id = v_uid and news_id = p_news_id;
    return false;
  end if;
  insert into public.saved_news (user_id, news_id) values (v_uid, p_news_id) on conflict do nothing;
  return true;
end;
$$;

create or replace function public.get_saved_crypto_news(p_limit int default 50)
returns setof public.crypto_news
language sql
stable
security definer
set search_path = public
as $$
  select n.*
  from public.saved_news s
  join public.crypto_news n on n.id = s.news_id
  where s.user_id = auth.uid()
  order by s.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 200));
$$;

create or replace function public.add_user_wallet(
  p_blockchain text,
  p_address text,
  p_label text default null
)
returns public.user_wallets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.user_wallets;
begin
  if v_uid is null then raise exception 'auth required'; end if;
  if p_address is null or length(trim(p_address)) < 8 then
    raise exception 'invalid address';
  end if;
  insert into public.user_wallets (user_id, blockchain, address, label)
  values (v_uid, coalesce(nullif(trim(p_blockchain), ''), 'solana'), trim(p_address), nullif(trim(p_label), ''))
  on conflict (user_id, blockchain, address) do update set label = excluded.label
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.get_user_wallets_summary()
returns table (
  id uuid,
  blockchain text,
  address text,
  label text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select id, blockchain, address, label, created_at
  from public.user_wallets
  where user_id = auth.uid()
  order by created_at desc;
$$;

create or replace function public.create_wallet_alert(
  p_wallet_id uuid,
  p_token_address text,
  p_rule text,
  p_threshold numeric
)
returns public.wallet_alerts
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.wallet_alerts;
begin
  if v_uid is null then raise exception 'auth required'; end if;
  insert into public.wallet_alerts (user_id, wallet_id, token_address, rule, threshold)
  values (v_uid, p_wallet_id, p_token_address, p_rule, p_threshold)
  returning * into v_row;
  return v_row;
end;
$$;

grant execute on function public.get_crypto_news_feed(text, int, timestamptz) to anon, authenticated;
grant execute on function public.search_crypto_news(text, int) to anon, authenticated;
grant execute on function public.toggle_save_news(uuid) to authenticated;
grant execute on function public.get_saved_crypto_news(int) to authenticated;
grant execute on function public.add_user_wallet(text, text, text) to authenticated;
grant execute on function public.get_user_wallets_summary() to authenticated;
grant execute on function public.create_wallet_alert(uuid, text, text, numeric) to authenticated;
