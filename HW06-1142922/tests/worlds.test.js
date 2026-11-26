import test from 'node:test';
import assert from 'node:assert/strict';
import { WORLDS, FACTIONS } from '../js/core/worlds.js';

test('九個世界剛好佔滿 0..8', () => {
  assert.equal(WORLDS.length, 9);
  assert.deepEqual(WORLDS.map(w => w.cell), [0, 1, 2, 3, 4, 5, 6, 7, 8]);
});

test('每個世界的欄位都有值', () => {
  for (const w of WORLDS) {
    for (const k of ['heroZh', 'heroJa', 'work', 'moveJa', 'reading', 'color']) {
      assert.equal(typeof w[k], 'string', `${w.cell}.${k}`);
      assert.ok(w[k].length > 0, `${w.cell}.${k}`);
    }
    assert.match(w.color, /^#[0-9a-f]{6}$/);
  }
});

test('中心是魯夫、第 6 格是納茲', () => {
  assert.equal(WORLDS[4].heroZh, '魯夫');
  assert.equal(WORLDS[6].heroZh, '納茲');
});

test('只有柯南有台詞', () => {
  assert.equal(WORLDS[3].line, '真実はいつもひとつ！');
  for (const w of WORLDS) if (w.cell !== 3) assert.equal(w.line, null);
});

test('兩個陣營', () => {
  assert.deepEqual(Object.keys(FACTIONS).sort(), ['gojo', 'sukuna']);
  assert.equal(FACTIONS.sukuna.nameJa, '両面宿儺');
  assert.equal(FACTIONS.sukuna.unisonJa, '「開」');
  assert.equal(FACTIONS.sukuna.victoryJa, '領域展開「伏魔御廚子」');
  assert.equal(FACTIONS.gojo.unisonJa, '虚式「茈」');
});
