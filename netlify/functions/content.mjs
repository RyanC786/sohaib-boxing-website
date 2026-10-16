import {getStore} from '@netlify/blobs';
import defaults from '../../dist/content-defaults.json' with {type:'json'};
import {authorized,sameOrigin,json} from '../../server/auth.mjs';
import {readState,changeState} from '../../server/content-service.mjs';
export default async req=>{
  const admin=new URL(req.url).pathname==='/api/admin/content';
  if(admin&&!authorized(req))return json({error:'Please sign in.'},401);
  if(req.method!=='GET'&&(!admin||!sameOrigin(req)))return json({error:'Forbidden.'},403);
  try{
    const store=getStore({name:'ringside-cms',consistency:'strong'});
    if(req.method==='GET'){const {state}=await readState(store,defaults);return json(admin?state:state.published);}
    if(req.method!=='POST')return json({error:'Method not allowed.'},405);
    const text=await req.text();if(text.length>500000)return json({error:'Content is too large.'},413);
    return json(await changeState(store,defaults,JSON.parse(text)));
  }catch(e){return json({error:e.status||e instanceof SyntaxError?e.message:'Unable to save or load content. '+(e.message||'Please try again.')},e.status||400);}
};
export const config={path:['/api/content','/api/admin/content']};
