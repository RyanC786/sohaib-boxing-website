import {getStore} from '@netlify/blobs';
import {randomUUID} from 'node:crypto';
import {authorized,sameOrigin,json} from '../../server/auth.mjs';
import {cmsIdentity} from '../../server/cms-auth.mjs';
export function imageType(bytes){if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';if(Buffer.from(bytes.subarray(0,8)).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';if(Buffer.from(bytes.subarray(0,4)).toString()==='RIFF'&&Buffer.from(bytes.subarray(8,12)).toString()==='WEBP')return 'image/webp';return null;}
export default async req=>{
  const key=new URL(req.url).pathname.split('/').pop();
  try{
    const store=getStore({name:'ringside-images',consistency:'strong'});
    if(req.method==='GET'&&/^[0-9a-f-]{36}$/.test(key)){
      const item=await store.getWithMetadata(key,{type:'arrayBuffer'});if(!item)return new Response('Image not found',{status:404});
      return new Response(item.data,{headers:{'Content-Type':item.metadata.type,'Cache-Control':'public, max-age=31536000, immutable','X-Content-Type-Options':'nosniff'}});
    }
    if(req.method!=='POST')return json({error:'Method not allowed.'},405);
    const identity=await cmsIdentity(req);
    if(!identity.allowed||!sameOrigin(req))return json({error:'Please sign in.'},401);
    if(Number(req.headers.get('content-length'))>4000000)return json({error:'Use an image smaller than 4 MB.'},413);
    const bytes=new Uint8Array(await req.arrayBuffer());if(bytes.length>4000000)return json({error:'Use an image smaller than 4 MB.'},413);
    const type=imageType(bytes);if(!type)return json({error:'Upload a JPEG, PNG or WebP image.'},400);
    const id=randomUUID();await store.set(id,bytes.buffer,{metadata:{type}});return json({url:'/api/media/'+id},200,identity.headers);
  }catch{return json({error:'Image storage is unavailable. Please try again.'},503);}
};
export const config={path:['/api/media','/api/media/*']};
