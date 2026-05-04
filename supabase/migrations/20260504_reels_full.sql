-- ============================================================================
-- SolTools — Reels / Shorts: consolidated migration
-- ----------------------------------------------------------------------------
-- Combines:
--   * 20260504_reels_feature.sql      (tables, triggers, RLS, storage bucket)
--   * 20260504_reels_media_type.sql   (image + video support)
--   * 20260504_clear_test_reels.sql   (wipe seed/test data)
--
-- Idempotent: safe to run on a fresh project or on top of existing state.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- Storage bucket: reel-media (public, video + image)
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'reel-media',
  'reel-media',
  true,
  104857600,
  array[
    'video/mp4','video/quicktime','video/webm','video/x-m4v',
    'image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif'
  ]::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ----------------------------------------------------------------------------
-- Tables
-- ----------------------------------------------------------------------------
create table if not exists public.reels (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  video_url text not null,
  thumbnail_url text,
  caption text not null default '',
  ticker text,
  token_address text,
  duration_ms integer,
  media_type text not null default 'video',
  visibility text not null default 'public',
  likes_count integer not null default 0,
  comments_count integer not null default 0,
  shares_count integer not null default 0,
  views_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reels_visibility_check check (visibility in ('public','followers','private')),
  constraint reels_caption_len check (char_length(caption) <= 2200),
  constraint reels_ticker_len check (ticker is null or char_length(ticker) <= 24),
  constraint reels_video_url_nonempty check (char_length(trim(video_url)) > 0)
);

-- Backfill columns for older deployments.
alter table public.reels add column if not exists thumbnail_url text;
alter table public.reels add column if not exists ticker text;
alter table public.reels add column if not exists token_address text;
alter table public.reels add column if not exists duration_ms integer;
alter table public.reels add column if not exists media_type text not null default 'video';
alter table public.reels add column if not exists visibility text not null default 'public';
alter table public.reels add column if not exists likes_count integer not null default 0;
alter table public.reels add column if not exists comments_count integer not null default 0;
alter table public.reels add column if not exists shares_count integer not null default 0;
alter table public.reels add column if not exists views_count integer not null default 0;
alter table public.reels add column if not exists updated_at timestamptz not null default now();

alter table public.reels drop constraint if exists reels_media_type_check;
alter table public.reels
  add constraint reels_media_type_check check (media_type in ('video','image'));

create table if not exists public.reel_likes (
  reel_id uuid not null references public.reels(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (reel_id, user_id)
);

create table if not exists public.reel_comments (
  id uuid primary key default gen_random_uuid(),
  reel_id uuid not null references public.reels(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reel_comments_body_check check (char_length(trim(body)) > 0 and char_length(body) <= 1000)
);

create table if not exists public.reel_shares (
  id uuid primary key default gen_random_uuid(),
  reel_id uuid not null references public.reels(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  channel text not null default 'native',
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Indexes
-- ----------------------------------------------------------------------------
create index if not exists reels_public_created_idx on public.reels(visibility, created_at desc);
create index if not exists reels_user_created_idx   on public.reels(user_id, created_at desc);
create index if not exists reels_media_type_idx     on public.reels(media_type, created_at desc);
create index if not exists reel_comments_reel_created_idx on public.reel_comments(reel_id, created_at asc);
create index if not exists reel_shares_reel_idx     on public.reel_shares(reel_id);

-- ----------------------------------------------------------------------------
-- Triggers / functions
-- ----------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists reels_touch_updated_at on public.reels;
create trigger reels_touch_updated_at
before update on public.reels
for each row execute function public.touch_updated_at();

drop trigger if exists reel_comments_touch_updated_at on public.reel_comments;
create trigger reel_comments_touch_updated_at
before update on public.reel_comments
for each row execute function public.touch_updated_at();

create or replace function public.refresh_reel_counts(target_reel_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.reels r
  set likes_count    = (select count(*)::integer from public.reel_likes    l where l.reel_id = target_reel_id),
      comments_count = (select count(*)::integer from public.reel_comments c where c.reel_id = target_reel_id),
      shares_count   = (select count(*)::integer from public.reel_shares   s where s.reel_id = target_reel_id),
      updated_at     = now()
  where r.id = target_reel_id;
$$;

create or replace function public.refresh_reel_counts_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_id uuid;
begin
  target_id := coalesce(new.reel_id, old.reel_id);
  if target_id is not null then
    perform public.refresh_reel_counts(target_id);
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists reel_likes_refresh_counts on public.reel_likes;
create trigger reel_likes_refresh_counts
after insert or delete on public.reel_likes
for each row execute function public.refresh_reel_counts_trigger();

drop trigger if exists reel_comments_refresh_counts on public.reel_comments;
create trigger reel_comments_refresh_counts
after insert or delete on public.reel_comments
for each row execute function public.refresh_reel_counts_trigger();

drop trigger if exists reel_shares_refresh_counts on public.reel_shares;
create trigger reel_shares_refresh_counts
after insert or delete on public.reel_shares
for each row execute function public.refresh_reel_counts_trigger();

create or replace function public.increment_reel_view(target_reel_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  next_count integer;
begin
  update public.reels
  set views_count = views_count + 1,
      updated_at = now()
  where id = target_reel_id and visibility = 'public'
  returning views_count into next_count;
  return coalesce(next_count, 0);
end;
$$;

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------
alter table public.reels         enable row level security;
alter table public.reel_likes    enable row level security;
alter table public.reel_comments enable row level security;
alter table public.reel_shares   enable row level security;

drop policy if exists "Public can read public reels" on public.reels;
drop policy if exists "Users can create own reels"   on public.reels;
drop policy if exists "Users can update own reels"   on public.reels;
drop policy if exists "Users can delete own reels"   on public.reels;
create policy "Public can read public reels" on public.reels
  for select using (visibility = 'public' or auth.uid() = user_id);
create policy "Users can create own reels" on public.reels
  for insert to authenticated with check (auth.uid() = user_id);
create policy "Users can update own reels" on public.reels
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete own reels" on public.reels
  for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "Public can read reel likes"     on public.reel_likes;
drop policy if exists "Users can like reels"           on public.reel_likes;
drop policy if exists "Users can unlike own reel likes" on public.reel_likes;
create policy "Public can read reel likes" on public.reel_likes
  for select using (true);
create policy "Users can like reels" on public.reel_likes
  for insert to authenticated with check (auth.uid() = user_id);
create policy "Users can unlike own reel likes" on public.reel_likes
  for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "Public can read reel comments"     on public.reel_comments;
drop policy if exists "Users can comment on reels"        on public.reel_comments;
drop policy if exists "Users can update own reel comments" on public.reel_comments;
drop policy if exists "Users can delete own reel comments" on public.reel_comments;
create policy "Public can read reel comments" on public.reel_comments
  for select using (true);
create policy "Users can comment on reels" on public.reel_comments
  for insert to authenticated with check (auth.uid() = user_id);
create policy "Users can update own reel comments" on public.reel_comments
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users can delete own reel comments" on public.reel_comments
  for delete to authenticated using (auth.uid() = user_id);

drop policy if exists "Public can read reel shares"   on public.reel_shares;
drop policy if exists "Anyone can track reel shares"  on public.reel_shares;
create policy "Public can read reel shares" on public.reel_shares
  for select using (true);
create policy "Anyone can track reel shares" on public.reel_shares
  for insert with check (user_id is null or auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- Storage policies
-- ----------------------------------------------------------------------------
drop policy if exists "Authenticated can upload reel media" on storage.objects;
drop policy if exists "Public can read reel media"          on storage.objects;
drop policy if exists "Users can update own reel media"     on storage.objects;
drop policy if exists "Users can delete own reel media"     on storage.objects;
create policy "Authenticated can upload reel media" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'reel-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Public can read reel media" on storage.objects
  for select using (bucket_id = 'reel-media');
create policy "Users can update own reel media" on storage.objects
  for update to authenticated
  using      (bucket_id = 'reel-media' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'reel-media' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "Users can delete own reel media" on storage.objects
  for delete to authenticated
  using (bucket_id = 'reel-media' and (storage.foldername(name))[1] = auth.uid()::text);

-- ----------------------------------------------------------------------------
-- Grants
-- ----------------------------------------------------------------------------
grant execute on function public.increment_reel_view(uuid) to anon, authenticated;
grant execute on function public.refresh_reel_counts(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- Wipe any leftover test/seed reels (safe to re-run).
-- ----------------------------------------------------------------------------
delete from public.reel_comments;
delete from public.reel_likes;
delete from public.reel_shares;
delete from public.reels;
