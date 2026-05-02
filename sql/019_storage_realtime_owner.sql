-- 019_storage_realtime_owner.sql
-- Storage buckets, realtime publication, counters, and owner bootstrap.

insert into storage.buckets (id, name, public) values
  ('profile-media', 'profile-media', true),
  ('post-images', 'post-images', true),
  ('community-images', 'community-images', true),
  ('avatars', 'avatars', true),
  ('banners', 'banners', true),
  ('launch-logos', 'launch-logos', true),
  ('launch-banners', 'launch-banners', true),
  ('token-images', 'token-images', true)
on conflict (id) do update set public = excluded.public;

do $storage$
declare
  b text;
  buckets text[] := array['profile-media','post-images','community-images','avatars','banners','launch-logos','launch-banners','token-images'];
begin
  foreach b in array buckets loop
    execute format('drop policy if exists %I on storage.objects', b || '_public_read');
    execute format('drop policy if exists %I on storage.objects', b || '_owner_insert');
    execute format('drop policy if exists %I on storage.objects', b || '_owner_update');
    execute format('drop policy if exists %I on storage.objects', b || '_owner_delete');

    execute format('create policy %I on storage.objects for select using (bucket_id = %L)', b || '_public_read', b);
    execute format(
      'create policy %I on storage.objects for insert to authenticated with check (bucket_id = %L and auth.uid()::text = (storage.foldername(name))[1])',
      b || '_owner_insert', b
    );
    execute format(
      'create policy %I on storage.objects for update to authenticated using (bucket_id = %L and auth.uid()::text = (storage.foldername(name))[1]) with check (bucket_id = %L and auth.uid()::text = (storage.foldername(name))[1])',
      b || '_owner_update', b, b
    );
    execute format(
      'create policy %I on storage.objects for delete to authenticated using (bucket_id = %L and (auth.uid()::text = (storage.foldername(name))[1] or public.is_admin(auth.uid())))',
      b || '_owner_delete', b
    );
  end loop;
end $storage$;

update public.profiles p set
  followers_count = coalesce((select count(*)::int from public.followers f where f.followee_id = p.id), 0),
  following_count = coalesce((select count(*)::int from public.followers f where f.follower_id = p.id), 0);

update public.communities c set
  member_count = coalesce((select count(*)::int from public.community_members m where m.community_id = c.id), 0),
  posts_count = coalesce((select count(*)::int from public.community_posts cp where cp.community_id = c.id), 0);

update public.community_posts cp set
  likes_count = coalesce((select count(*)::int from public.post_likes pl where pl.post_id = cp.id), 0),
  comments_count = coalesce((select count(*)::int from public.community_post_comments cc where cc.post_id = cp.id), 0);

do $rt$
declare
  t text;
  tables text[] := array[
    'profiles','followers','user_presence','communities','community_members','community_posts',
    'post_likes','community_post_comments','pump_v5_submissions','launch_upvotes',
    'livekit_rooms','livekit_participants','announcements','whale_events'
  ];
begin
  foreach t in array tables loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null; when undefined_object then null; when others then null;
    end;
  end loop;
end $rt$;

do $owner$
declare
  owner_id uuid;
begin
  select id into owner_id from auth.users where lower(email) = 'audifyx@gmail.com' limit 1;
  if owner_id is null then return; end if;

  insert into public.profiles (id, user_id, username, display_name, verified, badge)
  values (owner_id, owner_id, 'audifyx', 'Audifyx', true, 'owner')
  on conflict (id) do update set
    user_id = coalesce(public.profiles.user_id, excluded.user_id),
    username = coalesce(public.profiles.username, excluded.username),
    display_name = coalesce(nullif(public.profiles.display_name, ''), excluded.display_name),
    verified = true,
    badge = coalesce(public.profiles.badge, 'owner'),
    updated_at = now();

  insert into public.admin_roles (user_id, role, granted_by)
  values (owner_id, 'superadmin', owner_id)
  on conflict (user_id) do update set role = 'superadmin';
end $owner$;

select '019_storage_realtime_owner applied' as status;
