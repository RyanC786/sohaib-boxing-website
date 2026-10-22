import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {pgcrypto} from '@electric-sql/pglite/contrib/pgcrypto';
import defaults from '../dist/content-defaults.json' with {type:'json'};
import {validateContent} from '../dist/model.mjs';
import {initialState} from '../server/content-service.mjs';

// Real PostgreSQL engine, isolated in memory. Auth JWT context is simulated here;
// hosted Supabase token verification, MFA and device checks still need acceptance testing.
const ids={scanner:'10000000-0000-4000-8000-000000000001',buyer:'10000000-0000-4000-8000-000000000002',other:'10000000-0000-4000-8000-000000000003',editor:'10000000-0000-4000-8000-000000000004',event:'20000000-0000-4000-8000-000000000001',otherEvent:'20000000-0000-4000-8000-000000000002',order:'30000000-0000-4000-8000-000000000001'};
const token='a'.repeat(43),hash=createHash('sha256').update(token).digest('hex');
async function database(){
  const db=new PGlite({extensions:{pgcrypto}});
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;create schema extensions;grant usage on schema auth to authenticated,anon;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
    grant execute on all functions in schema auth to anon,authenticated;`);
  for(const file of (await fs.readdir('supabase/migrations')).sort())await db.exec(await fs.readFile('supabase/migrations/'+file,'utf8'));
  for(const [key,email] of [['scanner','staff@example.test'],['buyer','buyer@example.test'],['other','other@example.test'],['editor','editor@example.test']])await db.query('insert into auth.users values($1,$2,now())',[ids[key],email]);
  await db.query("insert into ringside_private.staff(user_id,role) values($1,'scanner'),($2,'editor')",[ids.scanner,ids.editor]);
  await db.query("insert into ringside_private.events(id,title,venue,starts_at,scan_opens_at,scan_closes_at,status) values($1,'TEST ONLY — admission','Isolated test database',now(),now()-interval '1 hour',now()+interval '1 hour','scheduled'),($2,'TEST ONLY — other event','Isolated test database',now(),now()-interval '1 hour',now()+interval '1 hour','scheduled')",[ids.event,ids.otherEvent]);
  await db.query('insert into ringside_private.event_staff values($1,$2),($1,$3)',[ids.event,ids.scanner,ids.editor]);
  await db.query("insert into ringside_private.orders(id,buyer_id,event_id,buyer_email,status,total_pence) values($1,$2,$3,'buyer@example.test','paid',25000)",[ids.order,ids.buyer,ids.event]);
  await db.query("insert into ringside_private.tickets(order_id,attendee_name,category,token_hash) values($1,'Test attendee','VIP ringside',$2)",[ids.order,hash]);
  return db;
}
async function asUser(db,user,aal='aal2',role='authenticated'){
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claims',$2,false)",[user||'',JSON.stringify({sub:user,aal})]);
  await db.exec('set role '+role);
}

test('event publishing atomically closes cancellation sales/admission, queues only its buyers and preserves earlier bookings across new events',async()=>{
  const db=await database();try{
    await db.query("update ringside_private.staff set role='owner' where user_id=$1",[ids.scanner]);
    const content=validateContent(defaults);content.event.id=ids.event;content.event.date='2030-10-24';content.tickets=[{...content.tickets[0],price:250,capacity:10,enabled:true}];
    await asUser(db,ids.scanner);
    let state=(await db.query('select public.ringside_website_seed($1) as state',[JSON.stringify(initialState(content))])).rows[0].state;
    const save=async draft=>{state=(await db.query("select public.ringside_website_change($1,'save',$2) as state",[state.revision,JSON.stringify(draft)])).rows[0].state;};
    const publish=async()=>{state=(await db.query("select public.ringside_website_change($1,'publish') as state",[state.revision])).rows[0].state;};
    await publish();const revision=state.revision;
    await assert.rejects(db.query("select public.ringside_website_change('stale','publish')"),/newer version/);
    const withdrawal=structuredClone(content);withdrawal.event.fighterStatus='withdrawn';withdrawal.event.fighterNotice='Sohaib Mohammed has withdrawn due to injury. The event is still going ahead.';
    await save(withdrawal);await publish();await db.exec('reset role');
    assert.equal((await db.query('select status from ringside_private.events where id=$1',[ids.event])).rows[0].status,'scheduled');
    const available=(await db.query('select public.ringside_ticket_catalog() as c')).rows[0].c;assert.equal(available.length,1);assert.equal(available[0].fighterStatus,'withdrawn');
    const withdrawalJobs=(await db.query("select delivery_payload from ringside_private.email_jobs where template_key='fighter-withdrawn-v1'")).rows;
    assert.equal(withdrawalJobs.length,1);assert.equal(withdrawalJobs[0].delivery_payload.eventStatus,'scheduled');
    await db.query("update ringside_private.orders set receipt_hash=$1 where id=$2",['d'.repeat(64),ids.order]);
    assert.equal((await db.query('select public.ringside_receipt($1) as r',['d'.repeat(64)])).rows[0].r.tickets[0].status,'valid');
    await db.query("update ringside_private.events set scan_opens_at=now()-interval '1 hour',scan_closes_at=now()+interval '1 hour' where id=$1",[ids.event]);
    await asUser(db,ids.scanner);assert.equal((await db.query('select public.ringside_scan($1,$2,false) as ticket',[ids.event,token])).rows[0].ticket.status,'valid');
    await asUser(db,ids.scanner);
    let cancelled=structuredClone(content);cancelled.event.status='cancelled';cancelled.event.cancellationReason='Venue unavailable';cancelled.event.customerMessage='Please contact the organiser to arrange your refund or discuss an optional transfer.';
    await asUser(db,ids.editor);await save(cancelled);await assert.rejects(publish(),/owner must publish/);
    await asUser(db,ids.scanner);await publish();
    await db.exec('reset role');
    assert.equal((await db.query('select status from ringside_private.events where id=$1',[ids.event])).rows[0].status,'cancelled');
    assert.equal((await db.query("select count(*)::int n from ringside_private.email_jobs where purpose='event_change' and status='pending'")).rows[0].n,1);
    assert.equal((await db.query('select public.ringside_ticket_catalog() as c')).rows[0].c.length,0);
    await assert.rejects(db.query('select public.ringside_reserve_order($1,$2,$3,$4)',['52000000-0000-4000-8000-000000000001',content.tickets[0].id,'new@example.test',JSON.stringify([{name:'Test guest'}])]),/Sales closed/);
    await asUser(db,ids.scanner);assert.equal((await db.query('select public.ringside_scan($1,$2,true) as t',[ids.event,token])).rows[0].t.status,'closed');
    await publish();await db.exec('reset role');assert.equal((await db.query("select count(*)::int n from ringside_private.email_jobs where purpose='event_change' and status='pending'")).rows[0].n,1);
    // A late payment gets the same cancellation notice, not a normal admission email.
    const late='32000000-0000-4000-8000-000000000001';
    await db.query("insert into ringside_private.orders(id,event_id,buyer_email,status,total_pence) values($1,$2,'late@example.test','paid',25000)",[late,ids.event]);
    const jobs=(await db.query('select public.ringside_claim_ticket_emails($1) as jobs',['81000000-0000-4000-8000-000000000001'])).rows[0].jobs;
    assert.equal(jobs.length,2);assert.ok(jobs.every(j=>j.purpose==='event_change'&&j.eventStatus==='cancelled'&&j.event.cancellationReason==='Venue unavailable'));
    // Retrying an already-started delivery keeps the originally queued wording.
    await asUser(db,ids.scanner);cancelled.event.cancellationReason='Updated cancellation explanation';await save(cancelled);await publish();
    await db.exec('reset role');assert.equal((await db.query('select delivery_payload from ringside_private.email_jobs where id=$1',[jobs[0].id])).rows[0].delivery_payload.event.cancellationReason,'Venue unavailable');
    await db.query("update ringside_private.orders set receipt_hash=$1 where id=$2",['c'.repeat(64),ids.order]);
    const receipt=(await db.query('select public.ringside_receipt($1) as r',['c'.repeat(64)])).rows[0].r;assert.equal(receipt.tickets[0].status,'event_cancelled');
    await db.query('select public.ringside_booking_request($1,$2,$3)',['c'.repeat(64),'refund','Please arrange a refund.']);
    await db.query('select public.ringside_booking_request($1,$2,$3)',['c'.repeat(64),'refund','Retry']);
    assert.equal((await db.query('select count(*)::int n from ringside_private.booking_requests')).rows[0].n,1);
    let next=structuredClone(content);next.event.id='72000000-0000-4000-8000-000000000001';next.event.title='The next boxing event';next.tickets[0].id='73000000-0000-4000-8000-000000000001';
    await asUser(db,ids.scanner);await save(next);await publish();
    await asUser(db,null,'aal1','anon');const publicContent=(await db.query('select public.ringside_website_read() as c')).rows[0].c;
    assert.equal(publicContent.event.id,next.event.id);assert.equal(publicContent.eventNotices[0].id,ids.event);assert.equal(JSON.stringify(publicContent).includes('buyer@example.test'),false);
    await assert.rejects(db.query('select public.ringside_website_read(true)'),/authenticator/);
    await assert.rejects(db.query('select public.ringside_website_change($1,$2)',[revision,'publish']),/permission denied/);
    await db.exec('reset role');assert.equal((await db.query('select event_id from ringside_private.orders where id=$1',[ids.order])).rows[0].event_id,ids.event);
    await assert.rejects(db.query('select public.ringside_reserve_current($1,$2,$3,$4,$5)',['52000000-0000-4000-8000-000000000002',next.tickets[0].id,'guest@example.test',JSON.stringify([{name:'Test guest'}]),0]),/details changed/);
    await db.query('select public.ringside_reserve_current($1,$2,$3,$4,$5)',['52000000-0000-4000-8000-000000000002',next.tickets[0].id,'guest@example.test',JSON.stringify([{name:'Test one'},{name:'Test two'}]),1]);
    await asUser(db,ids.scanner);const invalidCapacity=structuredClone(next);invalidCapacity.tickets[0].capacity=1;invalidCapacity.event.venue='Should never publish';await save(invalidCapacity);await assert.rejects(publish(),/Capacity cannot/);
    await db.exec('reset role');assert.equal((await db.query('select venue from ringside_private.events where id=$1',[next.event.id])).rows[0].venue,next.event.venue);
    await asUser(db,ids.scanner);cancelled.event.status='scheduled';await save(cancelled);await assert.rejects(publish(),/closed/);
  }finally{await db.close();}
});
test('owner manages individual staff and event access; MFA and owner protections cannot be bypassed',async()=>{
  const db=await database();try{
    await db.query("update ringside_private.staff set role='owner' where user_id=$1",[ids.scanner]);
    const manage=(action,args={})=>db.query('select public.ringside_manage_staff($1,$2,$3,$4,$5,$6)',[action,args.email||null,args.role||null,args.user||null,args.event||null,args.active??null]);
    await asUser(db,ids.scanner,'aal1');await assert.rejects(manage('grant',{email:'other@example.test',role:'scanner'}),/authenticator/);
    await asUser(db,ids.editor);await assert.rejects(manage('grant',{email:'other@example.test',role:'scanner'}),/Owner access/);
    await asUser(db,ids.scanner);await assert.rejects(manage('grant',{email:'other@example.test',role:'owner'}),/scanner or editor/);
    await assert.rejects(manage('active',{user:ids.scanner,active:false}),/non-owner/);
    await manage('grant',{email:'OTHER@example.test',role:'scanner'});
    await asUser(db,ids.other);await assert.rejects(db.query('select public.ringside_staff_office()'),/Not authorised/);
    await assert.rejects(db.query('select public.ringside_scan($1,$2,false)',[ids.event,token]),/Not authorised/);
    await asUser(db,ids.scanner);await manage('assign',{user:ids.other,event:ids.event,active:true});
    const office=(await db.query('select public.ringside_staff_office() as office')).rows[0].office;
    assert.deepEqual(office.staff.find(s=>s.id===ids.other).events,[ids.event]);
    await asUser(db,ids.other);assert.equal((await db.query('select public.ringside_scan($1,$2,false) as t',[ids.event,token])).rows[0].t.status,'valid');
    await asUser(db,ids.scanner);await manage('active',{user:ids.other,active:false});
    await asUser(db,ids.other);await assert.rejects(db.query('select public.ringside_scan($1,$2,false)',[ids.event,token]),/Not authorised/);
    await db.exec('reset role');assert.equal((await db.query('select count(*)::int n from ringside_private.staff_audit')).rows[0].n,3);
  }finally{await db.close();}
});

test('private tables enforce RLS and prevent direct access or self-promotion',async()=>{
  const db=await database();try{
    const tables=await db.query("select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='ringside_private' and c.relkind='r'");
    assert.ok(tables.rows.length>=11);assert.ok(tables.rows.every(row=>row.relrowsecurity));
    await asUser(db,null,'aal1','anon');await assert.rejects(db.query('select * from ringside_private.orders'),/permission denied/);await assert.rejects(db.query('select public.ringside_my_orders()'),/permission denied/);
    await asUser(db,ids.buyer);await assert.rejects(db.query("insert into ringside_private.staff(user_id,role) values($1,'owner')",[ids.buyer]),/permission denied/);
    const own=await db.query('select public.ringside_my_orders() as orders');assert.equal(own.rows[0].orders.length,1);
    await asUser(db,ids.other);const other=await db.query('select public.ringside_my_orders() as orders');assert.equal(other.rows[0].orders.length,0);
  }finally{await db.close();}
});
test('scanner requires active staff, MFA and event assignment; lookup does not consume',async()=>{
  const db=await database();try{
    const scan=()=>db.query('select public.ringside_scan($1,$2,false) as ticket',[ids.event,token]);
    await asUser(db,ids.scanner,'aal1');await assert.rejects(scan(),/Not authorised/);
    await asUser(db,ids.editor);await assert.rejects(scan(),/Not authorised/);
    await asUser(db,ids.other);await assert.rejects(scan(),/Not authorised/);
    await asUser(db,ids.scanner);await assert.rejects(db.query('select public.ringside_scan($1,$2,false)',[ids.otherEvent,token]),/Not authorised/);
    const first=await scan();assert.equal(first.rows[0].ticket.status,'valid');assert.equal(first.rows[0].ticket.name,'Test attendee');assert.equal('email' in first.rows[0].ticket,false);
    assert.equal((await scan()).rows[0].ticket.status,'valid');
    const events=await db.query('select public.ringside_door_events() as events');assert.equal(events.rows[0].events.length,1);
    await db.exec('reset role');await db.query('update ringside_private.staff set active=false where user_id=$1',[ids.scanner]);
    await asUser(db,ids.scanner);await assert.rejects(scan(),/Not authorised/);
  }finally{await db.close();}
});
test('only one admission succeeds; refunds, revoked and closed-event tickets are rejected',async()=>{
  const db=await database();try{
    await asUser(db,ids.scanner);
    const attempts=await Promise.all([db.query('select public.ringside_scan($1,$2,true) as ticket',[ids.event,token]),db.query('select public.ringside_scan($1,$2,true) as ticket',[ids.event,token])]);
    assert.deepEqual(attempts.map(r=>r.rows[0].ticket.status).sort(),['admitted','already_used']);
    await db.exec('reset role');assert.equal((await db.query('select count(*)::integer as n from ringside_private.admission_log')).rows[0].n,1);
    await db.query("update ringside_private.orders set status='refunded' where id=$1",[ids.order]);await asUser(db,ids.scanner);
    assert.equal((await db.query('select public.ringside_scan($1,$2,true) as ticket',[ids.event,token])).rows[0].ticket.status,'invalid');
    await db.exec('reset role');await db.query("update ringside_private.orders set status='paid' where id=$1",[ids.order]);await db.exec("update ringside_private.tickets set status='revoked'");await asUser(db,ids.scanner);
    assert.equal((await db.query('select public.ringside_scan($1,$2,true) as ticket',[ids.event,token])).rows[0].ticket.status,'invalid');
    await db.exec('reset role');await db.query("update ringside_private.events set status='cancelled' where id=$1",[ids.event]);await asUser(db,ids.scanner);
    assert.equal((await db.query('select public.ringside_scan($1,$2,true) as ticket',[ids.event,token])).rows[0].ticket.status,'closed');
  }finally{await db.close();}
});
test('marketing is pending until confirmed and withdrawal creates suppression evidence',async()=>{
  const db=await database();try{
    await asUser(db,ids.buyer);assert.equal((await db.query('select public.ringside_marketing_preference(true) as preference')).rows[0].preference.status,'pending');
    assert.equal((await db.query('select public.ringside_marketing_preference(false) as preference')).rows[0].preference.status,'unsubscribed');
    await db.exec('reset role');assert.equal((await db.query('select count(*)::integer as n from ringside_private.email_suppressions')).rows[0].n,1);
  }finally{await db.close();}
});

test('capacity and immutable order prices are server controlled; retries do not issue extra tickets',async()=>{
  const db=await database();try{
    await db.query("update ringside_private.events set starts_at=now()+interval '1 day' where id=$1",[ids.event]);
    const category='40000000-0000-4000-8000-000000000001',request='50000000-0000-4000-8000-000000000001',names=[{name:'Test guest one'},{name:'Test guest two'}];
    await db.query("insert into ringside_private.ticket_categories(id,event_id,name,price_pence,capacity,enabled) values($1,$2,'VIP ringside',25000,2,true)",[category,ids.event]);
    const reserve=()=>db.query('select public.ringside_reserve_order($1,$2,$3,$4) as booking',[request,category,'guest@example.test',JSON.stringify(names)]);
    const order=(await reserve()).rows[0].booking;assert.equal(order.unitPrice,25000);assert.equal((await reserve()).rows[0].booking.id,order.id);
    await assert.rejects(db.query('select public.ringside_reserve_order($1,$2,$3,$4)',['50000000-0000-4000-8000-000000000002',category,'another@example.test',JSON.stringify([{name:'Extra guest'}])]),/Not enough tickets/);
    await db.query('select public.ringside_attach_checkout($1,$2,$3)',[order.id,'cs_test_fixture','b'.repeat(64)]);
    const tickets=names.map((name,i)=>({id:`60000000-0000-4000-8000-00000000000${i+1}`,name:name.name,token_hash:String(i+1).repeat(64)}));
    const fulfill=(event,amount=50000)=>db.query('select public.ringside_fulfill_order($1,$2,$3,$4,$5,$6,$7,$8) as fulfillment',[event,'checkout.session.completed',order.id,'cs_test_fixture','pi_test_fixture',amount,'gbp',JSON.stringify(tickets)]);
    await assert.rejects(fulfill('evt_bad_amount',1),/Payment does not match/);
    assert.equal((await fulfill('evt_paid')).rows[0].fulfillment.status,'issued');
    assert.equal((await fulfill('evt_paid')).rows[0].fulfillment.status,'duplicate');
    assert.equal((await fulfill('evt_paid_again')).rows[0].fulfillment.status,'already_paid');
    assert.equal((await db.query('select count(*)::integer as n from ringside_private.tickets where order_id=$1',[order.id])).rows[0].n,2);
    assert.equal((await db.query('select count(*)::integer as n from ringside_private.email_jobs where order_id=$1',[order.id])).rows[0].n,1);
    await db.query("update ringside_private.ticket_categories set price_pence=30000 where id=$1",[category]);
    assert.equal((await db.query('select total_pence from ringside_private.orders where id=$1',[order.id])).rows[0].total_pence,50000);
    await asUser(db,ids.buyer);await assert.rejects(db.query('select public.ringside_receipt($1)',['b'.repeat(64)]),/permission denied/);
    await db.exec('reset role');await db.query('select public.ringside_refund_order($1,$2,$3)',['evt_refund','pi_test_fixture',true]);
    const refundedReceipt=(await db.query('select public.ringside_receipt($1) as receipt',['b'.repeat(64)])).rows[0].receipt;
    assert.equal(refundedReceipt.bookingStatus,'refunded');assert.deepEqual(refundedReceipt.tickets,[]);
    assert.equal(refundedReceipt.reference,order.id);
    assert.equal((await db.query('select public.ringside_receipt($1) as receipt',['f'.repeat(64)])).rows[0].receipt,null);
    assert.ok((await db.query('select status from ringside_private.tickets where order_id=$1',[order.id])).rows.every(t=>t.status==='revoked'));
    const lateOrder=(await db.query('select public.ringside_reserve_order($1,$2,$3,$4) as booking',['50000000-0000-4000-8000-000000000003',category,'late@example.test',JSON.stringify(names)])).rows[0].booking;
    await db.query('select public.ringside_attach_checkout($1,$2,$3)',[lateOrder.id,'cs_test_late','c'.repeat(64)]);
    await db.query('select public.ringside_refund_order($1,$2,$3)',['evt_early_refund','pi_test_early_refund',true]);
    const late=await db.query('select public.ringside_fulfill_order($1,$2,$3,$4,$5,$6,$7,$8) as result',['evt_late_paid','checkout.session.completed',lateOrder.id,'cs_test_late','pi_test_early_refund',60000,'gbp',JSON.stringify(tickets)]);
    assert.equal(late.rows[0].result.status,'payment_refunded');
    assert.equal((await db.query('select count(*)::integer as n from ringside_private.tickets where order_id=$1',[lateOrder.id])).rows[0].n,0);
    const lease='70000000-0000-4000-8000-000000000001',otherLease='70000000-0000-4000-8000-000000000002';
    const jobs=(await db.query('select public.ringside_claim_ticket_emails($1) as jobs',[lease])).rows[0].jobs;
    assert.equal(jobs.length,1);assert.equal(jobs[0].paid,false);
    assert.equal((await db.query('select public.ringside_claim_ticket_emails($1) as jobs',[otherLease])).rows[0].jobs.length,0);
    await db.query("select public.ringside_finish_ticket_email($1,$2,'sent','wrong-provider')",[jobs[0].id,otherLease]);
    assert.equal((await db.query('select status from ringside_private.email_jobs where id=$1',[jobs[0].id])).rows[0].status,'pending');
    await db.query("select public.ringside_finish_ticket_email($1,$2,'suppressed',null)",[jobs[0].id,lease]);
    assert.equal((await db.query('select status from ringside_private.email_jobs where id=$1',[jobs[0].id])).rows[0].status,'suppressed');
  }finally{await db.close();}
});
