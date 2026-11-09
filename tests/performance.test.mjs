import test from 'node:test';
import assert from 'node:assert/strict';
import '../public/performance.js';
const m=globalThis.trackerMetrics;

test('50/50 achievement is the average of category percentages, not a combined-target ratio',()=>{
  assert.equal(m.weightedAchievement(90,100,30,50),75);
  assert.equal(m.points(90,30),60);
  assert.equal(m.points(100,50),75);
});
test('below 75% displays the remaining score and sales points, not a negative number',()=>{
  assert.equal(m.scoreTo75(50,100,30,100),35);
  assert.equal(m.to75(50,100),25);
  assert.equal(m.scoreTo75(100,100,100,100),0);
  assert.equal(m.to75(100,100),0);
});
test('total achievement is absent if either category target is not set',()=>{
  assert.equal(m.weightedAchievement(20,0,40,100),null);
  assert.equal(m.scoreTo75(20,0,40,100),null);
});
test('run rate scales a current month over elapsed calendar days, including today',()=>{
  const r=m.runRate(90,45,'2026-11','2026-11-09');
  assert.equal(r.elapsed,9);
  assert.equal(r.days,30);
  assert.equal(r.postpaidDaily,10);
  assert.equal(r.broadbandDaily,5);
  assert.equal(r.postpaidProjected,300);
  assert.equal(r.broadbandProjected,150);
  assert.equal(r.live,true);
});
test('historical months show final actuals and future months have no forecast',()=>{
  const r=m.runRate(42,21,'2026-10','2026-11-09');
  assert.equal(r.live,false);
  assert.equal(r.elapsed,31);
  assert.equal(r.postpaidProjected,42);
  assert.equal(m.runRate(1,1,'2026-12','2026-11-09'),null);
});
