-- =====================================================================
-- Audifyx owner profile — final custom avatar + banner
--
-- Locks in the real branded avatar & banner generated for the platform
-- owner (audifyx@gmail.com), refreshes the OWNER + DEV badges, and
-- guarantees the bootstrap survives every future sign-in / upsert.
--
-- Safe to run repeatedly. Only touches the owner row.
-- =====================================================================

-- 1. Refresh the new-user trigger with final asset URLs ---------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  is_owner boolean := lower(coalesce(new.email, '')) = 'audifyx@gmail.com';
  owner_avatar text := 'https://r2-pub.rork.com/generated-images/cf1055f1-cb3f-45fa-9d53-e7bf835bd3fe.png';
  owner_banner text := 'https://r2-pub.rork.com/generated-images/647148c5-8a0c-4947-ba97-f62b44261d5b.png';
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
    set avatar_url    = case when is_owner then owner_avatar else public.profiles.avatar_url end,
        banner_url    = case when is_owner then owner_banner else public.profiles.banner_url end,
        verified      = case when is_owner then true else public.profiles.verified end,
        custom_badges = case when is_owner then owner_badges else public.profiles.custom_badges end,
        updated_at    = now();

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

-- 2. Refresh the safety-net trigger so future profile updates can't
--    erase the owner's branded media or badges --------------------------
create or replace function public.preserve_owner_identity()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  is_owner boolean;
  owner_avatar text := 'https://r2-pub.rork.com/generated-images/cf1055f1-cb3f-45fa-9d53-e7bf835bd3fe.png';
  owner_banner text := 'https://r2-pub.rork.com/generated-images/647148c5-8a0c-4947-ba97-f62b44261d5b.png';
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
      new.avatar_url := owner_avatar;
    end if;
    if new.banner_url is null or new.banner_url = '' then
      new.banner_url := owner_banner;
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_preserve_owner_identity on public.profiles;
create trigger trg_preserve_owner_identity
  before insert or update on public.profiles
  for each row execute function public.preserve_owner_identity();

-- 3. One-shot bootstrap if the owner already exists --------------------
do $$
declare
  owner_id uuid;
  owner_avatar text := 'https://r2-pub.rork.com/generated-images/cf1055f1-cb3f-45fa-9d53-e7bf835bd3fe.png';
  owner_banner text := 'https://r2-pub.rork.com/generated-images/647148c5-8a0c-4947-ba97-f62b44261d5b.png';
  owner_badges jsonb := jsonb_build_array(
    jsonb_build_object('id','owner','label','OWNER','color','#FFD56B','icon','crown','granted_at', to_jsonb(now())),
    jsonb_build_object('id','dev','label','DEV','color','#38D7FF','icon','code','granted_at', to_jsonb(now()))
  );
begin
  select id into owner_id from auth.users where lower(email) = 'audifyx@gmail.com' limit 1;
  if owner_id is null then
    return;
  end if;

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
