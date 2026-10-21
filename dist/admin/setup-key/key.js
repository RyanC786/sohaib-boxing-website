const consent=document.querySelector('#first-setup'),button=document.querySelector('#generate-key'),status=document.querySelector('#key-status');
consent.addEventListener('change',()=>{button.disabled=!consent.checked;});
button.addEventListener('click',async()=>{
  button.disabled=true;
  const bytes=new Uint8Array(32);
  try{
    if(!consent.checked||!window.isSecureContext||!navigator.clipboard?.writeText)throw Error();
    crypto.getRandomValues(bytes);
    await navigator.clipboard.writeText(Array.from(bytes,byte=>byte.toString(16).padStart(2,'0')).join(''));
    consent.disabled=true;button.textContent='Ticket key copied';
    status.textContent='Copied. Open Netlify and paste into the Production value for RINGSIDE_TICKET_KEY. Do not copy other text before pasting. This page has not saved the setting for you.';
  }catch{
    status.textContent='The browser could not copy a key. Allow clipboard access for this page if prompted, then try again. No setting has been changed.';button.disabled=!consent.checked;
  }finally{bytes.fill(0);}
});
