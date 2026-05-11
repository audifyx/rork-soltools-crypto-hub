-- Adds delete_community_post RPC so authors (and moderators where applicable)
-- can delete their own community posts. Falls back to RLS for direct deletes.
create or replace function public.delete_community_post(target_post_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_owner uuid;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  select user_id into v_owner
  from public.community_posts
  where id = target_post_id;

  if v_owner is null then
    raise exception 'post not found';
  end if;

  if v_owner <> v_user then
    raise exception 'you can only delete your own posts';
  end if;

  delete from public.community_posts where id = target_post_id;
end;
$$;

grant execute on function public.delete_community_post(uuid) to authenticated;
