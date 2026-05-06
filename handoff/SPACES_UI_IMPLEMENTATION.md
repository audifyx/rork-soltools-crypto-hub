# SolTools Spaces/Lobbies UI Implementation

## Goal
Transform lobbies into native-feeling crypto Spaces.

---

# Backend Tables Added

Available tables:
- voice_lobbies
- voice_lobby_members
- voice_lobby_invites
- voice_speaker_queue
- voice_lobby_reactions
- voice_lobby_events
- voice_lobby_clips

---

# Lobby Card UI

Show:
- title
- host avatar
- listener count
- speaker count
- live badge
- scheduled badge
- token gated badge
- recording badge
- category/community
- current speakers

---

# Live Lobby Screen

Sections:

## Stage
Large active speaker cards.

Show:
- speaking animation
- mic muted state
- cohost badge
- host badge
- verified badge

---

## Audience Grid
Virtualized grid.

Show:
- listeners
- invite button
- follow button

---

## Bottom Actions
Buttons:
- react
- request speaker
- share
- leave
- invite
- chat

---

# Speaker Queue

Use `voice_speaker_queue`.

Host/cohost panel:
- approve
- reject
- mute
- remove

---

# Emoji Burst Reactions

Realtime floating emoji bursts.

Use:
- 🚀
- 🔥
- 💀
- 👀
- ❤️

Animate with Reanimated.

---

# Invites

Use `voice_lobby_invites`.

Notification modal:
- Accept
- Decline

---

# Token Gated Spaces

If `token_gated = true`
show gate modal.

Support:
- token threshold
- NFT ownership
- premium communities

---

# Realtime

Subscribe:
- voice_lobby_members
- voice_lobby_reactions
- voice_speaker_queue
- voice_lobby_events

Never full-refresh room.
Patch local state.

---

# Performance

Persist lobby state.

Do not disconnect socket/realtime on tab switch.

Keep mounted while minimized.

---

# Miniplayer

Required:
- persistent bottom mini-space player
- current speaker
- leave button
- expand button
- live indicator

Twitter/X Spaces style.

---

# Future LiveKit Integration

Prepare provider structure:

```tsx
<LiveLobbyProvider>
```

Separate:
- audio state
- participant state
- UI state

Avoid rerendering entire room on voice activity.
