// 檢查要部署的網站檔案總大小（上限 25 MB）。用法：node tools/size-check.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIMIT = 26214400;
// 部署時只放這些（開發用的頁面、文件、測試、工具都不放）
export const DEPLOY = ['index.html', 'css', 'js', 'vendor', 'fonts', 'assets'];

function walk(p) {
  const st = fs.statSync(p);
  if (!st.isDirectory()) return [[p, st.size]];
  return fs.readdirSync(p).flatMap(f => walk(path.join(p, f)));
}

const files = DEPLOY.flatMap(d => walk(path.join(root, d)));
const total = files.reduce((s, [, n]) => s + n, 0);
const byDir = {};
for (const [f, n] of files) {
  const top = path.relative(root, f).split(path.sep)[0];
  byDir[top] = (byDir[top] || 0) + n;
}
for (const [d, n] of Object.entries(byDir)) console.log(`${d.padEnd(12)} ${(n / 1048576).toFixed(2)} MB`);
console.log(`合計 ${(total / 1048576).toFixed(2)} MB（${files.length} 個檔案），上限 25 MB`);
process.exit(total > LIMIT ? 1 : 0);
