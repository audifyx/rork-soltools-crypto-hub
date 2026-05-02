# Claude Handoff — Rork Solana Social Trading App

**Date:** 2026-05-02
**Status:** Frontend complete, ready for full Supabase wiring.

This document is the single source of truth for Claude to finish hooking the
React Native app to Supabase. Everything you need is here.

---

## 1. Quick Start (do these in order)

1. **Run the SQL.** Open Supabase → SQL Editor → New Query, paste the entire
   contents of [`sql/SUPABASE_COMPLETE_SETUP.sql`](./sql/SUPABASE_COMPLETE_SETUP.sql)
   and run. It is idempotent and safe to re-run.
2. **Create storage buckets** (Dashboard → Storage). All public:
   - `profile-media` (10 MB) — primary avatar + banner bucket the app uses
   - `avatars` (5 MB), `banners` (10 MB) — alt buckets
   - `community-images` (10 MB), `token-images` (10 MB), `wallpapers` (10 MB)
   - `posts` (10 MB) — community / social post images
   - `stories` (25 MB) — story media (image / short video)
3. **Set environment variables** (already wired into the app via
   `EXPO_PUBLIC_*`, see section 5). Confirm `EXPO_PUBLIC_SUPABASE_URL` and
   `EXPO_PUBLIC_SUPABASE_ANON_KEY` are set in Rork project envs.
4. **Bootstrap owner.** The migration auto-promotes `audifyx@gmail.com` to
   admin once the user signs up. No manual action needed.
5. **Wire missing UI calls** (see section 4 — "What still needs wiring").

---

## 2. What's already built (frontend)

### Screens (`expo/app`)
- **Tabs:** `home`, `discover`, `launches`, `streams`, `tools`, `users`,
  `profile`
- **Stack:** `auth`, `admin`, `compose`, `notifications`, `messages`,
  `communities`, `community/[id]`, `lobbies`, `lobby/[id]`, `spaces`,
  `space/[id]`, `dm/[id]`, `posts`, `story/[id]`, `launch/[id]`,
  `list-token`, `tool/[id]`, `u/[handle]`

### Providers (`expo/providers`) — all use `@nkzw/create-context-hook`
- `auth-provider` — Supabase auth (signin/up/out, password reset)
- `app-provider` — global app state, alerts, tracked tokens/wallets,
  community posts, profile upserts
- `profile-provider` — profile CRUD, follow/unfollow, presence (heartbeat),
  search, users list, users overview
- `social-provider` — feed, post likes, comments, social algorithm
- `stories-provider` — create/list/delete stories, story viewers, 36h expiry
- `launchpad-provider` — pump.fun v5 submissions, tracking
- `lobbies-provider` — trading lobbies + LiveKit voice
- `messages-provider` — DMs / chat
- `admin-provider` — admin dashboard

### Lib (`expo/lib`)
- `supabase.ts` — client with AsyncStorage persistence
- `feed-algo.ts` — custom social feed ranking algorithm (recency × engagement
  × following weight)
- `safety.ts` — rug filter (excludes <10k mc, honeypots, devs with prior
  rugs, never-migrated tokens, suspicious `-71%` patterns)
- `upload.ts` — image upload to `profile-media`, `posts`, `stories` buckets
- `user-cache.ts` — local profile cache
- `api/` — `birdeye`, `dexscreener`, `jupiter`, `livekit`, `market`,
  `pairs`, `wallet` (all proxied through edge functions where needed)

---

## 3. SQL — what gets created

`sql/SUPABASE_COMPLETE_SETUP.sql` is the consolidated migration bundle. It
includes 12 ordered sections:

| # | Migration | Purpose |
|---|-----------|---------|
| 1 | `20260501000000_full_schema` | 35+ core tables, enums, RLS |
| 2 | `20260501010000_admin_dashboard` | admin audit, settings |
| 3 | `20260501020000_profiles_social` | followers, profile fields |
| 4 | `20260501030000_feed_likes_whales` | likes, whale events, following feed RPC |
| 5 | `20260501040000_audifyx_owner` | owner bootstrap + signup trigger |
| 6 | `20260501050000_audifyx_owner_assets` | owner badge assets |
| 7 | `20260501060000_users_presence` | presence/heartbeat |
| 8 | `20260501070000_admin_rpcs_and_settings` | full admin RPC surface |
| 9 | `20260501080000_communities_voice_extras` | voice rooms |
| 10 | `20260501090000_full_sync` | sync + maintenance jobs |
| 11 | `20260501100000_users_tab` | users-tab listing + search |
| 12 | `20260501110000_stories` | stories (36h expiry, viewers, delete) |
| + | `sql/002_storage_and_buckets.sql` | bucket bootstrap |
| + | `sql/003_community_create.sql` | community create RPC |

### Tables (35+)
profiles, admin_roles, admin_audit_log, platform_settings, user_settings,
user_credits, user_sessions, user_activity, user_webhooks,
trade_history, tracked_wallets, tracked_tokens, pnl_positions,
portfolio_snapshots, price_alerts, enhanced_price_alerts,
followers, communities, community_members, community_posts,
community_post_likes, community_post_replies, post_likes, post_comments,
live_feed_events, whale_events, support_tickets, support_messages,
notifications, pump_v5_submissions, chat_messages,
trading_lobbies, lobby_members, lobby_messages, lobby_watchlists,
stories, story_views, banner_metadata.

### RPCs the frontend already calls
`toggle_post_like`, `toggle_follow`, `heartbeat`, `set_offline`,
`get_profile_by_handle`, `get_following_feed`, `list_users`,
`users_overview`, `search_profiles`, `list_active_stories`,
`record_story_view`, `delete_my_story`, `list_story_viewers`,
`admin_dashboard_stats`, `admin_top_users`, `admin_recent_activity`,
`admin_search_users`, `admin_list_admins`, `admin_add_by_email`,
`admin_remove`, `admin_add_badge`, `admin_remove_badge`,
`admin_set_user_flags`, `admin_set_listing_flags`, `admin_delete_listing`,
`admin_delete_user`, `admin_announcement_create`,
`admin_announcement_delete`, `admin_setting_set`, `admin_settings_all`,
`admin_update_ticket`.

All are defined in the SQL bundle — nothing extra to write.

---

## 4. What still needs wiring (action items for Claude)

These are the gaps where the UI exists but the Supabase call is either
mocked or missing. Hook them up using the existing `supabase` client from
`expo/lib/supabase.ts`.

1. **Stories upload pipeline** — `stories-provider.tsx` already calls
   `list_active_stories` / `record_story_view`. Confirm `uploadStoryMedia`
   in `expo/lib/upload.ts` posts to the `stories` bucket, then inserts a
   row into `public.stories` with `media_url`, `media_type`,
   `expires_at = now() + interval '36 hours'`.
2. **Compose post** (`expo/app/compose.tsx`) — write to `community_posts`
   with `image_urls` from `uploadPostImage`. Trigger
   `live_feed_events` insert is handled by the DB trigger.
3. **DM provider** — `messages-provider.tsx` should subscribe to
   `chat_messages` realtime channel filtered by `room_id`.
4. **Lobbies realtime** — subscribe to `lobby_messages` and
   `lobby_watchlists` for the active lobby. LiveKit token issuance is
   already proxied via `EXPO_PUBLIC_LIVEKIT_URL`.
5. **Notifications screen** — read from `notifications` table; mark read
   via update where `user_id = auth.uid()`.
6. **Admin screen** — already wired via `admin_*` RPCs. Verify the owner
   account can see the Admin tab (gated on `admin_roles.role = 'owner'`).
7. **Token detail page** — pull live data through Jupiter/Birdeye proxies
   (already configured); store user-specific watchlist state in
   `tracked_tokens`.
8. **Filters & rug protection** — `expo/lib/safety.ts` is the single
   filter. Make sure every list (home tabs `For You`, `Trending`,
   `New Pairs`, `Watchlist`) pipes results through `applySafetyFilters()`
   before render.

---

## 5. Environment variables (already set in Rork)

Public (client-safe):

```
EXPO_PUBLIC_SUPABASE_URL
EXPO_PUBLIC_SUPABASE_ANON_KEY
EXPO_PUBLIC_ALCHEMY_SOLANA_RPC
EXPO_PUBLIC_JUPITER_ORDER_FUNCTION
EXPO_PUBLIC_JUPITER_PRICE_FUNCTION
EXPO_PUBLIC_JUPITER_QUOTE_FUNCTION
EXPO_PUBLIC_JUPITER_TOKENS_FUNCTION
EXPO_PUBLIC_RPC_PROXY_FUNCTION
EXPO_PUBLIC_LIVEKIT_URL
EXPO_PUBLIC_RORK_API_BASE_URL
EXPO_PUBLIC_RORK_APP_KEY
EXPO_PUBLIC_RORK_AUTH_URL
EXPO_PUBLIC_RORK_DB_ENDPOINT
EXPO_PUBLIC_RORK_DB_NAMESPACE
EXPO_PUBLIC_RORK_DB_TOKEN
EXPO_PUBLIC_RORK_TOOLKIT_SECRET_KEY
EXPO_PUBLIC_PROJECT_ID
EXPO_PUBLIC_TEAM_ID
EXPO_PUBLIC_TOOLKIT_URL
```

Private secrets (Birdeye, Helius, QuickNode, LiveKit server, etc.) live
in Supabase Vault (`api_secrets` table, see section 7 of full schema)
and are read inside Edge Functions only.

---

## 6. Storage buckets — required setup

| Bucket | Limit | Used by |
|---|---|---|
| `profile-media` | 10 MB | `upload.ts` → avatar + banner |
| `avatars` | 5 MB | alternate avatar bucket |
| `banners` | 10 MB | 4:1 banner crops |
| `community-images` | 10 MB | community post images |
| `token-images` | 10 MB | listed token logos |
| `posts` | 10 MB | feed post images |
| `stories` | 25 MB | story media (36h ttl) |
| `wallpapers` | 10 MB | profile wallpapers |

All buckets must be **public**. RLS: anyone can read; only authenticated
users can write to `{user_id}/...` paths. The SQL bundle creates these
policies in section `002_storage_and_buckets.sql`.

---

## 7. Owner / admin

- Owner email: **audifyx@gmail.com**
- On signup, trigger `handle_new_user()` creates a profile row.
- Trigger `bootstrap_owner_role()` promotes that email to
  `admin_roles.role = 'owner'`.
- Owner badge cannot be removed (`prevent_owner_badge_removal` trigger).

---

## 8. Edge functions (already deployed via Rork)

- `jupiter-quote`, `jupiter-order`, `jupiter-price`, `jupiter-tokens`
- `rpc-proxy` (Alchemy/Helius)
- `livekit-token`
- `birdeye-proxy`
- `dexscreener-proxy`
- `pumpfun-submit`

URLs are in `EXPO_PUBLIC_*_FUNCTION` envs. They forward auth via
`Authorization: Bearer <supabase access token>`.

---

## 9. Validation checklist for Claude

After wiring, verify:

- [ ] `audifyx@gmail.com` signup → admin tab visible
- [ ] Create story → appears in story tray for 36h, deletable
- [ ] Like a post → count increments via `toggle_post_like`
- [ ] Follow user → `get_following_feed` returns their posts
- [ ] Home tabs (`For You`, `Trending`, `New Pairs`, `Watchlist`) all show
      different filtered sets, no rugs, no <10k mc tokens
- [ ] Token detail page loads price + holders + chart
- [ ] DM realtime works between two test accounts
- [ ] Lobby voice works (LiveKit token returned)
- [ ] Notifications populated on follow / like / reply

---

## 10. File map (cheat sheet)

```
sql/SUPABASE_COMPLETE_SETUP.sql   ← run this first (everything)
supabase/migrations/              ← individual migration history
expo/app/                         ← screens (expo-router)
expo/providers/                   ← context hooks (state)
expo/lib/supabase.ts              ← client
expo/lib/feed-algo.ts             ← ranking
expo/lib/safety.ts                ← rug filter
expo/lib/upload.ts                ← storage upload helpers
expo/lib/api/                     ← market + chain APIs
```

Everything is ready. Run the SQL, confirm buckets exist, then close the
gaps in section 4. Good luck.
