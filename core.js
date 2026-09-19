/*!
 * core.js — イライラ棒のロジック。DOM を一切触らないので node でテストできる。
 *
 * ★ この game のいちばん大事な決めごと
 *   コースは「1 本の折れ線 (path) を太らせたもの」として定義する。
 *   - 壁の判定 = 折れ線までの距離がコース半径をこえたか、それだけ
 *   - 中心線をたどれば必ずゴールに着く (行き止まりを作れない)
 *   絵と判定が同じ 1 本の折れ線から出るので、見た目と当たりがズレようがない。
 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = factory();
  } else {
    root.Core = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // ------------------------------------------------------------ 決めごと

  const SAVE_KEY = 'irairabou.save.v1';
  const SAVE_VERSION = 1;

  /** 盤面の広さ。画面の大きさが変わっても、ここは変わらない。
   *  遊びやすさ (コースの細さ・棒の長さ) が端末でブレないようにするため。 */
  const BOARD = { w: 640, h: 960 };

  /** 輪っかの半径。当たり判定はこの円ちょうど。絵もこの円で描く。 */
  const RING_R = 22;

  /** 指から輪っかまでの棒の長さ。指で輪っかが隠れないように持ち上げる。 */
  const STICK = 96;

  /** 「もう少しで壁」の合図を出す余裕。 */
  const NEAR = 13;

  /** 1 つの邪魔ものがふさいでよい長さの上限。
   *  これをこえるものは、コースの別の場所まで巻きこんでいるので置かない。 */
  const MAX_ZONE = 340;

  const TAU = Math.PI * 2;

  // ------------------------------------------------------------ コース

  /*
   * 1 ステージ = 工場が作っている「イライラ棒ユニット」1 台。
   * それを検査ラインで通すのが遊びになっている。
   *
   * model   : 品番
   * path    : 中心線。ここを太らせたものがコース
   * corridor: コースの半径 (太さの半分)。小さいほど細い
   * hazards : 動く邪魔もの。型と「どちら側か (side)」「周期」だけを書く。
   *           置き場所と大きさは、コースの形から自動で決まる
   *           (buildStages が、置ける場所をならべて均等に配る)。
   *           そうすると「必ずコースに絡む」「必ず通れる瞬間がある」が
   *           作りの側で保証される (手で座標を置くと、どちらも簡単に壊れる)。
   *   slide … コースを横切って往復する棒。外に出ているあいだが通しどころ
   *   rotor … 支点をコースの外に置いて回る腕。腕が向こうを向くまで待つ
   *   pulse … 壁からふくらんでくる玉。縮んだときに通る
   */
  const STAGES = [
    {
      id: 's1', model: 'IRB-01', name: '試作ゼロ号', corridor: 58,
      path: [[110, 130], [110, 330], [325, 330], [325, 545], [530, 545], [530, 790], [300, 790], [300, 860]],
      hazards: []
    },
    {
      id: 's2', model: 'IRB-02', name: '量産 A 型', corridor: 50,
      path: [[105, 120], [105, 340], [300, 420], [300, 620], [520, 620], [520, 280], [430, 200], [430, 110]],
      hazards: [
        { type: 'slide', side: 1, period: 2000, phase: 0 }
      ]
    },
    {
      id: 's3', model: 'IRB-03', name: 'うずまき型', corridor: 46,
      path: [[100, 120], [100, 360], [280, 360], [280, 140], [455, 140], [455, 420], [300, 560], [300, 800], [545, 800], [545, 620]],
      hazards: [
        { type: 'rotor', side: 1, period: 2600, phase: 0 },
        { type: 'pulse', side: -1, period: 1900, phase: .3 }
      ]
    },
    {
      id: 's4', model: 'IRB-04', name: 'ジグザグ型', corridor: 42,
      path: [[95, 110], [95, 300], [235, 400], [95, 500], [95, 700], [300, 780], [500, 700], [500, 420], [560, 330], [560, 120]],
      hazards: [
        { type: 'slide', side: 1, period: 1700, phase: 0 },
        { type: 'rotor', side: -1, period: 2300, phase: .5 },
        { type: 'pulse', side: 1, period: 1600, phase: .15 }
      ]
    },
    {
      id: 's5', model: 'IRB-05', name: 'ロング型', corridor: 40,
      path: [[90, 110], [90, 340], [255, 340], [255, 130], [420, 130], [420, 360], [255, 480], [255, 700], [90, 700], [90, 870], [400, 870], [555, 760], [555, 230]],
      hazards: [
        { type: 'rotor', side: 1, period: 2100, phase: 0 },
        { type: 'slide', side: 1, period: 1500, phase: .25 },
        { type: 'pulse', side: -1, period: 1500, phase: .5 },
        { type: 'slide', side: -1, period: 1800, phase: .6 }
      ]
    },
    {
      id: 's6', model: 'IRB-06', name: '鬼仕様', corridor: 36,
      path: [[85, 110], [85, 290], [215, 380], [85, 470], [85, 660], [230, 745], [230, 880], [430, 880], [430, 650], [300, 560], [430, 470], [430, 250], [548, 170], [548, 100]],
      hazards: [
        { type: 'slide', side: 1, period: 1400, phase: 0 },
        { type: 'pulse', side: -1, period: 1300, phase: .35 },
        { type: 'rotor', side: 1, period: 1900, phase: .5 },
        { type: 'slide', side: -1, period: 1600, phase: .15 }
      ]
    }
  ];

  // ------------------------------------------------------------ 幾何

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  /** 点と線分の距離。t は線分上のどこがいちばん近いか (0〜1)。 */
  function segDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
    t = clamp(t, 0, 1);
    const cx = ax + dx * t, cy = ay + dy * t;
    return { d: Math.hypot(px - cx, py - cy), t: t, x: cx, y: cy };
  }

  /** 2 つの線分が交わっているか。 */
  function segCross(a, b, c, d) {
    const cr = (ox, oy, px, py, qx, qy) => (px - ox) * (qy - oy) - (py - oy) * (qx - ox);
    const d1 = cr(c[0], c[1], d[0], d[1], a[0], a[1]);
    const d2 = cr(c[0], c[1], d[0], d[1], b[0], b[1]);
    const d3 = cr(a[0], a[1], b[0], b[1], c[0], c[1]);
    const d4 = cr(a[0], a[1], b[0], b[1], d[0], d[1]);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
  }

  /** 線分どうしの最短距離。コースが自分自身とくっついていないか調べるのに使う。 */
  function segSegDist(a, b, c, d) {
    if (segCross(a, b, c, d)) return 0;
    let best = Math.min(
      segDist(a[0], a[1], c[0], c[1], d[0], d[1]).d,
      segDist(b[0], b[1], c[0], c[1], d[0], d[1]).d,
      segDist(c[0], c[1], a[0], a[1], b[0], b[1]).d,
      segDist(d[0], d[1], a[0], a[1], b[0], b[1]).d
    );
    return best;
  }

  function pathSegments(path) {
    const out = [];
    for (let i = 0; i + 1 < path.length; i++) out.push([path[i], path[i + 1]]);
    return out;
  }

  function pathLength(path) {
    let sum = 0;
    for (let i = 0; i + 1 < path.length; i++) {
      sum += Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]);
    }
    return sum;
  }

  /** 中心線までの距離と、そこまで進んだ長さ。 */
  function nearestOnPath(path, x, y) {
    let best = { d: Infinity, s: 0, x: path[0][0], y: path[0][1] };
    let acc = 0;
    for (let i = 0; i + 1 < path.length; i++) {
      const a = path[i], b = path[i + 1];
      const seg = segDist(x, y, a[0], a[1], b[0], b[1]);
      const segLen = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (seg.d < best.d) best = { d: seg.d, s: acc + segLen * seg.t, x: seg.x, y: seg.y };
      acc += segLen;
    }
    return best;
  }

  /** 中心線を s だけ進んだ所。 */
  function pointAt(path, s) {
    let acc = 0;
    for (let i = 0; i + 1 < path.length; i++) {
      const a = path[i], b = path[i + 1];
      const segLen = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (acc + segLen >= s || i === path.length - 2) {
        const t = segLen > 0 ? clamp((s - acc) / segLen, 0, 1) : 0;
        return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t };
      }
      acc += segLen;
    }
    return { x: path[0][0], y: path[0][1] };
  }

  /** 中心線を s 進んだ所の進行方向 (長さ 1)。 */
  function tangentAt(path, s) {
    let acc = 0;
    for (let i = 0; i + 1 < path.length; i++) {
      const a = path[i], b = path[i + 1];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      if (acc + len >= s || i === path.length - 2) return { x: (b[0] - a[0]) / len, y: (b[1] - a[1]) / len };
      acc += len;
    }
    return { x: 1, y: 0 };
  }

  // ------------------------------------------------------------ 邪魔もの

  /**
   * 「コースのどこに置くか」から、邪魔ものの実際の形を作る。
   *
   * どの型も、中心線に立っている輪っかとの余裕がプラスになる瞬間を必ず持つ。
   * だから「待てば通れる」ことが、数字を手で置かなくても保証される。
   */
  /**
   * ある時刻の邪魔ものの形。ぜんぶ「線分 + 太さ」(カプセル) で表す。
   * 形が 1 種類なので、当たり判定も描画も 1 つで足りる。
   */
  function hazardShape(h, ms) {
    const u = ((ms / h.period) + (h.phase || 0)) % 1;
    if (h.type === 'rotor') {
      const a = TAU * u * (h.dir || 1);
      return { x1: h.x, y1: h.y, x2: h.x + Math.cos(a) * h.arm, y2: h.y + Math.sin(a) * h.arm, r: h.bar };
    }
    if (h.type === 'slide') {
      const k = (1 - Math.cos(TAU * u)) / 2;         // 0→1→0 のなめらかな往復
      const cx = h.ax + (h.bx - h.ax) * k;
      const cy = h.ay + (h.by - h.ay) * k;
      const dx = h.bx - h.ax, dy = h.by - h.ay;
      const len = Math.hypot(dx, dy) || 1;
      const px = -dy / len, py = dx / len;           // 進む向きと直角に棒を置く
      const half = h.len / 2;
      return { x1: cx - px * half, y1: cy - py * half, x2: cx + px * half, y2: cy + py * half, r: h.bar };
    }
    // pulse: ふくらむ玉 (長さ 0 のカプセル)
    const k = (1 - Math.cos(TAU * u)) / 2;
    return { x1: h.x, y1: h.y, x2: h.x, y2: h.y, r: h.min + (h.max - h.min) * k };
  }

  /** 邪魔ものまでの余裕。マイナスなら当たっている。 */
  function hazardMargin(stage, x, y, ms, ringR) {
    const r = ringR === undefined ? RING_R : ringR;
    let best = Infinity;
    for (const h of stage.hazards) {
      const s = hazardShape(h, ms);
      const d = segDist(x, y, s.x1, s.y1, s.x2, s.y2).d;
      best = Math.min(best, d - s.r - r);
    }
    return best;
  }

  function buildHazard(stage, spec, s) {
    const R = stage.corridor;
    const bar = spec.bar || Math.max(9, Math.round(R * 0.3));
    const p = pointAt(stage.path, s);
    const d = tangentAt(stage.path, s);
    const period = spec.period || 1800;
    const phase = spec.phase || 0;

    // どちら側に出すか。盤からはみ出す側なら、反対側に置きかえる
    const reach = R + bar + RING_R + 30;
    let side = spec.side || 1;
    const out = (k) => ({ x: p.x - d.y * side * k, y: p.y + d.x * side * k });
    const far = out(reach);
    if (far.x < 8 || far.x > BOARD.w - 8 || far.y < 8 || far.y > BOARD.h - 8) side = -side;
    const nx = -d.y * side;
    const ny = d.x * side;

    if (spec.type === 'slide') {
      // 外に出た端では、中心線までの余裕が R + 16 残る = 必ず通れる
      const span = R + bar + RING_R + 16;
      return {
        type: 'slide', s: s, ax: p.x, ay: p.y, bx: p.x + nx * span, by: p.y + ny * span,
        len: spec.len || Math.round(R * 2.4), bar: bar, period: period, phase: phase
      };
    }
    if (spec.type === 'rotor') {
      // 支点はコースの外。中心線までの余裕が R + 12 あるので、支点は当たらない
      const dist = R + bar + RING_R + 12;
      return {
        type: 'rotor', s: s, x: p.x + nx * dist, y: p.y + ny * dist,
        arm: Math.round(dist + R * 0.7), bar: bar, period: period, phase: phase, dir: spec.dir || 1
      };
    }

    /*
     * pulse: 壁ぎわからふくらんでくる玉。
     * 大きさは手で決めず、「どれだけふさぎ、どれだけ空けるか」から逆算する。
     *   ふくらみきったとき … 中心線を 20 ぶんふさぐ
     *   縮んだとき        … 中心線に 14 ぶんの余裕を残す
     * こうすると「通れる時間の長さ」と「ふさぐ長さ」の釣り合いが、
     * コースの太さが変わっても崩れない。
     */
    const offset = R + 10;
    const max = offset - RING_R + 20;
    const min = Math.max(4, offset - RING_R - 14);
    return {
      type: 'pulse', s: s, x: p.x + nx * offset, y: p.y + ny * offset,
      min: min, max: max, bar: 0, period: period, phase: phase
    };
  }

  /**
   * 邪魔ものを置ける場所を、コースの上から全部ならべる。
   *
   * - 曲がり角から clear 以上はなれている (角のそばに置くと、角の内側と外側を
   *   同時にふさいでしまい、どうやっても通れないコースになる)
   * - スタート台・ゴール台から endClear 以上はなれている
   *
   * 置き場所を「探して選ぶ」のではなく「ならべて配る」ので、
   * 手で座標を書かずに済み、邪魔ものどうしが重なることもない。
   */
  function hazardWindows(path, clear, endClear) {
    const segs = [];
    let acc = 0;
    for (let i = 0; i + 1 < path.length; i++) {
      const len = Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]);
      segs.push({ start: acc, len: len });
      acc += len;
    }
    const total = acc;
    const out = [];
    for (const seg of segs) {
      if (seg.len < clear * 2 + 16) continue;
      const lo = Math.max(seg.start + clear, endClear);
      const hi = Math.min(seg.start + seg.len - clear, total - endClear);
      if (hi < lo) continue;
      out.push((lo + hi) / 2);
    }
    return out;
  }

  /** そのステージで、邪魔ものを置ける場所と、その条件。 */
  function stageWindows(stage) {
    const R = stage.corridor;
    const bar = Math.max(9, Math.round(R * 0.3));
    return {
      bar: bar,
      clear: R + bar + RING_R + 12,
      endClear: Math.round(R * 2.4 + bar * 2 + 86),
      list: hazardWindows(stage.path, R + bar + RING_R + 12, Math.round(R * 2.4 + bar * 2 + 86))
    };
  }

  /** 邪魔ものが、いちばん近い曲がり角からどれだけ離れているか。 */
  function cornerGap(stage, h) {
    const path = stage.path;
    let acc = 0, best = Infinity;
    for (let i = 0; i < path.length; i++) {
      if (i > 0) acc += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
      if (i === 0 || i === path.length - 1) continue;   // 端はスタート・ゴール
      best = Math.min(best, Math.abs(h.s - acc));
    }
    return best;
  }

  /**
   * ステージの邪魔ものを組み立てる。
   * 置ける場所をならべて、そこへ端から端まで均等に配る。
   */
  /** 動いているあいだ、ずっと盤の中に収まっているか。 */
  function hazardFits(h) {
    const m = 4;
    for (let ms = 0; ms < h.period; ms += 40) {
      const sh = hazardShape(h, ms);
      for (const p of [[sh.x1, sh.y1], [sh.x2, sh.y2]]) {
        if (p[0] - sh.r < m || p[0] + sh.r > BOARD.w - m) return false;
        if (p[1] - sh.r < m || p[1] + sh.r > BOARD.h - m) return false;
      }
    }
    return true;
  }

  /**
   * 置いた邪魔ものが「いつか」中心線をふさぐ範囲 (進んだ長さで [lo, hi])。
   * この範囲が他の邪魔ものとかぶらなければ、どの一点も狙ってくるのは 1 つだけになる。
   */
  function blockedRange(stage, h) {
    const total = pathLength(stage.path);
    const r = RING_R + 6;
    let lo = Infinity, hi = -Infinity;
    for (let ms = 0; ms < h.period; ms += 40) {
      const sh = hazardShape(h, ms);
      for (let s = 0; s <= total; s += 12) {
        const p = pointAt(stage.path, s);
        if (segDist(p.x, p.y, sh.x1, sh.y1, sh.x2, sh.y2).d - sh.r - r < 0) {
          if (s < lo) lo = s;
          if (s > hi) hi = s;
        }
      }
    }
    return lo <= hi ? { lo: lo, hi: hi } : null;
  }

  function buildStages() {
    for (const st of STAGES) {
      const specs = st.specs || st.hazards;
      st.specs = specs;
      const win = stageWindows(st);
      st.windows = win.list;
      st.hazards = [];

      const taken = {};
      const zones = [];
      const m = win.list.length;

      let minIdx = 0;
      for (let i = 0; i < specs.length; i++) {
        const spec = specs[i];
        // 置きたいのは「端から端まで均等」な位置。そこから近い順にためす。
        // 前の邪魔ものより手前には戻さない (コースの順番を保つ)
        const want = m === 0 ? 0
          : (specs.length === 1 ? Math.floor(m / 2) : Math.round(i * (m - 1) / (specs.length - 1)));
        const order = [];
        for (let k = minIdx; k < m; k++) order.push(k);
        order.sort((a2, b2) => Math.abs(a2 - want) - Math.abs(b2 - want) || a2 - b2);

        let placed = null;
        let placedIdx = -1;
        for (const k of order) {
          if (taken[k]) continue;
          // 左右どちらに出すかは、巻きこむ範囲がせまいほうを選ぶ
          let bestH = null;
          for (const sd of [spec.side || 1, -(spec.side || 1)]) {
            const h = buildHazard(st, { type: spec.type, side: sd, period: spec.period, phase: spec.phase, bar: spec.bar, len: spec.len, dir: spec.dir }, win.list[k]);
            if (!hazardFits(h)) continue;         // 盤からはみ出す置き方はしない
            const z = blockedRange(st, h);
            if (!z) continue;                     // コースに絡まないなら置く意味がない
            // ふさぐ範囲が広すぎる = コースの別の場所まで巻きこんでいる
            if (z.hi - z.lo > MAX_ZONE) continue;
            // ★ ふさぐ範囲が他とかぶらないこと。
            //   どの一点も、同時に 2 つからは狙われない → 1 つずつ待てば必ず抜けられる
            let clash = false;
            for (const u of zones) {
              if (z.lo <= u.hi + 24 && u.lo <= z.hi + 24) { clash = true; break; }
            }
            if (clash) continue;
            h.zone = z;
            if (!bestH || (z.hi - z.lo) < (bestH.zone.hi - bestH.zone.lo)) bestH = h;
          }
          if (bestH) { taken[k] = 1; zones.push(bestH.zone); placed = bestH; placedIdx = k; break; }
        }
        if (placed) { st.hazards.push(placed); minIdx = placedIdx + 1; }
      }
    }
  }

  buildStages();

  // ------------------------------------------------------------ 判定

  /**
   * スタート台・ゴール台の半径。コースより広くして、輪っかを置きやすくする。
   * 台の中も安全地帯として扱う。そうしないと
   * 「台の上に置いたのに、コースからはみ出して即アウト」になる。
   */
  function padRadius(stage) { return stage.corridor + 22; }

  function startPoint(stage) { return { x: stage.path[0][0], y: stage.path[0][1] }; }
  function goalPoint(stage) {
    const p = stage.path[stage.path.length - 1];
    return { x: p[0], y: p[1] };
  }

  function inStart(stage, x, y) {
    const p = startPoint(stage);
    return Math.hypot(x - p.x, y - p.y) <= padRadius(stage);
  }
  function inGoal(stage, x, y) {
    const p = goalPoint(stage);
    return Math.hypot(x - p.x, y - p.y) <= padRadius(stage);
  }

  /**
   * 壁までの余裕。マイナスなら当たっている。
   * 安全なのは「中心線から corridor 以内」か「台の中」。
   * 絵もこの 3 つをそのまま描くので、見た目と判定がズレない。
   */
  function wallMargin(stage, x, y, ringR) {
    const r = ringR === undefined ? RING_R : ringR;
    const pad = padRadius(stage);
    const sp = stage.path[0];
    const gp = stage.path[stage.path.length - 1];
    const a = stage.corridor - nearestOnPath(stage.path, x, y).d;
    const b = pad - Math.hypot(x - sp[0], y - sp[1]);
    const c = pad - Math.hypot(x - gp[0], y - gp[1]);
    return Math.max(a, b, c) - r;
  }

  /**
   * いまの一手をまとめて調べる。画面はこの結果だけ見ればいい。
   * @returns {{hit:(''|'wall'|'hazard'), margin:number, wall:number, hazard:number, progress:number}}
   */
  function probe(stage, x, y, ms, ringR) {
    const near = nearestOnPath(stage.path, x, y);
    const r = ringR === undefined ? RING_R : ringR;
    const wall = wallMargin(stage, x, y, r);
    const haz = stage.hazards.length ? hazardMargin(stage, x, y, ms, r) : Infinity;
    const total = pathLength(stage.path);
    return {
      hit: wall < 0 ? 'wall' : (haz < 0 ? 'hazard' : ''),
      wall: wall,
      hazard: haz,
      margin: Math.min(wall, haz),
      progress: total > 0 ? clamp(near.s / total, 0, 1) : 0
    };
  }

  // ------------------------------------------------------------ 通れることの証明

  /**
   * 中心線の上だけを歩く自動プレイヤーが、ゴールに着けるかを全部調べる。
   *
   * 「どこに・いつ居られるか」を 1 コマずつ塗りつぶしていく (到達可能性の探索)。
   * 貪欲に前へ進むのではなく、待つ・下がるを含めた全部の動きを同時に試すので、
   * 「人間なら通せるのにゴーストが失敗する」ということが起きない。
   *
   * ステージを足したらテストがこれを回す。通れないコースは置けない。
   */
  function ghostRun(stage, opts) {
    const o = opts || {};
    const dt = o.dt || 32;                                   // 1 コマの長さ (ms)
    const cell = o.cell || 12;                               // 1 コマで進める距離
    const ringR = RING_R + (o.margin === undefined ? 4 : o.margin);
    const limit = o.limit || 40000;
    const total = pathLength(stage.path);
    const n = Math.max(2, Math.ceil(total / cell) + 1);

    const pts = [];
    for (let i = 0; i < n; i++) pts.push(pointAt(stage.path, Math.min(total, i * cell)));

    const safeRow = (ms) => {
      const row = new Uint8Array(n);
      for (let i = 0; i < n; i++) {
        row[i] = hazardMargin(stage, pts[i].x, pts[i].y, ms, ringR) >= 0 ? 1 : 0;
      }
      return row;
    };

    let cur = new Uint8Array(n);
    if (!safeRow(0)[0]) return { cleared: false, timeMs: 0, reason: 'スタート台が危ない' };
    cur[0] = 1;

    const steps = Math.ceil(limit / dt);
    for (let t = 1; t <= steps; t++) {
      const ms = t * dt;
      const row = safeRow(ms);
      const next = new Uint8Array(n);
      let any = false;
      for (let i = 0; i < n; i++) {
        if (!cur[i]) continue;
        for (let j = i - 1; j <= i + 1; j++) {
          if (j < 0 || j >= n || next[j] || !row[j]) continue;
          next[j] = 1;
          any = true;
        }
      }
      if (!any) return { cleared: false, timeMs: ms, reason: 'ふさがった' };
      if (next[n - 1]) return { cleared: true, timeMs: ms };
      cur = next;
    }
    return { cleared: false, timeMs: limit, reason: '時間切れ' };
  }

  /** 邪魔ものがコースに絡んでいるか (絡まないものはただの飾り)。 */
  function hazardBites(stage, h) {
    return !!blockedRange(stage, h);
  }

  /** スタート台とゴール台に、邪魔ものが入ってこないか。 */
  function padsSafe(stage) {
    const pads = [startPoint(stage), goalPoint(stage)];
    const reach = padRadius(stage) + RING_R;
    for (const h of stage.hazards) {
      for (let ms = 0; ms < h.period; ms += 20) {
        const sh = hazardShape(h, ms);
        for (const pad of pads) {
          if (segDist(pad.x, pad.y, sh.x1, sh.y1, sh.x2, sh.y2).d - sh.r < reach) return false;
        }
      }
    }
    return true;
  }

  // ------------------------------------------------------------ セーブ

  function newSave() {
    return {
      version: SAVE_VERSION,
      best: {},        // ステージ id → いちばん速かったミリ秒
      unlocked: 1,     // ひらいているステージ数
      tries: 0,
      clears: 0,
      muted: false
    };
  }

  function stageIndex(id) {
    for (let i = 0; i < STAGES.length; i++) if (STAGES[i].id === id) return i;
    return -1;
  }

  function isUnlocked(save, index) { return index >= 0 && index < save.unlocked; }

  /** クリアを記録する。次のステージをひらき、自己ベストなら true を返す。 */
  function recordClear(save, stageId, ms) {
    const i = stageIndex(stageId);
    if (i < 0) return { best: false, ms: ms };
    save.clears++;
    if (save.unlocked < i + 2) save.unlocked = Math.min(STAGES.length, i + 2);
    const prev = save.best[stageId];
    if (prev === undefined || ms < prev) {
      save.best[stageId] = ms;
      return { best: true, ms: ms, prev: prev };
    }
    return { best: false, ms: ms, prev: prev };
  }

  function recordTry(save) { save.tries++; }

  function serialize(save) { return JSON.stringify(save); }

  /** 壊れたセーブでも必ず開ける。足りない所は新品の値で埋める。 */
  function deserialize(text) {
    const s = newSave();
    let raw;
    try { raw = JSON.parse(text); } catch (e) { return s; }
    if (!raw || typeof raw !== 'object') return s;

    if (raw.best && typeof raw.best === 'object') {
      for (const st of STAGES) {
        const v = raw.best[st.id];
        if (Number.isFinite(v) && v > 0) s.best[st.id] = v;
      }
    }
    if (Number.isFinite(raw.unlocked)) s.unlocked = clamp(Math.floor(raw.unlocked), 1, STAGES.length);
    // 記録があるなら、その次まではひらいているはず (セーブが古くても辻褄を合わせる)
    for (let i = 0; i < STAGES.length; i++) {
      if (s.best[STAGES[i].id] !== undefined) s.unlocked = Math.max(s.unlocked, Math.min(STAGES.length, i + 2));
    }
    for (const key of ['tries', 'clears']) {
      if (Number.isFinite(raw[key]) && raw[key] >= 0) s[key] = Math.floor(raw[key]);
    }
    s.muted = !!raw.muted;
    return s;
  }

  // ------------------------------------------------------------ 見せ方

  /** 12.34 のように、秒とその下 2 けた。 */
  function formatTime(ms) {
    if (!isFinite(ms) || ms < 0) return '--.--';
    const total = Math.floor(ms);
    const sec = Math.floor(total / 1000);
    const cs = Math.floor((total % 1000) / 10);
    if (sec >= 60) {
      const m = Math.floor(sec / 60);
      return m + ':' + String(sec % 60).padStart(2, '0') + '.' + String(cs).padStart(2, '0');
    }
    return sec + '.' + String(cs).padStart(2, '0');
  }

  /** 中心線を SVG の d 属性にする。太らせるのは stroke-width にまかせる。 */
  function pathD(path) {
    return path.map((p, i) => (i ? 'L' : 'M') + p[0] + ',' + p[1]).join(' ');
  }

  // ------------------------------------------------------------ 出口

  return {
    SAVE_KEY: SAVE_KEY,
    SAVE_VERSION: SAVE_VERSION,
    BOARD: BOARD,
    RING_R: RING_R,
    STICK: STICK,
    NEAR: NEAR,
    STAGES: STAGES,

    clamp: clamp,
    segDist: segDist,
    segCross: segCross,
    segSegDist: segSegDist,
    pathSegments: pathSegments,
    pathLength: pathLength,
    nearestOnPath: nearestOnPath,
    pointAt: pointAt,
    tangentAt: tangentAt,
    buildHazard: buildHazard,
    hazardWindows: hazardWindows,
    stageWindows: stageWindows,
    blockedRange: blockedRange,
    hazardFits: hazardFits,
    cornerGap: cornerGap,

    hazardShape: hazardShape,
    hazardMargin: hazardMargin,
    wallMargin: wallMargin,
    probe: probe,

    startPoint: startPoint,
    goalPoint: goalPoint,
    padRadius: padRadius,
    inStart: inStart,
    inGoal: inGoal,

    ghostRun: ghostRun,
    hazardBites: hazardBites,
    padsSafe: padsSafe,

    newSave: newSave,
    stageIndex: stageIndex,
    isUnlocked: isUnlocked,
    recordClear: recordClear,
    recordTry: recordTry,
    serialize: serialize,
    deserialize: deserialize,

    formatTime: formatTime,
    pathD: pathD
  };
});
