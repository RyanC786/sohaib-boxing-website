import {authorized} from './auth.mjs';
import {configuration,doorSession,staffAccess,sessionCookie} from './door-auth.mjs';
export const individualAccounts=()=>process.env.AUTH_MODE==='supabase'||Boolean(configuration());
export async function cmsIdentity(req){
  if(!individualAccounts())return {allowed:authorized(req),headers:{}};
  const config=configuration();if(!config)return {allowed:false,headers:{}};
  try{
    const s=await doorSession(req,config);await staffAccess(s.supabase,true,['owner','editor']);
    return {allowed:true,headers:{'Set-Cookie':sessionCookie(s.session,config)}};
  }catch{return {allowed:false,headers:{}};}
}
