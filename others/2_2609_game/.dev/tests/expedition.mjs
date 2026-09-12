// Real-time browser playthrough: only keyboard movement and shop clicks change gameplay.
// Read-only decisions use saved snapshots; pagehide flushes a snapshot for observation.
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
const errors = []; page.on('pageerror', e => errors.push(e.message));
await mkdir('test-results', { recursive: true });
await page.addInitScript(() => { Date.now = () => 2609; }); // Fix only the generation seed, never simulation time.
const began = performance.now();
const read = () => page.evaluate(() => { window.dispatchEvent(new Event('pagehide')); return JSON.parse(localStorage.getItem('kreatbio.microload.save')).state; });
let lastTrips = -1, returning = false, reloaded = false;
try {
  await page.goto(process.env.BASE_URL || 'http://localhost:5173');
  await page.getByRole('button', { name: 'Begin the adventure' }).click();
  await page.getByRole('button', { name: 'Let’s dig' }).click();
  while (performance.now() - began < 30 * 60 * 1000) {
    let state = await read();
    if (state.won) break;
    const home = state.player.y <= 3 && Math.abs(state.player.x - 20) <= 2;
    if (home) {
      returning = false;
      let next = await page.evaluate(async s => (await import('/tests/pilot.ts')).nextUpgrade(s), state);
      if (next) {
        await page.getByRole('button', { name: /Upgrade/ }).click();
        while (next && await page.locator(`[data-buy="${next}"]`).isEnabled()) {
          await page.locator(`[data-buy="${next}"]`).click(); state = await read();
          next = await page.evaluate(async s => (await import('/tests/pilot.ts')).nextUpgrade(s), state);
        }
        await page.getByRole('button', { name: 'Back to exploration' }).click();
      }
      if (!reloaded && state.trips >= 2) {
        await page.keyboard.press('Escape'); const before = await read(); await page.reload();
        await page.getByRole('button', { name: 'Continue culture' }).click();
        const after = await read(); assert.deepEqual(after.upgrades, before.upgrades); assert.equal(after.bank, before.bank); reloaded = true;
      }
    }
    state = await read();
    if (lastTrips !== state.trips) {
      lastTrips = state.trips; console.log(JSON.stringify({ seconds: Math.round(state.elapsed), trips: state.trips, deaths: state.deaths, upgrades: state.upgrades, bank: state.bank }));
      await page.screenshot({ path: `test-results/expedition-trip-${state.trips}.png` });
    }
    const sample = state.world.samples.find(site => !state.scans.includes(site.id) && Math.abs(site.x-state.player.x)+Math.abs(site.y-state.player.y)<=1);
    if (sample) { await page.keyboard.press('e'); if (!state.scans.length) await page.getByRole('button', { name: 'Read DNA & survey patch' }).click(); await page.getByRole('dialog', { name: 'scan-result', exact: true }).waitFor(); await page.getByRole('button', { name: 'Close soil sample' }).click(); state = await read(); }
    const choice = await page.evaluate(async ({ s, returning }) => (await import('/tests/pilot.ts')).decision(s, returning), { s: state, returning });
    returning = choice.returning;
    if (!choice.path.length) throw new Error(`Pilot stuck: ${JSON.stringify(state.player)}`);
    for (const [x, y] of choice.path) {
      state = await read();
      const dx = x - state.player.x, dy = y - state.player.y;
      if (Math.abs(dx) + Math.abs(dy) !== 1 || state.won) break;
      const key = dx === 1 ? 'd' : dx === -1 ? 'a' : dy === 1 ? 's' : 'w';
      const deaths = state.deaths, trips = state.trips;
      await page.keyboard.down(key);
      await page.waitForFunction(({ x, y, deaths, trips, dx, dy }) => {
        window.dispatchEvent(new Event('pagehide'));
        const s = JSON.parse(localStorage.getItem('kreatbio.microload.save')).state;
        return (dx > 0 ? s.player.x >= x : dx < 0 ? s.player.x <= x : dy > 0 ? s.player.y >= y : s.player.y <= y) || s.deaths !== deaths || s.trips !== trips || s.won;
      }, { x, y, deaths, trips, dx, dy }, { polling: 'raf', timeout: 15000 });
      await page.keyboard.up(key); await page.waitForTimeout(20);
      state = await read(); if (state.deaths !== deaths || state.trips !== trips || state.won) break;
    }
  }
  const state = await read(); assert.equal(state.won, true); assert.deepEqual(errors, []);
  await page.getByText('PEA PLANT RESTORED', { exact: true }).waitFor();
  await page.screenshot({ path: 'test-results/victory.png', fullPage: true });
  const report = { seed: state.world.seed, activeSeconds: state.elapsed, scans: state.scans, deposited: state.deposited, wallSeconds: (performance.now() - began) / 1000, trips: state.trips, deaths: state.deaths, upgrades: state.upgrades, bank: state.bank, reloadVerified: reloaded, errors };
  await writeFile('test-results/expedition.json', JSON.stringify(report, null, 2)); console.log('VICTORY', report);
} catch (e) { await page.screenshot({ path: 'test-results/expedition-failure.png', fullPage: true }); console.error(JSON.stringify((await read()).player)); throw e; }
finally { await browser.close(); }
