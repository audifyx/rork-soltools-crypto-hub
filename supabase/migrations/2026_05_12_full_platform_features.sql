-- =========================================================================
-- FULL PLATFORM FEATURES MIGRATION (41 features)
-- =========================================================================
-- Idempotent migration. Safe to re-run. Uses IF NOT EXISTS everywhere and
-- guards on existing objects (e.g. profiles, dm_conversations, dm_messages).
--
-- Sections:
--   1.  Messages: voice, disappearing, reactions, reply, receipts, typing,
--       search, pinned-in-chat, smart-replies, translate, folders/labels,
--       group DMs, scheduled, notes-to-self, vanish + screenshot alert.
--   2.  App-wide: stories, audio rooms, reels, polls, communities directory,
--       events, bookmarks, profile themes, handle marketplace, anon posts,
--       AI feed summary, global search, link unfurls, cross-poster, read-later.
--   3.  Growth: streaks, interest quiz, FoF suggestions, invites, push digest,
--       FYP feed, weekly recap, achievements, trending hashtags, reactivation,
--       live presence counters.
-- =========================================================================

-- Extensions ---------------------------------------------------------------
create extension if not exists pgcrypto;
create extension if not exists pg_trgm;
create extension if not exists "uuid-ossp";

-- =========================================================================
-- 1.  MESSAGES
-- =========================================================================

-- 1.1 Per-message extensions on dm_messages -------------------------------
alter table if exists public.dm_messages
  add column if not exists audio_url        text,
  add column if not exists audio_duration_ms integer,
  add column if not exists audio_waveform   jsonb,
  add column if not exists expires_at       timestamptz,
  add column if not exists scheduled_for    timestamptz,
  add column if not exists pinned_in_chat   boolean not null default false,
  add column if not exists pinned_at        timestamptz,
  add column if not exists pinned_by        uuid,
  add column if not exists is_smart_reply   boolean not null default false,
  add column if not exists translated_cache jsonb;
-- jsonb shape: { "en": "hello", "es": "hola" }

create index if not exists dm_messages_expires_idx
  on public.dm_messages (expires_at) where expires_at is not null;
create index if not exists dm_messages_scheduled_idx
  on public.dm_messages (scheduled_for) where scheduled_for is not null;
create index if not exists dm_messages_pinned_idx
  on public.dm_messages (conversation_id) where pinned_in_chat = true;
create index if not exists dm_messages_body_trgm
  on public.dm_messages using gin (body gin_trgm_ops);

-- 1.2 Per-conversation settings -------------------------------------------
create table if not exists public.dm_conversation_settings (
  conversation_id uuid primary key references public.dm_conversations(id) on delete cascade,
  disappearing_seconds integer,                 -- null = off
  vanish_mode boolean not null default false,   -- ephemeral chat
  screenshot_alerts boolean not null default true,
  group_name text,
  group_avatar_url text,
  is_group boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 1.3 Per-participant prefs (privacy + folders) ---------------------------
alter table if exists public.dm_participants
  add column if not exists read_receipts_enabled boolean not null default true,
  add column if not exists folder text,                -- friends/creators/communities/spam/custom
  add column if not exists role text not null default 'member', -- 'owner'|'admin'|'member'
  add column if not exists nickname text;

create index if not exists dm_participants_folder_idx
  on public.dm_participants (user_id, folder);

-- 1.4 Reactions (already partially exists – ensure shape) -----------------
create table if not exists public.dm_message_reactions (
  message_id uuid not null references public.dm_messages(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  emoji      text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);
create index if not exists dm_reactions_msg_idx on public.dm_message_reactions(message_id);

-- 1.5 Screenshot events ---------------------------------------------------
create table if not exists public.dm_screenshot_events (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.dm_conversations(id) on delete cascade,
  actor_id uuid not null references auth.users(id) on delete cascade,
  message_id uuid references public.dm_messages(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists dm_ss_conv_idx on public.dm_screenshot_events(conversation_id, created_at desc);

-- 1.6 Notes-to-self mark on conversations ---------------------------------
alter table if exists public.dm_conversations
  add column if not exists is_self_chat boolean not null default false;

-- 1.7 Smart-reply cache (per message, ephemeral) --------------------------
create table if not exists public.dm_smart_reply_cache (
  message_id uuid primary key references public.dm_messages(id) on delete cascade,
  suggestions jsonb not null,        -- ["Sounds good", "On it", "👍"]
  generated_at timestamptz not null default now()
);

-- 1.8 Scheduled message worker queue --------------------------------------
-- A pg-cron job (or edge function) flips scheduled_for messages into live.
create or replace function public.release_scheduled_dms() returns integer
language plpgsql security definer as $$
declare n integer;
begin
  update public.dm_messages
     set scheduled_for = null,
         created_at = greatest(created_at, now())
   where scheduled_for is not null
     and scheduled_for <= now();
  get diagnostics n = row_count;
  return n;
end $$;

-- 1.9 Disappearing message janitor ----------------------------------------
create or replace function public.expire_dm_messages() returns integer
language plpgsql security definer as $$
declare n integer;
begin
  update public.dm_messages
     set deleted_at = now(),
         body = null,
         image_url = null,
         audio_url = null
   where expires_at is not null
     and expires_at <= now()
     and deleted_at is null;
  get diagnostics n = row_count;
  return n;
end $$;

-- =========================================================================
-- 2.  APP-WIDE
-- =========================================================================

-- 2.1 Stories / 24h status ------------------------------------------------
create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  media_url text not null,
  media_type text not null check (media_type in ('image','video')),
  caption text,
  background_color text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  view_count integer not null default 0,
  reply_count integer not null default 0
);
create index if not exists stories_author_idx on public.stories(author_id, created_at desc);
create index if not exists stories_active_idx on public.stories(expires_at) where expires_at > now();

create table if not exists public.story_views (
  story_id uuid not null references public.stories(id) on delete cascade,
  viewer_id uuid not null references auth.users(id) on delete cascade,
  viewed_at timestamptz not null default now(),
  primary key (story_id, viewer_id)
);

create table if not exists public.story_replies (
  id uuid primary key default gen_random_uuid(),
  story_id uuid not null references public.stories(id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

-- 2.2 Live audio rooms (Spaces) ------------------------------------------
create table if not exists public.audio_rooms (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references auth.users(id) on delete cascade,
  community_id uuid,
  title text not null,
  description text,
  status text not null default 'live' check (status in ('scheduled','live','ended')),
  scheduled_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  recording_url text,
  listener_count integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists audio_rooms_status_idx on public.audio_rooms(status, started_at desc);

create table if not exists public.audio_room_participants (
  room_id uuid not null references public.audio_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'listener' check (role in ('host','cohost','speaker','listener')),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (room_id, user_id)
);

-- 2.3 Reels --------------------------------------------------------------
create table if not exists public.reels (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  video_url text not null,
  thumbnail_url text,
  caption text,
  duration_ms integer,
  width integer,
  height integer,
  like_count integer not null default 0,
  view_count integer not null default 0,
  comment_count integer not null default 0,
  share_count integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists reels_recent_idx on public.reels(created_at desc);
create index if not exists reels_popular_idx on public.reels(like_count desc, created_at desc);

create table if not exists public.reel_likes (
  reel_id uuid not null references public.reels(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (reel_id, user_id)
);

create table if not exists public.reel_views (
  reel_id uuid not null references public.reels(id) on delete cascade,
  viewer_id uuid not null references auth.users(id) on delete cascade,
  watched_ms integer not null default 0,
  viewed_at timestamptz not null default now(),
  primary key (reel_id, viewer_id)
);

-- 2.4 Polls & quizzes ----------------------------------------------------
create table if not exists public.polls (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid,                                  -- optional: attached to a post
  conversation_id uuid,                          -- optional: attached to a DM
  question text not null,
  multi_select boolean not null default false,
  is_quiz boolean not null default false,
  correct_option_id uuid,
  closes_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls(id) on delete cascade,
  label text not null,
  order_idx integer not null default 0,
  vote_count integer not null default 0
);

create table if not exists public.poll_votes (
  poll_id uuid not null references public.polls(id) on delete cascade,
  option_id uuid not null references public.poll_options(id) on delete cascade,
  voter_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (poll_id, option_id, voter_id)
);

-- 2.5 Communities directory ----------------------------------------------
alter table if exists public.communities
  add column if not exists category text,
  add column if not exists tags text[],
  add column if not exists trending_score numeric not null default 0,
  add column if not exists active_members_24h integer not null default 0,
  add column if not exists viewers_now integer not null default 0;

create index if not exists communities_category_idx on public.communities(category);
create index if not exists communities_trending_idx on public.communities(trending_score desc);

create table if not exists public.community_categories (
  slug text primary key,
  label text not null,
  icon text,
  color text,
  order_idx integer not null default 0
);

insert into public.community_categories(slug,label,icon,color,order_idx) values
  ('crypto','Crypto','coins','#F4C65B',1),
  ('art','Art & Design','palette','#FF5C8A',2),
  ('gaming','Gaming','gamepad-2','#A78BFA',3),
  ('tech','Tech & Startups','cpu','#38D7FF',4),
  ('memes','Memes','laugh','#55F5B2',5),
  ('music','Music','music','#FF9F43',6),
  ('sports','Sports','trophy','#34D399',7),
  ('learn','Learn','graduation-cap','#5B8DEF',8)
on conflict (slug) do nothing;

-- 2.6 Events -------------------------------------------------------------
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references auth.users(id) on delete cascade,
  community_id uuid,
  title text not null,
  description text,
  cover_url text,
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  is_virtual boolean not null default true,
  rsvp_count integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists events_upcoming_idx on public.events(starts_at);

create table if not exists public.event_rsvps (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'going' check (status in ('going','interested','declined')),
  remind_me boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

-- 2.7 Bookmarks & collections --------------------------------------------
create table if not exists public.bookmark_collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  emoji text,
  color text,
  is_private boolean not null default true,
  item_count integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists bookmark_collections_user_idx on public.bookmark_collections(user_id);

create table if not exists public.bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  collection_id uuid references public.bookmark_collections(id) on delete set null,
  item_type text not null check (item_type in ('post','reel','story','event','community','user','message')),
  item_id uuid not null,
  note text,
  created_at timestamptz not null default now(),
  unique (user_id, item_type, item_id)
);
create index if not exists bookmarks_user_idx on public.bookmarks(user_id, created_at desc);

-- 2.8 Profile themes -----------------------------------------------------
alter table if exists public.profiles
  add column if not exists theme_color text,
  add column if not exists theme_gradient jsonb,           -- { from:'#...', to:'#...' }
  add column if not exists banner_motion text,             -- 'none'|'parallax'|'aurora'|'sparkle'
  add column if not exists pinned_badge_id uuid;

-- 2.9 Verified handle marketplace ----------------------------------------
create table if not exists public.handles (
  handle text primary key check (handle ~ '^[a-z0-9_]{2,32}$'),
  owner_id uuid references auth.users(id) on delete set null,
  is_premium boolean not null default false,
  reserve_price_credits integer,
  claimed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.handle_listings (
  id uuid primary key default gen_random_uuid(),
  handle text not null references public.handles(handle) on delete cascade,
  seller_id uuid not null references auth.users(id) on delete cascade,
  price_credits integer not null,
  status text not null default 'open' check (status in ('open','sold','cancelled')),
  buyer_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  sold_at timestamptz
);
create index if not exists handle_listings_status_idx on public.handle_listings(status);

create table if not exists public.handle_transfers (
  id uuid primary key default gen_random_uuid(),
  handle text not null references public.handles(handle) on delete cascade,
  from_user_id uuid references auth.users(id) on delete set null,
  to_user_id   uuid references auth.users(id) on delete set null,
  kind text not null check (kind in ('claim','gift','sale','reclaim')),
  price_credits integer,
  created_at timestamptz not null default now()
);

-- 2.10 Anonymous posting mode --------------------------------------------
alter table if exists public.posts
  add column if not exists is_anonymous boolean not null default false,
  add column if not exists anon_alias text;
-- author_id is still recorded for moderation; clients filter to anon view.

-- 2.11 AI feed summary cache --------------------------------------------
create table if not exists public.ai_feed_summaries (
  user_id uuid not null references auth.users(id) on delete cascade,
  for_date date not null,
  summary text not null,
  highlights jsonb,                                -- [{ type, id, blurb }, ...]
  generated_at timestamptz not null default now(),
  primary key (user_id, for_date)
);

-- 2.12 Global search index (materialized lite) --------------------------
create table if not exists public.search_index (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (entity_type in ('user','post','community','reel','story','event','hashtag')),
  entity_id uuid not null,
  title text,
  body text,
  rank numeric not null default 0,
  updated_at timestamptz not null default now(),
  unique (entity_type, entity_id)
);
create index if not exists search_title_trgm on public.search_index using gin (title gin_trgm_ops);
create index if not exists search_body_trgm  on public.search_index using gin (body  gin_trgm_ops);
create index if not exists search_type_idx   on public.search_index (entity_type, rank desc);

-- 2.13 Link unfurl cache -------------------------------------------------
create table if not exists public.link_unfurls (
  url text primary key,
  title text,
  description text,
  image_url text,
  site_name text,
  provider text,                                   -- 'youtube'|'x'|'spotify'|'news'|...
  payload jsonb,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days')
);

-- 2.14 Cross-poster drafts ----------------------------------------------
create table if not exists public.post_drafts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  body text,
  media jsonb,                                     -- [{ url, type }, ...]
  target_community_ids uuid[],
  cross_post_status jsonb,                         -- { "<comm_id>": "pending|posted|failed" }
  scheduled_for timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists post_drafts_author_idx on public.post_drafts(author_id, updated_at desc);

-- 2.15 Read-later / catch-up --------------------------------------------
create table if not exists public.read_later (
  user_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid not null,
  added_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

create table if not exists public.feed_position (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_seen_post_id uuid,
  last_seen_at timestamptz not null default now()
);

-- =========================================================================
-- 3.  GROWTH, ENGAGEMENT & RETENTION
-- =========================================================================

-- 3.1 Daily streaks -----------------------------------------------------
create table if not exists public.user_streaks (
  user_id uuid primary key references auth.users(id) on delete cascade,
  current_streak integer not null default 0,
  longest_streak integer not null default 0,
  last_active_date date,
  freezes_available integer not null default 1,
  updated_at timestamptz not null default now()
);

create table if not exists public.streak_rewards_claimed (
  user_id uuid not null references auth.users(id) on delete cascade,
  milestone integer not null,                      -- 3,7,14,30,100...
  claimed_at timestamptz not null default now(),
  primary key (user_id, milestone)
);

create or replace function public.bump_streak(p_user uuid) returns void
language plpgsql security definer as $$
declare today date := (now() at time zone 'utc')::date;
declare row public.user_streaks%rowtype;
begin
  insert into public.user_streaks(user_id,last_active_date,current_streak,longest_streak)
    values (p_user, today, 1, 1)
    on conflict (user_id) do nothing;
  select * into row from public.user_streaks where user_id = p_user;
  if row.last_active_date = today then return; end if;
  if row.last_active_date = today - 1 then
    update public.user_streaks
       set current_streak = current_streak + 1,
           longest_streak = greatest(longest_streak, current_streak + 1),
           last_active_date = today,
           updated_at = now()
     where user_id = p_user;
  else
    update public.user_streaks
       set current_streak = 1,
           last_active_date = today,
           updated_at = now()
     where user_id = p_user;
  end if;
end $$;

-- 3.2 Interest quiz ------------------------------------------------------
create table if not exists public.interest_topics (
  slug text primary key,
  label text not null,
  icon text,
  color text
);

insert into public.interest_topics(slug,label,icon,color) values
  ('crypto','Crypto','coins','#F4C65B'),
  ('memes','Memes','laugh','#55F5B2'),
  ('gaming','Gaming','gamepad-2','#A78BFA'),
  ('art','Art','palette','#FF5C8A'),
  ('tech','Tech','cpu','#38D7FF'),
  ('music','Music','music','#FF9F43'),
  ('founders','Founders','rocket','#5B8DEF'),
  ('news','News','newspaper','#94A3B8')
on conflict (slug) do nothing;

create table if not exists public.user_interests (
  user_id uuid not null references auth.users(id) on delete cascade,
  topic_slug text not null references public.interest_topics(slug) on delete cascade,
  weight numeric not null default 1.0,
  source text not null default 'quiz',             -- 'quiz'|'inferred'|'explicit'
  created_at timestamptz not null default now(),
  primary key (user_id, topic_slug)
);

-- 3.3 Friend-of-friend suggestions cache --------------------------------
create table if not exists public.suggested_follows (
  user_id uuid not null references auth.users(id) on delete cascade,
  suggested_user_id uuid not null references auth.users(id) on delete cascade,
  mutual_count integer not null default 0,
  mutual_sample uuid[],
  reason text,                                     -- 'fof'|'topic'|'community'
  score numeric not null default 0,
  generated_at timestamptz not null default now(),
  primary key (user_id, suggested_user_id)
);
create index if not exists suggested_follows_score_idx
  on public.suggested_follows(user_id, score desc);

-- 3.4 Invites & referrals -----------------------------------------------
create table if not exists public.invite_codes (
  code text primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  uses integer not null default 0,
  max_uses integer,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  inviter_id uuid not null references auth.users(id) on delete cascade,
  invitee_id uuid not null references auth.users(id) on delete cascade,
  code text references public.invite_codes(code) on delete set null,
  reward_credits integer not null default 0,
  created_at timestamptz not null default now(),
  unique (invitee_id)
);
create index if not exists referrals_inviter_idx on public.referrals(inviter_id);

create or replace view public.referral_leaderboard as
  select inviter_id,
         count(*)::int as invited,
         coalesce(sum(reward_credits),0)::int as credits_earned
    from public.referrals
   group by inviter_id
   order by invited desc;

-- 3.5 Push notification digest -----------------------------------------
create table if not exists public.notification_digest (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bucket text not null check (bucket in ('mentions','likes','follows','messages','community','events')),
  count integer not null default 1,
  preview text,
  data jsonb,
  bundled_at timestamptz not null default now(),
  delivered_at timestamptz
);
create index if not exists notif_digest_user_idx
  on public.notification_digest(user_id, bundled_at desc);

alter table if exists public.profiles
  add column if not exists digest_frequency text not null default 'smart'
    check (digest_frequency in ('off','smart','hourly','daily')),
  add column if not exists quiet_hours_start time,
  add column if not exists quiet_hours_end time;

-- 3.6 "For you" feed ranking signals -----------------------------------
create table if not exists public.feed_signals (
  user_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid not null,
  signal text not null check (signal in ('view','dwell','like','reply','share','skip','hide')),
  weight numeric not null default 1.0,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id, signal, created_at)
);
create index if not exists feed_signals_user_recent
  on public.feed_signals(user_id, created_at desc);

create table if not exists public.fyp_cache (
  user_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid not null,
  score numeric not null,
  reason text,
  generated_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
create index if not exists fyp_cache_user_score on public.fyp_cache(user_id, score desc);

-- 3.7 Weekly recap cards ------------------------------------------------
create table if not exists public.weekly_recaps (
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start date not null,
  stats jsonb not null,                            -- { posts, likes, follows_gained, top_post_id, ... }
  share_image_url text,
  generated_at timestamptz not null default now(),
  primary key (user_id, week_start)
);

-- 3.8 Achievement badges -----------------------------------------------
create table if not exists public.achievements (
  slug text primary key,
  label text not null,
  description text,
  icon text,
  color text,
  tier text not null default 'bronze' check (tier in ('bronze','silver','gold','diamond')),
  threshold integer
);

insert into public.achievements(slug,label,description,icon,color,tier,threshold) values
  ('first_post','First Post','Posted your first message','sparkles','#55F5B2','bronze',1),
  ('100_followers','100 Followers','Reached 100 followers','users','#38D7FF','silver',100),
  ('1k_followers','1K Followers','Reached 1,000 followers','crown','#F4C65B','gold',1000),
  ('top_commenter','Top Commenter','100+ helpful comments','message-circle','#A78BFA','silver',100),
  ('streak_7','Week Warrior','7-day streak','flame','#FF5C8A','bronze',7),
  ('streak_30','Month Master','30-day streak','flame','#FF9F43','gold',30),
  ('community_founder','Founder','Created a community','rocket','#5B8DEF','silver',1),
  ('viral_post','Going Viral','A post crossed 10K views','trending-up','#34D399','gold',10000)
on conflict (slug) do nothing;

create table if not exists public.user_achievements (
  user_id uuid not null references auth.users(id) on delete cascade,
  achievement_slug text not null references public.achievements(slug) on delete cascade,
  earned_at timestamptz not null default now(),
  progress integer,
  primary key (user_id, achievement_slug)
);

-- 3.9 Trending hashtags & topics ---------------------------------------
create table if not exists public.hashtags (
  tag text primary key check (tag ~ '^[a-z0-9_]{1,64}$'),
  post_count integer not null default 0,
  trending_score numeric not null default 0,
  last_used_at timestamptz not null default now()
);
create index if not exists hashtags_trending_idx on public.hashtags(trending_score desc);

create table if not exists public.post_hashtags (
  post_id uuid not null,
  tag text not null references public.hashtags(tag) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, tag)
);
create index if not exists post_hashtags_tag_idx on public.post_hashtags(tag, created_at desc);

-- 3.10 Reactivation campaigns ------------------------------------------
create table if not exists public.reactivation_campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reason text not null,                            -- 'dormant_7d'|'dormant_30d'|'streak_lost'
  payload jsonb,
  sent_at timestamptz,
  opened_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists reactivation_user_idx on public.reactivation_campaigns(user_id, created_at desc);

-- 3.11 Live presence counters ------------------------------------------
create table if not exists public.live_presence (
  scope_type text not null check (scope_type in ('community','room','event','post')),
  scope_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_ping_at timestamptz not null default now(),
  primary key (scope_type, scope_id, user_id)
);
create index if not exists live_presence_recent
  on public.live_presence(scope_type, scope_id, last_ping_at desc);

create or replace function public.touch_presence(
  p_scope_type text,
  p_scope_id uuid
) returns void language plpgsql security definer as $$
begin
  insert into public.live_presence(scope_type, scope_id, user_id, last_ping_at)
    values (p_scope_type, p_scope_id, auth.uid(), now())
    on conflict (scope_type, scope_id, user_id)
    do update set last_ping_at = excluded.last_ping_at;
end $$;

create or replace function public.count_viewers_now(
  p_scope_type text,
  p_scope_id uuid
) returns integer language sql stable as $$
  select count(*)::int
    from public.live_presence
   where scope_type = p_scope_type
     and scope_id   = p_scope_id
     and last_ping_at > now() - interval '90 seconds'
$$;

-- =========================================================================
-- 4.  RPCS THE CLIENT WILL CALL
-- =========================================================================

-- 4.1 Set disappearing timer ------------------------------------------
create or replace function public.set_dm_disappearing(
  p_conversation_id uuid,
  p_seconds integer            -- null to disable
) returns void language plpgsql security definer as $$
begin
  if not exists (select 1 from public.dm_participants
                  where conversation_id = p_conversation_id and user_id = auth.uid()) then
    raise exception 'not a participant';
  end if;
  insert into public.dm_conversation_settings(conversation_id, disappearing_seconds)
    values (p_conversation_id, p_seconds)
    on conflict (conversation_id)
    do update set disappearing_seconds = excluded.disappearing_seconds,
                  updated_at = now();
end $$;

-- 4.2 Toggle read receipts per chat -----------------------------------
create or replace function public.set_dm_read_receipts(
  p_conversation_id uuid,
  p_enabled boolean
) returns void language plpgsql security definer as $$
begin
  update public.dm_participants
     set read_receipts_enabled = p_enabled
   where conversation_id = p_conversation_id
     and user_id = auth.uid();
end $$;

-- 4.3 Move conversation to folder -------------------------------------
create or replace function public.set_dm_folder(
  p_conversation_id uuid,
  p_folder text                -- 'friends'|'creators'|'communities'|'spam'|null
) returns void language plpgsql security definer as $$
begin
  update public.dm_participants
     set folder = p_folder
   where conversation_id = p_conversation_id
     and user_id = auth.uid();
end $$;

-- 4.4 Pin message inside chat -----------------------------------------
create or replace function public.toggle_pin_in_chat(
  p_message_id uuid
) returns boolean language plpgsql security definer as $$
declare conv uuid; pinned boolean;
begin
  select conversation_id, pinned_in_chat into conv, pinned
    from public.dm_messages where id = p_message_id;
  if conv is null then raise exception 'message not found'; end if;
  if not exists (select 1 from public.dm_participants
                  where conversation_id = conv and user_id = auth.uid()) then
    raise exception 'not a participant';
  end if;
  update public.dm_messages
     set pinned_in_chat = not coalesce(pinned, false),
         pinned_at = case when coalesce(pinned,false) then null else now() end,
         pinned_by = case when coalesce(pinned,false) then null else auth.uid() end
   where id = p_message_id;
  return not coalesce(pinned, false);
end $$;

-- 4.5 List pinned messages for chat -----------------------------------
create or replace function public.list_pinned_messages(
  p_conversation_id uuid
) returns setof public.dm_messages language sql stable as $$
  select * from public.dm_messages
   where conversation_id = p_conversation_id
     and pinned_in_chat = true
     and deleted_at is null
   order by pinned_at desc nulls last;
$$;

-- 4.6 Search messages in a chat ---------------------------------------
create or replace function public.search_dm_messages(
  p_conversation_id uuid,
  p_query text,
  p_limit integer default 40
) returns setof public.dm_messages language sql stable as $$
  select * from public.dm_messages
   where conversation_id = p_conversation_id
     and deleted_at is null
     and (body ilike '%' || p_query || '%')
   order by created_at desc
   limit greatest(1, least(p_limit, 200));
$$;

-- 4.7 Schedule a DM ---------------------------------------------------
create or replace function public.schedule_dm(
  p_conversation_id uuid,
  p_body text,
  p_send_at timestamptz,
  p_ticker text default null,
  p_image_url text default null
) returns uuid language plpgsql security definer as $$
declare new_id uuid := gen_random_uuid();
begin
  if not exists (select 1 from public.dm_participants
                  where conversation_id = p_conversation_id and user_id = auth.uid()) then
    raise exception 'not a participant';
  end if;
  insert into public.dm_messages(
    id, conversation_id, sender_id, body, ticker, image_url,
    message_type, scheduled_for, created_at
  ) values (
    new_id, p_conversation_id, auth.uid(), p_body, p_ticker, p_image_url,
    case when p_image_url is not null then 'image'
         when p_ticker is not null then 'ticker'
         else 'text' end,
    p_send_at, p_send_at
  );
  return new_id;
end $$;

-- 4.8 Get or create the user's self-chat (Notes-to-self) --------------
create or replace function public.get_self_chat() returns uuid
language plpgsql security definer as $$
declare conv_id uuid;
begin
  select c.id into conv_id
    from public.dm_conversations c
   where c.is_self_chat = true
     and exists (select 1 from public.dm_participants p
                  where p.conversation_id = c.id and p.user_id = auth.uid())
   limit 1;
  if conv_id is not null then return conv_id; end if;
  insert into public.dm_conversations(is_self_chat) values (true) returning id into conv_id;
  insert into public.dm_participants(conversation_id, user_id, role)
    values (conv_id, auth.uid(), 'owner');
  return conv_id;
end $$;

-- 4.9 Report a screenshot --------------------------------------------
create or replace function public.report_screenshot(
  p_conversation_id uuid,
  p_message_id uuid default null
) returns void language plpgsql security definer as $$
begin
  insert into public.dm_screenshot_events(conversation_id, actor_id, message_id)
    values (p_conversation_id, auth.uid(), p_message_id);
end $$;

-- 4.10 RSVP to event ------------------------------------------------
create or replace function public.rsvp_event(
  p_event_id uuid,
  p_status text default 'going',
  p_remind_me boolean default true
) returns void language plpgsql security definer as $$
begin
  insert into public.event_rsvps(event_id, user_id, status, remind_me)
    values (p_event_id, auth.uid(), p_status, p_remind_me)
    on conflict (event_id, user_id)
    do update set status = excluded.status,
                  remind_me = excluded.remind_me;
  update public.events
     set rsvp_count = (select count(*) from public.event_rsvps
                        where event_id = p_event_id and status = 'going')
   where id = p_event_id;
end $$;

-- 4.11 Vote in poll -------------------------------------------------
create or replace function public.cast_poll_vote(
  p_poll_id uuid,
  p_option_id uuid
) returns void language plpgsql security definer as $$
begin
  insert into public.poll_votes(poll_id, option_id, voter_id)
    values (p_poll_id, p_option_id, auth.uid());
  update public.poll_options
     set vote_count = (select count(*) from public.poll_votes where option_id = p_option_id)
   where id = p_option_id;
end $$;

-- 4.12 View story (ticks counter) -----------------------------------
create or replace function public.view_story(p_story_id uuid) returns void
language plpgsql security definer as $$
begin
  insert into public.story_views(story_id, viewer_id)
    values (p_story_id, auth.uid())
    on conflict do nothing;
  update public.stories
     set view_count = (select count(*) from public.story_views where story_id = p_story_id)
   where id = p_story_id;
end $$;

-- 4.13 Global search RPC ------------------------------------------
create or replace function public.global_search(
  p_query text,
  p_limit integer default 8
) returns table (
  entity_type text, entity_id uuid, title text, body text, rank numeric
) language sql stable as $$
  select entity_type, entity_id, title, body,
         (similarity(coalesce(title,''), p_query) * 2 +
          similarity(coalesce(body,''),  p_query) + rank * 0.1)::numeric as score
    from public.search_index
   where title ilike '%' || p_query || '%'
      or body  ilike '%' || p_query || '%'
   order by score desc
   limit greatest(1, least(p_limit, 50));
$$;

-- 4.14 Bookmark add/remove ---------------------------------------
create or replace function public.toggle_bookmark(
  p_item_type text,
  p_item_id uuid,
  p_collection_id uuid default null
) returns boolean language plpgsql security definer as $$
declare existed boolean;
begin
  delete from public.bookmarks
   where user_id = auth.uid()
     and item_type = p_item_type
     and item_id = p_item_id
  returning true into existed;
  if existed then return false; end if;
  insert into public.bookmarks(user_id, collection_id, item_type, item_id)
    values (auth.uid(), p_collection_id, p_item_type, p_item_id);
  return true;
end $$;

-- =========================================================================
-- 5.  ROW-LEVEL SECURITY (defaults; tighten as needed)
-- =========================================================================

alter table public.dm_conversation_settings enable row level security;
alter table public.dm_message_reactions     enable row level security;
alter table public.dm_screenshot_events     enable row level security;
alter table public.dm_smart_reply_cache     enable row level security;
alter table public.stories                  enable row level security;
alter table public.story_views              enable row level security;
alter table public.story_replies            enable row level security;
alter table public.audio_rooms              enable row level security;
alter table public.audio_room_participants  enable row level security;
alter table public.reels                    enable row level security;
alter table public.reel_likes               enable row level security;
alter table public.reel_views               enable row level security;
alter table public.polls                    enable row level security;
alter table public.poll_options             enable row level security;
alter table public.poll_votes               enable row level security;
alter table public.events                   enable row level security;
alter table public.event_rsvps              enable row level security;
alter table public.bookmark_collections     enable row level security;
alter table public.bookmarks                enable row level security;
alter table public.handles                  enable row level security;
alter table public.handle_listings          enable row level security;
alter table public.handle_transfers         enable row level security;
alter table public.ai_feed_summaries        enable row level security;
alter table public.search_index             enable row level security;
alter table public.link_unfurls             enable row level security;
alter table public.post_drafts              enable row level security;
alter table public.read_later               enable row level security;
alter table public.feed_position            enable row level security;
alter table public.user_streaks             enable row level security;
alter table public.streak_rewards_claimed   enable row level security;
alter table public.user_interests           enable row level security;
alter table public.suggested_follows        enable row level security;
alter table public.invite_codes             enable row level security;
alter table public.referrals                enable row level security;
alter table public.notification_digest      enable row level security;
alter table public.feed_signals             enable row level security;
alter table public.fyp_cache                enable row level security;
alter table public.weekly_recaps            enable row level security;
alter table public.user_achievements        enable row level security;
alter table public.hashtags                 enable row level security;
alter table public.post_hashtags            enable row level security;
alter table public.reactivation_campaigns   enable row level security;
alter table public.live_presence            enable row level security;

-- Helper: only owner can read/write their per-user rows. ---------------
do $$
declare t text;
begin
  foreach t in array array[
    'bookmark_collections','bookmarks','post_drafts','read_later',
    'feed_position','user_streaks','streak_rewards_claimed','user_interests',
    'notification_digest','feed_signals','fyp_cache','weekly_recaps',
    'user_achievements','reactivation_campaigns','ai_feed_summaries'
  ] loop
    execute format($f$
      drop policy if exists %1$s_owner_all on public.%1$s;
      create policy %1$s_owner_all on public.%1$s
        using  (user_id = auth.uid())
        with check (user_id = auth.uid());
    $f$, t);
  end loop;
end $$;

-- Public readable, owner writable ------------------------------------
drop policy if exists stories_read on public.stories;
create policy stories_read on public.stories for select using (true);
drop policy if exists stories_write on public.stories;
create policy stories_write on public.stories for all
  using (author_id = auth.uid()) with check (author_id = auth.uid());

drop policy if exists reels_read on public.reels;
create policy reels_read on public.reels for select using (true);
drop policy if exists reels_write on public.reels;
create policy reels_write on public.reels for all
  using (author_id = auth.uid()) with check (author_id = auth.uid());

drop policy if exists events_read on public.events;
create policy events_read on public.events for select using (true);
drop policy if exists events_write on public.events;
create policy events_write on public.events for all
  using (host_id = auth.uid()) with check (host_id = auth.uid());

drop policy if exists rooms_read on public.audio_rooms;
create policy rooms_read on public.audio_rooms for select using (true);
drop policy if exists rooms_write on public.audio_rooms;
create policy rooms_write on public.audio_rooms for all
  using (host_id = auth.uid()) with check (host_id = auth.uid());

drop policy if exists polls_read on public.polls;
create policy polls_read on public.polls for select using (true);
drop policy if exists polls_write on public.polls;
create policy polls_write on public.polls for all
  using (author_id = auth.uid()) with check (author_id = auth.uid());

drop policy if exists poll_options_read on public.poll_options;
create policy poll_options_read on public.poll_options for select using (true);
drop policy if exists poll_votes_rw on public.poll_votes;
create policy poll_votes_rw on public.poll_votes for all
  using (voter_id = auth.uid()) with check (voter_id = auth.uid());

drop policy if exists hashtags_read on public.hashtags;
create policy hashtags_read on public.hashtags for select using (true);
drop policy if exists post_hashtags_read on public.post_hashtags;
create policy post_hashtags_read on public.post_hashtags for select using (true);
drop policy if exists handles_read on public.handles;
create policy handles_read on public.handles for select using (true);
drop policy if exists search_read on public.search_index;
create policy search_read on public.search_index for select using (true);
drop policy if exists unfurls_read on public.link_unfurls;
create policy unfurls_read on public.link_unfurls for select using (true);
drop policy if exists presence_read on public.live_presence;
create policy presence_read on public.live_presence for select using (true);
drop policy if exists presence_write on public.live_presence;
create policy presence_write on public.live_presence for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- =========================================================================
-- 6.  REALTIME PUBLICATIONS
-- =========================================================================
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    perform 1;
    begin alter publication supabase_realtime add table public.stories;            exception when others then null; end;
    begin alter publication supabase_realtime add table public.reels;              exception when others then null; end;
    begin alter publication supabase_realtime add table public.audio_rooms;        exception when others then null; end;
    begin alter publication supabase_realtime add table public.audio_room_participants; exception when others then null; end;
    begin alter publication supabase_realtime add table public.poll_votes;         exception when others then null; end;
    begin alter publication supabase_realtime add table public.event_rsvps;        exception when others then null; end;
    begin alter publication supabase_realtime add table public.live_presence;      exception when others then null; end;
    begin alter publication supabase_realtime add table public.dm_message_reactions; exception when others then null; end;
    begin alter publication supabase_realtime add table public.dm_screenshot_events; exception when others then null; end;
  end if;
end $$;

-- =========================================================================
-- DONE
-- =========================================================================
