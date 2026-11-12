const {chromium}=require('playwright');
const fs=require('node:fs');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
 const page=await context.newPage();fs.mkdirSync('audit/demo',{recursive:true});const cases=[];
 for(const [name,hash] of [['budget-decision','#b=500'],['small-system-tradeoff','#b=500&r=0.3'],['approximate-routes','#b=500&l=2&r=0.3&c=1']]){
  await page.goto('http://127.0.0.1:8885/?demo='+name+hash);await page.waitForFunction(()=>window.__xylem);await page.locator('[data-view="2d"]').click();
  const download=page.waitForEvent('download');await page.locator('#export').click();await (await download).saveAs('audit/demo/'+name+'.csv');
  const state=await page.evaluate(()=>({controls:__xylem.st,systems:__xylem.plan.chosen.length,people:__xylem.plan.people,cost:__xylem.plan.spent,small:__xylem.plan.small,dac:__xylem.plan.dac,robust:__xylem.plan.robust,selectedIds:__xylem.plan.chosen.map(i=>__xylem.systems[i].id).sort()}));
  cases.push({name,...state});await page.screenshot({path:'audit/demo/'+name+'.png'});
 }
 await page.goto('http://127.0.0.1:8885/?demo=stability#b=500');await page.waitForFunction(()=>window.__xylem);await page.locator('[data-view="2d"]').click();
 const system=await page.evaluate(()=>__xylem.systems.find(s=>s.p[2]>0.5&&s.pop>100&&s.lat).id);await page.locator('#find').fill(system);await page.locator('#find').dispatchEvent('change');
 await page.locator('#runScen').click();await page.waitForFunction(()=>!document.querySelector('#runScen').disabled,null,{timeout:60000});
 const stability={system,summary:await page.locator('#scenOut').innerText(),detail:await page.locator('#detail').innerText()};
 assert.ok(stability.detail.includes('of 40 scenarios'));await page.locator('#detail').screenshot({path:'audit/demo/stability-detail.png'});
 fs.writeFileSync('audit/demo/evidence.json',JSON.stringify({cases,stability},null,2)+'\n');console.log(JSON.stringify({cases:cases.map(({selectedIds,...x})=>x),stability},null,2));await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
