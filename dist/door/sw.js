// Cache the application shell only. Never cache sign-in, tickets, camera frames or API responses.
const CACHE='ringside-door-shell-v5-20261027';
const SHELL=['/door/','/door/door.css?v=20261027-4','/door/door.js?v=20261027-4','/door/icon.svg','/door/vendor/jsQR.js','/model.mjs'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('ringside-door-shell-')&&key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==location.origin||!SHELL.includes(url.pathname+url.search))return;
  event.respondWith(fetch(event.request,{cache:'no-store'}).catch(()=>caches.match(event.request).then(response=>response||Response.error())));
});
