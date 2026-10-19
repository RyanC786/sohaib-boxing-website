import {createHash,createHmac,randomUUID,timingSafeEqual} from 'node:crypto';
import {createClient} from '@supabase/supabase-js';
import QRCode from 'qrcode';
import {fail} from './door-auth.mjs';
export const hashToken=token=>createHash('sha256').update(token).digest('hex');
export function ticketToken(id,key,purpose='admission'){
  if(!/^[a-f0-9]{64}$/i.test(key||''))throw fail('Ticket delivery is awaiting activation.',503);
  return createHmac('sha256',Buffer.from(key,'hex')).update(`ringside:${purpose}:v1:${id}`).digest('base64url');
}
export function ticketConfiguration(env=process.env){
  if(env.TICKETING_ENABLED!=='true'||!env.SUPABASE_URL||!env.SUPABASE_SECRET_KEY||! /^[a-f0-9]{64}$/i.test(env.RINGSIDE_TICKET_KEY||''))return null;
  return {url:env.SUPABASE_URL,key:env.SUPABASE_SECRET_KEY,ticketKey:env.RINGSIDE_TICKET_KEY,stripeKey:env.STRIPE_SECRET_KEY,webhookSecret:env.STRIPE_WEBHOOK_SECRET,origin:env.PUBLIC_SITE_URL};
}
export const database=config=>createClient(config.url,config.key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:(url,options)=>fetch(url,{...options,signal:AbortSignal.timeout(12000)})}});
export async function rpc(db,name,args){const result=await db.rpc(name,args);if(result.error)throw fail('The ticket service could not complete this request. Contact the organiser if payment has been taken.',503);return result.data;}
export function verifyStripe(raw,header,secret,now=Math.floor(Date.now()/1000)){
  if(!secret||typeof header!=='string'||header.length>4096)throw fail('Invalid payment signature.',400);
  const parts=header.split(',').map(part=>part.trim().split('=')),timestamps=parts.filter(p=>p[0]==='t');
  const timestamp=timestamps[0]?.[1];if(timestamps.length!==1||! /^\d+$/.test(timestamp||'')||Math.abs(now-Number(timestamp))>300)throw fail('Invalid payment signature.',400);
  const expected=createHmac('sha256',secret).update(timestamp+'.').update(raw).digest();
  const valid=parts.filter(p=>p[0]==='v1'&&/^[a-f0-9]{64}$/i.test(p[1]||'')).some(p=>timingSafeEqual(expected,Buffer.from(p[1],'hex')));
  if(!valid)throw fail('Invalid payment signature.',400);
  try{return JSON.parse(raw.toString('utf8'));}catch{throw fail('Invalid payment notification.',400);}
}
export function issuedTickets(attendees,key){return attendees.map(attendee=>{const id=randomUUID();return {id,name:attendee.name,token_hash:hashToken(ticketToken(id,key))};});}
export async function receipt(db,config,token){
  if(! /^[A-Za-z0-9_-]{43}$/.test(token||''))throw fail('This ticket link is not valid.',404);
  const order=await rpc(db,'ringside_receipt',{p_hash:hashToken(token)});
  if(!order)throw fail('Tickets are not available yet, or this link has been withdrawn. Check the booking email or contact the organiser.',404);
  order.tickets=await Promise.all(order.tickets.map(async ticket=>{
    const token=ticketToken(ticket.id,config.ticketKey);
    return {...ticket,token,qr:await QRCode.toDataURL(token,{errorCorrectionLevel:'M',margin:4,width:360,color:{dark:'#000000',light:'#ffffff'}})};
  }));return order;
}
