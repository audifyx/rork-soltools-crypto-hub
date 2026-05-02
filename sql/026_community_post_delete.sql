-- 026_community_post_delete.sql
-- Adds safe community post deletion: admins/moderators can delete any post,
-- regular users can delete only their own posts. Safe to run more than once.

create extension if not exists pgcrypto;

create table if not exists public.admin_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('superadmin', 'admin', 'moderator', 'support')),
  created_at timestamptz not null default now()
);

alter table public.admin_roles enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'admin_roles'
      and policyname = 'admin_roles_select_self'
  ) then
    create policy admin_roles_select_self
      on public.admin_roles
      for select
      using (auth.uid() = user_id);
  end if;
end $$;

create or replace function public.is_community_post_moderator(target_user_id uuid default auth.uid())
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.admin_roles ar
    where ar.user_id = target_user_id
      and ar.role in ('superadmin', 'admin', 'moderator')
  );
$$;

create or replace function public.delete_community_post(target_post_id uuid)
returns table(
  deleted_id uuid,
  deleted_community_id uuid,
  deleted_parent_post_id uuid,
  deleted_quote_post_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  acting_user uuid := auth.uid();
  target_row public.community_posts%rowtype;
  may_delete boolean := false;
begin
  if acting_user is null then
    raise exception 'Sign in required';
  end if;

  select *
  into target_row
  from public.community_posts cp
  where cp.id = target_post_id;

  if target_row.id is null then
    raise exception 'Post not found';
  end if;

  may_delete := target_row.user_id = acting_user or public.is_community_post_moderator(acting_user);

  if not may_delete then
    raise exception 'You can only delete your own posts';
  end if;

  delete from public.community_posts cp
  where cp.id = target_post_id;

  -- Keep parent reply counts and quote/repost counts exact after the delete.
  perform public.sync_community_post_counts(target_row.parent_post_id);
  perform public.sync_community_post_counts(target_row.quote_post_id);

  -- Keep community post totals exact. Top-level posts are counted here because
  -- replies are counted on their parent thread, not as community timeline posts.
  if target_row.community_id is not null then
    update public.communities c
    set posts_count = coalesce((
      select count(*)::integer
      from public.community_posts cp
      where cp.community_id = target_row.community_id
        and cp.parent_post_id is null
    ), 0)
    where c.id = target_row.community_id;
  end if;

  return query
  select
    target_row.id,
    target_row.community_id,
    target_row.parent_post_id,
    target_row.quote_post_id;
end;
$$;

grant execute on function public.is_community_post_moderator(uuid) to authenticated;
grant execute on function public.delete_community_post(uuid) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'community_posts'
      and policyname = 'community_posts_delete_own_or_moderator'
  ) then
    create policy community_posts_delete_own_or_moderator
      on public.community_posts
      for delete
      using (
        auth.uid() = user_id
        or public.is_community_post_moderator(auth.uid())
      );
  end if;
end $$;
