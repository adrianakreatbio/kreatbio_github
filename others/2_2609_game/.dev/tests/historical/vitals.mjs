import { chromium } from 'playwright';
import { build } from 'esbuild';
import assert from 'node:assert/strict';
const bundled=await build({entryPoints:['src/simulation.ts'],bundle:true,write:false,format:'esm',platform:'node'});
const {newGame}=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'));
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
const base=process.env.BASE_URL||'http://localhost:5173', errors=[];
async function open(state){const page=await browser.newPage({viewport:{width:1280,height:1000}});page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(s=>localStorage.setItem('kreatbio.microload.save',JSON.stringify({version:3,state:s})),state);await page.goto(base);await page.getByRole('button',{name:'Continue culture'}).click();return page;}
try {
 const s=newGame(2609);s.player.y=4;s.world.tiles[4*40+20]=0;s.player.energy=16;s.player.health=20;s.player.cargo=Array(9).fill('N');
 const page=await open(s);
 assert.match(await page.locator('#energy-help').innerText(),/Orange ⚡ food/);
 assert.match(await page.locator('#objective-checklist').innerText(),/12 of EACH/);
 assert.match(await page.locator('#objective-checklist').innerText(),/Press E at all 3/);
 assert.match(await page.locator('#scan-help').innerText(),/scan soil DNA → identify microbes/);
 assert.match(await page.locator('#colony-arrow').innerText(),/HOME.*FREE ENERGY/);
 assert.equal(await page.locator('#energy-state').innerText(),'CRITICAL');
 assert.equal(await page.locator('#health-state').innerText(),'LOW');
 assert.equal(await page.locator('#cargo-state').innerText(),'NEARLY FULL');
 for(const text of ['CRITICAL ENERGY','LOW MEMBRANE'])assert.match(await page.locator('#vital-warning').innerText(),new RegExp(text));
 await page.screenshot({path:'test-results/vitals-warning.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.screenshot({path:'test-results/vitals-mobile-concise.png',fullPage:true});
 await page.keyboard.down('w');await page.waitForTimeout(300);await page.keyboard.up('w');
 await page.waitForFunction(()=>document.querySelector('#vital-warning').hidden);
 assert.equal(await page.locator('#energy-state').innerText(),'');assert.equal(await page.locator('#cargo-state').innerText(),'');
 await page.close();
 for(const reason of ['energy','membrane']) {
  const s=newGame(7);s.player.y=10;s.world.tiles[10*40+20]=0;s.world.tiles[10*40+21]=reason==='energy'?0:5;s.player.cargo=['K'];s.player.energy=reason==='energy'?.01:100;s.player.health=reason==='membrane'?1:100;
  const p=await open(s);await p.keyboard.down('d');await p.waitForTimeout(160);await p.keyboard.up('d');
  await p.waitForFunction(()=>document.querySelector('#toast').classList.contains('show'));
  assert.match(await p.locator('#toast').innerText(),reason==='energy'?/Energy ran out/:/Membrane reached zero/);
  assert.match(await p.locator('#toast').innerText(),/Deposits, credits, upgrades and scans kept/);
  await p.close();
 }
 assert.deepEqual(errors,[]);console.log('Vitals browser checks passed: helper copy, simultaneous warnings, critical threshold, mobile layout, recovery clears warnings, exact return reasons.');
}finally{await browser.close();}
