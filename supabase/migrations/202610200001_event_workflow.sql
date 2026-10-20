-- One transaction publishes CMS content, event/inventory changes and notification outbox.
begin;
alter table ringside_private.events add column content jsonb,add column revision integer not null default 0,add column updated_at timestamptz not null default now();
alter table ringside_private.email_jobs add column event_id uuid references ringside_private.events(id),add column event_revision integer,add column delivery_payload jsonb;
create table ringside_private.website_state(singleton boolean primary key default true check(singleton),state jsonb not null);
create table ringside_private.event_versions(event_id uuid references ringside_private.events(id),revision integer,content jsonb not null,published_by uuid references auth.users(id),created_at timestamptz not null default now(),primary key(event_id,revision));
create table ringside_private.booking_requests(id uuid primary key default gen_random_uuid(),order_id uuid not null references ringside_private.orders(id),kind text not null check(kind in ('refund','transfer')),message text not null default '',status text not null default 'requested' check(status in ('requested','in_progress','resolved')),organiser_note text not null default '',created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(order_id));
alter table ringside_private.website_state enable row level security;
alter table ringside_private.event_versions enable row level security;
alter table ringside_private.booking_requests enable row level security;
revoke all on ringside_private.website_state,ringside_private.event_versions,ringside_private.booking_requests from public,anon,authenticated;
grant all on ringside_private.website_state,ringside_private.event_versions,ringside_private.booking_requests to service_role;

create function ringside_private.editor_role() returns text language plpgsql stable security definer set search_path='' as $$
declare r text;begin
  if coalesce(auth.jwt()->>'aal','')<>'aal2' then raise exception 'Verify your authenticator first';end if;
  select role into r from ringside_private.staff where user_id=auth.uid() and active and role in ('owner','editor');
  if r is null then raise exception 'Not authorised';end if;return r;
end $$;
revoke all on function ringside_private.editor_role() from public,anon,authenticated;

create function public.ringside_website_read(p_admin boolean default false) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare s jsonb;begin
  if p_admin then perform ringside_private.editor_role();end if;
  select state into s from ringside_private.website_state where singleton;
  if s is null then return null;end if;
  if p_admin then return s;end if;
  return (s->'published')||jsonb_build_object('eventNotices',coalesce((select jsonb_agg(v.content||jsonb_build_object('updatedAt',v.updated_at) order by v.updated_at desc) from (select content,updated_at from ringside_private.events where content is not null and (status in ('cancelled','postponed') or content->>'fighterStatus'='withdrawn') order by updated_at desc limit 10) v),'[]'::jsonb));
end $$;

create function public.ringside_website_seed(p_state jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare s jsonb;begin
  perform ringside_private.editor_role();
  if octet_length(p_state::text)>1000000 or p_state->'draft'->>'version'<>'1' then raise exception 'Invalid website backup';end if;
  insert into ringside_private.website_state(state) values(p_state) on conflict do nothing;
  select state into s from ringside_private.website_state where singleton;return s;
end $$;

create function ringside_private.event_notice_payload(p_order uuid,p_event jsonb,p_status text) returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('orderId',o.id,'email',o.buyer_email,'paid',o.status='paid','title',coalesce(p_event->>'title',e.title),'eventStatus',p_status,
    'event',coalesce(p_event,e.content,'{}'::jsonb)||jsonb_build_object('title',coalesce(p_event->>'title',e.title),'venue',coalesce(p_event->>'venue',e.venue),'startsAt',coalesce((p_event->>'startsAt')::timestamptz,e.starts_at)),
    'totalPence',o.total_pence,'attendees',coalesce(o.attendees,'[]'::jsonb),'category',coalesce(o.event_snapshot->>'category','Ticket'),'purchasedEvent',o.event_snapshot)
  from ringside_private.orders o join ringside_private.events e on e.id=o.event_id where o.id=p_order;
$$;
revoke all on function ringside_private.event_notice_payload(uuid,jsonb,text) from public,anon,authenticated;

create function ringside_private.queue_event_notices(p_event uuid,p_revision integer) returns void language plpgsql security definer set search_path='' as $$
declare ev ringside_private.events;begin
  select * into ev from ringside_private.events where id=p_event;
  -- Suppress only untouched notices. Started attempts keep their frozen body for provider idempotency.
  update ringside_private.email_jobs set status='suppressed' where event_id=p_event and purpose='event_change' and status='pending' and attempts=0;
  insert into ringside_private.email_jobs(deduplication_key,purpose,order_id,event_id,event_revision,template_key,delivery_payload)
    select 'event-'||p_event||'-'||p_revision||'-'||o.id,'event_change',o.id,p_event,p_revision,
      case when ev.status='cancelled' then 'event-cancelled-v1' when ev.content->>'fighterStatus'='withdrawn' then 'fighter-withdrawn-v1' else 'event-updated-v1' end,
      ringside_private.event_notice_payload(o.id,ev.content,ev.status)
    from ringside_private.orders o where o.event_id=p_event and o.status='paid' and o.buyer_email is not null
    on conflict(deduplication_key) do nothing;
end $$;
revoke all on function ringside_private.queue_event_notices(uuid,integer) from public,anon,authenticated;

create function public.ringside_website_change(p_revision text,p_action text,p_content jsonb default null,p_version text default null) returns jsonb
language plpgsql security definer set search_path='' as $$
declare s jsonb;d jsonb;ev jsonb;t jsonb;old ringside_private.events;eid uuid;ts timestamptz;st text;role_name text;cat uuid;reserved bigint;changed boolean;notify boolean;
begin
  role_name=ringside_private.editor_role();
  select state into s from ringside_private.website_state where singleton for update;
  if s is null then raise exception 'Import the existing website first';end if;
  if s->>'revision' is distinct from p_revision then raise exception 'Someone saved a newer version. Reload before saving.';end if;
  if p_action='save' then
    if p_content is null or octet_length(p_content::text)>500000 or p_content->>'version'<>'1' or jsonb_typeof(p_content->'event')<>'object' or jsonb_typeof(p_content->'tickets')<>'array' then raise exception 'Invalid content';end if;
    s=jsonb_set(s,'{draft}',p_content);s=jsonb_set(s,'{savedAt}',to_jsonb(now()));
  elsif p_action='restore' then
    select h->'content' into d from jsonb_array_elements(s->'history') h where h->>'id'=p_version limit 1;
    if d is null then raise exception 'Version not found';end if;s=jsonb_set(s,'{draft}',d);
  elsif p_action='publish' then
    d=s->'draft';ev=d->'event';eid=(ev->>'id')::uuid;st=ev->>'status';
    if st not in ('scheduled','postponed','cancelled','sold out','completed') then raise exception 'Choose a publishable event status';end if;
    ts=((ev->>'date')||' '||(ev->>'time'))::timestamp at time zone 'Europe/London';
    if length(trim(ev->>'title')) not between 1 and 1000 or length(trim(ev->>'venue')) not between 1 and 1000 or ts is null or eid is null or jsonb_array_length(d->'tickets') not between 1 and 12 then raise exception 'Complete the event details';end if;
    if (ev->>'scanOpenMinutesBefore')::integer not between 0 and 240 or (ev->>'scanDurationMinutes')::integer not between 1 and 1440 then raise exception 'Check the admission window';end if;
    if st in ('cancelled','postponed') and (coalesce(length(trim(ev->>'cancellationReason')),0)<5 or coalesce(length(trim(ev->>'customerMessage')),0)<10 or coalesce(length(trim(ev->>'refundPolicy')),0)<10) then raise exception 'Add the reason, customer instructions and refund policy before publishing this notice';end if;
    if coalesce(ev->>'fighterStatus','') not in ('confirmed','withdrawn') then raise exception 'Choose the fighter participation status';end if;
    if ev->>'fighterStatus'='withdrawn' and (coalesce(length(trim(ev->>'fighterNotice')),0)<10 or coalesce(length(trim(ev->>'fighterChangePolicy')),0)<10) then raise exception 'Add the fighter withdrawal notice and ticket-holder options';end if;
    if role_name<>'owner' and ((d->'event') is distinct from (s->'published'->'event') or (d->'tickets') is distinct from (s->'published'->'tickets')) then raise exception 'An owner must publish event, price or cancellation changes';end if;
    ev=ev||jsonb_build_object('startsAt',ts,'contactPhone',d->'contact'->>'phone','posterURL',d->'media'->'b075c7a3-0007-49c9-ab43-9ce1fa01ba54.jpeg'->>'url','ticketOptions',d->'tickets');
    select * into old from ringside_private.events where id=eid for update;
    if found and old.status in ('cancelled','completed') and st<>old.status then raise exception 'This event is closed. Create a new event instead of reusing sold tickets';end if;
    changed=old.content is distinct from ev;
    notify=old.content is not null and (old.content-array['emailWelcome','arrivalInfo','bookingURL','tagline','ticketOptions','posterURL']) is distinct from (ev-array['emailWelcome','arrivalInfo','bookingURL','tagline','ticketOptions','posterURL']);
    insert into ringside_private.events(id,title,venue,starts_at,scan_opens_at,scan_closes_at,status,content,revision,updated_at)
      values(eid,ev->>'title',ev->>'venue',ts,ts-(ev->>'scanOpenMinutesBefore')::integer*interval '1 minute',ts+(ev->>'scanDurationMinutes')::integer*interval '1 minute',case when st='sold out' then 'scheduled' else st end,ev,1,now())
      on conflict(id) do update set title=excluded.title,venue=excluded.venue,starts_at=excluded.starts_at,
        scan_opens_at=excluded.scan_opens_at,scan_closes_at=excluded.scan_closes_at,status=excluded.status,content=excluded.content,
        revision=ringside_private.events.revision+case when changed then 1 else 0 end,updated_at=case when changed then now() else ringside_private.events.updated_at end;
    -- Removed categories stay in the audit trail but stop selling.
    update ringside_private.ticket_categories set enabled=false where event_id=eid;
    for t in select value from jsonb_array_elements(d->'tickets') loop
      cat=(t->>'id')::uuid;
      if exists(select 1 from ringside_private.ticket_categories where id=cat and event_id<>eid) then raise exception 'Category belongs to another event';end if;
      if (t->>'capacity')::integer not between 1 and 100000 or (t->>'price')::numeric not between 0 and 10000 or round((t->>'price')::numeric*100)<>(t->>'price')::numeric*100 or coalesce(length(trim(t->>'name')),0)<1 then raise exception 'Invalid ticket category';end if;
      select coalesce(sum(quantity),0) into reserved from ringside_private.orders where category_id=cat and status in ('pending','paid');
      if (t->>'capacity')::integer<reserved then raise exception 'Capacity cannot be lower than tickets already sold or reserved';end if;
      if (t->>'price')::numeric>0 then
        insert into ringside_private.ticket_categories(id,event_id,name,price_pence,capacity,enabled) values(cat,eid,t->>'name',round((t->>'price')::numeric*100)::integer,(t->>'capacity')::integer,st='scheduled' and coalesce((t->>'enabled')::boolean,false))
          on conflict(id) do update set name=excluded.name,price_pence=excluded.price_pence,capacity=excluded.capacity,enabled=excluded.enabled;
      elsif coalesce((t->>'enabled')::boolean,false) then raise exception 'Paid tickets need a positive price';end if;
    end loop;
    if changed then
      insert into ringside_private.event_versions(event_id,revision,content,published_by) select eid,revision,content,auth.uid() from ringside_private.events where id=eid;
    end if;
    if notify then perform ringside_private.queue_event_notices(eid,(select revision from ringside_private.events where id=eid));end if;
    -- Preserve previously published event records when the next event is created.
    s=jsonb_set(s,'{history}',coalesce((select jsonb_agg(h) from (select value h from jsonb_array_elements(jsonb_build_array(jsonb_build_object('id',s->>'revision','date',s->'publishedAt','content',s->'published'))||coalesce(s->'history','[]'::jsonb)) with ordinality where ordinality<=10) v),'[]'::jsonb));
    s=jsonb_set(s,'{published}',d||jsonb_build_object('updatedAt',now()));s=jsonb_set(s,'{publishedAt}',to_jsonb(now()));
  else raise exception 'Unknown operation';end if;
  s=jsonb_set(s,'{revision}',to_jsonb(gen_random_uuid()::text));update ringside_private.website_state set state=s where singleton;return s;
end $$;

-- A payment that completes after cancellation still receives the cancellation notice.
create function ringside_private.notify_late_payment() returns trigger language plpgsql security definer set search_path='' as $$
declare ev ringside_private.events;begin
  if new.status='paid' and (tg_op='INSERT' or old.status is distinct from 'paid') then
    select * into ev from ringside_private.events where id=new.event_id for share;
    if ev.status in ('cancelled','postponed') then
      insert into ringside_private.email_jobs(deduplication_key,purpose,order_id,event_id,event_revision,template_key,delivery_payload)
        values('event-'||ev.id||'-'||ev.revision||'-'||new.id,'event_change',new.id,ev.id,ev.revision,case when ev.status='cancelled' then 'event-cancelled-v1' when ev.content->>'fighterStatus'='withdrawn' then 'fighter-withdrawn-v1' else 'event-updated-v1' end,ringside_private.event_notice_payload(new.id,ev.content,ev.status)) on conflict do nothing;
    end if;
  end if;return new;
end $$;
revoke all on function ringside_private.notify_late_payment() from public,anon,authenticated;
create trigger paid_event_notice after insert or update of status on ringside_private.orders for each row execute function ringside_private.notify_late_payment();

create or replace function public.ringside_claim_ticket_emails(p_lease uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare jobs jsonb;begin
  update ringside_private.email_jobs set status='failed',last_error='delivery_review_required' where purpose in ('ticket','event_change') and status='pending' and (attempts>=8 or first_attempt_at<now()-interval '23 hours') and (lease_until is null or lease_until<now());
  with picked as (select id from ringside_private.email_jobs where purpose in ('ticket','event_change') and status='pending' and next_attempt_at<=now() and (lease_until is null or lease_until<now()) order by created_at for update skip locked limit 5),claimed as (
    update ringside_private.email_jobs j set lease=p_lease,lease_until=now()+interval '3 minutes',attempts=attempts+1,first_attempt_at=coalesce(first_attempt_at,now()),
      delivery_payload=coalesce(j.delivery_payload,ringside_private.event_notice_payload(j.order_id,e.content,e.status))
    from picked p,ringside_private.orders o,ringside_private.events e where j.id=p.id and o.id=j.order_id and e.id=o.event_id returning j.*
  ) select coalesce(jsonb_agg(j.delivery_payload||jsonb_build_object('id',j.id,'purpose',j.purpose,'template',j.template_key,
      'paid',o.status='paid' and (j.purpose='event_change' or not o.requires_review),
      'sendable',(j.purpose='event_change' or e.status='scheduled') and not exists(select 1 from ringside_private.email_suppressions x where x.email_hash=encode(extensions.digest(lower(trim(o.buyer_email)),'sha256'),'hex') and x.reason in ('hard_bounce','complaint')))),'[]'::jsonb)
    into jobs from claimed j join ringside_private.orders o on o.id=j.order_id join ringside_private.events e on e.id=o.event_id;
  return jobs;
end $$;

create function public.ringside_event_office() returns jsonb language plpgsql stable security definer set search_path='' as $$
begin perform ringside_private.editor_role();return jsonb_build_object('events',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'event',e.content,'revision',e.revision,
  'tickets',(select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'price',c.price_pence/100.0,'capacity',c.capacity,'enabled',c.enabled,'desc','','detail','')) from ringside_private.ticket_categories c where c.event_id=e.id),
  'paidOrders',(select count(*) from ringside_private.orders o where o.event_id=e.id and o.status='paid'),
  'deliveries',(select jsonb_build_object('pending',count(*) filter(where j.status='pending'),'sent',count(*) filter(where j.status='sent'),'failed',count(*) filter(where j.status='failed')) from ringside_private.email_jobs j join ringside_private.orders o on o.id=j.order_id where o.event_id=e.id)) order by e.starts_at desc) from ringside_private.events e where e.content is not null),'[]'::jsonb),
  'requests',case when ringside_private.editor_role()='owner' then coalesce((select jsonb_agg(jsonb_build_object('id',r.id,'orderId',r.order_id,'event',e.title,'email',o.buyer_email,'kind',r.kind,'message',r.message,'status',r.status,'note',r.organiser_note,'createdAt',r.created_at) order by r.created_at desc) from ringside_private.booking_requests r join ringside_private.orders o on o.id=r.order_id join ringside_private.events e on e.id=o.event_id),'[]'::jsonb) else '[]'::jsonb end);end $$;

create function public.ringside_booking_request(p_hash text,p_kind text,p_message text) returns jsonb language plpgsql security definer set search_path='' as $$
declare oid uuid;rid uuid;begin
  if p_kind not in ('refund','transfer') or length(p_message)>2000 then raise exception 'Invalid request';end if;
  select id into oid from ringside_private.orders where receipt_hash=p_hash and status='paid';
  if oid is null then raise exception 'Booking unavailable';end if;
  insert into ringside_private.booking_requests(order_id,kind,message) values(oid,p_kind,p_message) on conflict(order_id) do nothing returning id into rid;
  return jsonb_build_object('status','requested','message','Your request is recorded. Contact the organiser with your booking reference if you need to change it. A request does not confirm a refund or replacement ticket.');
end $$;
create function public.ringside_booking_request_update(p_id uuid,p_status text,p_note text) returns jsonb language plpgsql security definer set search_path='' as $$
begin if ringside_private.editor_role()<>'owner' then raise exception 'Owner access required';end if;
  if p_status not in ('requested','in_progress','resolved') or length(p_note)>2000 then raise exception 'Invalid request update';end if;
  update ringside_private.booking_requests set status=p_status,organiser_note=p_note,updated_at=now() where id=p_id;
  if not found then raise exception 'Request not found';end if;return jsonb_build_object('ok',true);
end $$;

create or replace function public.ringside_receipt(p_hash text) returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('reference',o.id,'event',e.title,'venue',e.venue,'startsAt',e.starts_at,'eventStatus',e.status,'eventDetails',e.content,'purchasedEvent',o.event_snapshot,'totalPence',o.total_pence,
    'request',(select jsonb_build_object('kind',r.kind,'status',r.status) from ringside_private.booking_requests r where r.order_id=o.id),
    'tickets',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'name',t.attendee_name,'category',t.category,'status',case when e.status in ('cancelled','postponed','completed') then 'event_'||e.status else t.status end) order by t.created_at,t.id) from ringside_private.tickets t where t.order_id=o.id),'[]'::jsonb))
  from ringside_private.orders o join ringside_private.events e on e.id=o.event_id where o.receipt_hash=p_hash and o.status='paid' and not o.requires_review;
$$;
create function ringside_private.snapshot_booking_terms() returns trigger language plpgsql security definer set search_path='' as $$
begin new.event_snapshot=coalesce((select content from ringside_private.events where id=new.event_id),'{}'::jsonb)||coalesce(new.event_snapshot,'{}'::jsonb);return new;end $$;
revoke all on function ringside_private.snapshot_booking_terms() from public,anon,authenticated;
create trigger booking_terms before insert on ringside_private.orders for each row execute function ringside_private.snapshot_booking_terms();
create or replace function public.ringside_ticket_catalog() returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'eventId',e.id,'revision',e.revision,'event',e.title,'venue',e.venue,'startsAt',e.starts_at,'name',c.name,'pricePence',c.price_pence,
    'refundPolicy',e.content->>'refundPolicy','transferPolicy',e.content->>'transferPolicy','fighterStatus',e.content->>'fighterStatus','fighterNotice',e.content->>'fighterNotice','fighterChangePolicy',e.content->>'fighterChangePolicy',
    'available',greatest(c.capacity-coalesce((select sum(o.quantity) from ringside_private.orders o where o.category_id=c.id and o.status in ('pending','paid')),0),0)) order by e.starts_at,c.price_pence),'[]'::jsonb)
  from ringside_private.ticket_categories c join ringside_private.events e on e.id=c.event_id where c.enabled and e.status='scheduled' and e.starts_at>now();
$$;
create function public.ringside_reserve_current(p_request uuid,p_category uuid,p_email text,p_attendees jsonb,p_revision integer) returns jsonb language plpgsql security definer set search_path='' as $$
declare rev integer;begin
  select e.revision into rev from ringside_private.events e join ringside_private.ticket_categories c on c.event_id=e.id where c.id=p_category for share of e;
  if p_revision is null or rev is distinct from p_revision then raise exception 'Event details changed. Reload and review the latest terms before booking';end if;
  return public.ringside_reserve_order(p_request,p_category,p_email,p_attendees);
end $$;
revoke all on function public.ringside_reserve_current(uuid,uuid,text,jsonb,integer) from public,anon,authenticated;
grant execute on function public.ringside_reserve_current(uuid,uuid,text,jsonb,integer) to service_role;
revoke all on function public.ringside_website_read(boolean),public.ringside_website_seed(jsonb),public.ringside_website_change(text,text,jsonb,text),public.ringside_event_office(),public.ringside_booking_request(text,text,text),public.ringside_booking_request_update(uuid,text,text) from public,anon,authenticated;
grant execute on function public.ringside_website_read(boolean) to anon,authenticated;
grant execute on function public.ringside_website_seed(jsonb),public.ringside_website_change(text,text,jsonb,text),public.ringside_event_office(),public.ringside_booking_request_update(uuid,text,text) to authenticated;
grant execute on function public.ringside_booking_request(text,text,text) to service_role;
commit;
