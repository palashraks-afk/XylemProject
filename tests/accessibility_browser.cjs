/* Scoped automated regressions. No physical device or spoken AT claims.
 * XYLEM_AXE points to an existing axe.min.js; Playwright is task-local.
 * Run while app/ is served on loopback. Retains all results under XYLEM_A11Y_OUT.
 */
const {chromium}=require('playwright');
const fs=require('node:fs'), path=require('node:path'), assert=require('node:assert/strict');
const {gzipSync}=require('node:zlib');
const URL=process.env.XYLEM_QA_URL || 'http://127.0.0.1:8891';
const OUT=process.env.XYLEM_A11Y_OUT || 'audit/accessibility/after';
const AXE=process.env.XYLEM_AXE;
assert.ok(AXE && fs.existsSync(AXE), 'Set XYLEM_AXE to installed axe.min.js');
fs.mkdirSync(OUT,{recursive:true});
const results={started:new Date().toISOString(),scope:'Browser automation, DOM mutations and computed layout; no physical phone, native zoom or spoken screen-reader testing.',checks:[],scans:[],browsers:[]};
const check=async(name,fn)=>{try{results.checks.push({name,status:'PASS',evidence:await fn()});}catch(e){results.checks.push({name,status:'FAIL',error:e.stack});}fs.writeFileSync(path.join(OUT,'progress.json'),JSON.stringify(results,null,2));console.log(results.checks.at(-1).status+' '+name);};
async function ready(page,hash='') {await page.goto(URL+'/?accessibility='+Date.now()+hash);await page.waitForFunction(()=>window.__xylem);}
async function settled(page) {await page.waitForFunction(()=>['b','l','h','v','a','r','c','m'].every(k=>new URLSearchParams(location.hash.slice(1)).get(k)===String(__xylem.st[k])));}
async function control(page,id,value) {await page.locator('#'+id).evaluate((e,v)=>{e.value=v;e.dispatchEvent(new Event('input',{bubbles:true}));},String(value));await settled(page);}
async function scan(page,label) {
  if(!await page.evaluate(()=>!!window.axe))await page.addScriptTag({path:AXE});
  const r=await page.evaluate(async()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa','best-practice']}}));
  fs.writeFileSync(path.join(OUT,label+'-axe.json.gz'),gzipSync(Buffer.from(JSON.stringify(r,null,2))));
  results.scans.push({label,axe:r.testEngine.version,violations:r.violations.map(v=>({id:v.id,nodes:v.nodes.length})),incomplete:r.incomplete.map(v=>({id:v.id,nodes:v.nodes.length}))});
  assert.equal(r.violations.length,0,JSON.stringify(r.violations.map(v=>({id:v.id,targets:v.nodes.map(n=>n.target)}))));
  return results.scans.at(-1);
}
async function observe(page) {await page.evaluate(()=>{window.a11yMessages=[];new MutationObserver(()=>{const text=document.querySelector('#resultStatus').textContent;if(text) a11yMessages.push(text);}).observe(document.querySelector('#resultStatus'),{childList:true,subtree:true,characterData:true});});}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
for(const channel of ['chrome','msedge']) {
 const browser=await chromium.launch({channel,headless:true});results.browsers.push({channel,version:browser.version()});
 const context=await browser.newContext({viewport:{width:1280,height:1024},acceptDownloads:true});
 const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/styles/liberty',r=>r.fulfill({status:503,body:'Deliberate semantic-test fallback'}));
 await ready(page);await page.locator('[data-view="2d"]').click();
 await check(channel+' default axe',()=>scan(page,channel+'-default'));
 await check(channel+' expanded axe',async()=>{await page.evaluate(()=>document.querySelectorAll('aside details').forEach(e=>e.open=true));return scan(page,channel+'-expanded');});
 await check(channel+' all rendered badge combinations',async()=>{
  const evidence=await page.locator('.tag').evaluateAll(nodes=>nodes.map(e=>({text:e.textContent,color:getComputedStyle(e).color,background:getComputedStyle(e).backgroundColor})));
  const lum=rgb=>rgb.match(/[\d.]+/g).slice(0,3).map(Number).map(c=>{c/=255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;}).reduce((a,c,i)=>a+c*[.2126,.7152,.0722][i],0);
  for(const e of evidence){assert.ok(!e.background.startsWith('rgba'), 'badge backgrounds must remain opaque');e.ratio=(Math.max(lum(e.color),lum(e.background))+.05)/(Math.min(lum(e.color),lum(e.background))+.05);assert.ok(e.ratio>=4.5,JSON.stringify(e));}
  assert.ok(evidence.some(e=>e.text==='At-Risk')&&evidence.some(e=>e.text==='Failing'));return {nodes:evidence.length,combinations:[...new Map(evidence.map(e=>[e.text,e])).values()]};
 });
 await page.getByRole('tab',{name:'Method and tests',exact:true}).click();
 await check(channel+' Method axe',()=>scan(page,channel+'-method'));
 await check(channel+' named Method regions keyboard scroll and escape',async()=>{
  const evidence=[];
  for(const width of [1280,320]){
   await page.setViewportSize({width,height:820});
   const regions=page.locator('#tabbody .scroll');
   for(let i=0;i<await regions.count();i++){
    const region=regions.nth(i);assert.equal(await region.getAttribute('tabindex'),'0');assert.ok(await region.getAttribute('aria-label'));
    await region.focus();await region.evaluate(e=>{e.scrollTop=0;e.scrollLeft=0;});
    const before=await region.evaluate(e=>({x:e.scrollLeft,y:e.scrollTop,maxX:e.scrollWidth-e.clientWidth,maxY:e.scrollHeight-e.clientHeight}));
    if(before.maxX>0)await page.keyboard.press('ArrowRight');if(before.maxY>0)await page.keyboard.press('ArrowDown');await sleep(250);
    const after=await region.evaluate(e=>({x:e.scrollLeft,y:e.scrollTop}));
    if(before.maxX>0)assert.ok(after.x>0);if(before.maxY>0)assert.ok(after.y>0);
    await page.keyboard.press('Tab');assert.equal(await region.evaluate(e=>e===document.activeElement),false,'Tab escapes');
    await region.focus();await page.keyboard.press('Shift+Tab');assert.equal(await region.evaluate(e=>e===document.activeElement),false,'Shift+Tab escapes');
    evidence.push({width,index:i,label:await region.getAttribute('aria-label'),before,after});
   }
  }return evidence;
 });
 await page.setViewportSize({width:1280,height:1024});await page.getByRole('tab',{name:'Funded plan',exact:true}).click();
 await check(channel+' card close restores invoking button after redraw',async()=>{
  const origin=page.locator('.system-link').first(), id=await origin.getAttribute('data-system');await origin.focus();await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'detailTitle');
  await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.id),'detailX');
  await control(page,'lam',1.1); // Replaces the original row button without moving focus to a sort control.
  assert.equal(await page.evaluate(()=>document.activeElement.id),'detailX');
  await page.keyboard.press('Enter');assert.equal(await page.locator('#detail').isHidden(),true);
  assert.equal(await page.evaluate(()=>document.activeElement.dataset.system),id);return {id,focus:await page.evaluate(()=>document.activeElement.outerHTML)};
 });
 await check(channel+' card refresh preserves title and close focus; missing row fallback',async()=>{
  await ready(page);await page.locator('.system-link').first().focus();await page.keyboard.press('Enter');
  await control(page,'mul',2);assert.equal(await page.evaluate(()=>document.activeElement.id),'detailTitle');
  await page.locator('#detailX').focus();await control(page,'res',.3);assert.equal(await page.evaluate(()=>document.activeElement.id),'detailX');
  await page.getByRole('tab',{name:'Method and tests',exact:true}).evaluate(e=>e.click());
  await page.locator('#detailX').focus();await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>document.activeElement.id),'find');return {focus:'find',titleAndClosePreserved:true};
 });
 await check(channel+' search card returns to search after scenario refresh',async()=>{
  await ready(page);const id=await page.evaluate(()=>__xylem.systems.find(s=>s.lat&&s.lon).id);
  await page.locator('#find').fill(id);await page.locator('#find').dispatchEvent('change');await control(page,'res',.3);
  await page.locator('#detailX').focus();await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>document.activeElement.id),'find');return {id,focus:'find'};
 });
 await check(channel+' plan updates coalesce and keep focus',async()=>{
  await ready(page);await observe(page);await page.locator('#lam').focus();
  for(let i=0;i<8;i++){await page.keyboard.press('ArrowRight');await sleep(80);}
  await settled(page);await page.waitForFunction(()=>a11yMessages.length>0);await sleep(400);
  const evidence=await page.evaluate(()=>({messages:a11yMessages,active:document.activeElement.id,status:document.querySelector('#resultStatus').outerHTML}));
  assert.equal(evidence.messages.length,1);assert.equal(evidence.active,'lam');
  assert.ok(evidence.messages[0].includes('systems funded'));assert.ok(evidence.messages[0].includes('modeled people'));return evidence;
 });
 await check(channel+' scenario completion announces once with no progress flooding',async()=>{
  await ready(page,'#b=25');await observe(page);await page.locator('#runScen').focus();await page.keyboard.press('Enter');
  await page.waitForFunction(()=>document.querySelector('#runScen').getAttribute('aria-disabled') !== 'true');await page.waitForFunction(()=>a11yMessages.length>0);await sleep(400);
  const evidence=await page.evaluate(()=>({messages:a11yMessages,active:document.activeElement.id,visible:document.querySelector('#scenOut').textContent}));
  assert.equal(evidence.messages.length,1);assert.equal(evidence.active,'runScen');assert.ok(evidence.messages[0].startsWith('Cost scenarios complete.'));assert.ok(!evidence.messages[0].includes('Running'));return evidence;
 });
 await check(channel+' cancelled scenarios do not announce stale completion',async()=>{
  await ready(page);await observe(page);await page.locator('#runScen').click();await control(page,'res',.3);
  await page.waitForFunction(()=>document.querySelector('#runScen').getAttribute('aria-disabled') !== 'true');await sleep(800);
  const evidence=await page.evaluate(()=>({messages:a11yMessages,visible:document.querySelector('#scenOut').textContent}));
  assert.equal(evidence.messages.length,1);assert.ok(evidence.messages[0].includes('Cost scenarios cancelled.'));assert.ok(!evidence.messages.some(m=>m.includes('complete')));return evidence;
 });
 await check(channel+' tab linkage and skip path',async()=>{
  await ready(page);const evidence=[];
  await page.locator('[data-tab="plan"]').focus();
  for(const key of ['ArrowRight','End','Home']){await page.keyboard.press(key);const state=await page.evaluate(()=>({selected:document.activeElement.getAttribute('aria-selected'),controls:document.activeElement.getAttribute('aria-controls'),id:document.activeElement.id,labelledby:document.querySelector('#tabbody').getAttribute('aria-labelledby')}));assert.equal(state.selected,'true');assert.equal(state.controls,'tabbody');assert.equal(state.id,state.labelledby);evidence.push(state);}
  await page.locator('.skip-results').focus();await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>document.activeElement.id),'tabbody');return evidence;
 });
 await check(channel+' 320px axe and layout proxies',async()=>{
  const evidence=[];for(const width of [1100,1024,960,900,640,390,320]){await page.setViewportSize({width,height:844});const layout=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));assert.equal(layout.width,layout.scrollWidth);evidence.push(layout);}
  await page.locator('[data-view="2d"]').click();await page.screenshot({path:path.join(OUT,channel+'-320px.png'),fullPage:true});
  return {layouts:evidence,scan:await scan(page,channel+'-320px')};
 });
 await check(channel+' no uncaught app errors',async()=>{assert.deepEqual(errors,[]);return errors;});
 await context.close();
 // Live map source checks are separate from the forced semantic fallback.
 const live=await browser.newContext({viewport:{width:960,height:1000}}), p=await live.newPage();
 await check(channel+' live 3D layout at intermediate/narrow widths and long labels',async()=>{
  await ready(p);await p.waitForFunction(()=>Xylem3D.map()?.getSource('sys')?._data.features.length>0,null,{timeout:30000});
  const evidence=[];
  for(const width of [900,920,960,1000,1040,1100,1440,640,390,320]){
   await p.setViewportSize({width,height:1000});await sleep(100);
   for(const long of [false,true]){
    if(long)await p.locator('.chip3d').evaluate(e=>e.innerHTML='<span>Budget <b>$5,385,000,000</b></span><span><b>1,062</b> systems funded</span><span><b>1,931,200</b> modeled people reached</span>');
    const rects=await p.evaluate(()=>{const rect=s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height};};return {view:rect('.vt'),summary:rect('.chip3d'),hud:rect('.hud3d'),nav:rect('.maplibregl-ctrl-top-right'),map:rect('#map3d'),page:document.documentElement.scrollWidth};});
    const overlap=(a,b)=>a.width>0&&b.width>0&&a.x<b.right&&a.right>b.x&&a.y<b.bottom&&a.bottom>b.y;
    assert.ok(!overlap(rects.view,rects.summary),'view/summary overlap');assert.ok(!overlap(rects.summary,rects.hud),'summary/HUD overlap');assert.ok(!overlap(rects.summary,rects.nav),'summary/native controls overlap');assert.ok(rects.summary.right<=rects.map.right);assert.equal(rects.page,width);
    evidence.push({width,long,rects});
    if(width===960||width===320)await p.screenshot({path:path.join(OUT,channel+'-3d-'+width+(long?'-long':'')+'.png')});
    if(long)await control(p,'lam',1.1 + (width===900 ? .1 : 0)); // Restore actual summary before next width.
   }
  }return {allocationFeatures:await p.evaluate(()=>Xylem3D.map().getSource('sys')._data.features.length),layouts:evidence};
 });
 await check(channel+' 3D budget value text while focused',async()=>{
  await p.setViewportSize({width:960,height:1000});const slider=p.locator('[data-bud]');await slider.focus();await p.keyboard.press('ArrowRight');await settled(p);
  const state=await slider.evaluate(e=>({text:e.getAttribute('aria-valuetext'),label:document.querySelector('[data-bl]').textContent,active:document.activeElement===e}));
  assert.ok(state.text?.startsWith('$'));assert.equal(state.text,state.label);assert.equal(state.active,true);return state;
 });
 await live.close();await browser.close();
}
results.finished=new Date().toISOString();results.summary={passed:results.checks.filter(c=>c.status==='PASS').length,failed:results.checks.filter(c=>c.status==='FAIL').length};
fs.writeFileSync(path.join(OUT,'checks.json'),JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify({summary:results.summary,failures:results.checks.filter(c=>c.status==='FAIL')}));process.exitCode=results.summary.failed?1:0;
})().catch(e=>{fs.writeFileSync(path.join(OUT,'fatal.json'),JSON.stringify({error:e.stack,results},null,2));console.error(e);process.exitCode=1;});
