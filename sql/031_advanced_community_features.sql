-- 031_advanced_community_features.sql
-- Adds a 100-feature community capability registry, per-community toggles,
-- events, reactions, polls, alerts, keyword filters, reputation, and audit logs.
-- Safe to run more than once.

create extension if not exists pgcrypto;

create table if not exists public.community_feature_catalog (
  id text primary key,
  category text not null check (category in ('posting', 'engagement', 'moderation', 'feed', 'token', 'voice', 'notifications', 'ops', 'alpha', 'safety')),
  surface text not null check (surface in ('community', 'home', 'discover', 'voice', 'moderation', 'token', 'notifications')),
  title text not null,
  impact text not null check (impact in ('core', 'growth', 'trust', 'alpha')),
  enabled_by_default boolean not null default false,
  sort_order integer not null,
  created_at timestamptz not null default now()
);

insert into public.community_feature_catalog(id, category, surface, title, impact, enabled_by_default, sort_order)
values
('image-post-composer','posting','community','Image post composer','core',true,1),
('token-ca-autoscan','posting','community','Solana CA auto-scan','alpha',true,2),
('quote-posts','posting','community','Quote posts','core',true,3),
('threaded-replies','posting','community','Threaded replies','core',true,4),
('rich-link-cards','posting','community','Rich link cards','growth',false,5),
('draft-recovery','posting','community','Draft recovery','core',false,6),
('post-templates','posting','community','Post templates','growth',false,7),
('spoiler-tags','posting','community','Spoiler tags','trust',false,8),
('poll-posts','posting','community','Poll posts','growth',false,9),
('scheduled-posts','posting','community','Scheduled posts','growth',false,10),
('post-likes','engagement','community','Post likes','core',true,11),
('post-reposts','engagement','community','Reposts','core',true,12),
('post-bookmarks','engagement','community','Saved posts','core',true,13),
('mention-notifications','engagement','community','Mention notifications','growth',false,14),
('reaction-badges','engagement','community','Reaction badges','growth',false,15),
('share-links','engagement','community','Share links','growth',true,16),
('member-streaks','engagement','community','Member streaks','growth',false,17),
('reputation-points','engagement','community','Reputation points','trust',false,18),
('contributor-levels','engagement','community','Contributor levels','growth',false,19),
('follow-contributors','engagement','home','Follow contributors','growth',false,20),
('owner-delete-posts','moderation','moderation','Owner deletes own posts','trust',true,21),
('admin-delete-any-post','moderation','moderation','Admin delete all posts','trust',true,22),
('report-queue','moderation','moderation','Report queue','trust',true,23),
('pin-posts','moderation','community','Pinned posts','core',true,24),
('mute-keywords','moderation','moderation','Muted keywords','trust',false,25),
('scam-labels','moderation','moderation','Scam labels','trust',false,26),
('post-cooldowns','moderation','moderation','Post cooldowns','trust',false,27),
('automod-ca-risk','moderation','token','AutoMod CA risk','trust',false,28),
('moderator-notes','moderation','moderation','Moderator notes','trust',false,29),
('audit-log','moderation','moderation','Audit log','trust',true,30),
('separate-home-community-feeds','feed','home','Separate home/community feeds','core',true,31),
('recent-filter','feed','community','Recent feed filter','core',true,32),
('media-filter','feed','community','Media feed filter','core',true,33),
('saved-filter','feed','community','Saved feed filter','core',true,34),
('advanced-search','feed','community','Advanced search','core',true,35),
('community-trending','feed','community','Community trending','growth',false,36),
('hot-replies','feed','community','Hot replies','growth',false,37),
('top-token-feed','feed','token','Top token feed','alpha',false,38),
('member-leaderboard','feed','community','Member leaderboard','growth',false,39),
('unread-recap','feed','community','Unread recap','growth',false,40),
('birdeye-metadata','token','token','Birdeye metadata','alpha',true,41),
('dexscreener-chart','token','token','Dex chart popup','alpha',true,42),
('helius-owner-scan','token','token','Helius owner scan','alpha',false,43),
('liquidity-risk','token','token','Liquidity risk','trust',false,44),
('holder-analysis','token','token','Holder analysis','alpha',false,45),
('volume-spike-alert','token','community','Volume spike alerts','alpha',false,46),
('marketcap-filters','token','discover','Market cap filters','alpha',true,47),
('copy-contract','token','token','Copy contract','core',true,48),
('pair-detection','token','token','Pair detection','alpha',true,49),
('small-cap-runner-score','token','discover','Small-cap runner score','alpha',true,50),
('voice-lobbies','voice','voice','Voice lobbies','core',true,51),
('lobby-chat','voice','voice','Lobby chat','core',true,52),
('lobby-watchlist','voice','voice','Lobby watchlist','alpha',true,53),
('raised-hands','voice','voice','Raised hands','core',true,54),
('speaker-roles','voice','voice','Speaker roles','core',true,55),
('live-reactions','voice','voice','Live reactions','growth',true,56),
('private-lobbies','voice','voice','Private lobbies','growth',true,57),
('recording-flags','voice','voice','Recording flags','trust',false,58),
('token-calls-in-lobby','voice','voice','Token calls in lobby','alpha',true,59),
('host-close-lobby','voice','voice','Host close lobby','core',true,60),
('community-alerts','notifications','community','Community alerts','core',true,61),
('keyword-alerts','notifications','community','Keyword alerts','growth',false,62),
('token-alerts','notifications','token','Token alerts','alpha',false,63),
('whale-alerts','notifications','home','Whale alerts','alpha',false,64),
('reply-alerts','notifications','community','Reply alerts','growth',false,65),
('quote-alerts','notifications','community','Quote alerts','growth',false,66),
('mention-digest','notifications','community','Mention digest','growth',false,67),
('mod-alerts','notifications','moderation','Moderator alerts','trust',false,68),
('new-member-alerts','notifications','community','New member alerts','growth',false,69),
('daily-recap','notifications','discover','Daily recap','growth',false,70),
('avatar-upload','ops','community','Avatar upload','core',true,71),
('banner-upload','ops','community','Banner upload','core',true,72),
('rules-display','ops','community','Rules display','trust',true,73),
('invite-links','ops','community','Invite links','growth',true,74),
('verified-badge','ops','community','Verified badge','trust',true,75),
('member-preview-stack','ops','community','Member preview stack','growth',true,76),
('private-community-gate','ops','community','Private community gate','trust',true,77),
('category-tags','ops','discover','Category tags','growth',true,78),
('owner-tools','ops','community','Owner tools','core',true,79),
('analytics-card','ops','community','Analytics card','growth',true,80),
('daily-runners','alpha','discover','Current daily runners','alpha',true,81),
('runners-2025','alpha','discover','2025 runners','alpha',true,82),
('runners-2026','alpha','discover','2026 runners','alpha',true,83),
('utility-runners','alpha','discover','Utility runners','alpha',true,84),
('charity-runners','alpha','discover','Charity coins','alpha',true,85),
('block-large-caps','alpha','discover','Block large caps','trust',true,86),
('live-source-strip','alpha','discover','Live source strip','trust',true,87),
('runner-confidence','alpha','discover','Runner confidence','alpha',true,88),
('trending-tags','alpha','discover','Trending tags','growth',true,89),
('watchlist-sync','alpha','discover','Watchlist sync','alpha',true,90),
('safe-token-filter','safety','discover','Safe token filter','trust',true,91),
('malicious-link-warning','safety','community','Malicious link warning','trust',false,92),
('burner-wallet-warning','safety','token','Burner wallet warning','trust',false,93),
('liquidity-lock-hint','safety','token','Liquidity lock hint','trust',false,94),
('report-scam','safety','moderation','Report scam','trust',true,95),
('verified-member-marker','safety','community','Verified member marker','trust',false,96),
('trust-tier','safety','community','Trust tier','trust',false,97),
('duplicate-ca-detection','safety','token','Duplicate CA detection','trust',false,98),
('copied-ca-audit','safety','token','Copied CA audit','trust',false,99),
('source-transparency','safety','discover','Source transparency','trust',true,100)
on conflict (id) do update
set category = excluded.category,
    surface = excluded.surface,
    title = excluded.title,
    impact = excluded.impact,
    enabled_by_default = excluded.enabled_by_default,
    sort_order = excluded.sort_order;

create table if not exists public.community_feature_settings (
  community_id uuid not null references public.communities(id) on delete cascade,
  feature_id text not null references public.community_feature_catalog(id) on delete cascade,
  enabled boolean not null default true,
  config jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (community_id, feature_id)
);

create table if not exists public.community_feature_events (
  id uuid primary key default gen_random_uuid(),
  community_id uuid references public.communities(id) on delete cascade,
  feature_id text references public.community_feature_catalog(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  target_type text,
  target_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.community_keyword_filters (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  keyword text not null,
  action text not null default 'flag' check (action in ('flag', 'hide', 'block')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (community_id, keyword)
);

create table if not exists public.community_post_reactions (
  post_id uuid not null references public.community_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id, emoji)
);

create table if not exists public.community_user_reputation (
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  score integer not null default 0,
  streak_days integer not null default 0,
  trust_tier text not null default 'new' check (trust_tier in ('new', 'trusted', 'analyst', 'moderator', 'restricted')),
  last_active_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (community_id, user_id)
);

create table if not exists public.community_alert_rules (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rule_type text not null check (rule_type in ('keyword', 'token', 'reply', 'quote', 'volume_spike', 'daily_recap')),
  query text not null default '',
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique (community_id, user_id, rule_type, query)
);

create table if not exists public.community_post_polls (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  question text not null,
  options jsonb not null default '[]'::jsonb,
  closes_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.community_poll_votes (
  poll_id uuid not null references public.community_post_polls(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  option_index integer not null check (option_index >= 0),
  created_at timestamptz not null default now(),
  primary key (poll_id, user_id)
);

create index if not exists idx_community_feature_settings_community on public.community_feature_settings(community_id, enabled);
create index if not exists idx_community_feature_events_community_created on public.community_feature_events(community_id, created_at desc);
create index if not exists idx_community_keyword_filters_community on public.community_keyword_filters(community_id);
create index if not exists idx_community_post_reactions_post on public.community_post_reactions(post_id, created_at desc);
create index if not exists idx_community_user_reputation_score on public.community_user_reputation(community_id, score desc);
create index if not exists idx_community_alert_rules_user on public.community_alert_rules(user_id, enabled);
create index if not exists idx_community_post_polls_post on public.community_post_polls(post_id);

alter table public.community_feature_catalog enable row level security;
alter table public.community_feature_settings enable row level security;
alter table public.community_feature_events enable row level security;
alter table public.community_keyword_filters enable row level security;
alter table public.community_post_reactions enable row level security;
alter table public.community_user_reputation enable row level security;
alter table public.community_alert_rules enable row level security;
alter table public.community_post_polls enable row level security;
alter table public.community_poll_votes enable row level security;

create or replace function public.can_manage_community_features(target_community_id uuid, target_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.communities c
    where c.id = target_community_id
      and (
        c.owner_id = target_user_id
        or public.is_community_post_moderator(target_user_id)
      )
  );
$$;

create or replace function public.log_community_feature_event(
  target_community_id uuid,
  target_feature_id text,
  p_event_type text,
  p_target_type text default null,
  p_target_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id uuid;
begin
  insert into public.community_feature_events(
    community_id,
    feature_id,
    actor_id,
    event_type,
    target_type,
    target_id,
    metadata
  ) values (
    target_community_id,
    target_feature_id,
    auth.uid(),
    left(coalesce(nullif(trim(p_event_type), ''), 'event'), 80),
    nullif(trim(coalesce(p_target_type, '')), ''),
    nullif(trim(coalesce(p_target_id, '')), ''),
    coalesce(p_metadata, '{}'::jsonb)
  ) returning id into new_id;

  return new_id;
end;
$$;

create or replace function public.toggle_community_feature(
  target_community_id uuid,
  target_feature_id text,
  p_enabled boolean
)
returns table(feature_id text, enabled boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  acting_user uuid := auth.uid();
begin
  if acting_user is null then
    raise exception 'Sign in required';
  end if;
  if not public.can_manage_community_features(target_community_id, acting_user) then
    raise exception 'Only community owners, admins, or moderators can update features';
  end if;
  if not exists (select 1 from public.community_feature_catalog cfc where cfc.id = target_feature_id) then
    raise exception 'Unknown feature';
  end if;

  insert into public.community_feature_settings(community_id, feature_id, enabled, updated_by, updated_at)
  values (target_community_id, target_feature_id, p_enabled, acting_user, now())
  on conflict (community_id, feature_id) do update
    set enabled = excluded.enabled,
        updated_by = excluded.updated_by,
        updated_at = now();

  perform public.log_community_feature_event(
    target_community_id,
    target_feature_id,
    case when p_enabled then 'feature_enabled' else 'feature_disabled' end,
    'feature',
    target_feature_id,
    jsonb_build_object('enabled', p_enabled)
  );

  return query select target_feature_id, p_enabled;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'community_feature_catalog' and policyname = 'community_feature_catalog_select') then
    create policy community_feature_catalog_select on public.community_feature_catalog for select using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'community_feature_settings' and policyname = 'community_feature_settings_select') then
    create policy community_feature_settings_select on public.community_feature_settings for select using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'community_feature_settings' and policyname = 'community_feature_settings_upsert_manager') then
    create policy community_feature_settings_upsert_manager
      on public.community_feature_settings
      for all
      to authenticated
      using (public.can_manage_community_features(community_id, auth.uid()))
      with check (public.can_manage_community_features(community_id, auth.uid()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'community_feature_events' and policyname = 'community_feature_events_select') then
    create policy community_feature_events_select on public.community_feature_events for select using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'community_feature_events' and policyname = 'community_feature_events_insert_auth') then
    create policy community_feature_events_insert_auth on public.community_feature_events for insert to authenticated with check (auth.uid() = actor_id or actor_id is null);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'community_keyword_filters' and policyname = 'community_keyword_filters_select') then
    create policy community_keyword_filters_select on public.community_keyword_filters for select using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'community_keyword_filters' and policyname = 'community_keyword_filters_manage') then
    create policy community_keyword_filters_manage on public.community_keyword_filters for all to authenticated using (public.can_manage_community_features(community_id, auth.uid())) with check (public.can_manage_community_features(community_id, auth.uid()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'community_post_reactions' and policyname = 'community_post_reactions_select') then
    create policy community_post_reactions_select on public.community_post_reactions for select using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'community_post_reactions' and policyname = 'community_post_reactions_insert_own') then
    create policy community_post_reactions_insert_own on public.community_post_reactions for insert to authenticated with check (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'community_post_reactions' and policyname = 'community_post_reactions_delete_own') then
    create policy community_post_reactions_delete_own on public.community_post_reactions for delete to authenticated using (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'community_user_reputation' and policyname = 'community_user_reputation_select') then
    create policy community_user_reputation_select on public.community_user_reputation for select using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'community_user_reputation' and policyname = 'community_user_reputation_manage') then
    create policy community_user_reputation_manage on public.community_user_reputation for all to authenticated using (public.can_manage_community_features(community_id, auth.uid())) with check (public.can_manage_community_features(community_id, auth.uid()));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'community_alert_rules' and policyname = 'community_alert_rules_own') then
    create policy community_alert_rules_own on public.community_alert_rules for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'community_post_polls' and policyname = 'community_post_polls_select') then
    create policy community_post_polls_select on public.community_post_polls for select using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'community_post_polls' and policyname = 'community_post_polls_insert_author') then
    create policy community_post_polls_insert_author on public.community_post_polls for insert to authenticated with check (
      exists (select 1 from public.community_posts cp where cp.id = post_id and cp.user_id = auth.uid())
    );
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'community_poll_votes' and policyname = 'community_poll_votes_select') then
    create policy community_poll_votes_select on public.community_poll_votes for select using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'community_poll_votes' and policyname = 'community_poll_votes_own') then
    create policy community_poll_votes_own on public.community_poll_votes for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

grant execute on function public.can_manage_community_features(uuid, uuid) to authenticated;
grant execute on function public.log_community_feature_event(uuid, text, text, text, text, jsonb) to authenticated;
grant execute on function public.toggle_community_feature(uuid, text, boolean) to authenticated;
