window.RingsideContent={
  async load(){
    const model=await import('/model.mjs');Object.assign(this,{escape:model.escapeHTML,dates:model.eventDates});
    const preview=new URLSearchParams(location.search).has('preview');
    const fallback=await fetch('/content-defaults.json').then(r=>{if(!r.ok)throw Error('Content unavailable');return r.json()});
    try{const r=await fetch(preview?'/api/admin/content':'/api/content',{cache:'no-store',signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error('Content service unavailable');const data=await r.json();return model.validateContent(preview?data.draft:data);}
    catch(error){if(preview)throw error;fallback.serviceUnavailable=true;return fallback;}
  },
  apply(c){
    const catalog=[],links=[],walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let node;
    const excluded='script,style,dialog,.menu-toggle,[data-managed],.countdown,.hero-event,.marquee,.hero-copy .button,.ticket-label,.ticket-card,.ticket-note,.booking-policy,.booking-section .eyebrow,.booking-box,.compact .section-head>p,.photo-card,#photo-count';
    while(node=walker.nextNode()){
      const key=node.textContent.trim();if(!key||node.parentElement.closest(excluded)||/^[•×‹›]$/.test(key))continue;
      if(key==='+44 7805 162717'){node.textContent=c.contact.phone;continue;}
      if(!catalog.includes(key))catalog.push(key);
      if(Object.hasOwn(c.text,key))node.textContent=c.text[key];
    }
    document.querySelectorAll('a[href]').forEach(a=>{
      const key=a.getAttribute('href');
      if(key.startsWith('tel:')){a.href='tel:'+c.contact.phone.replace(/[^+0-9]/g,'');return;}
      if(a.closest('.hero-event,.fight-actions,.ticket-card,.booking-box')||key.includes('#')||key.startsWith('/events/'))return;
      if(!links.some(l=>l.key===key))links.push({key,label:a.textContent.trim()});if(Object.hasOwn(c.links,key))a.href=c.links[key];
    });
    document.querySelectorAll('img').forEach(img=>{const match=Object.entries(c.media).find(([k,m])=>m.url===img.getAttribute('src'));if(match){const [k,m]=match;if(m.customCrop)img.style.objectPosition=m.position;if(m.alt)img.alt=m.alt;}});
    const root=document.documentElement;
    for(const [variable,key] of [['--ring-image','texture-ropes.jpg'],['--camp-image','pads-work.jpg']])root.style.setProperty(variable,`url("${c.media[key].url}")`);
    for(const [variable,key] of [['--ring-position','texture-ropes.jpg'],['--camp-position','pads-work.jpg']])if(c.media[key].customCrop)root.style.setProperty(variable,c.media[key].position);
    if(['cancelled','postponed','sold out'].includes(c.event.status))document.querySelectorAll('.booking-box .button,.ticket-select').forEach(a=>{a.removeAttribute('href');a.setAttribute('aria-disabled','true');a.textContent='Event '+c.event.status;});
    if(c.serviceUnavailable){const warning=document.createElement('p');warning.className='draft-banner';warning.textContent='Live event updates unavailable · Contact the team before booking';document.body.append(warning);document.querySelectorAll('.booking-box .button,.ticket-select').forEach(a=>{a.removeAttribute('href');a.setAttribute('aria-disabled','true');a.textContent='Contact the team to book';});}
    const path=location.pathname.replace(/\/$/,'')||'/';
    const page=c.pages?.[path];if(page){document.title=page.title;document.querySelector('meta[name="description"]').content=page.description;}
    if(new URLSearchParams(location.search).has('preview')){
      document.querySelectorAll('a[href^="/"]').forEach(a=>{const url=new URL(a.href,location.origin);url.searchParams.set('preview','1');a.href=url.pathname+url.search+url.hash;});
      const banner=document.createElement('div');banner.className='draft-banner';banner.textContent='DRAFT PREVIEW · Not visible to visitors';document.body.append(banner);
      if(parent!==window)parent.postMessage({type:'ringside-catalog',path,text:catalog,links,title:document.title,description:document.querySelector('meta[name="description"]').content},location.origin);
    }
  }
};
