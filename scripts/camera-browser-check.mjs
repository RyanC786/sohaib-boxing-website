// Local Chromium camera regression: synthetic media and API fixtures only.
import {chromium} from 'playwright';
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import QRCode from 'qrcode';
const root=path.resolve('dist');
const server=http.createServer(async(req,res)=>{
  try{let file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep))throw Error();if((await fs.stat(file)).isDirectory())file=path.join(file,'index.html');res.setHeader('Content-Type',file.endsWith('.js')||file.endsWith('.mjs')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(await fs.readFile(file));}catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try{
  browser=await chromium.launch({headless:true,channel:'chrome',args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
  const page=await browser.newPage({viewport:{width:412,height:915},isMobile:true,hasTouch:true,serviceWorkers:'block'});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/api/door/auth',route=>route.fulfill({json:{configured:true,authenticated:true,role:'owner',email:'camera-test@example.test',mfaVerified:true}}));
  await page.route('**/api/door/events',route=>route.fulfill({json:[{id:'synthetic-event',title:'LOCAL CAMERA TEST',venue:'Synthetic media only',startsAt:'2026-10-28T14:30:00Z',scanOpensAt:'2026-10-27T00:00:00Z',scanClosesAt:'2026-10-29T00:00:00Z'}]}));
  await page.goto(`http://127.0.0.1:${server.address().port}/scanner-check/`);await page.waitForLoadState('networkidle');
  assert.equal(new URL(page.url()).pathname,'/scanner-check/');
  assert.equal(await page.locator('link[rel=manifest]').count(),0);
  await page.getByText('Browser camera check. This page uses your existing staff access and does not install or open the phone app.',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Open ticket camera',exact:true}).click();
  await page.waitForFunction(()=>{const v=document.querySelector('#video');return v?.srcObject?.active&&v.videoWidth>0&&!v.paused;});
  await page.waitForTimeout(2000);
  assert.equal(await page.locator('#video').evaluate(v=>v.srcObject?.active&&!v.paused),true);
  assert.equal(await page.locator('#camera').isVisible(),false);
  await fs.mkdir('output/verification',{recursive:true});await page.screenshot({path:'output/verification/android-browser-only-camera-synthetic.png',fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('PASS: Chromium mobile preview remains playing; camera button is hidden; no page errors.');
  // Actual jsQR decoding from a synthetic canvas-backed MediaStream, followed
  // by the normal server lookup/ID/admission/repeated-scan user interface.
  const qr=await QRCode.toDataURL('a'.repeat(43),{width:600,margin:4});
  const scanPage=await browser.newPage({viewport:{width:412,height:915},isMobile:true,hasTouch:true,serviceWorkers:'block'});
  await scanPage.addInitScript(()=>{
    Object.defineProperty(window,'BarcodeDetector',{value:undefined,configurable:true});
    // Remove the property so the shipped jsQR path is selected.
    delete window.BarcodeDetector;
    navigator.mediaDevices.getUserMedia=async()=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=720;const ctx=canvas.getContext('2d');let image;window.paintTestQR=async src=>{image=new Image();image.src=src;await image.decode();};function draw(){ctx.fillStyle=image?'white':'#555';ctx.fillRect(0,0,720,720);if(image?.complete)ctx.drawImage(image,60,60,600,600);requestAnimationFrame(draw);}draw();return canvas.captureStream(15);};
  });
  await scanPage.route('**/api/door/auth',route=>route.fulfill({json:{configured:true,authenticated:true,role:'scanner',email:'camera-test@example.test',mfaVerified:true}}));
  await scanPage.route('**/api/door/events',route=>route.fulfill({json:[{id:'synthetic-event',title:'LOCAL CAMERA TEST',venue:'Synthetic media only',startsAt:'2026-10-28T14:30:00Z',scanOpensAt:'2026-10-27T00:00:00Z',scanClosesAt:'2026-10-29T00:00:00Z'}]}));
  let used=false;
  await scanPage.route('**/api/door/scan',route=>{const {admit}=route.request().postDataJSON();const status=used?'already_used':admit?'admitted':'valid';if(admit)used=true;return route.fulfill({json:{status,name:'SYNTHETIC CAMERA TEST',category:'Test admission'}});});
  await scanPage.goto(`http://127.0.0.1:${server.address().port}/door/`);await scanPage.waitForLoadState('networkidle');
  await scanPage.getByRole('button',{name:'Open ticket camera',exact:true}).click();
  await scanPage.getByText('Camera on. Point the rear camera at the ticket QR.',{exact:true}).waitFor();
  await scanPage.evaluate(src=>window.paintTestQR(src),qr);
  await scanPage.getByText('Check ID before entry',{exact:true}).waitFor();
  await scanPage.getByLabel('I have checked the name against their ID.').check();
  await scanPage.getByRole('button',{name:'Admit attendee',exact:true}).click();await scanPage.getByText('Admitted',{exact:true}).waitFor();
  await scanPage.getByRole('button',{name:'Scan next ticket',exact:true}).click();
  await scanPage.getByText('Camera on. Point the rear camera at the ticket QR.',{exact:true}).waitFor();
  await scanPage.evaluate(src=>window.paintTestQR(src),qr);
  await scanPage.getByText('Already used · do not admit',{exact:true}).waitFor();
  await scanPage.screenshot({path:'output/verification/android-camera-synthetic-decoded.png',fullPage:true});
  console.log('PASS: Actual jsQR decodes the camera frame; ID confirmation/admission work; repeat scan is rejected.');
}finally{await browser?.close();await new Promise(resolve=>server.close(resolve));}
