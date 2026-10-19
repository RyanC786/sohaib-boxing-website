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
