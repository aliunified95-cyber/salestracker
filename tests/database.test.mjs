import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {RULES} from './source-rules.js';
const db=new PGlite();
const ids=['00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000003'];
const as=async i=>{await db.exec(`reset role;set request.jwt.claim.sub='${ids[i]}';set role authenticated;`)};
const query=(s,p)=>db.query(s,p);
const sale=(id,agent,r)=>query('insert into tracker_sales values($1,$2,$3)',[id,ids[agent],JSON.stringify(r)]);
const base={saleType:'new',orderNo:'O1',msisdn:'39000000',date:'2026-10-02',segment:'Postpaid Voice',rental:15,points:999,createdAt:0};
test('Database rules, snapshots and agent isolation',async t=>{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;`);
 await db.exec(await readFile('database/schema.sql','utf8'));
 for(let i=0;i<3;i++){await query('insert into auth.users values($1)',[ids[i]]);await query('insert into tracker_profiles(id,username,display_name,role,must_change_pin) values($1,$2,$2,$3,false)',[ids[i],i===0?'AM791':'AGENT'+i,i===0?'manager':'agent'])}
 await as(0);
 let count=0;
 for(const [segment,v]of Object.entries(RULES.new))for(const [rental,points]of Object.entries(v.pts))await query('insert into tracker_rules values($1,$2)',[`seed-${++count}`,JSON.stringify({id:`seed-${count}`,segment,rental:+rental,points,effectiveFrom:'2000-01-01',createdAt:0})]);
 await t.test('all 22 seeded rentals match source points',async()=>{
  assert.equal(count,22);let n=0;for(const [segment,v]of Object.entries(RULES.new))for(const [rental,points]of Object.entries(v.pts)){await sale('seed-sale-'+(++n),1,{...base,orderNo:'S'+n,segment,rental:+rental});const r=await query('select record from tracker_sales where id=$1',['seed-sale-'+n]);assert.equal(r.rows[0].record.points,points)}
 });
 await query('insert into tracker_targets values($1,$2,$3)',[ids[1],'2026-10',JSON.stringify({postpaid:179,broadband:112,postpaidArpu:8,mbbArpu:10,fiberArpu:15,hbbArpu:15})]);
 await as(1);
 await t.test('agents cannot read another profile or sales',async()=>{await sale('mine',1,base);assert.equal((await query('select * from tracker_profiles')).rows.length,1);assert.equal((await query('select * from tracker_sales where agent_id=$1',[ids[2]])).rows.length,0)});
 await t.test('agent cannot insert another agent sale',async()=>assert.rejects(sale('foreign',2,{...base,orderNo:'foreign'}),/row-level security/));
 await t.test('agent cannot alter targets, rules, role or limiter',async()=>{
  await assert.rejects(query('insert into tracker_targets values($1,$2,$3)',[ids[1],'2026-11','{"postpaid":1,"broadband":1}']),/row-level security/);
  await assert.rejects(query('update tracker_profiles set role=\'manager\''),/permission denied/);
  await assert.rejects(query('select tracker_attempt(\'a\')'),/permission denied/);
  assert.equal((await query('update tracker_rules set record=record returning id')).rows.length,0);
 });
 await t.test('database ignores forged points and rule IDs',async()=>{const r=await query('select record from tracker_sales where id=\'mine\'');assert.equal(r.rows[0].record.points,1.5);assert.equal(r.rows[0].record.pointsAtSale,1.5)});
 await t.test('upgrade uses sale month ARPU without rounding',async()=>{await sale('upgrade',1,{...base,orderNo:'upgrade',saleType:'upgrade',previousRental:10,newRental:15});const r=await query('select record from tracker_sales where id=\'upgrade\'');assert.equal(r.rows[0].record.points,.625);assert.equal(r.rows[0].record.arpuAtSale,8)});
 await t.test('upgrades require ARPU and positive rental increase',async()=>{
  await assert.rejects(sale('missing-month',1,{...base,orderNo:'missing-month',date:'2026-11-01',saleType:'upgrade',previousRental:10,newRental:20}),/ARPU/);
  await assert.rejects(sale('bad-upgrade',1,{...base,orderNo:'bad-upgrade',saleType:'upgrade',previousRental:20,newRental:10}),/exceed/);
  await assert.rejects(sale('null-upgrade',1,{...base,orderNo:'null-upgrade',saleType:'upgrade'}),/exceed/);
 });
 await t.test('duplicate order is case insensitive per agent',async()=>assert.rejects(sale('dup',1,{...base,orderNo:'o1'}),/duplicate key/));
 await as(0);
 await t.test('used rule may have a same-date successor without changing snapshots',async()=>{
  const prior=(await query('select id from tracker_rules where record->>\'segment\'=\'Postpaid Voice\' and (record->>\'rental\')::numeric=15')).rows[0].id;
  await query('insert into tracker_rules values($1,$2)',['successor',JSON.stringify({segment:'Postpaid Voice',rental:15,points:6,effectiveFrom:'2000-01-01',createdAt:1,prevId:prior,version:2})]);
  await query('insert into tracker_rules values($1,$2)',['successor-3',JSON.stringify({segment:'Postpaid Voice',rental:15,points:8,effectiveFrom:'2000-01-01',createdAt:2,prevId:'successor',version:3})]);
  assert.equal((await query('select record from tracker_sales where id=\'mine\'')).rows[0].record.points,1.5);
 });
 await t.test('record IDs cannot contain HTML attributes',async()=>assert.rejects(sale('bad" onclick="x',1,{...base,orderNo:'invalid-id'}),/check constraint/));
 await t.test('malformed historical rentals are rejected transactionally',async()=>{
  await assert.rejects(query('select tracker_import($1,$2)',[ids[2],JSON.stringify({targets:{},sales:[{...base,rental:'<img src=x>',points:1}]})]),/historical rental/);
 });
 await t.test('new effective rule preserves existing sale snapshot',async()=>{
  await query('insert into tracker_rules values($1,$2)',['new-version',JSON.stringify({segment:'Postpaid Voice',rental:15,points:7,effectiveFrom:'2026-10-01',createdAt:1})]);
  await query('update tracker_targets set record=record||\'{"postpaidArpu":10}\'');
 });
 await as(1);
 await t.test('unchanged sale edit preserves original points and ARPU',async()=>{
  await query('update tracker_sales set record=record||\'{"msisdn":"39999999","points":999}\' where id=\'mine\'');assert.equal((await query('select record from tracker_sales where id=\'mine\'')).rows[0].record.points,1.5);
  await query('update tracker_sales set record=record||\'{"msisdn":"39999999","points":999}\' where id=\'upgrade\'');assert.equal((await query('select record from tracker_sales where id=\'upgrade\'')).rows[0].record.points,.625);
 });
 await t.test('changed calculation uses new effective rule',async()=>{await query('update tracker_sales set record=record||\'{"date":"2026-10-03"}\' where id=\'mine\'');assert.equal((await query('select record from tracker_sales where id=\'mine\'')).rows[0].record.points,7)});
 await t.test('agents cannot import arbitrary historical points',async()=>assert.rejects(query('select tracker_import($1,$2)',[ids[1],JSON.stringify({sales:[],targets:{}})]),/Manager/));
 await as(0);
 await t.test('manager sees all team sales and imports historical HBB/tdd fields',async()=>{
  assert.ok((await query('select * from tracker_sales')).rows.length>1);
  await query('select tracker_import($1,$2)',[ids[2],JSON.stringify({targets:{'2025-01':{postpaid:5,broadband:6,tddArpu:12}},sales:[{...base,date:'2025-01-02',segment:'HBB',points:3.14159,arpuUsed:12}]})]);
  const r=(await query('select record from tracker_sales where agent_id=$1',[ids[2]])).rows[0].record;assert.equal(r.segment,'5G TDD');assert.equal(r.points,3.14159);assert.equal(r.arpuAtSale,12);
  assert.equal((await query('select record from tracker_targets where agent_id=$1',[ids[2]])).rows[0].record.hbbArpu,12);
 });
 await t.test('atomic save rolls back on invalid sales',async()=>{
  const changes=[{table:'targets',id:'2026-12',agent_id:ids[1],record:{postpaid:1,broadband:1}},{table:'sales',id:'invalid',agent_id:ids[1],record:{...base,segment:'INVALID'}}];
  await assert.rejects(query('select tracker_save($1)',[JSON.stringify(changes)]),/Invalid segment/);assert.equal((await query('select * from tracker_targets where month=\'2026-12\'')).rows.length,0);
 });
 await t.test('temporary PIN and disabled accounts have no data access',async()=>{
  await db.exec('reset role');await query('update tracker_profiles set must_change_pin=true where id=$1',[ids[1]]);await as(1);assert.equal((await query('select * from tracker_sales')).rows.length,0);
  await db.exec('reset role');await query('update tracker_profiles set must_change_pin=false,active=false where id=$1',[ids[1]]);await as(1);assert.equal((await query('select * from tracker_sales')).rows.length,0);
 });
 await db.exec('reset role');await db.close();
});
