import {configured,sameOrigin,authorized,equal,session,json,cookie} from '../../server/auth.mjs';
export default async req=>{
  if(req.method==='GET')return json({configured:configured(),authenticated:authorized(req)});
  if(!sameOrigin(req))return json({error:'Invalid request origin.'},403);
  if(req.method==='DELETE')return json({ok:true},200,{'Set-Cookie':cookie('',0)});
  if(req.method!=='POST')return json({error:'Method not allowed.'},405);
  if(!configured())return json({error:'An owner must set CMS_ADMIN_PASSWORD in Netlify before admin sign-in is available. Use at least 20 characters.'},503);
  let data;try{const body=await req.text();if(body.length>2048)throw Error();data=JSON.parse(body);}catch{return json({error:'Invalid sign-in request.'},400);}
  if(typeof data.password!=='string'||!equal(data.password,process.env.CMS_ADMIN_PASSWORD)){await new Promise(r=>setTimeout(r,700));return json({error:'Incorrect password.'},401);}
  return json({ok:true},200,{'Set-Cookie':cookie(session())});
};
export const config={path:'/api/session',rateLimit:{windowLimit:15,windowSize:60,aggregateBy:['ip','domain']}};
