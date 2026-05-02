-- 034_fix_community_feature_toggle_permissions.sql
-- Makes community feature toggles resilient for owner/profile-id/member-role setups.
-- Safe to run more than once.

alter table if exists public.community_members
  add column if not exists role text not null default 'member';

create or replace function public.can_manage_community_features(
  target_community_id uuid,
  target_user_id uuid default auth.uid()
)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select target_user_id is not null and exists (
    select 1
    from public.communities c
    where c.id = target_community_id
      and (
        c.owner_id = target_user_id
        or exists (
          select 1
          from public.profiles p
          where p.id = c.owner_id
            and p.user_id = target_user_id
        )
        or exists (
          select 1
          from public.community_members cm
          where cm.community_id = c.id
            and cm.user_id = target_user_id
            and cm.role in ('owner', 'admin', 'moderator')
        )
        or public.is_community_post_moderator(target_user_id)
      )
  );
$$;

create or replace function public.toggle_community_feature(
  target_community_id uuid,
  target_feature_id text,
  p_enabled boolean
)
returns table(feature_id text, enabled boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  acting_user uuid := auth.uid();
begin
  if acting_user is null then
    raise exception 'Sign in required';
  end if;

  if not public.can_manage_community_features(target_community_id, acting_user) then
    raise exception 'Only community owners, admins, or moderators can update features';
  end if;

  if not exists (select 1 from public.community_feature_catalog cfc where cfc.id = target_feature_id) then
    raise exception 'Unknown feature';
  end if;

  insert into public.community_feature_settings(
    community_id,
    feature_id,
    enabled,
    updated_by,
    updated_at
  ) values (
    target_community_id,
    target_feature_id,
    p_enabled,
    acting_user,
    now()
  )
  on conflict (community_id, feature_id) do update
    set enabled = excluded.enabled,
        updated_by = excluded.updated_by,
        updated_at = now();

  insert into public.community_feature_events(
    community_id,
    feature_id,
    actor_id,
    event_type,
    target_type,
    target_id,
    metadata
  ) values (
    target_community_id,
    target_feature_id,
    acting_user,
    case when p_enabled then 'feature_enabled' else 'feature_disabled' end,
    'feature',
    target_feature_id,
    jsonb_build_object('enabled', p_enabled)
  ) on conflict do nothing;

  return query select target_feature_id, p_enabled;
end;
$$;

grant execute on function public.can_manage_community_features(uuid, uuid) to authenticated;
grant execute on function public.toggle_community_feature(uuid, text, boolean) to authenticated;
