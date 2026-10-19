begin;
create table ringside_private.ticket_categories (
  id uuid primary key default gen_random_uuid(),event_id uuid not null references ringside_private.events(id),
  name text not null,price_pence integer not null check(price_pence>0),
  capacity integer not null check(capacity between 1 and 100000),enabled boolean not null default false
);
alter table ringside_private.ticket_categories enable row level security;
revoke all on ringside_private.ticket_categories from public,anon,authenticated;
grant all on ringside_private.ticket_categories to service_role;
alter table ringside_private.orders
  add column category_id uuid references ringside_private.ticket_categories(id),
  add column request_id uuid unique,
  add column attendees jsonb,
  add column quantity integer check(quantity between 1 and 8),
  add column unit_price_pence integer check(unit_price_pence>0),
  add column checkout_expires_at timestamptz,
  add column receipt_hash text unique check(receipt_hash ~ '^[0-9a-f]{64}$'),
  add column event_snapshot jsonb,
  add column requires_review boolean not null default false;
create index on ringside_private.orders(category_id,status);
create table ringside_private.refunded_payments(payment_id text primary key,fully_refunded boolean not null,recorded_at timestamptz not null default now());
alter table ringside_private.refunded_payments enable row level security;
revoke all on ringside_private.refunded_payments from public,anon,authenticated;
grant all on ringside_private.refunded_payments to service_role;

-- All following functions are server-only; browsers never receive the service key.
create function public.ringside_ticket_catalog() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'event',e.title,'venue',e.venue,
    'startsAt',e.starts_at,'name',c.name,'pricePence',c.price_pence,
    'available',greatest(c.capacity-coalesce((select sum(o.quantity) from ringside_private.orders o where o.category_id=c.id and o.status in ('pending','paid')),0),0)) order by e.starts_at,c.price_pence),'[]'::jsonb)
  from ringside_private.ticket_categories c join ringside_private.events e on e.id=c.event_id
  where c.enabled and e.status='scheduled' and e.starts_at>now();
$$;

create function public.ringside_reserve_order(p_request uuid,p_category uuid,p_email text,p_attendees jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare c ringside_private.ticket_categories;e ringside_private.events;o ringside_private.orders;qty integer;reserved bigint;
begin
  if p_email is null or length(p_email)>254 or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    or p_attendees is null or jsonb_typeof(p_attendees)<>'array' or jsonb_array_length(p_attendees) not between 1 and 8 then raise exception 'Invalid booking';end if;
  if exists(select 1 from jsonb_array_elements(p_attendees) a where jsonb_typeof(a->'name') is distinct from 'string' or length(trim(a->>'name')) not between 2 and 100) then raise exception 'Invalid attendee';end if;
  -- Lock the event before the category to share lock order with admission/refund operations.
  select e2.* into e from ringside_private.events e2 join ringside_private.ticket_categories c2 on c2.event_id=e2.id where c2.id=p_category for share of e2;
  if not found then raise exception 'Category unavailable';end if;
  select * into c from ringside_private.ticket_categories where id=p_category for update;
  if not c.enabled or e.status<>'scheduled' or e.starts_at<=now() then raise exception 'Sales closed';end if;
  -- Serialise retries even when a caller changes category with the same request ID.
  perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
  select * into o from ringside_private.orders where request_id=p_request;
  if found then
    if o.category_id<>p_category or o.buyer_email<>p_email or o.attendees<>p_attendees then raise exception 'Booking request changed';end if;
  else
    qty=jsonb_array_length(p_attendees);
    select coalesce(sum(quantity),0) into reserved from ringside_private.orders where category_id=c.id and status in ('pending','paid');
    if reserved+qty>c.capacity then raise exception 'Not enough tickets available';end if;
    insert into ringside_private.orders(event_id,buyer_email,total_pence,category_id,request_id,attendees,quantity,unit_price_pence,checkout_expires_at,event_snapshot)
      values(e.id,p_email,c.price_pence*qty,c.id,p_request,p_attendees,qty,c.price_pence,now()+interval '35 minutes',jsonb_build_object('title',e.title,'venue',e.venue,'startsAt',e.starts_at,'category',c.name)) returning * into o;
  end if;
  -- Reservations release only after Stripe confirms checkout expiration, cancellation or refund.
  -- A missing/uncertain Stripe response must not silently release sellable inventory.
  return jsonb_build_object('id',o.id,'status',o.status,'unitPrice',o.unit_price_pence,'category',o.event_snapshot->>'category','checkoutExpiresAt',o.checkout_expires_at);
end $$;

create function public.ringside_attach_checkout(p_order uuid,p_session text,p_receipt_hash text) returns void
language plpgsql security definer set search_path='' as $$
declare o ringside_private.orders;
begin
  select * into o from ringside_private.orders where id=p_order for update;
  if not found or o.status<>'pending' or p_session is null or p_session not like 'cs_%' or p_receipt_hash is null or p_receipt_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invalid checkout';end if;
  if o.stripe_session_id is not null and o.stripe_session_id<>p_session then raise exception 'Checkout already attached';end if;
  update ringside_private.orders set stripe_session_id=p_session,receipt_hash=p_receipt_hash where id=p_order;
end $$;

create function public.ringside_fulfillment_order(p_order uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('id',id,'attendees',attendees) from ringside_private.orders where id=p_order and attendees is not null;
$$;

create function public.ringside_fulfill_order(p_notification text,p_type text,p_order uuid,p_session text,p_payment text,p_amount integer,p_currency text,p_tickets jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare o ringside_private.orders;t jsonb;pos integer;
begin
  if p_payment is null then raise exception 'Missing payment reference';end if;
  perform pg_advisory_xact_lock(hashtextextended(p_payment,0));
  select * into o from ringside_private.orders where id=p_order for update;
  if not found or o.stripe_session_id is distinct from p_session or p_amount is distinct from o.total_pence or p_currency is distinct from o.currency or p_payment is null or o.receipt_hash is null then raise exception 'Payment does not match booking';end if;
  if exists(select 1 from ringside_private.stripe_events where id=p_notification) then return jsonb_build_object('status','duplicate');end if;
  -- Refund notifications can arrive before payment-completed notifications.
  if exists(select 1 from ringside_private.refunded_payments where payment_id=p_payment) then
    update ringside_private.orders set status=case when (select fully_refunded from ringside_private.refunded_payments where payment_id=p_payment) then 'refunded' else 'paid' end,
      stripe_payment_intent_id=p_payment,requires_review=not (select fully_refunded from ringside_private.refunded_payments where payment_id=p_payment) where id=o.id;
    insert into ringside_private.stripe_events(id,event_type) values(p_notification,p_type);
    return jsonb_build_object('status','payment_refunded');
  end if;
  if o.status='paid' then
    if o.stripe_payment_intent_id is distinct from p_payment then raise exception 'Payment does not match paid booking';end if;
    insert into ringside_private.stripe_events(id,event_type) values(p_notification,p_type);return jsonb_build_object('status','already_paid');
  end if;
  if o.status<>'pending' then raise exception 'Booking is no longer pending';end if;
  if jsonb_typeof(p_tickets) is distinct from 'array' or jsonb_array_length(p_tickets) is distinct from o.quantity then raise exception 'Incorrect number of tickets';end if;
  for t,pos in select value,ordinality::integer-1 from jsonb_array_elements(p_tickets) with ordinality loop
    if t->>'name' is distinct from o.attendees->pos->>'name' or t->>'token_hash' is null or t->>'id' is null then raise exception 'Attendee mismatch';end if;
    insert into ringside_private.tickets(id,order_id,attendee_name,category,token_hash) values((t->>'id')::uuid,o.id,t->>'name',o.event_snapshot->>'category',t->>'token_hash');
  end loop;
  update ringside_private.orders set status='paid',paid_at=now(),stripe_payment_intent_id=p_payment where id=o.id;
  insert into ringside_private.stripe_events(id,event_type) values(p_notification,p_type);
  insert into ringside_private.email_jobs(deduplication_key,purpose,order_id,template_key) values('ticket-order-'||o.id,'ticket',o.id,'ticket-delivery-v1') on conflict(deduplication_key) do nothing;
  return jsonb_build_object('status','issued');
end $$;

create function public.ringside_expire_checkout(p_notification text,p_session text) returns void
language plpgsql security definer set search_path='' as $$
declare o ringside_private.orders;
begin
  select * into o from ringside_private.orders where stripe_session_id=p_session for update;
  if not found then return;end if;
  if exists(select 1 from ringside_private.stripe_events where id=p_notification) then return;end if;
  update ringside_private.orders set status='expired' where id=o.id and status='pending';
  insert into ringside_private.stripe_events(id,event_type) values(p_notification,'checkout.session.expired');
end $$;

create function public.ringside_refund_order(p_notification text,p_payment text,p_full boolean) returns void
language plpgsql security definer set search_path='' as $$
declare o ringside_private.orders;
begin
  if p_payment is null or p_full is null then raise exception 'Missing refund reference';end if;
  perform pg_advisory_xact_lock(hashtextextended(p_payment,0));
  if exists(select 1 from ringside_private.stripe_events where id=p_notification) then return;end if;
  insert into ringside_private.refunded_payments(payment_id,fully_refunded) values(p_payment,p_full)
    on conflict(payment_id) do update set fully_refunded=ringside_private.refunded_payments.fully_refunded or excluded.fully_refunded;
  select * into o from ringside_private.orders where stripe_payment_intent_id=p_payment for update;
  -- Partial refunds need an organiser to identify which admissions remain valid.
  update ringside_private.orders set status=case when p_full then 'refunded' else status end,requires_review=not p_full where id=o.id;
  update ringside_private.tickets set status='revoked' where order_id=o.id;
  insert into ringside_private.stripe_events(id,event_type) values(p_notification,case when p_full then 'charge.refunded' else 'charge.partially_refunded.review_required' end);
end $$;

create function public.ringside_receipt(p_hash text) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('reference',o.id,'event',e.title,'venue',e.venue,'startsAt',e.starts_at,'eventStatus',e.status,'purchasedEvent',o.event_snapshot,'totalPence',o.total_pence,
    'tickets',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.attendee_name,'category',t.category,'status',t.status) order by t.created_at,t.id) from ringside_private.tickets t where t.order_id=o.id),'[]'::jsonb))
  from ringside_private.orders o join ringside_private.events e on e.id=o.event_id
  where o.receipt_hash=p_hash and o.status='paid' and not o.requires_review;
$$;

revoke all on function public.ringside_ticket_catalog(),public.ringside_reserve_order(uuid,uuid,text,jsonb),public.ringside_attach_checkout(uuid,text,text),public.ringside_fulfillment_order(uuid),public.ringside_fulfill_order(text,text,uuid,text,text,integer,text,jsonb),public.ringside_expire_checkout(text,text),public.ringside_refund_order(text,text,boolean),public.ringside_receipt(text) from public,anon,authenticated;
grant execute on function public.ringside_ticket_catalog(),public.ringside_reserve_order(uuid,uuid,text,jsonb),public.ringside_attach_checkout(uuid,text,text),public.ringside_fulfillment_order(uuid),public.ringside_fulfill_order(text,text,uuid,text,text,integer,text,jsonb),public.ringside_expire_checkout(text,text),public.ringside_refund_order(text,text,boolean),public.ringside_receipt(text) to service_role;
commit;
