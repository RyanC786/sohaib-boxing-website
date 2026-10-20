import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {seal,unseal,configuration,doorCookie,body} from '../server/door-auth.mjs';
import door from '../netlify/functions/door.mjs';
import auth from '../netlify/functions/door-auth.mjs';
import {cmsIdentity} from '../server/cms-auth.mjs';
import cmsSession from '../netlify/functions/session.mjs';
test('staff session is encrypted, authenticated, expires and fails closed after key rotation',()=>{
  const key=randomBytes(32).toString('hex'),tokens={access_token:'private-access-token',refresh_token:'private-refresh-token'};
  const cookie=seal(tokens,key,1000);
  assert.equal(cookie.includes(tokens.access_token),false);
  assert.deepEqual(unseal(cookie,key,1001),{...tokens,until:1000+12*3600000});
  const bytes=Buffer.from(cookie,'base64url');bytes[bytes.length-1]^=1;
  assert.equal(unseal(bytes.toString('base64url'),key,1001),null);
  assert.equal(unseal(cookie,randomBytes(32).toString('hex'),1001),null);
  assert.equal(unseal(cookie,key,1000+12*3600000),null);
  assert.match(doorCookie(cookie),/HttpOnly; Secure; SameSite=Strict/);
  assert.match(doorCookie(cookie),/Path=\/api\//);
});
test('scanner cannot activate with missing or malformed configuration',async()=>{
  assert.equal(configuration({}),null);
  assert.equal(configuration({SUPABASE_URL:'http://insecure',SUPABASE_PUBLISHABLE_KEY:'key',DOOR_SESSION_KEY:'x'.repeat(64)}),null);
  const saved={...process.env};delete process.env.SUPABASE_URL;delete process.env.DOOR_SESSION_KEY;
  try{
    assert.equal((await door(new Request('https://boxing.test/api/door/events'))).status,503);
    assert.equal((await auth(new Request('https://boxing.test/api/door/auth',{method:'POST'}))).status,503);
  }finally{process.env=saved;}
});
test('staff mutations reject foreign origins, wrong content types and oversized requests',async()=>{
  const request=(origin,contentType,payload)=>new Request('https://boxing.test/api/door/scan',{method:'POST',headers:{origin,'Content-Type':contentType},body:payload});
  await assert.rejects(body(request('https://other.test','application/json','{}')),error=>error.status===403);
  await assert.rejects(body(request('https://boxing.test','text/plain','{}')),error=>error.status===415);
  await assert.rejects(body(request('https://boxing.test','application/json','x'.repeat(8193))),error=>error.status===413);
});
test('individual account mode never falls back to a shared password when configuration is missing',async()=>{
  const saved={...process.env};process.env.AUTH_MODE='supabase';process.env.CMS_ADMIN_PASSWORD='previous-shared-password-long-enough';delete process.env.DOOR_SESSION_KEY;
  try{
    assert.equal((await cmsIdentity(new Request('https://boxing.test/api/admin/content'))).allowed,false);
    const response=await cmsSession(new Request('https://boxing.test/api/session',{method:'POST',headers:{origin:'https://boxing.test','Content-Type':'application/json'},body:JSON.stringify({password:process.env.CMS_ADMIN_PASSWORD})}));
    assert.equal(response.status,403);
  }finally{process.env=saved;}
});

test('recovery specifies the website destination and reports provider failure instead of claiming an email was sent',async()=>{
  const saved={...process.env},originalFetch=globalThis.fetch;
  Object.assign(process.env,{SUPABASE_URL:'https://project.example.test',SUPABASE_PUBLISHABLE_KEY:'test-public',DOOR_SESSION_KEY:'a'.repeat(64)});
  let destination,providerStatus=500,providerCode='unexpected_failure';
  globalThis.fetch=async(url,options)=>{
    assert.match(String(url),/\/auth\/v1\/recover/);
    destination=new URL(url).searchParams.get('redirect_to');
    return new Response(JSON.stringify({msg:'synthetic provider failure',code:providerCode}),{status:providerStatus,headers:{'Content-Type':'application/json','X-Supabase-Api-Version':'2024-01-01'}});
  };
  try{
    const response=await auth(new Request('https://boxing.test/api/door/auth',{method:'POST',headers:{origin:'https://boxing.test','Content-Type':'application/json'},body:JSON.stringify({action:'recover',email:'owner@example.test'})}));
    assert.equal(destination,'https://boxing.test/door/?next=admin');assert.equal(response.status,503);
    assert.match((await response.json()).error,/could not be sent/);
    providerStatus=429;providerCode='over_email_send_rate_limit';
    const limited=await auth(new Request('https://boxing.test/api/door/auth',{method:'POST',headers:{origin:'https://boxing.test','Content-Type':'application/json'},body:JSON.stringify({action:'recover',email:'owner@example.test'})}));
    assert.equal(limited.status,429);assert.match((await limited.json()).error,/up to one hour/);assert.equal(limited.headers.has('Set-Cookie'),false);
    providerCode='over_request_rate_limit';
    const throttled=await auth(new Request('https://boxing.test/api/door/auth',{method:'POST',headers:{origin:'https://boxing.test','Content-Type':'application/json'},body:JSON.stringify({action:'recover',email:'owner@example.test'})}));
    assert.equal(throttled.status,429);assert.match((await throttled.json()).error,/Too many recovery requests/);
    const invalid=await auth(new Request('https://boxing.test/api/door/auth',{method:'POST',headers:{origin:'https://boxing.test','Content-Type':'application/json'},body:JSON.stringify({action:'email-link',type:'signup',access_token:'x',refresh_token:'y'})}));
    assert.equal(invalid.status,400);assert.equal(invalid.headers.has('Set-Cookie'),false);
  }finally{globalThis.fetch=originalFetch;process.env=saved;}
});

test('real Supabase SDK verifies pending TOTP, rejects foreign factors and cleans up only unfinished TOTP setup',async()=>{
  const saved={...process.env},originalFetch=globalThis.fetch,key='b'.repeat(64);
  Object.assign(process.env,{SUPABASE_URL:'https://project.example.test',SUPABASE_PUBLISHABLE_KEY:'test-public',DOOR_SESSION_KEY:key});
  const jwt=aal=>[Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),Buffer.from(JSON.stringify({sub:'test-user',exp:Math.floor(Date.now()/1000)+3600,aal})).toString('base64url'),'c3ludGhldGlj'].join('.');
  let factors=[{id:'pending-factor',factor_type:'totp',status:'unverified'}],challengeCount=0,deleted=[],failCleanup=false;
  const user=()=>({id:'test-user',aud:'authenticated',email:'owner@example.test',email_confirmed_at:'2026-10-19T00:00:00Z',factors});
  const reply=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
  globalThis.fetch=async(url,options)=>{
    const path=new URL(url).pathname;
    if(path==='/auth/v1/user')return reply(user());
    if(path==='/rest/v1/rpc/ringside_access')return reply({role:'owner',mfaVerified:false});
    if(path==='/auth/v1/factors/pending-factor/challenge'){challengeCount++;return reply({id:'challenge',type:'totp',expires_at:Date.now()/1000+60});}
    if(path==='/auth/v1/factors/pending-factor/verify')return reply({access_token:jwt('aal2'),refresh_token:'synthetic-refresh',expires_in:3600,token_type:'bearer',user:user()});
    if(options.method==='DELETE'&&path.startsWith('/auth/v1/factors/')){deleted.push(path.split('/').pop());return failCleanup?reply({msg:'unavailable'},400):reply({id:deleted.at(-1)});}
    if(path==='/auth/v1/factors'&&options.method==='POST')return reply({id:'new-factor',type:'totp',totp:{qr_code:'synthetic-qr',secret:'synthetic-secret'}});
    throw Error('Unexpected synthetic provider request: '+path);
  };
  const request=data=>new Request('https://boxing.test/api/door/auth',{method:'POST',headers:{origin:'https://boxing.test','Content-Type':'application/json',cookie:'ringside_door='+seal({access_token:jwt('aal1'),refresh_token:'synthetic-refresh'},key)},body:JSON.stringify(data)});
  try{
    const verified=await auth(request({action:'verify',factorId:'pending-factor',code:'000000'}));
    assert.equal(verified.status,200);assert.equal(challengeCount,1);assert.equal(verified.headers.has('Set-Cookie'),true);
    const foreign=await auth(request({action:'verify',factorId:'another-users-factor',code:'000000'}));
    assert.equal(foreign.status,403);assert.equal(challengeCount,1);assert.equal(foreign.headers.has('Set-Cookie'),false);
    factors.push({id:'phone-factor',factor_type:'phone',status:'unverified'});
    assert.equal((await auth(request({action:'enroll'}))).status,200);assert.deepEqual(deleted,['pending-factor']);
    failCleanup=true;assert.equal((await auth(request({action:'enroll'}))).status,503);
    factors=[{id:'existing-factor',factor_type:'totp',status:'verified'}];deleted=[];
    assert.equal((await auth(request({action:'enroll'}))).status,409);assert.deepEqual(deleted,[]);
  }finally{globalThis.fetch=originalFetch;process.env=saved;}
});
