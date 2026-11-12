/* Real snapshot inputs, all reviewed scenarios, both versions. */
const fs = require('fs');
const path = require('path');
const opt = require('../app/optimizer.js');
const root = path.resolve(__dirname, '..');
const read = p => JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const cases = read('audit/allocation-comparison/plans.json');
let count = 0;
for (const [version, dir] of [['old','audit/app-before/data'],['new','app/data']]) {
  const systems = read(dir+'/systems.json'), routes = read(dir+'/routes.json').routes;
  const eqRaw = systems.map(s => { const v=s.eq.filter(x=>x!==null); return v.length?v.reduce((a,b)=>a+b,0)/v.length:null; });
  const vals=eqRaw.filter(x=>x!==null).sort((a,b)=>a-b), mid=vals.length>>1;
  const median=vals.length%2?vals[mid]:(vals[mid-1]+vals[mid])/2;
  const eq=eqRaw.map(x=>x===null?median:x);
  for(const c of cases) {
    const st={l:1,r:0,h:5,v:'fc',a:.5,c:0,m:1,...c.scenario};
    const costs=systems.map(s=>{const rt=routes[s.id]; return (st.c&&rt&&rt.viable&&rt.cost<s.cost?rt.cost:s.cost)*st.m;});
    const ben=systems.map((s,i)=>s.pop*(s.failing?1:st.v==='fc'?1-Math.pow(1-s.pf,st.h):st.a)*(1+st.l*eq[i]));
    const chosen=opt.optimize(costs,ben,systems.map(s=>s.conn),st.b*1e6,st.r);
    const ids=chosen.map(i=>systems[i].id).sort();
    if(JSON.stringify(ids)!==JSON.stringify(c[version].selected_ids)) throw new Error(`${version} ${c.setting} $${st.b}M membership differs`);
    if(chosen.reduce((a,i)=>a+systems[i].pop,0)!==c[version].people) throw new Error('Population differs');
    if(Math.abs(chosen.reduce((a,i)=>a+costs[i],0)-c[version].cost_usd)>1e-6) throw new Error('Cost differs');
    count++;
  }
}
console.log(JSON.stringify({matched:count}));
