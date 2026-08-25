/*!
 * app.js — 画面まわり。工場の絵、指の操作、パネル。
 *
 * 絵はぜんぶ 1 枚の SVG。カメラ (#camera) の transform だけを動かすので、
 * 指でずらしても拡大しても、当たり判定の座標を計算し直さなくていい。
 */
(function () {
  'use strict';

  const C = window.Core;
  const TILE = C.TILE;

  // ------------------------------------------------------------ 部品

  const $ = (id) => document.getElementById(id);
  const els = {
    app: $('app'), scene: $('scene'), world: $('world'), defs: $('worldDefs'), sky: $('sky'),
    camera: $('camera'), ground: $('layerGround'), rooms: $('layerRooms'),
    signs: $('layerSigns'), fx: $('layerFx'),
    lv: $('lvValue'), money: $('money'), paw: $('paw'), rate: $('rate'),
    clock: $('clock'), clockIco: $('clockIco'),
    dock: $('dock'), sheetWrap: $('sheetWrap'), sheet: $('sheet'),
    sheetTitle: $('sheetTitle'), sheetBody: $('sheetBody'), sheetClose: $('sheetClose'),
    sheetBack: $('sheetBack'), modalWrap: $('modalWrap'), modal: $('modal'), toasts: $('toasts')
  };

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function esc(text) {
    return String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  /** 升目の座標を "x,y" にする。polygon の points 用。 */
  function pt(x, y, z) {
    const p = C.iso(x, y, z || 0);
    return p.x.toFixed(1) + ',' + p.y.toFixed(1);
  }
  function poly(points, fill, stroke, width) {
    return '<polygon points="' + points.join(' ') + '" fill="' + fill + '"' +
      (stroke ? ' stroke="' + stroke + '" stroke-width="' + (width || 2) + '" stroke-linejoin="round"' : '') + '/>';
  }

  const INK = '#8e5a63';

  /** アイソメトリックの箱。上・右・左の 3 面。 */
  function isoBox(cx, cy, w, d, h, top, right, left) {
    const x0 = cx - w / 2, x1 = cx + w / 2, y0 = cy - d / 2, y1 = cy + d / 2;
    return poly([pt(x0, y0, h), pt(x1, y0, h), pt(x1, y1, h), pt(x0, y1, h)], top, INK, 1.6) +
      poly([pt(x1, y0, h), pt(x1, y1, h), pt(x1, y1, 0), pt(x1, y0, 0)], right, INK, 1.6) +
      poly([pt(x1, y1, h), pt(x0, y1, h), pt(x0, y1, 0), pt(x1, y1, 0)], left, INK, 1.6);
  }

  // ------------------------------------------------------------ ねこの絵

  /*
   * ねこは「まるい頭 + まるい体」の 2 つの塊だけで作る。
   * 頭を体より大きくして、顔のパーツを下のほうに寄せると幼く見える。
   * 足もとが (0,0)、頭のてっぺんが y=-63。
   */
  const BODY_PATH = 'M0,-30.5 C11.4,-30.5 19,-21.6 19,-11.4 C19,-3.4 12.6,1.6 0,1.6 ' +
    'C-12.6,1.6 -19,-3.4 -19,-11.4 C-19,-21.6 -11.4,-30.5 0,-30.5 Z';

  // ほっぺたのところを少しふくらませて、もふっとした輪郭にする
  const HEAD_PATH = 'M0,-63 C11.6,-63 20.2,-54.8 20.2,-45.2 C20.2,-42.6 21.8,-41 21,-39 ' +
    'C20.2,-37 17.8,-36.9 16.8,-34.8 C13.6,-29.6 7.4,-26.6 0,-26.6 ' +
    'C-7.4,-26.6 -13.6,-29.6 -16.8,-34.8 C-17.8,-36.9 -20.2,-37 -21,-39 ' +
    'C-21.8,-41 -20.2,-42.6 -20.2,-45.2 C-20.2,-54.8 -11.6,-63 0,-63 Z';

  const EAR_PATH = 'M-17,-52.4 C-18.8,-58.6 -18.4,-64.2 -15.8,-65.2 C-13.2,-66.2 -8.6,-61.4 -5.2,-57.4 Z';
  const EAR_INNER = 'M-15.3,-54 C-16.5,-58.4 -16.2,-62 -14.8,-62.6 C-13.4,-63.2 -10.6,-60.2 -8.4,-57.6 Z';

  const EYE_OPEN =
    '<ellipse cx="-8.2" cy="-43" rx="4.1" ry="4.9" fill="#3b3140"/>' +
    '<ellipse cx="8.2" cy="-43" rx="4.1" ry="4.9" fill="#3b3140"/>' +
    '<circle cx="-6.7" cy="-44.8" r="1.6" fill="#fff"/><circle cx="9.7" cy="-44.8" r="1.6" fill="#fff"/>' +
    '<circle cx="-9.5" cy="-41.2" r="0.9" fill="#fff" opacity=".7"/>' +
    '<circle cx="6.9" cy="-41.2" r="0.9" fill="#fff" opacity=".7"/>';

  const FACE_EYES = [
    EYE_OPEN,
    // にっこり
    '<path d="M-12.6,-43 q4.4,-5 8.8,0 M3.8,-43 q4.4,-5 8.8,0" fill="none" stroke="#3b3140" ' +
      'stroke-width="2.4" stroke-linecap="round"/>',
    // ねむい
    '<path d="M-12.6,-43.6 q4.4,4 8.8,0 M3.8,-43.6 q4.4,4 8.8,0" fill="none" stroke="#3b3140" ' +
      'stroke-width="2.4" stroke-linecap="round"/>',
    // かたっぽウインク
    '<ellipse cx="-8.2" cy="-43" rx="4.1" ry="4.9" fill="#3b3140"/>' +
      '<circle cx="-6.7" cy="-44.8" r="1.6" fill="#fff"/>' +
      '<path d="M3.8,-43 q4.4,-5 8.8,0" fill="none" stroke="#3b3140" stroke-width="2.4" stroke-linecap="round"/>'
  ];

  /**
   * ねこ 1 ぴきの絵。apron に部署の色を渡すと、その部署の前かけをつける。
   */
  function catSVG(cat, apron) {
    const k = C.kindDef(cat.kind);
    const r = C.rarityDef(cat.rarity);
    const fur = k.fur, dark = k.dark, belly = k.belly;
    const earFill = k.points ? dark : fur;
    let s = '';

    // しっぽ (体のうしろ)。太い線を 2 本かさねて縁取りにする
    const tail = 'M15,-9 C30,-11.5 34.5,-23 28.5,-31.4 C26,-35 21.4,-34.2 20.4,-30.4';
    s += '<path d="' + tail + '" fill="none" stroke="' + INK + '" stroke-width="12" stroke-linecap="round"/>';
    s += '<path d="' + tail + '" fill="none" stroke="' + fur + '" stroke-width="8.4" stroke-linecap="round"/>';

    // からだ
    s += '<path class="body" d="' + BODY_PATH + '" fill="' + fur + '" stroke="' + INK +
      '" stroke-width="2.2" stroke-linejoin="round"/>';
    s += '<ellipse cx="0" cy="-8" rx="11.4" ry="9.2" fill="' + belly + '" opacity=".85"/>';
    if (k.stripes) {
      s += '<path d="M-15.6,-20.4 q4.6,2.4 0,5.2 M15.6,-20.4 q-4.6,2.4 0,5.2" fill="none" stroke="' + dark +
        '" stroke-width="2.4" stroke-linecap="round"/>';
    }
    if (k.calico) s += '<ellipse cx="9.6" cy="-21" rx="6.6" ry="5.4" fill="#f0a860" opacity=".9"/>';

    // 前あし
    s += '<ellipse cx="-8.4" cy="-1.4" rx="6.3" ry="4.5" fill="' + belly + '" stroke="' + INK + '" stroke-width="1.9"/>';
    s += '<ellipse cx="8.4" cy="-1.4" rx="6.3" ry="4.5" fill="' + belly + '" stroke="' + INK + '" stroke-width="1.9"/>';
    s += '<path d="M-8.4,-4.4 v2.2 M-11,-3.8 v1.8 M-5.8,-3.8 v1.8 M8.4,-4.4 v2.2 M5.8,-3.8 v1.8 M11,-3.8 v1.8" ' +
      'fill="none" stroke="' + INK + '" stroke-width="1" stroke-linecap="round" opacity=".45"/>';

    // 前かけ (部署の色)
    if (apron) {
      s += '<path d="M-13,-27.4 C-6.6,-21.6 6.6,-21.6 13,-27.4 C12,-18.6 6.8,-14.6 0,-14.6 ' +
        'C-6.8,-14.6 -12,-18.6 -13,-27.4 Z" fill="' + apron + '" stroke="' + INK +
        '" stroke-width="1.9" stroke-linejoin="round"/>';
      s += '<path d="M-5.6,-20.6 h11.2" fill="none" stroke="' + INK + '" stroke-width="1.4" opacity=".45"/>';
    }

    // みみ (頭のうしろ)。右は左を鏡にしてゆがみを出さない
    const ear = '<path d="' + EAR_PATH + '" fill="' + earFill + '" stroke="' + INK +
      '" stroke-width="2.2" stroke-linejoin="round"/><path d="' + EAR_INNER + '" fill="#ffb3c4" opacity=".92"/>';
    s += ear + '<g transform="scale(-1,1)">' + ear + '</g>';

    // あたま
    s += '<path d="' + HEAD_PATH + '" fill="' + fur + '" stroke="' + INK +
      '" stroke-width="2.2" stroke-linejoin="round"/>';
    if (k.points) s += '<ellipse cx="0" cy="-35.5" rx="12.4" ry="9.4" fill="' + dark + '" opacity=".38"/>';
    if (k.calico) s += '<ellipse cx="-10.2" cy="-50" rx="7.8" ry="6" fill="#f0a860" opacity=".92"/>';
    if (k.tuxedo) s += '<path d="M0,-61.4 q5.4,9.2 0,15.8 q-5.4,-6.6 0,-15.8" fill="#ffffff"/>';
    if (k.stripes) {
      s += '<path d="M-8,-57.6 l-1,4.8 M0,-59.8 l0,5 M8,-57.6 l1,4.8" fill="none" stroke="' + dark +
        '" stroke-width="2.4" stroke-linecap="round"/>';
    }

    // かお。目と口を下のほうに寄せると幼く見える
    s += '<ellipse cx="0" cy="-36" rx="10.4" ry="7.2" fill="' + belly + '" opacity=".72"/>';
    s += '<ellipse cx="-14.2" cy="-37.4" rx="4.6" ry="2.9" fill="#ffa3ba" opacity=".72"/>';
    s += '<ellipse cx="14.2" cy="-37.4" rx="4.6" ry="2.9" fill="#ffa3ba" opacity=".72"/>';
    s += FACE_EYES[cat.face & 3];
    s += '<path d="M-2.7,-38.6 L2.7,-38.6 L0,-35.6 Z" fill="#ff93a9" stroke="' + INK +
      '" stroke-width="1" stroke-linejoin="round"/>';
    s += '<path d="M0,-35.4 q-3.4,3.6 -6.2,.2 M0,-35.4 q3.4,3.6 6.2,.2" fill="none" stroke="' + INK +
      '" stroke-width="1.6" stroke-linecap="round"/>';
    s += '<path d="M-12.6,-38.6 l-8.4,-2.4 M-12.6,-35.6 l-8.4,1.6 M12.6,-38.6 l8.4,-2.4 M12.6,-35.6 l8.4,1.6" ' +
      'fill="none" stroke="' + INK + '" stroke-width="1.1" stroke-linecap="round" opacity=".42"/>';

    // レア度のしるし
    if (r.id === 'R') {
      s += '<g transform="translate(-13.5,-56) rotate(-16)">' +
        '<path d="M0,0 l-7,-4.6 l0,8 z M0,0 l7,-4.6 l0,8 z" fill="#ff7fa8" stroke="' + INK +
        '" stroke-width="1.5" stroke-linejoin="round"/>' +
        '<circle cx="0" cy="1.6" r="2.8" fill="#ffd0e0" stroke="' + INK + '" stroke-width="1.3"/></g>';
    } else if (r.id === 'SR') {
      s += '<path d="M-10.4,-57.6 L-8.4,-67.4 L-3.2,-62 L0,-69.6 L3.2,-62 L8.4,-67.4 L10.4,-57.6 Z" ' +
        'fill="#ffd24a" stroke="' + INK + '" stroke-width="1.8" stroke-linejoin="round"/>' +
        '<circle cx="0" cy="-60.4" r="1.6" fill="#ff7fa8"/>';
    } else if (r.id === 'UR') {
      s += '<ellipse cx="0" cy="-70.5" rx="11.4" ry="3.8" fill="none" stroke="#ffdc55" stroke-width="3.6"/>';
      s += '<path d="M-25,-50 l1.6,3.8 l3.8,1.6 l-3.8,1.6 l-1.6,3.8 l-1.6,-3.8 l-3.8,-1.6 l3.8,-1.6 z" fill="#fff3a8"/>';
      s += '<path d="M25,-57 l1.2,3 l3,1.2 l-3,1.2 l-1.2,3 l-1.2,-3 l-3,-1.2 l3,-1.2 z" fill="#fff3a8"/>';
    }
    return s;
  }

  /** パネルに出す小さいねこ。 */
  function catPortrait(cat, size) {
    const h = size || 52;
    return '<svg viewBox="-37 -78 74 82" width="' + (h * 74 / 82).toFixed(0) + '" height="' + h + '" aria-hidden="true">' +
      catSVG(cat, null) + '</svg>';
  }

  // ------------------------------------------------------------ 工場の絵

  const ROOM_NO = {};
  C.ROOMS.forEach((def, i) => { ROOM_NO[def.id] = 101 + i; });

  function shade(hex, amount) {
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => clamp(Math.round(v + amount), 0, 255);
    return '#' + [f((n >> 16) & 255), f((n >> 8) & 255), f(n & 255)]
      .map((v) => v.toString(16).padStart(2, '0')).join('');
  }

  function line(ax, ay, az, bx, by, bz) {
    const p = C.iso(ax, ay, az || 0);
    const q = C.iso(bx, by, bz || 0);
    return '<line x1="' + p.x.toFixed(1) + '" y1="' + p.y.toFixed(1) +
      '" x2="' + q.x.toFixed(1) + '" y2="' + q.y.toFixed(1) + '"/>';
  }

  function at(x, y, z, inner) {
    const p = C.iso(x, y, z || 0);
    return '<g transform="translate(' + p.x.toFixed(1) + ' ' + p.y.toFixed(1) + ')">' + inner + '</g>';
  }

  /** 敷地。廊下、外の木、煙突。 */
  function groundMarkup() {
    const m = 0.6, GW = C.GRID.w, GH = C.GRID.h, drop = -20;
    let s = '';
    // 煙突 (建物のうしろ)
    s += chimneyMarkup(4.6, -1.9, 118);
    s += chimneyMarkup(6.4, -2.3, 92);
    // 側面 (手前の 2 辺を下に伸ばす)
    s += poly([pt(GW + m, -m, 0), pt(GW + m, GH + m, 0), pt(GW + m, GH + m, drop), pt(GW + m, -m, drop)], '#d9bda6', INK, 2);
    s += poly([pt(-m, GH + m, 0), pt(GW + m, GH + m, 0), pt(GW + m, GH + m, drop), pt(-m, GH + m, drop)], '#c9a992', INK, 2);
    // 床
    s += poly([pt(-m, -m), pt(GW + m, -m), pt(GW + m, GH + m), pt(-m, GH + m)], '#eddccd', INK, 2);
    // 廊下のタイル目地
    let lines = '';
    for (let x = 0; x <= GW; x++) lines += line(x, -m, 0, x, GH + m, 0);
    for (let y = 0; y <= GH; y++) lines += line(-m, y, 0, GW + m, y, 0);
    s += '<g stroke="#dcc4b1" stroke-width="1" fill="none">' + lines + '</g>';
    // 廊下の黄色い区画線
    s += '<g stroke="#f5c33c" stroke-width="2.4" stroke-dasharray="10 8" fill="none" opacity=".8">' +
      line(4.5, -m, 0, 4.5, GH + m, 0) + line(-m, 3.5, 0, GW + m, 3.5, 0) + line(-m, 7.5, 0, GW + m, 7.5, 0) +
      '</g>';

    const trees = [[-2.6, 1.5], [-2.2, 6.5], [GW + 2.4, 2.2], [GW + 2.1, 7.6], [3, GH + 2.6]];
    for (const t of trees) s += treeMarkup(t[0], t[1]);
    return s;
  }

  function chimneyMarkup(x, y, height) {
    const w = 30, top = -height;
    let puffs = '';
    for (let i = 0; i < 4; i++) {
      puffs += '<g class="puff" data-phase="' + (i / 4) + '">' +
        '<circle cx="0" cy="' + (top - 12) + '" r="13" fill="#ffffff" opacity=".82"/></g>';
    }
    return at(x, y, 0,
      '<ellipse cx="0" cy="0" rx="26" ry="11" fill="rgba(90,80,70,.22)"/>' +
      '<path d="M' + (-w / 2) + ',0 L' + (-w / 2 + 5) + ',' + top + ' L' + (w / 2 - 5) + ',' + top + ' L' + (w / 2) +
      ',0 Z" fill="#f6ece2" stroke="' + INK + '" stroke-width="2.6" stroke-linejoin="round"/>' +
      '<path d="M' + (-w / 2 + 3.2) + ',' + (top * 0.72) + ' L' + (w / 2 - 3.2) + ',' + (top * 0.72) +
      ' L' + (w / 2 - 4.2) + ',' + (top * 0.86) + ' L' + (-w / 2 + 4.2) + ',' + (top * 0.86) +
      ' Z" fill="#ff9c8f" stroke="' + INK + '" stroke-width="2"/>' +
      '<ellipse cx="0" cy="' + top + '" rx="' + (w / 2 - 5) + '" ry="5" fill="#c9b6a6" stroke="' + INK + '" stroke-width="2.2"/>' +
      puffs);
  }

  function treeMarkup(x, y) {
    return at(x, y, 0,
      '<ellipse cx="0" cy="0" rx="20" ry="9" fill="rgba(90,110,60,.22)"/>' +
      '<rect x="-4" y="-30" width="8" height="30" rx="3" fill="#b07f57" stroke="' + INK + '" stroke-width="2"/>' +
      '<circle cx="0" cy="-44" r="24" fill="#8fc46a" stroke="' + INK + '" stroke-width="2.4"/>' +
      '<circle cx="-14" cy="-34" r="15" fill="#9ed07a" stroke="' + INK + '" stroke-width="2.4"/>' +
      '<circle cx="14" cy="-34" r="15" fill="#7fb85e" stroke="' + INK + '" stroke-width="2.4"/>');
  }

  // ---- ベルトコンベア --------------------------------------------------

  const BELT_H = 13;

  function beltMarkup(def) {
    const b = C.beltLine(def);
    const x0 = def.x + b.x0, x1 = def.x + b.x1, by = def.y + b.y;
    const len = x1 - x0, cx = (x0 + x1) / 2;
    let s = '';
    // 脚
    for (let i = 0; i <= 3; i++) {
      s += isoBox(x0 + (len * i) / 3, by, 0.16, 0.46, BELT_H - 3, '#8d97a6', '#767f8d', '#6b7481');
    }
    // 本体
    s += isoBox(cx, by, len, 0.84, BELT_H, '#6c7586', '#575f6d', '#4c5361');
    // ローラー
    const n = Math.max(4, Math.round(len * 3.2));
    let rollers = '';
    for (let i = 0; i <= n; i++) {
      const rx = x0 + (len * i) / n;
      rollers += line(rx, by - 0.42, BELT_H, rx, by + 0.42, BELT_H);
    }
    s += '<g stroke="#98a2b1" stroke-width="1.6" stroke-linecap="round" fill="none">' + rollers + '</g>';
    return s;
  }

  const PRODUCTS = {
    onigiri: '<path d="M0,-15 L9.5,1.5 L-9.5,1.5 Z" fill="#fffaf0" stroke="' + INK +
      '" stroke-width="2" stroke-linejoin="round"/><rect x="-5" y="-4.5" width="10" height="6" rx="1.5" fill="#5b6b63"/>',
    gear: '<circle cx="0" cy="-7" r="7.6" fill="#ffd98a" stroke="' + INK + '" stroke-width="2"/>' +
      '<path d="M0,-16 v3 M0,-1 v3 M-9,-7 h3 M6,-7 h3" stroke="' + INK + '" stroke-width="2.4" stroke-linecap="round"/>' +
      '<circle cx="0" cy="-7" r="2.4" fill="#fff6e2"/>',
    box: '<rect x="-8" y="-13" width="16" height="13" rx="2.5" fill="#ffe0bb" stroke="' + INK + '" stroke-width="2"/>' +
      '<path d="M0,-13 v13 M-8,-8 h16" stroke="' + INK + '" stroke-width="1.4" opacity=".5"/>',
    yarn: '<circle cx="0" cy="-8" r="8" fill="#ff9ec4" stroke="' + INK + '" stroke-width="2"/>' +
      '<path d="M-6,-12 q6,4 10,10 M-7,-5 q7,-4 12,-6" fill="none" stroke="#d94f8a" stroke-width="1.6" stroke-linecap="round"/>',
    crate: '<rect x="-9" y="-14" width="18" height="14" rx="2" fill="#e6b787" stroke="' + INK + '" stroke-width="2"/>' +
      '<path d="M-9,-14 L9,0 M9,-14 L-9,0" stroke="' + INK + '" stroke-width="1.6" opacity=".55"/>'
  };

  /** ベルトの上を流れていくもの。 */
  function beltItems(def) {
    if (!def.product) return '';
    const b = C.beltLine(def);
    const from = C.iso(def.x + b.x0 + 0.2, def.y + b.y, BELT_H);
    const to = C.iso(def.x + b.x1 - 0.2, def.y + b.y, BELT_H);
    const dx = (to.x - from.x).toFixed(1), dy = (to.y - from.y).toFixed(1);
    let s = '';
    for (let i = 0; i < 3; i++) {
      s += '<g transform="translate(' + from.x.toFixed(1) + ' ' + from.y.toFixed(1) + ')">' +
        '<g class="flow" data-dx="' + dx + '" data-dy="' + dy + '" data-phase="' + (i / 3).toFixed(3) + '">' +
        (PRODUCTS[def.product] || '') + '</g></g>';
    }
    return s;
  }

  /** ベルトのはしに置く機械。部署ごとに見た目を変える。 */
  function machineMarkup(def) {
    const b = C.beltLine(def);
    const by = def.y + b.y;
    const mx = def.x + 0.7;
    // 機械は金属の色にして、部署の色は帯だけに使う (大きな面を色で塗ると建物に見えない)
    let s = isoBox(mx, by, 0.66, 0.86, 24, '#c2ccd8', '#a2adbb', '#8f9aa9');
    s += isoBox(mx, by, 0.72, 0.92, 11, shade(def.accent, 18), shade(def.accent, -14), shade(def.accent, -30));
    s += at(mx, by, 24, '<rect x="-11" y="-8" width="22" height="8" rx="2.5" fill="#4a5364" stroke="' + INK +
      '" stroke-width="1.8"/><circle cx="-5" cy="-4" r="1.9" fill="#8ef0a8"/><circle cx="1" cy="-4" r="1.9" fill="#ffe066"/>');

    switch (def.machine) {
      case 'kama': {   // 大きな釜。ゆげが上がる
        let steam = '';
        for (let i = 0; i < 3; i++) {
          steam += '<g class="puff" data-phase="' + (i / 3).toFixed(2) + '">' +
            '<ellipse cx="' + (i * 6 - 6) + '" cy="-58" rx="7" ry="6" fill="#fff" opacity=".8"/></g>';
        }
        s += at(mx, by, 24,
          '<ellipse cx="0" cy="-16" rx="17" ry="13" fill="#c9d4de" stroke="' + INK + '" stroke-width="2.4"/>' +
          '<ellipse cx="0" cy="-24" rx="17" ry="8" fill="#eef3f7" stroke="' + INK + '" stroke-width="2.4"/>' +
          '<ellipse cx="0" cy="-26" rx="4" ry="2.4" fill="#c9d4de" stroke="' + INK + '" stroke-width="1.8"/>' + steam);
        break;
      }
      case 'press': {  // プレス機。頭が上下する
        s += at(mx, by, 24,
          '<path d="M-15,0 v-40 M15,0 v-40 M-17,-40 h34" fill="none" stroke="#8a94a4" stroke-width="5" stroke-linecap="round"/>' +
          '<g class="press"><rect x="-13" y="-30" width="26" height="12" rx="3" fill="#ff9c8f" stroke="' + INK +
          '" stroke-width="2.2"/></g>');
        break;
      }
      case 'scanner': { // ベルトをまたぐ検査ゲート
        const gx = def.x + b.x0 + 0.62;
        const post = (py) => isoBox(gx, py, 0.2, 0.2, 54, '#dfe7ef', '#b7c3d1', '#a4b1c1');
        s += post(by - 0.78) + post(by + 0.78);
        s += poly([pt(gx - 0.1, by - 0.88, 54), pt(gx + 0.1, by - 0.88, 54), pt(gx + 0.1, by + 0.88, 54), pt(gx - 0.1, by + 0.88, 54)], '#eef3f8', INK, 1.8);
        s += poly([pt(gx + 0.1, by - 0.88, 54), pt(gx + 0.1, by + 0.88, 54), pt(gx + 0.1, by + 0.88, 42), pt(gx + 0.1, by - 0.88, 42)], '#c9d5e2', INK, 1.8);
        s += at(gx + 0.1, by, 42, '<g class="blink"><ellipse cx="0" cy="-3" rx="30" ry="4.5" fill="#4ddc94" opacity=".75"/></g>');
        s += at(gx, by - 0.88, 54, '<circle cx="0" cy="-6" r="5" fill="#ff9c8f" stroke="' + INK + '" stroke-width="1.8"/>');
        break;
      }
      case 'spinner': { // 糸車。くるくるまわる
        s += at(mx, by, 24,
          '<g class="spin"><circle cx="0" cy="-22" r="17" fill="none" stroke="' + INK + '" stroke-width="2.6"/>' +
          '<path d="M0,-39 v34 M-17,-22 h34 M-12,-34 l24,24 M12,-34 l-24,24" stroke="#b9a6ff" stroke-width="2.6"/>' +
          '<circle cx="0" cy="-22" r="4.4" fill="#8a7dff" stroke="' + INK + '" stroke-width="2"/></g>');
        break;
      }
      case 'crane': {  // クレーン。フックがゆれる
        s += at(mx, by, 24,
          '<path d="M0,0 v-44 M0,-44 h34" fill="none" stroke="#8a94a4" stroke-width="5" stroke-linecap="round"/>' +
          '<g class="swing"><path d="M30,-44 v14" stroke="' + INK + '" stroke-width="2"/>' +
          '<path d="M30,-30 q-6,6 0,10 q6,-4 0,-10" fill="none" stroke="' + INK + '" stroke-width="2.6" stroke-linecap="round"/></g>');
        break;
      }
    }
    return s;
  }

  /** 出来上がったものを積んでおく所。 */
  function outputMarkup(def) {
    const ox = def.x + def.w - 0.52;
    const oy = def.y + def.h - 0.6;
    const crate = (cx, cy, h) => isoBox(cx, cy, 0.46, 0.46, h, '#e8bd8a', '#cfa273', '#bf9367') +
      '<g stroke="' + INK + '" stroke-width="1.2" opacity=".45" fill="none">' +
      line(cx - 0.23, cy - 0.23, h, cx + 0.23, cy + 0.23, h) + '</g>';
    return crate(ox, oy, 12) + crate(ox, oy, 23) + crate(ox - 0.52, oy - 0.05, 12);
  }

  /** きゅうけい室。ここだけベルトがなく、くつろぐ場所にする。 */
  function loungeMarkup(def) {
    const cx = def.x + def.w / 2, cy = def.y + def.h / 2;
    let s = poly([pt(cx - 1.4, cy - 0.9), pt(cx + 1.4, cy - 0.9), pt(cx + 1.4, cy + 0.9), pt(cx - 1.4, cy + 0.9)],
      '#ffd9a8', shade('#ffd9a8', -40), 2);
    s += isoBox(def.x + 0.8, cy, 0.9, 1.6, 12, '#ffb3c4', '#eb95a9', '#dd889c');
    s += isoBox(def.x + 0.52, cy, 0.2, 1.6, 30, '#ffc9d6', '#eba9b8', '#dd9cab');
    s += isoBox(def.x + def.w - 0.8, cy, 0.7, 1.2, 12, '#9fd8c0', '#84c0a8', '#77b199');
    s += isoBox(cx, cy, 0.8, 0.6, 14, '#fff1d6', '#ecd9b8', '#dfcba9');
    s += at(cx, cy, 14, '<ellipse cx="0" cy="-6" rx="7" ry="4.6" fill="#fff" stroke="' + INK + '" stroke-width="1.8"/>' +
      '<path d="M-3,-11 q2,-4 0,-6 M3,-11 q2,-4 0,-6" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".8"/>');
    return s;
  }

  /** 持ち場に立つねこ 1 ぴき。 */
  function stationMarkup(def, slot, cat) {
    const sx = def.x + slot.x;
    const sy = def.y + slot.y;
    let s = '';
    // 足もとの塗り分け (持ち場の目じるし)
    const p0 = C.iso(sx, sy, 0);
    s += '<ellipse cx="' + p0.x.toFixed(1) + '" cy="' + p0.y.toFixed(1) +
      '" rx="20" ry="9" fill="none" stroke="' + def.accent + '" stroke-width="2" opacity=".3"/>';
    if (!cat) {
      s += '<ellipse cx="' + p0.x.toFixed(1) + '" cy="' + p0.y.toFixed(1) +
        '" rx="15" ry="7" fill="rgba(140,110,100,.12)"/>';
      return s;
    }
    s += '<g class="tap-target" data-cat="' + esc(cat.id) + '" transform="translate(' + p0.x.toFixed(1) + ' ' +
      p0.y.toFixed(1) + ') scale(0.58)">' +
      '<ellipse cx="0" cy="0" rx="20" ry="8.5" fill="rgba(120,80,90,.2)"/>' +
      '<g class="bob" data-phase="' + Math.random().toFixed(3) + '">' + catSVG(cat, def.accent) + '</g></g>';
    return s;
  }

  /** 部署 1 つぶん。建っていないときは点線のわく。 */
  function roomMarkup(def) {
    const level = C.roomLevel(state, def.id);
    const built = level > 0;
    const unlocked = C.isUnlocked(state, def.id);
    const x0 = def.x, y0 = def.y, x1 = def.x + def.w, y1 = def.y + def.h;
    const W = TILE.wall;
    let s = '<g class="tap-target" data-room="' + def.id + '">';

    if (!built) {
      s += poly([pt(x0, y0), pt(x1, y0), pt(x1, y1), pt(x0, y1)], unlocked ? '#efe3d6' : '#ddd2c8', INK, 2);
      s += '<polygon points="' + [pt(x0 + .2, y0 + .2), pt(x1 - .2, y0 + .2), pt(x1 - .2, y1 - .2), pt(x0 + .2, y1 - .2)].join(' ') +
        '" fill="none" stroke="' + INK + '" stroke-width="2.5" stroke-dasharray="9 7" opacity=".55"/>';
      s += at(x0 + def.w / 2, y0 + def.h / 2, 0,
        '<text x="0" y="-16" text-anchor="middle" font-size="26">' + (unlocked ? '🔨' : '🔒') + '</text>' +
        '<rect x="-52" y="-6" width="104" height="24" rx="12" fill="#fffaf3" stroke="' + INK + '" stroke-width="2"/>' +
        '<text x="0" y="11" text-anchor="middle" font-size="12" fill="' + INK + '">' +
        (unlocked ? esc(def.name) : '工場Lv.' + def.unlock + ' で解放') + '</text>');
      return s + '</g>';
    }

    // 床 (市松)
    const light = def.floor, dim = shade(def.floor, -16);
    for (let x = x0; x < x1; x++) {
      for (let y = y0; y < y1; y++) {
        s += poly([pt(x, y), pt(x + 1, y), pt(x + 1, y + 1), pt(x, y + 1)], ((x + y) % 2 ? dim : light), null);
      }
    }
    s += '<polygon points="' + [pt(x0, y0), pt(x1, y0), pt(x1, y1), pt(x0, y1)].join(' ') +
      '" fill="none" stroke="' + INK + '" stroke-width="2"/>';

    // 通路の黄色い線
    const belt = C.beltLine(def);
    if (def.kind === 'produce') {
      s += '<g stroke="#f5c33c" stroke-width="2.6" fill="none" opacity=".85">' +
        line(x0 + 0.3, def.y + belt.y - 1.22, 0, x1 - 0.3, def.y + belt.y - 1.22, 0) +
        line(x0 + 0.3, def.y + belt.y + 1.22, 0, x1 - 0.3, def.y + belt.y + 1.22, 0) + '</g>';
    }

    // 奥のかべ 2 枚 (右がわは明るく、左がわは少し暗く)
    const wallR = def.wall, wallL = shade(def.wall, -16);
    s += poly([pt(x0, y0, 0), pt(x1, y0, 0), pt(x1, y0, W), pt(x0, y0, W)], wallR, INK, 2);
    s += poly([pt(x0, y0, 0), pt(x0, y1, 0), pt(x0, y1, W), pt(x0, y0, W)], wallL, INK, 2);
    // かべの厚み
    s += poly([pt(x0, y0, W), pt(x1, y0, W), pt(x1, y0 - 0.2, W), pt(x0, y0 - 0.2, W)], shade(def.wall, 12), INK, 1.6);
    s += poly([pt(x0, y0, W), pt(x0, y1, W), pt(x0 - 0.2, y1, W), pt(x0 - 0.2, y0, W)], shade(def.wall, 12), INK, 1.6);

    // かべを走る配管
    s += '<g stroke="#c3cedb" stroke-width="5" stroke-linecap="round" fill="none">' +
      line(x0 + 0.15, y0, W - 9, x1 - 0.15, y0, W - 9) +
      line(x0, y0 + 0.15, W - 15, x0, y1 - 0.15, W - 15) + '</g>';
    s += '<g stroke="' + INK + '" stroke-width="1.4" fill="none" opacity=".5">' +
      line(x0 + 0.15, y0, W - 9, x1 - 0.15, y0, W - 9) + '</g>';

    // 窓と、計器のついた制御盤
    s += at(x0 + def.w * 0.74, y0, W * 0.55,
      '<rect x="-17" y="-13" width="34" height="26" rx="4" fill="#cfe9ff" stroke="' + INK + '" stroke-width="2"/>' +
      '<path d="M-17,0 h34 M0,-13 v26" stroke="' + INK + '" stroke-width="1.6"/>');
    s += at(x0, y0 + def.h * 0.6, W * 0.5,
      '<rect x="-13" y="-15" width="26" height="30" rx="3" fill="' + shade(def.accent, 74) + '" stroke="' + INK + '" stroke-width="2"/>' +
      '<circle cx="-5" cy="-7" r="4.4" fill="#fffaf3" stroke="' + INK + '" stroke-width="1.6"/>' +
      '<circle cx="5" cy="-7" r="4.4" fill="#fffaf3" stroke="' + INK + '" stroke-width="1.6"/>' +
      '<path d="M-5,-7 l2,-3 M5,-7 l-1,-3.4" stroke="' + INK + '" stroke-width="1.4" stroke-linecap="round"/>' +
      '<rect x="-8" y="2" width="16" height="8" rx="2" fill="#4a5364"/>' +
      '<circle cx="-4" cy="6" r="1.8" fill="#8ef0a8"/><circle cx="1" cy="6" r="1.8" fill="#ffe066"/>');

    // 部屋番号のプレート
    s += at(x0 + def.w * 0.3, y0, W * 0.68,
      '<rect x="-20" y="-10" width="40" height="20" rx="5" fill="#fffaf3" stroke="' + INK + '" stroke-width="2"/>' +
      '<text x="0" y="6" text-anchor="middle" font-size="13" fill="' + INK + '">' + ROOM_NO[def.id] + '</text>');

    // 中身。奥がわのねこ → ベルト → 手前がわのねこ の順に重ねる
    const slots = C.slotPositions(def);
    const cats = C.catsIn(state, def.id);
    const back = [], front = [];
    slots.forEach((slot, i) => { (slot.side < 0 ? back : front).push({ slot: slot, cat: cats[i] || null }); });
    const byX = (a, b) => a.slot.x - b.slot.x;

    if (def.kind === 'produce') {
      s += machineMarkup(def);
      s += back.sort(byX).map((it) => stationMarkup(def, it.slot, it.cat)).join('');
      s += beltMarkup(def);
      s += beltItems(def);
      s += front.sort(byX).map((it) => stationMarkup(def, it.slot, it.cat)).join('');
      s += outputMarkup(def);
    } else {
      s += loungeMarkup(def);
      s += back.sort(byX).concat(front.sort(byX)).map((it) => stationMarkup(def, it.slot, it.cat)).join('');
    }

    return s + '</g>';
  }

  /** 部署の名前の看板。部屋どうしで隠れないよう、いちばん上の層にまとめて置く。 */
  function signMarkup(def) {
    const level = C.roomLevel(state, def.id);
    if (level <= 0) return '';
    const label = def.icon + ' ' + def.name;
    const width = label.length * 10.5 + 36;
    return '<g class="tap-target" data-room="' + def.id + '" data-sign="' + def.id + '">' +
      '<rect x="' + (-width / 2).toFixed(1) + '" y="-11" width="' + width.toFixed(1) +
      '" height="22" rx="11" fill="#fffaf3" stroke="' + INK + '" stroke-width="2.2" opacity=".95"/>' +
      '<text x="0" y="4.5" text-anchor="middle" font-size="11" fill="' + INK + '">' +
      esc(label) + ' <tspan fill="#c07a2a">Lv.' + level + '</tspan></text></g>';
  }

  function buildScene() {
    els.ground.innerHTML = groundMarkup();
    const order = C.ROOMS.slice().sort((a, b) => (a.x + a.y) - (b.x + b.y));
    els.rooms.innerHTML = order.map(roomMarkup).join('');
    els.signs.innerHTML = order.map(signMarkup).join('');
    updateSigns();
    startBobbing();
  }

  /**
   * 動くものをまとめて動かす。CSS の animation ではなく
   * Web Animations API を使う (同じフレームで作った要素でも 1 フレーム目から動く)。
   */
  function startBobbing() {
    if (reduceMotion) return;
    const root = els.rooms;
    const phaseOf = (el) => Number(el.dataset.phase || 0);

    // ねこのゆらゆら
    for (const g of root.querySelectorAll('.bob')) {
      const dur = 1700 + phaseOf(g) * 900;
      g.animate([{ transform: 'translateY(0px)' }, { transform: 'translateY(-3.5px)' }, { transform: 'translateY(0px)' }],
        { duration: dur, iterations: Infinity, delay: -phaseOf(g) * dur, easing: 'ease-in-out' });
    }
    // ベルトを流れるもの
    for (const g of root.querySelectorAll('.flow')) {
      const dx = Number(g.dataset.dx || 0), dy = Number(g.dataset.dy || 0);
      const dur = 5200;
      g.animate([{ transform: 'translate(0px,0px)' }, { transform: 'translate(' + dx + 'px,' + dy + 'px)' }],
        { duration: dur, iterations: Infinity, delay: -phaseOf(g) * dur, easing: 'linear' });
    }
    // 煙とゆげ
    for (const g of root.parentNode.querySelectorAll('.puff')) {
      const dur = 3200;
      g.animate([
        { transform: 'translateY(6px) scale(.4)', opacity: 0 },
        { transform: 'translateY(-10px) scale(.9)', opacity: .75, offset: .3 },
        { transform: 'translateY(-46px) scale(1.6)', opacity: 0 }
      ], { duration: dur, iterations: Infinity, delay: -phaseOf(g) * dur, easing: 'ease-out' });
    }
    // プレス機
    for (const g of root.querySelectorAll('.press')) {
      g.animate([{ transform: 'translateY(0px)' }, { transform: 'translateY(16px)', offset: .45 },
        { transform: 'translateY(16px)', offset: .55 }, { transform: 'translateY(0px)' }],
        { duration: 1600, iterations: Infinity, easing: 'ease-in-out' });
    }
    // 糸車
    for (const g of root.querySelectorAll('.spin')) {
      g.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }],
        { duration: 4200, iterations: Infinity, easing: 'linear' });
    }
    // クレーンのフック
    for (const g of root.querySelectorAll('.swing')) {
      g.animate([{ transform: 'translateY(0px)' }, { transform: 'translateY(10px)' }, { transform: 'translateY(0px)' }],
        { duration: 2600, iterations: Infinity, easing: 'ease-in-out' });
    }
    // 検査ゲートの光
    for (const g of root.querySelectorAll('.blink')) {
      g.animate([{ opacity: .25 }, { opacity: 1 }, { opacity: .25 }],
        { duration: 1400, iterations: Infinity, easing: 'ease-in-out' });
    }
  }

  // ------------------------------------------------------------ カメラ

  const cam = { x: 0, y: 0, s: 1 };
  const view = { w: 360, h: 640 };
  const MIN_S = 0.26, MAX_S = 2.2;

  function applyCam() {
    els.camera.setAttribute('transform',
      'translate(' + cam.x.toFixed(2) + ' ' + cam.y.toFixed(2) + ') scale(' + cam.s.toFixed(4) + ')');
    updateSigns();
  }

  function clampCam() {
    const b = C.sceneBounds();
    const keep = 70;
    cam.x = Math.min(cam.x, view.w - keep - b.x * cam.s);
    cam.x = Math.max(cam.x, keep - (b.x + b.w) * cam.s);
    cam.y = Math.min(cam.y, view.h - keep - b.y * cam.s);
    cam.y = Math.max(cam.y, keep - (b.y + b.h) * cam.s);
  }

  function viewport() {
    const padTop = 96, padBottom = 104, padX = 10;
    return {
      padTop: padTop,
      w: Math.max(80, view.w - padX * 2),
      h: Math.max(80, view.h - padTop - padBottom)
    };
  }

  /** 工場ぜんたいが収まる大きさ。ダブルタップとせっていから呼ぶ。 */
  function fitCam() {
    const b = C.sceneBounds();
    const a = viewport();
    cam.s = clamp(Math.min(a.w / b.w, a.h / b.h), MIN_S, MAX_S);
    cam.x = view.w / 2 - (b.x + b.w / 2) * cam.s;
    cam.y = a.padTop + a.h / 2 - (b.y + b.h / 2) * cam.s;
    clampCam();
    applyCam();
  }

  /** 建っている部署の真ん中を、画面いっぱいに近い大きさで見せる (最初の見え方)。 */
  function focusCam() {
    const b = C.sceneBounds();
    const a = viewport();
    const fit = Math.min(a.w / b.w, a.h / b.h);
    cam.s = clamp((a.h / b.h) * 0.92, fit, 1.7);
    const built = C.builtRooms(state);
    const list = built.length ? built : C.ROOMS;
    let cx = 0, cy = 0;
    for (const def of list) { cx += def.x + def.w / 2; cy += def.y + def.h / 2; }
    lookAt(cx / list.length, cy / list.length, TILE.wall / 2);
  }

  /** 升目の一点を画面の真ん中に持ってくる。 */
  function lookAt(x, y, z) {
    const a = viewport();
    const p = C.iso(x, y, z || 0);
    cam.x = view.w / 2 - p.x * cam.s;
    cam.y = a.padTop + a.h / 2 - p.y * cam.s;
    clampCam();
    applyCam();
  }

  /** すーっと動かす。新しい部署を建てたときに、そこを見せる。 */
  let panAnim = null;
  function panTo(x, y, z) {
    const from = { x: cam.x, y: cam.y };
    const keep = { x: cam.x, y: cam.y };
    lookAt(x, y, z);
    const to = { x: cam.x, y: cam.y };
    if (reduceMotion) return;
    cam.x = keep.x; cam.y = keep.y; applyCam();
    const t0 = performance.now();
    if (panAnim) cancelAnimationFrame(panAnim);
    const step = (now) => {
      const k = clamp((now - t0) / 520, 0, 1);
      const e = 1 - Math.pow(1 - k, 3);
      cam.x = from.x + (to.x - from.x) * e;
      cam.y = from.y + (to.y - from.y) * e;
      applyCam();
      if (k < 1) panAnim = requestAnimationFrame(step); else panAnim = null;
    };
    panAnim = requestAnimationFrame(step);
  }

  function resize() {
    const rect = els.scene.getBoundingClientRect();
    view.w = Math.max(1, Math.round(rect.width));
    view.h = Math.max(1, Math.round(rect.height));
    els.world.setAttribute('viewBox', '0 0 ' + view.w + ' ' + view.h);
    els.world.setAttribute('width', view.w);
    els.world.setAttribute('height', view.h);
  }

  /** 看板を、いまのカメラに合わせて置き直す。大きさは変えないので、ズームしても読める。 */
  function updateSigns() {
    for (const node of els.signs.children) {
      const def = C.roomDef(node.getAttribute('data-sign'));
      if (!def) continue;
      const p = toScreen(def.x + def.w / 2, def.y + def.h - 0.1, 0);
      node.setAttribute('transform', 'translate(' + p.x.toFixed(1) + ' ' + p.y.toFixed(1) + ')');
    }
  }

  /** 画面の座標 → 工場のなかの座標。あわを置くときに使う。 */
  function toScreen(x, y, z) {
    const p = C.iso(x, y, z || 0);
    return { x: p.x * cam.s + cam.x, y: p.y * cam.s + cam.y };
  }

  // ------------------------------------------------------------ 指の操作

  const pointers = new Map();
  let dragStart = null;
  let pinch = null;

  function onDown(e) {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { els.scene.setPointerCapture(e.pointerId); } catch (err) { /* 拾えなくても操作は続く */ }
    if (pointers.size === 1) {
      dragStart = { x: e.clientX, y: e.clientY, camX: cam.x, camY: cam.y, t: Date.now(), moved: 0, target: e.target };
    } else if (pointers.size === 2) {
      const p = [...pointers.values()];
      pinch = {
        dist: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y),
        cx: (p[0].x + p[1].x) / 2, cy: (p[0].y + p[1].y) / 2,
        s: cam.s, camX: cam.x, camY: cam.y
      };
      dragStart = null;
    }
  }

  function onMove(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pinch && pointers.size >= 2) {
      const p = [...pointers.values()];
      const dist = Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
      if (pinch.dist > 8) {
        const rect = els.scene.getBoundingClientRect();
        const next = clamp(pinch.s * (dist / pinch.dist), MIN_S, MAX_S);
        const ax = pinch.cx - rect.left, ay = pinch.cy - rect.top;
        cam.s = next;
        cam.x = ax - (ax - pinch.camX) * (next / pinch.s);
        cam.y = ay - (ay - pinch.camY) * (next / pinch.s);
        clampCam();
        applyCam();
      }
      return;
    }

    if (dragStart && pointers.size === 1) {
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      dragStart.moved = Math.max(dragStart.moved, Math.hypot(dx, dy));
      if (dragStart.moved > 6) {
        els.scene.classList.add('dragging');
        cam.x = dragStart.camX + dx;
        cam.y = dragStart.camY + dy;
        clampCam();
        applyCam();
      }
    }
  }

  function onUp(e) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    els.scene.classList.remove('dragging');
    if (dragStart && dragStart.moved <= 6 && Date.now() - dragStart.t < 500) {
      handleTap(dragStart.target, e.clientX, e.clientY);
    }
    if (pointers.size === 0) dragStart = null;
  }

  function handleTap(target, clientX, clientY) {
    if (!target || !target.closest) return;
    const rect = els.scene.getBoundingClientRect();
    const px = clientX - rect.left, py = clientY - rect.top;

    const bubble = target.closest('[data-bubble]');
    if (bubble) { popBubble(bubble); return; }

    const catNode = target.closest('[data-cat]');
    if (catNode) { petCat(catNode, px, py); return; }

    const room = target.closest('[data-room]');
    if (room) { openSheet('room', room.getAttribute('data-room')); return; }
  }

  // ------------------------------------------------------------ ごほうびの演出

  function floatText(px, py, text, color) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('transform', 'translate(' + px.toFixed(1) + ' ' + py.toFixed(1) + ')');
    g.setAttribute('pointer-events', 'none');
    g.innerHTML = '<text x="0" y="0" text-anchor="middle" font-size="17" fill="' + (color || '#3f7d4a') +
      '" stroke="#fff" stroke-width="4" stroke-linejoin="round">' + esc(text) + '</text>';
    els.fx.appendChild(g);
    const inner = g.firstChild;
    const anim = inner.animate(
      [{ transform: 'translateY(0)', opacity: 1 }, { transform: 'translateY(-52px)', opacity: 0 }],
      { duration: reduceMotion ? 1 : 900, easing: 'cubic-bezier(.2,.8,.3,1)' }
    );
    anim.onfinish = () => g.remove();
  }

  function petCat(node, px, py) {
    const gain = C.tapReward(state);
    state.money += gain;
    state.totalEarned += gain;
    dirty = true;
    floatText(px, py - 26, '+' + C.formatNumber(gain), '#3f7d4a');
    const bob = node.querySelector('.bob');
    if (bob && !reduceMotion) {
      bob.animate(
        [{ transform: 'translateY(0) scale(1)' }, { transform: 'translateY(-10px) scale(1.12)' }, { transform: 'translateY(0) scale(1)' }],
        { duration: 420, easing: 'ease-out' }
      );
    }
    const heart = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    heart.setAttribute('transform', 'translate(' + px.toFixed(1) + ' ' + (py - 40).toFixed(1) + ')');
    heart.setAttribute('pointer-events', 'none');
    heart.innerHTML = '<text x="0" y="0" text-anchor="middle" font-size="18">💕</text>';
    els.fx.appendChild(heart);
    const a = heart.firstChild.animate(
      [{ transform: 'translate(0,0) scale(.6)', opacity: 1 }, { transform: 'translate(6px,-34px) scale(1.1)', opacity: 0 }],
      { duration: reduceMotion ? 1 : 800 });
    a.onfinish = () => heart.remove();
  }

  // ------------------------------------------------------------ あわ

  const bubbles = [];
  let bubbleTimer = 0;

  function spawnBubble() {
    const built = C.builtRooms(state).filter((d) => d.kind === 'produce');
    if (!built.length || bubbles.length >= 3) return;
    const def = C.pick(rng, built);
    const reward = C.bubbleReward(state, def.id, rng);
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('data-bubble', '1');
    g.setAttribute('class', 'tap-target');
    const text = reward.kind === 'paw' ? '🐾 +' + reward.amount : '⭐ +' + C.formatNumber(reward.amount);
    const width = Math.max(70, text.length * 10 + 22);
    g.innerHTML = '<g class="float">' +
      '<rect x="' + (-width / 2) + '" y="-20" width="' + width + '" height="30" rx="15" fill="#fffaf3" stroke="' + INK + '" stroke-width="2.5"/>' +
      '<text x="0" y="1" text-anchor="middle" font-size="14" fill="' + INK + '">' + text + '</text></g>';
    els.fx.appendChild(g);
    const b = { node: g, def: def, reward: reward, born: Date.now() };
    bubbles.push(b);
    placeBubble(b);
    if (!reduceMotion) {
      g.firstChild.animate(
        [{ transform: 'translateY(0)' }, { transform: 'translateY(-7px)' }, { transform: 'translateY(0)' }],
        { duration: 1800, iterations: Infinity, easing: 'ease-in-out' });
    }
  }

  function placeBubble(b) {
    const p = toScreen(b.def.x + b.def.w / 2, b.def.y + b.def.h / 2, TILE.wall + 34);
    b.node.setAttribute('transform', 'translate(' + p.x.toFixed(1) + ' ' + p.y.toFixed(1) + ')');
  }

  function popBubble(node) {
    const i = bubbles.findIndex((b) => b.node === node);
    if (i < 0) return;
    const b = bubbles[i];
    bubbles.splice(i, 1);
    C.claimBubble(state, b.reward);
    dirty = true;
    const m = node.transform.baseVal.consolidate();
    const px = m ? m.matrix.e : view.w / 2;
    const py = m ? m.matrix.f : view.h / 2;
    floatText(px, py - 14,
      b.reward.kind === 'paw' ? '🐾 +' + b.reward.amount : '+' + C.formatNumber(b.reward.amount),
      b.reward.kind === 'paw' ? '#d4568a' : '#3f7d4a');
    node.remove();
  }

  function updateBubbles(now) {
    for (let i = bubbles.length - 1; i >= 0; i--) {
      if (now - bubbles[i].born > 16000) { bubbles[i].node.remove(); bubbles.splice(i, 1); }
      else placeBubble(bubbles[i]);
    }
  }

  // ------------------------------------------------------------ 上のバー

  const shown = {};
  function setText(node, key, value) {
    if (shown[key] === value) return;
    shown[key] = value;
    node.textContent = value;
  }

  const PHASE_ICON = { morning: '🌤️', day: '☀️', evening: '🌇', night: '🌙' };

  function renderHud() {
    setText(els.lv, 'lv', String(C.factoryLevel(state)));
    setText(els.money, 'money', C.formatNumber(state.money));
    setText(els.paw, 'paw', C.formatNumber(state.paw));
    setText(els.rate, 'rate', C.formatRate(state));
    const clock = C.gameClock(state);
    setText(els.clock, 'clock', clock.text);
    setText(els.clockIco, 'ico', PHASE_ICON[clock.phase]);
    if (els.app.dataset.phase !== clock.phase) els.app.dataset.phase = clock.phase;
  }

  function renderBadges() {
    const b = C.badges(state);
    for (const btn of els.dock.querySelectorAll('.dock-btn')) {
      btn.querySelector('.dot').hidden = !b[btn.dataset.panel];
    }
  }

  // ------------------------------------------------------------ 板 (パネル)

  let sheet = null;   // { kind, arg }
  let buyAmount = 1;  // 1 / 10 / 'max'
  let openedAt = 0;
  let lastGacha = null;   // 直前に引いたねこ。板を描き直しても消えないよう、ここに持つ

  /**
   * 指でタップすると、ブラウザはそのあとに click も送る。
   * 開いたばかりの板の裏 (#sheetBack) にその click が当たって、
   * 開いた瞬間に閉じてしまう。開いてすぐの裏押しは受け付けない。
   */
  function justOpened() { return Date.now() - openedAt < 400; }

  function openSheet(kind, arg) {
    if (kind === 'gacha') lastGacha = null;
    sheet = { kind: kind, arg: arg };
    openedAt = Date.now();
    els.sheetWrap.hidden = false;
    renderSheet();
  }
  function closeSheet() { sheet = null; els.sheetWrap.hidden = true; }

  function renderSheet() {
    if (!sheet) return;
    const r = SHEETS[sheet.kind];
    els.sheetTitle.textContent = r.title(sheet.arg);
    els.sheetBody.innerHTML = r.body(sheet.arg);
  }

  function rarityChip(cat) {
    const r = C.rarityDef(cat.rarity);
    return '<span class="rar" style="background:' + r.color + '">' + r.id + '</span>';
  }

  function buyLabel(def) {
    const level = C.roomLevel(state, def.id);
    if (!C.isUnlocked(state, def.id)) return { text: 'Lv.' + def.unlock + ' で解放', cost: Infinity, levels: 0 };
    if (buyAmount === 1) {
      const cost = C.upgradeCost(state, def.id);
      return { text: (level === 0 ? 'たてる' : '+1'), sub: '💴 ' + C.formatNumber(cost), cost: cost, levels: 1 };
    }
    const budget = buyAmount === 'max' ? state.money : Infinity;
    let n = 0, cost = 0, lv = level;
    const limit = buyAmount === 'max' ? 500 : 10;
    for (let i = 0; i < limit; i++) {
      const next = Math.ceil(def.baseCost * Math.pow(def.growth, lv));
      if (buyAmount === 'max' && cost + next > budget) break;
      cost += next; lv++; n++;
    }
    if (n === 0) {
      const one = C.upgradeCost(state, def.id);
      return { text: '+1', sub: '💴 ' + C.formatNumber(one), cost: one, levels: 1 };
    }
    return { text: '+' + n, sub: '💴 ' + C.formatNumber(cost), cost: cost, levels: n };
  }

  function roomCard(def) {
    const level = C.roomLevel(state, def.id);
    const unlocked = C.isUnlocked(state, def.id);
    const label = buyLabel(def);
    const cats = C.catsIn(state, def.id);
    const rateText = def.kind === 'boost'
      ? '全体のもうけ <b>+' + Math.round(level * def.boostPerLevel * C.roomCatBonus(state, def.id) * 100) + '%</b>'
      : 'もうけ <b>' + C.formatNumber(C.roomRate(state, def.id) * 10) + '</b> /10s';
    return '<div class="card' + (unlocked ? '' : ' locked') + '">' +
      '<div class="card-ico">' + def.icon + '</div>' +
      '<div class="card-main">' +
      '<div class="card-title">' + esc(def.name) + (level > 0 ? '<span class="lv-chip">Lv.' + level + '</span>' : '') + '</div>' +
      '<div class="card-sub">' + (level > 0 ? rateText + ' ・ ねこ <b>' + cats.length + '/' + def.slots + '</b>' : esc(def.about)) + '</div>' +
      '</div>' +
      '<button type="button" class="buy" data-buy="' + def.id + '"' +
      (unlocked && state.money >= label.cost ? '' : ' disabled') + '>' +
      esc(label.text) + (label.sub ? '<small>' + esc(label.sub) + '</small>' : '') + '</button></div>';
  }

  const SHEETS = {
    rooms: {
      title: () => '🏭 ぶしょ',
      body: () =>
        '<div class="seg">' +
        [[1, '×1'], [10, '×10'], ['max', 'ぜんぶ']].map(([v, t]) =>
          '<button type="button" data-amount="' + v + '" aria-pressed="' + (String(buyAmount) === String(v)) + '">' + t + '</button>').join('') +
        '</div>' + C.ROOMS.map(roomCard).join('') +
        '<p class="note">部署のレベルを上げると、もうけが増える。工場レベル（左上の青い丸）は「部署のレベルの合計＋ねこの数」。上げると次の部署がひらく。</p>'
    },

    room: {
      title: (id) => C.roomDef(id).icon + ' ' + C.roomDef(id).name,
      body: (id) => {
        const def = C.roomDef(id);
        const cats = C.catsIn(state, id);
        const seats = [];
        for (let i = 0; i < def.slots; i++) {
          const cat = cats[i];
          seats.push(cat
            ? '<button type="button" class="cat-card" data-cat-open="' + esc(cat.id) + '">' + rarityChip(cat) +
              '<span class="lv">' + cat.level + '</span>' + catPortrait(cat, 46) +
              '<div class="nm">' + esc(cat.name) + '</div><div class="rm">力 ' + C.catPower(cat).toFixed(2) + '</div></button>'
            : '<div class="cat-card idle" style="cursor:default"><div style="font-size:28px;line-height:46px">🧰</div>' +
              '<div class="nm">あき</div><div class="rm">—</div></div>');
        }
        return '<p class="note">' + esc(def.about) + '</p>' + roomCard(def) +
          '<div class="card-sub" style="padding-left:4px">ラインに立っているねこ（タップすると育てられる）</div>' +
          '<div class="grid">' + seats.join('') + '</div>';
      }
    },

    cats: {
      title: () => '🐱 ねこ（' + state.cats.length + ' ひき）',
      body: () => {
        const sorted = state.cats.slice().sort((a, b) => C.catPower(b) - C.catPower(a));
        return '<div class="grid">' + sorted.map((cat) => {
          const room = cat.room ? C.roomDef(cat.room) : null;
          return '<button type="button" class="cat-card' + (room ? '' : ' idle') + '" data-cat-open="' + esc(cat.id) + '">' +
            rarityChip(cat) + '<span class="lv">' + cat.level + '</span>' + catPortrait(cat, 50) +
            '<div class="nm">' + esc(cat.name) + '</div>' +
            '<div class="rm">' + (room ? room.icon + esc(room.short) : 'おやすみ') + '</div></button>';
        }).join('') + '</div>' +
          '<p class="note">ねこはにくきゅう🐾でレベルアップできる。レベルが上がると、いる部署のもうけが増える。</p>';
      }
    },

    cat: {
      title: (id) => {
        const cat = state.cats.find((c) => c.id === id);
        return cat ? '🐱 ' + cat.name : 'ねこ';
      },
      body: (id) => {
        const cat = state.cats.find((c) => c.id === id);
        if (!cat) return '<p class="note">いなくなってしまった。</p>';
        const r = C.rarityDef(cat.rarity);
        const k = C.kindDef(cat.kind);
        const cost = C.catLevelCost(cat);
        const options = ['<option value="">おやすみ</option>'].concat(C.ROOMS.map((def) => {
          if (C.roomLevel(state, def.id) <= 0) return '';
          const full = C.catsIn(state, def.id).length >= def.slots && cat.room !== def.id;
          return '<option value="' + def.id + '"' + (cat.room === def.id ? ' selected' : '') +
            (full ? ' disabled' : '') + '>' + def.icon + ' ' + def.name + (full ? '（いっぱい）' : '') + '</option>';
        })).join('');
        return '<div style="display:flex;gap:12px;align-items:center">' + catPortrait(cat, 92) +
          '<div class="card-main"><div class="card-title">' + esc(cat.name) +
          '<span class="lv-chip">Lv.' + cat.level + '</span></div>' +
          '<div class="card-sub"><b style="color:' + r.color + '">' + r.name + '</b> ・ ' + esc(k.name) + '<br>' +
          '力 <b>' + C.catPower(cat).toFixed(2) + '</b>（いる部署のもうけを +' + Math.round(C.catPower(cat) * 100) + '%）</div></div></div>' +
          '<button type="button" class="big-btn alt" data-levelup="' + esc(cat.id) + '"' +
          (state.paw >= cost ? '' : ' disabled') + '>レベルアップ<small>🐾 ' + C.formatNumber(cost) + '（もっている 🐾 ' + C.formatNumber(state.paw) + '）</small></button>' +
          '<div class="card-sub" style="padding-left:4px">はいぞく</div>' +
          '<select data-assign="' + esc(cat.id) + '" style="font:inherit;font-size:13px;padding:10px;border-radius:12px;border:2px solid ' + INK + ';background:#fff;color:inherit">' +
          options + '</select>';
      }
    },

    gacha: {
      title: () => '🎁 ねこガチャ',
      body: () => {
        const result = lastGacha
          ? '<div class="result-row">' + lastGacha.map((cat) =>
            '<button type="button" class="cat-card" style="width:84px" data-cat-open="' + esc(cat.id) + '">' +
            rarityChip(cat) + catPortrait(cat, 46) + '<div class="nm">' + esc(cat.name) + '</div>' +
            '<div class="rm">' + C.rarityDef(cat.rarity).name + '</div></button>').join('') + '</div>'
          : '';
        return '<div id="gachaResult">' + result + '</div>' +
          '<button type="button" class="big-btn" data-gacha="1"' + (state.paw >= C.GACHA_COST ? '' : ' disabled') +
          '>1 かい引く<small>🐾 ' + C.GACHA_COST + '</small></button>' +
          '<button type="button" class="big-btn alt" data-gacha="10"' + (state.paw >= C.GACHA_COST_10 ? '' : ' disabled') +
          '>10 かい引く<small>🐾 ' + C.GACHA_COST_10 + '（レア以上かくてい）</small></button>' +
          '<div class="rate-table">' + C.RARITIES.map((r) => {
            const total = C.RARITIES.reduce((a, x) => a + x.weight, 0);
            return '<div style="background:' + r.color + '">' + r.id + '<br>' + (r.weight / total * 100).toFixed(0) + '%</div>';
          }).join('') + '</div>' +
          '<p class="note">もっている 🐾 ' + C.formatNumber(state.paw) + '。にくきゅうは、工場レベルが上がったとき・じっせきを達成したとき・工場に浮かぶ🐾のあわをタップしたとき・留守のあいだにたまる。</p>';
      }
    },

    awards: {
      title: () => '🏆 じっせき',
      body: () => C.ACHIEVEMENTS.map((a) => {
        const done = !!state.done[a.id];
        return '<div class="card award' + (done ? ' done' : '') + '">' +
          '<div class="card-ico">' + (done ? '🏅' : '🔒') + '</div>' +
          '<div class="card-main"><div class="card-title">' + esc(a.name) + '</div>' +
          '<div class="card-sub">' + esc(a.desc) + '</div></div>' +
          '<div class="paw">🐾 ' + a.paw + '</div></div>';
      }).join('')
    },

    settings: {
      title: () => '⚙️ せってい',
      body: () => {
        const level = C.factoryLevel(state);
        return '<div class="card"><div class="card-ico">📊</div><div class="card-main">' +
          '<div class="card-title">これまで</div><div class="card-sub">' +
          'あわせて <b>' + C.formatNumber(state.totalEarned) + '</b> 円かせいだ<br>' +
          'ねこ <b>' + state.cats.length + '</b> ひき ・ 工場レベル <b>' + level + '</b><br>' +
          'なでた回数 <b>' + C.formatNumber(state.taps) + '</b> ・ ガチャ <b>' + state.gachaCount + '</b> かい<br>' +
          'あそんだ時間 <b>' + C.formatDuration(state.playMs) + '</b></div></div></div>' +
          '<button type="button" class="big-btn alt" data-fit="1">工場ぜんたいを見る</button>' +
          '<button type="button" class="big-btn warn" data-reset="1">さいしょから やりなおす</button>' +
          '<p class="note">とちゅうまでは、この端末の中に自動で保存される。<br>' +
          '指でなぞると工場を動かせる。2 本指でひろげると大きくなる。<br>' +
          'ねこをタップするとなでられて、そのぶんお金が入る。</p>';
      }
    }
  };

  // ------------------------------------------------------------ 押したとき

  function onSheetClick(e) {
    const t = e.target;

    const amount = t.closest('[data-amount]');
    if (amount) {
      const v = amount.dataset.amount;
      buyAmount = v === 'max' ? 'max' : Number(v);
      renderSheet();
      return;
    }

    const buy = t.closest('[data-buy]');
    if (buy) {
      const def = C.roomDef(buy.dataset.buy);
      const wasNew = C.roomLevel(state, def.id) === 0;
      const label = buyLabel(def);
      let bought = 0;
      for (let i = 0; i < label.levels; i++) { if (!C.buyUpgrade(state, def.id)) break; bought++; }
      if (bought) {
        afterChange();
        toast(def.icon + ' ' + def.name + ' が Lv.' + C.roomLevel(state, def.id) + ' になった！');
        if (wasNew) { closeSheet(); panTo(def.x + def.w / 2, def.y + def.h / 2, TILE.wall / 2); }
      }
      renderSheet();
      return;
    }

    const open = t.closest('[data-cat-open]');
    if (open) { openSheet('cat', open.dataset.catOpen); return; }

    const up = t.closest('[data-levelup]');
    if (up) {
      const cat = state.cats.find((c) => c.id === up.dataset.levelup);
      if (C.levelUpCat(state, up.dataset.levelup)) {
        afterChange();
        toast('🐱 ' + cat.name + ' が Lv.' + cat.level + ' になった！');
      }
      renderSheet();
      return;
    }

    const g = t.closest('[data-gacha]');
    if (g) {
      const got = C.gacha(state, Number(g.dataset.gacha), rng);
      if (got) {
        lastGacha = got;
        afterChange();
        renderSheet();
        const box = document.getElementById('gachaResult');
        if (box && !reduceMotion) {
          box.querySelectorAll('.cat-card').forEach((node, i) => {
            node.animate([{ transform: 'scale(.2)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }],
              { duration: 380, delay: i * 70, easing: 'cubic-bezier(.2,1.4,.4,1)', fill: 'backwards' });
          });
        }
        const best = got.reduce((a, b) => (C.catPower(b) > C.catPower(a) ? b : a));
        if (best.rarity !== 'N') toast('✨ ' + C.rarityDef(best.rarity).name + 'の ' + best.name + ' がなかまになった！');
      }
      return;
    }

    if (t.closest('[data-fit]')) { fitCam(); closeSheet(); return; }

    if (t.closest('[data-reset]')) {
      askReset();
      return;
    }
  }

  function onSheetChange(e) {
    const sel = e.target.closest('[data-assign]');
    if (!sel) return;
    const ok = C.assignCat(state, sel.dataset.assign, sel.value || null);
    if (!ok) toast('その部署の持ち場はもういっぱいです');
    afterChange();
    renderSheet();
  }

  // ------------------------------------------------------------ お知らせ

  function toast(text) {
    const node = document.createElement('div');
    node.className = 'toast';
    node.textContent = text;
    els.toasts.appendChild(node);
    const anim = node.animate(
      [{ opacity: 0, transform: 'translateY(-8px)' }, { opacity: 1, transform: 'translateY(0)', offset: .12 },
       { opacity: 1, transform: 'translateY(0)', offset: .78 }, { opacity: 0, transform: 'translateY(-8px)' }],
      { duration: reduceMotion ? 1 : 2400 });
    anim.onfinish = () => node.remove();
    while (els.toasts.children.length > 2) els.toasts.firstChild.remove();
  }

  function showModal(html) {
    els.modal.innerHTML = html;
    openedAt = Date.now();
    els.modalWrap.hidden = false;
  }
  function closeModal() { els.modalWrap.hidden = true; }

  function askReset() {
    showModal('<h2>さいしょから やりなおす？</h2>' +
      '<p class="lines">いままでの工場とねこは、ぜんぶ消えます。</p>' +
      '<button type="button" class="big-btn warn" data-do-reset="1">やりなおす</button>' +
      '<button type="button" class="big-btn alt" data-close="1">やめる</button>');
  }

  // ------------------------------------------------------------ 保存

  let dirty = false;
  let lastSave = 0;

  function save(force) {
    if (!dirty && !force) return;
    state.lastSeen = Date.now();
    try {
      localStorage.setItem(C.SAVE_KEY, C.serialize(state));
      dirty = false;
      lastSave = Date.now();
    } catch (e) { /* いっぱいでも遊べなくならないよう、黙って続ける */ }
  }

  function load() {
    let text = null;
    try { text = localStorage.getItem(C.SAVE_KEY); } catch (e) { text = null; }
    return text ? C.deserialize(text) : C.newGame();
  }

  /** 何かを買った・もらったあと。ごほうびの精算と絵の作り直しをまとめてやる。 */
  function afterChange() {
    const levels = C.claimLevelRewards(state);
    const fresh = C.claimAchievements(state);
    dirty = true;
    buildScene();
    renderHud();
    renderBadges();
    if (levels > 0) toast('⬆️ 工場レベル ' + C.factoryLevel(state) + '！ 🐾 +' + levels);
    for (const a of fresh) toast('🏆 ' + a.name + '！ 🐾 +' + a.paw);
  }

  // ------------------------------------------------------------ うごかす

  let state = null;
  let rng = null;
  let lastFrame = 0;
  let lastSlow = 0;

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = lastFrame ? now - lastFrame : 0;
    lastFrame = now;
    if (dt <= 0) return;

    if (C.tick(state, dt) > 0) dirty = true;
    renderHud();
    updateBubbles(Date.now());

    bubbleTimer += dt;
    if (bubbleTimer > 6500) { bubbleTimer = 0; spawnBubble(); }

    if (now - lastSlow > 600) {
      lastSlow = now;
      renderBadges();
      const fresh = C.claimAchievements(state);
      for (const a of fresh) { toast('🏆 ' + a.name + '！ 🐾 +' + a.paw); dirty = true; }
      if (sheet && (sheet.kind === 'rooms' || sheet.kind === 'gacha')) renderSheet();
    }
    if (Date.now() - lastSave > 3000) save(false);
  }

  function welcomeBack() {
    const report = C.offlineReport(state, Date.now());
    if (report.elapsedMs < 60000 || C.totalRate(state) <= 0) return;
    C.claimOffline(state, report);
    dirty = true;
    showModal('<h2>おかえりなさい！</h2>' +
      '<div style="font-size:40px">🐱💤</div>' +
      '<p class="lines">' + C.formatDuration(report.cappedMs) + ' のあいだ、ねこたちが働いていました。<br>' +
      '💴 <b>' + C.formatNumber(report.money) + '</b> 円' +
      (report.paw > 0 ? '<br>🐾 <b>' + report.paw + '</b> こ' : '') + '</p>' +
      '<button type="button" class="big-btn" data-close="1">うけとる</button>');
  }

  function main() {
    state = load();
    rng = C.mulberry32((Math.random() * 4294967296) >>> 0);

    resize();
    buildScene();
    focusCam();
    renderHud();
    renderBadges();
    welcomeBack();

    window.addEventListener('resize', () => {
      const before = { w: view.w, h: view.h };
      resize();
      // 画面の大きさが変わったぶんだけカメラをずらす (見ている所を保つ)
      cam.x += (view.w - before.w) / 2;
      cam.y += (view.h - before.h) / 2;
      clampCam();
      applyCam();
    });

    els.scene.addEventListener('pointerdown', onDown);
    els.scene.addEventListener('pointermove', onMove);
    els.scene.addEventListener('pointerup', onUp);
    els.scene.addEventListener('pointercancel', onUp);
    els.scene.addEventListener('dblclick', () => fitCam());

    els.dock.addEventListener('click', (e) => {
      const btn = e.target.closest('.dock-btn');
      if (btn) openSheet(btn.dataset.panel);
    });
    $('btnSettings').addEventListener('click', () => openSheet('settings'));
    els.sheetClose.addEventListener('click', closeSheet);
    els.sheetBack.addEventListener('click', () => { if (!justOpened()) closeSheet(); });
    els.sheetBody.addEventListener('click', onSheetClick);
    els.sheetBody.addEventListener('change', onSheetChange);

    els.modalWrap.addEventListener('click', (e) => {
      if (e.target.closest('[data-do-reset]')) {
        try { localStorage.removeItem(C.SAVE_KEY); } catch (err) { /* 消せなくても続ける */ }
        state = C.newGame();
        closeModal();
        closeSheet();
        afterChange();
        fitCam();
        toast('あたらしい工場をたてました');
        return;
      }
      if (e.target.closest('[data-close]')) { closeModal(); return; }
      if (e.target.classList.contains('modal-back') && !justOpened()) closeModal();
    });

    document.addEventListener('visibilitychange', () => { if (document.hidden) save(true); });
    window.addEventListener('pagehide', () => save(true));

    requestAnimationFrame(frame);

    // 自動テストから中身をのぞくための入口
    window.__app = {
      state: () => state,
      core: C,
      cam: cam,
      view: view,
      openSheet: openSheet,
      closeSheet: closeSheet,
      buildScene: buildScene,
      fitCam: fitCam,
      lookAt: lookAt,
      spawnBubble: spawnBubble,
      bubbles: () => bubbles,
      save: save,
      toast: toast,
      grantMoney: (n) => { state.money += n; state.totalEarned += n; afterChange(); }
    };
  }

  main();
})();
