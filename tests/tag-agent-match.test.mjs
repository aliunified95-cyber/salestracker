import test from 'node:test';
import assert from 'node:assert/strict';
import {missingTagCandidates,reconcileTagStatuses} from '../api/tag-agent-match.js';

const sale=(id,msisdn,date,saleType='new',orderNo='ORD-100')=>({id,record:{msisdn,date,saleType,orderNo}});
const status=(sale_id,status)=>({sale_id,status});
const report=(subscriber,sale_date,report_type='new',tag_agent_id='BF01539',tag_pay_desk='Portal')=>({subscriber,sale_date,report_type,tag_agent_id,tag_pay_desk});

test('reported TLS_REPORT subscriber 36042290 recognizes BF01539 on 10 November',()=>{
 const sales=[sale('s1','36042290','2026-11-10')], statuses=[status('s1','No')];
 const imported=[report('36042290','2026-11-10')];
 assert.deepEqual(missingTagCandidates(sales,statuses),['36042290']);
 assert.equal(reconcileTagStatuses(sales,statuses,imported)[0].status,'Yes');
});
test('tagged subscriber is found when recorded sale date differs within the same month',()=>{
 assert.equal(reconcileTagStatuses([sale('s','36042290','2026-11-11')],[status('s','No')],[report('36042290','2026-11-10')])[0].status,'Yes');
});
test('tagged subscriber is found when tracker sale type differs from source report',()=>{
 assert.equal(reconcileTagStatuses([sale('s','+97336042290','2026-11-10','upgrade')],[status('s','No')],[report('36042290','2026-11-10')])[0].status,'Yes');
});
test('actual untagged record remains No despite another dated tagged row',()=>{
 const rows=[report('36042290','2026-11-10','new','',''),report('36042290','2026-11-11')];
 assert.equal(reconcileTagStatuses([sale('s','36042290','2026-11-10')],[status('s','No')],rows)[0].status,'No');
});
test('uncovered dates stay NA and already confirmed Yes stays Yes',()=>{
 const records=[sale('a','36042290','2026-11-17'),sale('b','36042290','2026-11-10')];
 assert.deepEqual(reconcileTagStatuses(records,[status('a','NA'),status('b','Yes')],[report('36042290','2026-11-10')]).map(x=>x.status),['NA','Yes']);
});
test('conflicting imported tags do not automatically become Yes',()=>{
 const source=[report('36042290','2026-11-11'),report('36042290','2026-11-12','new','','')];
 assert.equal(reconcileTagStatuses([sale('s','36042290','2026-11-15')],[status('s','No')],source)[0].status,'No');
});
test('matching is limited to the same calendar month',()=>{
 assert.equal(reconcileTagStatuses([sale('s','36042290','2026-12-01')],[status('s','No')],[report('36042290','2026-11-10')])[0].status,'No');
});
test('valid subscriber-like Order No is a fallback identifier',()=>{
 const records=[sale('s','not available','2026-11-11','new','36042290')],statuses=[status('s','No')];
 assert.deepEqual(missingTagCandidates(records,statuses),['36042290']);
 assert.equal(reconcileTagStatuses(records,statuses,[report('36042290','2026-11-10')])[0].status,'Yes');
});
test('subscriber match takes priority over order number',()=>{
 const rows=[report('36042290','2026-11-10','new','',''),report('39020881','2026-11-10')];
 assert.equal(reconcileTagStatuses([sale('s','36042290','2026-11-12','new','39020881')],[status('s','No')],rows)[0].status,'No');
});
test('pay desk alone counts as tagged consistent with existing SQL rule',()=>{
 assert.equal(reconcileTagStatuses([sale('s','36042290','2026-11-11')],[status('s','No')],[report('36042290','2026-11-10','new','','Portal')])[0].status,'Yes');
});