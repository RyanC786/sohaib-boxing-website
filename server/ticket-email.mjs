import {randomUUID} from 'node:crypto';
import {ticketToken,rpc} from './ticketing.mjs';
import {escapeHTML as e} from '../dist/model.mjs';
export function ticketMessage(job,config){
  const link=new URL('/ticket/',config.origin);link.hash='receipt='+ticketToken(job.orderId,config.ticketKey,'receipt');
  const event=job.event||{},change=job.purpose==='event_change',cancelled=change&&job.eventStatus==='cancelled',withdrawn=event.fighterStatus==='withdrawn'&&job.eventStatus==='scheduled',withdrawalUpdate=change&&withdrawn;
  const heading=cancelled?'EVENT CANCELLED':withdrawalUpdate?'FIGHTER WITHDRAWAL · EVENT GOING AHEAD':change?(job.eventStatus==='postponed'?'EVENT POSTPONED':'Your event has an update'):'Your QR tickets are ready.';
  const when=event.startsAt&&!Number.isNaN(Date.parse(event.startsAt))?new Date(event.startsAt).toLocaleString('en-GB',{dateStyle:'full',timeStyle:'short',timeZone:'Europe/London'})+' UK time':'';
  const names=(job.attendees||[]).map(a=>a.name).filter(Boolean).join(', ');
  const lines=[change?'Please read this important update about your booking.':event.emailWelcome||'Thank you for booking. We look forward to welcoming you to fight night.',
    event.cancellationReason&&(cancelled||job.eventStatus==='postponed')?'Reason: '+event.cancellationReason:'',
    withdrawn?event.fighterNotice||`${event.fighter||'The advertised fighter'} will not be fighting.`:'',
    withdrawn?'The boxing event is still going ahead as scheduled. This notice concerns the fighter’s participation.':'',
    change?event.customerMessage||'Contact the organiser with your booking reference if you have any questions.':'',
    'Event: '+job.title,when?'When: '+when:'',event.venue?'Where: '+event.venue:'',event.promoter?'Promoted by: '+event.promoter:'',
    names?'Attendees: '+names:'',job.category?'Ticket type: '+job.category:'',Number.isInteger(job.totalPence)?'Booking total: £'+(job.totalPence/100).toFixed(2):'',
    cancelled?'Admission is closed for this event. Please do not travel to the venue for this booking.':event.arrivalInfo||'Print your ticket or show the QR on your phone. Bring ID matching the attendee name. Each ticket admits one named attendee once.',
    !cancelled?'Before travelling, open your private ticket link and save a backup: use Download ticket image for each attendee, Print / save as PDF, or screenshot the full ticket. You can reopen valid tickets from this email. Keep copies private; saved tickets still require live validation and cannot admit after a refund or previous admission.':'',
    event.refundPolicy?'Refunds and cancellations: '+event.refundPolicy:'',event.transferPolicy?'Transfers: '+event.transferPolicy:'',
    withdrawn&&event.fighterChangePolicy?'Options after a fight-card change: '+event.fighterChangePolicy:'',
    event.contactEmail?'Contact: '+event.contactEmail:'',event.contactPhone?'Telephone: '+event.contactPhone:''];
  const paragraphs=lines.filter(Boolean);
  return {from:config.from,to:[job.email],subject:(cancelled?'Cancelled · ':withdrawalUpdate?'Fighter update · ':change?'Event update · ':'Your QR tickets · ')+job.title,
    text:`${heading}\n\n${paragraphs.join('\n\n')}\n\n${cancelled?'View your booking / request help':'Open your private QR tickets'}: ${link.href}\n\nKeep this link private.\nBooking reference: ${job.orderId}\n\nThis is a service email about your booking.`,
    html:`<div style="font-family:Arial,sans-serif;color:#eee9dc;background:#121310;max-width:620px;margin:auto;padding:30px;border-radius:14px"><p style="font-size:12px;letter-spacing:2px;color:#d8b967">SOHAIB MOHAMMED · FIGHT NIGHT</p><h1 style="${cancelled?'border:4px solid #e7a393;color:#ffc3b4;padding:14px;text-align:center;letter-spacing:3px;':'color:#e7cb80;'}">${e(heading)}</h1>${paragraphs.map(p=>`<p style="line-height:1.6;white-space:pre-line">${e(p)}</p>`).join('')}<p><a href="${e(link.href)}" style="display:inline-block;padding:16px 24px;background:#d8b967;color:#17170f;text-decoration:none;font-weight:bold;border-radius:8px">${cancelled?'View booking / request help':'Open / print my QR tickets'}</a></p><p style="font-size:12px;color:#b8b6ac">Keep your ticket link private.<br>Booking reference: ${e(job.orderId)}<br>This is a service email about your booking.</p></div>`};
}
export async function deliverTickets(db,config,send=fetch){
  const lease=randomUUID(),jobs=await rpc(db,'ringside_claim_ticket_emails',{p_lease:lease});
  const results=await Promise.all(jobs.map(async job=>{
    let status='retry',providerId=null;
    try{
      if(!job.paid||!job.email||job.sendable===false)status='suppressed';
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
