import {configuration,doorSession,staffAccess,doorCookie,seal,fail} from './door-auth.mjs';
import {stripeKeyMode} from './ticketing.mjs';

// A sandbox on the public hostname must never accept an unsuspecting visitor.
// Payment mode comes from the protected server key, never a client flag.
export async function checkoutAccess(req,ticketConfig){
  const mode=stripeKeyMode(ticketConfig.stripeKey);
  if(!mode)throw fail('Ticket payments are awaiting activation.',503);
  if(mode==='live')return {testMode:false,headers:{}};
  const config=configuration();if(!config)throw fail('Sandbox bookings need the protected owner sign-in.',503);
  const session=await doorSession(req,config);
  await staffAccess(session.supabase,true,['owner']);
  return {testMode:true,headers:{'Set-Cookie':doorCookie(seal(session.session,config.secret))}};
}
