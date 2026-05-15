-- =============================================================================
-- list_event_rsvps: returns the users who RSVP'd to an event, filtered by status
-- Used by the events screen to show a poll-style list of who's going/interested
-- when tapping above the Going/Interested buttons.
-- Safe to run multiple times.
-- =============================================================================

create or replace function public.list_event_rsvps(
  p_event_id uuid,
  p_status   text default null,
  p_limit    integer default 100
)
returns table (
  user_id      uuid,
  status       text,
  created_at   timestamptz,
  username     text,
  display_name text,
  avatar_url   text,
  avatar_color text,
  verified     boolean
)
language sql
security definer
set search_path = public
as $$
  select
    r.user_id,
    r.status,
    r.created_at,
    p.username,
    p.display_name,
    p.avatar_url,
    p.avatar_color,
    coalesce(p.verified, false) as verified
  from public.event_rsvps r
  left join public.profiles p on p.id = r.user_id
  where r.event_id = p_event_id
    and (p_status is null or r.status = p_status)
    and r.status <> 'no'
  order by r.created_at desc
  limit greatest(coalesce(p_limit, 100), 1)
$$;

grant execute on function public.list_event_rsvps(uuid, text, integer) to authenticated, anon;
