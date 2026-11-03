/* Shared, inspectable planning model. No fitted health-outcome prediction. */
(function(root) {
  const DEFAULTS = Object.freeze({budget:500,equity:1,atRisk:.5,small:0,cost:1});
  const LIMITS = {equity:[0,3],atRisk:[0,1],small:[0,3],cost:[.5,2]};
  function normalize(input={}, maxBudget=25000) {
    const out={};
    for(const [key,fallback] of Object.entries(DEFAULTS)) {
      const value=Number(input[key] ?? fallback);
      const [lo,hi]=key==="budget"?[0,maxBudget]:LIMITS[key];
      out[key]=Number.isFinite(value)?Math.min(hi,Math.max(lo,value)):fallback;
    }
    return out;
  }
  function equityValue(system) {
    if(Number.isFinite(system.equity)) return system.equity;
    const values=system.eq.filter(Number.isFinite);
    return values.length?values.reduce((a,b)=>a+b,0)/values.length:.5;
  }
  function inputs(systems,params) {
    const p=normalize(params);
    return {
      costs:systems.map(s=>s.cost*p.cost),
      benefits:systems.map(s=>s.pop*(s.failing?1:p.atRisk)*(1+p.equity*equityValue(s))*(1+(s.conn<=500?p.small:0))),
    };
  }
  function fingerprint(params) {const p=normalize(params);return JSON.stringify(Object.keys(DEFAULTS).map(k=>p[k]));}
  function random(seed) {
    let state=seed>>>0;
    return ()=>{state=(Math.imul(1664525,state)+1013904223)>>>0;return (state+.5)/4294967296;};
  }
  function normal(rng) {return Math.sqrt(-2*Math.log(rng()))*Math.cos(2*Math.PI*rng());}
  function costScenario(costs,rng) {
    // Sensitivity assumption: independent lognormal errors, 90% between 0.5x and 2x.
    const sigma=Math.log(2)/1.645;
    return costs.map(c=>c*Math.exp(sigma*normal(rng)));
  }
  function solve(systems,params,opt) {
    const p=normalize(params),{costs,benefits}=inputs(systems,p);
    const chosen=opt.knapsack(costs,benefits,p.budget*1e6);
    const baseline=opt.statusFirst(costs.map(c=>Math.ceil(c/opt.UNIT)*opt.UNIT),systems.map(s=>s.pop),systems.map(s=>s.failing?1:0),p.budget*1e6);
    return {params:p,chosen,baseline,costs,benefits,fingerprint:fingerprint(p)};
  }
  const api={DEFAULTS,LIMITS,normalize,equityValue,inputs,fingerprint,random,costScenario,solve};
  if(typeof module!=="undefined"&&module.exports)module.exports=api;else root.XylemModel=api;
})(typeof self!=="undefined"?self:globalThis);
