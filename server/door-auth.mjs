import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import {json,sameOrigin} from './auth.mjs';

const cookieName='ringside_door';
export function configuration(env=process.env){
  const url=env.SUPABASE_URL,key=env.SUPABASE_PUBLISHABLE_KEY,secret=env.DOOR_SESSION_KEY;
  if(!url||!key||!secret||! /^[a-f0-9]{64}$/i.test(secret))return null;
  try{if(new URL(url).protocol!=='https:')return null;}catch{return null;}
  return {url,key,secret};
}
export function client(config){return createClient(config.url,config.key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(12000)})}});}
export function seal(session,secret,now=Date.now()){
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.from(secret,'hex'),iv);
  const data=Buffer.from(JSON.stringify({access_token:session.access_token,refresh_token:session.refresh_token,until:now+12*3600000}));
  const encrypted=Buffer.concat([cipher.update(data),cipher.final()]);
  return Buffer.concat([iv,cipher.getAuthTag(),encrypted]).toString('base64url');
}
export function unseal(value,secret,now=Date.now()){
  try{if(!value||value.length>6000)return null;const bytes=Buffer.from(value,'base64url');
    const cipher=createDecipheriv('aes-256-gcm',Buffer.from(secret,'hex'),bytes.subarray(0,12));cipher.setAuthTag(bytes.subarray(12,28));
    const data=JSON.parse(Buffer.concat([cipher.update(bytes.subarray(28)),cipher.final()]));
    return data.until>now&&typeof data.access_token==='string'&&typeof data.refresh_token==='string'?data:null;
  }catch{return null;}
}
export const doorCookie=(value,age=43200)=>`${cookieName}=${value}; Path=/api/; HttpOnly; Secure; SameSite=Strict; Max-Age=${age}`;
export const fail=(message,status=400)=>Object.assign(new Error(message),{status});
export async function body(req){
  if(!sameOrigin(req))throw fail('Open the scanner on this website and try again.',403);
  if(!req.headers.get('content-type')?.startsWith('application/json'))throw fail('Use a JSON request.',415);
  const data=await req.text();if(data.length>8192)throw fail('Request too large.',413);
  try{return JSON.parse(data);}catch{throw fail('Invalid request.');}
}
export async function doorSession(req,config){
  const encrypted=req.headers.get('cookie')?.match(/(?:^|;\s*)ringside_door=([^;]+)/)?.[1];
  const tokens=unseal(encrypted,config.secret);if(!tokens)throw fail('Please sign in again.',401);
  const supabase=client(config);
  const {data,error}=await supabase.auth.setSession(tokens);
  if(error||!data.session)throw fail('Your session has ended. Please sign in again.',401);
  const verified=await supabase.auth.getUser();if(verified.error||!verified.data.user)throw fail('Please sign in again.',401);
  if(!verified.data.user.email_confirmed_at)throw fail('Verify your staff email before signing in.',403);
  return {supabase,user:verified.data.user,session:data.session};
}
export async function staffAccess(supabase,requireMFA=true,roles=['owner','scanner']){
  const {data,error}=await supabase.rpc('ringside_access');
  if(error)throw fail('Staff access is unavailable. Ask the organiser to check the database setup.',503);
  if(!data||!roles.includes(data.role))throw fail('This account does not have access. Ask the organiser for an invitation.',403);
  if(requireMFA&&!data.mfaVerified)throw fail('Verify your authenticator code first.',403);
  return data;
}
export function response(data,session,config,status=200){return json(data,status,session?{'Set-Cookie':doorCookie(seal(session,config.secret))}:{});}
export function errorResponse(error){return json({error:error.status?error.message:'The service is unavailable. Try again shortly.'},error.status||503);}
