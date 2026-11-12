const {chromium} = require('playwright');
const fs = require('node:fs');
(async () => {
  const browser = await chromium.launch({channel:'chrome',headless:true});
  const page = await browser.newPage({viewport:{width:1440,height:1000}});
  const errors=[];
  page.on('pageerror', e=>errors.push(e.message));
  page.on('requestfailed', r=>errors.push(r.url()+': '+r.failure().errorText));
  await page.goto('http://127.0.0.1:8884');
  await page.waitForTimeout(12000);
  const loaded = await page.evaluate(()=>!!window.__xylem);
  const evidence={loaded,errors,snap:await page.locator('#snap').innerText()};
  if(loaded) {
    await page.screenshot({path:'audit/release-qa/baseline-desktop.png'});
    evidence.budgetAccessibleLabel=await page.locator('#budget').evaluate(e=>e.labels[0].textContent.trim());
    await page.locator('#find').fill('CA1910039');
    await page.locator('#find').dispatchEvent('change');
    // Use an actual listed water system if the named system is absent.
    const id=await page.evaluate(()=>__xylem.systems.find(s=>!s.failing&&s.lat).id);
    await page.locator('#find').fill(id); await page.locator('#find').dispatchEvent('change');
    evidence.detailBefore=await page.locator('#detail').innerText();
    await page.locator('#mul').fill('2'); await page.locator('#mul').dispatchEvent('input');
    await page.waitForTimeout(250);
    evidence.detailAfter=await page.locator('#detail').innerText();
    evidence.effectiveCostAfter=await page.evaluate(id=>__xylem.systems.find(s=>s.id===id).cost,id);
    await page.locator('[data-view="2d"]').click();
    await page.locator('[data-color="status"]').evaluate(e=>e.click());
    evidence.mapColour={buttons:await page.locator('[data-color].on').getAttribute('data-color'),select:await page.locator('#colorSel').inputValue()};
    await page.setViewportSize({width:390,height:844});
    await page.screenshot({path:'audit/release-qa/baseline-mobile.png',fullPage:true});
    evidence.mobile=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));
  }
  fs.writeFileSync('audit/release-qa/baseline.json',JSON.stringify(evidence,null,2));
  console.log(JSON.stringify(evidence,null,2));
  await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
