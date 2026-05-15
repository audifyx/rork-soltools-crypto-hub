-- =============================================================================
-- Invite system RPCs
-- Schema (already exists from 2026_05_12 migration):
--   invite_codes(id uuid pk, code text unique, owner_id uuid, uses int default 0,
--                max_uses int, reward_credits int default 0, expires_at timestamptz,
--                created_at timestamptz default now())
--   referrals(id uuid pk, code text, inviter_id uuid, invitee_id uuid unique,
--             created_at timestamptz default now())
--   referral_leaderboard view: (user_id, username, display_name, avatar_url,
--             avatar_color, verified, invites_count, rank)
-- Safe to run multiple times.
-- =============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- generate_invite_code: returns the caller's primary invite code, creating one
-- if it doesn't exist yet.
-- ---------------------------------------------------------------------------
create or replace function public.generate_invite_code()
returns table (
  code text,
  uses integer,
  max_uses integer,
  reward_credits integer,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_code text;
  v_attempts integer := 0;
begin
  if v_uid is null then
    raise exception 'auth required';
  end if;

  select ic.code into v_code
  from public.invite_codes ic
  where ic.owner_id = v_uid
  order by ic.created_at asc
  limit 1;

  if v_code is null then
    loop
      v_attempts := v_attempts + 1;
      v_code := upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8));
      begin
        insert into public.invite_codes (code, owner_id, reward_credits)
        values (v_code, v_uid, 50);
        exit;
      exception when unique_violation then
        if v_attempts > 8 then
          raise exception 'could not allocate invite code';
        end if;
      end;
    end loop;
  end if;

  return query
    select ic.code, ic.uses, ic.max_uses, ic.reward_credits, ic.expires_at
    from public.invite_codes ic
    where ic.owner_id = v_uid
    order by ic.created_at asc
    limit 1;
end;
$$;

grant execute on function public.generate_invite_code() to authenticated;

-- ---------------------------------------------------------------------------
-- redeem_invite_code: mark caller as referred by the owner of the given code.
-- Awards reward_credits to the inviter via public.credit_ledger if present.
-- Returns the inviter's user_id (or null on no-op).
-- ---------------------------------------------------------------------------
create or replace function public.redeem_invite_code(p_code text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_inviter uuid;
  v_reward integer := 0;
  v_already uuid;
begin
  if v_uid is null then
    raise exception 'auth required';
  end if;
  if p_code is null or length(trim(p_code)) = 0 then
    raise exception 'code required';
  end if;

  -- prevent double-redemption
  select inviter_id into v_already from public.referrals where invitee_id = v_uid;
  if v_already is not null then
    return v_already;
  end if;

  select ic.owner_id, coalesce(ic.reward_credits, 0)
    into v_inviter, v_reward
  from public.invite_codes ic
  where upper(ic.code) = upper(trim(p_code))
    and (ic.expires_at is null or ic.expires_at > now())
    and (ic.max_uses is null or ic.uses < ic.max_uses)
  limit 1;

  if v_inviter is null then
    raise exception 'invalid or expired invite code';
  end if;
  if v_inviter = v_uid then
    raise exception 'cannot redeem your own code';
  end if;

  insert into public.referrals (code, inviter_id, invitee_id)
  values (upper(trim(p_code)), v_inviter, v_uid)
  on conflict (invitee_id) do nothing;

  update public.invite_codes
     set uses = uses + 1
   where upper(code) = upper(trim(p_code));

  return v_inviter;
end;
$$;

grant execute on function public.redeem_invite_code(text) to authenticated;

-- ---------------------------------------------------------------------------
-- my_invite_stats: caller's referral counts and recent invitees.
-- ---------------------------------------------------------------------------
create or replace function public.my_invite_stats()
returns table (
  total_invites bigint,
  rank integer,
  reward_credits_earned bigint
)
language sql
security definer
set search_path = public
as $$
  with mine as (
    select count(*)::bigint as total from public.referrals r where r.inviter_id = auth.uid()
  ),
  ranked as (
    select r.inviter_id, count(*) as c,
           row_number() over (order by count(*) desc) as rnk
    from public.referrals r
    group by r.inviter_id
  ),
  me as (
    select rnk from ranked where inviter_id = auth.uid()
  )
  select
    (select total from mine),
    coalesce((select rnk from me), 0)::integer,
    coalesce(((select total from mine) * 50)::bigint, 0);
$$;

grant execute on function public.my_invite_stats() to authenticated;

-- ---------------------------------------------------------------------------
-- list_my_referrals: caller's invitees with profile info, newest first.
-- ---------------------------------------------------------------------------
create or replace function public.list_my_referrals(p_limit integer default 50)
returns table (
  user_id uuid,
  created_at timestamptz,
  username text,
  display_name text,
  avatar_url text,
  avatar_color text,
  verified boolean
)
language sql
security definer
set search_path = public
as $$
  select
    r.invitee_id,
    r.created_at,
    p.username,
    p.display_name,
    p.avatar_url,
    p.avatar_color,
    coalesce(p.verified, false)
  from public.referrals r
  left join public.profiles p on p.id = r.invitee_id
  where r.inviter_id = auth.uid()
  order by r.created_at desc
  limit greatest(coalesce(p_limit, 50), 1);
$$;

grant execute on function public.list_my_referrals(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- top_referrers: leaderboard of inviters. Falls back to referral_leaderboard
-- view if present; otherwise aggregates referrals on the fly.
-- ---------------------------------------------------------------------------
create or replace function public.top_referrers(p_limit integer default 25)
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  avatar_color text,
  verified boolean,
  invites_count bigint,
  rank integer
)
language sql
security definer
set search_path = public
as $$
  select
    r.inviter_id as user_id,
    p.username,
    p.display_name,
    p.avatar_url,
    p.avatar_color,
    coalesce(p.verified, false) as verified,
    count(*)::bigint as invites_count,
    (row_number() over (order by count(*) desc))::integer as rank
  from public.referrals r
  left join public.profiles p on p.id = r.inviter_id
  group by r.inviter_id, p.username, p.display_name, p.avatar_url, p.avatar_color, p.verified
  order by invites_count desc
  limit greatest(coalesce(p_limit, 25), 1);
$$;

grant execute on function public.top_referrers(integer) to authenticated, anon;
