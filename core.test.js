const test = require('node:test');
const assert = require('node:assert');
const C = require('./core.js');

// ------------------------------------------------------------ 乱数

test('同じ seed からは同じ並びが出る', () => {
  const a = C.mulberry32(42);
  const b = C.mulberry32(42);
  for (let i = 0; i < 20; i++) assert.strictEqual(a(), b());
});

test('weighted は必ず候補のどれかを返す', () => {
  const rng = C.mulberry32(9);
  for (let i = 0; i < 500; i++) {
    const r = C.weighted(rng, C.RARITIES);
    assert.ok(C.RARITIES.includes(r));
  }
});

test('weighted に minIndex を渡すと、それより下は出ない', () => {
  const rng = C.mulberry32(3);
  for (let i = 0; i < 300; i++) {
    assert.notStrictEqual(C.weighted(rng, C.RARITIES, 1).id, 'N');
  }
});

// ------------------------------------------------------------ 数のしくみ

test('工場レベルは「部署のレベル合計 + ねこの数 + 1」', () => {
  const s = C.newGame(1);
  s.rooms = { kitchen: 5, line: 3 };
  s.cats = [{ id: 'a', rarity: 'N', level: 1, room: null }, { id: 'b', rarity: 'N', level: 1, room: null }];
  assert.strictEqual(C.factoryLevel(s), 5 + 3 + 2 + 1);
});

test('ねこがいない部署の倍率は 1 倍', () => {
  const s = C.newGame(1);
  s.cats = [];
  assert.strictEqual(C.roomCatBonus(s, 'kitchen'), 1);
  assert.strictEqual(C.roomRate(s, 'kitchen'), C.roomDef('kitchen').baseRate * 1);
});

test('ねこの力はレア度とレベルで上がる', () => {
  const n1 = C.catPower({ rarity: 'N', level: 1 });
  const n2 = C.catPower({ rarity: 'N', level: 2 });
  const ur = C.catPower({ rarity: 'UR', level: 1 });
  assert.ok(n2 > n1, 'レベルを上げると強くなる');
  assert.ok(ur > n1, 'レア度が高いと強い');
  assert.strictEqual(n2, n1 * 1.25);
});

test('建てていない部署はもうけを出さない', () => {
  const s = C.newGame(1);
  assert.strictEqual(C.roomLevel(s, 'line'), 0);
  assert.strictEqual(C.roomRate(s, 'line'), 0);
});

test('きゅうけい室はもうけ 0、そのかわり全体の倍率を上げる', () => {
  const s = C.newGame(1);
  s.cats = [];
  s.rooms = { kitchen: 10 };
  const before = C.totalRate(s);
  s.rooms.lounge = 5;
  assert.strictEqual(C.roomRate(s, 'lounge'), 0);
  assert.ok(C.totalRate(s) > before, 'きゅうけい室を建てると全体が増える');
  assert.strictEqual(C.boostMultiplier(s), 1 + 5 * C.roomDef('lounge').boostPerLevel);
});

test('値段はレベルが上がるほど高くなる', () => {
  const s = C.newGame(1);
  const first = C.upgradeCost(s, 'line');
  s.rooms.line = 10;
  assert.ok(C.upgradeCost(s, 'line') > first);
});

test('買えるだけ買う計算は、実際に買った結果と一致する', () => {
  const s = C.newGame(1);
  s.rooms.kitchen = 1;
  s.money = 100000;
  const plan = C.affordableLevels(s, 'kitchen', s.money);
  const before = s.money;
  let bought = 0;
  while (C.buyUpgrade(s, 'kitchen')) bought++;
  assert.strictEqual(bought, plan.levels);
  assert.strictEqual(before - s.money, plan.cost);
});

// ------------------------------------------------------------ 買う・配る

test('お金が足りないと買えないし、減りもしない', () => {
  const s = C.newGame(1);
  s.money = 0;
  assert.strictEqual(C.buyUpgrade(s, 'kitchen'), false);
  assert.strictEqual(s.money, 0);
  assert.strictEqual(C.roomLevel(s, 'kitchen'), 1);
});

test('工場レベルが足りない部署は買えない', () => {
  const s = C.newGame(1);
  s.money = Infinity;
  assert.strictEqual(C.isUnlocked(s, 'ship'), false);
  assert.strictEqual(C.buyUpgrade(s, 'ship'), false);
});

test('席の数より多くは配属できない', () => {
  const s = C.newGame(1);
  s.cats = [];
  const def = C.roomDef('kitchen');
  const rng = C.mulberry32(5);
  for (let i = 0; i < def.slots + 2; i++) s.cats.push(C.newCat(rng));
  for (const cat of s.cats) cat.room = null;
  let ok = 0;
  for (const cat of s.cats) if (C.assignCat(s, cat.id, 'kitchen')) ok++;
  assert.strictEqual(ok, def.slots);
  assert.strictEqual(C.catsIn(s, 'kitchen').length, def.slots);
});

test('ねこのレベル上げはにくきゅうを払い、足りなければ何も起きない', () => {
  const s = C.newGame(1);
  const cat = s.cats[0];
  const cost = C.catLevelCost(cat);
  s.paw = cost - 1;
  assert.strictEqual(C.levelUpCat(s, cat.id), false);
  assert.strictEqual(cat.level, 1);
  s.paw = cost;
  assert.strictEqual(C.levelUpCat(s, cat.id), true);
  assert.strictEqual(cat.level, 2);
  assert.strictEqual(s.paw, 0);
});

test('ガチャはにくきゅうが足りないと引けない', () => {
  const s = C.newGame(1);
  s.paw = C.GACHA_COST - 1;
  assert.strictEqual(C.gacha(s, 1, C.mulberry32(1)), null);
  assert.strictEqual(s.cats.length, 1);
});

test('10 連は必ずレア以上が 1 ぴき入る', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const s = C.newGame(seed);
    s.paw = C.GACHA_COST_10;
    const got = C.gacha(s, 10, C.mulberry32(seed));
    assert.strictEqual(got.length, 10);
    assert.ok(got.some((c) => c.rarity !== 'N'), `seed ${seed} でレアが出ていない`);
  }
});

test('あぶれたねこは、部署を建てると席につく', () => {
  const s = C.newGame(1);
  s.cats = [];
  const rng = C.mulberry32(2);
  for (let i = 0; i < 8; i++) C.addCat(s, C.newCat(rng));
  const idle = s.cats.filter((c) => c.room === null).length;
  assert.ok(idle > 0, 'きゅうしょく室の席は 3 つなので、あぶれるはず');
  s.rooms.line = 0;
  s.money = C.upgradeCost(s, 'line');
  s.rooms.kitchen = 20; // 工場レベルを上げて解放する
  assert.strictEqual(C.buyUpgrade(s, 'line'), true);
  assert.ok(C.catsIn(s, 'line').length > 0, '建てた部署にねこが入る');
});

// ------------------------------------------------------------ 時間

test('tick のもうけは「もうけ/秒 × 秒」ちょうど', () => {
  const s = C.newGame(1);
  const rate = C.totalRate(s);
  const earned = C.tick(s, 1000);
  assert.ok(Math.abs(earned - rate) < 1e-9);
  assert.ok(Math.abs(s.money - rate) < 1e-9);
  assert.ok(Math.abs(s.totalEarned - rate) < 1e-9);
});

test('とても大きい dt が来ても、進むのは上限まで', () => {
  const a = C.newGame(1);
  const b = C.newGame(1);
  C.tick(a, 1000 * 60 * 60 * 24);
  C.tick(b, 4000);
  assert.strictEqual(a.money, b.money);
});

test('負の dt では時間が戻らない', () => {
  const s = C.newGame(1);
  const before = s.gameMinutes;
  assert.strictEqual(C.tick(s, -5000), 0);
  assert.strictEqual(s.money, 0);
  assert.strictEqual(s.gameMinutes, before);
});

test('留守中のもうけは 8 時間で頭打ち', () => {
  const s = C.newGame(1);
  const now = Date.now();
  s.lastSeen = now - 100 * 60 * 60 * 1000;
  const r = C.offlineReport(s, now);
  assert.strictEqual(r.cappedMs, C.OFFLINE_CAP_MS);
  assert.ok(Math.abs(r.money - C.totalRate(s) * (C.OFFLINE_CAP_MS / 1000) * C.OFFLINE_RATE) < 1e-6);
});

test('留守のもうけは、受け取るまで state を変えない', () => {
  const s = C.newGame(1);
  s.lastSeen = Date.now() - 60 * 60 * 1000;
  const r = C.offlineReport(s);
  assert.strictEqual(s.money, 0);
  C.claimOffline(s, r);
  assert.strictEqual(s.money, r.money);
});

test('時計は 0:00〜23:59 のあいだをまわる', () => {
  const s = C.newGame(1);
  assert.strictEqual(C.gameClock(s).text, '09:00');
  s.gameMinutes = 1439.9;
  assert.strictEqual(C.gameClock(s).text, '23:59');
  s.gameMinutes = 0;
  assert.strictEqual(C.gameClock(s).text, '00:00');
  for (let m = 0; m < 1440; m += 7) {
    s.gameMinutes = m;
    const c = C.gameClock(s);
    assert.ok(c.h >= 0 && c.h < 24 && c.m >= 0 && c.m < 60);
    assert.ok(['morning', 'day', 'evening', 'night'].includes(c.phase));
  }
});

test('1 日まわしても時計は 24 時をこえない', () => {
  const s = C.newGame(1);
  for (let i = 0; i < 2000; i++) C.tick(s, 1000);
  assert.ok(s.gameMinutes >= 0 && s.gameMinutes < 1440);
});

// ------------------------------------------------------------ ごほうび

test('工場レベルのごほうびは、何度呼んでも二重に出ない', () => {
  const s = C.newGame(1);
  C.claimLevelRewards(s);
  const paw = s.paw;
  assert.strictEqual(C.claimLevelRewards(s), 0);
  assert.strictEqual(s.paw, paw);
  s.rooms.kitchen = 6;
  assert.strictEqual(C.claimLevelRewards(s), 5);
  assert.strictEqual(s.paw, paw + 5);
  assert.strictEqual(C.claimLevelRewards(s), 0);
});

test('じっせきのごほうびは一度きり', () => {
  const s = C.newGame(1);
  s.totalEarned = 1;
  const first = C.claimAchievements(s);
  assert.ok(first.some((a) => a.id === 'start'));
  const paw = s.paw;
  assert.deepStrictEqual(C.claimAchievements(s), []);
  assert.strictEqual(s.paw, paw);
});

test('あわのごほうびは、お金かにくきゅうのどちらか', () => {
  const s = C.newGame(1);
  const rng = C.mulberry32(11);
  let money = 0, paw = 0;
  for (let i = 0; i < 300; i++) {
    const r = C.bubbleReward(s, 'kitchen', rng);
    assert.ok(r.amount > 0);
    if (r.kind === 'paw') paw++; else money++;
  }
  assert.ok(paw > 0 && money > 0, '両方出るはず');
});

test('タップのごほうびは 1 円を下回らない', () => {
  const s = C.newGame(1);
  s.cats = [];
  s.rooms = {};
  assert.strictEqual(C.tapReward(s), 1);
  assert.strictEqual(s.taps, 1);
});

// ------------------------------------------------------------ セーブ

test('保存して読み直すと同じ中身になる', () => {
  const s = C.newGame(7);
  s.money = 12345.5;
  s.rooms.line = 4;
  const back = C.deserialize(C.serialize(s));
  assert.strictEqual(back.money, s.money);
  assert.strictEqual(back.rooms.line, 4);
  assert.strictEqual(back.cats.length, s.cats.length);
  assert.strictEqual(C.factoryLevel(back), C.factoryLevel(s));
});

test('セーブが壊れていても、新品として必ず開ける', () => {
  for (const bad of ['', '{', 'null', '[]', '"x"', '{"cats":5,"rooms":"no"}']) {
    const s = C.deserialize(bad, 1);
    assert.ok(C.builtRooms(s).length >= 1, `${bad} で部署がない`);
    assert.ok(s.cats.length >= 1, `${bad} でねこがいない`);
    assert.ok(Number.isFinite(C.totalRate(s)));
  }
});

test('セーブのおかしな値は取り込まない', () => {
  const s = C.deserialize(JSON.stringify({
    money: -999, paw: NaN, cats: [{ id: 'x', level: -3, rarity: 'ZZZ', kind: 'nope', room: 'nowhere' }],
    rooms: { kitchen: 2, ghost: 9 }, gameMinutes: 99999
  }), 1);
  assert.ok(s.money >= 0);
  assert.ok(Number.isFinite(s.paw));
  assert.strictEqual(s.cats[0].level, 1);
  assert.strictEqual(s.cats[0].rarity, 'N');
  assert.strictEqual(s.cats[0].room, null);
  assert.strictEqual(s.rooms.ghost, undefined);
  assert.ok(s.gameMinutes >= 0 && s.gameMinutes < 1440);
});

test('席あふれのセーブは、読むときに直る', () => {
  const def = C.roomDef('kitchen');
  const cats = [];
  for (let i = 0; i < def.slots + 3; i++) {
    cats.push({ id: 'c' + i, name: 'x', kind: 'kiji', rarity: 'N', level: 1, room: 'kitchen' });
  }
  const s = C.deserialize(JSON.stringify({ rooms: { kitchen: 1 }, cats: cats }), 1);
  assert.strictEqual(C.catsIn(s, 'kitchen').length, def.slots);
  assert.strictEqual(s.cats.length, def.slots + 3);
});

// ------------------------------------------------------------ 見せ方と間取り

test('数の書き方', () => {
  assert.strictEqual(C.formatNumber(0), '0');
  assert.strictEqual(C.formatNumber(999), '999');
  assert.strictEqual(C.formatNumber(1234), '1,234');
  assert.strictEqual(C.formatNumber(723355823), '723,355,823');
  assert.strictEqual(C.formatNumber(1013637280), '1,013,637,280');
  assert.strictEqual(C.formatNumber(1.5e13), '15兆');
  assert.strictEqual(C.formatNumber(3e17), '30京');
  assert.strictEqual(C.formatNumber(Infinity), '∞');
});

test('留守の長さの書き方', () => {
  assert.strictEqual(C.formatDuration(5000), '5 秒');
  assert.strictEqual(C.formatDuration(120000), '2 分');
  assert.strictEqual(C.formatDuration(3 * 3600 * 1000 + 60000), '3 時間 1 分');
});

test('席は必ず部屋のなかに収まる', () => {
  for (const def of C.ROOMS) {
    const slots = C.slotPositions(def);
    assert.strictEqual(slots.length, def.slots);
    for (const s of slots) {
      assert.ok(s.x > 0 && s.x < def.w, `${def.id} の席が横にはみ出す: ${s.x}`);
      assert.ok(s.y > 0 && s.y < def.h, `${def.id} の席が縦にはみ出す: ${s.y}`);
    }
  }
});

test('部署どうしは重ならない', () => {
  for (let i = 0; i < C.ROOMS.length; i++) {
    for (let j = i + 1; j < C.ROOMS.length; j++) {
      const a = C.ROOMS[i];
      const b = C.ROOMS[j];
      const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
      assert.ok(apart, `${a.id} と ${b.id} が重なっている`);
    }
  }
});

test('部署は升目からはみ出さない', () => {
  for (const def of C.ROOMS) {
    assert.ok(def.x >= 0 && def.x + def.w <= C.GRID.w, `${def.id} が横にはみ出す`);
    assert.ok(def.y >= 0 && def.y + def.h <= C.GRID.h, `${def.id} が縦にはみ出す`);
  }
});

test('アイソメトリックの変換は、原点でも端でも辻褄が合う', () => {
  assert.deepStrictEqual(C.iso(0, 0, 0), { x: 0, y: 0 });
  assert.strictEqual(C.iso(1, 0, 0).x, C.TILE.w / 2);
  assert.strictEqual(C.iso(0, 1, 0).x, -C.TILE.w / 2);
  assert.strictEqual(C.iso(1, 1, 0).y, C.TILE.h);
  // 高さは上に上がる (y が小さくなる)
  assert.ok(C.iso(2, 3, 40).y < C.iso(2, 3, 0).y);
});

test('画面に収める四角は、升目ぜんたいを含む', () => {
  const b = C.sceneBounds();
  assert.ok(b.w > 0 && b.h > 0);
  for (const def of C.ROOMS) {
    for (const corner of [[def.x, def.y], [def.x + def.w, def.y + def.h]]) {
      const p = C.iso(corner[0], corner[1], 0);
      assert.ok(p.x >= b.x - 1 && p.x <= b.x + b.w + 1, `${def.id} が横にはみ出す`);
      assert.ok(p.y >= b.y - 1 && p.y <= b.y + b.h + 1, `${def.id} が縦にはみ出す`);
    }
  }
});

test('解放レベルは、部署の順に上がっていく', () => {
  for (let i = 1; i < C.ROOMS.length; i++) {
    assert.ok(C.ROOMS[i].unlock > C.ROOMS[i - 1].unlock, `${C.ROOMS[i].id} の解放が早すぎる`);
  }
});

test('赤い印は、何かできるときだけ出る', () => {
  const s = C.newGame(1);
  s.paw = 0;
  s.money = 0;
  s.done = {};
  for (const a of C.ACHIEVEMENTS) s.done[a.id] = 1;
  const quiet = C.badges(s);
  assert.strictEqual(quiet.gacha, false);
  assert.strictEqual(quiet.awards, false);
  s.paw = 9999;
  assert.strictEqual(C.badges(s).gacha, true);
});
