import test from 'node:test';
import assert from 'node:assert/strict';
import '../public/tag-agent-data.js';
const p=globalThis.tagAgentData;
test('both source types are accepted and field casing is normalized',()=>{
 const a=p.parseReport('SUBNO,transdate,package,tag_pay_desk,tag_agent_id\r\n33887766,08-NOV-26,P,,\r\n', 'TLS_REPORT.csv');
 assert.equal(a.kind,'new');assert.equal(a.rows[0].sale_date,'2026-11-08');assert.equal(a.rows[0].tag_agent_id,'');
 const b=p.parseReport('SUBNO,transdate,OLD_PACKAGE,NEW_PACKAGE,TAG_PAY_DESK,tag_agent_id\n33887766,08-NOV-26,O,N,DESK,BF001\n');
 assert.equal(b.kind,'upgrade');assert.equal(b.rows[0].tag_pay_desk,'DESK');
});
test('subscriber normalization strips Bahrain country code but preserves local subscriber',()=>{
 assert.equal(p.normSub('+973 33887766'),'33887766');
 assert.equal(p.normSub('33887766'),'33887766');
});
test('quoted values and CSV escaping parse correctly',()=>{
 const csv=p.parseCsv('SUBNO,tag_agent_id\n"33887766","A,""B"""\n');
 assert.deepEqual(csv[1],['33887766','A,"B"']);
});
test('bad dates and duplicates are rejected',()=>{
 assert.equal(p.normDate('31-FEB-26'),null);
 assert.throws(()=>p.parseReport('SUBNO,transdate,tag_agent_id,tag_pay_desk\n33887766,08-NOV-26,,\n33887766,08-NOV-26,,\n'),/Duplicate/);
});
