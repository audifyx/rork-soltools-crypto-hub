# SQL Workflow

This folder holds **temporary** SQL files that need to be applied to the Supabase database manually.

## Flow

1. Agent creates a new SQL file here (e.g. `001_feature_name.sql`).
2. You copy/paste it into the Supabase SQL editor and run it.
3. You confirm back in chat ("done" / "applied").
4. Agent wires up the app code to use the new schema, verifies it works.
5. Agent deletes the SQL file from this folder.

This keeps the folder clean — only pending SQL lives here. Anything applied is gone.

> Long-term schema lives in `supabase/migrations/`. This folder is only the queue.
