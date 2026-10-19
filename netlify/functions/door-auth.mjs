import {configuration,client,doorSession,staffAccess,body,fail,response,errorResponse,doorCookie} from '../../server/door-auth.mjs';
import {json,sameOrigin} from '../../server/auth.mjs';

export default async req=>{
  const config=configuration();
  if(!config)return json({configured:false,error:'Staff sign-in is awaiting activation by the organiser.'},req.method==='GET'?200:503);
  try{
    if(req.method==='DELETE'){
      if(!sameOrigin(req))throw fail('Invalid request origin.',403);
      try{const s=await doorSession(req,config);await s.supabase.auth.signOut({scope:'local'});}catch{}
      return json({ok:true},200,{'Set-Cookie':doorCookie('',0)});
    }
    if(req.method==='GET'){
      try{
        const s=await doorSession(req,config),access=await staffAccess(s.supabase,false,['owner','editor','scanner']);
        const factors=await s.supabase.auth.mfa.listFactors();if(factors.error)throw fail('Cannot check authenticator settings.',503);
        return response({configured:true,authenticated:true,email:s.user.email,...access,factors:factors.data.totp.filter(f=>f.status==='verified').map(f=>({id:f.id,name:f.friendly_name}))},s.session,config);
      }catch(error){if(error.status===401)return json({configured:true,authenticated:false},200,{'Set-Cookie':doorCookie('',0)});throw error;}
    }
    if(req.method!=='POST')return json({error:'Method not allowed.'},405);
    const data=await body(req);
    if(data.action==='login'){
      if(typeof data.email!=='string'||typeof data.password!=='string'||data.password.length>1024)throw fail('Enter your email and password.');
      const supabase=client(config),result=await supabase.auth.signInWithPassword({email:data.email,password:data.password});
      if(result.error||!result.data.session)throw fail('Sign-in failed. Check your email and password.',401);
      try{await staffAccess(supabase,false,['owner','editor','scanner']);}catch(error){await supabase.auth.signOut({scope:'local'});throw error;}
      return response({ok:true},result.data.session,config);
    }
    if(data.action==='recover'){
      if(typeof data.email!=='string'||data.email.length>254)throw fail('Enter your email address.');
      const destination=new URL('/door/?next=admin',req.url).href;
      const result=await client(config).auth.resetPasswordForEmail(data.email.trim(),{redirectTo:destination});
      if(result.error)throw fail('Recovery email could not be sent. Please wait a few minutes and try again, or contact the organiser.',503);
      return json({message:'If that account exists, a recovery email will arrive. Open its reset link, or enter its recovery code below.'});
    }
    if(data.action==='email-link'){
      if(!['recovery','invite'].includes(data.type)||!['access_token','refresh_token'].every(key=>typeof data[key]==='string'&&data[key].length>0&&data[key].length<=4096))throw fail('This account link is invalid. Request a new recovery email.');
      const supabase=client(config),result=await supabase.auth.setSession({access_token:data.access_token,refresh_token:data.refresh_token});
      if(result.error||!result.data.session)throw fail('This account link has expired. Request a new recovery email.',401);
      const verified=await supabase.auth.getUser();
      if(verified.error||!verified.data.user?.email_confirmed_at)throw fail('This account link could not be verified.',401);
      await staffAccess(supabase,false,['owner','editor','scanner']);
      return response({ok:true,recovered:true},result.data.session,config);
    }
    if(data.action==='recovery-verify'||data.action==='invite-verify'){
      if(typeof data.email!=='string'||! /^\d{6,10}$/.test(data.code||''))throw fail('Enter the recovery code from your email.');
      const supabase=client(config),result=await supabase.auth.verifyOtp({email:data.email,token:data.code,type:data.action==='invite-verify'?'invite':'recovery'});
      if(result.error||!result.data.session)throw fail('That code has expired or is incorrect.',401);
      await staffAccess(supabase,false,['owner','editor','scanner']);return response({ok:true,recovered:true},result.data.session,config);
    }
    const s=await doorSession(req,config);await staffAccess(s.supabase,false,['owner','editor','scanner']);
    if(data.action==='enroll'){
      const existing=await s.supabase.auth.mfa.listFactors();if(existing.error)throw fail('Cannot check authenticator settings.',503);
      if(existing.data.totp.some(f=>f.status==='verified'))throw fail('Use your existing authenticator. Ask the organiser if you have lost access.',409);
      for(const f of existing.data.all.filter(f=>f.factor_type==='totp'&&f.status==='unverified')){
        const removed=await s.supabase.auth.mfa.unenroll({factorId:f.id});
        if(removed.error)throw fail('Cannot restart authenticator setup. Try again shortly.',503);
      }
      const {data:factor,error}=await s.supabase.auth.mfa.enroll({factorType:'totp',friendlyName:'Ringside door',issuer:'Ringside'});
      if(error)throw fail('Authenticator setup failed. Try again.',503);
      return response({id:factor.id,qr:factor.totp.qr_code,secret:factor.totp.secret},s.session,config);
    }
    if(data.action==='verify'){
      if(! /^\d{6}$/.test(data.code||'')||typeof data.factorId!=='string')throw fail('Enter the six-digit authenticator code.');
      const factors=await s.supabase.auth.mfa.listFactors();
      if(factors.error)throw fail('Cannot check authenticator settings. Try again shortly.',503);
      // Supabase puts pending enrolments in `all`; `totp` contains verified factors only.
      if(!factors.data.all.some(f=>f.factor_type==='totp'&&f.id===data.factorId))throw fail('Authenticator not found. Restart setup on this page.',403);
      const {error}=await s.supabase.auth.mfa.challengeAndVerify({factorId:data.factorId,code:data.code});
      if(error)throw fail('That code is incorrect or has expired. Try the next code.',401);
      const current=await s.supabase.auth.getSession();return response({ok:true},current.data.session,config);
    }
    if(data.action==='password'){
      await staffAccess(s.supabase,true,['owner','editor','scanner']);
      if(typeof data.password!=='string'||data.password.length<14||data.password.length>128)throw fail('Choose a password of 14–128 characters.');
      // Password update also follows MFA for a recovered account.
      const result=await s.supabase.auth.updateUser({password:data.password});if(result.error)throw fail('Password change failed. Try a different password.',400);
      await s.supabase.auth.signOut({scope:'global'});
      return json({ok:true,message:'Password changed. Sign in again on your devices.'},200,{'Set-Cookie':doorCookie('',0)});
    }
    throw fail('Unknown action.');
  }catch(error){return errorResponse(error);}
};
export const config={path:'/api/door/auth',rateLimit:{windowLimit:20,windowSize:60,aggregateBy:['ip','domain']}};
