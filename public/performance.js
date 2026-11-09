/* Presentation-only metrics. Saved sales, category targets and calculation rules are not changed. */
(function(root){
  const number=value=>Number.isFinite(Number(value))?Number(value):0;
  const points=(postpaid,broadband)=>(number(postpaid)+number(broadband))/2;
  const achievement=(sales,target)=>number(target)>0?number(sales)/number(target)*100:null;
  const weightedAchievement=(postpaid,postpaidTarget,broadband,broadbandTarget)=>{
    const a=achievement(postpaid,postpaidTarget),b=achievement(broadband,broadbandTarget);
    return a===null||b===null?null:(a+b)/2;
  };
  const to75=(sales,target)=>number(target)>0?Math.max(0,number(target)*0.75-number(sales)):null;
  const scoreTo75=(postpaid,postpaidTarget,broadband,broadbandTarget)=>{
    const score=weightedAchievement(postpaid,postpaidTarget,broadband,broadbandTarget);
    return score===null?null:Math.max(0,75-score);
  };
  const runRate=(postpaid,broadband,month,asOf)=>{
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||!/^\d{4}-\d{2}-\d{2}$/.test(asOf))return null;
    const currentMonth=asOf.slice(0,7);
    if(month>currentMonth)return null;
    const [year,m]=month.split('-').map(Number);
    const days=new Date(year,m,0).getDate();
    const live=month===currentMonth;
    const elapsed=live?Math.min(days,Math.max(1,Number(asOf.slice(8)))):days;
    const factor=live?days/elapsed:1;
    return {days,elapsed,live,postpaidDaily:number(postpaid)/elapsed,broadbandDaily:number(broadband)/elapsed,
      postpaidProjected:number(postpaid)*factor,broadbandProjected:number(broadband)*factor};
  };
  root.trackerMetrics=Object.freeze({points,achievement,weightedAchievement,to75,scoreTo75,runRate});
})(globalThis);
