import {deliveryConfiguration,database} from '../../server/ticketing.mjs';
import {deliverTickets} from '../../server/ticket-email.mjs';
export default async()=>{
  const config=deliveryConfiguration();
  // Activation is separate from code deployment. No email is sent without a verified sender.
  if(!config||process.env.TICKET_EMAIL_ENABLED!=='true'||!process.env.RESEND_API_KEY||!process.env.TICKET_FROM_EMAIL||!config.origin)return;
  const result=await deliverTickets(database(config),{...config,emailKey:process.env.RESEND_API_KEY,from:process.env.TICKET_FROM_EMAIL});
  console.log(JSON.stringify(result)); // Counts only; never recipient emails, QR tokens or ticket links.
};
export const config={schedule:'* * * * *'};
