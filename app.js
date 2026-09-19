/*!
 * app.js — 画面まわり。コースの絵、指の操作、音。
 *
 * 盤の座標 (640 x 960) だけで遊びを組み立て、画面の大きさへの変換は
 * SVG の viewBox にまかせる。どの端末でもコースの細さが同じになる。
 */
(function () {
  'use strict';

  const C = window.Core;

  /** 見える範囲。盤の下に、指を置くための帯を足しておく。
   *  そうしないと、コースの下のほうで「棒の持ち手が画面の外」になる。 */
  const VIEW = { w: C.BOARD.w, h: C.BOARD.h + C.STICK };

  const $ = (id) => document.getElementById(id);
  const els = {
    app: $('app'), board: $('board'), bg: $('bg'), gripZone: $('gripZone'),
    course: $('course'), hazards: $('hazards'), player: $('player'),
    stick: $('stick'), grip: $('grip'), ring: $('ring'), fx: $('fx'),
    stageName: $('stageName'), time: $('time'), best: $('best'),
    progressBar: $('progressBar'), overlay: $('overlay'),
    btnStages: $('btnStages'), btnSound: $('btnSound'),
    sheetWrap: $('sheetWrap'), sheetBack: $('sheetBack'), sheetBody: $('sheetBody'),
    sheetClose: $('sheetClose')
  };

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SVGNS = 'http://www.w3.org/2000/svg';
  const svgEl = (name, attrs) => {
    const e = document.createElementNS(SVGNS, name);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  };
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ------------------------------------------------------------ 画面と盤の行き来

  const svgPoint = els.board.createSVGPoint();

  function toBoard(clientX, clientY) {
    const m = els.board.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    svgPoint.x = clientX; svgPoint.y = clientY;
    const p = svgPoint.matrixTransform(m.inverse());
    return { x: p.x, y: p.y };
  }

  function toClient(bx, by) {
    const m = els.board.getScreenCTM();
    if (!m) return { x: 0, y: 0 };
    svgPoint.x = bx; svgPoint.y = by;
    const p = svgPoint.matrixTransform(m);
    return { x: p.x, y: p.y };   // SVGPoint のままだとテストへ渡せない
  }

  // ------------------------------------------------------------ 状態

  let save = null;

  const game = {
    index: 0,
    stage: C.STAGES[0],
    mode: 'ready',       // ready | run | fail | clear
    holding: false,
    pointerId: null,
    runStart: 0,
    runMs: 0,
    hazMs: 0,
    modeAt: 0,
    grip: { x: 0, y: 0 },
    ring: { x: 0, y: 0 },
    mood: 'normal',
    lastTime: '',
    lastBest: '',
    result: null
  };

  // ------------------------------------------------------------ 音

  let audio = null;
  let lastTick = 0;

  function ensureAudio() {
    if (audio || save.muted) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) audio = new Ctx();
    } catch (e) { audio = null; }
  }

  function beep(freq, dur, type, gain, delay) {
    if (!audio || save.muted) return;
    try {
      if (audio.state === 'suspended') audio.resume();
      const t = audio.currentTime + (delay || 0);
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.type = type || 'square';
      o.frequency.setValueAtTime(freq, t);
      o.connect(g); g.connect(audio.destination);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain || 0.1, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.start(t); o.stop(t + dur + 0.03);
    } catch (e) { /* 音が出なくても遊べる */ }
  }

  const sfx = {
    buzz: () => { beep(110, 0.42, 'sawtooth', 0.22); beep(82, 0.42, 'square', 0.14); },
    clear: () => { beep(660, 0.14, 'triangle', 0.14); beep(880, 0.14, 'triangle', 0.14, 0.12); beep(1175, 0.3, 'triangle', 0.14, 0.24); },
    go: () => beep(520, 0.09, 'triangle', 0.1),
    near: () => beep(1500, 0.035, 'square', 0.035)
  };

  // ------------------------------------------------------------ コースを描く

  function drawCourse() {
    const st = game.stage;
    const d = C.pathD(st.path);
    const pad = C.padRadius(st);
    const sp = C.startPoint(st), gp = C.goalPoint(st);

    /* 光・カベ・床 の 3 枚を重ねる。
       描く形は判定とまったく同じ「中心線 + 2 つの台」なので、
       見えているコースの中にいれば必ず安全、という関係がくずれない。 */
    const layer = (color, grow) =>
      '<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="' + (st.corridor * 2 + grow) +
      '" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<circle cx="' + sp.x + '" cy="' + sp.y + '" r="' + (pad + grow / 2) + '" fill="' + color + '"/>' +
      '<circle cx="' + gp.x + '" cy="' + gp.y + '" r="' + (pad + grow / 2) + '" fill="' + color + '"/>';

    els.course.innerHTML =
      layer('var(--wall-dim)', 26) +
      layer('var(--wall)', 12) +
      layer('var(--paper)', 0) +
      '<path class="dash" d="' + d + '"/>' +
      '<g><circle cx="' + sp.x + '" cy="' + sp.y + '" r="' + (pad - 10) + '" fill="none" stroke="var(--start)" stroke-width="5"/>' +
      '<text x="' + sp.x + '" y="' + (sp.y + 6) + '" text-anchor="middle" font-size="19" fill="#1c7a44">START</text></g>' +
      '<g><circle cx="' + gp.x + '" cy="' + gp.y + '" r="' + (pad - 10) + '" fill="none" stroke="#c98b00" stroke-width="5"/>' +
      '<text x="' + gp.x + '" y="' + (gp.y + 7) + '" text-anchor="middle" font-size="21" fill="#8a5c00">GOAL</text></g>';
  }

  // ------------------------------------------------------------ 邪魔ものを描く

  let hazEls = [];

  function buildHazards() {
    els.hazards.innerHTML = '';
    hazEls = game.stage.hazards.map((h) => {
      const g = svgEl('g');
      // 動く道すじを先に薄く描いておく。どこを通るか読めるようにするため
      if (h.type === 'slide') {
        g.appendChild(svgEl('line', {
          x1: h.ax, y1: h.ay, x2: h.bx, y2: h.by,
          stroke: 'rgba(255,210,63,.32)', 'stroke-width': 4, 'stroke-dasharray': '8 8', 'stroke-linecap': 'round'
        }));
      } else if (h.type === 'rotor') {
        g.appendChild(svgEl('circle', {
          cx: h.x, cy: h.y, r: h.arm, fill: 'none',
          stroke: 'rgba(255,210,63,.24)', 'stroke-width': 3, 'stroke-dasharray': '10 10'
        }));
      } else {
        g.appendChild(svgEl('circle', {
          cx: h.x, cy: h.y, r: h.max, fill: 'none',
          stroke: 'rgba(255,210,63,.24)', 'stroke-width': 3, 'stroke-dasharray': '10 10'
        }));
      }
      const back = svgEl('line', { class: 'haz-back' });
      const face = svgEl('line', { class: 'haz-face' });
      g.appendChild(back); g.appendChild(face);
      if (h.type === 'rotor') {
        g.appendChild(svgEl('circle', { cx: h.x, cy: h.y, r: h.bar + 7, fill: '#1a1428' }));
        g.appendChild(svgEl('circle', { cx: h.x, cy: h.y, r: h.bar + 2, fill: '#6b5f86' }));
      }
      els.hazards.appendChild(g);
      return { back: back, face: face, h: h };
    });
  }

  function drawHazards(ms) {
    for (const e of hazEls) {
      const s = C.hazardShape(e.h, ms);
      const x1 = s.x1.toFixed(1), y1 = s.y1.toFixed(1), x2 = s.x2.toFixed(1), y2 = s.y2.toFixed(1);
      e.back.setAttribute('x1', x1); e.back.setAttribute('y1', y1);
      e.back.setAttribute('x2', x2); e.back.setAttribute('y2', y2);
      e.back.setAttribute('stroke-width', (s.r * 2 + 9).toFixed(1));
      e.face.setAttribute('x1', x1); e.face.setAttribute('y1', y1);
      e.face.setAttribute('x2', x2); e.face.setAttribute('y2', y2);
      e.face.setAttribute('stroke-width', (s.r * 2).toFixed(1));
    }
  }

  // ------------------------------------------------------------ 輪っかのねこ

  const MOOD_COLOR = { normal: '#fff6e8', near: '#ffa94d', fail: '#ff3d71', clear: '#7ee7a8' };

  const MOOD_FACE = {
    normal: '<circle cx="-5" cy="-1" r="2.3" fill="#3a2f52"/><circle cx="5" cy="-1" r="2.3" fill="#3a2f52"/>' +
      '<path d="M0,3.4 q-2.4,2.4 -4.4,.2 M0,3.4 q2.4,2.4 4.4,.2" fill="none" stroke="#3a2f52" stroke-width="1.5" stroke-linecap="round"/>',
    near: '<circle cx="-5.2" cy="-1" r="3.1" fill="#3a2f52"/><circle cx="5.2" cy="-1" r="3.1" fill="#3a2f52"/>' +
      '<circle cx="-4.2" cy="-2" r="1" fill="#fff"/><circle cx="6.2" cy="-2" r="1" fill="#fff"/>' +
      '<ellipse cx="0" cy="4.6" rx="3.2" ry="2.4" fill="#3a2f52"/>' +
      '<path d="M10,-6 q2.6,3.4 0,5 q-2.6,-1.6 0,-5" fill="#7ec8ff"/>',
    fail: '<path d="M-7.4,-3.4 l4.8,4.8 M-2.6,-3.4 l-4.8,4.8 M2.6,-3.4 l4.8,4.8 M7.4,-3.4 l-4.8,4.8" ' +
      'fill="none" stroke="#3a2f52" stroke-width="1.9" stroke-linecap="round"/>' +
      '<ellipse cx="0" cy="5" rx="3.6" ry="2.8" fill="#3a2f52"/>',
    clear: '<path d="M-7.4,-1 q2.4,-3 4.8,0 M2.6,-1 q2.4,-3 4.8,0" fill="none" stroke="#3a2f52" stroke-width="1.9" stroke-linecap="round"/>' +
      '<path d="M-3.4,3.6 q3.4,3.4 6.8,0" fill="none" stroke="#3a2f52" stroke-width="1.6" stroke-linecap="round"/>'
  };

  function setMood(mood) {
    if (game.mood === mood && els.ring.childNodes.length) return;
    game.mood = mood;
    const col = MOOD_COLOR[mood];
    const R = C.RING_R;
    // コースの床がクリーム色なので、まわりを濃い色で縁取らないと輪っかが消える
    els.ring.innerHTML =
      '<path d="M-12,-11 L-15.5,-19 L-6,-14.5 Z" fill="' + col + '" stroke="#231a35" stroke-width="3" stroke-linejoin="round"/>' +
      '<path d="M12,-11 L15.5,-19 L6,-14.5 Z" fill="' + col + '" stroke="#231a35" stroke-width="3" stroke-linejoin="round"/>' +
      '<circle r="' + (R - 1) + '" fill="#fffaf2" stroke="#231a35" stroke-width="7"/>' +
      '<circle r="' + (R - 3.4) + '" fill="none" stroke="' + col + '" stroke-width="4.4"/>' +
      '<ellipse cx="-9.4" cy="3.2" rx="3" ry="2" fill="#ff9dbb"/>' +
      '<ellipse cx="9.4" cy="3.2" rx="3" ry="2" fill="#ff9dbb"/>' +
      MOOD_FACE[mood];
  }

  function drawPlayer() {
    const r = game.ring, g = game.grip;
    els.ring.setAttribute('transform', 'translate(' + r.x.toFixed(1) + ' ' + r.y.toFixed(1) + ')');
    els.stick.setAttribute('x1', g.x.toFixed(1)); els.stick.setAttribute('y1', g.y.toFixed(1));
    els.stick.setAttribute('x2', r.x.toFixed(1)); els.stick.setAttribute('y2', r.y.toFixed(1));
    els.grip.setAttribute('transform', 'translate(' + g.x.toFixed(1) + ' ' + g.y.toFixed(1) + ')');
  }

  function buildPlayerParts() {
    els.grip.innerHTML =
      '<circle r="17" fill="rgba(0,0,0,.3)"/>' +
      '<circle r="14" fill="#7a5230" stroke="#e0a869" stroke-width="3"/>' +
      '<circle r="5" fill="rgba(255,255,255,.25)"/>';
    setMood('normal');
  }

  // ------------------------------------------------------------ 進行

  function setRingFromGrip(b) {
    game.grip.x = b.x;
    game.grip.y = b.y;
    game.ring.x = b.x;
    game.ring.y = b.y - C.STICK;
  }

  /** 1 回の指の動きが大きくても、途中を飛ばさないだけの細かさ。 */
  const SWEEP_STEP = 7;

  /**
   * 輪っかを動かす。前の場所から新しい場所までを細かく分けて、
   * 途中もぜんぶ調べる。
   *
   * ここを点だけで見ていると、指をすばやく払ったときに
   * コマとコマのあいだでカベをまたいでしまい、すり抜けて通れてしまう。
   */
  function sweepTo(nx, ny) {
    const st = game.stage;
    const px = game.ring.x, py = game.ring.y;
    const dx = nx - px, dy = ny - py;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / SWEEP_STEP));
    for (let i = 1; i <= steps; i++) {
      game.ring.x = px + dx * i / steps;
      game.ring.y = py + dy * i / steps;
      const p = C.probe(st, game.ring.x, game.ring.y, game.hazMs);
      if (p.hit) { drawPlayer(); fail(p.hit); return; }
      if (C.inGoal(st, game.ring.x, game.ring.y)) { drawPlayer(); clearStage(); return; }
    }
  }

  function placeAtStart() {
    const sp = C.startPoint(game.stage);
    game.ring.x = sp.x; game.ring.y = sp.y;
    game.grip.x = sp.x; game.grip.y = sp.y + C.STICK;
    drawPlayer();
  }

  function setMode(mode) {
    game.mode = mode;
    game.modeAt = performance.now();
    els.app.dataset.mode = mode;
    renderOverlay();
  }

  function selectStage(index) {
    game.index = C.clamp(index, 0, C.STAGES.length - 1);
    game.stage = C.STAGES[game.index];
    game.holding = false;
    game.pointerId = null;
    game.runMs = 0;
    game.hazMs = 0;
    game.result = null;
    drawCourse();
    buildHazards();
    drawHazards(0);
    placeAtStart();
    setMood('normal');
    setMode('ready');
    updateHud(true);
    setProgress(0);
  }

  function startRun() {
    game.runStart = performance.now();
    game.runMs = 0;
    game.hazMs = 0;
    C.recordTry(save);
    persist();
    setMode('run');
    sfx.go();
  }

  function fail(kind) {
    if (game.mode !== 'run') return;
    game.holding = false;
    game.pointerId = null;
    game.result = { kind: kind, ms: game.runMs };
    setMood('fail');
    setMode('fail');
    sfx.buzz();
    zap(game.ring.x, game.ring.y);
    flash();
    shake();
  }

  function clearStage() {
    if (game.mode !== 'run') return;
    game.holding = false;
    game.pointerId = null;
    const ms = game.runMs;
    const rec = C.recordClear(save, game.stage.id, ms);
    persist();
    game.result = { kind: 'clear', ms: ms, best: rec.best, prev: rec.prev };
    setMood('clear');
    setMode('clear');
    setProgress(1);
    sfx.clear();
    confetti();
  }

  function tickRun() {
    const st = game.stage;
    const p = C.probe(st, game.ring.x, game.ring.y, game.hazMs);
    setProgress(p.progress);
    if (p.hit) { fail(p.hit); return; }
    if (C.inGoal(st, game.ring.x, game.ring.y)) { clearStage(); return; }

    if (p.margin < C.NEAR) {
      setMood('near');
      const now = performance.now();
      if (now - lastTick > 110) { lastTick = now; sfx.near(); }
    } else {
      setMood('normal');
    }
  }

  // ------------------------------------------------------------ 演出

  function zap(x, y) {
    const g = svgEl('g', { transform: 'translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ')' });
    g.innerHTML = '<g><circle r="30" fill="none" stroke="var(--wall)" stroke-width="6"/>' +
      '<text x="0" y="12" text-anchor="middle" font-size="40">⚡</text></g>';
    els.fx.appendChild(g);
    const a = g.firstChild.animate(
      [{ transform: 'scale(.4)', opacity: 1 }, { transform: 'scale(1.7)', opacity: 0 }],
      { duration: reduceMotion ? 1 : 620, easing: 'ease-out' });
    a.onfinish = () => g.remove();
  }

  function flash() {
    const r = svgEl('rect', { x: 0, y: 0, width: VIEW.w, height: VIEW.h, fill: 'var(--wall)' });
    els.fx.appendChild(r);
    const a = r.animate([{ opacity: .45 }, { opacity: 0 }], { duration: reduceMotion ? 1 : 420 });
    a.onfinish = () => r.remove();
  }

  function shake() {
    if (reduceMotion) return;
    els.board.animate([
      { transform: 'translate(0,0)' }, { transform: 'translate(7px,-4px)' },
      { transform: 'translate(-6px,4px)' }, { transform: 'translate(4px,3px)' },
      { transform: 'translate(0,0)' }
    ], { duration: 320, easing: 'ease-out' });
  }

  function confetti() {
    if (reduceMotion) return;
    const gp = C.goalPoint(game.stage);
    const colors = ['#ffd23f', '#7ee7a8', '#ff8fb1', '#7ec8ff', '#fff6e8'];
    for (let i = 0; i < 16; i++) {
      const g = svgEl('g', { transform: 'translate(' + gp.x + ' ' + gp.y + ')' });
      g.innerHTML = '<rect x="-5" y="-5" width="10" height="10" rx="2" fill="' + colors[i % colors.length] + '"/>';
      els.fx.appendChild(g);
      const a = Math.random() * Math.PI * 2;
      const d = 70 + Math.random() * 120;
      const anim = g.firstChild.animate([
        { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
        { transform: 'translate(' + (Math.cos(a) * d).toFixed(0) + 'px,' + (Math.sin(a) * d + 60).toFixed(0) + 'px) rotate(540deg)', opacity: 0 }
      ], { duration: 900 + Math.random() * 400, easing: 'cubic-bezier(.2,.7,.4,1)' });
      anim.onfinish = () => g.remove();
    }
  }

  // ------------------------------------------------------------ 上のバーとお知らせ

  function setProgress(v) {
    els.progressBar.style.width = (C.clamp(v, 0, 1) * 100).toFixed(1) + '%';
  }

  function updateHud(force) {
    const t = C.formatTime(game.mode === 'run' ? game.runMs : (game.result ? game.result.ms : 0));
    if (force || t !== game.lastTime) { game.lastTime = t; els.time.textContent = t; }
    const b = save.best[game.stage.id];
    const bt = b === undefined ? '--.--' : C.formatTime(b);
    if (force || bt !== game.lastBest) { game.lastBest = bt; els.best.textContent = bt; }
    if (force) {
      els.stageName.textContent = (game.index + 1) + '. ' + game.stage.name;
      els.btnSound.textContent = save.muted ? '🔇' : '🔊';
      els.btnSound.setAttribute('aria-pressed', String(!!save.muted));
    }
  }

  const FAIL_TEXT = {
    wall: 'カベにあたった！',
    hazard: 'じゃまものにあたった！',
    release: '指をはなした！'
  };

  function renderOverlay() {
    els.overlay.classList.toggle('bottom', game.mode === 'ready');
    if (game.mode === 'ready') {
      els.overlay.innerHTML = '<div class="hint">' +
        (game.holding ? '🟢 START の輪に入れるとスタート' : '指で棒を持って、START に輪っかをのせよう') +
        '</div>';
      return;
    }
    if (game.mode === 'run') { els.overlay.innerHTML = ''; return; }
    if (game.mode === 'fail') {
      els.overlay.innerHTML = '<div class="panel"><div class="emoji">⚡🐱</div>' +
        '<h2>ビリビリ！</h2><p>' + esc(FAIL_TEXT[game.result.kind] || 'しっぱい') + '</p></div>';
      return;
    }
    // clear
    const r = game.result;
    const next = game.index + 1;
    const hasNext = next < C.STAGES.length;
    els.overlay.innerHTML = '<div class="panel">' +
      '<div class="emoji">🎉🐱</div><h2>ゴール！</h2>' +
      '<div class="big">' + C.formatTime(r.ms) + '</div>' +
      '<p>' + (r.best ? (r.prev === undefined ? 'はじめてのクリア！' : '自己ベスト更新！ まえは ' + C.formatTime(r.prev))
        : 'ベストは ' + C.formatTime(save.best[game.stage.id])) + '</p>' +
      '<div class="btn-row">' +
      (hasNext ? '<button type="button" class="btn" data-next="1">つぎへ ▶</button>' : '') +
      '<button type="button" class="btn alt" data-again="1">もういちど</button>' +
      '</div>' +
      (hasNext ? '' : '<p>ぜんぶクリア！ おつかれさま 🏆</p>') +
      '</div>';
  }

  function hint(text) {
    els.overlay.classList.add('bottom');
    els.overlay.innerHTML = '<div class="hint">' + esc(text) + '</div>';
    clearTimeout(hint.timer);
    hint.timer = setTimeout(renderOverlay, 1500);
  }

  // ------------------------------------------------------------ ステージ一覧

  function openSheet() {
    els.sheetWrap.hidden = false;
    els.sheetBody.innerHTML = C.STAGES.map((st, i) => {
      const open = C.isUnlocked(save, i);
      const b = save.best[st.id];
      return '<button type="button" class="stage-row" data-stage="' + i + '"' +
        (open ? '' : ' disabled') + ' aria-current="' + (i === game.index) + '">' +
        '<span class="no">' + (open ? (i + 1) : '🔒') + '</span>' +
        '<span class="nm">' + esc(st.name) +
        '<span class="sub">' + (open ? 'コースのはば ' + (st.corridor * 2) + ' ・ じゃまもの ' + st.hazards.length : 'まえのステージをクリアすると出る') + '</span></span>' +
        '<span class="rec">' + (b === undefined ? '' : '★ ' + C.formatTime(b)) + '</span>' +
        '</button>';
    }).join('') +
      '<p class="note">クリアすると次のステージがひらく。じゃまものの動きは毎回おなじなので、覚えれば必ず通れる。</p>';
  }
  function closeSheet() { els.sheetWrap.hidden = true; }

  // ------------------------------------------------------------ 指の操作

  function onDown(e) {
    ensureAudio();
    if (game.mode === 'clear' || game.mode === 'fail') return;
    if (game.holding) return;
    game.holding = true;
    game.pointerId = e.pointerId;
    try { els.board.setPointerCapture(e.pointerId); } catch (err) { /* 拾えなくても続く */ }
    setRingFromGrip(toBoard(e.clientX, e.clientY));
    drawPlayer();
    if (game.mode === 'ready') {
      if (C.inStart(game.stage, game.ring.x, game.ring.y)) startRun();
      else renderOverlay();
    }
  }

  function onMove(e) {
    if (!game.holding || e.pointerId !== game.pointerId) return;
    const b = toBoard(e.clientX, e.clientY);
    game.grip.x = b.x;
    game.grip.y = b.y;
    if (game.mode === 'run') {
      sweepTo(b.x, b.y - C.STICK);
    } else {
      game.ring.x = b.x;
      game.ring.y = b.y - C.STICK;
    }
    drawPlayer();
    // まだ走り出していなければ、START に入った瞬間に始まる
    if (game.mode === 'ready' && C.inStart(game.stage, game.ring.x, game.ring.y)) startRun();
  }

  function onUp(e) {
    if (!game.holding || e.pointerId !== game.pointerId) return;
    if (game.mode === 'run') { fail('release'); return; }
    game.holding = false;
    game.pointerId = null;
    placeAtStart();
    renderOverlay();
  }

  // ------------------------------------------------------------ 保存

  function persist() {
    try { localStorage.setItem(C.SAVE_KEY, C.serialize(save)); } catch (e) { /* 入らなくても遊べる */ }
  }

  function load() {
    let text = null;
    try { text = localStorage.getItem(C.SAVE_KEY); } catch (e) { text = null; }
    return text ? C.deserialize(text) : C.newSave();
  }

  // ------------------------------------------------------------ まわす

  function frame(now) {
    requestAnimationFrame(frame);

    if (game.mode === 'run') {
      game.runMs = now - game.runStart;
      game.hazMs = game.runMs;
    } else if (game.mode === 'ready') {
      game.hazMs = now - game.modeAt;      // 待っているあいだも動かして、型を見せる
    }
    drawHazards(game.hazMs);

    if (game.mode === 'run') tickRun();

    // しっぱいから 1 秒たったら、すぐやり直せる状態にもどす
    if (game.mode === 'fail' && now - game.modeAt > 1000) {
      setMood('normal');
      placeAtStart();
      setProgress(0);
      setMode('ready');
    }
    updateHud(false);
  }

  function main() {
    save = load();

    els.board.setAttribute('viewBox', '0 0 ' + VIEW.w + ' ' + VIEW.h);
    els.board.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    els.gripZone.innerHTML =
      '<line x1="24" y1="' + C.BOARD.h + '" x2="' + (VIEW.w - 24) + '" y2="' + C.BOARD.h +
      '" stroke="rgba(255,255,255,.1)" stroke-width="3" stroke-dasharray="12 12"/>' +
      '<text x="' + (VIEW.w / 2) + '" y="' + (C.BOARD.h + 58) + '" text-anchor="middle" font-size="22" ' +
      'fill="rgba(255,255,255,.22)">ここは指を置くところ</text>';

    buildPlayerParts();
    // 記録がいちばん進んでいる所から始める
    selectStage(Math.min(save.unlocked - 1, C.STAGES.length - 1));

    els.board.addEventListener('pointerdown', onDown);
    els.board.addEventListener('pointermove', onMove);
    els.board.addEventListener('pointerup', onUp);
    els.board.addEventListener('pointercancel', onUp);

    els.overlay.addEventListener('click', (e) => {
      if (e.target.closest('[data-next]')) { selectStage(game.index + 1); return; }
      if (e.target.closest('[data-again]')) { selectStage(game.index); return; }
    });

    els.btnStages.addEventListener('click', openSheet);
    els.sheetClose.addEventListener('click', closeSheet);
    els.sheetBack.addEventListener('click', closeSheet);
    els.sheetBody.addEventListener('click', (e) => {
      const row = e.target.closest('[data-stage]');
      if (!row || row.disabled) return;
      closeSheet();
      selectStage(Number(row.dataset.stage));
    });
    els.btnSound.addEventListener('click', () => {
      save.muted = !save.muted;
      persist();
      updateHud(true);
      if (!save.muted) { ensureAudio(); sfx.go(); }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden && game.mode === 'run') fail('release');
    });

    requestAnimationFrame(frame);

    // 自動テストから中身をのぞくための入口
    window.__app = {
      core: C,
      view: VIEW,
      state: () => game,
      save: () => save,
      mode: () => game.mode,
      ring: () => ({ x: game.ring.x, y: game.ring.y }),
      selectStage: selectStage,
      openSheet: openSheet,
      closeSheet: closeSheet,
      /** 盤の座標 → 画面の座標 */
      toClient: toClient,
      /** 輪っかをこの盤座標に置きたいとき、指はどこを押せばいいか */
      clientForRing: (bx, by) => toClient(bx, by + C.STICK),
      unlockAll: () => { save.unlocked = C.STAGES.length; persist(); },
      wipe: () => { try { localStorage.removeItem(C.SAVE_KEY); } catch (e) { /* 消せなくても続く */ } }
    };
  }

  main();
})();
