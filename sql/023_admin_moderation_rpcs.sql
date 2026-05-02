-- 023_admin_moderation_rpcs.sql
-- Admin moderation queue RPCs kept short for safe review.

create or replace function public.admin_moderation_queue(max_rows int default 50, include_resolved boolean default false)
returns table (
  id uuid, item_type text, item_id text, reason text, status text,
  reporter_id uuid, assigned_to uuid, created_at timestamptz, resolved_at timestamptz
) language sql stable security definer set search_path = public as $$
  select q.id, q.item_type, q.item_id, q.reason, q.status,
         q.reporter_id, q.assigned_to, q.created_at, q.resolved_at
    from public.admin_moderation_queue q
   where public.is_admin(auth.uid())
     and (include_resolved or q.status in ('open','reviewing'))
   order by q.created_at desc
   limit greatest(1, least(max_rows, 200));
$$;

grant execute on function public.admin_moderation_queue(int, boolean) to authenticated;

create or replace function public.admin_moderation_resolve(queue_id uuid, new_status text default 'resolved')
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin(auth.uid()) then raise exception 'admin only'; end if;
  update public.admin_moderation_queue
     set status = coalesce(nullif(new_status, ''), 'resolved'),
         assigned_to = coalesce(assigned_to, auth.uid()),
         resolved_by = case when new_status in ('resolved','rejected') then auth.uid() else resolved_by end,
         resolved_at = case when new_status in ('resolved','rejected') then now() else resolved_at end
   where id = queue_id;

  insert into public.admin_audit_log (admin_id, action, target_type, target_id, meta)
  values (auth.uid(), 'moderation_update', 'admin_moderation_queue', queue_id::text, jsonb_build_object('status', new_status));
end $$;

grant execute on function public.admin_moderation_resolve(uuid, text) to authenticated;

select '023_admin_moderation_rpcs applied' as status;
