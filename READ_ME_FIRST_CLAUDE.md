# Claude — Read This First

If you can't find the SQL, here it is. Exact paths from the repo root:

## The one SQL file to run

```
./database.sql
```

That's the consolidated, idempotent Supabase setup. Same content also lives at:

```
./sql/SUPABASE_COMPLETE_SETUP.sql
```

Copy the entire file → Supabase Dashboard → SQL Editor → New Query → Run.
Safe to re-run.

## Individual migrations (history / reference)

```
./supabase/migrations/20260501000000_full_schema.sql
./supabase/migrations/20260501010000_admin_dashboard.sql
./supabase/migrations/20260501020000_profiles_social.sql
./supabase/migrations/20260501030000_feed_likes_whales.sql
./supabase/migrations/20260501040000_audifyx_owner.sql
./supabase/migrations/20260501050000_audifyx_owner_assets.sql
./supabase/migrations/20260501060000_users_presence.sql
./supabase/migrations/20260501070000_admin_rpcs_and_settings.sql
./supabase/migrations/20260501080000_communities_voice_extras.sql
./supabase/migrations/20260501090000_full_sync.sql
./supabase/migrations/20260501100000_users_tab.sql
./supabase/migrations/20260501110000_stories.sql
./sql/002_storage_and_buckets.sql
./sql/003_community_create.sql
```

## Full handoff doc

```
./CLAUDE_HANDOFF.md
```

That document has: what's built, what tables/RPCs exist, what still needs
wiring, env vars, storage buckets, and a validation checklist.

## Quick listing commands (run these to verify)

```bash
ls -la database.sql
ls -la sql/
ls -la supabase/migrations/
cat CLAUDE_HANDOFF.md
```

If any of these come back empty, you're in the wrong directory. The repo
root contains: `expo/`, `sql/`, `supabase/`, `database.sql`,
`CLAUDE_HANDOFF.md`, `rork.json`.
