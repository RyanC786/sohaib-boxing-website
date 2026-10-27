import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

// Execute the shipped scanner with simulated phone visibility/media events.
// No real camera, account, ticket or provider request is used.
function phone(){
  const listeners={},tracks=[],frames=new Map();let serial=0,request,playError,auth=true,scanCalls=0;
  const element=()=>({hidden:false,disabled:false,textContent:'',style:{},className:'',addEventListener(){},replaceChildren(){},append(){}});
  const nodes=Object.fromEntries(['app','notice','connection','result','camera','venue'].map(id=>['#'+id,element()]));
  const video=nodes['#video']={...element(),readyState:2,videoWidth:720,videoHeight:720,srcObject:null,async play(){if(playError)throw playError;}};
  let deskRenders=0;
  Object.defineProperty(nodes['#app'],'innerHTML',{set(){deskRenders++;}});
  const document={hidden:false,querySelector:id=>nodes[id]||null,querySelectorAll:()=>[],addEventListener:(name,fn)=>listeners[name]=fn,createElement:()=>({...element(),getContext:()=>({drawImage(){},getImageData:()=>({data:[],width:1,height:1})})})};
  const session={configured:true,authenticated:true,mfaVerified:true,role:'scanner',email:'staff@example.test'};
  const events=[{id:'event',title:'Test',venue:'Test',startsAt:'2026-10-28',scanOpensAt:'2026-10-27',scanClosesAt:'2026-10-29'}];
  const context=vm.createContext({document,navigator:{onLine:true,mediaDevices:{getUserMedia:()=>new Promise(resolve=>request=resolve)}},window:{addEventListener(){},jsQR:()=>null},location:{origin:'https://boxing.test',search:'',hash:''},history:{},URL,URLSearchParams,AbortSignal,setTimeout:()=>1,clearTimeout(){},requestAnimationFrame:fn=>{frames.set(++serial,fn);return serial;},cancelAnimationFrame:id=>frames.delete(id),fetch:async url=>{if(url.endsWith('/scan'))scanCalls++;return {ok:true,json:async()=>url.endsWith('/auth')?{...session,authenticated:auth}:events};}});
  const source=readFileSync(new URL('../dist/door/door.js',import.meta.url),'utf8').replace(/^import .*\r?\n/,'const e=value=>String(value);\n').replace('export function ticketToken','function ticketToken').replace(/connection\(\);start\(\)\.catch\([^\n]+\);/,'');
  vm.runInContext(source,context);
  vm.runInContext(`session=${JSON.stringify(session)};events=${JSON.stringify(events)};selected='event';`,context);
  return {
    context,video,nodes,tracks,frames,
    run:code=>vm.runInContext(code,context),
    hide(){document.hidden=true;listeners.visibilitychange();},
    show(){document.hidden=false;listeners.visibilitychange();},
    resolve(){const track={stopped:false,listeners:{},stop(){this.stopped=true;},addEventListener(name,fn){this.listeners[name]=fn;}};tracks.push(track);const stream={getTracks:()=>[track],getVideoTracks:()=>[track]};request(stream);return stream;},
    failPlayback(){playError=Error('Playback failed');},
    revoke(){auth=false;},
    get renders(){return deskRenders;},get scans(){return scanCalls;}
  };
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));

test('permission-screen return revalidates staff without destroying the newly opened camera',async()=>{
  const p=phone(),opening=p.run('run(()=>camera())');
  p.hide();p.show();const stream=p.resolve();await opening;await settle();
  assert.equal(p.video.srcObject,stream);assert.equal(p.tracks[0].stopped,false);
  assert.equal(p.nodes['#camera'].hidden,true);assert.equal(p.renders,0);
  assert.equal(p.frames.size,1);
});

test('backgrounding an active camera stops it and restores the open button',async()=>{
  const p=phone(),opening=p.run('run(()=>camera())');p.resolve();await opening;
  p.hide();assert.equal(p.tracks[0].stopped,true);assert.equal(p.frames.size,0);
  assert.equal(p.nodes['#camera'].hidden,false);
  p.show();await settle();assert.ok(p.renders>0);
});

test('late camera permission resolution cannot reopen a desk that was closed',async()=>{
  const p=phone(),opening=p.run('run(()=>camera())');p.run('stopCamera()');p.resolve();await opening;
  assert.equal(p.tracks[0].stopped,true);assert.equal(p.video.srcObject,null);assert.equal(p.frames.size,0);
});

test('playback failure releases the camera and leaves a usable retry button',async()=>{
  const p=phone();p.failPlayback();const opening=p.run('run(()=>camera())');p.resolve();await opening;
  assert.equal(p.tracks[0].stopped,true);assert.equal(p.nodes['#camera'].hidden,false);
  assert.match(p.nodes['#notice'].textContent,/camera could not stay open/);
});

test('permission return never preserves a camera after staff authentication is revoked',async()=>{
  const p=phone(),opening=p.run('run(()=>camera())');p.hide();p.revoke();p.show();p.resolve();await opening;await settle();
  assert.equal(p.tracks[0].stopped,true);assert.ok(p.renders>0);
});

test('an unrelated QR stays in the preview without closing it or submitting a ticket',async()=>{
  const p=phone();p.context.window.jsQR=()=>({data:'https://example.test/other-qr'});
  const opening=p.run('run(()=>camera())');p.resolve();await opening;
  const [id,tick]=[...p.frames][0];p.frames.delete(id);await tick(500);
  assert.equal(p.tracks[0].stopped,false);assert.equal(p.scans,0);assert.equal(p.frames.size,1);
});
