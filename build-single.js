/*
 * 全部を 1 枚の HTML にまとめる (テストプレイしてもらう用):
 *
 *   node build-single.js                → single.html      (そのまま開ける 1 枚)
 *   node build-single.js --fragment     → single-part.html (Artifact に貼る用)
 *
 * Artifact は <html>/<head>/<body> を自分で付けるので、
 * そちら向けには中身だけを書き出す。
 */
const fs = require('node:fs');
const path = require('node:path');

const R = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
const fragment = process.argv.includes('--fragment');

const css = R('styles.css');
const core = R('core.js');
const app = R('app.js');
const iconSvg = R('icon.svg');
const iconPng = fs.readFileSync(path.join(__dirname, 'icon-180.png')).toString('base64');

let html = R('index.html');

// 外から読んでいるものを、その場に埋める
html = html
  .replace('<link rel="stylesheet" href="./styles.css">', '<style>\n' + css + '\n</style>')
  .replace('<script src="./core.js"></script>', '<script>\n' + core + '\n</script>')
  .replace('<script src="./app.js"></script>', '<script>\n' + app + '\n</script>')
  .replace('href="./icon.svg"', 'href="data:image/svg+xml;base64,' + Buffer.from(iconSvg).toString('base64') + '"')
  .replace('href="./icon-180.png"', 'href="data:image/png;base64,' + iconPng + '"');

let out = html;
if (fragment) {
  // <head> の中身と <body> の中身をつなげて、まるごと本文にする
  const head = html.match(/<head>([\s\S]*?)<\/head>/)[1];
  const body = html.match(/<body>([\s\S]*?)<\/body>/)[1];
  out = head.trim() + '\n' + body.trim() + '\n';
}

const file = fragment ? 'single-part.html' : 'single.html';
fs.writeFileSync(path.join(__dirname, file), out);
console.log('できた:', file, '(' + Math.round(out.length / 1024) + ' KB)');
