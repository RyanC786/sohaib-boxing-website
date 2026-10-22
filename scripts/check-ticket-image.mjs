// Local UI fixture with synthetic data only. Stop the server after browser QA.
import http from 'node:http';
import fs from 'node:fs/promises';
import QRCode from 'qrcode';
const qr=await QRCode.toDataURL('T'.repeat(43),{errorCorrectionLevel:'M',margin:4,width:360});
const order={event:'TEST ONLY · Ticket image preview',venue:'Synthetic test venue',startsAt:'2026-10-28T19:00:00Z',reference:'test-order-reference'};
const ticket={id:'test-ticket-reference',name:'Ryan Image Test',category:'VIP Ringside · Test',status:'valid',qr};
const page=`<!doctype html><html><head><title>Ticket image export check</title></head><body><h1>Synthetic ticket image check</h1><button id="make">Create test image</button><a id="download" hidden download="synthetic-ticket.png">Download test image</a><img id="preview" style="max-width:500px;display:block"><script type="module">import {ticketImage} from '/download.mjs';document.querySelector('#make').onclick=async()=>{const blob=await ticketImage(${JSON.stringify(order)},${JSON.stringify(ticket)});const url=URL.createObjectURL(blob);document.querySelector('#preview').src=url;const link=document.querySelector('#download');link.href=url;link.hidden=false;};</script></body></html>`;
http.createServer(async(req,res)=>{if(req.url==='/download.mjs'){res.setHeader('Content-Type','text/javascript');res.end(await fs.readFile('dist/ticket/download.mjs'));}else{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(page);}}).listen(4175,'127.0.0.1',()=>console.log('Synthetic ticket image check: http://127.0.0.1:4175/'));

