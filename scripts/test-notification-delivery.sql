-- One-time authorised delivery check for Ryan's EXISTING sandbox booking.
-- Does not publish a cancellation/withdrawal or change event/admission status.
-- Tests the outbox -> scheduled worker -> Resend path only. CMS publication
-- semantics are covered separately in tests/database.test.mjs.
insert into ringside_private.email_jobs
  (deduplication_key,purpose,order_id,event_id,event_revision,template_key,delivery_payload)
select 'acceptance-notice-20261022-'||v.kind||'-'||o.id,'event_change',o.id,e.id,v.revision,v.template,
  ringside_private.event_notice_payload(o.id,
    coalesce(e.content,'{}'::jsonb)||jsonb_build_object(
      'title','TEST ONLY - Notification delivery check',
      'fighter','Test fighter','fighterStatus',v.fighter_status,
      'fighterNotice','TEST ONLY: The test fighter has withdrawn. The test event continues. This is a simulated notification.',
      'fighterChangePolicy','TEST ONLY: Contact the organiser about available options. No real event has changed.',
      'cancellationReason',case when v.kind='cancelled' then 'TEST ONLY: Simulated cancellation for email acceptance testing.' else '' end,
      'customerMessage','TEST MESSAGE ONLY. No real event has been cancelled or changed. No refund or transfer is being promised or processed by this email.',
      'refundPolicy','TEST ONLY: This delivery check does not issue a refund. Real refund requests require organiser review and applicable legal rights.',
      'transferPolicy','TEST ONLY: No transfer is being processed.'),v.event_status)
from ringside_private.orders o join ringside_private.events e on e.id=o.event_id
cross join (values
  ('withdrawn',900001,'fighter-withdrawn-v1','withdrawn','scheduled'),
  ('cancelled',900002,'event-cancelled-v1','confirmed','cancelled')
) v(kind,revision,template,fighter_status,event_status)
where o.stripe_payment_intent_id='pi_3UTHK56eqbP6UUXp1oS6xE8q'
  and o.status='paid' and lower(o.buyer_email)='ryan786w@gmail.com'
  and e.id='db7f78e0-4748-47d1-89a1-cd054f5fe4b7'
on conflict(deduplication_key) do nothing
returning template_key,status;
