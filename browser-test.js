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
  if (condition) { passed++; console.log('  \x1b[32m✓\x1b[0m ' + message); }
  else { failed++; console.log('  \x1b[31m✗ FAIL\x1b[0m ' + message); }
}
function skip(message) { console.log('  \x1b[90m- とばした: ' + message + '\x1b[0m'); }
function section(name) { console.log('\n' + name); }

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

/** 盤の座標のならびを、押すべき画面の座標に直してもらう。 */
function courseTrail(page, stageIndex, step) {
  return page.evaluate(({ i, st }) => {
    const C = window.Core, stage = C.STAGES[i];
    const total = C.pathLength(stage.path);
    const out = [];
    for (let s = 0; s <= total; s += st) {
      const p = C.pointAt(stage.path, Math.min(s, total));
      out.push(window.__app.clientForRing(p.x, p.y));
    }
    const g = C.goalPoint(stage);
    out.push(window.__app.clientForRing(g.x, g.y));
    return out;
  }, { i: stageIndex, st: step });
}

/** 中心線ぞいに指を運ぶ。走るのをやめたら、そこで止める。 */
async function walkTrail(page, trail, holdMs) {
  for (const p of trail) {
    await page.mouse.move(p.x, p.y);
    if (holdMs) await page.waitForTimeout(holdMs);
    const mode = await page.evaluate(() => window.__app.mode());
    if (mode !== 'run') return mode;
  }
  return page.evaluate(() => window.__app.mode());
}

/** 中心線をなぞって、ステージを 1 つ通してみる。 */
async function autoplay(page, stageIndex, step) {
  await page.evaluate((i) => window.__app.selectStage(i), stageIndex);
  await page.waitForTimeout(120);
  const trail = await courseTrail(page, stageIndex, step || 20);
  await page.mouse.move(trail[0].x, trail[0].y);
  await page.mouse.down();
  for (const p of trail) {
    await page.mouse.move(p.x, p.y);
    const mode = await page.evaluate(() => window.__app.mode());
    if (mode !== 'run') break;
  }
  const mode = await page.evaluate(() => window.__app.mode());
  await page.mouse.up();
  return mode;
}

async function run() {
  let chromium, devices;
  try { ({ chromium, devices } = require('playwright')); }
  catch (e) { console.error('playwright が必要です:  npm i -D playwright'); process.exit(1); }

  const server = spawn(process.execPath, [path.join(ROOT, 'serve.js'), String(PORT)], { stdio: 'ignore' });
  await waitForServer();

  const browser = await chromium.launch(CHROMIUM ? { executablePath: CHROMIUM } : {});
  const errors = [];

  try {
    // ------------------------------------------------ スマホで開く
    section('スマホで開く');
    // 横向きのスマホ。この game は横長の盤で遊ぶ
    const LANDSCAPE = {
      viewport: { width: 844, height: 390 },
      deviceScaleFactor: 3, isMobile: true, hasTouch: true,
      userAgent: devices['iPhone 13'].userAgent
    };
    const context = await browser.newContext(LANDSCAPE);
    const phone = await context.newPage();
    phone.on('pageerror', (e) => errors.push('スマホ: ' + e.message));
    phone.on('console', (m) => { if (m.type() === 'error') errors.push('スマホ: ' + m.text()); });
    await phone.goto(URL);
    await phone.waitForFunction(() => window.__app);
    ok(true, 'ページが開いて、画面のしくみが立ち上がる');

    const fit = await phone.evaluate(() => {
      const b = document.getElementById('board').getBoundingClientRect();
      return {
        wide: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        boardW: Math.round(b.width), boardH: Math.round(b.height),
        innerW: window.innerWidth, innerH: window.innerHeight
      };
    });
    ok(fit.wide <= 1, 'スマホ幅で横スクロールが出ない');
    ok(fit.boardW <= fit.innerW + 1 && fit.boardH <= fit.innerH + 1,
      `盤が画面に収まる (${fit.boardW}x${fit.boardH} / ${fit.innerW}x${fit.innerH})`);

    // ------------------------------------------------ 絵と判定が同じ数字で出来ているか
    section('コースの絵');
    await phone.evaluate(() => window.__app.unlockAll());
    await phone.evaluate(() => window.__app.selectStage(0));
    await phone.waitForTimeout(150);
    const drawn = await phone.evaluate(() => {
      const C = window.Core, st = C.STAGES[0];
      const VOID = '#06070d';   // みぞの中をくりぬいている色
      const paths = [...document.querySelectorAll('#course path')];
      const floor = paths.find((p) => p.getAttribute('stroke') === VOID);
      const circles = [...document.querySelectorAll('#course circle')]
        .filter((c) => c.getAttribute('fill') === VOID);
      return {
        floorWidth: Number(floor.getAttribute('stroke-width')),
        want: st.corridor * 2,
        padR: circles.map((c) => Number(c.getAttribute('r'))),
        wantPad: C.padRadius(st)
      };
    });
    // 絵と当たり判定が同じ数字から出ていること。ここがズレると
    // 「見えているコースの中なのに当たる」が起きる
    ok(drawn.floorWidth === drawn.want, `くりぬきの太さ = みぞの太さ (${drawn.floorWidth} / ${drawn.want})`);
    ok(drawn.padR.length === 2 && drawn.padR.every((r) => r === drawn.wantPad),
      `端子の大きさ = 判定の大きさ (${drawn.padR.join(',')} / ${drawn.wantPad})`);

    // 右から左に流れる品番では、START 端子が盤の右がわに描かれていること。
    // 絵が向きのデータについてきているかを、実際の画面で見る
    for (const i of [0, 1]) {
      await phone.evaluate((n) => window.__app.selectStage(n), i);
      await phone.waitForTimeout(150);
      const pads = await phone.evaluate(() => {
        const C = window.Core, st = C.STAGES[window.__app.state().index];
        const texts = [...document.querySelectorAll('#course text')];
        const find = (t) => texts.find((e) => e.textContent.trim() === t);
        return {
          model: st.model,
          dir: C.flowDir(st),
          startX: Number(find('START').getAttribute('x')),
          goalX: Number(find('GOAL').getAttribute('x')),
          w: C.BOARD.w
        };
      });
      const rightward = pads.goalX > pads.startX;
      ok(rightward === (pads.dir > 0),
        `${pads.model}: ${pads.dir > 0 ? '左から右' : '右から左'} に描かれている (START ${Math.round(pads.startX)} → GOAL ${Math.round(pads.goalX)})`);
    }
    await phone.evaluate(() => window.__app.selectStage(0));

    // ------------------------------------------------ 通してみる
    section('コースを通す');
    await phone.evaluate(() => window.__app.wipe());
    await phone.reload();
    await phone.waitForFunction(() => window.__app);
    const mode1 = await autoplay(phone, 0, 20);
    ok(mode1 === 'clear', `中心線をなぞればクリアできる (${mode1})`);

    const after = await phone.evaluate(() => ({
      best: window.__app.save().best[window.Core.STAGES[0].id],
      unlocked: window.__app.save().unlocked,
      shown: document.getElementById('best').textContent,
      panel: document.querySelector('#overlay .panel') ? document.querySelector('#overlay h2').textContent : ''
    }));
    ok(after.best > 0, `タイムが記録される (${Math.round(after.best)}ms)`);
    ok(after.unlocked === 2, `クリアするとつぎのステージがひらく (${after.unlocked})`);
    ok(after.panel.includes('出荷'), `合格の画面が出る (${after.panel})`);
    ok(after.shown !== '--.--', `自己ベストが上に出る (${after.shown})`);

    // ------------------------------------------------ 画面の向き
    section('画面の向き');
    const shown = await phone.evaluate(() =>
      getComputedStyle(document.getElementById('rotate')).display);
    ok(shown === 'none', `横向きなら、おねがいは出ない (${shown})`);

    const up = await browser.newContext({ ...devices['iPhone 13'] });   // たて
    const upPage = await up.newPage();
    upPage.on('pageerror', (e) => errors.push('たて: ' + e.message));
    await upPage.goto(URL);
    await upPage.waitForFunction(() => window.__app);
    const upShown = await upPage.evaluate(() =>
      getComputedStyle(document.getElementById('rotate')).display);
    ok(upShown === 'flex', `たてなら「横にして」が出る (${upShown})`);
    await upPage.locator('#btnStay').tap();
    await upPage.waitForTimeout(120);
    const upAfter = await upPage.evaluate(() =>
      getComputedStyle(document.getElementById('rotate')).display);
    ok(upAfter === 'none', `「このまま遊ぶ」で消える (${upAfter})`);
    await up.close();

    // ------------------------------------------------ 暗室検査
    section('暗室検査');
    await phone.evaluate(() => window.__app.selectStage(0));
    await phone.waitForTimeout(120);
    const lightOff = await phone.evaluate(() => document.getElementById('dark').getAttribute('display'));
    await phone.locator('#btnDark').tap();
    await phone.waitForTimeout(150);
    const lightOn = await phone.evaluate(() => ({
      display: document.getElementById('dark').getAttribute('display'),
      pressed: document.getElementById('btnDark').getAttribute('aria-pressed'),
      saved: window.__app.save().dark
    }));
    ok(lightOff === 'none' && lightOn.display === 'inline' && lightOn.pressed === 'true',
      `🔦 で幕が出る (${lightOff} → ${lightOn.display})`);
    ok(lightOn.saved === true, '入り切りをおぼえている');

    // 明かりはリングについてくる
    const follow = await phone.evaluate(() => {
      const hole = document.getElementById('lightHole');
      const r = window.__app.ring();
      return { cx: Number(hole.getAttribute('cx')), cy: Number(hole.getAttribute('cy')), rx: r.x, ry: r.y };
    });
    ok(Math.abs(follow.cx - follow.rx) < 1 && Math.abs(follow.cy - follow.ry) < 1,
      `明かりがリングの上にある (${follow.cx},${follow.cy})`);

    // 幕は操作をさえぎらない。暗くてもコースの形も判定も同じなので、なぞれば通る
    const darkRun = await autoplay(phone, 0, 20);
    ok(darkRun === 'clear', `暗室でも、なぞれば合格できる (${darkRun})`);
    const movedLight = await phone.evaluate(() => ({
      cx: Number(document.getElementById('lightHole').getAttribute('cx')),
      cy: Number(document.getElementById('lightHole').getAttribute('cy'))
    }));
    ok(Math.abs(movedLight.cx - follow.cx) > 20 || Math.abs(movedLight.cy - follow.cy) > 20,
      `明かりが動いた (${follow.cx},${follow.cy} → ${movedLight.cx},${movedLight.cy})`);
    ok(await phone.evaluate(() => document.getElementById('dark').getAttribute('display')) === 'none',
      '合格したあいだは幕を上げる');

    await phone.locator('#btnDark').tap();
    await phone.waitForTimeout(120);
    const lightBack = await phone.evaluate(() => ({
      saved: window.__app.save().dark,
      display: document.getElementById('dark').getAttribute('display')
    }));
    ok(lightBack.saved === false && lightBack.display === 'none', '💡 でもとにもどる');

    // ------------------------------------------------ 外わく
    section('外わく');
    await phone.evaluate(() => window.__app.unlockAll());
    await phone.evaluate(() => window.__app.selectStage(0));
    await phone.waitForTimeout(120);
    const wallPts = await phone.evaluate(() => {
      const C = window.Core, st = C.STAGES[0];
      const s = C.startPoint(st);
      const mid = C.pointAt(st.path, 300);
      // 中心線から真横に、コースの外まで出た所
      const t = C.tangentAt(st.path, 300);
      const out = { x: mid.x - t.y * (st.corridor + 40), y: mid.y + t.x * (st.corridor + 40) };
      return {
        start: window.__app.clientForRing(s.x, s.y),
        mid: window.__app.clientForRing(mid.x, mid.y),
        out: window.__app.clientForRing(out.x, out.y)
      };
    });
    await phone.mouse.move(wallPts.start.x, wallPts.start.y);
    await phone.mouse.down();
    const started = await phone.evaluate(() => window.__app.mode());
    ok(started === 'run', `START 端子にリングをのせると始まる (${started})`);
    await phone.mouse.move(wallPts.mid.x, wallPts.mid.y);
    await phone.mouse.move(wallPts.out.x, wallPts.out.y);
    await phone.waitForTimeout(60);
    const hitWall = await phone.evaluate(() => ({ mode: window.__app.mode(), kind: window.__app.state().result.kind }));
    await phone.mouse.up();
    ok(hitWall.mode === 'fail' && hitWall.kind === 'wall', `外わくにさわるとショート (${hitWall.kind})`);

    // 1 秒たつと、すぐやり直せる状態にもどる
    await phone.waitForTimeout(1200);
    ok(await phone.evaluate(() => window.__app.mode()) === 'ready', 'しっぱいのあと、すぐやり直せる');

    // ------------------------------------------------ すり抜けよけ (いちばん大事な見張り)
    section('すり抜け');
    await phone.evaluate(() => window.__app.selectStage(0));
    await phone.waitForTimeout(120);
    const flick = await phone.evaluate(() => {
      const C = window.Core, st = C.STAGES[0];
      const s = C.startPoint(st), g = C.goalPoint(st);
      return { start: window.__app.clientForRing(s.x, s.y), goal: window.__app.clientForRing(g.x, g.y) };
    });
    await phone.mouse.move(flick.start.x, flick.start.y);
    await phone.mouse.down();
    await phone.mouse.move(flick.goal.x, flick.goal.y);   // 一気に払う
    await phone.waitForTimeout(60);
    const flicked = await phone.evaluate(() => window.__app.mode());
    await phone.mouse.up();
    // 点だけで判定していると、コマとコマのあいだで外わくをまたいで通れてしまう
    ok(flicked === 'fail', `スタートからゴールへ一気に払っても通れない (${flicked})`);

    // ------------------------------------------------ 指をはなす
    section('指をはなす');
    await phone.waitForTimeout(1100);
    await phone.evaluate(() => window.__app.selectStage(0));
    await phone.waitForTimeout(120);
    const trail0 = await courseTrail(phone, 0, 16);
    await phone.mouse.move(trail0[0].x, trail0[0].y);
    await phone.mouse.down();
    await walkTrail(phone, trail0.slice(0, 12));   // コースぞいに少しだけ進む
    const running = await phone.evaluate(() => window.__app.mode());
    await phone.mouse.up();
    await phone.waitForTimeout(60);
    const released = await phone.evaluate(() => ({ mode: window.__app.mode(), kind: window.__app.state().result.kind }));
    ok(running === 'run' && released.mode === 'fail' && released.kind === 'release',
      `とちゅうで指をはなすとしっぱい (${released.kind})`);

    // ------------------------------------------------ 邪魔もの
    section('可動部');
    await phone.waitForTimeout(1100);
    await phone.evaluate(() => window.__app.selectStage(3));
    await phone.waitForTimeout(200);
    const haz = await phone.evaluate(() => new Promise((res) => {
      const el = document.querySelector('#hazards line.haz-face');
      const a = el.getBoundingClientRect();
      setTimeout(() => {
        const b = el.getBoundingClientRect();
        res({
          count: document.querySelectorAll('#hazards line.haz-face').length,
          want: window.Core.STAGES[3].hazards.length,
          moved: Math.round(Math.hypot(b.left - a.left, b.top - a.top) + Math.abs(b.width - a.width))
        });
      }, 500);
    }));
    ok(haz.count === haz.want, `可動部が品番のぶんだけ出ている (${haz.count}/${haz.want})`);
    ok(haz.moved > 3, `可動部が動いている (0.5 秒で ${haz.moved}px)`);

    // 邪魔ものの所まで行って、そこで止まっていればいつか必ずやられる
    const into = await phone.evaluate(() => {
      const C = window.Core, st = C.STAGES[3];
      const h = st.hazards[0];
      const out = [];
      for (let s = 0; s <= h.s; s += 14) {
        const p = C.pointAt(st.path, s);
        out.push(window.__app.clientForRing(p.x, p.y));
      }
      const at = C.pointAt(st.path, h.s);
      return { trail: out, at: window.__app.clientForRing(at.x, at.y), period: h.period };
    });
    await phone.mouse.move(into.trail[0].x, into.trail[0].y);
    await phone.mouse.down();
    await walkTrail(phone, into.trail);
    await phone.mouse.move(into.at.x, into.at.y);
    // 1 周ぶん待てば棒は必ず通る。しっぱいは 1 秒で ready にもどるので、結果で見る
    let hitHaz = null;
    try {
      await phone.waitForFunction(() => window.__app.state().result !== null,
        { timeout: into.period + 3000 });
      hitHaz = await phone.evaluate(() => window.__app.state().result.kind);
    } catch (e) { hitHaz = 'やられなかった'; }
    await phone.mouse.up();
    ok(hitHaz === 'hazard', `可動部の前で止まっているとショート (${hitHaz})`);

    // ------------------------------------------------ ステージ一覧
    section('検査ライン');
    await phone.waitForTimeout(1100);
    await phone.locator('#btnStages').tap();
    await phone.waitForTimeout(200);
    const sheet = await phone.evaluate(() => ({
      open: !document.getElementById('sheetWrap').hidden,
      rows: document.querySelectorAll('#sheetBody .stage-row').length
    }));
    ok(sheet.open && sheet.rows === 6, `品番が 6 つならぶ (${sheet.rows})`);
    await phone.locator('#sheetBody [data-stage="2"]').tap();
    await phone.waitForTimeout(200);
    const picked = await phone.evaluate(() => ({
      closed: document.getElementById('sheetWrap').hidden,
      name: document.getElementById('stageName').textContent
    }));
    ok(picked.closed && picked.name.startsWith('IRB-03'), `えらんだ品番に切りかわる (${picked.name})`);

    // ------------------------------------------------ 続きから
    section('続きから');
    await phone.reload();
    await phone.waitForFunction(() => window.__app);
    const reloaded = await phone.evaluate(() => ({
      best: window.__app.save().best[window.Core.STAGES[0].id],
      unlocked: window.__app.save().unlocked
    }));
    ok(reloaded.best > 0 && reloaded.unlocked >= 2,
      `記録と、ひらいたステージが残る (ベスト ${Math.round(reloaded.best)}ms / ${reloaded.unlocked} ステージ)`);

    await phone.evaluate(() => localStorage.setItem(window.Core.SAVE_KEY, '{こわれ'));
    await phone.reload();
    await phone.waitForFunction(() => window.__app);
    ok(await phone.evaluate(() => window.__app.save().unlocked === 1),
      'セーブが壊れていても、新品として開ける');

    // ------------------------------------------------ 遅い端末
    section('遅い端末');
    await phone.evaluate(() => { window.__app.unlockAll(); window.__app.selectStage(5); });
    const cdp = await context.newCDPSession(phone);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await phone.waitForTimeout(400);
    const frames = await phone.evaluate(() => new Promise((res) => {
      const gaps = []; let last = performance.now(); let n = 0;
      const step = (t) => { gaps.push(t - last); last = t; if (++n < 80) requestAnimationFrame(step); else res(gaps.slice(12)); };
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
    if (!apple) skip('ホーム画面用のアイコンはまだ無い');
    else {
      ok(apple.endsWith('.png'), `ホーム画面用アイコンが PNG (${apple})`);  // iOS は SVG を使えない
      const res = await desk.request.get(URL + apple.replace('./', ''));
      ok(res.ok(), `${apple} が配信される`);
    }

    section('更新とオフライン');
    if (!fs.existsSync(path.join(ROOT, 'sw.js'))) skip('サービスワーカーはまだ無い (オフライン対応するときに用意する)');

    section('エラー');
    ok(errors.length === 0, errors.length ? '画面のエラー: ' + errors.join(' / ') : 'JS エラーなし');
  } finally {
    await browser.close();
    server.kill();
  }

  console.log(`\n${passed} 件合格 / ${failed} 件失敗`);
  process.exit(failed ? 1 : 0);
}

run().catch((err) => { console.error(err); process.exit(1); });
