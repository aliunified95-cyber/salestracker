import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const chartCode=source.slice(source.indexOf('function chart(ms){'),source.indexOf('\nfunction rows(){'));
assert.ok(chartCode.startsWith('function chart(ms){'));

function draw(sales,month='2026-11',mode='both'){
 const ctx={
  view:month,
  S:{settings:{trend:mode}},
  today:()=> '2026-11-16',
  catOf:segment=>segment==='Postpaid Voice'?'Postpaid':'Broadband',
  f:n=>String(Math.round(n*100)/100),
  Date,Math,Array,String
 };
 return runInNewContext(chartCode+'\nchart(sales)',ctx);
}
const sale=(date,segment,points)=>({date,segment,points});
test('trend shows daily number of sales, not cumulative points',()=>{
 const output=draw([
  sale('2026-11-01','Postpaid Voice',5),
  sale('2026-11-01','Postpaid Voice',3),
  sale('2026-11-02','Postpaid Voice',10),
  sale('2026-11-02','MBB',7)
 ]);
 assert.match(output,/Postpaid, day 1: 2 sales/);
 assert.match(output,/Postpaid, day 2: 1 sale</);
 assert.match(output,/Postpaid, day 3: 0 sales/);
 assert.match(output,/Broadband, day 2: 1 sale</);
 assert.match(output,/Number of sales recorded each day by category/);
 assert.doesNotMatch(output,/Cumulative daily points/);
});
test('chart filters each category and uses integer counts regardless of point values',()=>{
 const output=draw([
  sale('2026-11-01','Postpaid Voice',0.5),
  sale('2026-11-01','Fiber',0.75),
  sale('2026-11-02','Fiber',1.5)
 ],'2026-11','Broadband');
 assert.doesNotMatch(output,/Postpaid, day/);
 assert.match(output,/Broadband, day 1: 1 sale</);
 assert.match(output,/Broadband, day 2: 1 sale</);
 assert.match(output,/>1<\/text>/);
});
