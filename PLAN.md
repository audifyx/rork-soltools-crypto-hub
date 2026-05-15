# 41 platform features — implementation plan

Status legend: `[x]` SQL/data layer done · `[~]` UI in progress · `[ ]` not started.
The SQL foundation for all 41 features lives in
`supabase/migrations/2026_05_12_full_platform_features.sql`.

---

### 💬 Messages tab (1–15)

- [x] 1. Voice notes — `dm_messages.audio_url/duration/waveform` (UI: recorder pending)
- [x] 2. ~~Disappearing messages~~ — removed from UI per user request (SQL retained)
- [x] 3. Message reactions — `dm_message_reactions` (UI already shipped)
- [x] 4. Reply threads — `dm_messages.reply_to` (UI already shipped)
- [x] 5. Read receipts toggle — `dm_participants.read_receipts_enabled` + `set_dm_read_receipts()`
- [x] 6. Typing indicators (already shipped)
- [x] 7. Message search inside a chat — `search_dm_messages()` + trigram index
- [x] 8. Pinned messages inside a chat — `pinned_in_chat` + `toggle_pin_in_chat()` / `list_pinned_messages()`
- [x] 9. Smart replies — `dm_smart_reply_cache` (UI: generate via toolkit)
- [x] 10. Auto-translate — `dm_messages.translated_cache`
- [x] 11. Folders / labels — `dm_participants.folder` + `set_dm_folder()`
- [x] 12. Group DMs — `dm_conversation_settings.is_group/group_name/group_avatar_url` + roles
- [x] 13. Scheduled messages — `schedule_dm()` + `release_scheduled_dms()`
- [x] 14. Notes-to-self — `get_self_chat()` + `dm_conversations.is_self_chat`
- [x] 15. Vanish mode + screenshot alert — `vanish_mode` + `dm_screenshot_events` + `report_screenshot()`

### 🌐 App-wide (16–30)

- [x] 16. Stories — `stories`, `story_views`, `story_replies`, `view_story()`
- [x] 17. Live audio rooms — `audio_rooms`, `audio_room_participants`
- [x] 18. Reels — `reels`, `reel_likes`, `reel_views`
- [x] 19. Polls & quizzes — `polls`, `poll_options`, `poll_votes`, `cast_poll_vote()`
- [x] 20. Communities directory — `communities.category/tags/trending_score` + `community_categories`
- [x] 21. Events — `events`, `event_rsvps`, `rsvp_event()`
- [x] 22. Bookmarks & collections — `bookmarks`, `bookmark_collections`, `toggle_bookmark()`
- [x] 23. Profile themes — `profiles.theme_color/theme_gradient/banner_motion/pinned_badge_id`
- [x] 24. Handle marketplace — `handles`, `handle_listings`, `handle_transfers`
- [x] 25. Anonymous posting — `posts.is_anonymous/anon_alias`
- [x] 26. AI feed summary — `ai_feed_summaries`
- [x] 27. Global search 2.0 — `search_index` + `global_search()`
- [x] 28. Link unfurls — `link_unfurls`
- [x] 29. Cross-poster — `post_drafts`
- [x] 30. Read-later & catch-up — `read_later`, `feed_position`

### 🚀 Growth, engagement & retention (31–41)

- [x] 31. Daily streaks — `user_streaks` + `bump_streak()` + `streak_rewards_claimed`
- [x] 32. Interest quiz — `interest_topics`, `user_interests` (seeded)
- [x] 33. Friend-of-friend suggestions — `suggested_follows`
- [x] 34. Invite system — `invite_codes`, `referrals`, `referral_leaderboard` view
- [x] 35. Push smart digest — `notification_digest` + `profiles.digest_frequency/quiet_hours_*`
- [x] 36. For-you feed — `feed_signals`, `fyp_cache`
- [x] 37. Weekly recap — `weekly_recaps`
- [x] 38. Achievement badges — `achievements` (seeded), `user_achievements`
- [x] 39. Trending hashtags — `hashtags`, `post_hashtags`
- [x] 40. Reactivation campaigns — `reactivation_campaigns`
- [x] 41. Live presence counters — `live_presence` + `touch_presence()` + `count_viewers_now()`

---

## UI passes shipped

1. [x] **Messages UI wiring** — `ChatToolsSheet` (in-chat search, pinned list)
   wired into the DM header. Notes-to-self pin via `get_self_chat()`.
   Disappearing messages removed from UI.
2. [x] **Stories rail** — `components/home/StoriesRail.tsx` on home tab,
   `app/story/[id].tsx` viewer with progress bars + `view_story()` tracking,
   `app/story/create.tsx` for posting.
3. [x] **Reels feed** — already shipped as `(tabs)/reels.tsx`.
4. [x] **Communities directory + Events** — `app/events.tsx` listing with
   filters and RSVP via `rsvp_event()`. Communities directory already wired.
5. [x] **Streaks/achievements/recap** — `StreakCard`, `AchievementsRow`,
   `RecapCard` rendered on the profile tab.
6. [x] **For-you tab** — new `(tabs)/fyp.tsx` reading from `fyp_cache` +
   `app/interest-quiz.tsx` onboarding writing to `user_interests`.
7. [x] **Owner/admin dashboard feature sheets** — every Command Center tile now opens a full control UI with enable/status/rollout/threshold/notes/config, pinned state, data-source wiring, backend run history, and live owner actions.
8. [x] **Owner feature backend** — `owner_feature_states` + `owner_feature_runs` tables and `owner_upsert_feature_state()` / `owner_run_feature_action()` RPCs added to `supabase/admin_dashboard_full.sql` with owner-only RLS and audit logging.
