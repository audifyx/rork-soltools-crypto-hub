-- ============================================================================
-- 006_profile_media_storage_fix.sql
-- Re-applies the storage buckets + RLS policies the app actually uploads to:
--   • profile-media     (avatar / banner)
--   • post-images       (feed posts)
--   • community-images  (community avatar / banner)
--
-- Earlier migrations (stories, full_sync, etc.) churned policy names which
-- can leave the profile-media bucket without a working insert/update policy
-- and break "upload profile picture / banner". This file is fully idempotent
-- and safe to re-run.
-- ============================================================================

-- 1. Make sure each bucket exists and is public --------------------------
insert into storage.buckets (id, name, public) values
  ('profile-media',    'profile-media',    true),
  ('post-images',      'post-images',      true),
  ('community-images', 'community-images', true)
on conflict (id) do update set public = excluded.public;

-- 2. Wipe any older policy variants we have used over time, then create
--    a clean canonical set per bucket. -----------------------------------
do $$
declare
  b text;
  buckets text[] := array['profile-media','post-images','community-images'];
  -- All historical policy name patterns we have used so we can drop them
  -- before recreating fresh ones.
  drop_suffixes text[] := array[
    '_public_read','_owner_write','_owner_update','_owner_delete',
    '_read','_insert','_update','_delete',
    '_owner_insert'
  ];
  s text;
begin
  foreach b in array buckets loop
    foreach s in array drop_suffixes loop
      begin
        execute format('drop policy if exists %I on storage.objects', b || s);
      exception when others then null; end;
    end loop;

    -- Also drop any quoted variants that were created with mixed case names.
    begin execute format('drop policy if exists "%s_public_read"   on storage.objects', b); exception when others then null; end;
    begin execute format('drop policy if exists "%s_owner_write"   on storage.objects', b); exception when others then null; end;
    begin execute format('drop policy if exists "%s_owner_update"  on storage.objects', b); exception when others then null; end;
    begin execute format('drop policy if exists "%s_owner_delete"  on storage.objects', b); exception when others then null; end;

    -- Public read for everyone.
    execute format($p$create policy %I on storage.objects
      for select using (bucket_id = %L)$p$, b || '_public_read', b);

    -- Authenticated users may insert into a folder named after their own uid.
    execute format($p$create policy %I on storage.objects
      for insert to authenticated
      with check (
        bucket_id = %L
        and auth.uid() is not null
        and (storage.foldername(name))[1] = auth.uid()::text
      )$p$, b || '_owner_write', b);

    -- Owners may update / overwrite their own files.
    execute format($p$create policy %I on storage.objects
      for update to authenticated
      using (
        bucket_id = %L
        and auth.uid() is not null
        and (storage.foldername(name))[1] = auth.uid()::text
      )
      with check (
        bucket_id = %L
        and auth.uid() is not null
        and (storage.foldername(name))[1] = auth.uid()::text
      )$p$, b || '_owner_update', b, b);

    -- Owners may delete their own files.
    execute format($p$create policy %I on storage.objects
      for delete to authenticated
      using (
        bucket_id = %L
        and auth.uid() is not null
        and (storage.foldername(name))[1] = auth.uid()::text
      )$p$, b || '_owner_delete', b);
  end loop;
end $$;

-- 3. Make absolutely sure the profiles table has the columns the UI writes
--    (avatar_url / banner_url). ------------------------------------------
alter table public.profiles
  add column if not exists avatar_url text,
  add column if not exists banner_url text;

-- ============================================================================
-- DONE
-- ============================================================================
