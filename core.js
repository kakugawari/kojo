/*!
 * core.js — ねこ工場のロジック。DOM を一切触らないので node でテストできる。
 *
 * ここにある値はすべて state から計算し直せる (derived)。
 * 「収入」も「工場レベル」も保存しない。保存すると必ずどこかでズレるため。
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

  const SAVE_KEY = 'nekokojo.save.v1';
  const SAVE_VERSION = 1;

  /** アイソメトリックの升目。1 マス = w x h ピクセル、壁の高さ = wall。 */
  const TILE = { w: 72, h: 36, wall: 54 };

  /** 1 回の tick で進める上限。タブを戻した瞬間に巨大な dt が来ても壊れない。 */
  const TICK_CAP_MS = 4000;

  /** 留守中のもうけ: 何時間ぶんまで / 何割か。 */
  const OFFLINE_CAP_MS = 8 * 60 * 60 * 1000;
  const OFFLINE_RATE = 0.4;

  /** ゲーム内の時間の進み方。実時間 1 秒 = ゲーム内 1 分 (1 日 = 24 分)。 */
  const GAME_MIN_PER_SEC = 1;
  const START_GAME_MIN = 9 * 60;

  /**
   * 部署。x,y,w,h は升目の座標。ここを直せば間取りが変わる。
   * machine = 部屋のはしに置く機械、product = ベルトを流れてくるもの。
   */
  const ROOMS = [
    {
      id: 'gohan', short: 'ごはん', name: 'ごはん工房', icon: '🍙', kind: 'produce',
      x: 0, y: 0, w: 4, h: 3, slots: 3, unlock: 1,
      baseRate: 2, baseCost: 30, growth: 1.13,
      floor: '#ffe0b8', wall: '#fff6ea', accent: '#ff9c5b',
      machine: 'kama', product: 'onigiri',
      about: 'おおきな釜でにぼしごはんをたいて、ベルトの上でおにぎりにする。'
    },
    {
      id: 'kumitate', short: 'くみたて', name: 'くみたてライン', icon: '🔧', kind: 'produce',
      x: 5, y: 0, w: 4, h: 3, slots: 4, unlock: 4,
      baseRate: 18, baseCost: 420, growth: 1.135,
      floor: '#cde5ff', wall: '#f0f8ff', accent: '#4aa8ff',
      machine: 'press', product: 'gear',
      about: 'プレス機が打ち出した部品を、流れてくるそばから組み立てる。'
    },
    {
      id: 'kenpin', short: 'けんぴん', name: 'けんぴんライン', icon: '🔍', kind: 'produce',
      x: 0, y: 4, w: 4, h: 3, slots: 4, unlock: 12,
      baseRate: 160, baseCost: 7800, growth: 1.14,
      floor: '#d4f0dc', wall: '#f0fbf3', accent: '#48c184',
      machine: 'scanner', product: 'box',
      about: 'ゲートをくぐった品を、ひとつずつ肉球でさわって確かめる。'
    },
    {
      id: 'keito', short: 'けいと', name: 'けいと工房', icon: '🧶', kind: 'produce',
      x: 5, y: 4, w: 4, h: 3, slots: 5, unlock: 26,
      baseRate: 1400, baseCost: 145000, growth: 1.145,
      floor: '#e0dbff', wall: '#f4f2ff', accent: '#8a7dff',
      machine: 'spinner', product: 'yarn',
      about: '糸車をぐるぐるまわして毛糸玉を巻く。だいたい糸まみれになる。'
    },
    {
      id: 'shukka', short: 'しゅっか', name: 'しゅっか場', icon: '📦', kind: 'produce',
      x: 0, y: 8, w: 4, h: 3, slots: 5, unlock: 46,
      baseRate: 13000, baseCost: 2600000, growth: 1.15,
      floor: '#ffd7e5', wall: '#fff0f5', accent: '#ff6f9c',
      machine: 'crane', product: 'crate',
      about: 'クレーンで箱をつり上げて、トラックへ積む。ねこは箱に入りたがる。'
    },
    {
      id: 'kyukei', short: 'きゅうけい', name: 'きゅうけい室', icon: '🛋️', kind: 'boost',
      x: 5, y: 8, w: 4, h: 3, slots: 6, unlock: 72,
      baseRate: 0, baseCost: 40000000, growth: 1.16,
      boostPerLevel: 0.03,
      floor: '#ffefc2', wall: '#fffaea', accent: '#ffc53d',
      machine: 'sofa', product: null,
      about: 'ここで昼寝したねこは、工場ぜんたいのもうけを上げる。'
    }
  ];

  /** 前の版のセーブを、今の部署の名前に読みかえる。 */
  const OLD_ROOM_IDS = {
    kitchen: 'gohan', line: 'kumitate', qa: 'kenpin',
    dev: 'keito', ship: 'shukka', lounge: 'kyukei'
  };

  /** 部署のない廊下も含めた升目の広さ。 */
  const GRID = { w: 9, h: 11 };

  const RARITIES = [
    { id: 'N', name: 'ふつう', power: 0.10, color: '#a9bacd', weight: 60 },
    { id: 'R', name: 'レア', power: 0.30, color: '#4db6ff', weight: 27 },
    { id: 'SR', name: 'スーパーレア', power: 0.85, color: '#b57bff', weight: 10 },
    { id: 'UR', name: 'ウルトラレア', power: 2.40, color: '#ffb02e', weight: 3 }
  ];

  /** 見た目の種類。色は SVG からそのまま使う。 */
  const KINDS = [
    { id: 'kiji', name: 'きじとら', fur: '#d9a86c', dark: '#b17f42', belly: '#f7e6cb', stripes: true },
    { id: 'cha', name: 'ちゃとら', fur: '#f0a860', dark: '#c87a33', belly: '#ffeed6', stripes: true },
    { id: 'shiro', name: 'しろ', fur: '#fdfaf5', dark: '#e2d7c8', belly: '#ffffff', stripes: false },
    { id: 'kuro', name: 'くろ', fur: '#615c70', dark: '#464253', belly: '#837d92', stripes: false },
    { id: 'hachi', name: 'ハチワレ', fur: '#8f8b9b', dark: '#6c6878', belly: '#ffffff', stripes: false, tuxedo: true },
    { id: 'mike', name: 'みけ', fur: '#fdfaf5', dark: '#ded3c4', belly: '#ffffff', stripes: false, calico: true },
    { id: 'sabi', name: 'さび', fur: '#8d6d58', dark: '#69503e', belly: '#d9b89b', stripes: false, calico: true },
    { id: 'gray', name: 'グレー', fur: '#bcc5d1', dark: '#96a2b3', belly: '#eaeff5', stripes: true },
    { id: 'siam', name: 'シャム', fur: '#ecdfca', dark: '#9a7a60', belly: '#f8f0e3', stripes: false, points: true }
  ];

  const NAMES = [
    'みかん', 'こむぎ', 'もち', 'あずき', 'きなこ', 'だいふく', 'とら', 'ふく',
    'ちゃちゃ', 'くるみ', 'ぷりん', 'おはぎ', 'しお', 'こはく', 'まろん', 'ゆず',
    'あんこ', 'そら', 'なな', 'ここあ', 'むぎ', 'ごま', 'てん', 'はな',
    'りん', 'たま', 'くろまめ', 'しろたん', 'ぽん', 'うに', 'すず', 'のり'
  ];

  /** ガチャ 1 回の値段 (にくきゅう)。10 連は 1 回ぶんおまけ + レア以上が確定。 */
  const GACHA_COST = 12;
  const GACHA_COST_10 = GACHA_COST * 9;

  const ACHIEVEMENTS = [
    { id: 'start', name: 'はじめの一歩', desc: 'はじめてもうける', paw: 3, test: (s) => s.totalEarned > 0 },
    { id: 'cat3', name: 'にゃんこ 3 びき', desc: 'ねこを 3 びきあつめる', paw: 5, test: (s) => s.cats.length >= 3 },
    { id: 'cat10', name: 'にゃんこ 10 ぴき', desc: 'ねこを 10 ぴきあつめる', paw: 15, test: (s) => s.cats.length >= 10 },
    { id: 'cat25', name: 'ねこだらけ', desc: 'ねこを 25 ひきあつめる', paw: 40, test: (s) => s.cats.length >= 25 },
    { id: 'rare', name: 'はじめてのレア', desc: 'レア以上のねこをむかえる', paw: 8, test: (s) => s.cats.some((c) => c.rarity !== 'N') },
    { id: 'ur', name: 'でんせつのねこ', desc: 'ウルトラレアをむかえる', paw: 60, test: (s) => s.cats.some((c) => c.rarity === 'UR') },
    { id: 'room2', name: 'ふたつめの部署', desc: '部署を 2 つひらく', paw: 6, test: (s) => builtRooms(s).length >= 2 },
    { id: 'room4', name: 'そこそこの工場', desc: '部署を 4 つひらく', paw: 20, test: (s) => builtRooms(s).length >= 4 },
    { id: 'roomAll', name: 'フル操業', desc: 'すべての部署をひらく', paw: 100, test: (s) => builtRooms(s).length >= ROOMS.length },
    { id: 'lv20', name: '工場レベル 20', desc: '工場レベルを 20 にする', paw: 10, test: (s) => factoryLevel(s) >= 20 },
    { id: 'lv50', name: '工場レベル 50', desc: '工場レベルを 50 にする', paw: 30, test: (s) => factoryLevel(s) >= 50 },
    { id: 'lv100', name: '工場レベル 100', desc: '工場レベルを 100 にする', paw: 80, test: (s) => factoryLevel(s) >= 100 },
    { id: 'earn1m', name: '100 万円', desc: 'あわせて 100 万円かせぐ', paw: 12, test: (s) => s.totalEarned >= 1e6 },
    { id: 'earn1b', name: '10 億円', desc: 'あわせて 10 億円かせぐ', paw: 50, test: (s) => s.totalEarned >= 1e9 },
    { id: 'tap100', name: 'なでなで 100 回', desc: '工場を 100 回さわる', paw: 10, test: (s) => s.taps >= 100 }
  ];

  // ------------------------------------------------------------ 乱数

  /** 決まった順番で数を出す乱数 (mulberry32)。同じ seed からは同じ並び。 */
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function pick(rng, list) {
    return list[Math.floor(rng() * list.length) % list.length];
  }

  /** weight つきの抽選。合計に依存しないので、重みを足しても直さなくていい。 */
  function weighted(rng, list, minIndex) {
    const pool = minIndex ? list.slice(minIndex) : list;
    let total = 0;
    for (const item of pool) total += item.weight;
    let r = rng() * total;
    for (const item of pool) {
      r -= item.weight;
      if (r < 0) return item;
    }
    return pool[pool.length - 1];
  }

  // ------------------------------------------------------------ 参照

  function roomDef(id) {
    for (const def of ROOMS) if (def.id === id) return def;
    return null;
  }

  function rarityDef(id) {
    for (const r of RARITIES) if (r.id === id) return r;
    return RARITIES[0];
  }

  function kindDef(id) {
    for (const k of KINDS) if (k.id === id) return k;
    return KINDS[0];
  }

  /** その部署のレベル (0 = まだ建てていない)。 */
  function roomLevel(state, id) {
    return state.rooms[id] || 0;
  }

  function builtRooms(state) {
    return ROOMS.filter((def) => roomLevel(state, def.id) > 0);
  }

  function catsIn(state, roomId) {
    return state.cats.filter((c) => c.room === roomId);
  }

  // ------------------------------------------------------------ 数のしくみ

  /**
   * 工場レベル。「建てた部署のレベルの合計 + ねこの数 + 1」で決める。
   * どこにも保存しないので、セーブが壊れてもズレようがない。
   */
  function factoryLevel(state) {
    let sum = 1;
    for (const def of ROOMS) sum += roomLevel(state, def.id);
    return sum + state.cats.length;
  }

  /** ねこ 1 ぴきの力。レア度 × レベル。 */
  function catPower(cat) {
    return rarityDef(cat.rarity).power * (1 + 0.25 * (cat.level - 1));
  }

  /** その部署にいるねこの合計倍率 (ねこ 0 ひきなら 1 倍)。 */
  function roomCatBonus(state, roomId) {
    let bonus = 1;
    for (const cat of state.cats) if (cat.room === roomId) bonus += catPower(cat);
    return bonus;
  }

  /** きゅうけい室の効果。工場ぜんたいのもうけにかかる倍率。 */
  function boostMultiplier(state) {
    let mult = 1;
    for (const def of ROOMS) {
      if (def.kind !== 'boost') continue;
      const level = roomLevel(state, def.id);
      if (level <= 0) continue;
      mult += level * def.boostPerLevel * roomCatBonus(state, def.id);
    }
    return mult;
  }

  /** 部署 1 つのもうけ (円/秒)。きゅうけい室は 0 (かわりに倍率を出す)。 */
  function roomRate(state, roomId) {
    const def = roomDef(roomId);
    const level = roomLevel(state, roomId);
    if (!def || level <= 0 || def.kind !== 'produce') return 0;
    return def.baseRate * level * roomCatBonus(state, roomId);
  }

  /** 工場ぜんたいのもうけ (円/秒)。 */
  function totalRate(state) {
    let sum = 0;
    for (const def of ROOMS) sum += roomRate(state, def.id);
    return sum * boostMultiplier(state);
  }

  /** 次にそのレベルへ上げる値段。level 0 のときは「建てる値段」。 */
  function upgradeCost(state, roomId) {
    const def = roomDef(roomId);
    if (!def) return Infinity;
    return Math.ceil(def.baseCost * Math.pow(def.growth, roomLevel(state, roomId)));
  }

  function isUnlocked(state, roomId) {
    const def = roomDef(roomId);
    return !!def && factoryLevel(state) >= def.unlock;
  }

  /** 買えるだけ買ったら何レベル上がるか。まとめ買いの表示に使う。 */
  function affordableLevels(state, roomId, budget) {
    const def = roomDef(roomId);
    if (!def) return { levels: 0, cost: 0 };
    let level = roomLevel(state, roomId);
    let cost = 0;
    let levels = 0;
    for (let i = 0; i < 500; i++) {
      const next = Math.ceil(def.baseCost * Math.pow(def.growth, level));
      if (cost + next > budget) break;
      cost += next;
      level++;
      levels++;
    }
    return { levels: levels, cost: cost };
  }

  function catLevelCost(cat) {
    const idx = RARITIES.findIndex((r) => r.id === cat.rarity);
    return Math.ceil((4 + 4 * idx) * Math.pow(1.55, cat.level - 1));
  }

  // ------------------------------------------------------------ 動かす

  function newCat(rng, opts) {
    const options = opts || {};
    const minIndex = options.minRarity ? RARITIES.findIndex((r) => r.id === options.minRarity) : 0;
    const rarity = weighted(rng, RARITIES, minIndex > 0 ? minIndex : 0);
    return {
      id: 'c' + Math.floor(rng() * 0xffffffff).toString(36) + Date.now().toString(36).slice(-4),
      name: pick(rng, NAMES),
      kind: pick(rng, KINDS).id,
      rarity: rarity.id,
      level: 1,
      room: null,
      face: Math.floor(rng() * 4)
    };
  }

  /** あいている席をさがす。作った部署のうち、ねこの少ないところから。 */
  function findOpenRoom(state) {
    let best = null;
    let bestCount = Infinity;
    for (const def of ROOMS) {
      if (roomLevel(state, def.id) <= 0) continue;
      const count = catsIn(state, def.id).length;
      if (count < def.slots && count < bestCount) {
        best = def.id;
        bestCount = count;
      }
    }
    return best;
  }

  function addCat(state, cat) {
    state.cats.push(cat);
    const room = findOpenRoom(state);
    if (room) cat.room = room;
    return cat;
  }

  /** 席の数を超えないように配属する。超えるなら false を返して何もしない。 */
  function assignCat(state, catId, roomId) {
    const cat = state.cats.find((c) => c.id === catId);
    if (!cat) return false;
    if (roomId === null) { cat.room = null; return true; }
    const def = roomDef(roomId);
    if (!def || roomLevel(state, roomId) <= 0) return false;
    if (cat.room === roomId) return true;
    if (catsIn(state, roomId).length >= def.slots) return false;
    cat.room = roomId;
    return true;
  }

  function buyUpgrade(state, roomId) {
    if (!isUnlocked(state, roomId)) return false;
    const cost = upgradeCost(state, roomId);
    if (state.money < cost) return false;
    state.money -= cost;
    state.rooms[roomId] = roomLevel(state, roomId) + 1;
    // 建てたばかりの部署には、あぶれているねこを入れてあげる
    if (state.rooms[roomId] === 1) {
      for (const cat of state.cats) {
        if (cat.room === null && catsIn(state, roomId).length < roomDef(roomId).slots) cat.room = roomId;
      }
    }
    return true;
  }

  function levelUpCat(state, catId) {
    const cat = state.cats.find((c) => c.id === catId);
    if (!cat) return false;
    const cost = catLevelCost(cat);
    if (state.paw < cost) return false;
    state.paw -= cost;
    cat.level++;
    return true;
  }

  function gacha(state, count, rng) {
    const n = count === 10 ? 10 : 1;
    const cost = n === 10 ? GACHA_COST_10 : GACHA_COST;
    if (state.paw < cost) return null;
    state.paw -= cost;
    const got = [];
    for (let i = 0; i < n; i++) {
      // 10 連の最後は、レア以上が出ていなければレア以上を確定させる
      const needRare = n === 10 && i === 9 && got.every((c) => c.rarity === 'N');
      got.push(addCat(state, newCat(rng, needRare ? { minRarity: 'R' } : null)));
    }
    state.gachaCount += n;
    return got;
  }

  // ------------------------------------------------------------ 時間

  /**
   * 時間を進める。もうけも時計もここだけで動かすので、
   * 表示と中身がズレることがない。
   * @returns {number} このあいだにもうけた額
   */
  function tick(state, dtMs) {
    const dt = Math.max(0, Math.min(dtMs, TICK_CAP_MS));
    const sec = dt / 1000;
    const earned = totalRate(state) * sec;
    state.money += earned;
    state.totalEarned += earned;
    state.gameMinutes = (state.gameMinutes + sec * GAME_MIN_PER_SEC) % 1440;
    state.playMs += dt;
    return earned;
  }

  /**
   * 留守中のもうけ。上限 8 時間、もらえるのは 4 割。
   * state は変えない。受け取るときは claimOffline を呼ぶ。
   */
  function offlineReport(state, now) {
    const elapsed = Math.max(0, (now || Date.now()) - state.lastSeen);
    const capped = Math.min(elapsed, OFFLINE_CAP_MS);
    const money = totalRate(state) * (capped / 1000) * OFFLINE_RATE;
    const paw = Math.floor(capped / (30 * 60 * 1000));
    return { elapsedMs: elapsed, cappedMs: capped, money: money, paw: paw };
  }

  function claimOffline(state, report) {
    state.money += report.money;
    state.totalEarned += report.money;
    state.paw += report.paw;
    state.gameMinutes = (state.gameMinutes + (report.cappedMs / 1000) * GAME_MIN_PER_SEC) % 1440;
  }

  /** タップ 1 回のごほうび = 1 秒ぶんのもうけ (最低 1 円)。 */
  function tapReward(state) {
    state.taps++;
    return Math.max(1, Math.floor(totalRate(state)));
  }

  /** 部署の上に浮かぶあわ。ときどき にくきゅう が出る。 */
  function bubbleReward(state, roomId, rng) {
    if (rng() < 0.12) return { kind: 'paw', amount: 1 + Math.floor(rng() * 3) };
    const rate = roomRate(state, roomId) * boostMultiplier(state);
    return { kind: 'money', amount: Math.max(5, Math.floor(rate * 30)) };
  }

  function claimBubble(state, reward) {
    if (reward.kind === 'paw') state.paw += reward.amount;
    else { state.money += reward.amount; state.totalEarned += reward.amount; }
  }

  // ------------------------------------------------------------ ごほうび

  /** 工場レベルが上がったぶんだけ にくきゅう を配る。何回呼んでも二重にならない。 */
  function claimLevelRewards(state) {
    const level = factoryLevel(state);
    if (level <= state.rewardedLevel) return 0;
    const gained = level - state.rewardedLevel;
    state.rewardedLevel = level;
    state.paw += gained;
    return gained;
  }

  /** 新しく達成したものを返し、ごほうびを渡す。 */
  function claimAchievements(state) {
    const fresh = [];
    for (const a of ACHIEVEMENTS) {
      if (state.done[a.id]) continue;
      if (!a.test(state)) continue;
      state.done[a.id] = 1;
      state.paw += a.paw;
      fresh.push(a);
    }
    return fresh;
  }

  /** まだ手をつけていないことがあるか (下のボタンの赤い印に使う)。 */
  function badges(state) {
    const canBuy = ROOMS.some((def) => isUnlocked(state, def.id) && state.money >= upgradeCost(state, def.id));
    const canGacha = state.paw >= GACHA_COST;
    const canLevel = state.cats.some((c) => state.paw >= catLevelCost(c));
    const hasIdle = state.cats.some((c) => c.room === null) && findOpenRoom(state) !== null;
    const canAchieve = ACHIEVEMENTS.some((a) => !state.done[a.id] && a.test(state));
    return {
      rooms: canBuy,
      cats: canLevel || hasIdle,
      gacha: canGacha,
      awards: canAchieve
    };
  }

  // ------------------------------------------------------------ セーブ

  function newGame(seed) {
    const s = {
      version: SAVE_VERSION,
      seed: (seed === undefined ? (Math.random() * 4294967296) >>> 0 : seed) >>> 0,
      money: 0,
      paw: 12,
      totalEarned: 0,
      taps: 0,
      gachaCount: 0,
      playMs: 0,
      gameMinutes: START_GAME_MIN,
      rooms: {},
      cats: [],
      done: {},
      rewardedLevel: 0,
      lastSeen: Date.now()
    };
    s.rooms.gohan = 1;
    const rng = mulberry32(s.seed);
    addCat(s, newCat(rng));
    s.rewardedLevel = factoryLevel(s);
    return s;
  }

  function serialize(state) {
    return JSON.stringify(state);
  }

  /**
   * 読み込み。壊れていたり、項目が足りなくても新品の値で埋めて必ず動かす。
   * 「セーブが壊れると開けない」を仕組みで防ぐ。
   */
  function deserialize(text, fallbackSeed) {
    const base = newGame(fallbackSeed);
    let raw;
    try {
      raw = JSON.parse(text);
    } catch (e) {
      return base;
    }
    if (!raw || typeof raw !== 'object') return base;

    const s = base;
    if (Number.isFinite(raw.seed)) s.seed = raw.seed >>> 0;
    for (const key of ['money', 'paw', 'totalEarned', 'taps', 'gachaCount', 'playMs', 'rewardedLevel']) {
      if (Number.isFinite(raw[key]) && raw[key] >= 0) s[key] = raw[key];
    }
    if (Number.isFinite(raw.gameMinutes)) s.gameMinutes = ((raw.gameMinutes % 1440) + 1440) % 1440;
    if (Number.isFinite(raw.lastSeen) && raw.lastSeen > 0) s.lastSeen = raw.lastSeen;

    s.rooms = {};
    if (raw.rooms && typeof raw.rooms === 'object') {
      const rooms = {};
      for (const key of Object.keys(raw.rooms)) rooms[OLD_ROOM_IDS[key] || key] = raw.rooms[key];
      for (const def of ROOMS) {
        const level = rooms[def.id];
        if (Number.isFinite(level) && level > 0) s.rooms[def.id] = Math.floor(level);
      }
    }
    if (!builtRooms(s).length) s.rooms.gohan = 1;

    s.cats = [];
    if (Array.isArray(raw.cats)) {
      for (const c of raw.cats) {
        if (!c || typeof c.id !== 'string') continue;
        const moved = OLD_ROOM_IDS[c.room] || c.room;
        const room = roomDef(moved) && s.rooms[moved] > 0 ? moved : null;
        s.cats.push({
          id: c.id,
          name: typeof c.name === 'string' ? c.name : NAMES[0],
          kind: kindDef(c.kind).id,
          rarity: rarityDef(c.rarity).id,
          level: Number.isFinite(c.level) && c.level >= 1 ? Math.floor(c.level) : 1,
          room: room,
          face: Number.isFinite(c.face) ? c.face & 3 : 0
        });
      }
    }
    // 席あふれを直す (部署をせまくしてもセーブが壊れないように)
    for (const def of ROOMS) {
      const inRoom = catsIn(s, def.id);
      for (let i = def.slots; i < inRoom.length; i++) inRoom[i].room = null;
    }
    if (!s.cats.length) addCat(s, newCat(mulberry32(s.seed)));

    s.done = {};
    if (raw.done && typeof raw.done === 'object') {
      for (const a of ACHIEVEMENTS) if (raw.done[a.id]) s.done[a.id] = 1;
    }
    if (s.rewardedLevel > factoryLevel(s)) s.rewardedLevel = factoryLevel(s);
    return s;
  }

  // ------------------------------------------------------------ 見せ方

  /** 3 けたごとにカンマ。1 兆からは 兆/京/垓 でまとめる。 */
  function formatNumber(value) {
    if (!isFinite(value)) return '∞';
    const n = Math.floor(Math.abs(value));
    const sign = value < 0 ? '-' : '';
    if (n < 1e12) return sign + String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    const units = [[1e20, '垓'], [1e16, '京'], [1e12, '兆']];
    for (const u of units) {
      if (n >= u[0]) {
        const x = n / u[0];
        const text = x >= 100 ? x.toFixed(0) : x >= 10 ? x.toFixed(1) : x.toFixed(2);
        return sign + text.replace(/\.?0+$/, '') + u[1];
      }
    }
    return sign + String(n);
  }

  /** 10 秒あたりのもうけ。画面の上に出る「◯◯ /10s」。 */
  function formatRate(state) {
    return formatNumber(totalRate(state) * 10);
  }

  /** ゲーム内の時計。朝・昼・夕・夜のどれかも返す。 */
  function gameClock(state) {
    const total = ((state.gameMinutes % 1440) + 1440) % 1440;
    const h = Math.floor(total / 60);
    const m = Math.floor(total % 60);
    let phase = 'night';
    if (h >= 5 && h < 9) phase = 'morning';
    else if (h >= 9 && h < 17) phase = 'day';
    else if (h >= 17 && h < 19) phase = 'evening';
    return {
      h: h, m: m, phase: phase,
      text: String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0')
    };
  }

  /** 留守の長さを「◯時間◯分」で。 */
  function formatDuration(ms) {
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    if (h > 0) return h + ' 時間 ' + m + ' 分';
    if (m > 0) return m + ' 分';
    return Math.max(1, total) + ' 秒';
  }

  // ------------------------------------------------------------ アイソメトリック

  /** 升目の座標 → 画面の座標。z は高さ (上に上がる)。 */
  function iso(x, y, z) {
    return {
      x: (x - y) * (TILE.w / 2),
      y: (x + y) * (TILE.h / 2) - (z || 0)
    };
  }

  /** 点の並びを SVG の polygon 用の文字列にする。 */
  function isoPoly(points) {
    return points.map(function (p) {
      const q = iso(p[0], p[1], p[2]);
      return q.x.toFixed(2) + ',' + q.y.toFixed(2);
    }).join(' ');
  }

  /** 升目ぜんたいが収まる四角。カメラの初期位置に使う。 */
  function sceneBounds() {
    const corners = [iso(0, 0, TILE.wall + 30), iso(GRID.w, 0, 0), iso(0, GRID.h, 0), iso(GRID.w, GRID.h, -20)];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const c of corners) {
      minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x);
      minY = Math.min(minY, c.y); maxY = Math.max(maxY, c.y);
    }
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
  }

  /** ベルトコンベアが通る位置。持ち場と同じく、部屋の左上からの相対座標。 */
  function beltLine(def) {
    return { y: def.h / 2, x0: 1.35, x1: def.w - 0.55 };
  }

  /**
   * 持ち場の位置 (升目の相対座標)。ベルトをはさんで両側に立つ。
   * side が -1 なら奥がわ、+1 なら手前がわ。
   * 数がいくつでも部屋からはみ出さないように、幅から割り出す。
   */
  function slotPositions(def) {
    const n = def.slots;
    const cols = Math.ceil(n / 2);
    const midY = def.h / 2;
    const gap = Math.min(0.95, midY - 0.35);
    const out = [];
    for (let i = 0; i < n; i++) {
      const col = i % cols;
      const side = i < cols ? -1 : 1;
      out.push({
        x: 1.35 + (def.w - 2.05) * (cols === 1 ? 0.5 : col / (cols - 1)),
        y: midY + side * gap,
        side: side
      });
    }
    return out;
  }

  // ------------------------------------------------------------ 出口

  return {
    SAVE_KEY: SAVE_KEY,
    SAVE_VERSION: SAVE_VERSION,
    TILE: TILE,
    GRID: GRID,
    ROOMS: ROOMS,
    RARITIES: RARITIES,
    KINDS: KINDS,
    NAMES: NAMES,
    ACHIEVEMENTS: ACHIEVEMENTS,
    GACHA_COST: GACHA_COST,
    GACHA_COST_10: GACHA_COST_10,
    OFFLINE_CAP_MS: OFFLINE_CAP_MS,
    OFFLINE_RATE: OFFLINE_RATE,

    mulberry32: mulberry32,
    pick: pick,
    weighted: weighted,

    roomDef: roomDef,
    rarityDef: rarityDef,
    kindDef: kindDef,
    roomLevel: roomLevel,
    builtRooms: builtRooms,
    catsIn: catsIn,

    factoryLevel: factoryLevel,
    catPower: catPower,
    roomCatBonus: roomCatBonus,
    boostMultiplier: boostMultiplier,
    roomRate: roomRate,
    totalRate: totalRate,
    upgradeCost: upgradeCost,
    isUnlocked: isUnlocked,
    affordableLevels: affordableLevels,
    catLevelCost: catLevelCost,

    newCat: newCat,
    addCat: addCat,
    assignCat: assignCat,
    findOpenRoom: findOpenRoom,
    buyUpgrade: buyUpgrade,
    levelUpCat: levelUpCat,
    gacha: gacha,

    tick: tick,
    offlineReport: offlineReport,
    claimOffline: claimOffline,
    tapReward: tapReward,
    bubbleReward: bubbleReward,
    claimBubble: claimBubble,

    claimLevelRewards: claimLevelRewards,
    claimAchievements: claimAchievements,
    badges: badges,

    newGame: newGame,
    serialize: serialize,
    deserialize: deserialize,

    formatNumber: formatNumber,
    formatRate: formatRate,
    gameClock: gameClock,
    formatDuration: formatDuration,

    iso: iso,
    isoPoly: isoPoly,
    sceneBounds: sceneBounds,
    beltLine: beltLine,
    slotPositions: slotPositions
  };
});
