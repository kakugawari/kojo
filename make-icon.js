/*
 * icon.svg から icon-180.png を作る:  node make-icon.js
 *
 * iOS のホーム画面アイコンは SVG を使えないので PNG が要る。
 * 変換用のライブラリを足さずに、ブラウザに描かせて撮る。
 */
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const SIZE = Number(process.argv[2] || 180);
const OUT = path.join(__dirname, 'icon-' + SIZE + '.png');

(async () => {
  const svg = fs.readFileSync(path.join(__dirname, 'icon.svg'), 'utf8');
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE }, deviceScaleFactor: 1 });
  await page.setContent('<body style="margin:0">' + svg.replace(/width="512"/, 'width="' + SIZE + '"')
    .replace(/height="512"/, 'height="' + SIZE + '"') + '</body>');
  await page.locator('svg').screenshot({ path: OUT, omitBackground: true });
  await browser.close();
  console.log('できた:', OUT);
})();
