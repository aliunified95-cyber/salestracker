import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/index.js';
const request=async(route,{body,headers={},method=body?'POST':'GET'}={})=>{
 const res={headers:{},statusCode:200,setHeader(k,v){this.headers[k]=v},status(n){this.statusCode=n;return this},json(data){this.data=data;return this}};
 await handler({query:{route},method,body,headers:{host:'tracker.example',...headers}},res);return res;
};
test('Authentication and server boundaries',async t=>{
 const original=global.fetch;const env={...process.env};
 try{
  delete process.env.SUPABASE_URL;delete process.env.SUPABASE_PUBLISHABLE_KEY;delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  await t.test('missing configuration fails closed',async()=>{assert.equal((await request('health')).data.configured,false);assert.equal((await request('login',{body:{username:'AM791',pin:'12345678'}})).statusCode,503)});
  process.env.SUPABASE_URL='https://project.example';process.env.SUPABASE_PUBLISHABLE_KEY='public-test';process.env.SUPABASE_SERVICE_ROLE_KEY='secret-test';process.env.VERCEL='1';
  const profile={id:'agent-id',username:'AGENT1',role:'agent',active:true,must_change_pin:false};let allow=true;const calls=[];
  global.fetch=async(url,options)=>{calls.push({url,options});let body;
   if(url.includes('tracker_attempt'))body=allow;
   else if(url.includes('/token?'))body={access_token:'access-test',refresh_token:'refresh-test',user:{id:profile.id,email:'agent1@users.salestracker.invalid'}};
   else if(url.endsWith('/auth/v1/user'))body={id:profile.id};
   else if(url.includes('tracker_profiles'))body=[profile];
   else body=[];
   return {ok:true,json:async()=>body};
  };
  await t.test('login sets secure HttpOnly cookies and never returns tokens',async()=>{
   const r=await request('login',{body:{username:'agent1',pin:'12345678'}});assert.equal(r.statusCode,200);assert.equal(r.data.profile.username,'AGENT1');assert.ok(!JSON.stringify(r.data).includes('access-test'));assert.ok(r.headers['Set-Cookie'].every(v=>v.includes('HttpOnly')&&v.includes('Secure')&&v.includes('SameSite=Strict')));
   const c=calls.find(c=>c.url.includes('/token?'));assert.equal(JSON.parse(c.options.body).email,'agent1@users.salestracker.invalid');
  });
  await t.test('session survives page refresh and renews for six hours after access expiry',async()=>{
   const login=await request('login',{body:{username:'agent1',pin:'12345678'}});
   const cookies=login.headers['Set-Cookie'];assert.match(cookies.find(v=>v.startsWith('tracker_refresh=')),/Max-Age=21600/);
   const cookie=cookies.map(v=>v.split(';')[0]).join('; ');
   assert.equal((await request('session',{headers:{cookie}})).statusCode,200);
   const renewed=await request('session',{headers:{cookie:'tracker_refresh=refresh-test'}});
   assert.equal(renewed.statusCode,200);assert.match(renewed.headers['Set-Cookie'].find(v=>v.startsWith('tracker_refresh=')),/Max-Age=21600/);
   const logout=await request('logout',{body:{},headers:{cookie}});assert.ok(logout.headers['Set-Cookie'].every(v=>v.includes('Max-Age=0')));
  });
  await t.test('cross origin mutations are rejected',async()=>assert.equal((await request('login',{body:{},headers:{origin:'https://other.example'}})).statusCode,403));
  await t.test('persistent rate limiter blocks authentication',async()=>{allow=false;assert.equal((await request('login',{body:{username:'AGENT1',pin:'12345678'}})).statusCode,429);allow=true});
  await t.test('agents cannot create accounts',async()=>assert.equal((await request('users',{body:{action:'create',username:'ATTACKER',pin:'12345678'},headers:{cookie:'tracker_access=access-test'}})).statusCode,403));
  await t.test('agents cannot provision the team or set team targets',async()=>{for(const route of ['provision-team','team-target'])assert.equal((await request(route,{body:{month:'2026-11',mode:'sum'},headers:{cookie:'tracker_access=access-test'}})).statusCode,403)});
  await t.test('temporary PIN users cannot load sales',async()=>{profile.must_change_pin=true;assert.equal((await request('state',{headers:{cookie:'tracker_access=access-test'}})).statusCode,403);profile.must_change_pin=false});
  await t.test('data requests use agent bearer token rather than service credentials',async()=>{
   const r=await request('state',{headers:{cookie:'tracker_access=access-test'}});assert.equal(r.statusCode,200);assert.ok(calls.filter(c=>c.url.includes('/rest/v1/tracker_sales')).every(c=>c.options.headers.Authorization==='Bearer access-test'));
  });
  await t.test('AM791 setup is unavailable without private setup code',async()=>{delete process.env.TRACKER_SETUP_CODE;assert.equal((await request('bootstrap',{body:{pin:'12345678',code:'guess'}})).statusCode,403)});
  await t.test('only AM791 can provision the requested team',async()=>{profile.role='manager';assert.equal((await request('provision-team',{body:{},headers:{cookie:'tracker_access=access-test'}})).statusCode,403)});
  await t.test('team provisioning creates exactly 11 agents with forced PIN change and never resets existing users',async()=>{
   profile.username='AM791';const createdProfiles=[];const accounts=[];let seq=0;
   global.fetch=async(url,options)=>{const body=options.body?JSON.parse(options.body):undefined;let result=[];
    if(url.endsWith('/auth/v1/user'))result={id:profile.id};
    else if(url.includes('/tracker_profiles?id='))result=[profile];
    else if(url.includes('/tracker_profiles?select=username'))result=accounts;
    else if(url.endsWith('/auth/v1/admin/users')){result={id:'created-'+(++seq)};assert.match(body.password,/^\d{8}$/)}
    else if(url.endsWith('/tracker_profiles')&&options.method==='POST'){createdProfiles.push(body);accounts.push({username:body.username});result=[body]}
    return{ok:true,json:async()=>result};
   };
   const r=await request('provision-team',{body:{},headers:{cookie:'tracker_access=access-test'}});assert.equal(r.data.created.length,11);assert.equal(createdProfiles.length,11);assert.ok(createdProfiles.every(p=>p.role==='agent'&&p.must_change_pin));assert.equal(new Set(createdProfiles.map(p=>p.username)).size,11);
   const again=await request('provision-team',{body:{},headers:{cookie:'tracker_access=access-test'}});assert.equal(again.data.created.length,0);assert.equal(again.data.skipped.length,11);assert.equal(seq,11);
  });
 }finally{global.fetch=original;for(const k of Object.keys(process.env))if(!(k in env))delete process.env[k];Object.assign(process.env,env)}
});

