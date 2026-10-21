import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,randomBytes} from 'node:crypto';
import {PNG} from 'pngjs';
import jsQR from 'jsqr';
import {ticketToken,hashToken,verifyStripe,receipt,ticketConfiguration,stripeKeyMode,validWebhookSecret} from '../server/ticketing.mjs';
test('payment activation rejects signing-secret labels, placeholders and truncated values',()=>{
  for(const value of [undefined,'','STRIPE_WEBHOOK_SECRET','sandbox values','whsec_','whsec_...',' whsec_'+'a'.repeat(40)])assert.equal(validWebhookSecret(value),false);
  assert.equal(validWebhookSecret('whsec_'+'a'.repeat(40)),true);
});
test('webhook payment mode recognises standard and restricted keys and rejects invalid keys',()=>{
  for(const prefix of ['sk','rk'])for(const mode of ['test','live'])assert.equal(stripeKeyMode(`${prefix}_${mode}_fixture123`),mode);
  for(const key of ['',undefined,'pk_test_fixture','something','sk_test_'])assert.equal(stripeKeyMode(key),null);
});
test('QR tokens are opaque, domain-separated and reproducible for resending the same ticket',()=>{
  const key=randomBytes(32).toString('hex'),id='10000000-0000-4000-8000-000000000001';
  const token=ticketToken(id,key);assert.match(token,/^[A-Za-z0-9_-]{43}$/);assert.equal(token,ticketToken(id,key));
  assert.notEqual(token,ticketToken(id,key,'receipt'));assert.notEqual(token,ticketToken(id+'x',key));
  assert.match(hashToken(token),/^[a-f0-9]{64}$/);assert.equal(ticketConfiguration({}),null);
});
test('payment webhook verifies original bytes, rejects stale/future/tampered notifications and permits key rotation signatures',()=>{
  const now=1792400000,secret='whsec_test_fixture',raw=Buffer.from('{"id":"evt_test","type":"checkout.session.completed"}');
  const signature=createHmac('sha256',secret).update(now+'.').update(raw).digest('hex');
  const header=`t=${now},v1=${'0'.repeat(64)},v1=${signature}`;
  assert.equal(verifyStripe(raw,header,secret,now).id,'evt_test');
  assert.throws(()=>verifyStripe(Buffer.concat([raw,Buffer.from(' ')]),header,secret,now),/signature/);
  assert.throws(()=>verifyStripe(raw,header,secret,now+301),/signature/);
  assert.throws(()=>verifyStripe(raw,header,secret,now-301),/signature/);
  assert.throws(()=>verifyStripe(raw,header+',t='+now,secret,now),/signature/);
});
test('printed QR image decodes to the exact admission token and not attendee data',async()=>{
  const key=randomBytes(32).toString('hex'),id='10000000-0000-4000-8000-000000000001',downloadToken='r'.repeat(43);
  const db={async rpc(name,args){assert.equal(name,'ringside_receipt');assert.equal(args.p_hash,hashToken(downloadToken));return {data:{tickets:[{id,name:'Private attendee',category:'VIP',status:'valid'},{id:'cancelled-ticket',status:'event_cancelled'}]},error:null};}};
  const order=await receipt(db,{ticketKey:key},downloadToken),image=PNG.sync.read(Buffer.from(order.tickets[0].qr.split(',')[1],'base64'));
  const decoded=jsQR(new Uint8ClampedArray(image.data),image.width,image.height);
  assert.equal(decoded.data,ticketToken(id,key));assert.equal(decoded.data.includes('Private attendee'),false);
  assert.equal(order.tickets[1].qr,undefined);assert.equal(order.tickets[1].token,undefined);
});
