-- Clear out test reels and related interaction data.
-- Safe to run repeatedly; cascades handle child rows but we're explicit anyway.

delete from public.reel_comments;
delete from public.reel_likes;
delete from public.reel_shares;
delete from public.reels;
