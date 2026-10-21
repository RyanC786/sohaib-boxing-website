import test from 'node:test';
import assert from 'node:assert/strict';
import {seal} from '../server/door-auth.mjs';
import {checkoutAccess} from '../server/checkout-access.mjs';
import ticket from '../netlify/functions/ticket.mjs';

test('sandbox catalog and checkout require an MFA owner before any ticket database or Stripe call',async()=>{
  const saved={...process.env},originalFetch=globalThis.fetch,key='e'.repeat(64);
  Object.assign(process.env,{SUPABASE_URL:'https://project.example.test',SUPABASE_PUBLISHABLE_KEY:'synthetic-public',SUPABASE_SECRET_KEY:'synthetic-server',DOOR_SESSION_KEY:key,RINGSIDE_TICKET_KEY:'f'.repeat(64),STRIPE_SECRET_KEY:'sk_test_fixture',TICKETING_ENABLED:'true'});
  const jwt=[Buffer.from('{"alg":"HS256"}').toString('base64url'),Buffer.from(JSON.stringify({sub:'test-user',exp:Math.floor(Date.now()/1000)+3600,aal:'aal2'})).toString('base64url'),'c3ludGhldGlj'].join('.');
  let role='owner',mfa=true,catalogCalls=0;
  const reply=data=>new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json'}});
  globalThis.fetch=async(url)=>{
    const path=new URL(url).pathname;
    if(path==='/auth/v1/user')return reply({id:'test-user',aud:'authenticated',email:'owner@example.test',email_confirmed_at:'2026-10-19T00:00:00Z'});
    if(path==='/rest/v1/rpc/ringside_access')return reply({role,mfaVerified:mfa});
    if(path==='/rest/v1/rpc/ringside_ticket_catalog'){catalogCalls++;return reply([]);}
    throw Error('Unexpected network request: '+path);
  };
  const req=(path='catalog',signed=true)=>new Request('https://boxing.test/api/ticket/'+path,{method:path==='checkout'?'POST':'GET',headers:{origin:'https://boxing.test','Content-Type':'application/json',...(signed?{cookie:'ringside_door='+seal({access_token:jwt,refresh_token:'synthetic-refresh'},key)}:{})},...(path==='checkout'?{body:'{}'}:{})});
  try{
    for(const path of ['catalog','checkout'])assert.equal((await ticket(req(path,false))).status,401);
    assert.equal(catalogCalls,0);
    for(const deniedRole of ['scanner','editor']){role=deniedRole;for(const path of ['catalog','checkout'])assert.equal((await ticket(req(path))).status,403);}
    role='owner';mfa=false;assert.equal((await ticket(req())).status,403);assert.equal(catalogCalls,0);
    mfa=true;const catalog=await ticket(req());assert.equal(catalog.status,200);assert.equal((await catalog.json()).testMode,true);assert.ok(catalog.headers.has('Set-Cookie'));assert.equal(catalogCalls,1);
    for(const key of ['rk_test_fixture','sk_test_fixture'])assert.equal((await checkoutAccess(req(),{stripeKey:key})).testMode,true);
    for(const key of ['sk_live_fixture','rk_live_fixture'])assert.deepEqual(await checkoutAccess(req('catalog',false),{stripeKey:key}),{testMode:false,headers:{}});
    await assert.rejects(checkoutAccess(req(),{stripeKey:'invalid'}),e=>e.status===503);
  }finally{globalThis.fetch=originalFetch;process.env=saved;}
});
