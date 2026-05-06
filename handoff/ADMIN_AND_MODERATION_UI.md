# SolTools Admin + Moderation UI

## Goal
Build a scalable moderation/admin system for SolTools.

---

## Backend Tables

Available:
- moderation_reports
- moderation_actions
- user_moderation_state
- content_takedowns
- admin_roles
- admin_audit_log

---

## Admin Dashboard

Tabs:
- Reports
- Users
- Content
- Spaces
- Launchpad
- Tickets
- Analytics
- Announcements
- Audit Logs

---

## Reports Queue

Required filters:
- Open
- Reviewing
- Resolved
- Dismissed
- Escalated

Priority filters:
- Low
- Normal
- High
- Urgent

Display:
- report reason
- reporter
- target user
- target content
- timestamp
- status
- assigned moderator

---

## Moderation Actions

Actions:
- Warn
- Mute
- Timeout
- Shadow Ban
- Ban
- Delete Content
- Restore Content
- Escalate
- Resolve
- Dismiss

All actions create audit entries.

---

## User Moderation Profile

Show:
- strike count
- moderation history
- active bans
- shadow status
- mute status
- timeout status
- reports received
- recent activity

---

## Shadow Ban Behavior

Shadow banned users:
- can still post
- posts receive hidden visibility
- engagement hidden from public feeds
- no visible error shown to user

---

## Launchpad Moderation

Actions:
- feature token
- remove token
- mark scam/rug
- hide from feed
- verify project

---

## Space Moderation

Actions:
- end space
- kick speaker
- ban listener
- remove cohost
- mute user
- delete messages

---

## Admin Analytics

Charts:
- DAU
- messages/day
- spaces/day
- reports/day
- launchpad volume
- creator growth
- active users

---

## Audit Logs

Display:
- actor
- action
- target
- timestamp
- metadata

Critical for moderation transparency.

---

## Performance

Use server pagination.

Never load full moderation queues.

Use infinite scroll.
