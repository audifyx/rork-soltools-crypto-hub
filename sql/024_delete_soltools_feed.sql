-- 024_delete_soltools_feed.sql
-- Removes the unwanted SolTools Feed community and stops public posts from recreating it.

alter table if exists public.community_posts
alter column community_id drop not null;

drop trigger if exists community_posts_default_community on public.community_posts;
drop function if exists public.set_default_post_community();
drop function if exists public.default_feed_community_id();

do $$
declare
  feed_ids uuid[];
  fk record;
  nullable text;
begin
  select array_agg(id) into feed_ids
  from public.communities
  where slug::text = 'soltools-feed'
     or lower(name) = 'soltools feed'
     or description = 'The public SolTools timeline for alpha, charts, calls, and market takes.';

  if coalesce(array_length(feed_ids, 1), 0) = 0 then
    return;
  end if;

  for fk in
    select
      kcu.table_schema,
      kcu.table_name,
      kcu.column_name
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on tc.constraint_name = kcu.constraint_name
     and tc.table_schema = kcu.table_schema
    join information_schema.constraint_column_usage ccu
      on ccu.constraint_name = tc.constraint_name
     and ccu.constraint_schema = tc.constraint_schema
    where tc.constraint_type = 'FOREIGN KEY'
      and ccu.table_schema = 'public'
      and ccu.table_name = 'communities'
      and ccu.column_name = 'id'
  loop
    select c.is_nullable into nullable
    from information_schema.columns c
    where c.table_schema = fk.table_schema
      and c.table_name = fk.table_name
      and c.column_name = fk.column_name;

    if fk.table_schema = 'public'
       and fk.table_name = 'community_posts'
       and fk.column_name = 'community_id' then
      execute format(
        'update %I.%I set %I = null where %I = any($1)',
        fk.table_schema,
        fk.table_name,
        fk.column_name,
        fk.column_name
      ) using feed_ids;
    elsif nullable = 'YES' then
      execute format(
        'update %I.%I set %I = null where %I = any($1)',
        fk.table_schema,
        fk.table_name,
        fk.column_name,
        fk.column_name
      ) using feed_ids;
    else
      execute format(
        'delete from %I.%I where %I = any($1)',
        fk.table_schema,
        fk.table_name,
        fk.column_name
      ) using feed_ids;
    end if;
  end loop;

  delete from public.communities
  where id = any(feed_ids);
end $$;
