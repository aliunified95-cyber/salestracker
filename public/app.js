let profile=null,raw=null,selectedAgent=null,snapshot=null,saving=false,resetUser=null,pendingToast=null,teamProvisioning=false;
async function api(route,body){
 const r=await fetch('/api/'+route,{method:body===undefined?'GET':'POST',headers:body===undefined?{}:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 const d=await r.json();if(!r.ok)throw new Error(d.error||'Request failed');return d;
}
const clone=v=>JSON.parse(JSON.stringify(v));
function targetImportChanges(text,month,profiles,targets){
 if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))throw new Error('Choose a valid month');
 const changes=[],seen=new Set();
 for(const line of text.trim().split(/\r?\n/).filter(l=>l.trim())){
  if(line.includes('"'))throw new Error('Use plain numbers without quotes or thousands separators');
  const parts=line.split(/[,\t]/).map(v=>v.trim());
  if(/^(username|tabs id2)$/i.test(parts[0]))continue;
  if(parts.length<3||parts.length>4||parts[1]===''||parts[2]==='')throw new Error('Each row needs Username, Postpaid and Broadband');
  const username=parts[0].toUpperCase(),postpaid=Number(parts[1]),broadband=Number(parts[2]);
  if(seen.has(username))throw new Error('Duplicate agent: '+username);seen.add(username);
  const p=profiles.find(p=>p.username===username&&p.role==='agent');if(!p)throw new Error('Agent not found: '+username);
  if(!Number.isFinite(postpaid)||!Number.isFinite(broadband)||postpaid<0||broadband<0)throw new Error('Targets must be nonnegative numbers: '+username);
  const old=targets.find(t=>t.agent_id===p.id&&t.month===month)?.record||{};
  changes.push({table:'targets',op:'upsert',agent_id:p.id,id:month,record:{...old,postpaid,broadband}});
 }
 if(!changes.length)throw new Error('Paste at least one agent target');return changes;
}
function teamTargetFor(month,profiles,targets,teamTargets){
 const agents=new Set(profiles.filter(p=>p.role==='agent').map(p=>p.id));
 const combined={postpaid:0,broadband:0};
 for(const t of targets)if(agents.has(t.agent_id)&&t.month===month)for(const c of ['postpaid','broadband'])combined[c]+=Number(t.record[c]||0);
 const saved=teamTargets?.find(t=>t.month===month)?.record;const mode=saved?.mode==='manual'?'manual':'sum';
 const target=mode==='manual'?Object.fromEntries(['postpaid','broadband'].map(c=>[c,Math.min(Number(saved[c]||0),combined[c])])):{...combined};
 return{combined,target,mode};
}
function stateFor(agent){
 const all=agent==='all';const targets={};
 const agents=new Set(raw.profiles.filter(p=>p.role==='agent').map(p=>p.id));
 if(all){for(const month of new Set([...raw.targets.map(t=>t.month),...(raw.teamTargets||[]).map(t=>t.month)]))targets[month]=teamTargetFor(month,raw.profiles,raw.targets,raw.teamTargets).target}
 else for(const t of raw.targets.filter(t=>t.agent_id===agent))targets[t.month]=clone(t.record);
 return migrate({version:1,settings:{trend:S?.settings.trend||'both'},targets,sales:raw.sales.filter(s=>all?agents.has(s.agent_id):s.agent_id===agent).map(s=>clone(s.record)),rules:raw.rules.map(r=>clone(r.record))});
}
function applyView(){
 S=stateFor(selectedAgent);snapshot=clone(S);const manager=profile.role==='manager',all=selectedAgent==='all';
 document.querySelector('#managerPanel').hidden=!manager;
 document.querySelector('#teamTargetNote').hidden=!manager;
 document.querySelector('#bTarget').hidden=!manager||all;document.querySelector('#bTeamTarget').hidden=!manager||!all;document.querySelector('#bRules').hidden=!manager;document.querySelector('#bRestore').hidden=!manager;
 document.querySelector('#bImportTargets').hidden=!manager||!all;
 document.querySelector('#bTarget').disabled=all;document.querySelector('#bNew').disabled=all;document.querySelector('#bRestore').disabled=all;
 document.querySelector('#bBackup').disabled=all;
 document.querySelector('#pageTitle').textContent=all?'Team performance · AM791':selectedAgent===profile.id?'My performance':(raw.profiles.find(p=>p.id===selectedAgent)?.display_name||'Agent')+' · Performance';
 document.querySelector('#accountName').textContent=profile.username+' · '+profile.role;
 document.querySelector('#app').classList.toggle('team-view',all);
 render();
}
async function reload(){raw=await api('state');if(!raw.profiles.some(p=>p.id===selectedAgent)&&selectedAgent!=='all')selectedAgent=profile.id;applyView()}
async function queueSave(){
 if(saving||!profile||!snapshot)return;
 const before=snapshot,after=clone(S),agent=selectedAgent,changes=[];
 const diff=(table,oldRows,newRows)=>{
  for(const [id,record] of Object.entries(newRows))if(JSON.stringify(oldRows[id])!==JSON.stringify(record))changes.push({table,id,record,agent_id:agent==='all'?null:agent,op:'upsert'});
  for(const id of Object.keys(oldRows))if(!(id in newRows))changes.push({table,id,agent_id:agent==='all'?null:agent,op:'delete'});
 };
 const keyed=a=>Object.fromEntries(a.map(x=>[x.id,x]));
 diff('rules',keyed(before.rules),keyed(after.rules));
 if(agent!=='all'){diff('targets',before.targets,after.targets);diff('sales',keyed(before.sales),keyed(after.sales))}
 if(!changes.length)return;
 saving=true;document.querySelector('#saveStatus').textContent='Saving changes…';document.body.classList.add('saving');document.querySelector('#app').inert=true;
 let success=false;
 try{await api('save',{changes});await reload();renderRules();document.querySelector('#saveStatus').textContent='All changes saved';success=true;}
 catch(e){S=clone(before);render();renderRules();document.querySelector('#saveStatus').textContent='Changes were not saved. '+e.message;toast(e.message,'err');}
 finally{saving=false;document.body.classList.remove('saving');document.querySelector('#app').inert=false;const queued=pendingToast;pendingToast=null;if(success&&queued)toast(queued.m,queued.k)}
}
function renderTeam(){
 const agents=raw.profiles.filter(p=>p.role==='agent');
 const select=document.querySelector('#agentView');select.innerHTML='<option value="all">All team · AM791</option>'+agents.map(p=>`<option value="${p.id}">${esc(p.display_name)} (${esc(p.username)})${p.active?'':' · disabled'}</option>`).join('');select.value=selectedAgent;
 const totals=teamTargetFor(view,raw.profiles,raw.targets,raw.teamTargets);
 document.querySelector('#teamTargetNote').textContent=`Team owner: AM791. ${totals.mode==='manual'?'Custom team target':'Combined agent targets'}: Postpaid ${f(totals.target.postpaid)}, Broadband ${f(totals.target.broadband)}. Agents combined: ${f(totals.combined.postpaid)} / ${f(totals.combined.broadband)}.`;
 const table=agents.map(p=>{const sales=raw.sales.filter(s=>s.agent_id===p.id&&mKey(s.record.date)===view).map(s=>s.record),t=raw.targets.find(t=>t.agent_id===p.id&&t.month===view)?.record||{},post=total(sales.filter(s=>catOf(s.segment)==='Postpaid')),bb=total(sales.filter(s=>catOf(s.segment)==='Broadband'));
  const achievement=(points,target)=>target>0?(points/target*100).toFixed(2)+'%':'No target';
  return `<tr><td><button class="btn sm" data-agent="${p.id}">${esc(p.display_name)}</button><small class="sub"> ${esc(p.username)}</small></td><td>${sales.length}</td><td>${f(post)} / ${t.postpaid??'—'}</td><td>${achievement(post,t.postpaid)}</td><td>${f(bb)} / ${t.broadband??'—'}</td><td>${achievement(bb,t.broadband)}</td></tr>`;
 });
 document.querySelector('#teamTable').innerHTML='<table style="min-width:660px"><thead><tr><th>Agent</th><th>Sales</th><th>Postpaid points / target</th><th>Achievement</th><th>Broadband points / target</th><th>Achievement</th></tr></thead><tbody>'+(table.join('')||'<tr><td colspan="6" class="empty">Create your agents to start setting monthly targets.</td></tr>')+'</tbody></table>';
}
function userList(){
 document.querySelector('#usersList').innerHTML='<table style="min-width:550px"><thead><tr><th>Username</th><th>Name</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead><tbody>'+raw.profiles.map(p=>`<tr><td>${esc(p.username)}</td><td>${esc(p.display_name)}</td><td>${p.role}</td><td>${p.active?'Active':'Disabled'}${p.must_change_pin?' · PIN change required':''}</td><td>${p.username==='AM791'?'Main account':`<button class="btn sm" data-reset="${esc(p.username)}">Reset PIN</button> <button class="btn sm" data-toggle="${esc(p.username)}">${p.active?'Disable':'Enable'}</button>`}</td></tr>`).join('')+'</tbody></table>';
 document.querySelector('#newRole').disabled=profile.username!=='AM791';
 const wanted=['BF01387','BF01049','BF01525','BF01437','BF01545','BF01539','BF01484','BF01565','BF01278','BF01171','BF01441'];
 document.querySelector('#provisionTeam').hidden=profile.username!=='AM791'||wanted.every(u=>raw.profiles.some(p=>p.username===u));
}
function fillTeamTarget(){
 const month=document.querySelector('#teamMonth').value;const t=teamTargetFor(month,raw.profiles,raw.targets,raw.teamTargets);
 document.querySelector('#teamMode').value=t.mode;document.querySelector('#teamPost').value=t.target.postpaid;document.querySelector('#teamBb').value=t.target.broadband;
 document.querySelector('#teamPost').max=t.combined.postpaid;document.querySelector('#teamBb').max=t.combined.broadband;
 document.querySelector('#teamCombined').textContent=`Combined agent targets: Postpaid ${f(t.combined.postpaid)}, Broadband ${f(t.combined.broadband)}.`;
 setTeamMode();
}
function setTeamMode(){const manual=document.querySelector('#teamMode').value==='manual';document.querySelector('#teamCustom').hidden=!manual;for(const id of ['#teamPost','#teamBb']){document.querySelector(id).required=manual;document.querySelector(id).disabled=!manual}}
function lockMutations(){if(saving)return null;saving=true;document.querySelector('#app').inert=true;document.body.classList.add('saving');return()=>{saving=false;document.querySelector('#app').inert=false;document.body.classList.remove('saving');const queued=pendingToast;pendingToast=null;if(queued)toast(queued.m,queued.k)}}
async function signedIn(p){
 profile=p;selectedAgent=p.role==='manager'?'all':p.id;
 if(p.must_change_pin){document.querySelector('#pinReason').textContent='Change your temporary PIN before using your dashboard.';document.querySelector('#cancelPin').textContent='Sign out';document.querySelector('#pinDialog').showModal();return}
 await reload();document.querySelector('#auth').hidden=true;document.querySelector('#app').hidden=false;
}
async function start(){
 for(const type of ['click','submit','change','keydown'])document.addEventListener(type,e=>{if(saving){e.preventDefault();e.stopImmediatePropagation()}},true);
 const setup=new URLSearchParams(location.search).has('setup');document.querySelector('#setupForm').hidden=!setup;document.querySelector('#loginForm').hidden=setup;
 const setupAccess=new URLSearchParams(location.hash.slice(1)).get('setup');
 if(setup&&setupAccess){document.querySelector('#setupCode').value=setupAccess;document.querySelector('#setupCode').closest('label').hidden=true;history.replaceState(null,'',location.pathname+location.search);document.querySelector('#setupPin').focus()}
 document.querySelector('#loginForm').onsubmit=async e=>{e.preventDefault();const button=document.querySelector('#loginButton');button.disabled=true;document.querySelector('#loginError').textContent='';try{const {profile:p}=await api('login',{username:document.querySelector('#loginUser').value,pin:document.querySelector('#loginPin').value});document.querySelector('#loginPin').value='';await signedIn(p)}catch(e){document.querySelector('#loginError').textContent=e.message}finally{button.disabled=false}};
 document.querySelector('#setupForm').onsubmit=async e=>{e.preventDefault();const pin=document.querySelector('#setupPin').value;if(pin!==document.querySelector('#setupConfirm').value)return document.querySelector('#setupError').textContent='The PINs do not match';try{await api('bootstrap',{code:document.querySelector('#setupCode').value,pin});location.replace('/')}catch(e){document.querySelector('#setupError').textContent=e.message}};
 document.querySelector('#logout').onclick=async()=>{await api('logout',{});location.reload()};
 document.querySelector('#refresh').onclick=()=>reload().catch(e=>toast(e.message,'err'));
 document.querySelector('#agentView').onchange=e=>{selectedAgent=e.target.value;applyView()};
 document.querySelector('#teamTable').onclick=e=>{const b=e.target.closest('[data-agent]');if(b){selectedAgent=b.dataset.agent;applyView()}};
 document.querySelector('#changePin').onclick=()=>document.querySelector('#pinDialog').showModal();
 document.querySelector('#cancelPin').onclick=async()=>{if(profile.must_change_pin){await api('logout',{});location.reload()}else document.querySelector('#pinDialog').close()};
 document.querySelector('#pinDialog').addEventListener('cancel',e=>{if(profile.must_change_pin)e.preventDefault()});
 document.querySelector('#pinForm').onsubmit=async e=>{e.preventDefault();const pin=document.querySelector('#newPin').value;if(pin!==document.querySelector('#confirmPin').value)return document.querySelector('#pinError').textContent='The PINs do not match';try{await api('pin',{currentPin:document.querySelector('#currentPin').value,pin});document.querySelector('#pinForm').reset();document.querySelector('#pinDialog').close();profile.must_change_pin=false;await signedIn(profile);toast('PIN updated')}catch(e){document.querySelector('#pinError').textContent=e.message}};
 document.querySelector('#manageUsers').onclick=()=>{userList();document.querySelector('#usersDialog').showModal()};
 document.querySelector('#bTeamTarget').onclick=()=>{document.querySelector('#teamMonth').value=view;fillTeamTarget();document.querySelector('#teamTargetError').textContent='';document.querySelector('#teamTargetDialog').showModal()};
 document.querySelector('#bImportTargets').onclick=()=>{document.querySelector('#targetImportMonth').value=view;document.querySelector('#targetImportError').textContent='';document.querySelector('#targetImportDialog').showModal()};
 document.querySelector('#targetImportForm').onsubmit=async e=>{e.preventDefault();let changes;const month=document.querySelector('#targetImportMonth').value;try{changes=targetImportChanges(document.querySelector('#targetImportText').value,month,raw.profiles,raw.targets)}catch(e){document.querySelector('#targetImportError').textContent=e.message;return}const unlock=lockMutations();if(!unlock)return;try{await api('save',{changes});view=month;await reload();document.querySelector('#targetImportText').value='';document.querySelector('#targetImportDialog').close();toast(`${changes.length} agent targets saved`)}catch(e){document.querySelector('#targetImportError').textContent=e.message}finally{unlock()}};
 document.querySelector('#teamMonth').onchange=fillTeamTarget;document.querySelector('#teamMode').onchange=setTeamMode;
 document.querySelector('#teamTargetForm').onsubmit=async e=>{e.preventDefault();const unlock=lockMutations();if(!unlock)return;const button=document.querySelector('#saveTeamTarget');button.disabled=true;try{const month=document.querySelector('#teamMonth').value;await api('team-target',{month,mode:document.querySelector('#teamMode').value,postpaid:Number(document.querySelector('#teamPost').value),broadband:Number(document.querySelector('#teamBb').value)});view=month;await reload();document.querySelector('#teamTargetDialog').close();toast('Team target saved for AM791')}catch(e){document.querySelector('#teamTargetError').textContent=e.message}finally{button.disabled=false;unlock()}};
 document.querySelector('#provisionTeam').onclick=async()=>{if(teamProvisioning)return;const unlock=lockMutations();if(!unlock)return;teamProvisioning=true;const button=document.querySelector('#provisionTeam');button.disabled=true;document.querySelector('#provisionStatus').textContent='Creating the requested team accounts…';try{const result=await api('provision-team',{});if(result.created.length){const csv='Username,Temporary PIN,First login\r\n'+result.created.map(u=>`${u.username},${u.pin},Change PIN required`).join('\r\n');dl('agent-temporary-pins.csv','text/csv',csv)}await reload();userList();document.querySelector('#provisionStatus').textContent=`Created ${result.created.length} accounts. ${result.skipped.length} already existed. ${result.errors.length} could not be created.`;if(result.created.length)document.querySelector('#provisionStatus').textContent+=' Temporary PINs were downloaded. Keep the file private.';}catch(e){document.querySelector('#provisionStatus').textContent=e.message}finally{teamProvisioning=false;button.disabled=false;unlock()}};
 document.querySelector('#userForm').onsubmit=async e=>{e.preventDefault();try{await api('users',{action:'create',username:document.querySelector('#newUser').value,display_name:document.querySelector('#newName').value,pin:document.querySelector('#userPin').value,role:document.querySelector('#newRole').value});document.querySelector('#userForm').reset();await reload();userList();toast('Account created. Share the temporary PIN with this agent.')}catch(e){document.querySelector('#userError').textContent=e.message}};
 document.querySelector('#usersList').onclick=async e=>{const b=e.target.closest('button');if(!b)return;if(b.dataset.reset){resetUser=b.dataset.reset;document.querySelector('#resetName').textContent=resetUser;document.querySelector('#resetDialog').showModal()}if(b.dataset.toggle){try{await api('users',{action:'toggle',username:b.dataset.toggle});await reload();userList()}catch(e){toast(e.message,'err')}}};
 document.querySelector('#resetForm').onsubmit=async e=>{e.preventDefault();try{await api('users',{action:'reset',username:resetUser,pin:document.querySelector('#resetPin').value});document.querySelector('#resetForm').reset();document.querySelector('#resetDialog').close();await reload();userList();toast('Temporary PIN reset')}catch(e){document.querySelector('#resetError').textContent=e.message}};
 try{const h=await api('health');document.querySelector('#connection').textContent=h.configured?'':'Setup pending: the secure database connection has not been configured.';if(!h.configured)return;const {profile:p}=await api('session');await signedIn(p)}catch(e){if(e.message!=='Please sign in')document.querySelector('#connection').textContent=e.message}
}


/* ===== DATA MODEL (stored in Supabase with per-agent access controls) =====
   targets: { "2026-10": { postpaid: 179, broadband: 112 } }
   sales:   [{ id, saleType:"new", orderNo, msisdn, date:"YYYY-MM-DD", segment, rental, points, createdAt }]
   settings:{ month, trend }
   targets may also hold postpaidArpu / hbbArpu / mbbArpu / fiberArpu (optional, per month; hbbArpu is used by 5G TDD)
   upgrade sale: saleType "upgrade", previousRental, newRental (no VAT), arpuAtSale, points = (new - previous) / arpuAtSale
   rules: [{ id, segment, rental, points, effectiveFrom, version, archived? }]; a new sale stores ruleId, ruleEffectiveFrom, pointsAtSale */

/* Seed table: used ONCE to create the editable Sales Rules on first run. After that, S.rules is the source of truth. */
const RULES={new:{
  'Postpaid Voice':{cat:'Postpaid',pts:{'9.5':1,'10.5':1,'11':1,'12.5':1,'15':1.5,'22':2}},
  'Family':{cat:'Postpaid',pts:{'33':3,'66':5,'77':5}},
  'MBB':{cat:'Broadband',pts:{'11':1,'13.2':1,'16.5':1,'22':1}},
  'Fiber':{cat:'Broadband',pts:{'16.463':0.75,'18.963':0.5,'26.463':0.5,'45.463':0.5,'100.463':0,'20.613':1}},
  '5G TDD':{cat:'Broadband',pts:{'11':1,'17.5':1,'22':1}}}};
const SEGS={Postpaid:['Postpaid Voice','Family'],Broadband:['MBB','Fiber','5G TDD']};

const catOf=seg=>SEGS.Postpaid.includes(seg)?'Postpaid':'Broadband'; // MBB, Fiber and 5G TDD all roll up into BROADBAND

/* ===== helpers ===== */
const $=s=>document.querySelector(s);
const pad=n=>String(n).padStart(2,'0');
const ymd=d=>`${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
const today=()=>ymd(new Date());
const mKey=d=>d.slice(0,7);
const shift=(m,n)=>{const [y,mo]=m.split('-').map(Number);return ymd(new Date(y,mo-1+n,1)).slice(0,7)};
const mName=m=>{const [y,mo]=m.split('-').map(Number);return new Date(y,mo-1,1).toLocaleString('en',{month:'long',year:'numeric'})};
const f=n=>String(Math.round(n*100)/100);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid=()=>Date.now().toString(36)+Math.random().toString(36).slice(2,8);
const total=a=>a.reduce((t,x)=>t+x.points,0);
let tt;function toast(m,k){if(saving&&k!=='err'){pendingToast={m,k};return}const t=$('#toast');t.textContent=m;t.className='show '+(k||'');clearTimeout(tt);tt=setTimeout(()=>{t.className=''},3200)}

/* ===== storage ===== */
const fresh=()=>({version:1,settings:{trend:'both'},targets:{},sales:[]});
/* Safe upgrade of older saved data: missing saleType = "new"; legacy HBB = 5G TDD (segment and hbbArpu) */
function migrate(d){
  d.settings={trend:'both',...d.settings};d.targets=d.targets||{};
  Object.values(d.targets).forEach(t=>{if(t.tddArpu!==undefined){if(t.hbbArpu===undefined)t.hbbArpu=t.tddArpu;delete t.tddArpu}});
  if(!Array.isArray(d.rules))d.rules=Object.entries(RULES.new).flatMap(([seg,v])=>Object.entries(v.pts).map(([r,p])=>({id:'seed-'+seg+'-'+r,segment:seg,rental:+r,points:p,effectiveFrom:'2000-01-01',version:1,createdAt:0})));
  d.sales=d.sales.map(s=>{
    s={saleType:'new',...s,segment:s.segment==='HBB'?'5G TDD':s.segment};
    if(s.saleType==='new'&&!s.ruleId){const r=d.rules.find(x=>x.segment===s.segment&&+x.rental===+s.rental);if(r){s.ruleId=r.id;s.ruleEffectiveFrom=r.effectiveFrom}}
    if(s.pointsAtSale===undefined)s.pointsAtSale=s.points;
    if(s.arpuAtSale===undefined&&s.arpuUsed!==undefined)s.arpuAtSale=s.arpuUsed;
    delete s.arpuUsed;return s});
  return d;
}
function load(){return migrate(fresh())}
let S=load(),view=today().slice(0,7),q='',cat='All',typ='all';
function save(){return queueSave()}
function setView(m){view=m;S.settings.month=m;save();render()}
const monthSales=()=>S.sales.filter(x=>mKey(x.date)===view);

/* ===== render ===== */
function kpi(n,t,p){
  const has=t>0,a=has?p/t*100:0,c=!has?'var(--mut)':a<75?'var(--red)':a<100?'var(--amb)':'var(--grn)';
  const rem=!has?'Set a monthly target':p>t?`Target exceeded by ${f(p-t)} points`:a>=100?'Target achieved':`${f(t-p)} Points Remaining`;
  return `<section class="card"><span class="tag">${n}</span>
  <div class="stats"><div><small>Target</small><strong>${has?f(t):'—'}</strong></div><div><small>Sales</small><strong>${f(p)}</strong></div><div><small>Achievement</small><strong style="color:${c}">${has?a.toFixed(2)+'%':'—'}</strong></div></div>
  <div class="bar"><i style="width:${Math.min(a,100)}%;background:${c}"></i><u style="left:75%"></u></div>
  <div class="ms"><span style="left:75%">75%</span><span>100%</span></div>
  <div class="kf"><span>${f(p)} / ${has?f(t):'—'} Points</span><span style="color:${c}">${rem}</span></div></section>`;
}

function chart(ms){
  const [y,mo]=view.split('-').map(Number),dim=new Date(y,mo,0).getDate(),cur=view===today().slice(0,7);
  const last=cur?Math.max(new Date().getDate(),...ms.map(x=>+x.date.slice(8))):dim,mode=S.settings.trend;
  const ser=[['Postpaid','#4c1d95'],['Broadband','#0891b2']].filter(s=>mode==='both'||mode===s[0]);
  const data=ser.map(([n])=>{let c=0;return Array.from({length:last},(_,i)=>{c+=total(ms.filter(x=>+x.date.slice(8)===i+1&&catOf(x.segment)===n));return c})});
  const mx=Math.max(0,...data.flat()),step=[.5,1,2,5,10,20,25,50,100,200,250,500,1000].find(n=>n*4>=mx)||Math.ceil(mx/4),top=step*4;
  const W=800,H=250,L=38,R=12,T=12,B=26,X=d=>L+(d-1)/(dim-1)*(W-L-R),Y=v=>T+(1-v/top)*(H-T-B);
  let g='';
  for(let i=0;i<=4;i++){const v=step*i;g+=`<line x1="${L}" x2="${W-R}" y1="${Y(v)}" y2="${Y(v)}" stroke="#ece9f5"/><text x="${L-6}" y="${Y(v)+4}" text-anchor="end">${f(v)}</text>`}
  [1,5,10,15,20,25,dim].forEach(d=>{g+=`<text x="${X(d)}" y="${H-8}" text-anchor="middle">${d}</text>`});
  ser.forEach(([n,c],k)=>{const a=data[k];
    g+=`<path d="${a.map((v,i)=>(i?'L':'M')+X(i+1).toFixed(1)+' '+Y(v).toFixed(1)).join('')}" fill="none" stroke="${c}" stroke-width="2.5" stroke-linejoin="round"/>`;
    g+=a.map((v,i)=>`<circle cx="${X(i+1).toFixed(1)}" cy="${Y(v).toFixed(1)}" r="3" fill="${c}"><title>${n}, day ${i+1}: ${f(v)} points</title></circle>`).join('')});
  return `<div class="leg">${ser.map(([n,c])=>`<span><i style="background:${c}"></i>${n}</span>`).join('')}</div><svg viewBox="0 0 ${W} ${H}" style="width:100%;height:auto;font-size:11px;fill:#6b6880" role="img" aria-label="Cumulative daily points">${g}</svg>`;
}

function rows(){
  const all=monthSales();
  const ms=all.filter(x=>(cat==='All'||catOf(x.segment)===cat)&&(typ==='all'||x.saleType===typ)&&(!q||x.orderNo.toLowerCase().includes(q)||x.msisdn.toLowerCase().includes(q)))
    .sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt-a.createdAt);
  $('#rows').innerHTML=ms.length?ms.map(x=>{const c=catOf(x.segment),up=x.saleType==='upgrade';
    return `<tr><td>${esc(x.date)}</td><td>${esc(x.orderNo)}</td><td>${esc(x.msisdn)}</td><td><span class="pill ${c==='Broadband'?'bb':''}">${c}</span></td><td>${esc(x.segment)}</td><td><span class="pill n">${up?'Upgrade':'New Sale'}</span></td><td>${up?`${esc(x.previousRental)} → ${esc(x.newRental)}`:`${esc(x.rental)} + VAT`}</td><td>${up?f(x.arpuAtSale):'—'}</td><td title="${x.points}"><b>${f(x.points)}</b></td><td><button class="btn sm" data-e="${esc(x.id)}">Edit</button> <button class="btn sm dng" data-d="${esc(x.id)}">Delete</button></td></tr>`}).join('')
    :`<tr><td colspan="10" class="empty">${all.length?'No sales match your search or filter.':'No sales recorded for this month yet. Click “+ New Sale” to add one.'}</td></tr>`;
  document.querySelectorAll('#cats button').forEach(b=>b.classList.toggle('on',b.dataset.c===cat));
  document.querySelectorAll('#types button').forEach(b=>b.classList.toggle('on',b.dataset.y===typ));
}

function render(){
  const ms=monthSales(),t=S.targets[view]||{},P=c=>total(ms.filter(x=>catOf(x.segment)===c)),U=(c,u)=>total(ms.filter(x=>catOf(x.segment)===c&&(x.saleType==='upgrade')===!!u));
  $('#sub').textContent=`${mName(view)}: ${ms.length} sale${ms.length===1?'':'s'}`;
  $('#months').innerHTML=`<button data-m="${shift(view,-1)}" aria-label="Previous month">‹</button>`+[-1,0,1].map(n=>`<button data-m="${shift(view,n)}" class="${n?'':'on'}">${mName(shift(view,n))}</button>`).join('')+`<button data-m="${shift(view,1)}" aria-label="Next month">›</button>`;
  $('#kpis').innerHTML=kpi('POSTPAID',t.postpaid,P('Postpaid'))+kpi('BROADBAND',t.broadband,P('Broadband'))+kpi('TOTAL',Number(t.postpaid||0)+Number(t.broadband||0),P('Postpaid')+P('Broadband'));
  document.querySelectorAll('#trend button').forEach(b=>b.classList.toggle('on',b.dataset.t===S.settings.trend));
  $('#chart').innerHTML=chart(ms);
  const brk=c=>`<section class="card"><span class="tag">${c.toUpperCase()} BREAKDOWN</span><ul class="bl">${SEGS[c].map(s=>`<li><span>${s}</span><b>${f(total(ms.filter(x=>x.segment===s)))} Points</b></li>`).join('')}<li class="sm"><span>New Sales</span><span>${U(c,0).toFixed(2)} Points</span></li><li class="sm"><span>Upgrades</span><span>${U(c,1).toFixed(2)} Points</span></li><li class="tot"><span>Total ${c}</span><b>${P(c).toFixed(2)} Points</b></li></ul></section>`;
  $('#brk').innerHTML=brk('Postpaid')+brk('Broadband');
  const td=today(),ts=ms.filter(x=>x.date===td),tp=c=>total(ts.filter(x=>catOf(x.segment)===c));
  $('#today').innerHTML=`<div class="ch"><h2>Today's Performance</h2><span class="sub">${view===td.slice(0,7)?td:'Today is outside the selected month'}</span></div><div class="tiles">`+
    [['Postpaid',f(tp('Postpaid'))+' Points'],['Broadband',f(tp('Broadband'))+' Points'],['Total',f(tp('Postpaid')+tp('Broadband'))+' Points']].map(([l,v])=>`<div class="tile"><small>${l}</small><b>${v}</b></div>`).join('')+'</div>';
  rows();
  if(profile?.role==='manager')renderTeam();
}

/* ===== sale form ===== */
let editId=null,stype='new';
/* Which monthly ARPU each segment uses for upgrade points */
const ARPU_FIELD={'Postpaid Voice':'postpaidArpu','Family':'postpaidArpu','MBB':'mbbArpu','Fiber':'fiberArpu','5G TDD':'hbbArpu'};
const ARPU_NAME={postpaidArpu:'Postpaid',hbbArpu:'HBB',mbbArpu:'MBB',fiberArpu:'Fiber'};
const ARPU_INPUT={postpaidArpu:'#tPostArpu',hbbArpu:'#tHbbArpu',mbbArpu:'#tMbbArpu',fiberArpu:'#tFiberArpu'};
const arpuName=seg=>ARPU_NAME[ARPU_FIELD[seg]];
const arpuMsg=seg=>`Please set the monthly ARPU for this category before adding an upgrade. Missing: ${arpuName(seg)} ARPU.`;
/* ARPU always comes from the month of the sale date, not the month being viewed */
const getArpu=(date,seg)=>(S.targets[mKey(date)]||{})[ARPU_FIELD[seg]];
function upCalc(){
  const seg=$('#fSeg').value,d=$('#fDate').value,pr=parseFloat($('#fPrev').value),nx=parseFloat($('#fNext').value),arpu=seg&&d?getArpu(d,seg):undefined;
  const o=editId&&S.sales.find(x=>x.id===editId);
  if(o&&o.saleType==='upgrade'&&o.segment===seg&&o.date===d&&o.previousRental===pr&&o.newRental===nx)return{seg,d,pr,nx,arpu:o.arpuAtSale,pts:o.points}; // unchanged edit keeps the original calculation
  return{seg,d,pr,nx,arpu,pts:arpu>0&&nx>pr?(nx-pr)/arpu:null}; // points are never rounded
}
function setType(t){
  stype=t;document.querySelectorAll('#stype button').forEach(b=>b.classList.toggle('on',b.dataset.s===t));
  $('#lNew').classList.toggle('hide',t!=='new');$('#upBox').classList.toggle('hide',t!=='upgrade');$('#err').textContent='';fillSeg();pv();
}
function pvUp(){
  const u=upCalc(),R=(l,v)=>`<div><span>${l}</span><b>${v}</b></div>`;let h='<div>Upgrade Calculation</div>',bad=false;
  if(!u.seg||!u.d)h+='<div>Select a segment and sale date to see the monthly ARPU.</div>';
  else if(!(u.arpu>0)){bad=true;h+=`<div>${arpuMsg(u.seg)}</div>`}
  else{
    h+=R(`Monthly ${arpuName(u.seg)} ARPU`,f(u.arpu));
    if(!isNaN(u.pr)&&!isNaN(u.nx)){
      if(u.nx<=u.pr){bad=true;h+='<div>New rental must be higher than previous rental.</div>'}
      else h+=R('Previous Rental',u.pr)+R('New Rental',u.nx)+R('Rental Increase',f(u.nx-u.pr))+R('Points Earned',u.pts.toFixed(2))+`<div>(${u.nx} - ${u.pr}) / ${u.arpu} = ${u.pts.toFixed(2)} Points</div>`;
    }
  }
  $('#pv').className='pv col'+(bad?' bad':'');$('#pv').innerHTML=h;
}
function fillSeg(){
  const cur=$('#fSeg').value;
  $('#fSeg').innerHTML='<option value="">Select segment</option>'+Object.entries(SEGS).map(([c,l])=>`<optgroup label="${c}">${l.map(s=>`<option>${s}</option>`).join('')}</optgroup>`).join('');
  $('#fSeg').value=cur;if($('#fSeg').value!==cur)fillRent('');
}
fillSeg();
function fillRent(sel){
  const seg=$('#fSeg').value,el=$('#fRent'),d=$('#fDate').value;el.disabled=!seg;
  el.innerHTML=`<option value="">${seg?'Select rental':'Select segment first'}</option>`+(seg?rentalsFor(seg,d,sel).map(r=>`<option value="${r}">${r}</option>`).join(''):'');
  el.value=String(sel||'');
}
function pv(){
  if(stype==='upgrade')return pvUp();
  const s=$('#fSeg').value,r=$('#fRent').value,el=$('#pv');
  if(!s||r===''){el.className='pv';el.innerHTML='<span>Select a segment and rental</span><span>Points Earned: —</span>';return}
  const old=keepOld(s,r,$('#fDate').value),ru=getApplicableRule(s,r,$('#fDate').value),p=old?old.points:ru?ru.points:null;
  if(p===null){el.className='pv bad';el.textContent='Rental not found in point table';return}
  el.className='pv';el.innerHTML=`<span>${s}, rental ${r}</span><span>Points Earned: ${f(p)}</span>`;
}
function openSale(id){
  editId=id||null;const s=id&&S.sales.find(x=>x.id===id);stype=s&&s.saleType==='upgrade'?'upgrade':'new';
  $('#saleTitle').textContent=s?'Edit Sale':'New Sale';
  $('#fOrder').value=s?s.orderNo:'';$('#fMsisdn').value=s?s.msisdn:'';
  $('#fDate').value=s?s.date:(view===today().slice(0,7)?today():view+'-01');
  fillSeg();$('#fSeg').value=s?s.segment:'';fillRent(s&&stype==='new'?s.rental:'');
  $('#fPrev').value=s&&stype==='upgrade'?s.previousRental:'';$('#fNext').value=s&&stype==='upgrade'?s.newRental:'';setType(stype);
  $('#dSale').showModal();
}
$('#fSeg').onchange=()=>{fillRent('');pv()};
$('#fRent').onchange=pv;
['#fDate','#fPrev','#fNext'].forEach(s=>{$(s).oninput=pv;$(s).onchange=pv});
$('#stype').onclick=e=>{const b=e.target.closest('[data-s]');if(b)setType(b.dataset.s)};
['input','change'].forEach(ev=>$('#fDate').addEventListener(ev,()=>{fillRent($('#fRent').value);pv()})); // rentals depend on the sale date's rules
$('#fSale').onsubmit=e=>{
  e.preventDefault();
  const o=$('#fOrder').value.trim(),m=$('#fMsisdn').value.trim(),d=$('#fDate').value,seg=$('#fSeg').value,r=$('#fRent').value,err=x=>{$('#err').textContent=x};
  if(!o||!m||!d||!seg||(stype==='new'&&r===''))return err('Please fill in all required fields.');
  let p=null,ex;
  if(stype==='new'){
    const old=keepOld(seg,r,d),ru=getApplicableRule(seg,r,d); // unchanged edit keeps the original rule and points
    if(old){p=old.points;ex={saleType:'new',rental:old.rental,ruleId:old.ruleId,ruleEffectiveFrom:old.ruleEffectiveFrom,previousRental:undefined,newRental:undefined,arpuAtSale:undefined}}
    else{p=ru?ru.points:null;ex={saleType:'new',rental:Number(r),ruleId:ru?ru.id:undefined,ruleEffectiveFrom:ru?ru.effectiveFrom:undefined,previousRental:undefined,newRental:undefined,arpuAtSale:undefined}}
  }
  else{
    const u=upCalc();
    if(isNaN(u.pr)||isNaN(u.nx))return err('Please fill in all required fields.');
    if(!(u.arpu>0))return err(arpuMsg(u.seg));
    if(u.nx<=u.pr)return err('New rental must be higher than previous rental.');
    p=u.pts;ex={saleType:'upgrade',rental:undefined,ruleId:undefined,ruleEffectiveFrom:undefined,previousRental:u.pr,newRental:u.nx,arpuAtSale:u.arpu};
  }
  if(p===null)return err('Rental not found in point table');
  if(S.sales.some(x=>x.id!==editId&&x.orderNo.toLowerCase()===o.toLowerCase()))return err('This Order Number already exists.');
  const rec={...ex,orderNo:o,msisdn:m,date:d,segment:seg,points:p,pointsAtSale:p};
  if(editId)Object.assign(S.sales.find(x=>x.id===editId),rec);
  else S.sales.push({id:uid(),...rec,createdAt:Date.now()});
  $('#dSale').close();setView(mKey(d));
  toast(editId?'Sale updated successfully':`${rec.saleType==='upgrade'?'Upgrade':'Sale'} added successfully — +${f(p)} ${catOf(seg)} Points`);
};

/* ===== target form ===== */
const fillT=()=>{const t=S.targets[$('#tMonth').value]||{};$('#tPost').value=t.postpaid??'';$('#tPostArpu').value=t.postpaidArpu??'';$('#tBb').value=t.broadband??'';$('#tMbbArpu').value=t.mbbArpu??'';$('#tFiberArpu').value=t.fiberArpu??'';$('#tHbbArpu').value=t.hbbArpu??''};
$('#bTarget').onclick=()=>{$('#tMonth').value=view;fillT();$('#terr').textContent='';$('#dTarget').showModal()};
$('#tMonth').onchange=fillT;
$('#fTarget').onsubmit=e=>{
  e.preventDefault();
  const m=$('#tMonth').value,a=parseFloat($('#tPost').value),b=parseFloat($('#tBb').value),ar=Object.fromEntries(Object.entries(ARPU_INPUT).map(([k,id])=>[k,$(id).value]));
  if(!/^\d{4}-\d{2}$/.test(m)||!(a>=0)||!(b>=0)||Object.values(ar).some(v=>v!==''&&!(parseFloat(v)>=0)))return $('#terr').textContent='Enter a month (YYYY-MM) and both targets. ARPU, if entered, must be 0 or more.';
  S.targets[m]={postpaid:a,broadband:b,...Object.fromEntries(Object.entries(ar).filter(([,v])=>v!=='').map(([k,v])=>[k,parseFloat(v)]))};$('#dTarget').close();setView(m);toast(`Targets saved for ${mName(m)}`);
};

/* ===== confirm dialog ===== */
function ask(msg,ok,fn){$('#confMsg').textContent=msg;$('#confOk').textContent=ok;$('#confOk').onclick=()=>{$('#dConf').close();fn()};$('#dConf').showModal()}

/* ===== data: CSV, backup, restore ===== */
function dl(name,type,text){const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([text],{type}));a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
$('#bCsv').onclick=()=>{
  if(!S.sales.length)return toast('No sales to export yet','err');
  const qt=v=>`"${String(v).replace(/^[=+@\-\t\r]/,m=>"'"+m).replace(/"/g,'""')}"`;
  const lines=[['Date','Order Number','Mobile Number','Category','Segment','Sale Type','New Sale Rental + VAT','Previous Rental','New Rental','ARPU Used','Points','Rule ID','Rule Effective From'],
    ...S.sales.slice().sort((a,b)=>a.date.localeCompare(b.date)||a.createdAt-b.createdAt).map(x=>{const up=x.saleType==='upgrade';return [x.date,x.orderNo,x.msisdn,catOf(x.segment),x.segment,up?'Upgrade':'New Sale',up?'':x.rental,x.previousRental??'',x.newRental??'',x.arpuAtSale??'',x.points,x.ruleId??'',x.ruleEffectiveFrom??'']})];
  dl(`sales-${today()}.csv`,'text/csv','\ufeff'+lines.map(r=>r.map(qt).join(',')).join('\r\n'));
};
$('#bBackup').onclick=()=>dl(`sales-backup-${today()}.json`,'application/json',JSON.stringify(S,null,2));
$('#bRestore').onclick=()=>$('#file').click();
$('#file').onchange=async e=>{
 const file=e.target.files[0];e.target.value='';if(!file)return;
 if(profile.role!=='manager'||selectedAgent==='all')return toast('Select an agent to import a backup','err');
 let backup;try{backup=JSON.parse(await file.text())}catch{return toast('Invalid backup file','err')}
 if(!backup||!Array.isArray(backup.sales)||!backup.targets)return toast('Invalid backup file','err');
 ask(`Replace this agent's sales and targets with ${backup.sales.length} historical sales? Team rules will stay unchanged.`,'Import backup',async()=>{
  try{await api('import',{agent:selectedAgent,backup});await reload();toast('Historical backup imported')}catch(e){toast(e.message,'err')}
 });
};

/* ===== sales rules (source of truth for New Sale points) ===== */
function getApplicableRule(seg,rent,date){ // latest effectiveFrom <= sale date among active rules
  return S.rules.filter(r=>!r.archived&&r.segment===seg&&+r.rental===+rent&&r.effectiveFrom<=date)
    .sort((a,b)=>b.effectiveFrom.localeCompare(a.effectiveFrom)||b.createdAt-a.createdAt)[0]||null;
}
function rentalsFor(seg,date,keep){
  const out=[...new Set(S.rules.filter(r=>!r.archived&&r.segment===seg).map(r=>+r.rental))].filter(v=>getApplicableRule(seg,v,date));
  if(keep!==''&&keep!=null&&!out.includes(+keep))out.push(+keep);return out.sort((a,b)=>a-b);
}
function keepOld(seg,r,d){const o=editId&&S.sales.find(x=>x.id===editId);return o&&o.saleType==='new'&&o.segment===seg&&String(o.rental)===String(r)&&o.date===d?o:null}
const ruleUsed=r=>raw.sales.filter(s=>s.record.ruleId===r.id).length;
function renderRules(){
  const t=today(),ci=s=>[...SEGS.Postpaid,...SEGS.Broadband].indexOf(s);
  const L=S.rules.slice().sort((a,b)=>ci(a.segment)-ci(b.segment)||a.rental-b.rental||a.effectiveFrom.localeCompare(b.effectiveFrom));
  $('#ruleRows').innerHTML=L.length?L.map(r=>{
    const st=r.archived?'Archived':r.effectiveFrom>t?'Scheduled':getApplicableRule(r.segment,r.rental,t)===r?'Active':'Superseded';
    return `<tr><td>${catOf(r.segment)}</td><td>${r.segment}</td><td>${esc(r.rental)}</td><td><b>${esc(r.points)}</b></td><td>${esc(r.effectiveFrom)}</td><td><span class="pill n">${st}</span></td><td>${r.archived?`<button class="btn sm" data-rr="${esc(r.id)}">Restore</button>`:`<button class="btn sm" data-re="${esc(r.id)}">Edit</button> <button class="btn sm dng" data-rd="${esc(r.id)}">Delete</button>`}</td></tr>`}).join('')
    :'<tr><td colspan="7" class="empty">No rules yet. Click + Add Rule.</td></tr>';
}
let ruleEdit=null;
$('#rSeg').innerHTML='<option value="">Select segment</option>'+Object.entries(SEGS).map(([c,l])=>`<optgroup label="${c}">${l.map(s=>`<option>${s}</option>`).join('')}</optgroup>`).join('');
function openRule(id){
  ruleEdit=id||null;const r=id&&S.rules.find(x=>x.id===id);
  $('#ruleTitle').textContent=r?'Edit Rule':'Add Rule';
  $('#rSeg').value=r?r.segment:'';$('#rRent').value=r?r.rental:'';$('#rPts').value=r?r.points:'';$('#rDate').value=r?r.effectiveFrom:today();
  $('#rerr').textContent='';$('#dRule').showModal();
}
$('#fRule').onsubmit=e=>{
  e.preventDefault();
  const seg=$('#rSeg').value,rent=parseFloat($('#rRent').value),pts=parseFloat($('#rPts').value),d=$('#rDate').value,err=x=>{$('#rerr').textContent=x};
  if(!seg||!(rent>0)||!(pts>=0)||!d)return err('Please enter a segment, a rental above 0, points (0 or more) and an effective date.');
  const r=ruleEdit&&S.rules.find(x=>x.id===ruleEdit);
  const lineage=new Set();let ancestor=r;while(ancestor&&!lineage.has(ancestor.id)){lineage.add(ancestor.id);ancestor=S.rules.find(x=>x.id===ancestor.prevId)};if(S.rules.some(x=>!lineage.has(x.id)&&!x.archived&&x.segment===seg&&+x.rental===rent&&x.effectiveFrom===d))return err('A rule for this segment, rental and effective date already exists.');
  let msg='Rule saved';
  if(r&&r.segment===seg&&+r.rental===rent&&+r.points===pts&&r.effectiveFrom===d){}
  else if(r&&ruleUsed(r)){ // used by saved sales: keep the old rule untouched and add a new version
    S.rules.push({id:uid(),segment:seg,rental:rent,points:pts,effectiveFrom:d,version:(r.version||1)+1,prevId:r.id,createdAt:Date.now()});
    msg='This rule is used by saved sales, so a new version was created. Saved sales are unchanged.';
  }
  else if(r)Object.assign(r,{segment:seg,rental:rent,points:pts,effectiveFrom:d});
  else S.rules.push({id:uid(),segment:seg,rental:rent,points:pts,effectiveFrom:d,version:1,createdAt:Date.now()});
  $('#dRule').close();save();renderRules();toast(msg);
};
$('#ruleRows').onclick=e=>{
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.re)openRule(b.dataset.re);
  if(b.dataset.rr){S.rules.find(x=>x.id===b.dataset.rr).archived=false;save();renderRules();toast('Rule restored')}
  if(b.dataset.rd){const r=S.rules.find(x=>x.id===b.dataset.rd),n=ruleUsed(r);
    ask(n?`This rule is used by ${n} saved sale${n>1?'s':''}, so it will be archived instead of deleted. Saved sales keep their points.`:'Delete this rule?',n?'Archive':'Delete',()=>{
      if(n)r.archived=true;else S.rules=S.rules.filter(x=>x!==r);
      save();renderRules();toast(n?'Rule archived':'Rule deleted')})}
};
$('#bRules').onclick=()=>{renderRules();$('#dRules').showModal()};
$('#bAddRule').onclick=()=>openRule();

/* ===== events ===== */
$('#bNew').onclick=()=>{if(selectedAgent!=='all')openSale()};
$('#months').onclick=e=>{const b=e.target.closest('[data-m]');if(b)setView(b.dataset.m)};
$('#trend').onclick=e=>{const b=e.target.closest('[data-t]');if(b){S.settings.trend=b.dataset.t;save();render()}};
$('#cats').onclick=e=>{const b=e.target.closest('[data-c]');if(b){cat=b.dataset.c;rows()}};
$('#types').onclick=e=>{const b=e.target.closest('[data-y]');if(b){typ=b.dataset.y;rows()}};
$('#q').oninput=e=>{q=e.target.value.trim().toLowerCase();rows()};
$('#rows').onclick=e=>{
  const b=e.target.closest('button');if(!b)return;
  if(selectedAgent==='all')return;if(b.dataset.e)openSale(b.dataset.e);
  if(b.dataset.d){const s=S.sales.find(x=>x.id===b.dataset.d);
    ask(`Delete order ${s.orderNo}? This cannot be undone.`,'Delete',()=>{S.sales=S.sales.filter(x=>x.id!==s.id);save();render();toast('Sale deleted')})}
};
document.addEventListener('click',e=>{const c=e.target.closest('[data-close]');if(c)c.closest('dialog').close()});


start();
