-- COPY_PASTE_DATABASE_FIXES.sql
-- Paste this whole file into Supabase SQL Editor.
-- Includes: profile/community image + banner storage, admin badge/audit fixes,
-- and the default feed community_id safety net.

-- =========================================================
-- 1) PROFILE + COMMUNITY IMAGE/BANNER COLUMNS AND STORAGE
-- =========================================================

alter table public.profiles
add column if not exists avatar_url text,
add column if not exists banner_url text,
add column if not exists avatar_color text,
add column if not exists banner_from text,
add column if not exists banner_to text;

alter table public.communities
add column if not exists avatar_url text,
add column if not exists banner_url text;

insert into storage.buckets (id, name, public)
values
  ('profile-media', 'profile-media', true),
  ('community-images', 'community-images', true),
  ('post-images', 'post-images', true)
on conflict (id) do update set public = true;

drop policy if exists "public read profile media" on storage.objects;
drop policy if exists "auth upload profile media" on storage.objects;
drop policy if exists "auth update profile media" on storage.objects;
drop policy if exists "public read community images" on storage.objects;
drop policy if exists "auth upload community images" on storage.objects;
drop policy if exists "auth update community images" on storage.objects;
drop policy if exists "public read post images" on storage.objects;
drop policy if exists "auth upload post images" on storage.objects;
drop policy if exists "auth update post images" on storage.objects;

create policy "public read profile media"
on storage.objects for select
using (bucket_id = 'profile-media');

create policy "auth upload profile media"
on storage.objects for insert
to authenticated
with check (bucket_id = 'profile-media');

create policy "auth update profile media"
on storage.objects for update
to authenticated
using (bucket_id = 'profile-media')
with check (bucket_id = 'profile-media');

create policy "public read community images"
on storage.objects for select
using (bucket_id = 'community-images');

create policy "auth upload community images"
on storage.objects for insert
to authenticated
with check (bucket_id = 'community-images');

create policy "auth update community images"
on storage.objects for update
to authenticated
using (bucket_id = 'community-images')
with check (bucket_id = 'community-images');

create policy "public read post images"
on storage.objects for select
using (bucket_id = 'post-images');

create policy "auth upload post images"
on storage.objects for insert
to authenticated
with check (bucket_id = 'post-images');

create policy "auth update post images"
on storage.objects for update
to authenticated
using (bucket_id = 'post-images')
with check (bucket_id = 'post-images');

-- =========================================================
-- 2) ADMIN BADGES + ADMIN AUDIT LOG FIXES
-- =========================================================

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text,
  target_id text,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.admin_audit_log
add column if not exists admin_id uuid references auth.users(id) on delete set null,
add column if not exists action text,
add column if not exists target_type text,
add column if not exists target_id text,
add column if not exists meta jsonb default '{}'::jsonb,
add column if not exists created_at timestamptz default now();

alter table public.profiles
add column if not exists verified boolean default false,
add column if not exists badge text,
add column if not exists is_banned boolean default false,
add column if not exists custom_badges jsonb default '[]'::jsonb;

create or replace function public.admin_set_user_flags(
  target_user_id uuid,
  set_verified boolean default null,
  set_badge text default null,
  set_banned boolean default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'admin only';
  end if;

  update public.profiles p
     set verified = coalesce(set_verified, p.verified),
         badge = coalesce(set_badge, p.badge),
         is_banned = coalesce(set_banned, p.is_banned)
   where p.user_id = target_user_id;

  insert into public.admin_audit_log (admin_id, action, target_type, target_id, meta)
  values (
    auth.uid(),
    'user_flags_update',
    'profile',
    target_user_id::text,
    jsonb_build_object('verified', set_verified, 'badge', set_badge, 'banned', set_banned)
  );
end;
$$;

create or replace function public.admin_add_badge(
  target_user_id uuid,
  badge_id text,
  badge_label text,
  badge_color text default '#FFD56B',
  badge_icon text default 'sparkles'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  new_badge jsonb;
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'admin only';
  end if;

  new_badge := jsonb_build_object(
    'id', badge_id,
    'label', badge_label,
    'color', badge_color,
    'icon', badge_icon
  );

  update public.profiles p
     set custom_badges = (
       select coalesce(jsonb_agg(badge_item), '[]'::jsonb)
       from (
         select e.badge_item
         from jsonb_array_elements(coalesce(p.custom_badges, '[]'::jsonb)) as e(badge_item)
         where e.badge_item->>'id' <> badge_id
         union all
         select new_badge
       ) x
     )
   where p.user_id = target_user_id;

  insert into public.admin_audit_log (admin_id, action, target_type, target_id, meta)
  values (auth.uid(), 'badge_grant', 'profile', target_user_id::text, new_badge);
end;
$$;

create or replace function public.admin_remove_badge(
  target_user_id uuid,
  badge_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin(auth.uid()) then
    raise exception 'admin only';
  end if;

  update public.profiles p
     set custom_badges = (
       select coalesce(jsonb_agg(e.badge_item), '[]'::jsonb)
       from jsonb_array_elements(coalesce(p.custom_badges, '[]'::jsonb)) as e(badge_item)
       where e.badge_item->>'id' <> badge_id
     )
   where p.user_id = target_user_id;

  insert into public.admin_audit_log (admin_id, action, target_type, target_id, meta)
  values (auth.uid(), 'badge_remove', 'profile', target_user_id::text, jsonb_build_object('badge_id', badge_id));
end;
$$;

grant execute on function public.admin_set_user_flags(uuid, boolean, text, boolean) to authenticated;
grant execute on function public.admin_add_badge(uuid, text, text, text, text) to authenticated;
grant execute on function public.admin_remove_badge(uuid, text) to authenticated;

-- =========================================================
-- 3) DEFAULT FEED COMMUNITY_ID SAFETY NET FOR POSTS
-- =========================================================

insert into public.communities (
  name,
  slug,
  description,
  category,
  icon_emoji,
  accent_a,
  accent_b,
  verified,
  trending,
  is_private,
  rules,
  tags
)
select
  'SolTools Feed',
  'soltools-feed',
  'The public SolTools timeline for alpha, charts, calls, and market takes.',
  'alpha',
  '⚡',
  '#55F5B2',
  '#38D7FF',
  true,
  true,
  false,
  '["No scams or impersonation.","Share sources for token calls.","Keep it actionable."]'::jsonb,
  '["feed","alpha","solana"]'::jsonb
where not exists (
  select 1
  from public.communities
  where slug::text in ('soltools-feed', 'general', 'soltools', 'feed')
);

create or replace function public.default_feed_community_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id
  from public.communities
  where slug::text in ('soltools-feed', 'general', 'soltools', 'feed')
  order by case slug::text when 'soltools-feed' then 0 else 1 end, created_at asc
  limit 1
$$;

create or replace function public.set_default_post_community()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  feed_id uuid;
begin
  if new.community_id is null then
    feed_id := public.default_feed_community_id();

    if feed_id is null then
      insert into public.communities (
        name,
        slug,
        description,
        category,
        icon_emoji,
        accent_a,
        accent_b,
        verified,
        trending,
        is_private
      ) values (
        'SolTools Feed',
        'soltools-feed',
        'The public SolTools timeline for alpha, charts, calls, and market takes.',
        'alpha',
        '⚡',
        '#55F5B2',
        '#38D7FF',
        true,
        true,
        false
      )
      returning id into feed_id;
    end if;

    new.community_id := feed_id;
  end if;

  return new;
end;
$$;

drop trigger if exists community_posts_default_community on public.community_posts;
create trigger community_posts_default_community
before insert on public.community_posts
for each row execute function public.set_default_post_community();
