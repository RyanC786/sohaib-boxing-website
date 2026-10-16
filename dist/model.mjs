export const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function eventDates(event){
  const [year,month,day]=event.date.split('-').map(Number),[hour,minute]=event.time.split(':').map(Number);
  const wall=Date.UTC(year,month-1,day,hour,minute);
  const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  let timestamp=wall;
  for(let i=0;i<3;i++){const p=Object.fromEntries(parts.formatToParts(timestamp).map(x=>[x.type,x.value]));timestamp+=wall-Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute);}
  const p=Object.fromEntries(parts.formatToParts(timestamp).map(x=>[x.type,x.value]));
  if(`${p.year}-${p.month}-${p.day}`!==event.date||`${p.hour}:${p.minute}`!==event.time)throw Error('This UK date/time does not exist. Choose another time (check daylight-saving changes).');
  const fmt=o=>new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/London',...o}).format(timestamp);
  return {timestamp,long:fmt({day:'numeric',month:'long',year:'numeric'}),short:fmt({day:'numeric',month:'long'}),weekday:fmt({weekday:'long',day:'numeric',month:'long',year:'numeric'}),numeric:fmt({day:'2-digit',month:'2-digit',year:'2-digit'}).replaceAll('/','.')};
}
export function safeURL(value,image=false){
  return typeof value==='string'&&value.length<2048&&!/[\s\\<>"'\u0000-\u001f]/.test(value)&&(
    /^\/(?!\/)[a-zA-Z0-9/_?=&#.%+-]*$/.test(value)||/^https:\/\/[^/]+/i.test(value)||(!image&&/^(tel:\+?[0-9-]+|mailto:[^@]+@[^@]+)$/.test(value)));
}
export function validateContent(input){
  const c=JSON.parse(JSON.stringify(input));
  const check=(ok,message)=>{if(!ok)throw Error(message)};
  const str=(x,max=4000)=>typeof x==='string'&&x.length<=max;
  check(c?.version===1,'Unsupported content format.');
  check(c.event&&c.contact&&c.media&&c.text&&c.links,'Missing content sections.');
  for(const key of ['title','fighter','promoter','city','venue','tagline','policy','expiredMessage'])check(str(c.event[key],1000)&&c.event[key].trim().length>0,`Complete the event ${key}.`);
  check(/^\d{4}-\d{2}-\d{2}$/.test(c.event.date)&&/^\d{2}:\d{2}$/.test(c.event.time),'Choose an event date and time.');
  check(c.event.timezone==='Europe/London','The event timezone must be Europe/London.');eventDates(c.event);
  check(['scheduled','postponed','cancelled','sold out'].includes(c.event.status),'Choose a valid event status.');
  check(safeURL(c.event.bookingURL)&&c.event.bookingURL.startsWith('https://'),'Use an HTTPS booking address.');
  check(str(c.contact.phone,40)&&/^\+?[\d ()-]{7,40}$/.test(c.contact.phone),'Enter a valid contact telephone number.');
  check(Array.isArray(c.tickets)&&c.tickets.length>0&&c.tickets.length<=12,'Keep between 1 and 12 ticket categories.');
  for(const t of c.tickets){check(str(t.name,100)&&t.name.trim()&&str(t.desc)&&str(t.detail),'Complete the ticket name and descriptions.');check(Number.isFinite(t.price)&&t.price>=0&&t.price<=10000&&Math.abs(t.price*100-Math.round(t.price*100))<.00001,'Ticket prices need to be between £0 and £10,000, with at most 2 decimal places.');}
  check(Array.isArray(c.gallery)&&c.gallery.length>0&&c.gallery.length<=100,'Keep between 1 and 100 gallery photographs.');
  for(const p of c.gallery)check(Array.isArray(p)&&p.length===4&&p.every(x=>str(x,1000))&&Object.hasOwn(c.media,p[0])&&['Fight night','Training','Portraits'].includes(p[3]),'Check the gallery image, caption, alt text and category.');
  check(Object.keys(c.media).length<=200,'The image library is full.');
  for(const key of ['texture-ropes.jpg','pads-work.jpg','hero-painted-portrait.png','hero-painted-action.png','hero-painted-ring.png','sohaib-painted-portrait.png','b075c7a3-0007-49c9-ab43-9ce1fa01ba54.jpeg'])check(Object.hasOwn(c.media,key),'A required website image is missing.');
  for(const [key,m] of Object.entries(c.media)){check(/^[a-zA-Z0-9_.-]+$/.test(key)&&!['__proto__','constructor','prototype'].includes(key),'Invalid image identifier.');check(m&&safeURL(m.url,true)&&str(m.alt,500)&&/^\d{1,3}% \d{1,3}%$/.test(m.position)&&m.position.split(' ').every(v=>parseInt(v)<=100),'Check image address and crop position.');}
  for(const name of ['text','links','pages']){if(!c[name])c[name]={};check(Object.keys(c[name]).length<=1000,'Too many content fields.');for(const [key,value] of Object.entries(c[name])){check(str(key,5000)&&!['__proto__','constructor','prototype'].includes(key),'Invalid content field.');if(name==='links')check(safeURL(value),'Use a valid link address.');else if(name==='text')check(str(value,8000),'Page text is too long.');else check(str(value.title,160)&&str(value.description,320),'Page title or description is too long.');}}
  return c;
}
