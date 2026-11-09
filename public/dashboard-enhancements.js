/* Release 2026.11.09 — display-only enhancements. No sales or targets are mutated. */
const releaseVersion='2026.11.09-tag-reports';
const pm=globalThis.trackerMetrics;
let chosenDailyDate=null;
const percent=v=>v===null?'—':v.toFixed(2)+'%';
const monthMetrics=(sales,t)=>{
  const post=total(sales.filter(s=>catOf(s.segment)==='Postpaid'));
  const bb=total(sales.filter(s=>catOf(s.segment)==='Broadband'));
  return {post,bb,score:pm.weightedAchievement(post,t.postpaid,bb,t.broadband),gap:pm.scoreTo75(post,t.postpaid,bb,t.broadband),rate:pm.runRate(post,bb,view,today())};
};
function attachEnhancements(){
 const kpis=document.querySelector('#kpis');
 kpis.insertAdjacentHTML('afterend','<section class="card" id="runRatePanel" style="margin-bottom:16px"></section>');
 const trend=document.querySelector('#chart').closest('.card');
 trend.insertAdjacentHTML('beforebegin','<section id="dailySalesPanel" class="card" style="margin-bottom:16px" hidden><div class="ch"><div><h2>Daily sales · AM791</h2><p class="sub">All agents, by selected sale date</p></div><label>Choose date<input type="date" id="dailySalesDate"></label></div><div id="dailySalesContent"></div></section>');
 const dlg=document.createElement('dialog');dlg.id='releaseDialog';dlg.innerHTML=`<h2>What's new · November 2026 · Tag Agent</h2><p class="sub">Sales Tracker update</p><ul class="release-list"><li><b>Equal category weighting:</b> Total achievement percentage uses 50% Postpaid and 50% Broadband, while sales points are added together.</li><li><b>Team Overview:</b> Each agent's total points, total achievement, gap to 75%, and month-end forecast.</li><li><b>Agent dashboards:</b> Points remaining to 75% and projected run rate from average daily sales.</li><li><b>AM791 daily sales:</b> Choose a date to view each agent's sales and category totals.</li><li><b>Sales drilldown:</b> Select a Postpaid, Broadband, or Total card to inspect individual sales and order points, sorted by date.</li><li><b>Tag Agent:</b> Managers can upload new-sale and migration reports; each sale shows Yes, No or NA and the dashboard counts only untagged sales from covered report dates.</li><li><b>Fixes:</b> Corrected inconsistent combined total calculations, including today's total; stopped the login screen flashing during session refresh; clarified actual versus projected values and missing targets.</li></ul><div class="acts"><button class="btn pri" id="releaseClose">Got it</button></div>`;
 document.body.appendChild(dlg);
 document.querySelector('#releaseClose').onclick=()=>dlg.close();
 document.querySelector('#dailySalesDate').onchange=e=>{chosenDailyDate=e.target.value;updateDailySales()};
}
attachEnhancements();
const originalRenderTeam=renderTeam;
renderTeam=function(){
 originalRenderTeam();
 const agents=raw.profiles.filter(p=>['agent','admin'].includes(p.role));
 const body=agents.map(p=>{
  const sales=raw.sales.filter(s=>s.agent_id===p.id&&mKey(s.record.date)===view).map(s=>s.record);
  const t=raw.targets.find(t=>t.agent_id===p.id&&t.month===view)?.record||{};
  const m=monthMetrics(sales,t),forecast=m.rate?pm.weightedAchievement(m.rate.postpaidProjected,t.postpaid,m.rate.broadbandProjected,t.broadband):null;
  return `<tr><td><button class="btn sm" data-agent="${esc(p.id)}">${esc(p.display_name)}</button><small class="sub"> ${esc(p.username)}</small></td><td>${sales.length}</td><td>${f(m.post)} / ${t.postpaid??'—'}</td><td>${percent(pm.achievement(m.post,t.postpaid))}</td><td>${f(m.bb)} / ${t.broadband??'—'}</td><td>${percent(pm.achievement(m.bb,t.broadband))}</td><td>${f(pm.points(m.post,m.bb))}</td><td><b>${percent(m.score)}</b></td><td>${m.gap===null?'—':f(m.gap)+' pp'}</td><td>${percent(forecast)} ${m.rate?.live?'<small class="sub">forecast</small>':''}</td></tr>`;
 }).join('');
 document.querySelector('#teamTable').innerHTML='<table class="enhanced-team"><thead><tr><th>Agent</th><th>Sales</th><th>Postpaid points / target</th><th>Postpaid %</th><th>Broadband points / target</th><th>Broadband %</th><th>Total sales points</th><th>Total achievement</th><th>Remaining to 75%</th><th>Month-end run rate</th></tr></thead><tbody>'+(body||'<tr><td colspan="10" class="empty">No agent accounts.</td></tr>')+'</tbody></table>';
};
function updateRunRate(m,t){
 const panel=document.querySelector('#runRatePanel'),rate=m.rate;
 if(!rate){panel.innerHTML='<h2>Month-end run rate</h2><p class="sub">Forecast available only for the current and completed months.</p>';return}
 const projected=pm.weightedAchievement(rate.postpaidProjected,t.postpaid,rate.broadbandProjected,t.broadband);
 panel.innerHTML=`<div class="ch"><h2>${rate.live?'Month-end run rate · forecast':'Completed month · actual performance'}</h2><span class="sub">${rate.elapsed} / ${rate.days} calendar days · ${rate.live?'average points/day × days in month':'actual final totals'}</span></div><div class="tiles">
 <div class="tile"><small>Postpaid average/day</small><b>${f(rate.postpaidDaily)}</b><small>${rate.live?'Projected':'Actual'} month total: ${f(rate.postpaidProjected)} points</small></div>
 <div class="tile"><small>Broadband average/day</small><b>${f(rate.broadbandDaily)}</b><small>${rate.live?'Projected':'Actual'} month total: ${f(rate.broadbandProjected)} points</small></div>
 <div class="tile"><small>${rate.live?'Projected':'Actual'} total achievement · 50/50</small><b>${percent(projected)}</b><small>Total points: ${f(pm.points(rate.postpaidProjected,rate.broadbandProjected))}</small></div></div>`;
}
function updateDailySales(){
 const panel=document.querySelector('#dailySalesPanel');
 if(profile?.username!=='AM791'||profile?.role!=='manager'){panel.hidden=true;return}
 panel.hidden=false;
 if(!chosenDailyDate)chosenDailyDate=today();
 const picker=document.querySelector('#dailySalesDate');if(picker.value!==chosenDailyDate)picker.value=chosenDailyDate;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(chosenDailyDate)){document.querySelector('#dailySalesContent').textContent='Select a valid date.';return}
 const agents=raw.profiles.filter(p=>['agent','admin'].includes(p.role));
 const allowed=new Set(agents.map(p=>p.id));
 const records=raw.sales.filter(s=>allowed.has(s.agent_id)&&s.record.date===chosenDailyDate);
 const sum=(items,cat)=>total(items.filter(s=>catOf(s.record.segment)===cat).map(s=>s.record));
 const post=sum(records,'Postpaid'),bb=sum(records,'Broadband');
 const breakdown=agents.map(p=>{
  const own=records.filter(s=>s.agent_id===p.id),a=sum(own,'Postpaid'),b=sum(own,'Broadband');
  return `<tr><td>${esc(p.display_name)} <small class="sub">${esc(p.username)}</small></td><td>${own.length}</td><td>${f(a)}</td><td>${f(b)}</td><td><b>${f(pm.points(a,b))}</b></td></tr>`;
 }).join('');
 const history=records.slice().sort((a,b)=>(b.record.createdAt||0)-(a.record.createdAt||0)).map(s=>{
  const owner=agents.find(p=>p.id===s.agent_id);
  return `<tr><td>${esc(owner?.username||'Unknown')}</td><td>${esc(s.record.orderNo||'')}</td><td>${esc(s.record.segment)}</td><td>${esc(s.record.saleType||'new')}</td><td>${f(Number(s.record.points||0))}</td></tr>`;
 }).join('');
 document.querySelector('#dailySalesContent').innerHTML=`<div class="tiles"><div class="tile"><small>Postpaid points</small><b>${f(post)}</b></div><div class="tile"><small>Broadband points</small><b>${f(bb)}</b></div><div class="tile"><small>Total sales points</small><b>${f(pm.points(post,bb))}</b><small>${records.length} sales</small></div></div>
 <h3>Per-agent sales</h3><div class="scroll"><table class="daily-table"><thead><tr><th>Agent</th><th>Sales</th><th>Postpaid</th><th>Broadband</th><th>Total points</th></tr></thead><tbody>${breakdown||'<tr><td colspan="5">No agents</td></tr>'}</tbody></table></div>
 <h3>Sales on ${esc(chosenDailyDate)}</h3><div class="scroll"><table class="daily-table"><thead><tr><th>Agent</th><th>Order</th><th>Segment</th><th>Type</th><th>Points</th></tr></thead><tbody>${history||'<tr><td colspan="5" class="empty">No sales on this date.</td></tr>'}</tbody></table></div>`;
}
function showReleaseOnce(){
 if(!profile||profile.must_change_pin)return;
 const key='zain-sales-tracker:release:'+releaseVersion+':'+profile.username;
 try{if(localStorage.getItem(key))return;localStorage.setItem(key,'shown')}
 catch{return}
 const dialog=document.querySelector('#releaseDialog');
 if(!dialog.open)dialog.showModal();
}
const originalRender=render;
render=function(){
 originalRender();
 if(!profile||!raw)return;
 const ms=monthSales(),t=S.targets[view]||{},m=monthMetrics(ms,t);
 const cards=document.querySelectorAll('#kpis>.card');
 if(cards.length>=3){
  const card=cards[2],p=pm.points(m.post,m.bb),target=pm.points(Number(t.postpaid||0),Number(t.broadband||0));
  const valid=m.score!==null,score=m.score;
  const color=!valid?'var(--mut)':score<75?'var(--red)':score<100?'var(--amb)':'var(--grn)';
  const remainder=!valid?'Set both category targets':score>=75?'75% achieved':f(m.gap)+' percentage points to 75%';
  card.innerHTML=`<span class="tag">TOTAL ACHIEVEMENT · 50% POSTPAID + 50% BROADBAND</span><div class="stats"><div><small>Target (sum of points)</small><strong>${f(target)}</strong></div><div><small>Total sales points</small><strong>${f(p)}</strong></div><div><small>Achievement</small><strong style="color:${color}">${percent(score)}</strong></div></div><div class="bar"><i style="width:${Math.min(Math.max(score||0,0),100)}%;background:${color}"></i><u style="left:75%"></u></div><div class="ms"><span style="left:75%">75%</span><span>100%</span></div><div class="kf"><span>${f(p)} / ${f(target)} total points</span><span style="color:${color}">${remainder}</span></div>`;
 }
 // The category cards retain 100%-target remaining points; append 75%-milestone progress.
 Array.from(cards).slice(0,2).forEach((card,i)=>{
  const value=i===0?m.post:m.bb,target=i===0?t.postpaid:t.broadband;
  const gap=pm.to75(value,target);let marker=card.querySelector('.milestone');
  if(!marker){marker=document.createElement('p');marker.className='milestone sub';card.appendChild(marker)}
  marker.textContent=gap===null?'75% milestone: set a target':gap===0?'75% milestone reached':f(gap)+' points remaining to 75%';
 });
 updateRunRate(m,t);
 // Today's blended points must follow the same half-and-half formula.
 const todayCards=document.querySelectorAll('#today .tile');
 if(todayCards.length>=3){
  const sales=ms.filter(s=>s.date===today()),tp=total(sales.filter(s=>catOf(s.segment)==='Postpaid')),tb=total(sales.filter(s=>catOf(s.segment)==='Broadband'));
  todayCards[2].querySelector('small').textContent='Total points';
  todayCards[2].querySelector('b').textContent=f(pm.points(tp,tb))+' Points';
 }
 updateDailySales();
 if(!document.querySelector('#app').hidden)setTimeout(showReleaseOnce,0);
 else setTimeout(()=>{if(!document.querySelector('#app').hidden)showReleaseOnce()},150);
};
