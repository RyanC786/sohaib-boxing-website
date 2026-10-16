import {createHmac,createHash,timingSafeEqual,randomBytes} from 'node:crypto';
const hash=s=>createHash('sha256').update(s).digest();
export const equal=(a,b)=>timingSafeEqual(hash(a),hash(b));
export const configured=()=>typeof process.env.CMS_ADMIN_PASSWORD==='string'&&process.env.CMS_ADMIN_PASSWORD.length>=20;
export function sameOrigin(req){return req.headers.get('origin')===new URL(req.url).origin;}
export function session(){const payload=Buffer.from(JSON.stringify({expires:Date.now()+8*3600000,nonce:randomBytes(16).toString('hex')})).toString('base64url');return payload+'.'+createHmac('sha256',process.env.CMS_ADMIN_PASSWORD).update(payload).digest('base64url');}
export function authorized(req){
  if(!configured())return false;
  const token=req.headers.get('cookie')?.match(/(?:^|;\s*)ringside_admin=([^;]+)/)?.[1];if(!token)return false;
  try{const [payload,sig]=token.split('.');return equal(sig||'',createHmac('sha256',process.env.CMS_ADMIN_PASSWORD).update(payload).digest('base64url'))&&JSON.parse(Buffer.from(payload,'base64url')).expires>Date.now();}catch{return false;}
}
export const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
export const cookie=(value,maxAge=28800)=>`ringside_admin=${value}; Path=/api/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
