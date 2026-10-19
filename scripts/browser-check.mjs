import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true,channel:'chrome'});
await fs.mkdir('output/door',{recursive:true});
try{
  const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:4173/door/');await page.waitForLoadState('networkidle');
  await page.getByRole('heading',{name:'Staff access awaits activation'}).waitFor();
  await page.screenshot({path:'output/door/activation-mobile.png',fullPage:true});
  let signedIn=false,used=false;
  await page.route('**/api/door/auth',async route=>route.fulfill({json:signedIn?{configured:true,authenticated:true,email:'staff@example.test',role:'scanner',mfaVerified:true,factors:[]}:{configured:true,authenticated:false}}));
  await page.route('**/api/door/events',route=>route.fulfill({json:[{id:'20000000-0000-4000-8000-000000000001',title:'TEST PREVIEW · Fight night',venue:'Test preview venue',startsAt:'2026-10-24T18:00:00Z',scanOpensAt:'2026-10-24T17:00:00Z',scanClosesAt:'2026-10-24T23:00:00Z'}]}));
  await page.route('**/api/door/scan',route=>{const data=route.request().postDataJSON();const status=used?'already_used':data.admit?'admitted':'valid';if(data.admit)used=true;return route.fulfill({json:{status,name:'TEST PREVIEW · Attendee',category:'VIP ringside',usedAt:used?'2026-10-24T18:00:00Z':null}});});
  await page.reload();await page.waitForLoadState('networkidle');await page.getByRole('heading',{name:'Staff sign-in'}).waitFor();
  await page.screenshot({path:'output/door/sign-in-mobile.png',fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  signedIn=true;await page.reload();await page.waitForLoadState('networkidle');
  await page.getByText('Camera unavailable? Enter the ticket code',{exact:true}).click();
  await page.getByLabel('43-character ticket code').fill('a'.repeat(43));await page.getByRole('button',{name:'Check ticket',exact:true}).click();
  await page.getByText('Check ID before entry',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Admit attendee',exact:true}).isDisabled(),true);
  await page.getByLabel('I have checked the name against their ID.').check();await page.getByRole('button',{name:'Admit attendee',exact:true}).click();await page.getByText('Admitted',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Check ticket',exact:true}).click();await page.getByText('Already used · do not admit',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Admit attendee',exact:true}).count(),0);
  await page.context().setOffline(true);await page.getByText('● Offline · admission paused',{exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Admit attendee',exact:true}).count(),0);await page.context().setOffline(false);
  await page.goto('http://127.0.0.1:4173/ticket/');await page.getByText('Open the private ticket link in your booking email to view your QR codes.').waitFor();
  await page.goto('http://127.0.0.1:4173/ticket/buy/');await page.getByRole('link',{name:'Current booking information'}).waitFor();
  // Synthetic email callback credentials only; no hosted account or email is used.
  signedIn=false;let linkReceived=false,mfaVerified=false;
  await page.route('**/api/door/auth',async route=>{
    const request=route.request(),data=request.method()==='POST'?request.postDataJSON():null;
    if(data?.action==='email-link'){
      assert.equal(new URL(page.url()).hash,'');
      assert.equal(data.type,'recovery');assert.equal(data.access_token,'synthetic-access');
      signedIn=true;linkReceived=true;return route.fulfill({json:{ok:true,recovered:true}});
    }
    if(data?.action==='verify'){mfaVerified=true;return route.fulfill({json:{ok:true}});}
    return route.fulfill({json:signedIn?{configured:true,authenticated:true,email:'staff@example.test',role:'owner',mfaVerified,factors:[{id:'test-factor',name:'Test authenticator'}]}:{configured:true,authenticated:false}});
  });
  await page.goto('http://127.0.0.1:4173/door/?next=admin#type=recovery&access_token=synthetic-access&refresh_token=synthetic-refresh');
  await page.getByRole('heading',{name:'Verify your authenticator'}).waitFor();
  assert.equal(linkReceived,true);assert.equal(new URL(page.url()).hash,'');
  assert.equal(await page.evaluate(()=>JSON.stringify({...localStorage,...sessionStorage}).includes('synthetic-access')),false);
  await page.getByLabel('Authenticator code').fill('123456');await page.getByRole('button',{name:'Verify and continue'}).click();
  await page.getByLabel('New password',{exact:true}).waitFor();assert.equal(new URL(page.url()).pathname,'/door/');
  await page.goto('http://127.0.0.1:4173/door/#error=access_denied&error_description=expired');
  await page.getByText('This account link has expired or was already used. Request a new recovery email.').waitFor();assert.equal(new URL(page.url()).hash,'');
  assert.deepEqual(errors,[]);console.log('Mobile scanner, duplicate/offline safety, inactive checkout and email recovery/MFA callback checks passed.');
}finally{await browser.close();}
