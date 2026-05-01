-- =====================================================================
-- Owner bootstrap + new-user blank profile defaults
--
-- 1. Make sure every new auth user gets a fresh profile with NO avatar
--    and NO banner — they upload one at sign-up or anytime later.
-- 2. Bootstrap audifyx@gmail.com as the platform owner with:
--      - superadmin role
--      - verified = true
--      - custom_badges: OWNER + DEV
--      - a permanent custom avatar + banner
--    These flags are preserved every time the bootstrap runs (idempotent).
-- 3. Re-bootstraps automatically the moment audifyx@gmail.com signs up.
-- =====================================================================

-- --------------------------------------------------------------------
-- 1. handle_new_user — blank media for everyone except audifyx
-- --------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  is_owner boolean := lower(coalesce(new.email, '')) = 'audifyx@gmail.com';
  owner_avatar text := 'https://r2-pub.rork.com/generated-images/690ae05a-2c77-4177-aebc-813612d3370c.png';
  owner_banner text := 'https://r2-pub.rork.com/generated-images/4d5d4184-779c-4b8a-95ad-eddddb365d09.png';
  owner_badges jsonb := jsonb_build_array(
    jsonb_build_object('id','owner','label','OWNER','color','#FFD56B','icon','crown','granted_at', to_jsonb(now())),
    jsonb_build_object('id','dev','label','DEV','color','#38D7FF','icon','code','granted_at', to_jsonb(now()))
  );
begin
  insert into public.profiles (
    id, user_id, username, display_name,
    avatar_url, banner_url,
    verified, custom_badges
  )
  values (
    new.id,
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'username',''), split_part(new.email,'@',1)),
    coalesce(nullif(new.raw_user_meta_data->>'username',''), split_part(new.email,'@',1)),
    case when is_owner then owner_avatar else null end,
    case when is_owner then owner_banner else null end,
    case when is_owner then true else false end,
    case when is_owner then owner_badges else '[]'::jsonb end
  )
  on conflict (id) do update
    set avatar_url   = case when is_owner then owner_avatar else public.profiles.avatar_url end,
        banner_url   = case when is_owner then owner_banner else public.profiles.banner_url end,
        verified     = case when is_owner then true else public.profiles.verified end,
        custom_badges = case when is_owner then owner_badges else public.profiles.custom_badges end,
        updated_at   = now();

  insert into public.user_settings (user_id) values (new.id) on conflict (user_id) do nothing;
  insert into public.user_credits  (user_id) values (new.id) on conflict (user_id) do nothing;

  if is_owner then
    insert into public.admin_roles (user_id, role, granted_by)
    values (new.id, 'superadmin', new.id)
    on conflict (user_id) do update set role = 'superadmin';
  end if;

  return new;
end $$;

drop trigger if exists trg_on_auth_user_created on auth.users;
create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- --------------------------------------------------------------------
-- 2. One-shot bootstrap if the owner already exists
-- --------------------------------------------------------------------
do $$
declare
  owner_id uuid;
  owner_avatar text := 'https://r2-pub.rork.com/generated-images/690ae05a-2c77-4177-aebc-813612d3370c.png';
  owner_banner text := 'https://r2-pub.rork.com/generated-images/4d5d4184-779c-4b8a-95ad-eddddb365d09.png';
  owner_badges jsonb := jsonb_build_array(
    jsonb_build_object('id','owner','label','OWNER','color','#FFD56B','icon','crown','granted_at', to_jsonb(now())),
    jsonb_build_object('id','dev','label','DEV','color','#38D7FF','icon','code','granted_at', to_jsonb(now()))
  );
begin
  select id into owner_id from auth.users where lower(email) = 'audifyx@gmail.com' limit 1;
  if owner_id is null then
    return;
  end if;

  -- Make sure profile row exists
  insert into public.profiles (id, user_id, username, display_name)
  values (owner_id, owner_id, 'audifyx', 'Audifyx')
  on conflict (id) do nothing;

  update public.profiles
     set avatar_url    = owner_avatar,
         banner_url    = owner_banner,
         verified      = true,
         badge         = coalesce(badge, 'owner'),
         display_name  = coalesce(nullif(display_name, ''), 'Audifyx'),
         username      = coalesce(nullif(username::text, ''), 'audifyx'),
         custom_badges = owner_badges,
         updated_at    = now()
   where id = owner_id;

  insert into public.admin_roles (user_id, role, granted_by)
  values (owner_id, 'superadmin', owner_id)
  on conflict (user_id) do update set role = 'superadmin';

  insert into public.user_settings (user_id) values (owner_id) on conflict (user_id) do nothing;
  insert into public.user_credits  (user_id) values (owner_id) on conflict (user_id) do nothing;
end $$;

-- --------------------------------------------------------------------
-- 3. Safety net: protect owner badges from being wiped by upserts
-- --------------------------------------------------------------------
create or replace function public.preserve_owner_identity()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  is_owner boolean;
begin
  select lower(email) = 'audifyx@gmail.com' into is_owner
    from auth.users where id = new.id;
  if coalesce(is_owner, false) then
    new.verified := true;
    if new.custom_badges is null
       or jsonb_typeof(new.custom_badges) <> 'array'
       or jsonb_array_length(new.custom_badges) = 0 then
      new.custom_badges := jsonb_build_array(
        jsonb_build_object('id','owner','label','OWNER','color','#FFD56B','icon','crown'),
        jsonb_build_object('id','dev','label','DEV','color','#38D7FF','icon','code')
      );
    end if;
    if new.avatar_url is null or new.avatar_url = '' then
      new.avatar_url := 'https://r2-pub.rork.com/generated-images/690ae05a-2c77-4177-aebc-813612d3370c.png';
    end if;
    if new.banner_url is null or new.banner_url = '' then
      new.banner_url := 'https://r2-pub.rork.com/generated-images/4d5d4184-779c-4b8a-95ad-eddddb365d09.png';
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_preserve_owner_identity on public.profiles;
create trigger trg_preserve_owner_identity
  before insert or update on public.profiles
  for each row execute function public.preserve_owner_identity();
