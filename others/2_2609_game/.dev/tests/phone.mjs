import {chromium} from 'playwright';
import {build} from 'esbuild';
import assert from 'node:assert/strict';
const bundle=await build({entryPoints:['src/simulation.ts'],bundle:true,write:false,format:'esm',platform:'node'});
const {newGame}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const read=()=>page.evaluate(()=>{window.dispatchEvent(new Event('pagehide'));return JSON.parse(localStorage.getItem('kreatbio.microload.save')).state;});
const seed=newGame(2609);
await page.addInitScript(s=>{const pending=sessionStorage.getItem('fixture');if(pending){localStorage.setItem('kreatbio.microload.save',pending);sessionStorage.removeItem('fixture');}if(!localStorage.getItem('kreatbio.microload.save'))localStorage.setItem('kreatbio.microload.save',JSON.stringify({version:5,state:s}));},seed);
const cdp=await page.context().newCDPSession(page);
const point=async dir=>{const r=await page.locator(`[data-direction=${dir}]`).boundingBox();return {x:r.x+r.width/2,y:r.y+r.height/2,id:1};};
const touch=async(type,p)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:p?[p]:[]});
async function fixture(s){await page.evaluate(state=>sessionStorage.setItem('fixture',JSON.stringify({version:5,state})),s);await page.reload();await page.getByRole('button',{name:'Continue culture'}).click();}
try {
 await page.goto(process.env.BASE_URL||'http://localhost:5174');await page.getByRole('button',{name:'Continue culture'}).click();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 const bounds=await page.locator('.game-shell').boundingBox();assert.ok(bounds.y+bounds.height<=844);
 await touch('touchStart',await point('down'));await page.waitForTimeout(900);
 const moved=await read();assert.ok(moved.player.y>seed.player.y+1,'holding moves repeatedly');
 await touch('touchMove',await point('right'));await page.waitForTimeout(650);const turned=await read();assert.equal(turned.player.cargo.length,0,'unscanned soil cannot yield nutrients');assert.ok(turned.player.x>moved.player.x,'slide turns without lifting');
 await touch('touchEnd');const stopped=await read();await page.waitForTimeout(400);assert.deepEqual((await read()).player,stopped.player);
 assert.equal(await page.evaluate(()=>scrollY),0);
 await touch('touchStart',await point('left'));await touch('touchCancel');const cancelled=await read();await page.waitForTimeout(400);assert.deepEqual((await read()).player,cancelled.player);
 await page.screenshot({path:'test-results/phone-hud.png',fullPage:true});
 for(const [width,height] of [[320,568],[844,390]]) {
  await page.setViewportSize({width,height});await page.waitForTimeout(300);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  const r=await page.locator('.game-shell').boundingBox();assert.ok(r.y+r.height<=height,`game fits ${width}x${height}: ${JSON.stringify(r)}`);
 }
 await page.setViewportSize({width:390,height:844});
 // Assisted-return recall must suppress the still-held touch until a fresh press.
 await page.evaluate(()=>localStorage.setItem('microload.assistReturn','true'));
 const full=newGame(2609);full.scans=full.world.samples.map(s=>s.id);full.player={x:20,y:10,energy:100,health:80,cargo:Array(9).fill('N')};full.world.tiles[10*40+20]=0;full.world.tiles[10*40+21]=3;
 await fixture(full);await touch('touchStart',await point('right'));await page.waitForTimeout(900);const returned=await read();assert.equal(returned.player.y,2);assert.equal(returned.trips,1);assert.equal(returned.deposited.P,1);
 await touch('touchMove',await point('down'));await page.waitForTimeout(350);assert.equal((await read()).player.y,2);await touch('touchEnd');
 await touch('touchStart',await point('down'));await page.waitForTimeout(350);await touch('touchEnd');assert.ok((await read()).player.y>2);
 await page.evaluate(()=>localStorage.removeItem('microload.assistReturn'));
 // Unknown nutrients become mapped; modal remains until explicit close.
 const sample=newGame(2609),site=sample.world.samples.find(s=>s.id==='root-partner');sample.player.x=site.x;sample.player.y=site.y;sample.world.tiles[(site.y+1)*40+site.x]=2;
 await fixture(sample);assert.equal(await page.locator('#scan').isEnabled(),true);await page.screenshot({path:'test-results/survey-before.png'});
 await page.locator('#scan').click();await page.getByRole('button',{name:'Read DNA & survey patch'}).click();await page.waitForTimeout(300);await page.getByRole('button',{name:'Close soil sample'}).click();assert.equal((await read()).scans.length,0);await page.locator('#scan').click();await page.getByRole('button',{name:'Read DNA & survey patch'}).click();await page.getByRole('dialog',{name:'scan-result',exact:true}).waitFor();
 assert.deepEqual((await read()).scans,['root-partner']);assert.match(await page.locator('#overlay').innerText(),/N deposits are now unlocked/);
 await page.locator('.scan-explanation h3').first().click();await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog',{name:'scan-result',exact:true}).isVisible(),true);
 await page.screenshot({path:'test-results/phone-scan-result.png'});await page.getByRole('button',{name:'Close soil sample'}).click();await page.screenshot({path:'test-results/survey-after.png'});await page.keyboard.down('s');await page.waitForTimeout(750);await page.keyboard.up('s');assert.ok((await read()).player.cargo.includes('N'),'revealed nutrient can be collected');
 const risk=newGame(2609),riskSite=risk.world.samples.find(s=>s.id==='root-risk');risk.player.x=riskSite.x;risk.player.y=riskSite.y;risk.scans=['root-partner'];
 await fixture(risk);await page.locator('#scan').click();await page.getByRole('dialog',{name:'scan-result',exact:true}).waitFor();assert.doesNotMatch(await page.locator('#overlay').innerText(),/potassium|highlighted K/);
 const victory=newGame(2609);victory.won=true;victory.deposited={N:12,P:12,K:12};victory.scans=vacuumIds(victory);await fixture(victory);await page.screenshot({path:'test-results/phone-victory.png'});
 assert.deepEqual(errors,[]);console.log('Phone checks passed: hold, slide, release/cancel, recall suppression, 3 viewport sizes, persistent scans, survey reveal, risk result, victory.');
}finally{await browser.close();}
function vacuumIds(s){return s.world.samples.map(a=>a.id);}
