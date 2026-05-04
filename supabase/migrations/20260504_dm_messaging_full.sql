-- SolTools DM messaging — resilient conversation start, image attachments,
-- realtime, and a public dm-media storage bucket.
--
-- Idempotent: safe to re-run. Builds on 20260503_owner_messages_token_search.sql.

-- ---------------------------------------------------------------------------
-- Relax FKs so DMs work even if a profile.user_id doesn't perfectly match
-- auth.users (e.g. legacy/test profiles). sender_id stays auth.users-bound
-- because the sender is always the current authenticated caller.
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'dm_participants_user_id_fkey'
  ) then
    alter table public.dm_participants drop constraint dm_participants_user_id_fkey;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Resilient conversation creator. Accepts either an auth.users id or a
-- profile id. Resolves to the canonical recipient id used in dm_participants.
-- ---------------------------------------------------------------------------
create or replace function public.get_or_create_dm(other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  me uuid := auth.uid();
  target uuid;
  existing_id uuid;
  new_id uuid;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if other_user_id is null then raise exception 'invalid recipient'; end if;

  -- Resolve to the recipient's canonical id. We try auth.users first, then
  -- profiles (matching either user_id or id), and finally fall back to the
  -- raw input if nothing else matches.
  select u.id into target from auth.users u where u.id = other_user_id limit 1;
  if target is null then
    select coalesce(p.user_id, p.id) into target
    from public.profiles p
    where p.user_id = other_user_id or p.id = other_user_id
    limit 1;
  end if;
  if target is null then target := other_user_id; end if;

  if target = me then raise exception 'cannot message yourself'; end if;

  select p1.conversation_id into existing_id
  from public.dm_participants p1
  join public.dm_participants p2 on p2.conversation_id = p1.conversation_id
  where p1.user_id = me and p2.user_id = target
  limit 1;

  if existing_id is not null then
    update public.dm_participants
      set hidden_at = null
      where conversation_id = existing_id and user_id = me;
    return existing_id;
  end if;

  insert into public.dm_conversations (created_by) values (me) returning id into new_id;
  insert into public.dm_participants (conversation_id, user_id, request, last_read_at)
  values
    (new_id, me, false, now()),
    (new_id, target, true, null);
  return new_id;
end;
$$;

grant execute on function public.get_or_create_dm(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- DM image attachments bucket.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'dm-media',
  'dm-media',
  true,
  20971520,
  array['image/jpeg','image/jpg','image/png','image/webp','image/gif','image/heic','image/heif']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Authenticated can upload dm media" on storage.objects;
drop policy if exists "Public can read dm media" on storage.objects;
drop policy if exists "Users can update own dm media" on storage.objects;
drop policy if exists "Users can delete own dm media" on storage.objects;

create policy "Authenticated can upload dm media" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'dm-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Public can read dm media" on storage.objects
  for select using (bucket_id = 'dm-media');
create policy "Users can update own dm media" on storage.objects
  for update to authenticated
  using (bucket_id = 'dm-media' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'dm-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Users can delete own dm media" on storage.objects
  for delete to authenticated
  using (bucket_id = 'dm-media' and (storage.foldername(name))[1] = auth.uid()::text);

-- ---------------------------------------------------------------------------
-- Make sure realtime is on for DM tables (idempotent).
-- ---------------------------------------------------------------------------
do $$
begin
  begin
    alter publication supabase_realtime add table public.dm_messages;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.dm_participants;
  exception when duplicate_object then null;
  end;
end $$;
