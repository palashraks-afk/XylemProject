/* Local release QA. npm install --prefix <separate-dir> playwright@1.62.1
 * NODE_PATH=<separate-dir>/node_modules node tests/release_browser.cjs
 * Uses installed Chrome and Edge; no publishing or external writes.
 */
const {chromium} = require('playwright');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const path = require('node:path');
const OUT=process.env.XYLEM_QA_OUT || 'audit/release-qa/browser';
const URL=process.env.XYLEM_QA_URL || 'http://127.0.0.1:8885';
fs.mkdirSync(OUT,{recursive:true});
const result={started:new Date().toISOString(),checks:[],browsers:[],limitations:['Mobile viewport/touch emulation only; physical iOS/Safari and screen readers not tested.']};
const check=async(name,fn)=>{if(process.env.XYLEM_QA_FILTER&&!name.includes(process.env.XYLEM_QA_FILTER))return;try{const evidence=await fn();result.checks.push({name,status:'PASS',evidence});}catch(error){result.checks.push({name,status:'FAIL',error:error.stack});}};
const readCsv=text=>text.split(/\r?\n/).filter(l=>l&&!l.startsWith('#')).map(l=>(l.match(/"(?:[^"]|"")*"|[^,]+/g)||[]).map(v=>v.replace(/^"|"$/g,'').replace(/""/g,'"')));
let navigation=0;
async function ready(page,hash='') {await page.goto(URL+'/?qa='+(++navigation)+hash);await page.waitForFunction(()=>!!window.__xylem);}
async function settled(page) {await page.waitForFunction(()=>{const p=new URLSearchParams(location.hash.slice(1));return window.__xylem&&['b','l','h','v','a','r','c','m'].every(k=>p.get(k)===String(__xylem.st[k]));},null,{timeout:5000});}
async function control(page,id,value) {await page.locator('#'+id).evaluate((e,v)=>{e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));},String(value));await settled(page);}
async function exportAndCheck(page,label,immediate) {
  const download=page.waitForEvent('download');
  if(immediate) await page.evaluate(immediate); else await page.locator('#export').click();
  const file=path.join(OUT,label+'.csv');await (await download).saveAs(file);
  const text=fs.readFileSync(file,'utf8'), [columns,...values]=readCsv(text), rows=values.map(v=>Object.fromEntries(columns.map((c,i)=>[c,v[i]])));
  const state=await page.evaluate(()=>{const x=__xylem;return {st:x.st,chosen:x.plan.chosen.map(i=>x.systems[i].id).sort(),people:x.plan.people,spent:x.plan.spent,small:x.plan.small,stabOK:x.plan.stabOK,stabBudget:x.plan.stabBudget,systems:x.systems.filter((s,i)=>x.plan.inPlan[i]),snapshot:document.querySelector('#snap').textContent,kpis:document.querySelector('#kpis').innerText};});
  assert.deepEqual(rows.map(r=>r.water_system_id).sort(),state.chosen);
  assert.equal(rows.reduce((n,r)=>n+ +r.people,0),state.people);
  assert.ok(Math.abs(rows.reduce((n,r)=>n+ +r.cost_usd,0)-state.spent)<0.0001);
  const params=new URLSearchParams(await page.evaluate(()=>location.hash.slice(1)));
  for(const k of ['b','l','h','v','a','r','c','m'])assert.equal(params.get(k),String(state.st[k]));
  assert.ok(text.includes('Budget_USD '+state.st.b*1e6+';'));
  assert.ok(text.includes('modeled_people '+state.people+';'));
  assert.ok(text.includes('selected_systems '+rows.length+';'));
  assert.ok(text.includes('modeled_cost_usd '+state.spent+';'));
  const manifest=JSON.parse(fs.readFileSync('app/data/snapshot.json'));assert.ok(text.includes(manifest.id));
  const build=JSON.parse(fs.readFileSync('app/build.json'));assert.ok(text.includes('UI_build '+build.id+';'));
  const byId=new Map(state.systems.map(s=>[s.id,s]));
  for(const r of rows){const s=byId.get(r.water_system_id);assert.equal(+r.cost_usd,s.cost);assert.ok(Math.abs(+r.allocation_weight-(s.failing?1:state.st.v==='fixed'?state.st.a:1-Math.pow(1-s.pf,state.st.h)))<1e-12, 'independent weight formula differs beyond floating-point tolerance');assert.equal(r.stability_pct,state.stabOK?String(Math.round(s.p[state.stabBudget===100?0:state.stabBudget===250?1:state.stabBudget===500?2:state.stabBudget===1000?3:4]*100)):'');}
  assert.ok(state.kpis.includes(state.people.toLocaleString('en-US')));
  assert.ok(state.kpis.includes(rows.length.toLocaleString('en-US')));
  if(!state.stabOK) {assert.ok(state.kpis.includes('n/a'));assert.ok(state.kpis.includes('unavailable for these controls'));}
  return {controls:state.st,systems:rows.length,people:state.people,cost:state.spent,small:state.small,stabilityAvailable:state.stabOK};
}
(async()=>{
 for(const channel of ['chrome','msedge']){
  const browser=await chromium.launch({channel,headless:true});
  result.browsers.push({channel,version:browser.version()});
  const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
  const page=await context.newPage(), errors=[],failed=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('requestfailed',r=>{if(!r.failure().errorText.includes('ABORTED'))failed.push({url:r.url(),error:r.failure().errorText});});
  await ready(page);
  for(const budget of [100,250,500,1000,2000])await check(channel+' default '+budget+'M CSV/display',async()=>{await page.locator(`[data-preset="${budget}"]`).click();await settled(page);return exportAndCheck(page,channel+'-default-'+budget);});
  await check(channel+' minimum and maximum budgets',async()=>{await control(page,'budget',0);const low=await exportAndCheck(page,channel+'-25M');await page.locator('[data-preset="0"]').click();await settled(page);return {low,high:await exportAndCheck(page,channel+'-all')};});
  await check(channel+' equity reserve routing cost fixed combinations',async()=>{
    const evidence=[];
    for(const hash of ['#b=500&l=2&r=0.3&c=1&m=1','#b=500&l=3&r=0.6&c=1&m=2','#b=500&l=0&r=0&c=0&m=0.55','#b=500&v=fixed&a=0.5&l=1','#b=25&v=fixed&a=1&r=0.6&c=1&m=0.5','#b=2000&h=10&l=2']){
      await ready(page,hash); evidence.push(await exportAndCheck(page,channel+'-combination-'+evidence.length));
    } return evidence;
  });
  await check(channel+' rapid control changes then immediate export',async()=>{
    await ready(page);return exportAndCheck(page,channel+'-rapid',()=>{for(const [id,value] of [['lam',0],['lam',3],['res',0.6],['res',0.3],['mul',2],['mul',0.55]]){const e=document.querySelector('#'+id);e.value=value;e.dispatchEvent(new Event('input',{bubbles:true}));}document.querySelector('#export').click();});
  });
  await check(channel+' cost scenarios complete and cancel on changed controls',async()=>{
    await ready(page,'#b=25');
    await page.locator('#runScen').click();
    await page.waitForFunction(()=>document.querySelector('#runScen').getAttribute('aria-disabled') !== 'true');
    const complete=await page.locator('#scenOut').innerText();assert.ok(complete.includes('80% of 40 scenarios'));
    await page.locator('#runScen').click();await control(page,'lam',2);
    await page.waitForFunction(()=>document.querySelector('#runScen').getAttribute('aria-disabled') !== 'true');
    const cancelled=await page.locator('#scenOut').innerText();assert.ok(cancelled.includes('Controls changed'));
    return {complete,cancelled};
  });
  await check(channel+' selected detail refresh and fixed-share popup',async()=>{
    await ready(page);await page.locator('[data-view="2d"]').click();
    const id=await page.evaluate(()=>__xylem.systems.find(s=>!s.failing&&s.lat).id);
    await page.locator('#find').fill(id);await page.locator('#find').dispatchEvent('change');
    const before=await page.locator('#detail').innerText();await control(page,'mul',2);const after=await page.locator('#detail').innerText();assert.notEqual(before,after);assert.ok(!after.includes('of stress tests'));const updatedPopup=await page.locator('.leaflet-popup-content').innerText();assert.ok(!updatedPopup.includes('of stress tests'));assert.ok(updatedPopup.includes('unavailable for these controls'));
    await page.locator('[data-val="fixed"]').evaluate(e=>e.click());await control(page,'arw',0.5);
    await page.locator('#find').dispatchEvent('change');const popup=await page.locator('.leaflet-popup-content').innerText();assert.ok(popup.includes('Fixed At-Risk share'));assert.ok(popup.includes('50%'));
    return {id,before,after,updatedPopup,popup};
  });
  await check(channel+' keyboard controls tabs sort and inspect',async()=>{
    await ready(page);const budget=page.getByRole('slider',{name:'Funding budget',exact:true}).first();await budget.focus();const old=await budget.inputValue();await page.keyboard.press('ArrowRight');await settled(page);assert.notEqual(await budget.inputValue(),old);
    await page.getByRole('tab',{name:'Funded plan',exact:true}).focus();await page.keyboard.press('ArrowRight');assert.equal(await page.getByRole('tab',{name:'Local view',exact:true}).getAttribute('aria-selected'),'true');await page.keyboard.press('Home');
    const sort=page.locator('th button').first();await sort.focus();await page.keyboard.press('Enter');assert.equal(await page.locator('th').first().getAttribute('aria-sort'),'descending');
    const system=page.locator('.system-link').first();await system.focus();await page.keyboard.press('Enter');assert.equal(await page.locator('#detail').isVisible(),true);
    const focus=await page.locator('.system-link').first().evaluate(e=>({outline:getComputedStyle(e).outlineStyle,width:getComputedStyle(e).outlineWidth}));
    return {rangeName:await budget.getAttribute('aria-label'),valueText:await budget.getAttribute('aria-valuetext'),focus};
  });
  await check(channel+' map colors synchronize and routes agree',async()=>{
    await ready(page,'#b=500&l=2&r=0.3&c=1');await page.locator('[data-color="status"]').evaluate(e=>e.click());assert.equal(await page.locator('#colorSel').inputValue(),'status');
    await page.locator('#colorSel').selectOption('stab');assert.equal(await page.locator('[data-color="stab"]').getAttribute('aria-pressed'),'true');
    await page.waitForFunction(()=>Xylem3D.map()?.getSource('routes')?._data.features.length > 0,null,{timeout:30000});
    const routeCounts=async()=>page.evaluate(()=>({two:__xylem.routeGroup.getLayers().length,three:Xylem3D.map().getSource('routes')._data.features.length}));
    const on=await routeCounts();assert.equal(on.two,on.three);assert.ok(on.two>0);
    await page.locator('#routes').evaluate(e=>{e.checked=false;e.dispatchEvent(new Event('change'));});const off=await routeCounts();assert.equal(off.two,0);assert.equal(off.three,0);return {on,off};
  });
  await check(channel+' invalid shared controls normalize',async()=>{
    await ready(page,'#b=bad&l=-50&r=90&m=NaN&h=Infinity&a=-1');const state=await page.evaluate(()=>__xylem.st);assert.equal(state.b,500);assert.equal(state.l,0);assert.equal(state.r,0.6);assert.equal(state.m,1);assert.equal(state.h,5);assert.equal(state.a,0.1);return state;
  });
  await check(channel+' desktop screenshot and map load',async()=>{
    await ready(page);await page.waitForFunction(()=>Xylem3D.map()?.getSource('sys')?._data.features.length > 0 || !document.querySelector('#map').hidden,null,{timeout:30000});await page.screenshot({path:path.join(OUT,channel+'-desktop.png')});return {canvas:await page.locator('.maplibregl-canvas').count(),status:await page.locator('#mapStatus').innerText(),allocationFeatures:await page.evaluate(()=>Xylem3D.map()?.getSource('sys')?._data.features.length || 0),allBackgroundRequestsIdle:await page.evaluate(()=>Xylem3D.map()?.loaded() || false)};
  });
  await check(channel+' mobile 390px and 320px layout and export',async()=>{
    const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,acceptDownloads:true});const p=await mobile.newPage();await ready(p,'#b=500&l=2&r=0.3&c=1');await p.locator('[data-view="2d"]').click();await p.screenshot({path:path.join(OUT,channel+'-mobile.png'),fullPage:true});
    const evidence=[];for(const width of [390,320]){await p.setViewportSize({width,height:844});const size=await p.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));assert.ok(size.scrollWidth<=size.width);const view=await p.locator('.vt').boundingBox(),zoom=await p.locator('.leaflet-control-zoom').boundingBox();assert.ok(view.x+view.width<=zoom.x||zoom.x+zoom.width<=view.x||view.y+view.height<=zoom.y||zoom.y+zoom.height<=view.y,'2D map buttons overlap');evidence.push(size);}await p.locator('[data-preset="100"]').tap();await settled(p);evidence.push(await exportAndCheck(p,channel+'-mobile-export'));await mobile.close();return evidence;
  });
  result.checks.push({name:channel+' uncaught browser errors',status:errors.length?'FAIL':'PASS',evidence:{errors,failedRequests:failed}});
  await context.close();await browser.close();
 }
 const browser=await chromium.launch({channel:'chrome',headless:true});
 for(const mode of ['all-external-offline','style-failure','missing-3d-library','webgl-unavailable','mixed-snapshot'])await check('failure '+mode,async()=>{
  const context=await browser.newContext({viewport:{width:1280,height:900},acceptDownloads:true});const page=await context.newPage();
  if(mode==='webgl-unavailable')await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){if(String(type).includes('webgl'))return null;return original.call(this,type,...args);};});
  if(mode==='all-external-offline')await page.route(/^https?:\/\/(?!127\.0\.0\.1)/,r=>r.abort('internetdisconnected'));
  if(mode==='style-failure')await page.route('**/styles/liberty',r=>r.fulfill({status:503,body:'unavailable'}));
  if(mode==='missing-3d-library')await page.route('**/vendor/maplibre-gl.js',r=>r.abort());
  if(mode==='mixed-snapshot')await page.route('**/data/systems.json',async r=>{const response=await r.fetch();await r.fulfill({response,body:(await response.text())+' '});});
  await page.goto(URL);
  if(mode==='mixed-snapshot'){await page.waitForFunction(()=>document.querySelector('#snap').textContent.includes('hash mismatch'));assert.equal(await page.locator('#export').isDisabled(),true);const text=await page.locator('#snap').innerText();await context.close();return {text};}
  await page.waitForFunction(()=>window.__xylem);await page.waitForFunction(()=>!document.querySelector('#mapStatus').hidden);assert.equal(await page.locator('#map').isVisible(),true);const status=await page.locator('#mapStatus').innerText();const csv=await exportAndCheck(page,'failure-'+mode);await page.screenshot({path:path.join(OUT,'failure-'+mode+'.png')});await context.close();return {status,csv};
 });
 await browser.close();
 result.finished=new Date().toISOString();result.summary={passed:result.checks.filter(c=>c.status==='PASS').length,failed:result.checks.filter(c=>c.status==='FAIL').length};
 fs.writeFileSync(path.join(OUT,'checks.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({summary:result.summary,failures:result.checks.filter(c=>c.status==='FAIL')}));process.exitCode=result.summary.failed?1:0;
})().catch(error=>{fs.writeFileSync(path.join(OUT,'fatal.json'),JSON.stringify({error:error.stack,result},null,2));console.error(error);process.exit(1)});
