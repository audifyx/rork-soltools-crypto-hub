# SolTools DM UI Implementation Handoff

## Goal
Wire the upgraded DM backend into the mobile UI so messaging feels like Telegram/X/Discord instead of a placeholder chat.

---

## Backend RPCs Available

Use these Supabase RPCs:

```ts
supabase.rpc('list_dm_conversations')
supabase.rpc('list_dm_messages_page', { p_conversation_id, p_before, p_limit })
supabase.rpc('list_dm_typing', { p_conversation_id })
supabase.rpc('set_dm_typing', { p_conversation_id, p_typing })
supabase.rpc('send_dm_message', { p_conversation_id, p_body, p_ticker, p_image_url })
supabase.rpc('mark_dm_read', { p_conversation_id })
supabase.rpc('toggle_dm_reaction', { p_message_id, p_emoji })
supabase.rpc('edit_dm_message', { p_message_id, p_body })
supabase.rpc('delete_dm_message', { p_message_id })
supabase.rpc('block_dm_user', { p_blocked_id, p_reason })
supabase.rpc('unblock_dm_user', { p_blocked_id })
```

---

## Required UI Features

### Conversation List
Show:
- avatar
- display name
- username
- online dot
- last seen text
- last message
- unread badge
- pinned state
- muted state
- request state

Use fields from `list_dm_conversations()`:
- `is_online`
- `last_seen_at`
- `last_message`
- `last_at`
- `unread_count`
- `pinned`
- `muted`
- `request`

---

## Thread Screen
Use `list_dm_messages_page()` instead of direct `.from('dm_messages')`.

Support:
- infinite scroll upwards
- optimistic send
- read receipts
- delivered receipts
- edited badge
- deleted placeholder
- reply preview
- reactions
- image attachment display
- ticker message display

Message fields returned:
- `id`
- `conversation_id`
- `sender_id`
- `body`
- `message_type`
- `ticker`
- `image_url`
- `created_at`
- `delivered_at`
- `read_at`
- `edited_at`
- `deleted_at`
- `reply_to_id`
- `reactions`
- `attachments`
- `reply`

---

## Typing Indicators
On text input change:

```ts
supabase.rpc('set_dm_typing', {
  p_conversation_id: conversationId,
  p_typing: true,
});
```

Debounce/stop after 2 seconds idle:

```ts
supabase.rpc('set_dm_typing', {
  p_conversation_id: conversationId,
  p_typing: false,
});
```

Poll or realtime refresh `list_dm_typing()` every 2–4 seconds while thread is focused.

Display:
`@username is typing...`

---

## Reactions
Long press message:
- quick reaction row: 🔥 😂 🚀 👀 ❤️ 💀
- call `toggle_dm_reaction`
- update locally optimistically

---

## Edit/Delete
Only sender can edit/delete their own message.
Admins can delete any message.

Long press menu:
- Reply
- React
- Copy
- Edit
- Delete
- Report

---

## Block User
Conversation header menu:
- Mute
- Block
- Report

Block calls:
```ts
supabase.rpc('block_dm_user', { p_blocked_id: otherUserId, p_reason: 'user_blocked' })
```

---

## Read Receipts
When thread opens and when latest message changes:

```ts
supabase.rpc('mark_dm_read', { p_conversation_id: conversationId })
```

For own last message display:
- `read_at` → Seen
- `delivered_at` → Delivered
- else → Sent

---

## Realtime
Subscribe to:
- `dm_messages`
- `dm_message_reactions`
- `dm_participants`

Do not refetch entire thread on every event.
Patch local cache.

---

## Performance Requirements
Use FlashList for messages:

```tsx
<FlashList
  data={messages}
  estimatedItemSize={72}
  inverted
/>
```

Use optimistic cache updates with TanStack Query.

No blank loaders. Use skeleton bubbles.
