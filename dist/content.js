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
    const esc=this.escape,event=c.event,closed=['draft','cancelled','postponed','sold out','completed'].includes(event.status);
    const withdrawn=ev=>ev.fighterStatus==='withdrawn'&&['scheduled','sold out'].includes(ev.status);
    const policy=ev=>`${withdrawn(ev)?`<h3>Options after a fight-card change</h3><p>${esc(ev.fighterChangePolicy)}</p>`:''}<h3>Refunds & cancellations</h3><p>${esc(ev.refundPolicy||'Contact the organiser with your booking reference for the applicable refund process.')}</p><h3>Transfers</h3><p>${esc(ev.transferPolicy||'Contact the organiser to discuss availability. A transfer needs your agreement.')}</p><p>${esc(ev.contactEmail||'')} ${esc(ev.contactPhone||c.contact.phone)}</p>`;
    const notice=ev=>`<article class="event-alert ${ev.status==='cancelled'?'is-cancelled':''}"><span class="event-badge">${withdrawn(ev)?'FIGHTER WITHDRAWN · EVENT GOING AHEAD':'EVENT '+esc(ev.status.toUpperCase())}</span><h2>${esc(withdrawn(ev)?ev.fighter+' will not be fighting.':ev.title)}</h2><p>${withdrawn(ev)?esc(ev.title)+' · ':''}${esc(ev.date)} · ${esc(ev.venue)}</p><p class="notice-reason">${esc(withdrawn(ev)?ev.fighterNotice:ev.cancellationReason||'Please read the organiser’s latest event update.')}</p>${withdrawn(ev)?'<p><strong>The boxing event is still going ahead as scheduled.</strong></p>':''}<p>${esc(ev.customerMessage||'Contact the organiser with your booking reference if this change affects your plans.')}</p><details><summary>Ticket-holder options & contact</summary>${policy(ev)}</details></article>`;
    if(['cancelled','postponed'].includes(event.status)||withdrawn(event)){
      const alert=document.createElement('section');alert.id='event-status';alert.className='event-status-section';alert.setAttribute('aria-label','Important event update');alert.innerHTML=notice(event);document.querySelector('main').prepend(alert);
      document.querySelectorAll('.poster-wrap').forEach(poster=>{poster.classList.add('event-stamped');const stamp=document.createElement('span');stamp.className='cancellation-stamp'+(withdrawn(event)?' fighter-withdrawal-stamp':'');stamp.textContent=withdrawn(event)?'FIGHTER WITHDRAWN':event.status.toUpperCase();poster.append(stamp);});
      const badge=document.querySelector('.hero-event>span');if(badge)badge.textContent=withdrawn(event)?'FIGHTER UPDATE · EVENT GOING AHEAD':'EVENT '+event.status.toUpperCase();
      document.querySelectorAll('.hero-copy .button,.fight-actions .button,header>.button').forEach(a=>{a.href='/events/#event-status';a.textContent=a.closest('header')?'Event update':withdrawn(event)?'Fighter update · Event going ahead':'Event '+event.status+' · Read update';});
      if(!withdrawn(event))document.querySelectorAll('.fight-actions>p').forEach(p=>p.hidden=true);
    }
    if(closed)document.querySelectorAll('.booking-box .button,.ticket-select').forEach(a=>{a.removeAttribute('href');a.setAttribute('aria-disabled','true');a.textContent='Event '+event.status;});
    document.querySelectorAll('.booking-policy,.ticket-note').forEach(p=>{p.textContent=event.refundPolicy;});
    document.querySelectorAll('footer a').forEach(a=>{if(a.textContent.includes('Ticket & refund'))a.href='/ticket-policy/';});
    if(location.pathname.startsWith('/events')){
      const previous=(c.eventNotices||[]).filter(ev=>ev.id!==event.id);
      if(previous.length){const archive=document.createElement('section');archive.className='section event-update-archive';archive.id='event-updates';archive.innerHTML='<div class="section-head"><h2>Event updates.</h2><p>Information for existing ticket holders.</p></div>'+previous.map(notice).join('');document.querySelector('main').append(archive);}
      const terms=document.createElement('section');terms.className='section event-policy';terms.innerHTML='<h2>Your booking terms.</h2>'+policy(event);document.querySelector('main').append(terms);
    }
    if(location.pathname.startsWith('/ticket-policy')){document.querySelector('main').innerHTML=`<section class="section event-policy"><span class="eyebrow">Ticket-holder information</span><h1>Refunds & transfers.</h1><p>These terms relate to ${esc(event.title)} · ${esc(event.date)}. For an older booking, use its private ticket link to see the terms for that event.</p>${policy(event)}<p>A cancellation notice does not mean a refund has already been processed. Contact the organiser with your booking reference. Transfers are optional and require confirmation; an old QR does not admit you to a different event.</p></section>`;}
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
