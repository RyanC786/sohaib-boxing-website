import {ticketConfiguration,database,rpc,verifyStripe,issuedTickets,stripeKeyMode} from '../../server/ticketing.mjs';
import {fail,errorResponse} from '../../server/door-auth.mjs';
import {json} from '../../server/auth.mjs';
export default async req=>{
  try{
    if(req.method!=='POST')return json({error:'Method not allowed.'},405);
    const config=ticketConfiguration();if(!config?.webhookSecret)throw fail('Ticket payments are awaiting activation.',503);
    const raw=Buffer.from(await req.arrayBuffer());if(raw.length>262144)throw fail('Notification too large.',413);
    const event=verifyStripe(raw,req.headers.get('stripe-signature'),config.webhookSecret),object=event.data?.object;
    if(!event.id||!object?.id)throw fail('Invalid payment notification.');
    // Never accept live notifications while using a test key, or vice versa.
    const mode=stripeKeyMode(config.stripeKey);
    if(!mode||event.livemode!==(mode==='live'))throw fail('Payment mode mismatch.');
    const db=database(config);
    if(['checkout.session.completed','checkout.session.async_payment_succeeded'].includes(event.type)){
      if(object.payment_status!=='paid')return json({received:true,awaitingPayment:true});
      if(object.currency!=='gbp'||!Number.isSafeInteger(object.amount_total)||! /^[0-9a-f-]{36}$/i.test(object.metadata?.order_id||''))throw fail('Invalid paid booking.');
      const order=await rpc(db,'ringside_fulfillment_order',{p_order:object.metadata.order_id});if(!order)throw fail('Booking not found.',503);
      await rpc(db,'ringside_fulfill_order',{p_notification:event.id,p_type:event.type,p_order:order.id,p_session:object.id,p_payment:typeof object.payment_intent==='string'?object.payment_intent:object.payment_intent?.id,p_amount:object.amount_total,p_currency:object.currency,p_tickets:issuedTickets(order.attendees,config.ticketKey)});
    }else if(event.type==='checkout.session.expired'){
      await rpc(db,'ringside_expire_checkout',{p_notification:event.id,p_session:object.id});
    }else if(event.type==='charge.refunded'){
      await rpc(db,'ringside_refund_order',{p_notification:event.id,p_payment:typeof object.payment_intent==='string'?object.payment_intent:object.payment_intent?.id,p_full:object.amount_refunded>=object.amount});
    }
    return json({received:true});
  }catch(error){return errorResponse(error);}
};
export const config={path:'/api/stripe/webhook'};
