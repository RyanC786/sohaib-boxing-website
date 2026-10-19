import {escapeHTML as e} from '/model.mjs';
const app=document.querySelector('#app'),notice=document.querySelector('#notice');
let session,events=[],stream,frame,detecting=false,busy=false,result,selected='',enrollment,installPrompt,noticeTimer,expiryTimer,recovered=false,view=0;
const stamp=value=>new Date(value).toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/London'});
const field=(label,name,type='text',attrs='')=>`<label class="field">${label}<input name="${name}" type="${type}" required ${attrs}></label>`;
function tell(text,error=false){notice.textContent=text;notice.className=error?'error':'';notice.style.display='block';clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>notice.style.display='none',9000);}
async function api(path,options={}){
  if(!navigator.onLine)throw Error('You are offline. Reconnect before checking or admitting a ticket.');
  let response;try{response=await fetch('/api/door/'+path,{cache:'no-store',credentials:'same-origin',...options,headers:{'Content-Type':'application/json',...options.headers},signal:AbortSignal.timeout(18000)});}catch{throw Error('Connection lost. Do not admit until the ticket is checked again.');}
  const data=await response.json();if(!response.ok){if(response.status===401){stopCamera();result=null;}throw Error(data.error||'The request could not be completed.');}return data;
}
const auth=data=>api('auth',{method:'POST',body:JSON.stringify(data)});
async function run(work){if(busy)return;busy=true;document.querySelectorAll('button,input,select').forEach(b=>b.disabled=true);try{await work();}catch(error){tell(error.message,true);}finally{busy=false;document.querySelectorAll('button,input,select').forEach(b=>b.disabled=false);const admit=document.querySelector('#admit');if(admit)admit.disabled=!document.querySelector('#id-checked')?.checked||!navigator.onLine;}}
function installCard(){return `<details class="rule"><summary>Install on your phone</summary><p class="help">iPhone: open this page in Safari, tap Share, then Add to Home Screen. Android: use your browser’s Install app or Add to Home screen option.</p>${installPrompt?'<button id="install" class="quiet wide">Install Ringside Door</button>':''}<p class="help">Installation does not grant access. Every staff member needs an invited account, an authenticator and an event assignment.</p></details>`;}
function login(recovery=false){
  stopCamera();app.innerHTML=`<div class="eyebrow">Fight night · Staff entrance</div><h1>The right people.<br><span class="gold">Through the ropes.</span></h1><div class="login-layout"><div class="intro"><p>Scan the ticket. Check their ID. Welcome them to fight night.</p><span class="badge">INVITED STAFF ONLY</span>${installCard()}</div><section class="panel"><h2>${recovery?'Recover your account':'Staff sign-in'}</h2><form id="${recovery?'recover':'login'}">${field('Staff email','email','email','autocomplete="username" maxlength="254"')}${recovery?'':field('Password','password','password','autocomplete="current-password" maxlength="128"')}<button class="wide">${recovery?'Send recovery email':'Sign in securely'}</button></form><button class="text-button" id="${recovery?'back-login':'forgot'}">${recovery?'Back to sign-in':'Forgot your password?'}</button>${!recovery?`<details><summary>Activate a staff invitation</summary><form id="invite-code">${field('Invited email','email','email','autocomplete="username"')}${field('Invitation code','code','text','inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,10}"')}<button class="quiet wide">Activate my invitation</button></form></details>`:''}${recovery?`<details open><summary>I have a recovery code</summary><form id="recovery-code">${field('Staff email','email','email','autocomplete="username"')}${field('Email recovery code','code','text','inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,10}"')}<button class="quiet wide">Verify recovery code</button></form></details>`:''}</section></div>`;
}
function mfa(){
  stopCamera();const factors=session.factors||[];
  app.innerHTML=`<div class="eyebrow">Secure staff access</div><h1>One more<br><span class="gold">check.</span></h1><section class="panel"><h2>${factors.length?'Verify your authenticator':'Set up your authenticator'}</h2><p>${factors.length?'Enter the current six-digit code from your authenticator app.':'Connect an authenticator app to protect your staff account. You will need it each time you sign in.'}</p>${!factors.length&&!enrollment?'<button id="enroll" class="wide">Set up authenticator</button>':''}${enrollment?`<img class="auth-qr" src="${e(enrollment.qr.startsWith('data:')?enrollment.qr:'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(enrollment.qr))}" alt="Scan this setup QR with your authenticator app"><details><summary>Enter setup key manually</summary><code class="setup-key">${e(enrollment.secret)}</code></details>`:''}${factors.length||enrollment?`<form id="verify">${factors.length>1?`<label class="field">Authenticator<select name="factorId">${factors.map(f=>`<option value="${e(f.id)}">${e(f.name||'Authenticator')}</option>`).join('')}</select></label>`:`<input name="factorId" type="hidden" value="${e(factors[0]?.id||enrollment.id)}">`}${field('Authenticator code','code','text','inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6"')}<button class="wide">Verify and continue</button></form>`:''}</section>${toolbar()}`;
}
function toolbar(){return `<div class="toolbar"><small>${e(session?.email||'Staff account')}</small><button id="logout" class="quiet">Sign out</button></div>`;}
async function refresh(){
  session=await api('auth');enrollment=null;
  if(!session.configured){app.innerHTML=`<div class="eyebrow">Ringside Door</div><h1>The door desk<br><span class="gold">is getting ready.</span></h1><section class="panel"><h2>Staff access awaits activation</h2><p>The organiser is connecting secure staff accounts and event assignments. Once activated, you can sign in here.</p><button id="retry" class="quiet">Check again</button>${installCard()}</section>`;return;}
  if(!session.authenticated){login();return;}
  if(!session.mfaVerified){mfa();return;}
  if(recovered){passwordView();return;}
  if(session.role==='editor'||new URLSearchParams(location.search).get('next')==='admin'&&session.role==='owner'){location.assign('/admin/');return;}
  events=await api('events');desk();
}
function passwordView(){stopCamera();app.innerHTML=`<div class="eyebrow">Account security</div><h1>Your password.<br><span class="gold">Your access.</span></h1><section class="panel"><p>Use a unique password of at least 14 characters. Changing it signs out your other devices.</p><form id="password">${field('New password','password','password','autocomplete="new-password" minlength="14" maxlength="128"')}${field('Repeat new password','repeat','password','autocomplete="new-password" minlength="14" maxlength="128"')}<button class="wide">Change password</button></form><button id="retry" class="text-button">Back to scanner</button></section>${toolbar()}`;}
function desk(){
  view++;stopCamera();result=null;selected=events.some(event=>event.id===selected)?selected:events[0]?.id||'';
  app.innerHTML=`<div class="eyebrow">Admission desk · Online checks</div><h1>Ready for<br><span class="gold">fight night.</span></h1>${events.length?`<label class="field">Your assigned event<select id="event">${events.map(event=>`<option value="${e(event.id)}" ${event.id===selected?'selected':''}>${e(event.title)} · ${e(stamp(event.startsAt))}</option>`).join('')}</select></label><p id="venue" class="help"></p><div id="scan-area"><div class="scanner"><video id="video" playsinline muted aria-label="Ticket scanning camera"></video><div class="viewfinder" aria-hidden="true"></div><button id="camera" class="start-camera">Open ticket camera</button><span class="camera-label">Centre the ticket QR inside the frame</span></div></div><div id="result" aria-live="polite"></div><details class="panel"><summary>Camera unavailable? Enter the ticket code</summary><form id="manual">${field('43-character ticket code','token','text','autocomplete="off" autocapitalize="none" spellcheck="false" minlength="43" maxlength="43"')}<button class="quiet wide">Check ticket</button></form></details>`:`<section class="panel"><h2>No events assigned yet</h2><p>Ask the organiser to assign your account to the event. Only your assigned events will appear here.</p><button id="retry" class="quiet">Refresh events</button></section>`}${toolbar()}<button id="change-password" class="text-button">Change my password</button>${installCard()}`;
  if(session.role==='owner'){const link=document.createElement('a');link.className='text-button';link.href='/admin/';link.textContent='Open website dashboard';app.append(link);}
  showVenue();
}
function showVenue(){const event=events.find(event=>event.id===selected),el=document.querySelector('#venue');if(el&&event)el.textContent=`${event.venue} · Admission ${stamp(event.scanOpensAt)} – ${stamp(event.scanClosesAt)}`;}
export function ticketToken(raw){
  if(/^[A-Za-z0-9_-]{43}$/.test(raw))return raw;
  try{const url=new URL(raw);if(url.origin!==location.origin||url.pathname!=='/door/')return null;const token=new URLSearchParams(url.hash.slice(1)).get('ticket');return /^[A-Za-z0-9_-]{43}$/.test(token||'')?token:null;}catch{return null;}
}
async function check(raw){
  stopCamera();clearTimeout(expiryTimer);result=null;document.querySelector('#result').replaceChildren();
  const token=ticketToken(raw.trim());if(!token)throw Error('This is not a Ringside ticket code. Ask the attendee for their ticket email.');
  const version=view,eventId=selected;
  const data=await api('scan',{method:'POST',body:JSON.stringify({event:eventId,token,admit:false})});
  if(version!==view||!navigator.onLine)return;
  result={...data,token,event:eventId};showResult();
  if(data.status==='valid')expiryTimer=setTimeout(()=>{result=null;const target=document.querySelector('#result');if(target){target.innerHTML='<div class="panel"><h2>Check expired</h2><p>Scan the ticket again before admitting.</p><button id="next" class="quiet">Scan again</button></div>'; }},60000);
}
function showResult(){
  const labels={valid:'Check ID before entry',admitted:'Admitted',already_used:'Already used · do not admit',invalid:'Ticket not valid',closed:'Admission is closed'};
  const descriptions={valid:'Compare this name with the attendee’s ID, then confirm admission.',admitted:'Entry is recorded. Welcome them to fight night.',already_used:`This ticket was admitted at ${result.usedAt?stamp(result.usedAt):'an earlier time'}. Ask the supervisor to help.`,invalid:'This ticket is not valid for this event. Ask the supervisor to check the booking.',closed:'This event is outside its admission window, postponed, cancelled or completed.'};
  const status=Object.hasOwn(labels,result.status)?result.status:'invalid';
  document.querySelector('#result').innerHTML=`<section class="result ${status}"><div class="state">${e(labels[status])}</div>${result.name?`<div class="attendee">${e(result.name)}</div><div class="ticket-type">${e(result.category)}</div>`:''}<p>${e(descriptions[status])}</p>${status==='valid'?'<label class="check-id"><input id="id-checked" type="checkbox">I have checked the name against their ID.</label><button id="admit" class="wide" disabled>Admit attendee</button>':''}<button id="next" class="quiet wide" style="margin-top:12px">Scan next ticket</button></section>`;
}
async function admit(){
  if(!result||result.status!=='valid'||result.event!==selected||!document.querySelector('#id-checked')?.checked)throw Error('Scan the ticket and check ID first.');
  clearTimeout(expiryTimer);const token=result.token,version=view;
  // An uncertain network result must be checked again, never assumed admitted.
  try{const data=await api('scan',{method:'POST',body:JSON.stringify({event:selected,token,admit:true})});if(version!==view||!navigator.onLine)return;result=data;showResult();}
  catch(error){result=null;document.querySelector('#result').innerHTML='<section class="result invalid"><h2>Entry not confirmed</h2><p>Scan this ticket again. If the server recorded entry, it will show “Already used”. Ask the supervisor before letting the attendee through.</p><button id="next" class="quiet wide">Check again</button></section>';throw error;}
}
function stopCamera(){cancelAnimationFrame(frame);if(stream)stream.getTracks().forEach(track=>track.stop());stream=null;detecting=false;}
async function camera(){
  if(!navigator.onLine)throw Error('Reconnect before scanning.');
  if(!navigator.mediaDevices?.getUserMedia)throw Error('Use Safari or Chrome over HTTPS, or enter the ticket code below.');
  stopCamera();result=null;document.querySelector('#result').replaceChildren();
  try{stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280}},audio:false});}catch{throw Error('Camera access is unavailable. Allow camera access in browser settings, or enter the ticket code below.');}
  const video=document.querySelector('#video');if(!video){stopCamera();return;}video.srcObject=stream;await video.play();document.querySelector('#camera').hidden=true;
  let detector;if('BarcodeDetector' in window){try{const formats=await BarcodeDetector.getSupportedFormats();if(formats.includes('qr_code'))detector=new BarcodeDetector({formats:['qr_code']});}catch{}}
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});let last=0;
  async function tick(time){if(!stream)return;if(time-last>200&&!detecting&&video.readyState>=2){last=time;detecting=true;try{
    let raw;if(detector)raw=(await detector.detect(video))[0]?.rawValue;
    else{canvas.width=Math.min(720,video.videoWidth);canvas.height=Math.round(canvas.width*video.videoHeight/video.videoWidth);ctx.drawImage(video,0,0,canvas.width,canvas.height);const image=ctx.getImageData(0,0,canvas.width,canvas.height);raw=window.jsQR?.(image.data,image.width,image.height,{inversionAttempts:'dontInvert'})?.data;}
    if(raw){await run(()=>check(raw));return;}
  }catch{}finally{detecting=false;}}if(stream)frame=requestAnimationFrame(tick);}
  frame=requestAnimationFrame(tick);
}
function connection(){const el=document.querySelector('#connection');el.textContent=navigator.onLine?'● Online checks':'● Offline · admission paused';el.className='connection'+(navigator.onLine?'':' offline');if(!navigator.onLine){view++;stopCamera();clearTimeout(expiryTimer);result=null;const target=document.querySelector('#result');if(target)target.replaceChildren();}const button=document.querySelector('#admit');if(button)button.disabled=!navigator.onLine||!document.querySelector('#id-checked')?.checked;}
app.addEventListener('submit',event=>{event.preventDefault();const data=Object.fromEntries(new FormData(event.target));run(async()=>{
  if(event.target.id==='login'){await auth({action:'login',...data});await refresh();}
  if(event.target.id==='verify'){await auth({action:'verify',...data});enrollment=null;await refresh();}
  if(event.target.id==='recover'){const result=await auth({action:'recover',...data});tell(result.message);}
  if(event.target.id==='recovery-code'||event.target.id==='invite-code'){await auth({action:event.target.id==='invite-code'?'invite-verify':'recovery-verify',...data});recovered=true;await refresh();}
  if(event.target.id==='manual')await check(data.token);
  if(event.target.id==='password'){if(data.password!==data.repeat)throw Error('The passwords do not match.');const result=await auth({action:'password',password:data.password});recovered=false;await refresh();tell(result.message);}
});});
app.addEventListener('click',event=>{const button=event.target.closest('button');if(!button)return;run(async()=>{
  if(button.id==='forgot')login(true);if(button.id==='back-login')login();if(button.id==='retry')await refresh();
  if(button.id==='logout'){stopCamera();result=null;await api('auth',{method:'DELETE'});session=null;recovered=false;login();}
  if(button.id==='enroll'){enrollment=await auth({action:'enroll'});mfa();}
  if(button.id==='camera')await camera();if(button.id==='admit')await admit();
  if(button.id==='next'){desk();await camera();}
  if(button.id==='change-password')passwordView();
  if(button.id==='install'&&installPrompt){await installPrompt.prompt();installPrompt=null;}
});});
app.addEventListener('change',event=>{if(event.target.id==='event'){selected=event.target.value;clearTimeout(expiryTimer);desk();}if(event.target.id==='id-checked')document.querySelector('#admit').disabled=!event.target.checked||!navigator.onLine;});
window.addEventListener('online',connection);window.addEventListener('offline',connection);
document.addEventListener('visibilitychange',()=>{if(document.hidden){view++;stopCamera();result=null;clearTimeout(expiryTimer);const target=document.querySelector('#result');if(target)target.replaceChildren();}else{const button=document.querySelector('#camera');if(button)button.hidden=false;}});
window.addEventListener('pagehide',stopCamera);
window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();installPrompt=event;});
async function start(){
  const link=new URLSearchParams(location.hash.slice(1));
  // Remove email credentials from the address/history before making any request.
  if(location.hash)history.replaceState(null,'',location.pathname+location.search);
  if(link.has('error')||link.has('error_description'))throw Error('This account link has expired or was already used. Request a new recovery email.');
  if(link.has('access_token')||link.has('refresh_token')){
    await auth({action:'email-link',type:link.get('type'),access_token:link.get('access_token'),refresh_token:link.get('refresh_token')});
    recovered=true;
  }
  await refresh();
}
connection();start().catch(error=>{login(true);tell(error.message,true);});
if('serviceWorker' in navigator)navigator.serviceWorker.register('/door/sw.js',{scope:'/door/'}).catch(()=>{});
