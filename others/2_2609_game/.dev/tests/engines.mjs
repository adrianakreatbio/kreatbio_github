import {webkit,firefox} from 'playwright';
import assert from 'node:assert/strict';
for(const [name,type] of [['webkit',webkit],['firefox',firefox]]){
 if(process.env.BROWSER_ENGINE&&process.env.BROWSER_ENGINE!==name)continue;
 const browser=await type.launch({headless:true,executablePath:name==='webkit'?process.env.WEBKIT_PATH:process.env.FIREFOX_PATH});
 try{
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.BASE_URL||'http://localhost:5174');await page.getByRole('button',{name:'Begin the adventure'}).click();await page.getByRole('button',{name:'Let’s dig'}).click();
  await page.keyboard.down('s');await page.waitForTimeout(500);await page.keyboard.up('s');assert.equal(await page.locator('#scan').isEnabled(),true);
  await page.locator('#scan').click();await page.getByRole('button',{name:'Read DNA & survey patch'}).click();await page.getByRole('dialog',{name:'scan-result',exact:true}).waitFor();
  await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog',{name:'scan-result',exact:true}).isVisible(),true);await page.getByRole('button',{name:'Close soil sample'}).click();
  assert.match(await page.locator('#survey-status').innerText(),/^SURVEYED/);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  const arrow=await page.getByRole('button',{name:'Move down',exact:true}).boundingBox();await page.mouse.move(arrow.x+arrow.width/2,arrow.y+arrow.height/2);await page.mouse.down();await page.waitForTimeout(600);await page.mouse.up();
  const read=()=>page.evaluate(()=>{window.dispatchEvent(new Event('pagehide'));return JSON.parse(localStorage.getItem('kreatbio.microload.save')).state;});const stopped=await read();assert.ok(stopped.player.y>3);await page.waitForTimeout(300);assert.deepEqual((await read()).player,stopped.player);
  await page.locator('#access').click();await page.getByRole('button',{name:'Larger text: OFF'}).click();await page.getByRole('button',{name:'Back to game'}).click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:`test-results/${name}-phone.png`});await page.reload();await page.getByRole('button',{name:'Continue culture'}).click();assert.equal((await read()).scans.length,1);
  assert.deepEqual(errors,[]);console.log(`${name} checks passed: first scan, persistent result, pointer hold/release, larger text, narrow layout, reload.`);
 }finally{await browser.close();}
}
