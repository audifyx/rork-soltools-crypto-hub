-- 012_profile_user_rpcs.sql
-- Idempotent user/profile RPCs used by the app.

create or replace function public.update_my_profile(
  set_display_name text default null,
  set_username text default null,
  set_bio text default null,
  set_avatar_url text default null,
  set_banner_url text default null,
  set_avatar_color text default null,
  set_banner_from text default null,
  set_banner_to text default null,
  set_wallet text default null,
  set_twitter text default null,
  set_website text default null,
  set_location text default null
) returns void language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  clean_username text := nullif(regexp_replace(coalesce(set_username, ''), '^@', ''), '');
begin
  if caller is null then raise exception 'not authenticated'; end if;

  insert into public.profiles (id, user_id, username, display_name)
  values (caller, caller, coalesce(clean_username, 'user_' || substr(caller::text, 1, 6)), coalesce(set_display_name, clean_username, 'New User'))
  on conflict (id) do nothing;

  update public.profiles set
    display_name = case when set_display_name is null then display_name else nullif(set_display_name, '') end,
    username = case when set_username is null then username else nullif(clean_username, '')::citext end,
    bio = case when set_bio is null then bio else nullif(set_bio, '') end,
    avatar_url = case when set_avatar_url is null then avatar_url else nullif(set_avatar_url, '') end,
    banner_url = case when set_banner_url is null then banner_url else nullif(set_banner_url, '') end,
    avatar_color = case when set_avatar_color is null then avatar_color else nullif(set_avatar_color, '') end,
    banner_from = case when set_banner_from is null then banner_from else nullif(set_banner_from, '') end,
    banner_to = case when set_banner_to is null then banner_to else nullif(set_banner_to, '') end,
    wallet_address = case when set_wallet is null then wallet_address else nullif(set_wallet, '') end,
    twitter_handle = case when set_twitter is null then twitter_handle else nullif(set_twitter, '') end,
    website = case when set_website is null then website else nullif(set_website, '') end,
    location = case when set_location is null then location else nullif(set_location, '') end,
    updated_at = now()
  where id = caller;
end $$;

grant execute on function public.update_my_profile(text,text,text,text,text,text,text,text,text,text,text,text) to authenticated;

create or replace function public.heartbeat(set_status text default 'online')
returns void language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  s text := coalesce(nullif(set_status, ''), 'online');
begin
  if caller is null then return; end if;
  if s not in ('online','away','offline') then s := 'online'; end if;

  insert into public.user_presence (user_id, status, last_seen, updated_at)
  values (caller, s, now(), now())
  on conflict (user_id) do update set
    status = excluded.status,
    last_seen = excluded.last_seen,
    updated_at = now();

  update public.profiles set status = s, last_seen_at = now() where id = caller;
end $$;

grant execute on function public.heartbeat(text) to authenticated;

create or replace function public.set_offline()
returns void language plpgsql security definer set search_path = public as $$
declare caller uuid := auth.uid();
begin
  if caller is null then return; end if;
  update public.user_presence set status = 'offline', updated_at = now() where user_id = caller;
  update public.profiles set status = 'offline', last_seen_at = now() where id = caller;
end $$;

grant execute on function public.set_offline() to authenticated;

create or replace function public.toggle_follow(target_user_id uuid)
returns table (following boolean, followers_count integer)
language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  cur_count integer;
begin
  if caller is null then raise exception 'not authenticated'; end if;
  if caller = target_user_id then raise exception 'cannot follow yourself'; end if;

  if exists (select 1 from public.followers where follower_id = caller and followee_id = target_user_id) then
    delete from public.followers where follower_id = caller and followee_id = target_user_id;
    following := false;
  else
    insert into public.followers (follower_id, followee_id) values (caller, target_user_id) on conflict do nothing;
    following := true;
  end if;

  update public.profiles p set
    followers_count = (select count(*)::int from public.followers f where f.followee_id = p.id),
    following_count = (select count(*)::int from public.followers f where f.follower_id = p.id)
  where p.id in (caller, target_user_id);

  select p.followers_count into cur_count from public.profiles p where p.id = target_user_id;
  followers_count := coalesce(cur_count, 0);
  return next;
end $$;

grant execute on function public.toggle_follow(uuid) to authenticated;

create or replace function public.get_profile_by_handle(handle text)
returns table (
  id uuid, username text, display_name text, bio text, avatar_url text, banner_url text,
  avatar_color text, banner_from text, banner_to text, wallet_address text, twitter_handle text,
  website text, location text, badge text, verified boolean, custom_badges jsonb,
  followers_count integer, following_count integer, trades_count integer, win_rate numeric,
  pnl_pct numeric, xp integer, created_at timestamptz, is_following boolean
) language sql stable security definer set search_path = public as $$
  select p.id, p.username::text, p.display_name, p.bio, p.avatar_url, p.banner_url,
         p.avatar_color, p.banner_from, p.banner_to, p.wallet_address, p.twitter_handle,
         p.website, p.location, p.badge, p.verified, coalesce(p.custom_badges, '[]'::jsonb),
         p.followers_count, p.following_count, p.trades_count, p.win_rate,
         p.pnl_pct, p.xp, p.created_at,
         case when auth.uid() is null then false else exists (
           select 1 from public.followers f where f.follower_id = auth.uid() and f.followee_id = p.id
         ) end
    from public.profiles p
   where lower(p.username::text) = lower(regexp_replace(handle, '^@', ''))
     and coalesce(p.is_banned, false) = false
   limit 1;
$$;

grant execute on function public.get_profile_by_handle(text) to authenticated, anon;

select '012_profile_user_rpcs applied' as status;
