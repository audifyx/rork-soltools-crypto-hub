# SolTools Notifications UI Implementation

## Goal
Build a real notification center and push-ready system using the backend notification engine.

---

## Backend RPCs

Use:

```ts
supabase.rpc('ensure_notification_preferences')
supabase.rpc('register_push_token', { p_token, p_platform, p_device_id })
supabase.rpc('disable_push_token', { p_token })
supabase.rpc('list_notifications_page', { p_before, p_limit, p_unread_only })
supabase.rpc('mark_notification_read', { p_notification_id })
supabase.rpc('get_unread_notification_count')
```

---

## Notification Center Screen

Required features:
- paginated notification list
- unread filter
- mark all read
- swipe to mark read
- notification type icons
- deep links to target screen
- empty state
- skeleton loading

Types to support:
- dm_message
- dm_reaction
- mention
- follow
- launchpad_update
- lobby_invite
- lobby_event
- moderation_update
- announcement
- system

---

## Notification Item UI

Display:
- title
- message
- timestamp
- unread dot
- icon
- actor avatar if actor_id exists
- priority styling

Priority styles:
- urgent: red/glow
- high: gold
- normal: muted
- low: subtle

---

## Badges

Show unread badge on:
- Messages tab
- Notifications button
- Profile/settings area

Use:

```ts
supabase.rpc('get_unread_notification_count')
```

Refresh:
- app foreground
- realtime notification insert
- after mark read

---

## Push Token Registration

On login:
1. Ask permission
2. Get Expo push token
3. Call `register_push_token`

Do not block app if push permission denied.

---

## Preferences UI

Create settings section:
- DM messages
- Reactions
- Mentions
- Follows
- Launchpad updates
- Lobby invites
- Lobby events
- Moderation updates
- Marketing
- Quiet hours

Use table:
`user_notification_preferences`

---

## Realtime

Subscribe to `notifications` inserts for current user.

On insert:
- increment unread badge
- optionally show toast
- add to notification list cache

Do NOT refetch entire list on every notification.

---

## Deep Linking

Map:
- dm_message -> /dm/[id]
- dm_reaction -> /dm/[id]
- lobby_invite -> /space/[id]
- lobby_event -> /space/[id]
- launchpad_update -> /launch/[id]
- moderation_update -> /support or /notifications
- announcement -> /notifications

---

## Performance

Use FlashList:

```tsx
<FlashList estimatedItemSize={84} />
```

Paginate with `p_before` using last row `created_at`.
