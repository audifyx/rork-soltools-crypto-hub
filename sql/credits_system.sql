-- SolTools credits / points system
-- Mirrors supabase/migrations/202605100001_credits_system.sql for manual database review/apply.
-- Frontend must only read balances/logs and call consume_tool_credits(); never mutate balances directly.

create extension if not exists pgcrypto;

create table if not exists public.credits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance integer not null default 10000 check (balance >= 0),
  monthly_cap integer not null default 10000 check (monthly_cap >= 0),
  reset_at timestamptz not null default (date_trunc('month', now()) + interval '1 month'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.credit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  tool_id text not null,
  target text,
  cost integer not null check (cost >= 0),
  balance_after integer not null check (balance_after >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists credit_logs_user_created_idx on public.credit_logs(user_id, created_at desc);
create index if not exists credit_logs_tool_created_idx on public.credit_logs(tool_id, created_at desc);

create or replace function public.credit_cost_for_action(p_action text)
returns integer
language sql
immutable
as $$
  select case p_action
    when 'tokenScan' then 5
    when 'walletAnalysis' then 25
    when 'devWalletAnalysis' then 50
    when 'narrativeScan' then 20
    when 'whaleTracking' then 15
    when 'deepScan' then 100
    when 'aiNarrativeReport' then 150
    else 25
  end;
$$;

create or replace function public.ensure_credit_row(p_user_id uuid)
returns public.credits
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.credits;
begin
  insert into public.credits(user_id, balance, monthly_cap, reset_at)
  values (p_user_id, 10000, 10000, date_trunc('month', now()) + interval '1 month')
  on conflict (user_id) do nothing;

  select * into v_row from public.credits where user_id = p_user_id for update;

  if v_row.reset_at <= now() then
    update public.credits
    set balance = monthly_cap,
        reset_at = date_trunc('month', now()) + interval '1 month',
        updated_at = now()
    where user_id = p_user_id
    returning * into v_row;
  end if;

  return v_row;
end;
$$;

create or replace function public.get_credit_balance()
returns table(balance integer, monthly_cap integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.credits;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  v_row := public.ensure_credit_row(v_uid);
  return query select v_row.balance, v_row.monthly_cap, v_row.reset_at;
end;
$$;

create or replace function public.consume_tool_credits(
  p_action text,
  p_tool_id text,
  p_target text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.credits;
  v_cost integer;
  v_recent_count integer;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Sign in required');
  end if;

  v_cost := public.credit_cost_for_action(p_action);
  v_row := public.ensure_credit_row(v_uid);

  select count(*)::integer into v_recent_count
  from public.credit_logs
  where user_id = v_uid
    and created_at > now() - interval '1 minute';

  if v_recent_count >= 30 then
    return jsonb_build_object('ok', false, 'error', 'Rate limit reached. Try again in a minute.');
  end if;

  if v_row.balance < v_cost then
    return jsonb_build_object('ok', false, 'error', 'Not enough credits', 'balance', v_row.balance, 'cost', v_cost);
  end if;

  update public.credits
  set balance = balance - v_cost,
      updated_at = now()
  where user_id = v_uid
  returning * into v_row;

  insert into public.credit_logs(user_id, action, tool_id, target, cost, balance_after, metadata)
  values (v_uid, p_action, coalesce(p_tool_id, 'unknown'), left(p_target, 160), v_cost, v_row.balance, coalesce(p_metadata, '{}'::jsonb));

  return jsonb_build_object('ok', true, 'balance', v_row.balance, 'cost', v_cost);
end;
$$;

alter table public.credits enable row level security;
alter table public.credit_logs enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='credits' and policyname='credits_select_own') then
    create policy credits_select_own on public.credits for select using (user_id = auth.uid());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='credit_logs' and policyname='credit_logs_select_own') then
    create policy credit_logs_select_own on public.credit_logs for select using (user_id = auth.uid());
  end if;
end $$;
