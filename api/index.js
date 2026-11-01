import {createHash} from 'node:crypto';
const username=v=>String(v||'').trim().toUpperCase();
const validName=v=>/^[A-Z0-9_]{3,30}$/.test(v);
const validPin=v=>/^\d{8,12}$/.test(String(v||''));
const alias=v=>`${v.toLowerCase()}@users.salestracker.invalid`;
const hash=v=>createHash('sha256').update(v).digest('hex');
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
 const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_PUBLISHABLE_KEY,secret=process.env.SUPABASE_SERVICE_ROLE_KEY;
 const configured=!!(url&&key&&secret);const route=String(req.query?.route||'').replace(/^\/+|\/+$/g,'');
 if(route==='health')return res.status(200).json({configured});
 if(!configured)return res.status(503).json({error:'Account setup is not complete yet. Please contact your manager.'});
 const b=req.body||{};const post=req.method==='POST';
 if(!['GET','POST'].includes(req.method))return res.status(405).json({error:'Method not allowed'});
 if(post&&req.headers.origin){const o=new URL(req.headers.origin);if(o.host!==req.headers.host)return res.status(403).json({error:'Request blocked'})}
 const sb=async(path,{method='GET',body,token,admin=false}={})=>{
  const r=await fetch(`${url}${path}`,{method,headers:{apikey:admin?secret:key,Authorization:`Bearer ${admin?secret:token||key}`,'Content-Type':'application/json',Prefer:'return=representation'},body:body===undefined?undefined:JSON.stringify(body)});
  const data=await r.json().catch(()=>null);if(!r.ok){const e=new Error(data?.message||data?.msg||data?.error_description||'Unable to complete this request');e.status=r.status;throw e}return data;
 };
 const cookies=Object.fromEntries(String(req.headers.cookie||'').split(';').filter(x=>x.includes('=')).map(x=>{const i=x.indexOf('=');return[x.slice(0,i).trim(),decodeURIComponent(x.slice(i+1))]}));
 const secure=process.env.VERCEL?' Secure;':'';
 const setCookies=(s,clear=false)=>res.setHeader('Set-Cookie',[
 `tracker_access=${clear?'':s.access_token}; HttpOnly;${secure} SameSite=Strict; Path=/; Max-Age=${clear?0:3600}`,
 `tracker_refresh=${clear?'':s.refresh_token}; HttpOnly;${secure} SameSite=Strict; Path=/; Max-Age=${clear?0:604800}`]);
 const rpc=(name,body,token,admin=false)=>sb(`/rest/v1/rpc/${name}`,{method:'POST',body,token,admin});
 const limit=async(identity)=>{const ip=String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0];const results=await Promise.all([rpc('tracker_attempt',{bucket:hash(`ip:${ip}`)},null,true),rpc('tracker_attempt',{bucket:hash(`account:${identity}`)},null,true)]);if(results.some(v=>!v)){const e=new Error('Too many attempts. Please wait 15 minutes.');e.status=429;throw e}};
 try{
  if(route==='login'&&post){
   const name=username(b.username);await limit(name);if(!validName(name)||!validPin(b.pin))return res.status(401).json({error:'Username or PIN is incorrect'});
   let s;try{s=await sb('/auth/v1/token?grant_type=password',{method:'POST',body:{email:alias(name),password:b.pin}})}catch{return res.status(401).json({error:'Username or PIN is incorrect'})}
   const p=(await sb(`/rest/v1/tracker_profiles?id=eq.${s.user.id}&select=*`,{token:s.access_token}))[0];if(!p?.active)return res.status(401).json({error:'Username or PIN is incorrect'});
   setCookies(s);return res.status(200).json({profile:p});
  }
  if(route==='bootstrap'&&post){
   await limit('bootstrap');const wanted=process.env.TRACKER_SETUP_CODE||'';if(!wanted||hash(String(b.code||''))!==hash(wanted))return res.status(403).json({error:'Setup code is incorrect'});
   if(!validPin(b.pin))return res.status(400).json({error:'Use an 8 to 12 digit PIN'});
   const existing=await sb('/rest/v1/tracker_profiles?username=eq.AM791&select=id',{admin:true});if(existing.length)return res.status(409).json({error:'AM791 is already set up. Sign in instead.'});
   const u=await sb('/auth/v1/admin/users',{method:'POST',admin:true,body:{email:alias('AM791'),password:b.pin,email_confirm:true}});
   try{await sb('/rest/v1/tracker_profiles',{method:'POST',admin:true,body:{id:u.id,username:'AM791',display_name:'AM791',role:'manager',must_change_pin:false}})}catch(e){await sb(`/auth/v1/admin/users/${u.id}`,{method:'DELETE',admin:true});throw e}
   return res.status(201).json({ok:true});
  }
  let token=cookies.tracker_access,user;
  if(token){try{user=await sb('/auth/v1/user',{token})}catch{token=null}}
  if(!user&&cookies.tracker_refresh){try{const s=await sb('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:{refresh_token:cookies.tracker_refresh}});token=s.access_token;user=s.user;setCookies(s)}catch{setCookies({},true)}}
  if(!user)return res.status(401).json({error:'Please sign in'});
  const profile=(await sb(`/rest/v1/tracker_profiles?id=eq.${user.id}&select=*`,{token}))[0];
  if(!profile?.active)return res.status(403).json({error:'This account is disabled. Contact your manager.'});
  if(route==='session')return res.status(200).json({profile});
  if(route==='logout'&&post){await sb('/auth/v1/logout',{method:'POST',token}).catch(()=>{});setCookies({},true);return res.status(200).json({ok:true})}
  if(route==='pin'&&post){await limit(`pin:${user.id}`);if(!validPin(b.pin))return res.status(400).json({error:'Use an 8 to 12 digit PIN'});try{await sb('/auth/v1/token?grant_type=password',{method:'POST',body:{email:user.email,password:b.currentPin}})}catch{return res.status(403).json({error:'Current PIN is incorrect'})}
   await sb('/auth/v1/user',{method:'PUT',token,body:{password:b.pin}});await sb(`/rest/v1/tracker_profiles?id=eq.${user.id}`,{method:'PATCH',admin:true,body:{must_change_pin:false}});return res.status(200).json({ok:true});}
  if(profile.must_change_pin)return res.status(403).json({error:'Please change your temporary PIN first'});
  if(route==='state'&&req.method==='GET'){
   const allRows=async t=>{const result=[];for(let offset=0;;offset+=1000){const rows=await sb(`/rest/v1/${t}?select=*&order=${t==='tracker_targets'?'agent_id,month':'id'}&limit=1000&offset=${offset}`,{token});result.push(...rows);if(rows.length<1000)return result}};
   const [profiles,sales,targets,rules]=await Promise.all(['tracker_profiles','tracker_sales','tracker_targets','tracker_rules'].map(allRows));
   return res.status(200).json({profiles,sales,targets,rules});
  }
  if(route==='save'&&post){if(!Array.isArray(b.changes)||b.changes.length>2000)return res.status(400).json({error:'Too many changes'});await rpc('tracker_save',{changes:b.changes},token);return res.status(200).json({ok:true})}
  if(route==='import'&&post){if(profile.role!=='manager')return res.status(403).json({error:'Manager access required'});await rpc('tracker_import',{agent:b.agent,backup:b.backup},token);return res.status(200).json({ok:true})}
  if(route==='users'&&post){
   if(profile.role!=='manager')return res.status(403).json({error:'Manager access required'});
   const name=username(b.username);if(!validName(name))return res.status(400).json({error:'Use 3 to 30 letters, numbers or underscores'});
   if(b.action==='create'){
    if(!validPin(b.pin))return res.status(400).json({error:'Use an 8 to 12 digit temporary PIN'});
    const role=b.role==='manager'?'manager':'agent';if(role==='manager'&&profile.username!=='AM791')return res.status(403).json({error:'Only AM791 can create managers'});
    const u=await sb('/auth/v1/admin/users',{method:'POST',admin:true,body:{email:alias(name),password:b.pin,email_confirm:true}});
    try{await sb('/rest/v1/tracker_profiles',{method:'POST',admin:true,body:{id:u.id,username:name,display_name:String(b.display_name||name).slice(0,100),role,must_change_pin:true}})}catch(e){await sb(`/auth/v1/admin/users/${u.id}`,{method:'DELETE',admin:true});throw e}
   }else{
    const p=(await sb(`/rest/v1/tracker_profiles?username=eq.${name}&select=*`,{admin:true}))[0];if(!p)throw new Error('Account not found');if(p.username==='AM791'||(p.role==='manager'&&profile.username!=='AM791'))return res.status(403).json({error:'Only AM791 can manage other managers. The main account cannot be disabled.'});
    if(b.action==='reset'){if(!validPin(b.pin))throw new Error('Use an 8 to 12 digit PIN');await sb(`/auth/v1/admin/users/${p.id}`,{method:'PUT',admin:true,body:{password:b.pin}});await sb(`/rest/v1/tracker_profiles?id=eq.${p.id}`,{method:'PATCH',admin:true,body:{must_change_pin:true}})}
    else if(b.action==='toggle')await sb(`/rest/v1/tracker_profiles?id=eq.${p.id}`,{method:'PATCH',admin:true,body:{active:!p.active}});
    else throw new Error('Unknown account action');
   }
   return res.status(200).json({ok:true});
  }
  return res.status(404).json({error:'Page not found'});
 }catch(e){return res.status(e.status===429?429:400).json({error:e.message||'Unable to complete request'})}
}
