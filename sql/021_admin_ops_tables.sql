-- 021_admin_ops_tables.sql
-- Admin ops tables: provider health + moderation queue.

create table if not exists public.admin_data_sources (
  provider text primary key,
  status text not null default 'unknown' check (status in ('healthy','degraded','outage','unknown')),
  last_success_at timestamptz,
  last_error_at timestamptz,
  latency_ms integer,
  request_count_24h integer not null default 0,
  error_count_24h integer not null default 0,
  meta jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_moderation_queue (
  id uuid primary key default gen_random_uuid(),
  item_type text not null,
  item_id text not null,
  reason text not null default '',
  status text not null default 'open' check (status in ('open','reviewing','resolved','rejected')),
  reporter_id uuid references auth.users(id) on delete set null,
  assigned_to uuid references auth.users(id) on delete set null,
  resolved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  meta jsonb not null default '{}'::jsonb
);

create index if not exists admin_mod_status_idx on public.admin_moderation_queue (status, created_at desc);
create index if not exists admin_sources_status_idx on public.admin_data_sources (status, updated_at desc);

do $$ begin
  alter table public.admin_data_sources enable row level security;
  alter table public.admin_moderation_queue enable row level security;

  drop policy if exists admin_sources_admin_all on public.admin_data_sources;
  create policy admin_sources_admin_all on public.admin_data_sources for all
    using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

  drop policy if exists admin_mod_admin_all on public.admin_moderation_queue;
  create policy admin_mod_admin_all on public.admin_moderation_queue for all
    using (public.is_admin(auth.uid())) with check (public.is_admin(auth.uid()));

  drop policy if exists admin_mod_report_self on public.admin_moderation_queue;
  create policy admin_mod_report_self on public.admin_moderation_queue for insert
    with check (auth.uid() = reporter_id);
end $$;

insert into public.admin_data_sources (provider, status, meta) values
  ('alchemy_solana_rpc', 'unknown', '{"kind":"rpc"}'::jsonb),
  ('jupiter_quote', 'unknown', '{"kind":"swap"}'::jsonb),
  ('jupiter_order', 'unknown', '{"kind":"swap"}'::jsonb),
  ('jupiter_price', 'unknown', '{"kind":"price"}'::jsonb),
  ('jupiter_tokens', 'unknown', '{"kind":"tokens"}'::jsonb),
  ('birdeye_market', 'unknown', '{"kind":"market"}'::jsonb),
  ('livekit_voice', 'unknown', '{"kind":"voice"}'::jsonb),
  ('supabase_realtime', 'unknown', '{"kind":"database"}'::jsonb)
on conflict (provider) do nothing;

select '021_admin_ops_tables applied' as status;
