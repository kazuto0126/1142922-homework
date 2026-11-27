// 在 index.html 的 PRELOAD 區塊寫入所有用得到的 JS 模組（<link rel="modulepreload">）。
// 瀏覽器一開始就同時下載全部模組，不用「載完 main.js 才知道要載 stage.js、載完 stage.js 才知道要載 three」一層一層等。
// 用法：node tools/gen-preload.mjs（改了 import 之後重跑一次）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IMPORT_MAP = { three: 'vendor/three/three.module.min.js', 'three/addons/': 'vendor/three/addons/' };

const seen = new Set();
function resolve(spec, fromFile) {
  if (spec === 'three') return IMPORT_MAP.three;
  if (spec.startsWith('three/addons/')) return IMPORT_MAP['three/addons/'] + spec.slice('three/addons/'.length);
  if (spec.startsWith('.')) return path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), spec));
  return null;
}
function walk(file) {
  if (seen.has(file)) return;
  seen.add(file);
  if (file.endsWith('.min.js')) return; // three 本身不用再掃
  const src = fs.readFileSync(path.join(root, file), 'utf8');
  // 靜態 import 和動態 import('...') 都算
  const re = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s*['"]([^'"]+)['"]/g;
  let m;
  while ((m = re.exec(src))) {
    const dep = resolve(m[1] || m[2] || m[3], file);
    if (dep) walk(dep);
  }
}
walk('js/main.js');
seen.delete('js/main.js'); // main.js 本身由 <script> 載入

const links = [...seen].sort((a, b) => (a.includes('three.module') ? -1 : b.includes('three.module') ? 1 : a.localeCompare(b)))
  .map(f => `  <link rel="modulepreload" href="${f}">`).join('\n');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const out = html.replace(/(<!-- PRELOAD:START[^\n]*-->\n)[\s\S]*?<!-- PRELOAD:END -->/, `$1${links}\n  <!-- PRELOAD:END -->`);
fs.writeFileSync(path.join(root, 'index.html'), out);
console.log(`modulepreload：${seen.size} 個模組`);
