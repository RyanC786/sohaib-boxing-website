import {configuration,doorSession,staffAccess,body,fail,response,errorResponse} from '../../server/door-auth.mjs';
import {database} from '../../server/ticketing.mjs';
export default async req=>{
  try{
    const config=configuration();if(!config)throw fail('Staff accounts await activation.',503);
    const s=await doorSession(req,config);await staffAccess(s.supabase,true,['owner']);
    let result;
    if(req.method==='GET'){
      result=await s.supabase.rpc('ringside_staff_office');
      if(result.error)throw fail(result.error.code==='PGRST202'?'Staff management needs the pending database update.':'Staff management is unavailable.',503);
      return response({...result.data,invitesEnabled:Boolean(process.env.SUPABASE_SECRET_KEY),installURL:new URL('/door/',req.url).href},s.session,config);
    }
    if(req.method!=='POST')throw fail('Method not allowed.',405);
    const data=await body(req);
    if(!['invite','grant','active','assign'].includes(data.action))throw fail('Unknown staff action.');
    if(['invite','grant'].includes(data.action)){
      if(typeof data.email!=='string'||data.email.length>254||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)||!['scanner','editor'].includes(data.role))throw fail('Enter a valid staff email and choose scanner or editor.');
      if(data.action==='invite'){
        if(!process.env.SUPABASE_SECRET_KEY)throw fail('Staff invitations need the protected server connection. Existing accounts can still be assigned.',503);
        const admin=database({url:config.url,key:process.env.SUPABASE_SECRET_KEY});
        const invitation=await admin.auth.admin.inviteUserByEmail(data.email.trim().toLowerCase(),{redirectTo:new URL('/door/',req.url).href});
        if(invitation.error)throw fail('The invitation could not be sent. If this person already has an account, use Add existing account; otherwise check email delivery before retrying.',400);
      }
    }
    result=await s.supabase.rpc('ringside_manage_staff',{p_action:data.action==='invite'?'grant':data.action,p_email:data.email?.trim().toLowerCase()||null,p_role:data.role||null,p_user:data.userId||null,p_event:data.eventId||null,p_active:typeof data.active==='boolean'?data.active:null});
    if(result.error)throw fail('Staff access could not be updated. Check the selected account, role and event. If an invitation was sent, the account has no staff access until this step succeeds.',400);
    return response(result.data,s.session,config);
  }catch(error){return errorResponse(error);}
};
export const config={path:'/api/admin/staff',rateLimit:{windowLimit:30,windowSize:60,aggregateBy:['ip','domain']}};
