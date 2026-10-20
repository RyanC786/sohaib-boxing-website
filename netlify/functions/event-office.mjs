import {configuration,doorSession,staffAccess,body,fail,errorResponse,response} from '../../server/door-auth.mjs';
import {deliveryConfiguration} from '../../server/ticketing.mjs';
import {ticketMessage} from '../../server/ticket-email.mjs';
import {eventDates,validateContent} from '../../dist/model.mjs';
import defaults from '../../dist/content-defaults.json' with {type:'json'};
export default async req=>{
  try{
    const config=configuration();if(!config)throw fail('Individual organiser accounts need activation.',503);
    const s=await doorSession(req,config);const access=await staffAccess(s.supabase,true,['owner','editor']);
    let result;
    if(req.method==='GET')result=await s.supabase.rpc('ringside_event_office');
    else if(req.method==='POST'){
      const data=await body(req);
      if(data.action==='preview-email'){
        const event=validateContent({...defaults,event:{...defaults.event,...data.event}}).event;
        const message=ticketMessage({id:'preview',orderId:'PREVIEW-ONLY',email:'preview@example.invalid',title:event.title,purpose:data.kind==='confirmation'?'ticket':'event_change',eventStatus:event.status,event:{...event,startsAt:new Date(eventDates(event).timestamp).toISOString()},attendees:[{name:'Example attendee'}],category:'Example ticket',totalPence:6500},{origin:'https://example.invalid',from:'Preview <preview@example.invalid>',ticketKey:'1'.repeat(64)});
        return response({subject:message.subject,html:message.html},s.session,config);
      }
      if(access.role!=='owner')throw fail('Only the owner can manage customer requests.',403);
      result=await s.supabase.rpc('ringside_booking_request_update',{p_id:data.id,p_status:data.status,p_note:data.note||''});
    }else throw fail('Method not allowed.',405);
    if(result.error)throw fail(result.error.code==='PGRST202'?'The event office needs its database update.':result.error.message||'The event office is unavailable.',503);
    return response({...result.data,role:access.role,emailEnabled:process.env.TICKET_EMAIL_ENABLED==='true'&&Boolean(deliveryConfiguration()&&process.env.RESEND_API_KEY&&process.env.TICKET_FROM_EMAIL)},s.session,config);
  }catch(error){return errorResponse(error);}
};
export const config={path:'/api/admin/events'};
