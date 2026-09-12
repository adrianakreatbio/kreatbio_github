import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
try {
  const page = await browser.newPage();
  await page.addInitScript(() => {
    const Original = window.AudioContext;
    window.AudioContext = class extends Original {
      constructor(...args) { super(...args); window.observedAudioContext = this; }
    };
  });
  await page.goto(process.env.BASE_URL || 'http://localhost:5173');
  assert.equal(await page.evaluate(() => !!window.observedAudioContext), false);
  await page.getByRole('button', { name: 'Begin the adventure' }).click(); await page.getByRole('button', { name: 'Let’s dig' }).click();
  await page.waitForFunction(() => window.observedAudioContext?.state === 'running');
  await page.keyboard.press('m'); await page.waitForFunction(() => window.observedAudioContext.state === 'suspended');
  await page.reload(); await page.getByRole('button', { name: 'Continue culture' }).click();
  assert.match(await page.locator('#mute').innerText(), /OFF/);
  assert.equal(await page.evaluate(() => !!window.observedAudioContext), false);
  await page.keyboard.press('m'); await page.waitForFunction(() => window.observedAudioContext?.state === 'running');
  await page.keyboard.press('Escape'); await page.waitForFunction(() => window.observedAudioContext.state === 'suspended');
  await page.getByRole('button', { name: 'Resume exploration' }).click(); await page.waitForFunction(() => window.observedAudioContext.state === 'running');
  console.log('Audio checks passed: no context before interaction, gesture unlock, mute persistence, pause suspension, resume.');
} finally { await browser.close(); }
