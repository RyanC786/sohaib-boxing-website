// Local-only test server. Netlify production uses the real function entry points.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import defaults from '../dist/content-defaults.json' with {type:'json'};
import {authorized,sameOrigin,json} from '../server/auth.mjs';
import session from '../netlify/functions/session.mjs';
import doorAuth from '../netlify/functions/door-auth.mjs';
import door from '../netlify/functions/door.mjs';
import ticket from '../netlify/functions/ticket.mjs';
import stripeWebhook from '../netlify/functions/stripe-webhook.mjs';
import {cmsIdentity} from '../server/cms-auth.mjs';
import {readState,changeState} from '../server/content-service.mjs';
import eventOffice from '../netlify/functions/event-office.mjs';
import staff from '../netlify/functions/staff.mjs';
import doorInstall from '../netlify/functions/door-install.mjs';
process.env.CMS_ADMIN_PASSWORD||='local-preview-only-ringside';
await fs.mkdir('.cms-local',{recursive:true});
const store={async getWithMetadata(){try{return JSON.parse(await fs.readFile('.cms-local/content.json','utf8'))}catch{return null}},async setJSON(key,data,condition){const current=await this.getWithMetadata();if(condition.onlyIfNew&&current||condition.onlyIfMatch&&condition.onlyIfMatch!==current?.etag)return {modified:false};const etag=randomUUID();await fs.writeFile('.cms-local/content.json',JSON.stringify({data,etag}));return {modified:true,etag};}};
const mime={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp'};
http.createServer(async(incoming,out)=>{
  try{
    const chunks=[];for await(const chunk of incoming)chunks.push(chunk);
    const url=new URL(incoming.url,'http://127.0.0.1:4173');
    const req=new Request(url,{method:incoming.method,headers:incoming.headers,...(!['GET','HEAD'].includes(incoming.method)?{body:Buffer.concat(chunks)}:{})});let res;
    if(url.pathname==='/api/session')res=await session(req);
    else if(url.pathname==='/api/admin/events')res=await eventOffice(req);
    else if(url.pathname==='/api/admin/staff')res=await staff(req);
    else if(url.pathname==='/api/door/install-qr')res=await doorInstall(req);
    else if(url.pathname==='/api/door/auth')res=await doorAuth(req);
    else if(['/api/door/events','/api/door/scan'].includes(url.pathname))res=await door(req);
    else if(url.pathname.startsWith('/api/ticket/'))res=await ticket(req);
    else if(url.pathname==='/api/stripe/webhook')res=await stripeWebhook(req);
    else if(['/api/content','/api/admin/content'].includes(url.pathname)){
      const admin=url.pathname.includes('/admin/');
      if(admin&&!(await cmsIdentity(req)).allowed)res=json({error:'Please sign in.'},401);
      else if(req.method==='GET'){const {state}=await readState(store,defaults);res=json(admin?state:state.published);}
      else if(req.method==='POST'&&admin&&sameOrigin(req))res=json(await changeState(store,defaults,await req.json()));
      else res=json({error:'Forbidden.'},403);
    }else if(url.pathname==='/api/media'&&req.method==='POST'){
      if(!(await cmsIdentity(req)).allowed||!sameOrigin(req))res=json({error:'Please sign in.'},401);
      else{const {imageType}=await import('../netlify/functions/media.mjs');const bytes=new Uint8Array(await req.arrayBuffer()),type=imageType(bytes);if(!type||bytes.length>4000000)res=json({error:'Use a PNG, JPEG or WebP smaller than 4 MB.'},400);else{const name=randomUUID()+'.'+type.split('/')[1];await fs.writeFile('.cms-local/'+name,bytes);res=json({url:'/api/media/'+name});}}
    }else if(url.pathname.startsWith('/api/media/')){const file=path.basename(url.pathname),data=await fs.readFile('.cms-local/'+file);res=new Response(data,{headers:{'Content-Type':mime[path.extname(file)]||'image/jpeg'}});}
    else{let filename=path.resolve('dist','.'+decodeURIComponent(url.pathname));if(!filename.startsWith(path.resolve('dist')+path.sep)&&filename!==path.resolve('dist'))throw Error('Invalid path');if((await fs.stat(filename)).isDirectory())filename=path.join(filename,'index.html');res=new Response(await fs.readFile(filename),{headers:{'Content-Type':mime[path.extname(filename)]||'application/octet-stream'}});}
    out.writeHead(res.status,Object.fromEntries([...res.headers].map(([k,v])=>[k,k==='set-cookie'?v.replace('; Secure',''):v])));out.end(Buffer.from(await res.arrayBuffer()));
  }catch(error){out.writeHead(error.status||400,{'Content-Type':'application/json'});out.end(JSON.stringify({error:error.message}));}
}).listen(4173,'127.0.0.1',()=>console.log('Local CMS preview: http://127.0.0.1:4173/admin/ (test password: local-preview-only-ringside)'));
