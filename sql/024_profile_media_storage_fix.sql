-- 024_profile_media_storage_fix.sql
-- Keeps profile avatar/banner uploads working across fresh and partial installs.

alter table public.profiles
  add column if not exists avatar_url text,
  add column if not exists banner_url text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'profile-media',
  'profile-media',
  true,
  10485760,
  array['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif']
)
on conflict (id) do update set
  public = true,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

do $profile_media_policies$
begin
  drop policy if exists "profile-media_public_read" on storage.objects;
  drop policy if exists "profile-media_owner_insert" on storage.objects;
  drop policy if exists "profile-media_owner_update" on storage.objects;
  drop policy if exists "profile-media_owner_delete" on storage.objects;
  drop policy if exists profile_media_public_read on storage.objects;
  drop policy if exists profile_media_owner_write on storage.objects;
  drop policy if exists profile_media_owner_update on storage.objects;
  drop policy if exists profile_media_owner_delete on storage.objects;

  create policy profile_media_public_read on storage.objects
    for select using (bucket_id = 'profile-media');

  create policy profile_media_owner_write on storage.objects
    for insert to authenticated with check (
      bucket_id = 'profile-media'
      and auth.uid()::text = (storage.foldername(name))[1]
    );

  create policy profile_media_owner_update on storage.objects
    for update to authenticated using (
      bucket_id = 'profile-media'
      and auth.uid()::text = (storage.foldername(name))[1]
    ) with check (
      bucket_id = 'profile-media'
      and auth.uid()::text = (storage.foldername(name))[1]
    );

  create policy profile_media_owner_delete on storage.objects
    for delete to authenticated using (
      bucket_id = 'profile-media'
      and auth.uid()::text = (storage.foldername(name))[1]
    );
end $profile_media_policies$;
