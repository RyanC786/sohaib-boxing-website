// Create a self-contained phone backup locally; nothing is uploaded or stored.
export async function ticketImage(order,ticket){
  if(ticket.status!=='valid'||!ticket.qr)throw Error('Only a currently valid ticket can be downloaded.');
  const qr=new Image();qr.src=ticket.qr;await qr.decode();
  const canvas=document.createElement('canvas');canvas.width=1000;canvas.height=6000;
  const ctx=canvas.getContext('2d');ctx.fillStyle='#ffffff';ctx.fillRect(0,0,1000,6000);
  ctx.fillStyle='#b18c39';ctx.fillRect(0,0,1000,18);ctx.fillStyle='#151611';let y=76;
  const line=(text,size=28,bold=false)=>{
    ctx.font=`${bold?'700':'400'} ${size}px Arial`;let row='';
    // Wrap by characters as well as spaces so long names/references cannot escape.
    for(const char of String(text||'')){
      if(char==='\n'||ctx.measureText(row+char).width>880){ctx.fillText(row,60,y);y+=size*1.35;row=char==='\n'?'':char;}else row+=char;
    }
    if(row){ctx.fillText(row,60,y);y+=size*1.35;}y+=10;
  };
  line('SOHAIB MOHAMMED · DIGITAL ADMISSION',24,true);
  line(order.event,38,true);line(new Date(order.startsAt).toLocaleString('en-GB',{dateStyle:'full',timeStyle:'short',timeZone:'Europe/London'}),26);line(order.venue,26);
  line('ATTENDEE · BRING MATCHING ID',22,true);line(ticket.name,36,true);line(ticket.category,28);
  // QR at native integer scale: 360 x 360 exported at 720 x 720.
  const qrY=Math.max(y+15,650);
  return finish(canvas,qr,qrY,order,ticket);
}
function finish(header,qr,qrY,order,ticket){
  const canvas=document.createElement('canvas');canvas.width=1000;canvas.height=Math.max(1700,qrY+1010);
  const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(header,0,0,1000,qrY,0,0,1000,qrY);
  ctx.imageSmoothingEnabled=false;ctx.drawImage(qr,140,qrY,720,720);
  ctx.fillStyle='#151611';ctx.font='22px Arial';
  const lines=['Keep this ticket private. One admission per attendee.',
    'Saved copies remain subject to live checks at the door.',
    'Refunded, revoked or already-used tickets cannot admit.',
    'ORDER '+order.reference,'TICKET '+ticket.id];
  lines.forEach((text,index)=>ctx.fillText(text,60,qrY+760+index*38));
  return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(Error('The ticket image could not be created.')),'image/png'));
}
