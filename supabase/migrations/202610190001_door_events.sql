begin;
create function public.ringside_door_events() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',e.id,'title',e.title,'venue',e.venue,'startsAt',e.starts_at,
    'scanOpensAt',e.scan_opens_at,'scanClosesAt',e.scan_closes_at,'status',e.status
  ) order by e.starts_at),'[]'::jsonb)
  from ringside_private.events e
  where ringside_private.can_scan(e.id) and e.status<>'draft';
$$;
revoke all on function public.ringside_door_events() from public,anon;
grant execute on function public.ringside_door_events() to authenticated;
-- Future private functions and tables must also start inaccessible to browsers.
alter default privileges in schema ringside_private revoke execute on functions from public;
alter default privileges in schema ringside_private revoke all on tables from anon,authenticated;
commit;
