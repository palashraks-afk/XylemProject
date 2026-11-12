const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const OUT=__dirname;
const AXE=path.resolve(__dirname,'../accessibility-tools/node_modules/axe-core/axe.min.js');
const results={commit:'f0fa6006032f6b614276395c5628596a63b966fa',scope:'Browser automation, not physical phone or screen-reader speech testing',cases:[],checks:[],started:new Date().toISOString()};
const slim=r=>({violations:r.violations.map(v=>({id:v.id,impact:v.impact,description:v.description,help:v.help,helpUrl:v.helpUrl,tags:v.tags,nodes:v.nodes.map(n=>({target:n.target,html:n.html,summary:n.failureSummary,checks:[...n.any,...n.all,...n.none].map(c=>({id:c.id,message:c.message,data:c.data}))}))})),incomplete:r.incomplete.map(v=>({id:v.id,help:v.help,nodes:v.nodes.map(n=>({target:n.target,html:n.html,summary:n.failureSummary}))})),passes:r.passes.map(p=>p.id),axeVersion:r.testEngine.version});
async function scan(page,label){await page.addScriptTag({path:AXE});const r=await page.evaluate(async()=>axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa','wcag22aa','best-practice']}}));const output=slim(r);fs.writeFileSync(path.join(OUT,label+'-axe.json'),JSON.stringify(output,null,2));results.cases.push({label,axeVersion:output.axeVersion,violations:output.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.length})),incomplete:output.incomplete.map(v=>({id:v.id,nodes:v.nodes.length}))});}
async function ready(page){await page.goto('http://127.0.0.1:8890/?accessibility='+Date.now());await page.waitForFunction(()=>window.__xylem);await page.locator('[data-view="2d"]').click();}
(async()=>{
 for(const channel of ['chrome','msedge']){
  const browser=await chromium.launch({channel,headless:true});const context=await browser.newContext({viewport:{width:1280,height:1024}});const page=await context.newPage();
  // Avoid a network-dependent GPU map during semantic checks; the saved 2D map and controls remain real.
  await page.route('**/styles/liberty',r=>r.fulfill({status:503,body:'test style unavailable'}));
  await ready(page);await scan(page,channel+'-default');
  await page.evaluate(()=>document.querySelectorAll('aside details').forEach(e=>e.open=true));await scan(page,channel+'-expanded');
  await page.getByRole('tab',{name:'Method and tests',exact:true}).click();await scan(page,channel+'-method');
  await page.getByRole('tab',{name:'Funded plan',exact:true}).click();
  const initialTab=await page.locator('[data-tab="plan"]').evaluate(e=>({selected:e.getAttribute('aria-selected'),controls:e.getAttribute('aria-controls')}));
  await page.locator('#budget').focus();await page.keyboard.press('End');await page.waitForFunction(()=>new URLSearchParams(location.hash.slice(1)).get('b')===String(__xylem.st.b));await page.keyboard.press('Tab');const rangeNext=await page.evaluate(()=>document.activeElement.outerHTML.slice(0,450));
  await page.locator('[data-tab="plan"]').focus();await page.keyboard.press('ArrowRight');const tabAfter=await page.evaluate(()=>({active:document.activeElement.textContent,selected:document.activeElement.getAttribute('aria-selected'),panel:document.querySelector('#tabbody').getAttribute('aria-label')}));
  await page.keyboard.press('Home');const row=page.locator('.system-link').first();await row.focus();await page.keyboard.press('Enter');await page.locator('#detailX').focus();await page.keyboard.press('Enter');const focusAfterClose=await page.evaluate(()=>({tag:document.activeElement.tagName,id:document.activeElement.id,text:document.activeElement.textContent.slice(0,80)}));
  const live=await page.evaluate(()=>({kpis:{live:document.querySelector('#kpis').getAttribute('aria-live'),role:document.querySelector('#kpis').getAttribute('role')},scenarios:{live:document.querySelector('#scenOut').getAttribute('aria-live'),role:document.querySelector('#scenOut').getAttribute('role')},detail:{live:document.querySelector('#detail').getAttribute('aria-live'),role:document.querySelector('#detail').getAttribute('role')},skipLinks:[...document.querySelectorAll('a[href^="#"]')].map(e=>({text:e.textContent,href:e.getAttribute('href')}))}));
  results.checks.push({channel,version:browser.version(),initialTab,rangeNext,tabAfter,focusAfterClose,live});
  await ready(page);await page.evaluate(()=>document.querySelectorAll('aside details').forEach(e=>e.open=true));
  for(const width of [640,320]){await page.setViewportSize({width,height:820});const layout=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,smallTargets:[...document.querySelectorAll('button,input,select,summary,a')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&r.height<24&&r.width<24;}).map(e=>({tag:e.tagName,id:e.id,text:e.textContent.trim().slice(0,80),width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height})).slice(0,30)}));results.checks.push({channel,reflowSimulation:width,layout});await page.screenshot({path:path.join(OUT,channel+'-'+width+'px.png'),fullPage:true});}
  await scan(page,channel+'-320px');
  await context.close();await browser.close();
 }
 results.finished=new Date().toISOString();fs.writeFileSync(path.join(OUT,'summary.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
})().catch(e=>{fs.writeFileSync(path.join(OUT,'error.json'),JSON.stringify({error:e.stack,results},null,2));console.error(e);process.exit(1)});
