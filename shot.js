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
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('404')) console.log('CONSOLE:', m.text()); });
  await page.goto(URL);
  await page.waitForFunction(() => window.__app);
  await page.evaluate(() => window.__app.unlockAll());
  await page.waitForTimeout(400);
  await page.screenshot({ path: OUT + '/01-ready.png' });

  // ステージを順に撮る
  for (let i = 0; i < 6; i++) {
    await page.evaluate((n) => window.__app.selectStage(n), i);
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${OUT}/stage-${i + 1}.png` });
  }

  // 走っているところ (中心線を少し進んだ所に輪っかを置く)
  await page.evaluate(() => {
    const a = window.__app, C = a.core;
    a.selectStage(3);
  });
  await page.waitForTimeout(300);
  const hold = await page.evaluate(() => {
    const a = window.__app, C = a.core, st = C.STAGES[3];
    const p = C.startPoint(st);
    return a.clientForRing(p.x, p.y);
  });
  await page.touchscreen.tap(hold.x, hold.y);
  await page.waitForTimeout(150);
  await page.screenshot({ path: OUT + '/07-run.png' });

  // ステージ一覧
  await page.evaluate(() => window.__app.openSheet());
  await page.waitForTimeout(300);
  await page.screenshot({ path: OUT + '/08-stages.png' });

  await browser.close();
  server.kill();
  console.log('done ->', OUT);
})();
