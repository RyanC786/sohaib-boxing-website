import {escapeHTML as e} from '/model.mjs';
const app=document.querySelector('#app'),notice=document.querySelector('#notice');
let session,events=[],stream,frame,detecting=false,busy=false,result,selected='',enrollment,installPrompt,noticeTimer,expiryTimer,backgroundTimer,recovered=false,view=0,resumePending=false,cameraStarting=false,cameraVersion=0;
const SCANNER_VERSION='2026.10.27.3';
function cameraStatus(text){const target=document.querySelector('#camera-status');if(target)target.textContent=text;}
const stamp=value=>new Date(value).toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/London'});
const field=(label,name,type='text',attrs='')=>`<label class="field">${label}<input name="${name}" type="${type}" required ${attrs}></label>`;
function tell(text,error=false){notice.textContent=text;notice.className=error?'error':'';notice.style.display='block';clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>notice.style.display='none',9000);}
async function api(path,options={}){
  if(!navigator.onLine)throw Error('You are offline. Reconnect before checking or admitting a ticket.');
  let response;try{response=await fetch('/api/door/'+path,{cache:'no-store',credentials:'same-origin',...options,headers:{'Content-Type':'application/json',...options.headers},signal:AbortSignal.timeout(18000)});}catch{throw Error('Connection lost. Do not admit until the ticket is checked again.');}
  const data=await response.json();if(!response.ok){if(response.status===401){stopCamera('Camera paused because your sign-in needs to be renewed.');result=null;}throw Error(data.error||'The request could not be completed.');}return data;
}
const auth=data=>api('auth',{method:'POST',body:JSON.stringify(data)});
async function run(work){if(busy)return;busy=true;document.querySelectorAll('button,input,select').forEach(b=>b.disabled=true);try{await work();}catch(error){tell(error.message,true);}finally{busy=false;document.querySelectorAll('button,input,select').forEach(b=>b.disabled=false);const admit=document.querySelector('#admit');if(admit)admit.disabled=!document.querySelector('#id-checked')?.checked||!navigator.onLine;if(resumePending&&!document.hidden){resumePending=false;void resumeDesk();}}}
function installCard(){return `<details class="rule"><summary>Install on your phone</summary><p class="help">iPhone: open this page in Safari, tap Share, then Add to Home Screen. Android: use your browser’s Install app or Add to Home screen option.</p>${installPrompt?'<button id="install" class="quiet wide">Install Ringside Door</button>':''}<p class="help">Installation does not grant access. Every staff member needs an invited account, an authenticator and an event assignment.</p></details>`;}
function login(recovery=false){
  stopCamera();app.innerHTML=`<div class="eyebrow">Fight night · Staff entrance</div><h1>The right people.<br><span class="gold">Through the ropes.</span></h1><div class="login-layout"><div class="intro"><p>Scan the ticket. Check their ID. Welcome them to fight night.</p><span class="badge">INVITED STAFF ONLY</span>${installCard()}</div><section class="panel"><h2>${recovery?'Recover your account':'Staff sign-in'}</h2><form id="${recovery?'recover':'login'}">${field('Staff email','email','email','autocomplete="username" maxlength="254"')}${recovery?'':field('Password','password','password','autocomplete="current-password" maxlength="128"')+'<label class="check-id"><input name="remember" type="checkbox">Keep me logged in on this device</label><p class="help">Stay signed in for up to 12 hours, including after calls or switching apps. Use only on a phone you control. Sign out when your shift ends.</p>'}<button class="wide">${recovery?'Send recovery email':'Sign in securely'}</button></form><button class="text-button" id="${recovery?'back-login':'forgot'}">${recovery?'Back to sign-in':'Forgot your password?'}</button>${!recovery?`<details><summary>Activate a staff invitation</summary><form id="invite-code">${field('Invited email','email','email','autocomplete="username"')}${field('Invitation code','code','text','inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,10}"')}<button class="quiet wide">Activate my invitation</button></form></details>`:''}${recovery?`<details open><summary>I have a recovery code</summary><form id="recovery-code">${field('Staff email','email','email','autocomplete="username"')}${field('Email recovery code','code','text','inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,10}"')}<button class="quiet wide">Verify recovery code</button></form></details>`:''}</section></div>`;
}
function mfa(){
  stopCamera();const factors=session.factors||[];
  app.innerHTML=`<div class="eyebrow">Secure staff access</div><h1>One more<br><span class="gold">check.</span></h1><section class="panel"><h2>${factors.length?'Verify your authenticator':'Set up your authenticator'}</h2><p>${factors.length?'Enter the current six-digit code from your authenticator app.':'Connect an authenticator app to protect your staff account. You will need it each time you sign in.'}</p>${!factors.length&&!enrollment?'<button id="enroll" class="wide">Set up authenticator</button>':''}${enrollment?`<img class="auth-qr" src="${e(enrollment.qr.startsWith('data:')?enrollment.qr:'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(enrollment.qr))}" alt="Scan this setup QR with your authenticator app"><details><summary>Enter setup key manually</summary><code class="setup-key">${e(enrollment.secret)}</code></details>`:''}${factors.length||enrollment?`<form id="verify">${factors.length>1?`<label class="field">Authenticator<select name="factorId">${factors.map(f=>`<option value="${e(f.id)}">${e(f.name||'Authenticator')}</option>`).join('')}</select></label>`:`<input name="factorId" type="hidden" value="${e(factors[0]?.id||enrollment.id)}">`}${field('Authenticator code','code','text','inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6"')}<button class="wide">Verify and continue</button></form>`:''}</section>${toolbar()}`;
}
function toolbar(){return `<div class="toolbar"><small>${e(session?.email||'Staff account')}</small><button id="logout" class="quiet">Sign out</button></div><p class="help">Scanner version ${SCANNER_VERSION}</p>`;}
async function refresh({preserveCamera=false}={}){
  const previousRole=session?.role;
  session=await api('auth');enrollment=null;
  if(!session.configured){app.innerHTML=`<div class="eyebrow">Ringside Door</div><h1>The door desk<br><span class="gold">is getting ready.</span></h1><section class="panel"><h2>Staff access awaits activation</h2><p>The organiser is connecting secure staff accounts and event assignments. Once activated, you can sign in here.</p><button id="retry" class="quiet">Check again</button>${installCard()}</section>`;return;}
  if(!session.authenticated){login();return;}
  if(!session.mfaVerified){mfa();return;}
  if(recovered){passwordView();return;}
  if(new URLSearchParams(location.search).get('next')==='demo'&&session.role==='owner'){location.assign('/ticket/buy/?demo=1');return;}
  if(session.role==='editor'||new URLSearchParams(location.search).get('next')==='admin'&&session.role==='owner'){location.assign('/admin/');return;}
  const previousEvents=JSON.stringify(events);
  events=await api('events');
  // Camera permission UI can briefly hide a mobile PWA. Revalidate access on
  // return without replacing an unchanged desk and destroying its new stream.
  if(preserveCamera&&stream&&document.querySelector('#video')?.srcObject===stream&&previousEvents===JSON.stringify(events)&&previousRole===session.role)return;
  desk();
}
function passwordView(){stopCamera();app.innerHTML=`<div class="eyebrow">Account security</div><h1>Your password.<br><span class="gold">Your access.</span></h1><section class="panel"><p>Use a unique password of at least 14 characters. Changing it signs out your other devices.</p><form id="password">${field('New password','password','password','autocomplete="new-password" minlength="14" maxlength="128"')}${field('Repeat new password','repeat','password','autocomplete="new-password" minlength="14" maxlength="128"')}<button class="wide">Change password</button></form><button id="retry" class="text-button">Back to scanner</button></section>${toolbar()}`;}
function desk(){
  view++;stopCamera();result=null;selected=events.some(event=>event.id===selected)?selected:events[0]?.id||'';
  app.innerHTML=`<div class="eyebrow">Admission desk · Online checks</div><h1>Ready for<br><span class="gold">fight night.</span></h1>${events.length?`<label class="field">Your assigned event<select id="event">${events.map(event=>`<option value="${e(event.id)}" ${event.id===selected?'selected':''}>${e(event.title)} · ${e(stamp(event.startsAt))}</option>`).join('')}</select></label><p id="venue" class="help"></p><div id="scan-area"><div class="scanner"><video id="video" playsinline muted aria-label="Ticket scanning camera"></video><div class="viewfinder" aria-hidden="true"></div><button id="camera" class="start-camera">Open ticket camera</button><span class="camera-label">Centre the ticket QR inside the frame</span></div><p id="camera-status" class="help" role="status">Camera ready. Tap Open ticket camera.</p></div><div id="result" aria-live="polite"></div><details class="panel"><summary>Enter a ticket code instead</summary><form id="manual">${field('43-character ticket code','token','text','autocomplete="off" autocapitalize="none" spellcheck="false" minlength="43" maxlength="43"')}<button class="quiet wide">Check ticket</button></form></details>`:`<section class="panel"><h2>No events assigned yet</h2><p>Ask the organiser to assign your account to the event. Only your assigned events will appear here.</p><button id="retry" class="quiet">Refresh events</button></section>`}${toolbar()}<button id="change-password" class="text-button">Change my password</button>${installCard()}`;
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
  cameraStatus('QR read. Checking this ticket securely…');
  let data;
  try{data=await api('scan',{method:'POST',body:JSON.stringify({event:eventId,token,admit:false})});}
  catch(error){if(version===view){cameraStatus('Ticket check failed. Entry has not been confirmed.');const target=document.querySelector('#result');target.innerHTML=`<section class="result invalid"><h2>Ticket check could not finish</h2><p>${e(error.message)}</p><p>Do not admit until a fresh check succeeds.</p><button id="next" class="quiet wide">Try scanning again</button></section>`;target.scrollIntoView?.({block:'center'});}throw error;}
  if(version!==view||!navigator.onLine)return;
  result={...data,token,event:eventId};showResult();
  cameraStatus('Ticket read. Review the admission result below.');
  if(data.status==='valid')expiryTimer=setTimeout(()=>{result=null;const target=document.querySelector('#result');if(target){target.innerHTML='<div class="panel"><h2>Check expired</h2><p>Scan the ticket again before admitting.</p><button id="next" class="quiet">Scan again</button></div>'; }},60000);
}
function showResult(){
  const labels={valid:'Check ID before entry',admitted:'Admitted',already_used:'Already used · do not admit',invalid:'Ticket not valid',closed:'Admission is closed'};
  const descriptions={valid:'Compare this name with the attendee’s ID, then confirm admission.',admitted:'Entry is recorded. Welcome them to fight night.',already_used:`This ticket was admitted at ${result.usedAt?stamp(result.usedAt):'an earlier time'}. Ask the supervisor to help.`,invalid:'This ticket is not valid for this event. Ask the supervisor to check the booking.',closed:'This event is outside its admission window, postponed, cancelled or completed.'};
  const status=Object.hasOwn(labels,result.status)?result.status:'invalid';
  document.querySelector('#result').innerHTML=`<section class="result ${status}"><div class="state">${e(labels[status])}</div>${result.name?`<div class="attendee">${e(result.name)}</div><div class="ticket-type">${e(result.category)}</div>`:''}<p>${e(descriptions[status])}</p>${status==='valid'?'<label class="check-id"><input id="id-checked" type="checkbox">I have checked the name against their ID.</label><button id="admit" class="wide" disabled>Admit attendee</button>':''}<button id="next" class="quiet wide" style="margin-top:12px">Scan next ticket</button></section>`;
  document.querySelector('#result').scrollIntoView?.({block:'center',behavior:'smooth'});
}
async function admit(){
  if(!result||result.status!=='valid'||result.event!==selected||!document.querySelector('#id-checked')?.checked)throw Error('Scan the ticket and check ID first.');
  clearTimeout(expiryTimer);const token=result.token,version=view;
  // An uncertain network result must be checked again, never assumed admitted.
  try{const data=await api('scan',{method:'POST',body:JSON.stringify({event:selected,token,admit:true})});if(version!==view||!navigator.onLine)return;result=data;showResult();}
  catch(error){result=null;document.querySelector('#result').innerHTML='<section class="result invalid"><h2>Entry not confirmed</h2><p>Scan this ticket again. If the server recorded entry, it will show “Already used”. Ask the supervisor before letting the attendee through.</p><button id="next" class="quiet wide">Check again</button></section>';throw error;}
}
function stopCamera(reason='Camera paused. Tap Open ticket camera to start.'){cameraVersion++;cancelAnimationFrame(frame);if(stream)stream.getTracks().forEach(track=>track.stop());stream=null;detecting=false;const button=document.querySelector('#camera');if(button)button.hidden=false;cameraStatus(reason);}
async function cameraVisible(version){
  if(!document.hidden)return true;
  // Android can resolve permission while its system permission sheet is still
  // dismissing. Wait for foreground before attaching/playing the preview.
  await new Promise(resolve=>{
    const visible=()=>{if(!document.hidden)done();};
    const done=()=>{clearTimeout(timeout);document.removeEventListener('visibilitychange',visible);resolve();};
    const timeout=setTimeout(done,3000);document.addEventListener('visibilitychange',visible);
  });
  return version===cameraVersion&&!document.hidden;
}
async function camera(){
  if(!navigator.onLine)throw Error('Reconnect before scanning.');
  if(!navigator.mediaDevices?.getUserMedia)throw Error('Use Safari or Chrome over HTTPS, or enter the ticket code below.');
  stopCamera();result=null;document.querySelector('#result').replaceChildren();
  const version=cameraVersion,video=document.querySelector('#video');cameraStarting=true;cameraStatus('Opening camera. Allow camera access if Android asks.');
  try{
    const opened=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280}},audio:false});
    if(version!==cameraVersion||!(await cameraVisible(version))||video!==document.querySelector('#video')){opened.getTracks().forEach(track=>track.stop());cameraStatus('Camera opening was interrupted. Return to this app and tap Open ticket camera again.');return;}
    stream=opened;video.srcObject=stream;video.muted=true;await video.play();
    if(version!==cameraVersion||!(await cameraVisible(version))){if(version===cameraVersion)stopCamera();return;}
    document.querySelector('#camera').hidden=true;cameraStatus('Camera on. Point the rear camera at the ticket QR.');
    for(const track of stream.getVideoTracks())track.addEventListener('ended',()=>{if(version===cameraVersion){stopCamera();cameraStatus('Android stopped the camera. Close other camera apps, then tap Open ticket camera.');tell('Camera was interrupted. Tap Open ticket camera to restart.',true);}},{once:true});
  }catch(error){
    if(version===cameraVersion)stopCamera();
    const messages={NotAllowedError:'Camera permission is blocked. In Android settings, allow camera access for this app and Chrome, then reopen the scanner.',NotFoundError:'No camera was found. Check that the phone camera is available, then reopen the scanner.',NotReadableError:'Android could not start the camera. Close other apps using it, then reopen the scanner.',AbortError:'Android interrupted camera startup. Close other camera apps and try again.'};
    const message=messages[error.name]||'The camera preview could not start. Close other camera apps and tap Open ticket camera to retry.';cameraStatus(message);throw Error(message);
  }
  finally{cameraStarting=false;}
  // Use one bundled decoder on both platforms, without waiting for an Android
  // barcode service during camera startup.
  if(typeof window.jsQR!=='function'){stopCamera('The QR reader did not load. Refresh the scanner while online, then try again.');return;}
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});let last=0;
  async function tick(time){if(!stream||version!==cameraVersion)return;if(!document.hidden&&time-last>200&&!detecting&&video.readyState>=2){last=time;detecting=true;try{
    canvas.width=Math.min(720,video.videoWidth);canvas.height=Math.round(canvas.width*video.videoHeight/video.videoWidth);ctx.drawImage(video,0,0,canvas.width,canvas.height);const image=ctx.getImageData(0,0,canvas.width,canvas.height);const raw=window.jsQR(image.data,image.width,image.height,{inversionAttempts:'dontInvert'})?.data;
    if(version!==cameraVersion)return;
    if(raw&&ticketToken(raw.trim())&&!busy){await run(()=>check(raw));return;}
  }catch{}finally{detecting=false;}}if(stream&&version===cameraVersion)frame=requestAnimationFrame(tick);}
  frame=requestAnimationFrame(tick);
}
function connection(){const el=document.querySelector('#connection');el.textContent=navigator.onLine?'● Online checks':'● Offline · admission paused';el.className='connection'+(navigator.onLine?'':' offline');if(!navigator.onLine){view++;stopCamera('Camera paused because the phone went offline. Reconnect, then open the camera again.');clearTimeout(expiryTimer);result=null;const target=document.querySelector('#result');if(target)target.replaceChildren();}const button=document.querySelector('#admit');if(button)button.disabled=!navigator.onLine||!document.querySelector('#id-checked')?.checked;}
app.addEventListener('submit',event=>{event.preventDefault();const data=Object.fromEntries(new FormData(event.target));run(async()=>{
  if(event.target.id==='login'){await auth({action:'login',...data,remember:data.remember==='on'});await refresh();}
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
async function resumeDesk(){
  if(!session?.authenticated||!session.mfaVerified)return;
  if(busy){resumePending=true;return;}
  if(!navigator.onLine){connection();return;}
  await run(async()=>{try{await refresh({preserveCamera:true});}catch(error){stopCamera('Camera paused because staff access could not be rechecked. '+error.message);throw error;}});
}
document.addEventListener('visibilitychange',()=>{clearTimeout(backgroundTimer);if(document.hidden){view++;if(!cameraStarting)backgroundTimer=setTimeout(()=>{if(document.hidden)stopCamera('Camera paused because the scanner went into the background. Tap Open ticket camera to resume.');},750);result=null;clearTimeout(expiryTimer);const target=document.querySelector('#result');if(target)target.replaceChildren();}else{const button=document.querySelector('#camera');if(button)button.hidden=Boolean(stream);void resumeDesk();}});
window.addEventListener('pagehide',()=>stopCamera('Camera paused because this page was left. Reopen the scanner to continue.'));
window.addEventListener('pageshow',event=>{if(event.persisted)void resumeDesk();});
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
