const test = require('node:test');
const assert = require('node:assert');
const C = require('./core.js');

// ------------------------------------------------------------ 幾何

test('点と線分の距離', () => {
  assert.strictEqual(C.segDist(0, 0, -10, 5, 10, 5).d, 5);      // 線分の内側に落ちる
  assert.strictEqual(C.segDist(-20, 5, -10, 5, 10, 5).d, 10);   // 端からはみ出したら端まで
  assert.strictEqual(C.segDist(0, 0, 3, 4, 3, 4).d, 5);         // 長さ 0 の線分
});

test('線分どうしの距離は、交わっていれば 0', () => {
  assert.strictEqual(C.segSegDist([0, 0], [10, 0], [5, -5], [5, 5]), 0);
  assert.strictEqual(C.segSegDist([0, 0], [10, 0], [0, 7], [10, 7]), 7);
});

test('折れ線の長さ', () => {
  assert.strictEqual(C.pathLength([[0, 0], [30, 0], [30, 40]]), 70);
});

test('進んだ長さと、その場所は行き来できる', () => {
  const path = [[0, 0], [100, 0], [100, 100], [200, 100]];
  const total = C.pathLength(path);
  for (let s = 0; s <= total; s += 17) {
    const p = C.pointAt(path, s);
    const back = C.nearestOnPath(path, p.x, p.y);
    assert.ok(back.d < 1e-6, `中心線の上なのに離れている: ${back.d}`);
    assert.ok(Math.abs(back.s - s) < 1e-6, `進んだ長さが合わない: ${back.s} != ${s}`);
  }
});

test('中心線からはみ出した所は、距離が正しく出る', () => {
  const path = [[0, 0], [100, 0]];
  assert.strictEqual(Math.round(C.nearestOnPath(path, 50, 30).d), 30);
  assert.strictEqual(Math.round(C.nearestOnPath(path, 130, 0).d), 30);
});

// ------------------------------------------------------------ 当たり判定

test('中心線の上がいちばん余裕がある', () => {
  const st = C.STAGES[0];
  const p = C.pointAt(st.path, 300);
  assert.strictEqual(Math.round(C.wallMargin(st, p.x, p.y)), st.corridor - C.RING_R);
});

test('壁をこえたら当たり', () => {
  const st = C.STAGES[0];
  const p = C.pointAt(st.path, 300);
  const t = C.tangentAt(st.path, 300);
  const nx = -t.y, ny = t.x;
  const just = st.corridor - C.RING_R - 1;
  const over = st.corridor - C.RING_R + 1;
  assert.strictEqual(C.probe(st, p.x + nx * just, p.y + ny * just, 0).hit, '');
  assert.strictEqual(C.probe(st, p.x + nx * over, p.y + ny * over, 0).hit, 'wall');
});

test('進みぐあいは 0 から 1 まで', () => {
  const st = C.STAGES[0];
  const a = C.startPoint(st), b = C.goalPoint(st);
  assert.ok(C.probe(st, a.x, a.y, 0).progress < 0.01);
  assert.ok(C.probe(st, b.x, b.y, 0).progress > 0.99);
});

test('スタート台とゴール台の判定', () => {
  const st = C.STAGES[0];
  const a = C.startPoint(st), b = C.goalPoint(st);
  assert.ok(C.inStart(st, a.x, a.y));
  assert.ok(!C.inGoal(st, a.x, a.y));
  assert.ok(C.inGoal(st, b.x, b.y));
  assert.ok(!C.inStart(st, a.x + C.padRadius(st) + 2, a.y));
});

// ------------------------------------------------------------ 邪魔もの

test('往復する棒は、両はしまでちゃんと行き来する', () => {
  const h = C.STAGES[1].hazards[0];
  let nearA = Infinity, nearB = Infinity;
  for (let ms = 0; ms < h.period; ms += 10) {
    const s = C.hazardShape(h, ms);
    const cx = (s.x1 + s.x2) / 2, cy = (s.y1 + s.y2) / 2;
    nearA = Math.min(nearA, Math.hypot(cx - h.ax, cy - h.ay));
    nearB = Math.min(nearB, Math.hypot(cx - h.bx, cy - h.by));
  }
  assert.ok(nearA < 2 && nearB < 2, `端まで行っていない A=${nearA} B=${nearB}`);
});

test('回る腕は、支点からいつも同じ長さ', () => {
  const h = C.STAGES[2].hazards.find((x) => x.type === 'rotor');
  for (let ms = 0; ms < h.period; ms += 37) {
    const s = C.hazardShape(h, ms);
    assert.ok(Math.abs(Math.hypot(s.x2 - s.x1, s.y2 - s.y1) - h.arm) < 1e-9);
  }
});

test('ふくらむ玉は min と max のあいだを動く', () => {
  const h = C.STAGES[2].hazards.find((x) => x.type === 'pulse');
  let lo = Infinity, hi = -Infinity;
  for (let ms = 0; ms < h.period; ms += 10) {
    const r = C.hazardShape(h, ms).r;
    lo = Math.min(lo, r); hi = Math.max(hi, r);
  }
  assert.ok(Math.abs(lo - h.min) < .5 && Math.abs(hi - h.max) < .5, `${lo}..${hi}`);
});

test('邪魔ものの置き場所は、角と両はしから離れた直線の途中だけ', () => {
  const path = [[0, 0], [400, 0], [400, 400]];   // 400 の所が曲がり角
  const wins = C.hazardWindows(path, 80, 60);
  assert.ok(wins.length > 0);
  for (const s of wins) {
    assert.ok(Math.abs(s - 400) >= 80, `角に寄りすぎ: ${s}`);
    assert.ok(s >= 60 && s <= C.pathLength(path) - 60, `端に寄りすぎ: ${s}`);
  }
});

test('短い区間には置き場所を作らない', () => {
  assert.deepStrictEqual(C.hazardWindows([[0, 0], [100, 0]], 80, 10), []);
});

// ------------------------------------------------------------ ステージが遊べる形か

test('コースは盤からはみ出さない', () => {
  for (const st of C.STAGES) {
    for (const p of st.path) {
      assert.ok(p[0] - st.corridor >= 0 && p[0] + st.corridor <= C.BOARD.w, `${st.id} が横にはみ出す ${p}`);
      assert.ok(p[1] - st.corridor >= 0 && p[1] + st.corridor <= C.BOARD.h, `${st.id} が縦にはみ出す ${p}`);
    }
  }
});

test('離れた区間どうしがくっついていない (近道ができない)', () => {
  for (const st of C.STAGES) {
    const segs = C.pathSegments(st.path);
    const need = st.corridor * 2.05;
    for (let i = 0; i < segs.length; i++) {
      for (let j = i + 2; j < segs.length; j++) {
        const d = C.segSegDist(segs[i][0], segs[i][1], segs[j][0], segs[j][1]);
        assert.ok(d >= need, `${st.id}: 区間 ${i} と ${j} が近い ${d.toFixed(0)} < ${need.toFixed(0)}`);
      }
    }
  }
});

test('スタート台とゴール台には、邪魔ものが入ってこない', () => {
  for (const st of C.STAGES) {
    assert.ok(C.padsSafe(st), `${st.id}: 台に邪魔ものが入る`);
  }
});

test('邪魔ものは曲がり角から離れている', () => {
  for (const st of C.STAGES) {
    for (const h of st.hazards) {
      const gap = C.cornerGap(st, h);
      assert.ok(gap >= st.corridor + h.bar + C.RING_R,
        `${st.id}: ${h.type} が角に近い ${gap.toFixed(0)}`);
    }
  }
});

test('置きたい数だけ、ちゃんと置けている', () => {
  for (const st of C.STAGES) {
    assert.strictEqual(st.hazards.length, st.specs.length,
      `${st.id}: ${st.specs.length} 個置きたいのに ${st.hazards.length} 個しか置けていない`);
  }
});

// ★ ここが通れることの土台。どの一点も、狙ってくる邪魔ものは多くて 1 つ。
//   だから「1 つずつ待って抜ける」で必ず前に進める。
test('邪魔もののふさぐ範囲どうしが、かさならない', () => {
  for (const st of C.STAGES) {
    for (let i = 0; i < st.hazards.length; i++) {
      for (let j = i + 1; j < st.hazards.length; j++) {
        const a = st.hazards[i].zone, b = st.hazards[j].zone;
        assert.ok(a.hi < b.lo || b.hi < a.lo,
          `${st.id}: 邪魔もの ${i} と ${j} が同じ所をふさぐ [${a.lo}-${a.hi}] [${b.lo}-${b.hi}]`);
      }
    }
  }
});

test('1 つの邪魔ものが、コースを広くふさぎすぎない', () => {
  for (const st of C.STAGES) {
    for (const h of st.hazards) {
      assert.ok(h.zone.hi - h.zone.lo <= 340,
        `${st.id}: ${h.type} が ${Math.round(h.zone.hi - h.zone.lo)} もふさいでいる`);
    }
  }
});

test('邪魔ものは盤からはみ出さない', () => {
  for (const st of C.STAGES) {
    for (const h of st.hazards) {
      for (let ms = 0; ms < h.period; ms += 40) {
        const sh = C.hazardShape(h, ms);
        for (const pt of [[sh.x1, sh.y1], [sh.x2, sh.y2]]) {
          assert.ok(pt[0] - sh.r >= 0 && pt[0] + sh.r <= C.BOARD.w &&
                    pt[1] - sh.r >= 0 && pt[1] + sh.r <= C.BOARD.h,
            `${st.id}: ${h.type} が盤の外 (${Math.round(pt[0])},${Math.round(pt[1])})`);
        }
      }
    }
  }
});

test('置いた邪魔ものは、ちゃんとコースに絡んでいる (ただの飾りがない)', () => {
  for (const st of C.STAGES) {
    st.hazards.forEach((h, i) => {
      assert.ok(C.hazardBites(st, h), `${st.id}: 邪魔もの ${i} (${h.type}) がコースに届いていない`);
    });
  }
});

// ★ これが核心。どのステージも、中心線を歩くだけで必ずゴールできる。
test('すべてのステージは、必ずクリアできる', () => {
  for (const st of C.STAGES) {
    const g = C.ghostRun(st);
    assert.ok(g.cleared, `${st.id} ${st.name}: ${g.reason} (${C.formatTime(g.timeMs)})`);
    assert.ok(g.timeMs > 1000, `${st.id}: 速すぎる。コースが短すぎないか (${g.timeMs}ms)`);
  }
});

test('どの品番にも番号がついている', () => {
  const seen = {};
  for (const st of C.STAGES) {
    assert.ok(/^IRB-\d\d$/.test(st.model), `${st.id}: 品番がおかしい (${st.model})`);
    assert.ok(!seen[st.model], `品番がかぶっている (${st.model})`);
    seen[st.model] = 1;
  }
});

test('ステージはだんだん細く、だんだん邪魔ものが増える', () => {
  for (let i = 1; i < C.STAGES.length; i++) {
    assert.ok(C.STAGES[i].corridor < C.STAGES[i - 1].corridor, `${C.STAGES[i].id} が細くなっていない`);
    assert.ok(C.STAGES[i].hazards.length >= C.STAGES[i - 1].hazards.length,
      `${C.STAGES[i].id} で邪魔ものが減っている`);
  }
});

// 通れないコースを、ちゃんと「通れない」と言えるか (見張りそのものの見張り)
test('通れないコースは、通れないと分かる', () => {
  const broken = {
    id: 'x', name: 'こわれ', corridor: 40,
    path: [[100, 100], [100, 500]],
    hazards: [{ type: 'pulse', s: 200, x: 100, y: 300, min: 30, max: 40, bar: 0, period: 1000, phase: 0 }]
  };
  const g = C.ghostRun(broken);
  assert.strictEqual(g.cleared, false);
});

test('スタート台が危ないコースも、はじく', () => {
  const broken = {
    id: 'x', name: 'こわれ', corridor: 40,
    path: [[100, 100], [100, 500]],
    hazards: [{ type: 'pulse', s: 0, x: 100, y: 100, min: 30, max: 40, bar: 0, period: 1000, phase: 0 }]
  };
  const g = C.ghostRun(broken);
  assert.strictEqual(g.cleared, false);
  assert.strictEqual(g.reason, 'スタート台が危ない');
});

// ------------------------------------------------------------ セーブ

test('クリアすると次のステージがひらき、自己ベストが残る', () => {
  const s = C.newSave();
  assert.strictEqual(s.unlocked, 1);
  assert.ok(C.isUnlocked(s, 0));
  assert.ok(!C.isUnlocked(s, 1));

  const first = C.recordClear(s, C.STAGES[0].id, 9000);
  assert.strictEqual(first.best, true);
  assert.strictEqual(s.unlocked, 2);
  assert.ok(C.isUnlocked(s, 1));

  const slower = C.recordClear(s, C.STAGES[0].id, 12000);
  assert.strictEqual(slower.best, false);
  assert.strictEqual(s.best[C.STAGES[0].id], 9000, '遅い記録で上書きしない');

  const faster = C.recordClear(s, C.STAGES[0].id, 7000);
  assert.strictEqual(faster.best, true);
  assert.strictEqual(s.best[C.STAGES[0].id], 7000);
  assert.strictEqual(s.clears, 3);
});

test('最後のステージをクリアしても、ひらく数は増えすぎない', () => {
  const s = C.newSave();
  s.unlocked = C.STAGES.length;
  C.recordClear(s, C.STAGES[C.STAGES.length - 1].id, 5000);
  assert.strictEqual(s.unlocked, C.STAGES.length);
});

test('明かりは、いちばん太いみぞより広く照らす', () => {
  const widest = Math.max(...C.STAGES.map((st) => st.corridor));
  assert.ok(C.LIGHT_R > widest * 2,
    `暗室検査で足もとのみぞが見えない (明かり ${C.LIGHT_R} / みぞ ${widest})`);
});

test('暗室検査の入り切りはおぼえている', () => {
  const s = C.newSave();
  assert.strictEqual(s.dark, false, 'はじめは明るい');
  s.dark = true;
  assert.strictEqual(C.deserialize(C.serialize(s)).dark, true);
  assert.strictEqual(C.deserialize('{"dark":"はい"}').dark, true);   // 何が入っていても true/false に
  assert.strictEqual(C.deserialize('{"dark":0}').dark, false);
  assert.strictEqual(C.deserialize('こわれ').dark, false);
});

test('保存して読み直すと同じ中身になる', () => {
  const s = C.newSave();
  C.recordClear(s, C.STAGES[0].id, 8123);
  C.recordClear(s, C.STAGES[1].id, 9456);
  s.tries = 42;
  s.muted = true;
  const back = C.deserialize(C.serialize(s));
  assert.deepStrictEqual(back.best, s.best);
  assert.strictEqual(back.unlocked, s.unlocked);
  assert.strictEqual(back.tries, 42);
  assert.strictEqual(back.muted, true);
});

test('セーブが壊れていても、新品として必ず開ける', () => {
  for (const bad of ['', '{', 'null', '[]', '"x"', '{"best":5,"unlocked":"no"}']) {
    const s = C.deserialize(bad);
    assert.strictEqual(s.unlocked, 1, `${bad} で開けない`);
    assert.deepStrictEqual(s.best, {});
  }
});

test('記録があるステージの次は、必ずひらいている', () => {
  // unlocked だけ壊れたセーブでも、記録から辻褄を合わせ直す
  const raw = { best: {}, unlocked: 1 };
  raw.best[C.STAGES[2].id] = 5000;
  const s = C.deserialize(JSON.stringify(raw));
  assert.ok(C.isUnlocked(s, 2), 'クリアしたステージが閉じている');
  assert.ok(C.isUnlocked(s, 3), 'その次がひらいていない');
});

test('セーブのおかしな値は取り込まない', () => {
  const raw = { best: { s1: -5, s2: 'はやい' }, unlocked: 999, tries: -3 };
  const s = C.deserialize(JSON.stringify(raw));
  assert.strictEqual(s.best.s1, undefined);
  assert.strictEqual(s.best.s2, undefined);
  assert.strictEqual(s.unlocked, C.STAGES.length);
  assert.strictEqual(s.tries, 0);
});

// ------------------------------------------------------------ 見せ方

test('時間の書き方', () => {
  assert.strictEqual(C.formatTime(0), '0.00');
  assert.strictEqual(C.formatTime(1234), '1.23');
  assert.strictEqual(C.formatTime(59990), '59.99');
  assert.strictEqual(C.formatTime(61500), '1:01.50');
  assert.strictEqual(C.formatTime(-1), '--.--');
});

test('コースの d 属性は、折れ線をそのまま書く', () => {
  assert.strictEqual(C.pathD([[0, 0], [10, 20]]), 'M0,0 L10,20');
});
