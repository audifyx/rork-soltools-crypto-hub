# SolTools Phase 6 — Native App Feel + Performance Refactor

## Goal
Make SolTools feel like a real native social/trading app instead of webpage-style screen switches.

Current problems:
- tab switches remount screens
- providers rerender entire layouts
- heavy blur tab bar causes frame drops
- full-screen loading flashes
- feed lists not optimized
- no persistent tab state
- delayed route transitions
- stacked-page navigation feel

---

# Critical Navigation Fixes

## File
expo/app/(tabs)/_layout.tsx

## Add to Tabs screenOptions

```tsx
lazy: true,
freezeOnBlur: true,
animation: 'fade',
popToTopOnBlur: false,
sceneStyle: {
  backgroundColor: Colors.ink,
},
```

## Reduce expensive tab bar rendering
Lower blur intensity from 50 -> 20.

Avoid re-rendering LinearGradient every tab switch.
Move tabBarBackground into memoized component.

---

# Root Stack Performance

## File
expo/app/_layout.tsx

## Update Stack screenOptions

```tsx
screenOptions={{
  headerShown: false,
  animation: 'ios_from_right',
  animationDuration: 180,
  gestureEnabled: true,
  fullScreenGestureEnabled: true,
  freezeOnBlur: true,
  contentStyle: styles.stackContent,
}}
```

## Add native screens optimization

Install:

```bash
npx expo install react-native-reanimated
```

At app entry:

```tsx
import { enableFreeze } from 'react-native-screens';

enableFreeze(true);
```

---

# Feed Optimization

Replace ALL FlatList usage with FlashList.

Install:

```bash
npm install @shopify/flash-list
```

Replace:

```tsx
import { FlatList } from 'react-native';
```

With:

```tsx
import { FlashList } from '@shopify/flash-list';
```

Critical props:

```tsx
estimatedItemSize={120}
removeClippedSubviews
showsVerticalScrollIndicator={false}
drawDistance={400}
```

Apply to:
- home feed
- reels
- launches
- communities
- messages
- notifications
- spaces/lobbies
- token feeds

---

# React Query Caching

## File
expo/app/_layout.tsx

Replace:

```tsx
const queryClient = new QueryClient();
```

With:

```tsx
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30,
      gcTime: 1000 * 60 * 10,
      retry: 1,
      refetchOnMount: false,
      refetchOnWindowFocus: false,
      refetchOnReconnect: true,
    },
  },
});
```

---

# Prevent Provider Thrashing

Memoize all provider values.

Files:
- expo/providers/messages-provider.tsx
- expo/providers/social-provider.tsx
- expo/providers/profile-provider.tsx
- expo/providers/lobbies-provider.tsx
- expo/providers/launchpad-provider.tsx

Wrap provider values:

```tsx
const value = useMemo(() => ({ ... }), [deps]);
```

Avoid inline function creation.

---

# Smooth Skeleton Loading

Never show blank pages.

Create:

```tsx
components/ui/skeleton.tsx
```

Use animated shimmer placeholders.

Apply to:
- feeds
- profiles
- DMs
- spaces
- token pages
- comments

---

# DM Improvements

Use optimistic updates.

When sending messages:
- instantly insert locally
- reconcile after Supabase success

Use realtime subscriptions only for:
- newest messages
- reactions
- typing
- read state

Do NOT refetch entire conversations.

---

# Native Animations

Install:

```bash
npx expo install react-native-reanimated
```

Use:
- fade transitions
- spring cards
- shared element profile transitions
- bottom sheet animations
- gesture-driven modals

Avoid:
- full page rerenders
- white flashes
- layout shifts

---

# Reels Performance

Only render:
- current reel
- previous reel
- next reel

Pause all offscreen videos.

Use recycled list rendering.

---

# Spaces/Lobbies

Keep lobby state mounted.

Do NOT reconnect websocket/realtime every screen focus.

Persist:
- speaking state
- mic state
- listeners
- messages
- reactions

---

# Notification Optimization

Paginate notifications.

Use:

```sql
list_notifications_page()
```

Do not fetch all notifications at once.

---

# Search Optimization

Debounce all search.

Use:

```tsx
useDebounce(search, 250)
```

Use backend RPC:

```sql
search_soltools()
```

---

# Home Feed Architecture

Use backend RPC:

```sql
list_home_feed()
```

Infinite scroll only.

Never load full feed into memory.

---

# Native Feel Checklist

Required:
- instant tab switching
- persistent tabs
- no white flashes
- smooth gestures
- cached screens
- optimistic UI
- skeleton loaders
- spring animations
- blurred overlays only when needed
- zero full-screen rerenders

---

# Backend Systems Already Added

Messaging:
- typing indicators
- reactions
- replies
- edit/delete
- read receipts
- blocks
- pagination
- presence

Moderation:
- reports
- moderation actions
- shadow bans
- mutes/timeouts
- takedowns

Notifications:
- push queue
- notification preferences
- unread counters
- paginated feed

Spaces:
- invites
- speaker queue
- clips
- reactions
- scheduled spaces
- token gating

Feed/Scaling:
- hot score
- search RPC
- analytics
- creator metrics
- rate limits
- realtime registry

---

# Priority Order For Builder

1. Navigation smoothness
2. FlashList migration
3. Provider memoization
4. Query caching
5. Skeleton loaders
6. DM optimistic UI
7. Realtime optimization
8. Shared animations
9. Search debounce
10. Spaces persistence
