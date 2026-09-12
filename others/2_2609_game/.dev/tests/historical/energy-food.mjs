import { chromium } from 'playwright';
import { build } from 'esbuild';
import assert from 'node:assert/strict';
const bundled=await build({entryPoints:['src/simulation.ts'],bundle:true,write:false,format:'esm',platform:'node'});
const {newGame}=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'));
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
try {
 const page=await browser.newPage({viewport:{width:1280,height:1000}}), errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 const s=newGame(2609);s.player={x:20,y:7,energy:20,health:80,cargo:Array(9).fill('N')};s.world.tiles[7*40+20]=0;
 await page.addInitScript(state=>{if(!localStorage.getItem('kreatbio.microload.save'))localStorage.setItem('kreatbio.microload.save',JSON.stringify({version:3,state}));},s);
 await page.goto(process.env.BASE_URL||'http://localhost:5173');await page.getByRole('button',{name:'Continue culture'}).click();
 assert.match(await page.locator('#energy-help').innerText(),/Orange ⚡ food/);
 await page.screenshot({path:'test-results/energy-food-before.png',fullPage:true});
 await page.keyboard.down('a');await page.waitForFunction(()=>document.querySelector('#toast').textContent.startsWith('Organic food:'));await page.keyboard.up('a');
 await page.keyboard.press('Escape');
 const snapshot=await page.evaluate(()=>JSON.parse(localStorage.getItem('kreatbio.microload.save')));
 assert.equal(snapshot.version,3);assert.ok(snapshot.state.player.energy>40);assert.equal(snapshot.state.player.cargo.length,9);assert.equal(snapshot.state.player.health,80);assert.equal(snapshot.state.world.tiles[7*40+19],0);assert.equal(snapshot.state.world.tiles.filter(t=>t===8).length,5);
 assert.match(await page.locator('#toast').innerText(),/cargo unchanged/);
 await page.reload();await page.getByRole('button',{name:'Continue culture'}).click();
 assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('kreatbio.microload.save')).state.world.tiles.filter(t=>t===8).length),5);
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 assert.deepEqual(errors,[]);console.log('Energy food browser checks passed: visible food, nearly-full-cargo consumption, energy gain, unchanged health/cargo, immediate save, reload and mobile layout.');
}finally{await browser.close();}
