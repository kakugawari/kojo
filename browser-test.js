/*
 * ブラウザで実際に動かして確かめるテスト。
 *
 *   npm i -D playwright && npm run test:ui
 *
 * 画面まわりの不具合は node のテストでは捕まらない。ここでは本物の
 * ブラウザを立ち上げ、指の操作をそのまま再現して確かめる。
 *
 * 直した不具合には、かならず見張り役をここに置くこと。
 */
const { spawn } = require('node:child_process');
const path = require('node:path');
const http = require('node:http');
const fs = require('node:fs');

const PORT = Number(process.env.PORT || 8123);
const URL = `http://localhost:${PORT}/`;
const ROOT = __dirname;
const CHROMIUM = process.env.CHROMIUM_PATH;   // 手元の Chromium を使いたいとき

let passed = 0;
let failed = 0;

function ok(condition, message) {
  if (condition) {
    passed++;
    console.log('  \x1b[32m✓\x1b[0m ' + message);
  } else {
    failed++;
    console.log('  \x1b[31m✗ FAIL\x1b[0m ' + message);
  }
}

function skip(message) {
  console.log('  \x1b[90m- とばした: ' + message + '\x1b[0m');
}

function section(name) {
  console.log('\n' + name);
}

function waitForServer() {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      http.get(URL, (res) => { res.resume(); resolve(); })
        .on('error', () => {
          if (Date.now() - started > 10000) reject(new Error('サーバーが起動しない'));
          else setTimeout(tick, 100);
        });
    };
    tick();
  });
}

/**
 * 何かした直後に、その要素が本来の場所からどれだけずれるかを
 * 1 フレームずつ測る。「置いた瞬間に一瞬とぶ」たぐいの不具合はこれで見つかる。
 *
 * @returns {Promise<number>} 最大のずれ (px)
 */
function measureJump(page, selector, act) {
  return page.evaluate(async ({ sel, code }) => {
    const before = document.querySelector(sel).getBoundingClientRect();
    // eslint-disable-next-line no-new-func
    new Function(code)();
    let worst = 0;
    for (let i = 0; i < 12; i++) {
      await new Promise((r) => requestAnimationFrame(r));
      const el = document.querySelector(sel);
      if (!el) { worst = Infinity; break; }
      const now = el.getBoundingClientRect();
      worst = Math.max(worst, Math.abs(now.left - before.left), Math.abs(now.top - before.top));
    }
    return Math.round(worst);
  }, { sel: selector, code: act });
}

/** 工場を大きくした状態を作る (テストのお膳立て)。
 *  部署は工場レベルで順にひらくので、何周かして建てる。 */
function grow(page, roomLevels, catCount) {
  return page.evaluate(({ levels, cats }) => {
    const a = window.__app, C = a.core, s = a.state();
    s.money = 1e15;
    s.paw = 99999;
    // 部署は工場レベルで順にひらく。ぜんぶ建つまで買い続ける
    for (let i = 0; i < 300 && C.builtRooms(s).length < C.ROOMS.length; i++) {
      for (const def of C.ROOMS) C.buyUpgrade(s, def.id);
    }
    for (let pass = 0; pass < levels; pass++) for (const def of C.ROOMS) C.buyUpgrade(s, def.id);
    const rng = C.mulberry32(7);
    for (let i = 0; i < cats; i++) C.addCat(s, C.newCat(rng));
    a.buildScene();
    a.fitCam();   // 育てたあとは工場ぜんたいが見える所から始める
  }, { levels: roomLevels, cats: catCount });
}

/** ゆれ続けている絵はふつうの tap では押せない。真ん中を指でつつく。 */
async function tapAt(page, selector) {
  const box = await page.locator(selector).first().boundingBox();
  if (!box) throw new Error('見つからない: ' + selector);
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
}

async function run() {
  let chromium;
  let devices;
  try {
    ({ chromium, devices } = require('playwright'));
  } catch (e) {
    console.error('playwright が必要です:  npm i -D playwright');
    process.exit(1);
  }

  const server = spawn(process.execPath, [path.join(ROOT, 'serve.js'), String(PORT)], {
    stdio: 'ignore'
  });
  await waitForServer();

  const browser = await chromium.launch(CHROMIUM ? { executablePath: CHROMIUM } : {});
  const errors = [];

  try {
    // ------------------------------------------------ スマホで開く
    section('スマホで開く');
    const context = await browser.newContext({ ...devices['iPhone 13'] });
    const phone = await context.newPage();
    phone.on('pageerror', (e) => errors.push('スマホ: ' + e.message));
    phone.on('console', (m) => { if (m.type() === 'error') errors.push('スマホ: ' + m.text()); });
    await phone.goto(URL);
    await phone.waitForFunction(() => window.__app);
    ok(true, 'ページが開いて、画面のしくみが立ち上がる');

    const fit = await phone.evaluate(() => ({
      wide: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      dock: document.getElementById('dock').getBoundingClientRect().bottom,
      inner: window.innerHeight
    }));
    ok(fit.wide <= 1, 'スマホ幅で横スクロールが出ない');
    ok(fit.dock <= fit.inner + 1, `下のバーが画面に収まる (${Math.round(fit.dock)} <= ${fit.inner})`);

    // ------------------------------------------------ 工場が描けている
    section('工場の絵');
    const scene = await phone.evaluate(() => ({
      rooms: document.querySelectorAll('#layerRooms [data-room]').length,
      cats: document.querySelectorAll('#layerRooms [data-cat]').length,
      signs: document.querySelectorAll('#layerSigns [data-sign]').length,
      hidden: document.getElementById('modalWrap').getBoundingClientRect().width
    }));
    ok(scene.rooms === 6, `部署が 6 つ描かれている (${scene.rooms})`);
    ok(scene.cats >= 1, `はじめのねこが席についている (${scene.cats} ひき)`);
    ok(scene.signs === 1, `建っている部署の看板だけ出る (${scene.signs})`);
    // hidden が display:grid に負けて、灰色の幕が全画面にかかったことがある
    ok(scene.hidden === 0, 'お知らせの幕は、出していないときは本当に消えている');

    // 部署をぜんぶ建てても絵が壊れないか
    await grow(phone, 6, 20);
    const grown = await phone.evaluate(() => ({
      cats: document.querySelectorAll('#layerRooms [data-cat]').length,
      signs: document.querySelectorAll('#layerSigns [data-sign]').length,
      seats: window.__app.core.ROOMS.reduce((a, d) => a + d.slots, 0)
    }));
    ok(grown.signs === 6, `建てたぶんだけ看板が増える (${grown.signs})`);
    ok(grown.cats > 1 && grown.cats <= grown.seats, `ねこが席の数をこえて描かれない (${grown.cats} / 席 ${grown.seats})`);

    // ------------------------------------------------ ねこをなでる
    section('ねこをなでる');
    await phone.evaluate(() => window.__app.closeSheet());
    const before = await phone.evaluate(() => window.__app.state().money);
    const catPlace = await phone.evaluate(() =>
      document.querySelector('#layerRooms [data-cat]').getAttribute('transform'));
    // ねこの絵はすき間だらけなので、からだ (最初の ellipse) をねらう
    await tapAt(phone, '#layerRooms [data-cat] .bob ellipse');
    await phone.waitForTimeout(150);
    const petted = await phone.evaluate(() => ({
      money: window.__app.state().money,
      taps: window.__app.state().taps,
      floats: document.querySelectorAll('#layerFx text').length
    }));
    ok(petted.taps >= 1, `ねこをタップすると なでた回数が増える (${petted.taps})`);
    ok(petted.money > before, 'なでたぶんお金が入る');
    ok(petted.floats >= 1, '「+◯◯」が画面に出る');

    // なでた直後に、ねこが本来の場所から飛ばないか。
    // 置き場所は外側の <g> の transform、ゆれるのは内側の <g>。
    // 同じ要素でやると、アニメーションが置き場所を上書きして飛ぶ。
    const catPlaceAfter = await phone.evaluate(() =>
      document.querySelector('#layerRooms [data-cat]').getAttribute('transform'));
    ok(catPlace === catPlaceAfter, `なでても、ねこの置き場所そのものは動かない (${catPlaceAfter})`);
    const jump = await measureJump(phone, '#layerRooms [data-cat]', `
      const el = document.querySelector('#layerRooms [data-cat] .bob ellipse');
      const r = el.getBoundingClientRect();
      const o = { bubbles: true, pointerId: 9, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 };
      el.dispatchEvent(new PointerEvent('pointerdown', o));
      el.dispatchEvent(new PointerEvent('pointerup', o));
    `);
    ok(jump < 16, `なでた直後にねこが飛ばない (ゆれと跳ねを入れて最大ずれ ${jump}px)`);

    // ------------------------------------------------ あわ
    section('あわ');
    await phone.evaluate(() => { window.__app.closeSheet(); window.__app.spawnBubble(); });
    await phone.waitForTimeout(120);
    const bubbleBox = await phone.evaluate(() => {
      const b = document.querySelector('#layerFx [data-bubble] rect');
      const r = b.getBoundingClientRect();
      return { w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left), y: Math.round(r.top) };
    });
    // あわをカメラの中に入れていたころ、二重に拡大されて画面いっぱいになった
    ok(bubbleBox.w > 40 && bubbleBox.w < 260, `あわの大きさがふつう (${bubbleBox.w}x${bubbleBox.h}px)`);
    ok(bubbleBox.x > -60 && bubbleBox.x < 400, `あわが画面の中にある (x=${bubbleBox.x})`);

    const beforePop = await phone.evaluate(() => window.__app.state().money + window.__app.state().paw);
    await tapAt(phone, '#layerFx [data-bubble] rect');
    await phone.waitForTimeout(150);
    const popped = await phone.evaluate(() => ({
      left: document.querySelectorAll('#layerFx [data-bubble]').length,
      total: window.__app.state().money + window.__app.state().paw
    }));
    ok(popped.left === 0, 'タップしたあわは消える');
    ok(popped.total > beforePop, 'あわのごほうびが入る');

    // ------------------------------------------------ 指でなぞる / つまむ
    section('指でうごかす');
    await phone.evaluate(() => window.__app.closeSheet());
    const camBefore = await phone.evaluate(() => ({ ...window.__app.cam }));
    await phone.mouse.move(200, 400);
    await phone.mouse.down();
    for (let i = 1; i <= 6; i++) await phone.mouse.move(200 - i * 12, 400 - i * 6);
    await phone.mouse.up();
    await phone.waitForTimeout(120);
    const camAfter = await phone.evaluate(() => ({ ...window.__app.cam, sheet: !document.getElementById('sheetWrap').hidden }));
    ok(Math.abs(camAfter.x - camBefore.x) > 20, `なぞると工場が動く (${Math.round(camBefore.x)} → ${Math.round(camAfter.x)})`);
    ok(camAfter.sheet === false, 'なぞっただけでは、パネルが開かない');

    // 看板はズームしても大きさが変わらない (画面の座標に置いている)
    const signSize = await phone.evaluate(() => {
      const a = window.__app;
      const el = document.querySelector('#layerSigns [data-sign] rect');
      const before = el.getBoundingClientRect().width;
      a.cam.s *= 1.8;
      document.getElementById('camera').setAttribute('transform',
        `translate(${a.cam.x} ${a.cam.y}) scale(${a.cam.s})`);
      a.fitCam();
      return { before: Math.round(before), after: Math.round(el.getBoundingClientRect().width) };
    });
    ok(Math.abs(signSize.after - signSize.before) <= 2,
      `ズームしても看板の大きさが変わらない (${signSize.before} → ${signSize.after}px)`);

    // ------------------------------------------------ 部署をタップして育てる
    section('部署を育てる');
    await phone.evaluate(() => window.__app.closeSheet());
    await tapAt(phone, '#layerRooms [data-room="kitchen"] polygon');
    await phone.waitForTimeout(200);
    const opened = await phone.evaluate(() => ({
      open: !document.getElementById('sheetWrap').hidden,
      title: document.getElementById('sheetTitle').textContent
    }));
    // 指でタップすると click があとから来る。開いた板の裏に当たって
    // 一瞬で閉じたことがあるので、開いたままかどうかまで見る
    ok(opened.open && opened.title.includes('きゅうしょく'),
      `部署をタップすると中身が出て、開いたままになる (${opened.title} / ${opened.open ? '開' : '閉'})`);

    const lvBefore = await phone.evaluate(() => window.__app.core.roomLevel(window.__app.state(), 'kitchen'));
    await phone.locator('#sheetBody [data-buy="kitchen"]').tap();
    await phone.waitForTimeout(200);
    const lvAfter = await phone.evaluate(() => ({
      level: window.__app.core.roomLevel(window.__app.state(), 'kitchen'),
      sign: document.querySelector('#layerSigns [data-sign="kitchen"] text').textContent
    }));
    ok(lvAfter.level === lvBefore + 1, `ボタンを押すとレベルが上がる (${lvBefore} → ${lvAfter.level})`);
    ok(lvAfter.sign.includes('Lv.' + lvAfter.level), `看板の表示も一緒に変わる (${lvAfter.sign.trim()})`);

    // ------------------------------------------------ ガチャ
    section('ガチャ');
    await phone.evaluate(() => window.__app.openSheet('gacha'));
    await phone.waitForTimeout(150);
    const catsBefore = await phone.evaluate(() => window.__app.state().cats.length);
    await phone.locator('#sheetBody [data-gacha="10"]').tap();
    await phone.waitForTimeout(300);
    const gacha = await phone.evaluate(() => ({
      cats: window.__app.state().cats.length,
      shown: document.querySelectorAll('#gachaResult .cat-card').length
    }));
    ok(gacha.cats === catsBefore + 10, `10 連でねこが 10 ぴき増える (${catsBefore} → ${gacha.cats})`);
    ok(gacha.shown === 10, `引いた 10 ぴきが並ぶ (${gacha.shown})`);

    // ------------------------------------------------ 時間帯
    section('朝と夜');
    await phone.evaluate(() => { window.__app.closeSheet(); window.__app.state().gameMinutes = 21 * 60; });
    await phone.waitForTimeout(2000);
    const night = await phone.evaluate(() => ({
      phase: document.getElementById('app').dataset.phase,
      tint: getComputedStyle(document.getElementById('tint')).fill,
      clock: document.getElementById('clock').textContent
    }));
    ok(night.phase === 'night', `21 時なら夜になる (${night.phase} / ${night.clock})`);
    ok(night.tint !== 'rgba(0, 0, 0, 0)' && night.tint !== 'none', `夜は画面に色がかかる (${night.tint})`);

    // ------------------------------------------------ 保存
    section('続きから');
    await phone.evaluate(() => { window.__app.state().money = 1234567; window.__app.save(true); });
    await phone.reload();
    await phone.waitForFunction(() => window.__app);
    const reloaded = await phone.evaluate(() => ({
      money: window.__app.state().money,
      cats: window.__app.state().cats.length,
      kitchen: window.__app.core.roomLevel(window.__app.state(), 'kitchen')
    }));
    ok(reloaded.money >= 1234567, `お金が続きから始まる (${Math.round(reloaded.money)})`);
    ok(reloaded.cats > 10 && reloaded.kitchen > 1, `ねこと部署も残っている (ねこ ${reloaded.cats} / きゅうしょく室 Lv.${reloaded.kitchen})`);

    // セーブが壊れていても開けるか
    await phone.evaluate(() => localStorage.setItem(window.__app.core.SAVE_KEY, '{こわれ'));
    await phone.reload();
    await phone.waitForFunction(() => window.__app);
    ok(await phone.evaluate(() => window.__app.state().cats.length >= 1),
      'セーブが壊れていても、新品として開ける');

    // ------------------------------------------------ 遅い端末
    section('遅い端末');
    const cdp = await context.newCDPSession(phone);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await grow(phone, 8, 25);
    await phone.waitForTimeout(400);
    const frames = await phone.evaluate(() => new Promise((res) => {
      const gaps = [];
      let last = performance.now();
      let n = 0;
      const step = (t) => {
        gaps.push(t - last); last = t;
        if (++n < 80) requestAnimationFrame(step); else res(gaps.slice(12));
      };
      requestAnimationFrame(step);
    }));
    frames.sort((a, b) => a - b);
    const p95 = Math.round(frames[Math.floor(frames.length * 0.95)]);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    ok(p95 < 70, `CPU 4 倍おそくしても、1 フレーム ${p95}ms (70ms 未満なら合格)`);

    // ------------------------------------------------ 明るい画面・暗い画面
    section('明るい画面と暗い画面');
    for (const scheme of ['light', 'dark']) {
      const themed = await browser.newContext({ ...devices['iPhone 13'], colorScheme: scheme });
      const page = await themed.newPage();
      page.on('pageerror', (e) => errors.push(scheme + ': ' + e.message));
      await page.goto(URL);
      await page.waitForFunction(() => window.__app);
      const colors = await page.evaluate(() => ({
        bg: getComputedStyle(document.body).backgroundColor,
        fg: getComputedStyle(document.body).color
      }));
      ok(colors.bg !== colors.fg, `${scheme}: 文字と背景の色が違う (${colors.bg} / ${colors.fg})`);
      await themed.close();
    }

    // ------------------------------------------------ アイコン
    section('アイコン');
    const desk = await browser.newPage();
    await desk.goto(URL);
    const apple = await desk.evaluate(() =>
      document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute('href'));
    if (!apple) {
      skip('ホーム画面用のアイコンはまだ無い');
    } else {
      // iOS は SVG のアイコンを使えない
      ok(apple.endsWith('.png'), `ホーム画面用アイコンが PNG (${apple})`);
      const res = await desk.request.get(URL + apple.replace('./', ''));
      ok(res.ok(), `${apple} が配信される`);
    }

    // ------------------------------------------------ 更新とオフライン (sw.js があれば)
    section('更新とオフライン');
    if (!fs.existsSync(path.join(ROOT, 'sw.js'))) {
      skip('サービスワーカーはまだ無い (オフライン対応するときに用意する)');
    } else {
      const swCtx = await browser.newContext();
      const swPage = await swCtx.newPage();
      await swPage.goto(URL);
      await swPage.waitForFunction(() => window.__app);
      ok(await swPage.evaluate(() => navigator.serviceWorker.ready.then((r) => !!r.active).catch(() => false)),
        'サービスワーカーが動く');
      await swCtx.close();
    }

    section('エラー');
    ok(errors.length === 0, errors.length ? '画面のエラー: ' + errors.join(' / ') : 'JS エラーなし');
  } finally {
    await browser.close();
    server.kill();
  }

  console.log(`\n${passed} 件合格 / ${failed} 件失敗`);
  process.exit(failed ? 1 : 0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
