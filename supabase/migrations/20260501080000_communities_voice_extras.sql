-- Extend communities + livekit_rooms with the fields the UI needs so
-- everything in the app can be backed by real data (no mock seeds).

alter table public.communities
  add column if not exists category text not null default 'alpha',
  add column if not exists icon_emoji text not null default '✨',
  add column if not exists accent_a text,
  add column if not exists accent_b text,
  add column if not exists verified boolean not null default false,
  add column if not exists trending boolean not null default false,
  add column if not exists pinned_ticker text,
  add column if not exists rules jsonb not null default '[]'::jsonb,
  add column if not exists tags jsonb not null default '[]'::jsonb,
  add column if not exists posts_count integer not null default 0,
  add column if not exists online_count integer not null default 0;

alter table public.livekit_rooms
  add column if not exists topic text not null default 'GENERAL',
  add column if not exists description text not null default '',
  add column if not exists accent_a text,
  add column if not exists accent_b text,
  add column if not exists category text not null default 'alpha',
  add column if not exists recording boolean not null default false,
  add column if not exists scheduled_at timestamptz,
  add column if not exists raised_hands integer not null default 0,
  add column if not exists listeners_count integer not null default 0,
  add column if not exists speakers_count integer not null default 0;

-- Bump posts_count on community_posts insert/delete.
create or replace function public.handle_community_post_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.community_id is not null then
    update public.communities
       set posts_count = posts_count + 1
     where id = new.community_id;
  elsif tg_op = 'DELETE' and old.community_id is not null then
    update public.communities
       set posts_count = greatest(0, posts_count - 1)
     where id = old.community_id;
  end if;
  return null;
end $$;

drop trigger if exists trg_community_posts_count_ins on public.community_posts;
create trigger trg_community_posts_count_ins after insert on public.community_posts
  for each row execute function public.handle_community_post_count();

drop trigger if exists trg_community_posts_count_del on public.community_posts;
create trigger trg_community_posts_count_del after delete on public.community_posts
  for each row execute function public.handle_community_post_count();
