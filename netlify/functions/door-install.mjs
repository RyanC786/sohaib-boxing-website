import QRCode from 'qrcode';
export default async req=>{
  if(req.method!=='GET')return new Response('Method not allowed',{status:405});
  const url=new URL('/door/',req.url).href;
  return new Response(await QRCode.toString(url,{type:'svg',errorCorrectionLevel:'M',margin:4,width:300}),{headers:{'Content-Type':'image/svg+xml','Cache-Control':'public,max-age=3600','X-Content-Type-Options':'nosniff'}});
};
export const config={path:'/api/door/install-qr'};
