import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import {readFile}from'node:fs/promises';
const source=await readFile('public/app.js','utf8');
const context=vm.createContext({});vm.runInContext(source.slice(source.indexOf('function teamTargetFor('),source.indexOf('function stateFor(')),context);
const profiles=[{id:'owner',role:'manager'},{id:'a',role:'agent'},{id:'b',role:'agent'}];
const targets=[{agent_id:'owner',month:'2026-11',record:{postpaid:999,broadband:999}},{agent_id:'a',month:'2026-11',record:{postpaid:10,broadband:20}},{agent_id:'b',month:'2026-11',record:{postpaid:15,broadband:25}},{agent_id:'a',month:'2026-10',record:{postpaid:100,broadband:100}}];
const calc=t=>JSON.parse(JSON.stringify(context.teamTargetFor('2026-11',profiles,targets,t)));
test('team sum includes agents and correct month, excludes owner personal targets',()=>assert.deepEqual(calc([]).target,{postpaid:25,broadband:45}));
test('custom team target preserves individual target allocations',()=>{const original=JSON.stringify(targets);assert.deepEqual(calc([{month:'2026-11',record:{mode:'manual',postpaid:20,broadband:30}}]).target,{postpaid:20,broadband:30});assert.equal(JSON.stringify(targets),original)});
test('effective custom target remains no higher than a reduced combined allocation',()=>assert.deepEqual(calc([{month:'2026-11',record:{mode:'manual',postpaid:50,broadband:100}}]).target,{postpaid:25,broadband:45}));
