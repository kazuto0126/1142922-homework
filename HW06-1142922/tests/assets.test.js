import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AVAILABLE, IMAGES, MUSIC } from '../js/assets/manifest.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const onDisk = dir => (fs.existsSync(path.join(root, dir)) ? fs.readdirSync(path.join(root, dir)).map(f => `${dir}/${f}`) : []);

test('可用清單裡的檔案都真的存在', () => {
  for (const p of AVAILABLE) assert.ok(fs.existsSync(path.join(root, p)), p);
});

test('assets 裡的圖片和音樂都有列進可用清單（不然遊戲不會用到）', () => {
  for (const p of [...onDisk('assets/img'), ...onDisk('assets/music')]) assert.ok(AVAILABLE.has(p), p);
});

test('可用清單只包含 manifest 裡用到的路徑', () => {
  const known = new Set([...Object.values(IMAGES.leader), ...IMAGES.hero, ...MUSIC.cell]);
  for (const p of AVAILABLE) assert.ok(known.has(p), p);
});

test('素材來源清單：每張圖都有出處', () => {
  const credits = JSON.parse(fs.readFileSync(path.join(root, 'assets/credits.json'), 'utf8'));
  const files = new Set(credits.map(c => c.file));
  for (const p of onDisk('assets/img')) assert.ok(files.has(p), p);
  for (const c of credits) {
    assert.ok(c.title && c.source && c.author, JSON.stringify(c));
    assert.match(c.source, /^https:\/\//);
  }
});
