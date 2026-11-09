/* CSV processing stays in the browser. Source files are never published as static assets. */
(function(root){
 const normSub=x=>{
   let v=String(x??'').replace(/\D/g,'');
   if(v.length>8&&v.startsWith('973'))v=v.slice(3);
   return v;
 };
 const normDate=value=>{
   const s=String(value??'').trim().toUpperCase(),months=['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
   let m=s.match(/^(\d{1,2})-([A-Z]{3})-(\d{2}|\d{4})$/);
   if(m){const month=months.indexOf(m[2])+1;const y=Number(m[3])+(m[3].length===2?(Number(m[3])>=70?1900:2000):0);if(!month)return null;return valid(y,month,Number(m[1]));}
   m=s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
   return m?valid(+m[1],+m[2],+m[3]):null;
 };
 const valid=(y,m,d)=>{
   if(y<2000||y>2100||m<1||m>12||d<1||d>31)return null;
   const x=new Date(Date.UTC(y,m-1,d));
   return x.getUTCFullYear()===y&&x.getUTCMonth()+1===m&&x.getUTCDate()===d?
     [y,String(m).padStart(2,'0'),String(d).padStart(2,'0')].join('-'):null;
 };
 const parseCsv=text=>{
   const result=[];let row=[],cell='',quoted=false;
   const s=String(text??'').replace(/^\uFEFF/,'');
   for(let i=0;i<s.length;i++){
     const ch=s[i];
     if(ch==='"'){if(quoted&&s[i+1]==='"'){cell+='"';i++}else quoted=!quoted;}
     else if(ch===','&&!quoted){row.push(cell);cell='';}
     else if((ch==='\r'||ch==='\n')&&!quoted){if(ch==='\r'&&s[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x.trim()))result.push(row);row=[];cell='';}
     else cell+=ch;
   }
   if(quoted)throw new Error('Invalid CSV: unterminated quoted field');
   row.push(cell);if(row.some(x=>x.trim()))result.push(row);
   return result;
 };
 const parseReport=(text,filename='')=>{
   if(text.length>3000000)throw new Error('CSV exceeds 3 MB');
   const csv=parseCsv(text);if(!csv.length)throw new Error('CSV is empty');
   const headers=csv[0].map(v=>v.trim().toLowerCase());
   const idx=k=>headers.indexOf(k);
   for(const h of ['subno','transdate','tag_agent_id','tag_pay_desk'])if(idx(h)<0)throw new Error('Missing report column: '+h);
   const kind=headers.includes('old_package')||headers.includes('new_package')?'upgrade':'new';
   const rows=[],seen=new Set();
   for(let i=1;i<csv.length;i++){
     const cells=csv[i],sub=normSub(cells[idx('subno')]),date=normDate(cells[idx('transdate')]);
     if(!sub||!date)throw new Error('Invalid SUBNO or transdate at CSV row '+(i+1));
     if(sub.length<6||sub.length>15)throw new Error('Invalid SUBNO length on CSV row '+(i+1));
     const key=date+'|'+sub;if(seen.has(key))throw new Error('Duplicate SUBNO and transdate on CSV row '+(i+1));
     seen.add(key);
     rows.push({subscriber:sub,sale_date:date,
       tag_agent_id:String(cells[idx('tag_agent_id')]||'').trim().slice(0,100),
       tag_pay_desk:String(cells[idx('tag_pay_desk')]||'').trim().slice(0,100)});
   }
   if(!rows.length)throw new Error('Report has no records');
   if(rows.length>5000)throw new Error('Report exceeds 5,000 rows');
   return {kind,rows,filename:String(filename).slice(0,120),dates:[...new Set(rows.map(r=>r.sale_date))].sort()};
 };
 root.tagAgentData=Object.freeze({normSub,normDate,parseCsv,parseReport});
})(globalThis);
