# SolTools Feed Search Discovery UI

## Goal
Make discovery fast, smooth, and native.

## Backend RPCs

Use these Supabase RPCs:

- list_home_feed
- search_soltools
- track_platform_event
- check_rate_limit
- get_creator_metrics

## Home Feed

Use list_home_feed with cursor pagination.

Modes:
- hot
- new

Required UI:
- infinite scroll
- pull to refresh
- optimistic counters
- skeleton cards
- cached feed on tab switch
- no full screen reloads

Use FlashList with estimatedItemSize around 180.

## Search

Use search_soltools.

Debounce input by 250ms.

Search result types:
- profile
- token

UI sections:
- Top Profiles
- Tokens
- Recent Searches
- Trending Tokens

## Discovery Screen

Create sections:
- Trending Now
- Hot Launches
- Active Spaces
- Top Creators
- New Communities
- Wallet Activity

Use cached queries with 30 second stale time.

## Analytics Tracking

Call track_platform_event for:
- feed_view
- post_view
- profile_view
- token_view
- search_submit
- space_join
- dm_start
- launchpad_click

Do this without blocking the UI.

## Action Limits

Use check_rate_limit before high frequency actions such as posting, commenting, sending DMs, following, reacting, and reporting.

If the result is false show a small toast: Slow down for a sec.

## Native Feel

Keep feed mounted across tab changes.
Do not reset scroll position when switching tabs.
Use cached data first then refresh in background.
