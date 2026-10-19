import {randomUUID} from 'node:crypto';
import {ticketToken,rpc} from './ticketing.mjs';
import {escapeHTML as e} from '../dist/model.mjs';
export function ticketMessage(job,config){
  const link=new URL('/ticket/',config.origin);link.hash='receipt='+ticketToken(job.orderId,config.ticketKey,'receipt');
  return {from:config.from,to:[job.email],subject:'Your QR tickets · '+job.title,
    text:`Your booking is confirmed for ${job.title}.\n\nOpen your private QR tickets: ${link.href}\n\nPrint your ticket or show the QR on your phone. Bring ID matching the attendee name. Each ticket admits one named attendee once. Keep this link private.\n\nBooking reference: ${job.orderId}\n\nThis is a ticket delivery email about your booking.`,
    html:`<div style="font-family:Arial,sans-serif;color:#172016;max-width:580px;margin:auto;padding:28px"><p style="font-size:12px;letter-spacing:2px;color:#8a6a29">SOHAIB MOHAMMED · FIGHT NIGHT</p><h1>Your QR tickets are ready.</h1><p>Your booking is confirmed for <strong>${e(job.title)}</strong>.</p><p><a href="${e(link.href)}" style="display:inline-block;padding:16px 24px;background:#d8b967;color:#17170f;text-decoration:none;font-weight:bold;border-radius:8px">Open / print my QR tickets</a></p><p>Print your ticket or show the QR on your phone. Bring ID matching the attendee name. Each ticket admits one named attendee once.</p><p>Keep your ticket link private.</p><p style="font-size:12px;color:#5a6054">Booking reference: ${e(job.orderId)}<br>This email delivers the tickets you purchased.</p></div>`};
}
export async function deliverTickets(db,config,send=fetch){
  const lease=randomUUID(),jobs=await rpc(db,'ringside_claim_ticket_emails',{p_lease:lease});
  const results=await Promise.all(jobs.map(async job=>{
    let status='retry',providerId=null;
    try{
      if(!job.paid||!job.email)status='suppressed';
      else{
        const response=await send('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+config.emailKey,'Content-Type':'application/json','Idempotency-Key':'ringside-ticket-'+job.id},body:JSON.stringify(ticketMessage(job,config)),signal:AbortSignal.timeout(8000)});
        if(response.ok){const data=await response.json();if(typeof data.id==='string'){status='sent';providerId=data.id;}}
      }
    }catch{}
    await rpc(db,'ringside_finish_ticket_email',{p_id:job.id,p_lease:lease,p_status:status,p_provider_id:providerId});
    return status;
  }));
  return {sent:results.filter(status=>status==='sent').length,retry:results.filter(status=>status==='retry').length,suppressed:results.filter(status=>status==='suppressed').length};
}
