import test from 'node:test';
import assert from 'node:assert/strict';
import ticket from '../netlify/functions/ticket.mjs';
import {seal} from '../server/door-auth.mjs';

test('checkout uses dashboard payment methods and the reserved price, quantity and order identity',async()=>{
  const saved={...process.env},originalFetch=globalThis.fetch;
  Object.assign(process.env,{SUPABASE_URL:'https://project.example.test',SUPABASE_SECRET_KEY:'synthetic-server',RINGSIDE_TICKET_KEY:'f'.repeat(64),STRIPE_SECRET_KEY:'sk_live_fixture',STRIPE_WEBHOOK_SECRET:'whsec_'+'x'.repeat(24),PUBLIC_SITE_URL:'https://boxing.test',TICKETING_ENABLED:'true',TICKET_EMAIL_ENABLED:'true',RESEND_API_KEY:'synthetic-email',TICKET_FROM_EMAIL:'test@example.test',TURNSTILE_SECRET_KEY:'synthetic-challenge'});
  const order='11111111-1111-4111-8111-111111111111';let attached=false,stripeCalls=0;
  const reply=data=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
  globalThis.fetch=async(url,options)=>{
    const path=new URL(url).pathname;
    if(path==='/turnstile/v0/siteverify')return reply({success:true,hostname:'boxing.test',action:'booking'});
    if(path==='/rest/v1/rpc/ringside_reserve_current')return reply({id:order,status:'pending',unitPrice:25000,category:'VIP ringside',checkoutExpiresAt:new Date(Date.now()+35*60000).toISOString()});
    if(path==='/v1/checkout/sessions'){
      stripeCalls++;const params=new URLSearchParams(options.body);
      assert.equal([...params.keys()].some(key=>key.startsWith('payment_method_types')),false);
      assert.equal(params.get('line_items[0][price_data][unit_amount]'),'25000');
      assert.equal(params.get('line_items[0][quantity]'),'2');
      assert.equal(params.get('line_items[0][price_data][product_data][name]'),'VIP ringside');
      assert.equal(params.get('metadata[order_id]'),order);
      assert.equal(options.headers['Idempotency-Key'],'ringside-order-'+order);
      return reply({id:'cs_fixture',url:'https://checkout.stripe.com/c/pay/fixture'});
    }
    if(path==='/rest/v1/rpc/ringside_attach_checkout'){attached=true;return reply(null);}
    throw Error('Unexpected request '+path);
  };
  try{
    const response=await ticket(new Request('https://boxing.test/api/ticket/checkout',{method:'POST',headers:{origin:'https://boxing.test','Content-Type':'application/json'},body:JSON.stringify({requestId:order,category:order,revision:1,email:'buyer@example.test',challenge:'fixture',attendees:['First Test','Second Test']})}));
    assert.equal(response.status,200);assert.deepEqual(await response.json(),{url:'https://checkout.stripe.com/c/pay/fixture'});assert.equal(stripeCalls,1);assert.equal(attached,true);
  }finally{globalThis.fetch=originalFetch;process.env=saved;}
});

test('owner demo opens only a confirmed Stripe test session and rejects a non-test response',async()=>{
  const saved={...process.env},originalFetch=globalThis.fetch,key='d'.repeat(64);
  Object.assign(process.env,{SUPABASE_URL:'https://project.example.test',SUPABASE_PUBLISHABLE_KEY:'synthetic-public',SUPABASE_SECRET_KEY:'synthetic-server',DOOR_SESSION_KEY:key,RINGSIDE_TICKET_KEY:'f'.repeat(64),STRIPE_SECRET_KEY:'sk_test_fixture',STRIPE_WEBHOOK_SECRET:'whsec_'+'x'.repeat(24),PUBLIC_SITE_URL:'https://boxing.test',TICKETING_ENABLED:'true',TICKET_EMAIL_ENABLED:'true',RESEND_API_KEY:'synthetic-email',TICKET_FROM_EMAIL:'test@example.test',TURNSTILE_SECRET_KEY:'synthetic-challenge'});
  const jwt=[Buffer.from('{"alg":"HS256"}').toString('base64url'),Buffer.from(JSON.stringify({sub:'test-user',exp:Math.floor(Date.now()/1000)+3600,aal:'aal2'})).toString('base64url'),'c3ludGhldGlj'].join('.');
  const order='11111111-1111-4111-8111-111111111111';let attached=0,livemode=false;
  const reply=data=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
  globalThis.fetch=async(url,options)=>{
    const path=new URL(url).pathname;
    if(path==='/auth/v1/user')return reply({id:'test-user',aud:'authenticated',email:'owner@example.test',email_confirmed_at:'2026-10-19'});
    if(path==='/rest/v1/rpc/ringside_access')return reply({role:'owner',mfaVerified:true});
    if(path==='/turnstile/v0/siteverify')return reply({success:true,hostname:'boxing.test',action:'booking'});
    if(path==='/rest/v1/rpc/ringside_reserve_current')return reply({id:order,status:'pending',unitPrice:100,category:'TEST ONLY',checkoutExpiresAt:new Date(Date.now()+35*60000).toISOString()});
    if(path==='/v1/checkout/sessions'){assert.equal(options.headers.Authorization,'Bearer sk_test_fixture');return reply({id:'cs_test_fixture',livemode,url:'https://checkout.stripe.com/c/pay/cs_test_fixture'});}
    if(path==='/rest/v1/rpc/ringside_attach_checkout'){attached++;return reply(null);}
    throw Error('Unexpected request '+path);
  };
  const request=()=>new Request('https://boxing.test/api/ticket/checkout',{method:'POST',headers:{origin:'https://boxing.test','Content-Type':'application/json',cookie:'ringside_door='+seal({access_token:jwt,refresh_token:'synthetic-refresh'},key)},body:JSON.stringify({demo:true,requestId:order,category:order,revision:1,email:'owner@example.test',challenge:'fixture',attendees:['Demo Test']})});
  try{
    const result=await ticket(request());assert.equal(result.status,200);assert.match((await result.json()).url,/cs_test_/);assert.equal(attached,1);
    livemode=true;const blocked=await ticket(request());assert.equal(blocked.status,503);assert.match((await blocked.json()).error,/test checkout/);assert.equal(attached,1);
  }finally{globalThis.fetch=originalFetch;process.env=saved;}
});
