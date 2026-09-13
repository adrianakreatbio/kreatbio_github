import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const root = resolve('..'), mount = '/others/2_2609_game/';
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  const relative = path.slice(mount.length) || 'index.html', file = resolve(root, relative);
  if (!path.startsWith(mount) || !file.startsWith(root + '/')) { res.writeHead(404); res.end(); return; }
  try {
    const body = await readFile(file);
    res.setHeader('Content-Type', ({ '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' })[extname(file)] || 'application/octet-stream'); res.end(body);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(r => server.listen(5191, '127.0.0.1', r));
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const responses = []; page.on('response', r => responses.push({ url: r.url(), status: r.status() }));
  await page.goto(`http://127.0.0.1:5191${mount}`);
  await page.getByRole('button', { name: 'Begin the adventure' }).waitFor();
  assert.equal(await page.locator('img').evaluateAll(imgs => imgs.every(i => i.complete && i.naturalWidth > 0)), true);
  assert.equal(responses.every(r => r.status === 200), true);
  await page.getByRole('button', { name: 'Begin the adventure' }).click(); await page.getByRole('button', { name: 'Let’s dig' }).click();
  await page.keyboard.down('s'); await page.waitForTimeout(3050); await page.keyboard.up('s');
  assert.equal(await page.locator('#scan').isEnabled(),true); // First movement stops at the sample.
  await page.keyboard.down('s');await page.waitForTimeout(700);await page.keyboard.up('s');
  assert.notEqual(await page.locator('#depth').innerText(), '0 tiles');
  await page.keyboard.press('Escape');
  const paused = await page.evaluate(() => JSON.parse(sessionStorage.getItem('kreatbio.microload.save')).state);
  await page.waitForTimeout(250); await page.keyboard.press('s');
  await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
  assert.deepEqual(await page.evaluate(() => JSON.parse(sessionStorage.getItem('kreatbio.microload.save')).state), paused);
  await page.screenshot({ path: 'test-results/production-nested.png', fullPage: true });
  // Denied storage must still permit a new session and movement.
  const blocked = await browser.newPage();
  await blocked.addInitScript(() => { for (const key of ['localStorage', 'sessionStorage']) Object.defineProperty(window, key, { get() { throw new DOMException('Blocked', 'SecurityError'); } }); });
  await blocked.goto(`http://127.0.0.1:5191${mount}`);
  await blocked.getByRole('button', { name: 'Begin the adventure' }).click(); await blocked.getByRole('button', { name: 'Let’s dig' }).click();
  assert.match(await blocked.locator('#save-status').innerText(), /UNAVAILABLE/);
  await blocked.keyboard.down('s'); await blocked.waitForTimeout(3050); await blocked.keyboard.up('s');
  await blocked.keyboard.down('s');await blocked.waitForTimeout(700);await blocked.keyboard.up('s');
  assert.notEqual(await blocked.locator('#depth').innerText(), '0 tiles');
  // Opening the delivered folder directly must also load a playable game.
  const local = await browser.newPage({ viewport: { width: 390, height: 844 } });
  local.on('pageerror', e => errors.push(e.message));
  await local.goto(pathToFileURL(resolve(root, 'index.html')).href);
  await local.getByRole('button', { name: 'Begin the adventure' }).click();
  await local.getByRole('button', { name: 'Let’s dig' }).click();
  assert.equal(await local.locator('img').evaluateAll(imgs => imgs.every(i => i.complete && i.naturalWidth > 0)), true);
  await local.keyboard.down('s'); await local.waitForTimeout(3050); await local.keyboard.up('s');
  assert.equal(await local.locator('#scan').isEnabled(), true);
  assert.equal(await local.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight), true);
  await local.screenshot({ path: 'test-results/production-file-phone.png', fullPage: true });
  assert.deepEqual(errors, []); console.log('Production checks passed: nested hosting, direct file opening, phone layout, assets, real movement, paused state stability, denied storage.');
} finally { await browser.close(); await new Promise(r => server.close(r)); }
