begin;
create table ringside_private.staff_audit(id uuid primary key default gen_random_uuid(),actor uuid references auth.users(id),subject uuid references auth.users(id),action text not null,details jsonb not null default '{}',created_at timestamptz not null default now());
alter table ringside_private.staff_audit enable row level security;
revoke all on ringside_private.staff_audit from public,anon,authenticated;
grant all on ringside_private.staff_audit to service_role;
create function public.ringside_staff_office() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  if ringside_private.editor_role()<>'owner' then raise exception 'Owner access required';end if;
  return jsonb_build_object('staff',coalesce((select jsonb_agg(jsonb_build_object('id',s.user_id,'email',u.email,'role',s.role,'active',s.active,'verified',u.email_confirmed_at is not null,'events',coalesce((select jsonb_agg(event_id) from ringside_private.event_staff es where es.user_id=s.user_id),'[]'::jsonb)) order by s.created_at) from ringside_private.staff s join auth.users u on u.id=s.user_id),'[]'::jsonb),
    'events',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'title',e.title,'startsAt',e.starts_at,'status',e.status) order by e.starts_at desc) from ringside_private.events e),'[]'::jsonb));
end $$;
create function public.ringside_manage_staff(p_action text,p_email text default null,p_role text default null,p_user uuid default null,p_event uuid default null,p_active boolean default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare target uuid;target_role text;begin
  if ringside_private.editor_role()<>'owner' then raise exception 'Owner access required';end if;
  if p_action='grant' then
    if p_role not in ('scanner','editor') or p_role is null then raise exception 'Choose scanner or editor';end if;
    select id into target from auth.users where lower(email)=lower(trim(p_email)) and email is not null;
    if target is null then raise exception 'No account exists for that email. Send an invitation first';end if;
    if exists(select 1 from ringside_private.staff where user_id=target and role='owner') then raise exception 'Existing owner access cannot be changed here';end if;
    insert into ringside_private.staff(user_id,role,active) values(target,p_role,true) on conflict(user_id) do update set role=excluded.role,active=true;
    insert into ringside_private.staff_audit(actor,subject,action,details) values(auth.uid(),target,'grant',jsonb_build_object('role',p_role));
  elsif p_action='active' then
    target=p_user;select role into target_role from ringside_private.staff where user_id=target for update;
    if target_role is null or target_role='owner' or p_active is null then raise exception 'Only non-owner staff access can be changed here';end if;
    update ringside_private.staff set active=p_active where user_id=target;
    insert into ringside_private.staff_audit(actor,subject,action,details) values(auth.uid(),target,'active',jsonb_build_object('active',p_active));
  elsif p_action='assign' then
    target=p_user;
    if p_active is null or not exists(select 1 from ringside_private.staff where user_id=target and active and role in ('owner','scanner')) then raise exception 'Choose an active owner or scanner';end if;
    if not exists(select 1 from ringside_private.events where id=p_event) then raise exception 'Event not found';end if;
    if p_active then insert into ringside_private.event_staff(event_id,user_id) values(p_event,target) on conflict do nothing;
    else delete from ringside_private.event_staff where event_id=p_event and user_id=target;end if;
    insert into ringside_private.staff_audit(actor,subject,action,details) values(auth.uid(),target,'assign',jsonb_build_object('event',p_event,'assigned',p_active));
  else raise exception 'Unknown staff action';end if;
  return jsonb_build_object('ok',true,'userId',target);
end $$;
revoke all on function public.ringside_staff_office(),public.ringside_manage_staff(text,text,text,uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.ringside_staff_office(),public.ringside_manage_staff(text,text,text,uuid,uuid,boolean) to authenticated;
commit;

