const assert=require("node:assert/strict"),fs=require("node:fs"),path=require("node:path");
const opt=require("../app/optimizer.js"),model=require("../app/model.js"),U=opt.UNIT;
let seed=1;const rng=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
for(let t=0;t<150;t++){
  const n=1+Math.floor(rng()*10),costs=Array.from({length:n},()=>1+Math.floor(rng()*15*U)),ben=Array.from({length:n},()=>1+Math.floor(rng()*100)),B=Math.floor(rng()*30)*U;
  let best=0;
  for(let mask=0;mask<1<<n;mask++){let c=0,b=0;for(let i=0;i<n;i++)if(mask&(1<<i)){c+=Math.ceil(costs[i]/U)*U;b+=ben[i];}if(c<=B)best=Math.max(best,b);}
  const pick=opt.knapsack(costs,ben,B);assert.equal(pick.reduce((s,i)=>s+ben[i],0),best);
}
assert.deepEqual(model.normalize({budget:"bad",equity:Infinity,atRisk:-2,small:100,cost:0}),{budget:500,equity:1,atRisk:0,small:3,cost:.5});
const tiny=[{id:"small",pop:100,conn:50,cost:U,failing:true,equity:.5,eq:[]},{id:"large",pop:150,conn:1000,cost:U,failing:true,equity:.5,eq:[]}];
assert.deepEqual(model.solve(tiny,{budget:U/1e6,equity:0,small:0},opt).chosen,[1]);
assert.deepEqual(model.solve(tiny,{budget:U/1e6,equity:0,small:1},opt).chosen,[0]);
assert.notEqual(model.fingerprint({small:0}),model.fingerprint({small:1}));
assert.deepEqual(model.costScenario([1,2,3],model.random(42)),model.costScenario([1,2,3],model.random(42)));
const systems=JSON.parse(fs.readFileSync(path.join(__dirname,"../app/data/systems.json"))),summary=JSON.parse(fs.readFileSync(path.join(__dirname,"../app/data/summary.json")));
for(const row of summary.comparison){
  const result=model.solve(systems,{budget:row.budget_musd},opt);
  assert.equal(result.chosen.reduce((s,i)=>s+systems[i].pop,0),row.optimizer.people,"Full pipeline/browser parity at "+row.budget_musd);
}
const allBudget=Math.ceil(systems.reduce((s,x)=>s+Math.ceil(x.cost/U)*U,0)/1e6);
assert.equal(model.solve(systems,{budget:allBudget,atRisk:1},opt).chosen.length,systems.length);
const example=model.inputs([{pop:100,failing:false,conn:100,eq:[.67,.2,null,.5],equity:.456789,cost:10}],{equity:2,atRisk:.4,small:1});
assert.equal(example.benefits[0],100*.4*(1+2*.456789)*2);
console.log("Passed: 150 exhaustive solver comparisons; priority behavior; input validation; reproducible cost scenarios; all five pipeline/browser plans; fund-all.");
