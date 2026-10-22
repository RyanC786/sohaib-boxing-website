-- Keep private email links useful after a refund without exposing admission tokens.
begin;
create or replace function public.ringside_receipt(p_hash text) returns jsonb language sql stable security definer set search_path='' as $$
  select case when o.status='refunded' or o.requires_review then
    jsonb_build_object('reference',o.id,'event',e.title,'bookingStatus',case when o.status='refunded' then 'refunded' else 'review_required' end,'tickets','[]'::jsonb)
  else jsonb_build_object('reference',o.id,'bookingStatus','paid','event',e.title,'venue',e.venue,'startsAt',e.starts_at,'eventStatus',e.status,'eventDetails',e.content,'purchasedEvent',o.event_snapshot,'totalPence',o.total_pence,
    'request',(select jsonb_build_object('kind',r.kind,'status',r.status) from ringside_private.booking_requests r where r.order_id=o.id),
    'tickets',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.attendee_name,'category',t.category,'status',case when e.status in ('cancelled','postponed','completed') then 'event_'||e.status else t.status end) order by t.created_at,t.id) from ringside_private.tickets t where t.order_id=o.id),'[]'::jsonb)) end
  from ringside_private.orders o join ringside_private.events e on e.id=o.event_id where o.receipt_hash=p_hash and o.status in ('paid','refunded');
$$;
commit;
