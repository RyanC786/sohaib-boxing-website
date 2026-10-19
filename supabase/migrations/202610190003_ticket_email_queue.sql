begin;
alter table ringside_private.email_jobs add column lease uuid,add column lease_until timestamptz,
  add column attempts integer not null default 0,add column next_attempt_at timestamptz not null default now(),
  add column first_attempt_at timestamptz,add column last_error text;
create function public.ringside_claim_ticket_emails(p_lease uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare jobs jsonb;
begin
  update ringside_private.email_jobs set status='failed',last_error='delivery_review_required'
  where purpose='ticket' and status='pending' and (attempts>=8 or first_attempt_at<now()-interval '23 hours') and (lease_until is null or lease_until<now());
  with picked as (
    select id from ringside_private.email_jobs where purpose='ticket' and status='pending' and next_attempt_at<=now()
      and (lease_until is null or lease_until<now()) order by created_at for update skip locked limit 5
  ), claimed as (
    update ringside_private.email_jobs j set lease=p_lease,lease_until=now()+interval '3 minutes',attempts=attempts+1,first_attempt_at=coalesce(first_attempt_at,now())
      from picked p where j.id=p.id returning j.*
  ) select coalesce(jsonb_agg(jsonb_build_object('id',j.id,'orderId',o.id,'email',o.buyer_email,'paid',o.status='paid' and not o.requires_review,'title',e.title)), '[]'::jsonb)
    into jobs from claimed j join ringside_private.orders o on o.id=j.order_id join ringside_private.events e on e.id=o.event_id;
  return jobs;
end $$;
create function public.ringside_finish_ticket_email(p_id uuid,p_lease uuid,p_status text,p_provider_id text default null) returns void
language plpgsql security definer set search_path='' as $$
begin
  if p_status not in ('sent','suppressed','retry') then raise exception 'Invalid delivery result';end if;
  update ringside_private.email_jobs set status=case when p_status='retry' then 'pending' else p_status end,
    provider_message_id=case when p_status='sent' then p_provider_id else provider_message_id end,
    sent_at=case when p_status='sent' then now() else sent_at end,
    next_attempt_at=now()+interval '5 minutes',last_error=case when p_status='retry' then 'provider_unavailable' else null end,
    lease=null,lease_until=null where id=p_id and lease=p_lease and status='pending';
end $$;
revoke all on function public.ringside_claim_ticket_emails(uuid),public.ringside_finish_ticket_email(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.ringside_claim_ticket_emails(uuid),public.ringside_finish_ticket_email(uuid,uuid,text,text) to service_role;
commit;
