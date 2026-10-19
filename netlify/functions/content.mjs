import {getStore} from '@netlify/blobs';
import defaults from '../../dist/content-defaults.json' with {type:'json'};
import {authorized,sameOrigin,json} from '../../server/auth.mjs';
import {readState,changeState} from '../../server/content-service.mjs';
import {cmsIdentity} from '../../server/cms-auth.mjs';
export default async req=>{
  const admin=new URL(req.url).pathname==='/api/admin/content';
  const identity=admin?await cmsIdentity(req):{allowed:false,headers:{}};
  if(admin&&!identity.allowed)return json({error:'Please sign in with an owner or editor account and verify MFA.'},401);
  if(req.method!=='GET'&&(!admin||!sameOrigin(req)))return json({error:'Forbidden.'},403);
  try{
    const store=getStore({name:'ringside-cms',consistency:'strong'});
    if(req.method==='GET'){const {state}=await readState(store,defaults);return json(admin?state:state.published,200,identity.headers);}
    if(req.method!=='POST')return json({error:'Method not allowed.'},405);
    const text=await req.text();if(text.length>500000)return json({error:'Content is too large.'},413);
    return json(await changeState(store,defaults,JSON.parse(text)),200,identity.headers);
  }catch(e){return json({error:e.status||e instanceof SyntaxError?e.message:'Unable to save or load content. '+(e.message||'Please try again.')},e.status||400);}
};
export const config={path:['/api/content','/api/admin/content']};
