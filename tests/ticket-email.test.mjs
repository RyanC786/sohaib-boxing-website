import test from 'node:test';
import assert from 'node:assert/strict';
import {ticketMessage,deliverTickets} from '../server/ticket-email.mjs';
const config={ticketKey:'1'.repeat(64),origin:'https://boxing.test',from:'Tickets <tickets@boxing.test>',emailKey:'test-only'};
test('ticket email contains a private printable QR link and escapes event wording',()=>{
  const message=ticketMessage({orderId:'test-order',email:'buyer@example.test',title:'Fight <script>alert(1)</script>'},config);
  assert.match(message.text,/https:\/\/boxing.test\/ticket\/#receipt=[A-Za-z0-9_-]{43}/);
  assert.equal(message.html.includes('<script>'),false);assert.match(message.text,/Bring ID/);
  assert.deepEqual(message.to,['buyer@example.test']);
});
test('email retries preserve provider idempotency and refunded orders cannot send tickets',async()=>{
  const outcomes=[],sent=[];
  const db={async rpc(name,args){if(name==='ringside_claim_ticket_emails')return {data:[{id:'job-paid',orderId:'paid-order',email:'buyer@example.test',title:'Test only',paid:true},{id:'job-refund',orderId:'refunded-order',email:'other@example.test',title:'Test only',paid:false}]};outcomes.push(args);return {data:null};}};
  const send=async(url,options)=>{sent.push(options);return new Response(JSON.stringify({id:'email-test'}),{status:200,headers:{'Content-Type':'application/json'}});};
  const result=await deliverTickets(db,config,send);assert.deepEqual(result,{sent:1,retry:0,suppressed:1});assert.equal(sent.length,1);
  assert.equal(sent[0].headers['Idempotency-Key'],'ringside-ticket-job-paid');assert.equal(outcomes.find(o=>o.p_id==='job-refund').p_status,'suppressed');
  await deliverTickets(db,config,async()=>{throw Error('network uncertain');});assert.equal(outcomes.findLast(o=>o.p_id==='job-paid').p_status,'retry');
});

test('cancellation email includes event-specific details and options without claiming a refund or sending an admission invitation',()=>{
  const message=ticketMessage({id:'notice',purpose:'event_change',eventStatus:'cancelled',orderId:'test-order',email:'buyer@example.test',title:'Glasgow fight night',totalPence:25000,category:'VIP',attendees:[{name:'Test Guest'}],event:{startsAt:'2030-10-24T18:00:00Z',venue:'Test venue',promoter:'Test promoter',cancellationReason:'Venue <unavailable>',customerMessage:'Contact us to arrange the next step.',refundPolicy:'Request a refund from the organiser.',transferPolicy:'An optional transfer needs your agreement.',contactEmail:'organiser@example.test',contactPhone:'+441234567890'}},config);
  assert.match(message.subject,/^Cancelled/);for(const detail of ['EVENT CANCELLED','Test venue','Test promoter','Test Guest','£250.00','Venue <unavailable>','organiser@example.test','optional transfer'])assert.ok(message.text.includes(detail));
  assert.equal(message.html.includes('<unavailable>'),false);assert.match(message.html,/Venue &lt;unavailable&gt;/);assert.equal(message.text.includes('refund has been processed'),false);
});

test('fighter withdrawal emails say the event continues, and new booking confirmations disclose the change',()=>{
  const job={orderId:'test-order',email:'buyer@example.test',title:'Glasgow boxing',eventStatus:'scheduled',event:{fighter:'Sohaib Mohammed',fighterStatus:'withdrawn',fighterNotice:'Sohaib Mohammed has withdrawn due to injury and will not be fighting.',fighterChangePolicy:'Contact the organiser to discuss your booking options.'}};
  const update=ticketMessage({...job,purpose:'event_change'},config);
  assert.match(update.subject,/^Fighter update/);assert.match(update.text,/withdrawn due to injury/);assert.match(update.text,/event is still going ahead as scheduled/);assert.equal(update.text.includes('EVENT CANCELLED'),false);assert.equal(update.text.includes('Admission is closed'),false);
  const confirmation=ticketMessage({...job,purpose:'ticket'},config);assert.match(confirmation.subject,/Your QR tickets/);assert.match(confirmation.text,/withdrawn due to injury/);assert.match(confirmation.text,/booking options/);
});
