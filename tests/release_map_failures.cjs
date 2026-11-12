/* Explicit stalled-request checks for the 12s style / 20s tile fallbacks. */
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true}),checks=[];
 for(const mode of ['stalled-style','stalled-tiles','imagery-failure']){
  const context=await browser.newContext({viewport:{width:1280,height:900},acceptDownloads:true});const page=await context.newPage();
  const start=Date.now();
  if(mode==='stalled-style')await page.route('**/styles/liberty',()=>{});
  else await page.route(/elevation-tiles-prod|World_Imagery|s2cloudless|tiles\.openfreemap\.org\/(planet|natural_earth)/,r=>mode==='stalled-tiles'?undefined:r.fulfill({status:503,body:'unavailable'}));
  await page.goto('http://127.0.0.1:8885/?failure='+mode);await page.waitForFunction(()=>window.__xylem);
  try{
   await page.waitForFunction(()=>!document.querySelector('#mapStatus').hidden,null,{timeout:30000});
   const status=await page.locator('#mapStatus').innerText();
   if(mode!=='imagery-failure'){await page.waitForFunction(()=>!document.querySelector('#map').hidden);assert.equal(await page.locator('.load3d').count(),0);}
   else await page.waitForFunction(()=>Xylem3D.map()?.getSource('sys')?._data.features.length>0 || !document.querySelector('#map').hidden,null,{timeout:30000});
   const download=page.waitForEvent('download');await page.locator('#export').click();await (await download).saveAs('audit/release-qa/browser/failure-'+mode+'.csv');
   const state=await page.evaluate(()=>({systems:__xylem.plan.chosen.length,people:__xylem.plan.people}));assert.deepEqual(state,{systems:97,people:476663});
   await page.screenshot({path:'audit/release-qa/browser/failure-'+mode+'.png'});checks.push({mode,status:'PASS',message:status,elapsedMs:Date.now()-start,fallback2d:await page.locator('#map').isVisible(),state});
  }catch(error){checks.push({mode,status:'FAIL',error:error.stack});}
  await context.close();
 }
 await browser.close();fs.writeFileSync('audit/release-qa/map-failures.json',JSON.stringify(checks,null,2)+'\n');console.log(JSON.stringify(checks));process.exitCode=checks.some(c=>c.status==='FAIL')?1:0;
})().catch(e=>{console.error(e);process.exit(1)});
