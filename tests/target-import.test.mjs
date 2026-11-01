import test from'node:test';import assert from'node:assert/strict';import vm from'node:vm';import{readFile}from'node:fs/promises';
const source=await readFile('public/app.js','utf8'),context=vm.createContext({});vm.runInContext(source.slice(source.indexOf('function targetImportChanges('),source.indexOf('function teamTargetFor(')),context);
const profiles=[{id:'a',username:'AGENT_A',role:'agent'},{id:'owner',username:'AM791',role:'manager'}];
test('bulk target import preserves ARPU and calculates from segment targets, ignoring optional total',()=>{
 const result=context.targetImportChanges('Username,Postpaid,Broadband,Total\nAGENT_A,16,11,28','2026-11',profiles,[{agent_id:'a',month:'2026-11',record:{postpaid:1,broadband:1,postpaidArpu:8,mbbArpu:10}}]);
 assert.equal(result.length,1);assert.equal(result[0].record.postpaid,16);assert.equal(result[0].record.broadband,11);assert.equal(result[0].record.postpaidArpu,8);assert.equal(result[0].record.mbbArpu,10);assert.equal(result[0].record.total,undefined);
});
test('bulk import rejects duplicate, unknown, manager and invalid numeric entries before saving',()=>{
 for(const text of ['AGENT_A,1,2\nAGENT_A,3,4','UNKNOWN,1,2','AM791,1,2','AGENT_A,Infinity,2','AGENT_A,-1,2','AGENT_A,,2','AGENT_A,"1,200",80'])assert.throws(()=>context.targetImportChanges(text,'2026-11',profiles,[]));
});
test('bulk target import supports tabs and validates the target month',()=>{
 assert.equal(context.targetImportChanges('AGENT_A\t22\t15','2026-11',profiles,[])[0].id,'2026-11');assert.throws(()=>context.targetImportChanges('AGENT_A,22,15','2026-13',profiles,[]));
});
