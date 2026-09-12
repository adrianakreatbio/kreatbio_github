import { chromium } from 'playwright';
import { build } from 'esbuild';
import assert from 'node:assert/strict';
const bundle=await build({entryPoints:['src/simulation.ts'],bundle:true,write:false,format:'esm',platform:'node'});
const {newGame}=await import('data:text/javascript;base64,'+Buffer.from(bundle.outputFiles[0].text).toString('base64'));
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:1280,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const s=newGame(21);s.scans=s.world.samples.map(site=>site.id);s.player={x:20,y:10,energy:100,health:70,cargo:Array(9).fill('N')};s.world.tiles[10*40+20]=0;s.world.tiles[10*40+21]=3;
 await page.addInitScript(state=>{if(!localStorage.getItem('kreatbio.microload.save'))localStorage.setItem('kreatbio.microload.save',JSON.stringify({version:4,state}));},s);
 await page.goto(process.env.BASE_URL||'http://localhost:5173');await page.getByRole('button',{name:'Continue culture'}).click();
 await page.keyboard.down('d');await page.waitForFunction(()=>document.querySelector('#toast').textContent.startsWith('Cargo full'));
 // Repeated keydowns must not walk the player away after the automatic return.
 for(let i=0;i<4;i++){await page.keyboard.down('d');await page.waitForTimeout(150);}
 const read=()=>page.evaluate(()=>{window.dispatchEvent(new Event('pagehide'));return JSON.parse(localStorage.getItem('kreatbio.microload.save')).state;});
 let state=await read();assert.deepEqual({x:state.player.x,y:state.player.y},{x:20,y:2});assert.equal(state.player.energy,160);assert.equal(state.player.health,100);assert.equal(state.player.cargo.length,0);assert.equal(state.bank,100);assert.equal(state.deaths,0);assert.equal(state.trips,1);assert.deepEqual(state.deposited,{N:9,P:1,K:0});
 await page.screenshot({path:'test-results/auto-return.png',fullPage:true});
 await page.keyboard.up('d');await page.keyboard.down('d');await page.waitForTimeout(150);await page.keyboard.up('d');assert.ok((await read()).player.x>20);
 await page.keyboard.press('Escape');await page.reload();await page.getByRole('button',{name:'Continue culture'}).click();state=await read();assert.equal(state.trips,1);assert.equal(state.bank,100);
 assert.deepEqual(errors,[]);console.log('Auto-return browser checks passed: full collection, automatic deposit/refill, held-key stop, deliberate movement after release, reload without duplicate deposits.');
}finally{await browser.close();}
