-- 023_default_feed_community.sql
-- Superseded: public posts no longer use or create the visible SolTools Feed community.
-- Run sql/024_delete_soltools_feed.sql to remove the existing database row.

alter table if exists public.community_posts
alter column community_id drop not null;

drop trigger if exists community_posts_default_community on public.community_posts;
drop function if exists public.set_default_post_community();
drop function if exists public.default_feed_community_id();
