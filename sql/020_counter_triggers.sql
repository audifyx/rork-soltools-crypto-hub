-- 020_counter_triggers.sql
-- Runtime counters for followers, community members, posts, comments, and likes.

create or replace function public.sync_profile_follow_counts()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.profiles p set
    followers_count = (select count(*)::int from public.followers f where f.followee_id = p.id),
    following_count = (select count(*)::int from public.followers f where f.follower_id = p.id)
  where p.id in (
    coalesce(new.follower_id, old.follower_id),
    coalesce(new.followee_id, old.followee_id)
  );
  return coalesce(new, old);
end $$;

drop trigger if exists followers_sync_counts on public.followers;
create trigger followers_sync_counts after insert or delete on public.followers
for each row execute function public.sync_profile_follow_counts();

create or replace function public.sync_community_member_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.communities c
     set member_count = (select count(*)::int from public.community_members m where m.community_id = c.id)
   where c.id = coalesce(new.community_id, old.community_id);
  return coalesce(new, old);
end $$;

drop trigger if exists community_members_sync_count on public.community_members;
create trigger community_members_sync_count after insert or delete on public.community_members
for each row execute function public.sync_community_member_count();

create or replace function public.sync_community_post_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.communities c
     set posts_count = (select count(*)::int from public.community_posts p where p.community_id = c.id)
   where c.id = coalesce(new.community_id, old.community_id);
  return coalesce(new, old);
end $$;

drop trigger if exists community_posts_sync_count on public.community_posts;
create trigger community_posts_sync_count after insert or delete on public.community_posts
for each row execute function public.sync_community_post_count();

create or replace function public.sync_post_like_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.community_posts p
     set likes_count = (select count(*)::int from public.post_likes l where l.post_id = p.id)
   where p.id = coalesce(new.post_id, old.post_id);
  return coalesce(new, old);
end $$;

drop trigger if exists post_likes_sync_count on public.post_likes;
create trigger post_likes_sync_count after insert or delete on public.post_likes
for each row execute function public.sync_post_like_count();

create or replace function public.sync_post_comment_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.community_posts p
     set comments_count = (select count(*)::int from public.community_post_comments c where c.post_id = p.id)
   where p.id = coalesce(new.post_id, old.post_id);
  return coalesce(new, old);
end $$;

drop trigger if exists post_comments_sync_count on public.community_post_comments;
create trigger post_comments_sync_count after insert or delete on public.community_post_comments
for each row execute function public.sync_post_comment_count();

select '020_counter_triggers applied' as status;
