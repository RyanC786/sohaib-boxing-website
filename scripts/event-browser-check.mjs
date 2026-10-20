// Isolated synthetic API responses only. Never publishes a cancellation or emails a real buyer.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import defaults from '../dist/content-defaults.json' with {type:'json'};
import {validateContent} from '../dist/model.mjs';
import {initialState} from '../server/content-service.mjs';
const content=validateContent(defaults);Object.assign(content.event,{status:'cancelled',cancellationReason:'TEST PREVIEW · Venue unavailable',customerMessage:'Please contact the organiser to arrange your refund or discuss an optional transfer.'});
const withdrawal=structuredClone(content);Object.assign(withdrawal.event,{status:'scheduled',fighterStatus:'withdrawn',fighterNotice:'Sohaib Mohammed has withdrawn due to injury and will not be fighting.',cancellationReason:'',customerMessage:'Contact the organiser with your booking reference if this change affects your plans.'});
const browser=await chromium.launch({headless:true,channel:'chrome'});await fs.mkdir('output/events',{recursive:true});
try{
  for(const width of [1440,390]){
    const page=await browser.newPage({viewport:{width,height:950},serviceWorkers:'block'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.route('**/api/content',route=>route.fulfill({json:content}));await page.goto('http://127.0.0.1:4173/events/');await page.waitForLoadState('networkidle');
    await page.getByText('EVENT CANCELLED',{exact:true}).waitFor();await page.locator('.cancellation-stamp').waitFor();
    assert.equal(await page.locator('.booking-box .button').getAttribute('href'),null);assert.equal(await page.locator('.ticket-select[href]').count(),0);
    assert.equal(await page.locator('.countdown [data-time]').count(),0);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:`output/events/cancellation-${width}.png`});await page.locator('#next-fight').screenshot({path:`output/events/poster-${width}.png`});
    await page.goto('http://127.0.0.1:4173/ticket-policy/');await page.getByRole('heading',{name:'Refunds & transfers.'}).waitFor();
    await page.unroute('**/api/content');await page.route('**/api/content',route=>route.fulfill({json:withdrawal}));
    await page.goto('http://127.0.0.1:4173/events/');await page.waitForLoadState('networkidle');await page.getByRole('heading',{name:'Sohaib Mohammed will not be fighting.'}).waitFor();
    assert.equal(await page.locator('.event-badge').textContent(),'FIGHTER WITHDRAWN · EVENT GOING AHEAD');
    assert.equal(await page.locator('.fighter-withdrawal-stamp').textContent(),'FIGHTER WITHDRAWN');
    assert.ok(await page.locator('.booking-box .button').getAttribute('href'));assert.equal(await page.locator('.ticket-select[href]').count(),4);assert.equal(await page.locator('.countdown [data-time]').count(),4);
    assert.equal((await page.locator('.fight-grid').innerText()).includes('Featuring Sohaib Mohammed'),false);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    await page.screenshot({path:`output/events/withdrawal-${width}.png`});await page.locator('#next-fight').screenshot({path:`output/events/withdrawal-poster-${width}.png`});
    assert.deepEqual(errors,[]);await page.close();
  }
  const page=await browser.newPage({viewport:{width:1440,height:1000},serviceWorkers:'block'});let state={...initialState(validateContent(defaults)),workflowReady:true};
  await page.route('**/api/session',r=>r.fulfill({json:{authenticated:true}}));
  await page.route('**/api/admin/content',r=>{const req=r.request();if(req.method()==='POST'){const data=req.postDataJSON();if(data.action==='save')state.draft=data.content;if(data.action==='publish')state.published=structuredClone(state.draft);state.revision=crypto.randomUUID();}return r.fulfill({json:state});});
  await page.route('**/api/admin/events',r=>r.fulfill({json:{role:'owner',emailEnabled:false,events:[{id:content.event.id,event:content.event,tickets:content.tickets,paidOrders:4,deliveries:{pending:4,sent:0,failed:0}}],requests:[]}}));
  page.on('dialog',dialog=>dialog.accept());
  await page.goto('http://127.0.0.1:4173/admin/');await page.waitForLoadState('networkidle');await page.locator('nav [data-tab=event]').click();
  await page.getByRole('button',{name:'+ Create another event'}).click();await page.getByLabel('Event title',{exact:true}).fill('TEST PREVIEW · Next month');
  assert.equal(await page.getByLabel('Event status').inputValue(),'draft');await page.getByRole('button',{name:'Save draft',exact:true}).click();
  await page.getByText('Draft saved. The public website is unchanged.',{exact:true}).waitFor();assert.notEqual(state.draft.event.id,content.event.id);assert.ok(state.draft.tickets.every(t=>t.enabled===false));assert.equal(state.draft.event.fighterStatus,'confirmed');
  await page.locator('[data-tab=ticketing]').click();await page.getByRole('heading',{name:'Every night. Every booking.'}).waitFor();await page.getByText('4 paid bookings',{exact:false}).waitFor();await page.screenshot({path:'output/events/ticket-office.png'});
  let requested=false;
  await page.route('**/api/ticket/receipt',r=>r.fulfill({json:{reference:'TEST-ORDER',event:'TEST PREVIEW · Fight night',venue:'Test venue',startsAt:'2030-10-24T18:00:00Z',eventStatus:'cancelled',eventDetails:content.event,tickets:[{id:'test-ticket',name:'Test Guest',category:'VIP',status:'event_cancelled'}]}}));
  await page.route('**/api/ticket/request',r=>{const data=r.request().postDataJSON();assert.equal(data.kind,'refund');assert.equal(data.token,'r'.repeat(43));requested=true;return r.fulfill({json:{message:'Your request is recorded.'}});});
  await page.goto('http://127.0.0.1:4173/ticket/#receipt='+'r'.repeat(43));await page.getByRole('heading',{name:'EVENT CANCELLED'}).waitFor();assert.equal(await page.locator('.qr').count(),0);assert.equal(new URL(page.url()).hash,'');
  await page.getByRole('button',{name:'Send request'}).click();await page.getByText('Your request is recorded.').waitFor();assert.equal(requested,true);await page.close();
  console.log('Desktop/mobile cancellation and fighter withdrawal, open/closed booking, policy page, new-event identity, email queue status and customer refund request passed.');
}finally{await browser.close();}
