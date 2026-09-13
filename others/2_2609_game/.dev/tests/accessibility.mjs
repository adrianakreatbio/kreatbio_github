import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,reducedMotion:'reduce'}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
const read=()=>page.evaluate(()=>{window.dispatchEvent(new Event('pagehide'));return JSON.parse(localStorage.getItem('kreatbio.microload.save')).state;});
try{
 await page.goto(process.env.BASE_URL||'http://localhost:5174');await page.getByRole('button',{name:'Begin the adventure'}).click();
 assert.match(await page.locator('#overlay').innerText(),/YOUR FIRST SCAN/);await page.getByRole('button',{name:'Let’s dig'}).click();
 await page.locator('#access').click();await page.getByRole('button',{name:'Larger text: OFF'}).click();await page.getByRole('button',{name:'Text navigation: OFF'}).click();
 await page.locator('#volume').fill('20');await page.locator('#volume').dispatchEvent('input');
 await page.getByRole('button',{name:'Back to game'}).click();
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 await page.keyboard.down('s');await page.waitForTimeout(650);await page.keyboard.up('s');
 const first=await read();assert.equal(first.player.y,3,'text navigation moves only one tile per press');assert.match(await page.locator('#navigation-reader').innerText(),/SAMPLE 1\/10/);
 await page.keyboard.press('r');await page.waitForTimeout(200);assert.match(await page.locator('#navigation-reader').innerText(),/up: tunnel/);
 // Screen-reader/keyboard activation of a direction button also takes one step.
 await page.getByRole('button',{name:'Move right',exact:true}).focus();await page.keyboard.press('Space');await page.waitForTimeout(600);assert.equal((await read()).player.x,first.player.x+1);
 await page.keyboard.down('a');await page.waitForTimeout(650);await page.keyboard.up('a');
 // The first sample now sits deeper: five more one-step digs down the safe spine.
 for(let i=0;i<5;i++){await page.keyboard.down('s');await page.waitForTimeout(750);await page.keyboard.up('s');}
 assert.equal((await read()).player.y,8);assert.match(await page.locator('#navigation-reader').innerText(),/Sample here/);
 await page.keyboard.press('e');await page.getByRole('button',{name:'Read DNA & survey patch'}).click();
 await page.getByText(/SOIL SURVEY · Locate/).waitFor();await page.getByRole('dialog',{name:'scan-result',exact:true}).waitFor();
 await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog',{name:'scan-result',exact:true}).isVisible(),true);
 await page.getByRole('button',{name:'Close soil sample'}).click();assert.equal((await read()).scans.length,1);assert.match(await page.locator('#survey-status').innerText(),/SURVEYED/);
 await page.screenshot({path:'test-results/accessible-phone.png'});
 await page.reload();await page.getByRole('button',{name:'Continue culture'}).click();assert.equal(await page.locator('body').evaluate(e=>e.classList.contains('large-text')),true);assert.equal(await page.evaluate(()=>localStorage.getItem('microload.volume')),'0.2');
 await page.setViewportSize({width:320,height:568});await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);const bounds=await page.locator('.game-shell').boundingBox();assert.ok(bounds.y+bounds.height<=568);await page.screenshot({path:'test-results/accessible-small-phone.png'});
 assert.deepEqual(errors,[]);console.log('Accessibility checks passed: larger text, no overflow, one-step navigation, surroundings, keyboard button activation, staged survey, persistent preferences.');
}finally{await browser.close();}
