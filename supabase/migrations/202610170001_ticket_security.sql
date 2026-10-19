-- Foundation for Supabase Auth + transactional ticket admission.
-- Apply to a dedicated boxing project, then run the security tests before enabling clients.
begin;
create schema if not exists ringside_private;
revoke all on schema ringside_private from public, anon, authenticated;
grant usage on schema ringside_private to service_role;
create extension if not exists pgcrypto with schema extensions;

create table ringside_private.staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','editor','scanner')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table ringside_private.events (
  id uuid primary key default gen_random_uuid(),
  title text not null, venue text not null, starts_at timestamptz not null,
  scan_opens_at timestamptz not null, scan_closes_at timestamptz not null,
  status text not null default 'draft' check(status in ('draft','scheduled','postponed','cancelled','completed')),
  check(scan_closes_at > scan_opens_at)
);
create table ringside_private.event_staff (
  event_id uuid references ringside_private.events(id) on delete cascade,
  user_id uuid references ringside_private.staff(user_id) on delete cascade,
  primary key(event_id,user_id)
);
create table ringside_private.orders (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid references auth.users(id) on delete set null,
  event_id uuid not null references ringside_private.events(id),
  buyer_email text, stripe_session_id text unique, stripe_payment_intent_id text unique,
  status text not null default 'pending' check(status in ('pending','paid','refunded','cancelled','expired')),
  total_pence integer not null check(total_pence>=0), currency text not null default 'gbp' check(currency='gbp'),
  created_at timestamptz not null default now(), paid_at timestamptz,
  -- Set by the organiser's approved retention policy, not a hard-coded legal assumption.
  personal_data_delete_after timestamptz, legal_hold boolean not null default false,
  anonymised_at timestamptz
);
create index on ringside_private.orders(buyer_id);
create table ringside_private.tickets (
  id uuid primary key default gen_random_uuid(), order_id uuid not null references ringside_private.orders(id),
  attendee_name text, category text not null,
  token_hash text not null unique check(token_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'valid' check(status in ('valid','used','revoked')),
  used_at timestamptz, used_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check((status='used' and used_at is not null) or status<>'used')
);
create index on ringside_private.tickets(order_id);
create table ringside_private.admission_log (
  id uuid primary key default gen_random_uuid(), event_id uuid not null references ringside_private.events(id),
  ticket_id uuid not null references ringside_private.tickets(id),
  staff_id uuid references auth.users(id) on delete set null,
  action text not null check(action in ('admitted','already_used','rejected')),
  created_at timestamptz not null default now()
);
create table ringside_private.stripe_events (
  id text primary key, event_type text not null, processed_at timestamptz not null default now()
  -- Insert in the same transaction as order fulfillment; only AFTER signature verification.
);
create table ringside_private.marketing_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'unsubscribed' check(status in ('pending','subscribed','unsubscribed')),
  consent_text_version text, requested_at timestamptz, confirmed_at timestamptz,
  withdrawn_at timestamptz, review_after timestamptz,
  check(status<>'subscribed' or (confirmed_at is not null and consent_text_version is not null))
);
create table ringside_private.consent_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  action text not null check(action in ('requested','confirmed','withdrawn')),
  text_version text, source text not null, created_at timestamptz not null default now()
);
create table ringside_private.email_suppressions (
  email_hash text primary key check(email_hash ~ '^[0-9a-f]{64}$'),
  reason text not null check(reason in ('unsubscribe','complaint','hard_bounce')),
  created_at timestamptz not null default now()
  -- Normalised email SHA-256. Still personal data; access and retention remain restricted.
);
create table ringside_private.email_jobs (
  id uuid primary key default gen_random_uuid(), deduplication_key text not null unique,
  purpose text not null check(purpose in ('ticket','event_change','password_support','marketing_confirmation','marketing')),
  user_id uuid references auth.users(id) on delete set null,
  order_id uuid references ringside_private.orders(id),
  template_key text not null, status text not null default 'pending' check(status in ('pending','sent','failed','suppressed')),
  created_at timestamptz not null default now(), sent_at timestamptz, provider_message_id text
  -- A sender must re-check consent and suppressions at send time, not only when queuing.
);

-- Deny direct browser access even if someone later exposes the private schema.
do $$ declare t record; begin
  for t in select tablename from pg_tables where schemaname='ringside_private' loop
    execute format('alter table ringside_private.%I enable row level security',t.tablename);
    execute format('revoke all on ringside_private.%I from public, anon, authenticated',t.tablename);
    execute format('grant all on ringside_private.%I to service_role',t.tablename);
  end loop;
end $$;

create function ringside_private.can_scan(p_event uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select (select auth.jwt()->>'aal')='aal2' and exists(
    select 1 from ringside_private.staff s
    join ringside_private.event_staff es on es.user_id=s.user_id
    where s.user_id=(select auth.uid()) and s.active
    and s.role in ('owner','scanner') and es.event_id=p_event
  );
$$;

create function public.ringside_access() returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_build_object('role',s.role,'mfaVerified',(select auth.jwt()->>'aal')='aal2')
  from ringside_private.staff s where s.user_id=(select auth.uid()) and s.active;
$$;

create function public.ringside_scan(p_event uuid,p_token text,p_admit boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare t ringside_private.tickets; o ringside_private.orders; e ringside_private.events;
begin
  if not coalesce(ringside_private.can_scan(p_event),false) then
    raise exception 'Not authorised for this event or MFA required' using errcode='42501';
  end if;
  select * into e from ringside_private.events where id=p_event for share;
  if not found or e.status<>'scheduled' or now()<e.scan_opens_at or now()>e.scan_closes_at then
    return jsonb_build_object('status','closed');
  end if;
  if p_token is null or length(p_token)<32 or length(p_token)>256 then return jsonb_build_object('status','invalid');end if;
  -- Find the order first and lock it before the ticket. Refund writers use the same order.
  select o2.* into o from ringside_private.orders o2
    join ringside_private.tickets t2 on t2.order_id=o2.id
    where o2.event_id=p_event and t2.token_hash=encode(extensions.digest(p_token,'sha256'),'hex')
    for update of o2;
  if not found then return jsonb_build_object('status','invalid');end if;
  select * into t from ringside_private.tickets
    where order_id=o.id and token_hash=encode(extensions.digest(p_token,'sha256'),'hex') for update;
  if not found or o.status<>'paid' or t.status<>'valid' and t.status<>'used' or t.attendee_name is null then
    return jsonb_build_object('status','invalid');
  end if;
  if t.status='used' then
    return jsonb_build_object('status','already_used','usedAt',t.used_at,'name',t.attendee_name,'category',t.category);
  end if;
  if p_admit then
    update ringside_private.tickets set status='used',used_at=now(),used_by=auth.uid() where id=t.id and status='valid';
    insert into ringside_private.admission_log(event_id,ticket_id,staff_id,action) values(p_event,t.id,auth.uid(),'admitted');
  end if;
  return jsonb_build_object('status',case when p_admit then 'admitted' else 'valid' end,'name',t.attendee_name,'category',t.category);
end $$;

create function public.ringside_my_orders() returns jsonb
language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('reference',o.id,'event',e.title,'venue',e.venue,'startsAt',e.starts_at,'status',o.status,'totalPence',o.total_pence,'currency',o.currency)),'[]'::jsonb)
  from ringside_private.orders o join ringside_private.events e on e.id=o.event_id
  where o.buyer_id=(select auth.uid());
$$;

create function public.ringside_marketing_preference(p_opt_in boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare uid uuid:=auth.uid(); email text; current_status text;
begin
  if uid is null then raise exception 'Sign in required' using errcode='42501';end if;
  select lower(trim(u.email)) into email from auth.users u where u.id=uid and u.email_confirmed_at is not null;
  if email is null then raise exception 'Verified email required' using errcode='42501';end if;
  -- Serialise simultaneous preference changes for this user.
  perform pg_advisory_xact_lock(hashtextextended(uid::text,0));
  select status into current_status from ringside_private.marketing_preferences where user_id=uid;
  if p_opt_in then
    if current_status='subscribed' then return jsonb_build_object('status','subscribed');end if;
    insert into ringside_private.marketing_preferences(user_id,status,consent_text_version,requested_at)
      values(uid,'pending','boxing-email-v1',now())
      on conflict(user_id) do update set status='pending',consent_text_version='boxing-email-v1',requested_at=now(),confirmed_at=null;
    insert into ringside_private.consent_log(user_id,action,text_version,source) values(uid,'requested','boxing-email-v1','account-preferences');
    -- No automatic promotion to subscribed. A verified email-confirmation handler must do it.
    return jsonb_build_object('status','pending');
  else
    insert into ringside_private.marketing_preferences(user_id,status,withdrawn_at) values(uid,'unsubscribed',now())
      on conflict(user_id) do update set status='unsubscribed',withdrawn_at=now();
    insert into ringside_private.email_suppressions(email_hash,reason)
      values(encode(extensions.digest(email,'sha256'),'hex'),'unsubscribe') on conflict(email_hash) do nothing;
    insert into ringside_private.consent_log(user_id,action,source) values(uid,'withdrawn','account-preferences');
    return jsonb_build_object('status','unsubscribed');
  end if;
end $$;

revoke all on all functions in schema ringside_private from public,anon,authenticated;
revoke all on function public.ringside_access(),public.ringside_scan(uuid,text,boolean),public.ringside_my_orders(),public.ringside_marketing_preference(boolean) from public,anon;
grant execute on function public.ringside_access(),public.ringside_scan(uuid,text,boolean),public.ringside_my_orders(),public.ringside_marketing_preference(boolean) to authenticated;
commit;
