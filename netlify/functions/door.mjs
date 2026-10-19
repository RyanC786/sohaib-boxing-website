import {configuration,doorSession,staffAccess,body,fail,response,errorResponse} from '../../server/door-auth.mjs';
import {json} from '../../server/auth.mjs';
export default async req=>{
  try{
    const config=configuration();if(!config)throw fail('The scanner is awaiting activation by the organiser.',503);
    const s=await doorSession(req,config);await staffAccess(s.supabase,true);
    let result;
    if(req.method==='GET'&&new URL(req.url).pathname==='/api/door/events')result=await s.supabase.rpc('ringside_door_events');
    else if(req.method==='POST'&&new URL(req.url).pathname==='/api/door/scan'){
      const data=await body(req);
      if(! /^[0-9a-f-]{36}$/i.test(data.event||'')||! /^[A-Za-z0-9_-]{43}$/.test(data.token||'')||typeof data.admit!=='boolean')throw fail('This is not a valid Ringside ticket.');
      result=await s.supabase.rpc('ringside_scan',{p_event:data.event,p_token:data.token,p_admit:data.admit});
    }else return json({error:'Method not allowed.'},405);
    if(result.error)throw fail(result.error.code==='42501'?'Access denied. Check your event assignment and authenticator.':'The ticket could not be checked. Try again.',result.error.code==='42501'?403:503);
    return response(result.data,s.session,config);
  }catch(error){return errorResponse(error);}
};
export const config={path:['/api/door/events','/api/door/scan'],rateLimit:{windowLimit:180,windowSize:60,aggregateBy:['ip','domain']}};
