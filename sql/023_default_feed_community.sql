-- 023_default_feed_community.sql
-- Ensures global feed posts always have a community_id.

insert into public.communities (
  name, slug, description, category, icon_emoji,
  accent_a, accent_b, verified, trending, is_private, rules, tags
)
select
  'SolTools Feed', 'soltools-feed',
  'The public SolTools timeline for alpha, charts, calls, and market takes.',
  'alpha', '⚡', '#55F5B2', '#38D7FF', true, true, false,
  '["No scams or impersonation.","Share sources for token calls.","Keep it actionable."]'::jsonb,
  '["feed","alpha","solana"]'::jsonb
where not exists (
  select 1 from public.communities
  where slug::text in ('soltools-feed', 'general', 'soltools', 'feed')
);

create or replace function public.default_feed_community_id()
returns uuid
language sql stable security definer set search_path = public as $$
  select id
  from public.communities
  where slug::text in ('soltools-feed', 'general', 'soltools', 'feed')
  order by case slug::text when 'soltools-feed' then 0 else 1 end, created_at asc
  limit 1
$$;

create or replace function public.set_default_post_community()
returns trigger
language plpgsql security definer set search_path = public as $$
declare
  feed_id uuid;
begin
  if new.community_id is null then
    feed_id := public.default_feed_community_id();

    if feed_id is null then
      insert into public.communities (
        name, slug, description, category, icon_emoji,
        accent_a, accent_b, verified, trending, is_private
      ) values (
        'SolTools Feed', 'soltools-feed',
        'The public SolTools timeline for alpha, charts, calls, and market takes.',
        'alpha', '⚡', '#55F5B2', '#38D7FF', true, true, false
      )
      returning id into feed_id;
    end if;

    new.community_id := feed_id;
  end if;

  return new;
end $$;

drop trigger if exists community_posts_default_community on public.community_posts;
create trigger community_posts_default_community
before insert on public.community_posts
for each row execute function public.set_default_post_community();
