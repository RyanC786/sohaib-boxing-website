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
  let destination;
  globalThis.fetch=async(url,options)=>{
    assert.match(String(url),/\/auth\/v1\/recover/);
    destination=new URL(url).searchParams.get('redirect_to');
    return new Response(JSON.stringify({msg:'email provider unavailable',code:'unexpected_failure'}),{status:500,headers:{'Content-Type':'application/json'}});
  };
  try{
    const response=await auth(new Request('https://boxing.test/api/door/auth',{method:'POST',headers:{origin:'https://boxing.test','Content-Type':'application/json'},body:JSON.stringify({action:'recover',email:'owner@example.test'})}));
    assert.equal(destination,'https://boxing.test/door/?next=admin');assert.equal(response.status,503);
    assert.match((await response.json()).error,/could not be sent/);
    const invalid=await auth(new Request('https://boxing.test/api/door/auth',{method:'POST',headers:{origin:'https://boxing.test','Content-Type':'application/json'},body:JSON.stringify({action:'email-link',type:'signup',access_token:'x',refresh_token:'y'})}));
    assert.equal(invalid.status,400);assert.equal(invalid.headers.has('Set-Cookie'),false);
  }finally{globalThis.fetch=originalFetch;process.env=saved;}
});
