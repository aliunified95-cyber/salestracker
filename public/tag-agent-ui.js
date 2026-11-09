/* November release: detailed sales drilldown and date-scoped Tag Agent reconciliation. */
(function(){
 const $tag=s=>document.querySelector(s);
 const e=esc;
 let tagDialog=null,detailsDialog=null,filter='all',unmatchedOnly=false;
 const viewStatuses=()=>new Map((raw?.tagStatuses||[]).map(r=>[r.sale_id,r.status]));
 const tagFor=(id,map)=>map.get(id)||'NA';
 const isManagerOwner=()=>profile?.username==='AM791'&&profile?.role==='manager';
 const activeSales=()=>raw?.sales?.filter(r=>{
   if(selectedAgent==='all')return raw.profiles.some(p=>p.id===r.agent_id&&['agent','admin'].includes(p.role));
   return r.agent_id===selectedAgent;
 })||[];
 const scopeSales=(type='all',onlyNo=false)=>{
   const status=viewStatuses();
   return activeSales().filter(row=>
      row.record.date?.startsWith(view) &&
      (type==='all'||catOf(row.record.segment)===type) &&
      (!onlyNo||tagFor(row.id,status)==='No')
   ).sort((a,b)=>b.record.date.localeCompare(a.record.date)||
     String(b.record.createdAt||'').localeCompare(String(a.record.createdAt||''))||
     String(a.record.orderNo||'').localeCompare(String(b.record.orderNo||'')));
 };
 const label=s=>s==='Yes'?'<b class="tag-ok">Yes</b>':s==='No'?'<b class="tag-missing">No</b>':'<span class="sub" title="No report has been uploaded for this sale date and sale type">NA</span>';
 const rowHtml=(r,status)=>{
   const s=r.record,agent=raw.profiles.find(p=>p.id===r.agent_id);
   return `<tr><td>${e(s.date||'')}</td><td>${e(agent?.username||'—')}</td><td>${e(s.orderNo||'')}</td><td>${e(s.msisdn||'')}</td><td>${e(catOf(s.segment))}</td><td>${e(s.segment)}</td><td>${e(s.saleType==='upgrade'?'Upgrade':'New')}</td><td><b>${f(Number(s.points||0))}</b></td><td>${label(tagFor(r.id,status))}</td></tr>`;
 };
 const listBody=(type,onlyNo)=>{
    const sales=scopeSales(type,onlyNo),sum=sales.reduce((a,r)=>a+Number(r.record.points||0),0),statuses=viewStatuses();
    return `<div class="ch"><p class="sub">${sales.length} sale(s) · ${f(sum)} absolute points · Sorted newest to oldest</p><span class="sub">Tag Agent: Yes / No / NA</span></div>
      <div class="scroll"><table class="tag-detail-table"><thead><tr><th>Sale date</th><th>Agent</th><th>Order number</th><th>Subscriber</th><th>Category</th><th>Segment</th><th>Sale type</th><th>Points</th><th>Tag agent</th></tr></thead><tbody>${sales.length?sales.map(r=>rowHtml(r,statuses)).join(''):'<tr><td colspan="9" class="empty">No matching sales in this month.</td></tr>'}</tbody></table></div>`;
 };
 const openSales=(type='all',onlyNo=false)=>{
   filter=type;unmatchedOnly=onlyNo;
   $tag('#salesDetailTitle').textContent=onlyNo?'Sales without Tag Agent':type==='all'?'Total sales':type+' sales';
   $tag('#salesDetailsBody').innerHTML=listBody(type,onlyNo);
   if(!detailsDialog.open)detailsDialog.showModal();
 };
 const updateBadge=()=>{
   const btn=$tag('#tagAgentButton');
   if(!btn||!raw)return;
   const missing=scopeSales('all',true),statusReady=raw.tagReady;
   btn.textContent='Tag agent · '+(statusReady?missing.length:'Unavailable');
   btn.title=statusReady?'View sales missing Tag Agent for dates covered by uploaded reports':'Tag Agent report database not set up';
   btn.disabled=!statusReady;
 };
 const updateUploadVisibility=()=>{
   const b=$tag('#tagUploadButton');
   if(b){b.hidden=!isManagerOwner();b.disabled=raw?.tagReady===false;b.title=raw?.tagReady===false?'Database setup required: apply database/tag-agent-reports.sql in Supabase':'Upload Tag Agent report';}
 };
 const install=()=>{
   detailsDialog=document.createElement('dialog');
   detailsDialog.id='salesDetailsDialog';detailsDialog.className='tag-dialog';
   detailsDialog.innerHTML=`<div class="ch"><div><h2 id="salesDetailTitle">Sales details</h2><p class="sub" id="salesDetailMonth">Sales by day</p></div><button type="button" class="btn" id="salesDetailsClose">Close</button></div><div id="salesDetailsBody"></div>`;
   document.body.append(detailsDialog);
   $tag('#salesDetailsClose').onclick=()=>detailsDialog.close();
   tagDialog=document.createElement('dialog');tagDialog.id='tagUploadDialog';tagDialog.className='tag-dialog';
   tagDialog.innerHTML=`<div class="ch"><h2>Upload Tag Agent reports · AM791</h2><button class="btn" type="button" id="tagUploadClose">Close</button></div>
     <p class="sub">Upload TLS_REPORT.csv (new sales), TLS_MIG_REPOERT.csv (upgrades), or both. Files must include SUBNO, transdate, tag_agent_id and tag_pay_desk. Statuses are checked by subscriber, sale date and sale type. No sales or targets are changed.</p>
     <label>Choose report CSV files<input type="file" id="tagCsvFiles" accept=".csv,text/csv" multiple></label>
     <p class="sub">Each file replaces Tag Agent data only for its covered dates and type. Dates not uploaded remain NA. Re-upload corrected reports to update statuses.</p>
     <p class="sub" id="tagUploadStatus" role="status"></p>
     <div class="acts"><button type="button" class="btn pri" id="tagUploadSubmit">Parse and upload</button></div>`;
   document.body.append(tagDialog);
   $tag('#tagUploadClose').onclick=()=>tagDialog.close();
   const toolbar=document.createElement('div');toolbar.className='row tag-toolbar';
   toolbar.innerHTML='<button type="button" class="btn" id="tagAgentButton">Tag agent</button><button type="button" class="btn pri" id="tagUploadButton" hidden>Upload Tag Agent report</button>';
   $tag('#kpis').insertAdjacentElement('beforebegin',toolbar);
   $tag('#tagAgentButton').onclick=()=>openSales('all',true);
   $tag('#tagUploadButton').onclick=()=>tagDialog.showModal();
   $tag('#kpis').addEventListener('click',evt=>{
     const card=evt.target.closest('.card');
     if(!card||!$tag('#kpis').contains(card))return;
     const index=Array.from($tag('#kpis').children).indexOf(card);
     if(index>=0&&index<3)openSales(['Postpaid','Broadband','all'][index]);
   });
   $tag('#kpis').addEventListener('keydown',evt=>{
     const card=evt.target.closest('.card');
     if(card&&(evt.key==='Enter'||evt.key===' ')){
       evt.preventDefault();
       const index=Array.from($tag('#kpis').children).indexOf(card);
       if(index>=0&&index<3)openSales(['Postpaid','Broadband','all'][index]);
     }
   });
   $tag('#tagUploadSubmit').onclick=async()=>{
     const files=Array.from($tag('#tagCsvFiles').files||[]),status=$tag('#tagUploadStatus'),button=$tag('#tagUploadSubmit');
     if(!isManagerOwner())return;
     if(!files.length){status.textContent='Choose one or two CSV files.';return}
     if(files.length>2){status.textContent='Upload no more than two files at a time.';return}
     button.disabled=true;status.textContent='Validating reports…';
     try{
       const reports=[];
       for(const file of files){
         if(file.size>3000000||!file.name.toLowerCase().endsWith('.csv'))throw Error('Only CSV files under 3 MB are accepted.');
         reports.push(tagAgentData.parseReport(await file.text(),file.name));
       }
       if(reports.length===2&&reports[0].kind===reports[1].kind)throw Error('Upload one new-sales report and one upgrade report at a time.');
       for(const report of reports){
         status.textContent='Uploading '+e(report.filename)+' · '+report.rows.length+' rows, '+report.dates.length+' dates…';
         await api('tag-upload',{kind:report.kind,rows:report.rows});
       }
       await reload();
       const summary=reports.map(r=>r.filename+': '+r.rows.length+' rows, '+r.dates[0]+' to '+r.dates[r.dates.length-1]).join(' | ');
       status.textContent='Saved. '+summary;
       $tag('#tagCsvFiles').value='';
       updateBadge();
     }catch(error){status.textContent='Upload failed. '+(String(error.message).includes('tracker_tag_upload')?'The Tag Agent database migration is missing. Apply database/tag-agent-reports.sql in Supabase SQL Editor.':error.message);}
     finally{button.disabled=false;}
   };
 };
 install();
 const baseRender=render;
 render=function(){
   baseRender();
   $tag('#salesDetailMonth').textContent=mName(view)+' · '+(selectedAgent==='all'?'Team':raw?.profiles.find(p=>p.id===selectedAgent)?.display_name||'My sales');
   Array.from($tag('#kpis').children).slice(0,3).forEach((card,i)=>{
     card.classList.add('clickable-kpi');card.setAttribute('role','button');card.setAttribute('tabindex','0');
     card.setAttribute('aria-label','Open '+['Postpaid','Broadband','Total'][i]+' sales list');
   });
   updateBadge();updateUploadVisibility();
   if(detailsDialog.open)$tag('#salesDetailsBody').innerHTML=listBody(filter,unmatchedOnly);
 };
})();
