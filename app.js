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

  const FACE_EYES = [
    // ふつう
    '<ellipse cx="-6.2" cy="-39.5" rx="2.7" ry="3.3" fill="#3b3140"/><ellipse cx="6.2" cy="-39.5" rx="2.7" ry="3.3" fill="#3b3140"/>' +
    '<circle cx="-5.3" cy="-40.7" r="1" fill="#fff"/><circle cx="7.1" cy="-40.7" r="1" fill="#fff"/>',
    // にっこり
    '<path d="M-8.6,-39.4 q2.4,-3 4.8,0 M3.8,-39.4 q2.4,-3 4.8,0" fill="none" stroke="#3b3140" stroke-width="2" stroke-linecap="round"/>',
    // ねむい
    '<path d="M-8.6,-39.6 q2.4,2.6 4.8,0 M3.8,-39.6 q2.4,2.6 4.8,0" fill="none" stroke="#3b3140" stroke-width="2" stroke-linecap="round"/>',
    // まんまる
    '<ellipse cx="-6.2" cy="-39.5" rx="3.1" ry="3.4" fill="#3b3140"/><ellipse cx="6.2" cy="-39.5" rx="3.1" ry="3.4" fill="#3b3140"/>' +
    '<circle cx="-5.1" cy="-40.9" r="1.2" fill="#fff"/><circle cx="7.3" cy="-40.9" r="1.2" fill="#fff"/>'
  ];

  /**
   * ねこ 1 ぴきの絵。足もとが (0,0)、頭のてっぺんが y=-56 あたり。
   * scarf に部署の色を渡すと、その部署の制服になる。
   */
  function catSVG(cat, scarf) {
    const k = C.kindDef(cat.kind);
    const r = C.rarityDef(cat.rarity);
    const fur = k.fur, dark = k.dark, belly = k.belly;
    let s = '';

    // しっぽ (体のうしろ)
    s += '<path d="M13,-12 q17,0 15,-19 q-1,-8 -8,-6" fill="none" stroke="' + INK + '" stroke-width="9.5" stroke-linecap="round"/>';
    s += '<path d="M13,-12 q17,0 15,-19 q-1,-8 -8,-6" fill="none" stroke="' + fur + '" stroke-width="6.2" stroke-linecap="round"/>';

    // からだ
    s += '<ellipse cx="0" cy="-13" rx="15" ry="13.5" fill="' + fur + '" stroke="' + INK + '" stroke-width="2.2"/>';
    s += '<ellipse cx="0" cy="-9.5" rx="9.5" ry="8.5" fill="' + belly + '" opacity=".85"/>';
    if (k.stripes) {
      s += '<path d="M-13,-19 q3.5,2 0,4 M13,-19 q-3.5,2 0,4" fill="none" stroke="' + dark + '" stroke-width="2.2" stroke-linecap="round"/>';
    }
    if (k.calico) s += '<ellipse cx="8" cy="-18" rx="6" ry="5" fill="#f0a860" opacity=".9"/>';
    // 前あし
    s += '<ellipse cx="-7" cy="-2.6" rx="5" ry="3.4" fill="' + belly + '" stroke="' + INK + '" stroke-width="1.8"/>';
    s += '<ellipse cx="7" cy="-2.6" rx="5" ry="3.4" fill="' + belly + '" stroke="' + INK + '" stroke-width="1.8"/>';

    // 制服 (部署の色)
    if (scarf) {
      s += '<path d="M-11,-24.5 q11,7 22,0 q-2.5,8 -11,8 q-8.5,0 -11,-8" fill="' + scarf + '" stroke="' + INK + '" stroke-width="1.8" stroke-linejoin="round"/>';
    }

    // みみ
    const earFill = k.points ? dark : fur;
    s += '<path d="M-15,-42 L-18.5,-56 L-4,-47 Z" fill="' + earFill + '" stroke="' + INK + '" stroke-width="2.2" stroke-linejoin="round"/>';
    s += '<path d="M15,-42 L18.5,-56 L4,-47 Z" fill="' + earFill + '" stroke="' + INK + '" stroke-width="2.2" stroke-linejoin="round"/>';
    s += '<path d="M-13.6,-44.4 L-15.6,-52 L-7.4,-47 Z" fill="#ffb3c4" opacity=".9"/>';
    s += '<path d="M13.6,-44.4 L15.6,-52 L7.4,-47 Z" fill="#ffb3c4" opacity=".9"/>';

    // あたま
    s += '<ellipse cx="0" cy="-38" rx="16.5" ry="15" fill="' + fur + '" stroke="' + INK + '" stroke-width="2.2"/>';
    if (k.points) s += '<ellipse cx="0" cy="-33.5" rx="11" ry="9" fill="' + dark + '" opacity=".45"/>';
    if (k.calico) s += '<ellipse cx="-9" cy="-45" rx="7" ry="5.4" fill="#f0a860" opacity=".92"/>';
    if (k.tuxedo) s += '<path d="M0,-52.5 q4.5,8 0,14 q-4.5,-6 0,-14" fill="#ffffff"/>';
    if (k.stripes) {
      s += '<path d="M-6,-49.5 l-.6,4.4 M0,-51 l0,4.6 M6,-49.5 l.6,4.4" fill="none" stroke="' + dark +
        '" stroke-width="2.2" stroke-linecap="round"/>';
    }
    s += '<ellipse cx="0" cy="-32.5" rx="8.8" ry="6.2" fill="' + belly + '" opacity=".8"/>';
    s += '<ellipse cx="-11.4" cy="-34.4" rx="3.5" ry="2.3" fill="#ffa8bd" opacity=".7"/>';
    s += '<ellipse cx="11.4" cy="-34.4" rx="3.5" ry="2.3" fill="#ffa8bd" opacity=".7"/>';
    s += FACE_EYES[cat.face & 3];
    s += '<path d="M-2.2,-34.4 L2.2,-34.4 L0,-31.9 Z" fill="#ff9aae" stroke="' + INK + '" stroke-width="1" stroke-linejoin="round"/>';
    s += '<path d="M0,-31.6 q-3,3.2 -5.6,.4 M0,-31.6 q3,3.2 5.6,.4" fill="none" stroke="' + INK + '" stroke-width="1.5" stroke-linecap="round"/>';
    s += '<path d="M-10,-33 l-7,-1.6 M-10,-30.6 l-7,1.4 M10,-33 l7,-1.6 M10,-30.6 l7,1.4" fill="none" stroke="' + INK +
      '" stroke-width="1.1" stroke-linecap="round" opacity=".55"/>';

    // レア度のしるし
    if (r.id === 'R') {
      s += '<g transform="translate(-11,-51) rotate(-18)"><path d="M0,0 l-6,-4 l0,7 z M0,0 l6,-4 l0,7 z" fill="#ff7fa8" stroke="' + INK +
        '" stroke-width="1.4" stroke-linejoin="round"/><circle cx="0" cy="1.4" r="2.4" fill="#ffd0e0" stroke="' + INK + '" stroke-width="1.2"/></g>';
    } else if (r.id === 'SR') {
      s += '<path d="M-9,-52 l1.5,-8 l5,4.6 l2.5,-6.4 l2.5,6.4 l5,-4.6 l1.5,8 z" fill="#ffd24a" stroke="' + INK +
        '" stroke-width="1.6" stroke-linejoin="round"/>';
    } else if (r.id === 'UR') {
      s += '<ellipse cx="0" cy="-60" rx="10" ry="3.4" fill="none" stroke="#ffdc55" stroke-width="3.4"/>';
      s += '<path d="M-22,-46 l1.4,3.4 l3.4,1.4 l-3.4,1.4 l-1.4,3.4 l-1.4,-3.4 l-3.4,-1.4 l3.4,-1.4 z" fill="#fff3a8"/>';
      s += '<path d="M22,-52 l1.1,2.7 l2.7,1.1 l-2.7,1.1 l-1.1,2.7 l-1.1,-2.7 l-2.7,-1.1 l2.7,-1.1 z" fill="#fff3a8"/>';
    }
    return s;
  }

  /** パネルに出す小さいねこ。 */
  function catPortrait(cat, size) {
    const h = size || 52;
    return '<svg viewBox="-30 -66 60 70" width="' + (h * 60 / 70).toFixed(0) + '" height="' + h + '" aria-hidden="true">' +
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

  /** 廊下や地面。部署の下じき。 */
  function groundMarkup() {
    const m = 0.6, GW = C.GRID.w, GH = C.GRID.h, drop = -20;
    let s = '';
    // 側面 (手前の 2 辺を下に伸ばす)
    s += poly([pt(GW + m, -m, 0), pt(GW + m, GH + m, 0), pt(GW + m, GH + m, drop), pt(GW + m, -m, drop)], '#d9bda6', INK, 2);
    s += poly([pt(-m, GH + m, 0), pt(GW + m, GH + m, 0), pt(GW + m, GH + m, drop), pt(-m, GH + m, drop)], '#c9a992', INK, 2);
    // 床
    s += poly([pt(-m, -m), pt(GW + m, -m), pt(GW + m, GH + m), pt(-m, GH + m)], '#f3ded0', INK, 2);
    // 廊下のタイル目地
    let lines = '';
    for (let x = 0; x <= GW; x++) lines += '<line x1="' + C.iso(x, -m).x.toFixed(1) + '" y1="' + C.iso(x, -m).y.toFixed(1) +
      '" x2="' + C.iso(x, GH + m).x.toFixed(1) + '" y2="' + C.iso(x, GH + m).y.toFixed(1) + '"/>';
    for (let y = 0; y <= GH; y++) lines += '<line x1="' + C.iso(-m, y).x.toFixed(1) + '" y1="' + C.iso(-m, y).y.toFixed(1) +
      '" x2="' + C.iso(GW + m, y).x.toFixed(1) + '" y2="' + C.iso(GW + m, y).y.toFixed(1) + '"/>';
    s += '<g stroke="#e4c9b6" stroke-width="1" fill="none">' + lines + '</g>';

    // 外の木 (工場のまわり)
    const trees = [[-2.6, 1.5], [-2.2, 6.5], [GW + 2.4, 2.2], [GW + 2.1, 7.6], [3, GH + 2.6], [6.5, -2.6]];
    for (const t of trees) s += treeMarkup(t[0], t[1]);
    return s;
  }

  function treeMarkup(x, y) {
    const base = C.iso(x, y, 0);
    return '<g transform="translate(' + base.x.toFixed(1) + ' ' + base.y.toFixed(1) + ')">' +
      '<ellipse cx="0" cy="0" rx="20" ry="9" fill="rgba(90,110,60,.22)"/>' +
      '<rect x="-4" y="-30" width="8" height="30" rx="3" fill="#b07f57" stroke="' + INK + '" stroke-width="2"/>' +
      '<circle cx="0" cy="-44" r="24" fill="#8fc46a" stroke="' + INK + '" stroke-width="2.4"/>' +
      '<circle cx="-14" cy="-34" r="15" fill="#9ed07a" stroke="' + INK + '" stroke-width="2.4"/>' +
      '<circle cx="14" cy="-34" r="15" fill="#7fb85e" stroke="' + INK + '" stroke-width="2.4"/>' +
      '</g>';
  }

  /** 部署のなかの機械や家具。部署ごとに見た目を変える。 */
  function propMarkup(def) {
    const cx = def.x + def.w / 2;
    const backY = def.y + 0.45;
    let s = '';
    switch (def.prop) {
      case 'pot': {
        s += isoBox(def.x + 0.9, backY, 1.7, 0.7, 18, '#f6e2cd', '#e3cbb3', '#d5bba2');
        const p = C.iso(def.x + 0.9, backY, 18);
        s += '<g transform="translate(' + p.x.toFixed(1) + ' ' + p.y.toFixed(1) + ')">' +
          '<ellipse cx="0" cy="-10" rx="13" ry="10" fill="#c9d4de" stroke="' + INK + '" stroke-width="2"/>' +
          '<ellipse cx="0" cy="-14" rx="13" ry="7" fill="#eef3f7" stroke="' + INK + '" stroke-width="2"/>' +
          '<path d="M-5,-22 q3,-6 0,-10 M5,-22 q3,-6 0,-10" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".7"/>' +
          '</g>';
        break;
      }
      case 'belt': {
        s += isoBox(cx, backY, def.w - 1.2, 0.55, 12, '#b9c3cf', '#9aa6b4', '#8d99a8');
        for (let i = 0; i < 4; i++) {
          const bx = def.x + 0.9 + i * ((def.w - 1.8) / 3);
          s += isoBox(bx, backY, 0.34, 0.3, 20, '#ffd98a', '#eab963', '#dcaa56');
        }
        break;
      }
      case 'scope': {
        s += isoBox(def.x + 0.9, backY, 1.5, 0.6, 16, '#e6f2e8', '#cfe0d3', '#c2d5c7');
        const p = C.iso(def.x + 0.9, backY, 16);
        s += '<g transform="translate(' + p.x.toFixed(1) + ' ' + p.y.toFixed(1) + ')">' +
          '<circle cx="0" cy="-16" r="10" fill="#dff1ff" stroke="' + INK + '" stroke-width="2.4" opacity=".95"/>' +
          '<path d="M7,-9 l7,7" stroke="' + INK + '" stroke-width="4" stroke-linecap="round"/></g>';
        break;
      }
      case 'monitor': {
        for (let i = 0; i < 3; i++) {
          const bx = def.x + 0.9 + i * ((def.w - 1.8) / 2);
          s += isoBox(bx, backY, 0.9, 0.45, 14, '#cfc9f2', '#b6afe4', '#a9a2db');
          const p = C.iso(bx, backY, 14);
          s += '<g transform="translate(' + p.x.toFixed(1) + ' ' + p.y.toFixed(1) + ')">' +
            '<rect x="-13" y="-24" width="26" height="19" rx="3" fill="#3f4f76" stroke="' + INK + '" stroke-width="2"/>' +
            '<rect x="-10" y="-21" width="20" height="13" rx="2" fill="#8fd4ff"/></g>';
        }
        break;
      }
      case 'crate': {
        s += isoBox(def.x + 0.85, backY, 0.9, 0.85, 22, '#ffd9a8', '#e9bd88', '#dbaf7c');
        s += isoBox(def.x + 0.85, backY, 0.75, 0.7, 40, '#ffe6c0', '#eec89b', '#e0ba8e');
        s += isoBox(def.x + 1.9, backY, 0.9, 0.85, 22, '#ffcfd8', '#eeb2be', '#e0a5b1');
        break;
      }
      case 'sofa': {
        s += isoBox(cx, backY, def.w - 1.4, 0.7, 12, '#ffb3c4', '#eb95a9', '#dd889c');
        s += isoBox(cx, backY - 0.28, def.w - 1.4, 0.18, 32, '#ffc9d6', '#eba9b8', '#dd9cab');
        break;
      }
    }
    return s;
  }

  /** 机 1 つ + 席にすわるねこ。 */
  function slotMarkup(def, slot, cat) {
    const sx = def.x + slot.x;
    const sy = def.y + slot.y;
    let s = '';
    // いす
    s += isoBox(sx, sy - 0.34, 0.5, 0.42, 8, '#a9b2bf', '#8f98a6', '#848d9b');
    const chair = C.iso(sx, sy - 0.34, 8);
    s += '<rect x="' + (chair.x - 12).toFixed(1) + '" y="' + (chair.y - 26).toFixed(1) +
      '" width="24" height="24" rx="7" fill="#9aa3b1" stroke="' + INK + '" stroke-width="2"/>';

    // ねこ (いすの前)
    if (cat) {
      const p = C.iso(sx, sy, 0);
      const scale = 0.62;
      s += '<g class="tap-target" data-cat="' + esc(cat.id) + '" transform="translate(' + p.x.toFixed(1) + ' ' +
        p.y.toFixed(1) + ') scale(' + scale + ')">' +
        '<ellipse cx="0" cy="0" rx="19" ry="8" fill="rgba(120,80,90,.18)"/>' +
        '<g class="bob" data-bob="' + (Math.random().toFixed(3)) + '">' + catSVG(cat, def.accent) + '</g></g>';
    }

    // 机 (ねこの手前)
    s += isoBox(sx, sy + 0.52, 1.15, 0.62, 15, '#fff6e8', '#ecdcc8', '#dfcdb8');
    const top = C.iso(sx, sy + 0.52, 15);
    const gadget = {
      pot: '<ellipse cx="0" cy="-7" rx="8" ry="5" fill="#ffd9a8" stroke="' + INK + '" stroke-width="1.8"/>',
      belt: '<rect x="-7" y="-12" width="14" height="10" rx="3" fill="#ffd98a" stroke="' + INK + '" stroke-width="1.8"/>',
      scope: '<circle cx="0" cy="-9" r="7" fill="#dff1ff" stroke="' + INK + '" stroke-width="1.8"/>',
      monitor: '<rect x="-9" y="-17" width="18" height="13" rx="2.5" fill="#3f4f76" stroke="' + INK +
        '" stroke-width="1.8"/><rect x="-6.5" y="-14.6" width="13" height="8" rx="1.5" fill="#8fd4ff"/>',
      crate: '<rect x="-8" y="-13" width="16" height="11" rx="2" fill="#ffd9a8" stroke="' + INK + '" stroke-width="1.8"/>',
      sofa: '<ellipse cx="0" cy="-7" rx="7" ry="5" fill="#fff1c9" stroke="' + INK + '" stroke-width="1.8"/>'
    }[def.prop] || '';
    s += '<g transform="translate(' + top.x.toFixed(1) + ' ' + top.y.toFixed(1) + ')">' + gadget + '</g>';
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
      const mid = C.iso(x0 + def.w / 2, y0 + def.h / 2, 0);
      s += '<g transform="translate(' + mid.x.toFixed(1) + ' ' + mid.y.toFixed(1) + ')">' +
        '<text x="0" y="-16" text-anchor="middle" font-size="26">' + (unlocked ? '🔨' : '🔒') + '</text>' +
        '<rect x="-52" y="-6" width="104" height="24" rx="12" fill="#fffaf3" stroke="' + INK + '" stroke-width="2"/>' +
        '<text x="0" y="11" text-anchor="middle" font-size="12" fill="' + INK + '">' +
        (unlocked ? esc(def.name) : '工場Lv.' + def.unlock + ' で解放') + '</text></g>';
      return s + '</g>';
    }

    // 床 (市松)
    const light = def.floor, dim = shade(def.floor, -14);
    let tiles = '';
    for (let x = x0; x < x1; x++) {
      for (let y = y0; y < y1; y++) {
        tiles += poly([pt(x, y), pt(x + 1, y), pt(x + 1, y + 1), pt(x, y + 1)], ((x + y) % 2 ? dim : light), null);
      }
    }
    s += tiles;
    s += '<polygon points="' + [pt(x0, y0), pt(x1, y0), pt(x1, y1), pt(x0, y1)].join(' ') +
      '" fill="none" stroke="' + INK + '" stroke-width="2"/>';

    // 奥のかべ 2 枚 (右がわは明るく、左がわは少し暗く)
    const wallR = def.wall, wallL = shade(def.wall, -16);
    s += poly([pt(x0, y0, 0), pt(x1, y0, 0), pt(x1, y0, W), pt(x0, y0, W)], wallR, INK, 2);
    s += poly([pt(x0, y0, 0), pt(x0, y1, 0), pt(x0, y1, W), pt(x0, y0, W)], wallL, INK, 2);
    // かべの厚み
    s += poly([pt(x0, y0, W), pt(x1, y0, W), pt(x1, y0 - 0.2, W), pt(x0, y0 - 0.2, W)], shade(def.wall, 12), INK, 1.6);
    s += poly([pt(x0, y0, W), pt(x0, y1, W), pt(x0 - 0.2, y1, W), pt(x0 - 0.2, y0, W)], shade(def.wall, 12), INK, 1.6);

    // かべのかざり (窓とポスター)
    const win = C.iso(x0 + def.w * 0.72, y0, W * 0.62);
    s += '<g transform="translate(' + win.x.toFixed(1) + ' ' + win.y.toFixed(1) + ')">' +
      '<rect x="-16" y="-13" width="32" height="26" rx="4" fill="#cfe9ff" stroke="' + INK + '" stroke-width="2"/>' +
      '<path d="M-16,0 h32 M0,-13 v26" stroke="' + INK + '" stroke-width="1.6"/></g>';
    const poster = C.iso(x0, y0 + def.h * 0.62, W * 0.6);
    s += '<g transform="translate(' + poster.x.toFixed(1) + ' ' + poster.y.toFixed(1) + ')">' +
      '<rect x="-11" y="-14" width="22" height="28" rx="3" fill="' + shade(def.accent, 70) + '" stroke="' + INK + '" stroke-width="2"/>' +
      '<text x="0" y="6" text-anchor="middle" font-size="15">' + def.icon + '</text></g>';

    // 部屋番号のプレート
    const plate = C.iso(x0 + def.w * 0.26, y0, W * 0.34);
    s += '<g transform="translate(' + plate.x.toFixed(1) + ' ' + plate.y.toFixed(1) + ')">' +
      '<rect x="-20" y="-10" width="40" height="20" rx="5" fill="#fffaf3" stroke="' + INK + '" stroke-width="2"/>' +
      '<text x="0" y="6" text-anchor="middle" font-size="13" fill="' + INK + '">' + ROOM_NO[def.id] + '</text></g>';

    s += propMarkup(def);

    // 机とねこ。奥から手前へ並べないと重なりが逆になる
    const slots = C.slotPositions(def).slice().sort((a, b) => (a.x + a.y) - (b.x + b.y));
    const cats = C.catsIn(state, def.id);
    slots.forEach((slot, i) => { s += slotMarkup(def, slot, cats[i] || null); });

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

  /** ねこのゆらゆら。CSS ではなく Web Animations API を使う (途中の状態を飛ばさないため)。 */
  function startBobbing() {
    if (reduceMotion) return;
    const list = els.rooms.querySelectorAll('.bob');
    for (const g of list) {
      const phase = Number(g.dataset.bob || 0);
      g.animate(
        [{ transform: 'translateY(0px)' }, { transform: 'translateY(-3.5px)' }, { transform: 'translateY(0px)' }],
        { duration: 1700 + phase * 900, iterations: Infinity, delay: -phase * 1700, easing: 'ease-in-out' }
      );
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
    cam.s = clamp((a.h / b.h) * 0.8, fit, 1.6);
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

  /**
   * 指でタップすると、ブラウザはそのあとに click も送る。
   * 開いたばかりの板の裏 (#sheetBack) にその click が当たって、
   * 開いた瞬間に閉じてしまう。開いてすぐの裏押しは受け付けない。
   */
  function justOpened() { return Date.now() - openedAt < 400; }

  function openSheet(kind, arg) {
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
            : '<div class="cat-card idle" style="cursor:default"><div style="font-size:30px;line-height:46px">🪑</div>' +
              '<div class="nm">あき</div><div class="rm">—</div></div>');
        }
        return '<p class="note">' + esc(def.about) + '</p>' + roomCard(def) +
          '<div class="card-sub" style="padding-left:4px">はたらいているねこ（ねこをタップすると育てられる）</div>' +
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
            (full ? ' disabled' : '') + '>' + def.icon + ' ' + def.name + (full ? '（満席）' : '') + '</option>';
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
        return '<div id="gachaResult"></div>' +
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
        afterChange();
        renderSheet();
        const box = document.getElementById('gachaResult');
        if (box) {
          box.innerHTML = '<div class="result-row">' + got.map((cat) =>
            '<button type="button" class="cat-card" style="width:84px" data-cat-open="' + esc(cat.id) + '">' +
            rarityChip(cat) + catPortrait(cat, 46) + '<div class="nm">' + esc(cat.name) + '</div>' +
            '<div class="rm">' + C.rarityDef(cat.rarity).name + '</div></button>').join('') + '</div>';
          if (!reduceMotion) {
            box.querySelectorAll('.cat-card').forEach((node, i) => {
              node.animate([{ transform: 'scale(.2)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }],
                { duration: 380, delay: i * 70, easing: 'cubic-bezier(.2,1.4,.4,1)', fill: 'backwards' });
            });
          }
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
    if (!ok) toast('その部署はもう満席です');
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
      spawnBubble: spawnBubble,
      bubbles: () => bubbles,
      save: save,
      toast: toast,
      grantMoney: (n) => { state.money += n; state.totalEarned += n; afterChange(); }
    };
  }

  main();
})();
