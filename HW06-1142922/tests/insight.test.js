import test from 'node:test';
import assert from 'node:assert/strict';
import { cpuInsight, threats } from '../js/core/insight.js';
import { EMPTY as _, X, O } from '../js/core/rules.js';
import { chooseMove } from '../js/core/ai.js';

test('cpuInsight：空盤後玩家下角落，電腦只有中間不會輸', () => {
  const board = [X, _, _, _, _, _, _, _, _];
  const r = cpuInsight(board);
  assert.equal(r.length, 8);
  const byCell = Object.fromEntries(r.map(x => [x.cell, x.outcome]));
  assert.equal(byCell[4], 'draw');
  for (const c of [1, 2, 3, 5, 6, 7, 8]) assert.equal(byCell[c], 'lose', `cell ${c}`);
});

test('cpuInsight：電腦有連線機會時那格是 win', () => {
  // O X X
  // _ O _
  // X _ _   → 輪到 O，下在 8 就連成 0-4-8
  const board = [O, X, X, _, O, _, X, _, _];
  const byCell = Object.fromEntries(cpuInsight(board).map(x => [x.cell, x.outcome]));
  assert.equal(byCell[8], 'win'); // 0-4-8 連線
});

test('cpuInsight：電腦選的那一步一定不是 lose', () => {
  const boards = [
    [X, _, _, _, _, _, _, _, _],
    [_, _, _, _, X, _, _, _, _],
    [X, _, _, _, O, _, _, _, X],
    [_, X, _, _, O, _, _, X, _],
  ];
  for (const b of boards) {
    const pick = chooseMove(b, null);
    const o = cpuInsight(b).find(x => x.cell === pick).outcome;
    assert.notEqual(o, 'lose', JSON.stringify(b));
  }
});

test('threats：找出只差一格就連線的格子', () => {
  // X X _
  // _ O _
  // _ _ O   → X 只差格 2（0-1-2）；O 的 0-4-8 被 X 佔了，沒有威脅
  const board = [X, X, _, _, O, _, _, _, O];
  assert.deepEqual(threats(board), [{ cell: 2, mark: X }]);
});

test('threats：沒有威脅時回傳空陣列；同一格同一方只列一次', () => {
  assert.deepEqual(threats([_, _, _, _, _, _, _, _, _]), []);
  // X 在 0、2、6：格 1（0-1-2）、格 3（0-3-6）、格 4（2-4-6）都是 X 的威脅
  const t = threats([X, _, X, _, _, _, X, _, _]);
  assert.deepEqual(t.map(x => x.cell).sort(), [1, 3, 4]);
  assert.ok(t.every(x => x.mark === X));
});
