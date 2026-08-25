/* 目で見て確かめるための撮影スクリプト:  node shot.js [出力先] */
const { spawn } = require('node:child_process');
const path = require('node:path');
const http = require('node:http');
const { chromium, devices } = require('playwright');

const PORT = 8131;
const URL = `http://localhost:${PORT}/`;
const OUT = process.argv[2] || '/tmp/shots';

function wait() {
  return new Promise((res, rej) => {
    const t0 = Date.now();
    const tick = () => http.get(URL, (r) => { r.resume(); res(); })
      .on('error', () => (Date.now() - t0 > 10000 ? rej(new Error('no server')) : setTimeout(tick, 100)));
    tick();
  });
}

(async () => {
  const server = spawn(process.execPath, [path.join(__dirname, 'serve.js'), String(PORT)], { stdio: 'ignore' });
  await wait();
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
  page.on('console', (m) => { if (m.type() === 'error') console.log('CONSOLE:', m.text()); });
  await page.goto(URL);
  await page.waitForFunction(() => window.__app);
  await page.waitForTimeout(500);
  await page.screenshot({ path: OUT + '/01-start.png' });

  // お金を配ってひととおり建てる
  await page.evaluate(() => {
    const a = window.__app, C = a.core, s = a.state();
    s.money = 1e15;
    for (const def of C.ROOMS) for (let i = 0; i < 14; i++) C.buyUpgrade(s, def.id);
    s.paw = 9999;
    const rng = C.mulberry32(7);
    for (let i = 0; i < 24; i++) C.addCat(s, C.newCat(rng));
    a.buildScene();
  });
  await page.waitForTimeout(600);
  await page.screenshot({ path: OUT + '/02-full.png' });

  // ズームイン
  await page.evaluate(() => { const a = window.__app; a.cam.s = 1.5; a.cam.x = 150; a.cam.y = 60;
    document.getElementById('camera').setAttribute('transform', `translate(${a.cam.x} ${a.cam.y}) scale(${a.cam.s})`); });
  await page.waitForTimeout(300);
  await page.screenshot({ path: OUT + '/03-zoom.png' });

  await page.evaluate(() => window.__app.openSheet('rooms'));
  await page.waitForTimeout(300);
  await page.screenshot({ path: OUT + '/04-rooms.png' });
  await page.evaluate(() => window.__app.openSheet('cats'));
  await page.waitForTimeout(300);
  await page.screenshot({ path: OUT + '/05-cats.png' });
  await page.evaluate(() => window.__app.openSheet('gacha'));
  await page.waitForTimeout(300);
  await page.screenshot({ path: OUT + '/06-gacha.png' });
  await page.evaluate(() => { window.__app.closeSheet(); window.__app.state().gameMinutes = 20 * 60; });
  await page.waitForTimeout(1600);
  await page.screenshot({ path: OUT + '/07-night.png' });

  await browser.close();
  server.kill();
  console.log('done ->', OUT);
})();
