import {ticketConfiguration,deliveryConfiguration,database,rpc,receipt,ticketToken,hashToken} from '../../server/ticketing.mjs';
import {body,fail,errorResponse} from '../../server/door-auth.mjs';
import {json} from '../../server/auth.mjs';
export default async req=>{
  try{
    const path=new URL(req.url).pathname;
    const config=['/api/ticket/receipt','/api/ticket/request'].includes(path)?deliveryConfiguration():ticketConfiguration();if(!config)throw fail('Online ticket delivery is awaiting activation. Please use the organiser’s current booking page.',503);
    const db=database(config);
    if(path==='/api/ticket/catalog'&&req.method==='GET')return json({categories:await rpc(db,'ringside_ticket_catalog',{}),challengeKey:process.env.TURNSTILE_SITE_KEY||''});
    if(req.method!=='POST')return json({error:'Method not allowed.'},405);
    const data=await body(req);
    if(path==='/api/ticket/receipt')return json(await receipt(db,config,data.token));
    if(path==='/api/ticket/request'){
      if(!/^[A-Za-z0-9_-]{43}$/.test(data.token||'')||!['refund','transfer'].includes(data.kind)||typeof data.message!=='string'||data.message.length>2000)throw fail('Choose a request type and enter a short message.');
      return json(await rpc(db,'ringside_booking_request',{p_hash:hashToken(data.token),p_kind:data.kind,p_message:data.message}));
    }
    if(path!=='/api/ticket/checkout')throw fail('Unknown ticket request.',404);
    if(!config.stripeKey||!config.webhookSecret||!config.origin||new URL(config.origin).origin!==new URL(req.url).origin||process.env.TICKET_EMAIL_ENABLED!=='true'||!process.env.RESEND_API_KEY||!process.env.TICKET_FROM_EMAIL||!process.env.TURNSTILE_SECRET_KEY)throw fail('Ticket payments and email delivery are awaiting activation.',503);
    if(! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email||'')||data.email.length>254||! /^[0-9a-f-]{36}$/i.test(data.category||'')||! /^[0-9a-f-]{36}$/i.test(data.requestId||'')||!Array.isArray(data.attendees)||!data.attendees.length||data.attendees.length>8||data.attendees.some(name=>typeof name!=='string'||name.trim().length<2||name.length>100))throw fail('Enter your email and a name for each attendee (up to eight tickets).');
    if(typeof data.challenge!=='string'||data.challenge.length>2048)throw fail('Complete the booking security check.');
    const challengeResponse=await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({secret:process.env.TURNSTILE_SECRET_KEY,response:data.challenge}),signal:AbortSignal.timeout(10000)});
    const challenge=await challengeResponse.json();
    if(!challengeResponse.ok||!challenge.success||challenge.hostname!==new URL(config.origin).hostname||challenge.action!=='booking')throw fail('The booking security check expired. Please try again.',403);
    const attendees=data.attendees.map(name=>({name:name.trim()}));
    if(!Number.isInteger(data.revision))throw fail('Reload the event and review its current booking terms before paying.');
    const order=await rpc(db,'ringside_reserve_current',{p_request:data.requestId,p_category:data.category,p_email:data.email.trim().toLowerCase(),p_attendees:attendees,p_revision:data.revision});
    if(order.status!=='pending')throw fail('This booking has already been processed. Check your booking email.',409);
    const receiptToken=ticketToken(order.id,config.ticketKey,'receipt');
    const params=new URLSearchParams({mode:'payment','payment_method_types[0]':'card',customer_email:data.email.trim(),client_reference_id:order.id,'metadata[order_id]':order.id,'payment_intent_data[metadata][order_id]':order.id,'line_items[0][price_data][currency]':'gbp','line_items[0][price_data][unit_amount]':String(order.unitPrice),'line_items[0][price_data][product_data][name]':order.category,'line_items[0][quantity]':String(attendees.length),success_url:config.origin+'/ticket/#receipt='+receiptToken,cancel_url:config.origin+'/ticket/buy/?cancelled=1',expires_at:String(Math.floor(new Date(order.checkoutExpiresAt).getTime()/1000))});
    const result=await fetch('https://api.stripe.com/v1/checkout/sessions',{method:'POST',headers:{Authorization:'Bearer '+config.stripeKey,'Content-Type':'application/x-www-form-urlencoded','Idempotency-Key':'ringside-order-'+order.id},body:params,signal:AbortSignal.timeout(15000)});
    if(!result.ok)throw fail('Checkout could not be opened. Retry this booking or contact the organiser. Your reservation has been kept.',503);
    const checkout=await result.json();
    await rpc(db,'ringside_attach_checkout',{p_order:order.id,p_session:checkout.id,p_receipt_hash:hashToken(receiptToken)});
    if(!checkout.url?.startsWith('https://checkout.stripe.com/'))throw fail('Checkout is unavailable.',503);
    return json({url:checkout.url});
  }catch(error){return errorResponse(error);}
};
export const config={path:['/api/ticket/receipt','/api/ticket/request','/api/ticket/catalog','/api/ticket/checkout'],rateLimit:{windowLimit:30,windowSize:60,aggregateBy:['ip','domain']}};
