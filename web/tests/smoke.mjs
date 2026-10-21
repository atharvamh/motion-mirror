// Browser smoke test (not part of `npm test`: needs playwright-core and a Chromium).
//   npm i --no-save playwright-core && CHROMIUM=/path/to/chrome node web/tests/smoke.mjs
// Serves web/ itself, then checks: demo mode renders a non-blank chicken and drives the
// angle readouts, and the real camera path (fake webcam) loads the pose model and runs frames
// without page errors. A fake webcam has no person in it, so "no pose" is the expected result.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const root = new URL('..', import.meta.url).pathname;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = createServer(async (req, res) => {
  try {
    const path = join(root, req.url.split('?')[0] === '/' ? 'index.html' : req.url.split('?')[0]);
    res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream' });
    res.end(await readFile(path));
  } catch { res.writeHead(404).end(); }
}).listen(0);
const base = `http://localhost:${server.address().port}`;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
});
const errors = [];
const page = await browser.newPage({ viewport: { width: 1200, height: 760 } });
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

await page.goto(`${base}/?demo`);
await page.waitForTimeout(2000);
assert.match(await page.locator('#v-elev').innerText(), /^\d+°$/, 'demo should drive the angle readout');
const png = await page.locator('#stage').screenshot();
assert.ok(new Set(png.subarray(200, 4000)).size > 20, 'stage looks blank');

await page.goto(base);
await page.click('#start');
await page.waitForFunction(() => /ms$/.test(document.getElementById('v-lat').textContent), null, { timeout: 60000 });
assert.doesNotMatch(await page.locator('#status').innerText(), /Couldn't start/, 'camera path failed to start');

await browser.close();
server.close();
assert.deepEqual(errors, [], 'page errors');
console.log('smoke ok');
